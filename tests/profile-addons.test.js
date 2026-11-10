'use strict';
const assert=require('node:assert/strict');
const {fixture,doc}=require('./profile-engine.test');
const model=require('../app/bridge/lib/profile-model');
const catalog=require('../app/bridge/lib/profile-catalog');
const view=require('../app/profile-view');
// Add-on profiles layer over the main profile in use, one per group, so a
// source's own fixes can be switched without leaving Automatic.
module.exports=async function() {
  const original=model.clone(doc);
  original.banks[1].variants={bright:{color:51},dark:{color:50}};
  const f=fixture(original);let e=f.create();e.setPower('on');await e.idle();
  await e.command({action:'initialize',document:original,enabled:true,migration_id:'old-ha',room:'dark'});
  await e.command({action:'upgrade_profiles',revision:e.status().revision});
  const run=async fields=>{const result=await e.command({revision:e.status().revision,...fields});await e.idle();return result;};
  const group='Switch 2 HDR';
  const fix=(await run({action:'create_profile',name:'DTM fix',group})).profile_id;
  const other=(await run({action:'create_profile',name:'Dark fix',group})).profile_id;
  assert.equal(catalog.addon(e.snapshot().document,fix),true);
  assert.deepEqual(catalog.groups(e.snapshot().document),[group]);
  assert.deepEqual(e.status().addons,{},'New add-ons are not selected');
  await run({action:'edit_many',edits:[{bank_id:'game',variant:fix,settings:{gameSharpness:7}}]});
  await run({action:'edit_many',edits:[{bank_id:'game',variant:other,settings:{gameSharpness:3,gameColorDepth:44}}]});
  assert.equal(f.values.game.gameSharpness,0,'Editing an unselected add-on does not change the picture');

  const revision=e.status().revision;
  await run({action:'apply_addon',group,profile_id:fix});
  assert.equal(e.status().revision,revision,'Selecting an add-on creates no standards revision');
  assert.deepEqual(e.status().addons,{[group]:fix});
  assert.equal(e.status().selection,'automatic','The main profile selection is unchanged');
  assert.equal(f.values.game.gameSharpness,7);
  assert.equal(f.values.movie.color,50,'Banks without add-on overrides follow the main profile');
  await run({action:'set_environment',room:'bright'});
  assert.equal(f.values.movie.color,51,'Automatic room changes still apply under an add-on');
  assert.equal(f.values.game.gameSharpness,7,'The add-on survives a room change');

  await run({action:'apply_addon',group,profile_id:other});
  assert.equal(f.values.game.gameSharpness,3);assert.equal(f.values.game.gameColorDepth,44);
  await run({action:'apply_addon',group,profile_id:fix});
  assert.equal(f.values.game.gameColorDepth,50,'Switching add-ons restores keys the previous one owned');

  e.stop();e=f.create();e.setPower('on');await e.idle();
  assert.deepEqual(e.status().addons,{[group]:fix},'Add-on selection survives a process restart');
  f.observe(e,'game','gameSharpness',9);
  e.setPower('off');await e.idle();e.setPower('on');await e.idle();
  assert.equal(f.values.game.gameSharpness,7,'Power cycles restore the selected add-on');

  f.observe(e,'game','gameSharpness',6);
  await run({action:'save',scope:'game'});
  const saved=e.snapshot().document.banks.find(b=>b.id==='game');
  assert.equal(saved.variants[fix].gameSharpness,6,'Keep saves into the add-on that owns the bank');
  assert.equal(saved.settings.gameSharpness,0,'Base is untouched');

  await assert.rejects(run({action:'apply_profile',profile_id:fix}),/add-on/);
  await assert.rejects(run({action:'apply_addon',group:'Nope',profile_id:fix}),/Unknown add-on group/);
  await assert.rejects(run({action:'apply_addon',group,profile_id:'dark'}),/add-on from this group/);
  await assert.rejects(run({action:'set_automatic',profiles:{bright:fix,dark:'dark'}}),/main profiles/);
  await assert.rejects(run({action:'edit_many',edits:[{bank_id:'movie',variant:fix,settings:{backlight:40}}]}),/linked SDR brightness/);
  await assert.rejects(run({action:'create_profile',name:'Bad',group:' padded '}),/group name/);

  const dup=(await run({action:'create_profile',name:'DTM fix copy',copy_from:fix})).profile_id;
  assert.equal(catalog.profile(e.snapshot().document,dup).group,group,'Duplicates keep their group');
  const main=(await run({action:'create_profile',name:'Plain',copy_from:fix,group:null})).profile_id;
  assert.equal(catalog.addon(e.snapshot().document,main),false,'A null group makes a main profile');

  const backup=await e.command({action:'backup'});
  assert.deepEqual(model.decodeBackup(backup).addons,{[group]:fix});
  assert.deepEqual(view.activeLayers(e.snapshot()),[e.status().active_profile,fix]);
  assert.equal(view.values(saved,e.snapshot(),view.activeLayers(e.snapshot())).gameSharpness,6);

  await run({action:'apply_addon',group,profile_id:null});
  assert.equal(f.values.game.gameSharpness,0,'Turning the add-on off returns to the main profile');
  assert.deepEqual(e.status().addons,{});
  await run({action:'apply_addon',group,profile_id:other});
  await run({action:'delete_profile',profile_id:other});
  assert.deepEqual(e.status().addons,{},'Deleting the selected add-on turns the group off');
  assert.equal(f.values.game.gameSharpness,0);
  e.stop();
};
