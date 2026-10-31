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
  const f=fixture(doc,{nativeDescriptions:index});let e=f.create();e.setPower('on');await e.idle();
  await e.command({action:'initialize',document:doc,enabled:true,migration_id:'catalog-test'});
  await e.command({action:'upgrade_profiles',revision:e.status().revision});await e.idle();
  f.hook((command,bank)=>{
    if(command.action!=='read')return;
    f.values[bank.id]=f.values[bank.id]||{};
    for(const key of bank.keys)if(f.values[bank.id][key]===undefined){const d=index.resolve(key,bank.target);f.values[bank.id][key]=d.vtype==='Range'?42:d.values.arrayExt.find(v=>v.visible&&v.active).value;}
  });
  const before=e.snapshot(),op=f.operations.length,writes=f.writes.length;
  const result=await e.command({action:'include_native_catalog',revision:e.status().revision});
  assert(result.catalog.length>100);assert.equal(result.editor_api,9);
  assert.equal(f.writes.length,writes,'Discovery never writes bridge storage');assert.equal(f.operations.length,op,'Discovery reads metadata, not values');
  assert.deepEqual(e.snapshot().document,before.document,'Browsing never enrolls standards');
  const virtual={...e.snapshot(),document:{...e.snapshot().document,banks:result.catalog}};
  const all=view.records(virtual),opts=view.options(all);
  for(const preset of ['expert1','expert2','normal','hdrCinemaBright','dolbyHdrGame'])assert(opts.preset.includes(preset));
  assert(!opts.preset.includes('hdrCinema'));assert.deepEqual(opts.port,['hdmi1','hdmi2','hdmi3','hdmi4']);assert(opts.genre.includes('FPS'));
  const target=result.catalog.find(b=>b.target.dimension.pictureMode==='expert1'&&b.target.dimension.input==='hdmi1'&&!b.target.app_id);
  await e.command({action:'inspect',bank_id:target.id});
  assert.equal(f.writes.length,writes,'Inspecting unused presets never writes persistent storage');
  const edit=(settings,variant='standard',expected={backlight:42,color:42})=>({bank_id:target.id,settings,variant,expected});
  const batch=edits=>e.command({action:'edit_many',revision:e.status().revision,edits});
  await assert.rejects(batch([edit({backlight:51},'standard',{backlight:41})]),/Native values changed/);
  await assert.rejects(batch([edit({backlight:51}),edit({color:101})]),/range/);
  assert.equal(f.values[target.id].backlight,42);assert.equal(f.writes.length,writes,'Validation is all-or-nothing');
  await batch([edit({backlight:51})]);await e.idle();
  assert.equal(f.values[target.id].backlight,51);assert.deepEqual(e.snapshot().document,before.document);
  assert.equal(f.writes.slice(writes).filter(v=>v==='profiles').length,0,'Native Base saves do not grow or rewrite the managed collection');
  const created=await e.command({action:'create_profile',name:'Evening',revision:e.status().revision});await e.idle();
  await batch([edit({backlight:61},created.profile_id,{backlight:51})]);await e.idle();
  let bank=e.snapshot().document.banks.find(b=>b.id===target.id);
  assert.deepEqual(bank.settings,{backlight:51});assert.deepEqual(bank.variants,{[created.profile_id]:{backlight:61}},'First overlay captures only its one baseline');
  assert.equal(f.values[target.id].backlight,51,'Editing an inactive profile does not apply it');
  await e.command({action:'apply_profile',profile_id:created.profile_id});await e.idle();assert.equal(f.values[target.id].backlight,61);
  await e.command({action:'apply_profile',profile_id:'automatic'});await e.idle();assert.equal(f.values[target.id].backlight,51);
  // Persistence failures leave a bounded native-write intent, not new standards.
  let fail=true;f.hook((command,b)=>{if(!f.values[b.id])f.values[b.id]={};if(command.action==='read')for(const key of b.keys)if(f.values[b.id][key]===undefined){const d=index.resolve(key,b.target);f.values[b.id][key]=d.vtype==='Range'?42:d.values.arrayExt.find(v=>v.visible&&v.active).value;}if(command.action==='apply'&&b.id===target.id&&fail){fail=false;throw new Error('Lost native connection');}});
  await assert.rejects(batch([edit({color:53})]),/Lost native/);
  assert(f.files['profile-session'].native.length);assert(!Object.hasOwn(e.snapshot().document.banks.find(b=>b.id===target.id).settings,'color'));
  e.stop();e=f.create();e.setPower('on');await e.idle();
  assert.equal(f.values[target.id].color,53,'A process restart completes a compared native edit');assert(!f.files['profile-session'].native);
  await e.command({action:'capture_native'});
  const full=await e.command({action:'backup'}),decoded=model.decodeBackup(full);
  assert(decoded.native_snapshot.document.banks.length>100);assert(decoded.document.banks.length<10);
  assert.equal(decoded.native_snapshot.document.banks.find(b=>b.id===target.id).settings.color,53);
  const rev=e.status().revision;f.values[target.id].color=54;
  await e.command({action:'restore_backup',revision:rev,backup:full});await e.idle();
  assert.equal(f.values[target.id].color,53,'Complete backup restores native-only values');assert.deepEqual(e.snapshot().document,decoded.document,'Restoring the full backup does not enroll native-only settings');
  // Explicit compaction preserves overlays, links, originals, and temporary keys.
  const backup=await e.command({action:'backup'}),state=model.decodeBackup(backup);e.acknowledge({...state,sha256:backup.sha256});
  const keep=Object.fromEntries(before.document.banks.map(b=>[b.id,Object.keys(b.settings)]));
  const nativeOps=f.operations.length;
  await e.command({action:'compact_management',revision:e.status().revision,keep});
  assert(e.snapshot().document.banks.some(b=>b.id===target.id),'An override keeps its baseline even if omitted from keep');
  assert.equal(f.operations.length,nativeOps,'Compaction does not change native values');
  await assert.rejects(e.command({action:'inspect_many',bank_ids:Array(33).fill('movie')}),/1–32/);
  assert.throws(()=>native.plan(doc,index,['hdmi5']),/valid native HDMI/);
  const hidden={id:'hidden',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrCinema'}},settings:{backlight:50}};
  const d=description('backlight',hidden.target),preset=index.resolve('pictureMode',{category:'picture',dimension:{input:'hdmi3',dynamicRange:'hdr'}});
  assert.equal(availability.describe('backlight',hidden,{factory:d,value:50,preset},{reviewed:true,values:b=>b.settings}).editable,false);
  const expanded=model.clone(e.snapshot().document);
  for(const nativeBank of decoded.native_snapshot.document.banks) {
    const managed=expanded.banks.find(b=>b.id===nativeBank.id);
    if(managed)managed.settings={...nativeBank.settings,...managed.settings};else expanded.banks.push(model.clone(nativeBank));
  }
  const migration=fixture(expanded,{nativeDescriptions:index}),m=migration.create();m.setPower('on');await m.idle();
  await m.command({action:'initialize',document:expanded,enabled:true,migration_id:'expanded-release'});
  const adjusted=expanded.banks.find(b=>b.target.dimension.input==='hdmi2'&&b.target.dimension.pictureMode==='expert2'&&!b.target.app_id);
  migration.observe(m,adjusted.id,'color',60);
  await m.command({action:'capture_native'});const archive=await m.command({action:'backup'}),archiveState=model.decodeBackup(archive);
  m.acknowledge({...archiveState,sha256:archive.sha256});const nativeBefore=model.clone(migration.values),opsBefore=migration.operations.length;
  await m.command({action:'compact_management',revision:m.status().revision,keep});
  assert(m.snapshot().document.banks.length<10,'Compaction removes the copied native collection');
  assert.deepEqual(migration.values,nativeBefore);assert.equal(migration.operations.length,opsBefore);
  assert.deepEqual(m.snapshot().document.banks.find(b=>b.id===adjusted.id).settings,{color:42},'Temporary native deviations retain only their required original baseline');
  assert.deepEqual(m.snapshot().document.banks.find(b=>b.id===target.id).settings,{backlight:51},'Overlay baselines survive while their copied siblings are removed');
  m.stop();
  e.stop();
};
