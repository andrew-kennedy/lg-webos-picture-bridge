'use strict';
// Game Optimizer's AI Sound Pro (LG's aigamesound): one value per HDMI port,
// stored on the port's Game Optimizer audio input (hdmiN_game).
const assert = require('node:assert/strict');
const banks = require('../app/bridge/lib/profile-banks');
const rules = require('../app/bridge/lib/profile-rules');
const availability = require('../app/bridge/lib/profile-availability');
const descriptions = require('../app/bridge/lib/profile-descriptions');
const native = require('../app/bridge/lib/profile-native-catalog');
const model = require('../app/bridge/lib/profile-model');
const view = require('../app/profile-view');

module.exports = async () => {
  const target = {category:'sound',dimension:{audioInput:'hdmi3_game'}};
  // Only the Game Optimizer audio input, and only AI Sound Pro.
  assert.deepEqual(banks.target(target).allowed,['aigamesound']);
  for (const bad of [{category:'sound',dimension:{audioInput:'hdmi3'}},{category:'sound',dimension:{audioInput:'hdmi1_pc_game'}},
    {category:'sound',dimension:{audioInput:'hdmi3_game',soundOutput:'external_arc'}},{category:'sound',dimension:{audioInput:'hdmi3_game'},app_id:'com.webos.app.hdmi3'}])
    assert.throws(()=>banks.target(bad),/Unsupported saved-bank dimensions/,JSON.stringify(bad));
  assert.throws(()=>banks.normalize({action:'read',banks:[{id:'s',target,keys:['soundMode']}]}),/Unreviewed setting/);

  // Read and write go to the explicit audio input, not the one on screen.
  let value = 'on'; const writes = [];
  const service = {call(uri,params,callback) {
    let response;
    if (uri.endsWith('getSystemSettingDesc')) response = {returnValue:true,results:[{key:'aigamesound',category:'sound',dimension:['audioInput'],dbtype:'G',
      dataType:'string',vtype:'ArrayExt',ui:{visible:true,active:true},values:{arrayExt:['on','off'].map(v=>({value:v,visible:true,active:true}))}}]};
    else if (uri.endsWith('getSystemSettings')) response = {returnValue:true,dimension:{...params.dimension,soundOutput:'external_arc',audioOutput:'default'},settings:{aigamesound:value}};
    else { writes.push(params); value = params.settings.aigamesound; response = {returnValue:true}; }
    callback({payload:response}); return {cancel(){}};
  }};
  const run = command => banks.run(service,banks.normalize(command),()=>{},()=>({ready:true,input:'hdmi4',mode:'game',range:'sdr'}));
  assert.equal((await run({action:'read',banks:[{id:'s',target,keys:['aigamesound']}]})).banks[0].settings.aigamesound,'on');
  const applied = await run({action:'apply',banks:[{id:'s',target,settings:{aigamesound:'off'},expected:{aigamesound:'on'}}]});
  assert.deepEqual(applied.banks[0].changed,['aigamesound']);
  assert.deepEqual(writes.map(w=>[w.category,w.dimension,w.settings]),[['sound',{audioInput:'hdmi3_game'},{aigamesound:'off'}]]);

  // A reviewed rule keeps it editable while another input is on screen.
  assert.deepEqual(rules.resolve('aigamesound',target).control.options,['on','off']);
  assert.equal(rules.resolve('aigamesound',target).condition,'Used when this port is in a Game preset.');
  const bank = {id:'s',target,settings:{aigamesound:'on'}};
  const described = availability.describe('aigamesound',bank,{value:'on',current:{dimension:{audioInput:'hdmi4_game'},settings:{}}},
    {reviewed:true,values:b=>b.settings,context:{ready:true,input:'hdmi4',mode:'game',range:'sdr'}});
  assert.equal(described.editable,true);assert.deepEqual(described.control.options,['on','off']);
  // It is the active bank only for its own port in a Game preset.
  const live = {dimension:{audioInput:'hdmi3_game'}};
  assert.equal(availability.matchesActive(target,{ready:true,input:'hdmi3',mode:'hdrGame',range:'hdr'},live),true);
  assert.equal(availability.matchesActive(target,{ready:true,input:'hdmi3',mode:'filmMaker',range:'sdr'},live),false);
  assert.equal(availability.matchesActive(target,{ready:true,input:'hdmi4',mode:'game',range:'sdr'},live),false);
  assert.equal(model.active(bank,{ready:true,input:'hdmi3',mode:'game'}),true);
  assert.equal(model.active(bank,{ready:true,input:'hdmi3',mode:'expert1'}),false);

  // A change made on the TV is observed for the port in a Game preset only.
  const desc = {dimension:['audioInput'],dbtype:'G'}, record = {value:'off',dimension:{audioInput:'hdmi3_game',soundOutput:'external_arc'},observed_at:Date.now()};
  assert.deepEqual(banks.observation('sound','aigamesound',desc,record,{ready:true,input:'hdmi3',mode:'game',range:'sdr'}).target,target);
  assert.equal(banks.observation('sound','aigamesound',desc,{...record,dimension:{audioInput:'hdmi3'}},{ready:true,input:'hdmi3',mode:'cinema',range:'sdr'}),null);
  assert.deepEqual(banks.observationKeys.sound,['aigamesound']);

  // Factory declarations resolve in the sound category, with LG's overrides.
  const index = descriptions.create({},new Set(['aigamesound']));
  index.accept({key:'aigamesound',category:'sound',dimension:['audioInput'],dbtype:'G',dataType:'string',vtype:'ArrayExt',ui:{visible:true,active:true},
    values:{arrayExt:[{value:'on',visible:true,active:true},{value:'off',visible:true,active:true}]}},false);
  index.accept({key:'aigamesound@sound$hdmi2_game.x.x.x',ui:{visible:false}},true);
  assert.equal(index.resolve('aigamesound',target).ui.visible,true);
  assert.equal(index.resolve('aigamesound',{category:'sound',dimension:{audioInput:'hdmi2_game'}}).ui.visible,false);

  // The catalog adds one bank per HDMI port, with the port's game devices.
  const catalogIndex = {size:()=>1,resolve:(key,t)=>key==='aigamesound'&&t.category==='sound'?index.resolve(key,t):null};
  const doc = {schema:1,name:'t',devices:{ps5:'PS5'},banks:[{id:'g',name:'g',devices:['ps5'],target:{category:'other',dimension:{gameInput:'hdmi4',dynamicRange:'sdr',gameGenre:'Standard'}},settings:{gameColorDepth:50}}]};
  const planned = native.plan(doc,catalogIndex,['hdmi3','hdmi4','default'],true).filter(p=>p.bank.target.category==='sound');
  assert.deepEqual(planned.map(p=>[p.bank.target.dimension.audioInput,p.keys]),[['hdmi3_game',['aigamesound']],['hdmi4_game',['aigamesound']]]);
  assert.deepEqual(planned[1].bank.devices,['ps5']);

  // The editor lists it in the Game Optimizer section, one value per port.
  const records = view.records({document:{schema:1,banks:[{id:'s',name:'s',target,settings:{aigamesound:'on'}}]}});
  assert.equal(records.length,1);
  assert.deepEqual({category:records[0].category,port:records[0].port,family:records[0].family,kind:view.coordinates(records[0]).kind},
    {category:'game',port:'hdmi3',family:'game',kind:'port'});
  assert.equal(view.inColumn(records[0],'hdmi3'),true);assert.equal(view.inColumn(records[0],'hdmi4'),false);
  assert.equal(view.titles.aigamesound,'AI Sound Pro');
  // Saved profiles accept the bank.
  model.validate({schema:1,name:'t',devices:{},banks:[{id:'s',name:'s',devices:[],target,settings:{aigamesound:'off'}}]});
};
