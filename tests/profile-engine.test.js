'use strict';
const assert = require('node:assert/strict');
const engine = require('../app/bridge/lib/profile-engine');
const model = require('../app/bridge/lib/profile-model');
const power = require('../app/bridge/lib/profile-power');
const clone = model.clone;
const doc = {schema:1,name:'Test G6',devices:{switch_2:'Switch 2',apple:'Apple TV',shield:'Shield'},banks:[
  {id:'game',name:'Switch game',devices:['switch_2'],target:{category:'other',dimension:{gameInput:'hdmi3',dynamicRange:'hdrALLM',gameGenre:'Standard'}},settings:{gameSharpness:0,gameColorDepth:50}},
  {id:'movie',name:'Shared movie SDR',devices:['apple','shield'],target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}},settings:{backlight:3,color:50},brightness_role:'movie_sdr'},
  {id:'mapping',name:'SDR movie mapping',target:{category:'picture',dimension:{input:'hdmi3',dynamicRange:'sdr'}},settings:{pictureMode:'filmMaker'},devices:['apple','shield']},
  {id:'port',name:'HDMI 3 game capability',target:{category:'other',dimension:{gameInput:'hdmi3'}},settings:{enableALLM:'on'},devices:['switch_2']},
  {id:'game_mapping',name:'HDR ALLM Game',target:{category:'picture',dimension:{input:'hdmi3',dynamicRange:'hdrALLM'}},settings:{pictureMode:'hdrGame'},devices:['switch_2']}
]};
function fixture(collection = doc, extra = {}) {
  const files = {}, writes = [], operations = [], inspections = [], values = Object.fromEntries(collection.banks.map(b => [b.id,clone(b.settings)]));
  let milliseconds = Date.now(), hooks = null, inspectHook = null, descriptionHook = null, bootId = 'boot1';
  const timers = new Set();
  const store = {read:n => files[n] ? clone(files[n]) : null,write:(n,v) => { files[n] = clone(v); writes.push(n); }};
  function create() {
    return engine.create({...extra,store,bootId,availabilityReviewed:true,now:() => ++milliseconds,setTimeout:fn => {timers.add(fn);return fn;},clearTimeout:fn => timers.delete(fn),
      inspect:async bank => {
        inspections.push(bank.id);if (inspectHook) await inspectHook(bank);
        const descriptions=Object.keys(bank.settings).map(key => ({key,dbtype:bank.target.app_id?'M':'G',dimension:Object.keys(bank.target.dimension),ui:{active:true,visible:true},
          ...(typeof bank.settings[key]==='number'?
          {dataType:'int',vtype:'Range',values:{range:{min:0,max:100,interval:1}}}:
          {dataType:'string',vtype:'ArrayExt',values:{arrayExt:['off','on','filmMaker','game','hdrGame','hdrFilmMaker','dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame'].map(value=>({value,visible:true,active:true}))}})}));
        if (descriptionHook) descriptionHook(bank,descriptions);
        return {settings:clone(values[bank.id]),descriptions,factory_descriptions:Object.fromEntries(descriptions.map(d=>[d.key,d]))};
      },
      runBanks:async (command,guard) => {
        guard(); operations.push(clone(command));
        const results = [];
        for (const bank of command.banks) {
          if (hooks) await hooks(command,bank);
          guard();
          if (command.action === 'apply') {
            for (const k of Object.keys(bank.settings)) assert.ok(model.same(values[bank.id][k],bank.expected[k]),'Compare-and-set before native apply');
            Object.assign(values[bank.id],bank.settings);
          }
          results.push({id:bank.id,settings:clone(values[bank.id]),changed:command.action === 'apply' ? Object.keys(bank.settings) : []});
        }
        return {banks:results};
      }});
  }
  function observe(e,id,key,value) {
    values[id][key] = value;
    e.observe([{target:collection.banks.find(b => b.id === id).target,key,value,observed_at:new Date(++milliseconds).toISOString()}]);
  }
  return {files,writes,operations,inspections,values,create,observe,timers,setBoot:v => {bootId=v;},hook:fn => {hooks=fn;},inspectHook:fn => {inspectHook=fn;},descriptionHook:fn => {descriptionHook=fn;}};
}
module.exports = async function () {
  const f = fixture(); let e = f.create();
  e.setPower('on'); await e.idle();
  await e.command({action:'initialize',document:doc,enabled:true,migration_id:'HA-entry',room:'dark'});
  assert.equal(e.status().configured,true);
  assert.deepEqual(f.files.profiles.document,doc,'Migration preserves every saved standard');
  await e.command({action:'initialize',document:doc,migration_id:'HA-entry'});
  await assert.rejects(e.command({action:'initialize',document:doc,migration_id:'different'}),/already owns/);
  const count = f.writes.length;
  f.observe(e,'game','gameSharpness',7);
  const once = f.writes.length;
  assert.equal(once,count+1,'First dirty key is durable');
  f.observe(e,'game','gameSharpness',8); f.observe(e,'game','gameSharpness',9);
  assert.equal(f.writes.length,once,'Repeated remote steps do not write TV flash');
  assert.equal(e.status().temporary_count,1);
  const backup = await e.command({action:'backup'}), decoded = model.decodeBackup(backup);
  assert.equal(decoded.overrides.game.gameSharpness,9);
  assert.deepEqual(decoded.document,doc);
  assert.throws(() => model.decodeBackup({...backup,state_json:backup.state_json + ' '}),/checksum/);
  e.acknowledge({...decoded,sha256:backup.sha256,sequence:decoded.sequence-1});
  assert.equal(e.status().backup_acknowledged,null);
  e.acknowledge({...decoded,sha256:backup.sha256});
  assert.equal(e.status().backup_acknowledged,decoded.sequence);
  e.stop(); e = f.create(); e.setPower('on'); await e.idle();
  assert.equal(e.snapshot().overrides.game.gameSharpness,9,'Same-boot service restart reconstructs temporary values');
  assert.equal(f.values.game.gameSharpness,9,'A service restart must not restore');
  e.setPower('off'); await e.idle();
  assert.equal(e.status().pending_restore,true);
  e.setPower('on'); await e.idle();
  assert.equal(f.values.game.gameSharpness,0);
  assert.equal(e.status().temporary_count,0);
  assert.equal(e.status().pending_restore,false);
  f.observe(e,'game','gameColorDepth',60); e.stop(); f.setBoot('boot2');
  e = f.create(); e.setPower('on'); await e.idle();
  assert.equal(f.values.game.gameColorDepth,50,'A new kernel boot restores even without an off callback');
  const operationsBefore = f.operations.length;
  e.contextChanged({ready:true,input:'hdmi3',range:'hdrALLM',mode:'hdrGame'});
  e.contextChanged({ready:true,input:'hdmi3',range:'sdr',mode:'filmMaker'});
  await e.idle();
  assert.equal(f.operations.length,operationsBefore,'Input/range changes do not reapply profiles');
  assert.deepEqual(e.status().active_devices,['Apple TV','Shield'],'HDMI port capability banks do not identify the active device');
  await e.command({action:'set_environment',room:'bright'});
  assert.equal(f.values.movie.backlight,100);
  f.observe(e,'movie','backlight',70);
  await e.command({action:'set_environment',room:'dark'});
  assert.equal(f.values.movie.backlight,70,'Day/night preserves temporary brightness');
  await e.command({action:'save',scope:'movie',revision:e.status().revision});
  assert.equal(e.snapshot().preferences.movie_dark,70,'Explicit save promotes the current room brightness');
  assert.equal(e.status().temporary_count,0);
  await assert.rejects(e.command({action:'edit',bank_id:'game',settings:{gameSharpness:2},revision:0}),/refresh/);
  await e.command({action:'edit',bank_id:'game',settings:{gameSharpness:3},revision:e.status().revision});
  assert.equal(f.values.game.gameSharpness,3,'Inactive native bank edits work without changing input');
  assert.equal(f.files.profiles.document.banks[0].settings.gameSharpness,3);
  await assert.rejects(e.command({action:'edit',bank_id:'game',settings:{gameSharpness:101},revision:e.status().revision}),/range/);
  assert.equal(e.snapshot().document.banks[0].settings.gameSharpness,3);
  f.observe(e,'game','gameSharpness',8);
  e.setPower('off'); await e.idle();
  f.hook(async command => { if (command.action === 'apply') throw new Error('TV write failed'); });
  e.setPower('on'); await e.idle();
  assert.equal(e.status().pending_restore,true,'Failed restoration keeps its durable intent');
  f.hook(null); await e.command({action:'reconcile'});
  assert.equal(f.values.game.gameSharpness,3);
  assert.equal(e.status().pending_restore,false);
  f.observe(e,'mapping','pictureMode','unknownPreset');
  assert.equal(e.snapshot().overrides.mapping.pictureMode,'unknownPreset','Remote modes outside curated presets still restore');
  const beforeInvalidSave = model.clone(e.snapshot().document);
  await assert.rejects(e.command({action:'save',scope:'all',revision:e.status().revision}),/signal range/);
  assert.deepEqual(e.snapshot().document,beforeInvalidSave,'An invalid save cannot partially mutate standards');
  e.setPower('off'); await e.idle(); e.setPower('on'); await e.idle();
  assert.equal(f.values.mapping.pictureMode,'filmMaker');
  f.observe(e,'game','gameSharpness',6);
  e.setPower('off'); await e.idle();
  let raced = false;
  f.hook(async command => {
    if (command.action === 'apply' && !raced) { raced = true; f.observe(e,'game','gameSharpness',9); }
  });
  e.setPower('on'); await e.idle(); f.hook(null);
  assert.equal(f.values.game.gameSharpness,9,'A newer remote edit wins a restore race');
  await e.command({action:'reconcile'});
  assert.equal(f.values.game.gameSharpness,9,'A retry cannot overwrite the newer temporary edit');
  e.setPower('off'); await e.idle();e.setPower('on');await e.idle();
  assert.equal(f.values.game.gameSharpness,3,'That edit still restores in the next viewing session');
  e.stop();
  for (const state of ['Screen Off','Screen Saver','Active']) assert.equal(power.classify({state}),'on');
  for (const state of ['Suspend','Active Standby']) assert.equal(power.classify({state}),'off');
  assert.equal(power.classify({state:'Request Power Off'}),null);
  assert.equal(power.classify({returnValue:false}),null);
};
module.exports.fixture = fixture;
module.exports.doc = doc;
