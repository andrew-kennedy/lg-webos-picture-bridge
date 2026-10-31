'use strict';
const assert=require('node:assert/strict');
const native=require('../app/bridge/lib/profile-native-catalog');
const view=require('../app/profile-view');
const model=require('../app/bridge/lib/profile-model');
const availability=require('../app/bridge/lib/profile-availability');
const {fixture,doc}=require('./profile-engine.test');
const modes={sdr:['filmMaker','game','expert1','expert2','normal'],hdr:['hdrFilmMaker','hdrGame','hdrCinemaBright'],dolbyHdr:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame']};
const description=(key,target,options)=>({key,category:target.category,dimension:Object.keys(target.dimension),dbtype:target.app_id?'M':'G',dataType:options?'string':'int',ui:{active:true,visible:true},vtype:options?'ArrayExt':'Range',values:options?{arrayExt:options.map(value=>({value,active:true,visible:true}))}:{range:{min:0,max:100,interval:1}}});
const index={size:()=>1,resolve(key,target){
  const d=target.dimension;
  if(key==='pictureMode'&&d.input&&d.dynamicRange){const result=description(key,target,modes[d.dynamicRange.replace(/ALLM$/,'')]);result.values.arrayExt.push({value:'hdrCinema',visible:false,active:true});return result;}
  if(d.pictureMode&&['backlight','color'].includes(key)&&!target.app_id)return description(key,target);
  if(key==='truMotionMode'&&target.app_id)return description(key,target,['off','user']);
  if(key==='gameGenre'&&d.gameInput&&!d.gameGenre)return description(key,target,['Standard','FPS']);
  if(key==='gameColorDepth'&&d.gameGenre)return description(key,target);
  return null;
}};
module.exports=async()=>{
  const f=fixture(doc,{nativeDescriptions:index}),e=f.create();e.setPower('on');await e.idle();
  await e.command({action:'initialize',document:doc,enabled:true,migration_id:'catalog-test'});
  const before=e.snapshot();f.observe(e,'movie','color',54);
  f.hook((command,bank)=>{
    if(command.action!=='read')return;
    f.values[bank.id]=f.values[bank.id]||{};
    for(const key of bank.keys)if(f.values[bank.id][key]===undefined){const d=index.resolve(key,bank.target);f.values[bank.id][key]=d.vtype==='Range'?42:d.values.arrayExt.find(v=>v.visible&&v.active).value;}
  });
  const op=f.operations.length,writes=f.writes.length;
  const result=await e.command({action:'include_native_catalog',revision:e.status().revision});
  assert(result.added_banks>100,'Native scope is no longer bounded by the 100-bank curated collection');
  assert.equal(result.editor_api,8);assert.equal(f.writes.slice(writes).filter(v=>v==='profiles').length,1);
  assert(f.operations.slice(op).every(o=>o.action==='read'),'Catalog enrollment never writes native values');
  for(const old of before.document.banks){const next=e.snapshot().document.banks.find(b=>b.id===old.id);for(const [k,v] of Object.entries(old.settings))assert.deepEqual(next.settings[k],v);assert.deepEqual(next.variants,old.variants);assert.equal(next.brightness_role,old.brightness_role);}
  assert.equal(e.snapshot().overrides.movie.color,54,'Enrollment preserves current temporary adjustments');
  const all=view.records(e.snapshot()),options=view.options(all);
  for(const preset of ['expert1','expert2','normal','hdrCinemaBright','dolbyHdrGame'])assert(options.preset.includes(preset));
  assert(!options.preset.includes('hdrCinema'),'A hidden native preset is not invented from its recognized ID');
  assert.deepEqual(options.port,['hdmi1','hdmi2','hdmi3','hdmi4']);assert.deepEqual(options.input_type,['video','pc']);assert(options.genre.includes('FPS'));
  const sdrGames=all.filter(r=>r.bank.target.dimension.gameGenre&&r.format==='sdr');
  assert(sdrGames.every(r=>r.preset==='game'&&r.family==='game'),'The stored Game bank does not depend on a movie preset mapping');
  assert(all.filter(r=>r.bank.target.dimension.pictureMode).every(r=>r.signals.length===2),'Picture banks are shared across ALLM');
  const writesAfter=f.writes.length,opsAfter=f.operations.length;
  const again=await e.command({action:'include_native_catalog',revision:e.status().revision});
  assert.equal(again.added_settings,0);assert.equal(f.writes.length,writesAfter);assert.equal(f.operations.length,opsAfter,'Repeated discovery needs no value reads when the catalog is complete');
  await assert.rejects(e.command({action:'inspect_many',bank_ids:Array(33).fill('movie')}),/1–32/);
  const inspected=await e.command({action:'inspect_many',bank_ids:['movie','mapping']});assert.equal(inspected.banks.length,2);
  await assert.rejects(e.command({action:'include_native_catalog',revision:0}),/refresh/);
  assert.throws(()=>native.plan(doc,index,['hdmi5']),/valid native HDMI/);
  // A failed read must not commit partial discovery.
  const failure=fixture(doc,{nativeDescriptions:index}),failed=failure.create();failed.setPower('on');await failed.idle();
  await failed.command({action:'initialize',document:doc,enabled:true,migration_id:'failure-test'});
  const original=failed.snapshot().document;failure.hook(()=>{throw new Error('Lost native connection');});
  await assert.rejects(failed.command({action:'include_native_catalog',revision:failed.status().revision}),/Lost/);assert.deepEqual(failed.snapshot().document,original);
  // Model recognition alone must never override an explicit native denial.
  const bank={id:'hidden',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrCinema'}},settings:{backlight:50}};
  const d=description('backlight',bank.target),preset=index.resolve('pictureMode',{category:'picture',dimension:{input:'hdmi3',dynamicRange:'hdr'}});
  assert.equal(availability.describe('backlight',bank,{factory:d,value:50,preset},{reviewed:true,values:b=>b.settings}).editable,false);
  const newGame={id:'unused_game',target:{category:'other',dimension:{gameInput:'hdmi3',dynamicRange:'sdr',gameGenre:'FPS'}},settings:{gameColorDepth:42}};
  const gameInfo={factory:description('gameColorDepth',newGame.target),value:42};
  const gameOptions={reviewed:true,document:e.snapshot().document,values:b=>b.settings};
  assert.equal(availability.describe('gameColorDepth',newGame,gameInfo,gameOptions).editable,true,'A native Game genre remains editable while that signal maps to Filmmaker');
  assert.throws(()=>availability.assertEditable('backlight',101,{...bank,target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrCinemaBright'}}},{settings:{backlight:50},factory_descriptions:{backlight:d}},gameOptions),/range/,'New presets retain native numeric bounds');
  assert(model.validate(e.snapshot().document));e.stop();failed.stop();
};
