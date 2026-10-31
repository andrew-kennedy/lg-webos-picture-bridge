'use strict';
const assert=require('node:assert/strict');
const {fixture,doc}=require('./profile-engine.test');
const model=require('../app/bridge/lib/profile-model');
const view=require('../app/profile-view');
module.exports=async()=>{
  const collection=model.clone(doc),movie=collection.banks.find(b=>b.id==='movie');
  movie.variants={dark:{color:50},bright:{color:60}};
  collection.banks.push({...model.clone(movie),id:'movie2',target:{category:'picture',dimension:{input:'hdmi4',pictureMode:'filmMaker'}},settings:{backlight:3,color:45},variants:{dark:{color:49}}});
  collection.banks.push({id:'unused',name:'Unused Game contrast',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrGame'}},settings:{contrast:100},variants:{dark:{contrast:90}}});
  const f=fixture(collection);let e=f.create();e.setPower('on');await e.idle();
  await e.command({action:'initialize',document:collection,enabled:true,migration_id:'test'});
  await e.command({action:'upgrade_profiles',revision:e.status().revision});
  const batch=async(edits,extra={})=>{const result=await e.command({action:'edit_many',revision:e.status().revision,edits,...extra});await e.idle();return result;};
  const inherit=(bank_id,keys,variant='dark')=>({bank_id,variant,inherit:keys});
  const bank=id=>e.snapshot().document.banks.find(b=>b.id===id);
  const writes=()=>f.writes.filter(n=>n==='profiles').length;
  let count=writes(),native=f.operations.filter(o=>o.action==='apply').length;
  assert.equal(view.isInherited(bank('movie'),e.snapshot(),'dark','color'),false,'An equal-valued pin remains an override');
  await batch([inherit('movie',['color'])]);
  assert.equal(writes(),count+1);assert.equal(view.isInherited(bank('movie'),e.snapshot(),'dark','color'),true);
  assert.equal(f.operations.filter(o=>o.action==='apply').length,native,'Removing equal-valued pin needs no native write');
  count=writes();await batch([inherit('movie',['color'])]);assert.equal(writes(),count,'Already inherited is a persistent no-op');
  await batch([{bank_id:'movie',variant:'standard',settings:{color:52}}]);
  assert.equal(f.values.movie.color,52,'Inherited values follow future Base edits');
  assert.equal(view.values(bank('movie'),e.snapshot(),'bright').color,60,'Other profile overrides are preserved');
  await batch([inherit('movie',['color'],'bright')]);assert.equal(f.values.movie.color,52,'Inactive profile inheritance does not apply it');
  assert.equal(view.values(bank('movie'),e.snapshot(),'bright').color,52);
  // Each member of a broad control inherits its own base, not one shared value.
  await batch([{bank_id:'movie',variant:'dark',settings:{color:60}},{bank_id:'movie2',variant:'dark',settings:{color:60}}]);
  f.observe(e,'game','gameSharpness',7);
  count=writes();await batch([inherit('movie',['color']),inherit('movie2',['color'])]);
  assert.equal(writes(),count+1);assert.equal(f.values.movie.color,52);assert.equal(f.values.movie2.color,45);
  assert.equal(e.snapshot().overrides.game.gameSharpness,7,'Unrelated temporary edits survive');
  await batch([{bank_id:'movie',variant:'dark',settings:{backlight:17,color:55}}]);
  await batch([inherit('movie',['backlight'])]);
  assert.equal(f.values.movie.backlight,3);assert.equal(f.values.movie2.backlight,3,'Reset expands linked brightness');
  assert.equal(bank('movie').variants.dark.color,55,'Other overrides in the same bank survive');
  assert.equal(e.snapshot().document.profiles.find(p=>p.id==='dark').brightness.movie_sdr,undefined);
  await batch([{bank_id:'movie',variant:'standard',settings:{backlight:4}}]);
  assert.equal(f.values.movie.backlight,4);assert.equal(f.values.movie2.backlight,4);
  // Cleanup may remove a saved override even when LG does not use that control.
  await batch([inherit('unused',['contrast'])]);assert.equal(f.values.unused.contrast,100);
  await assert.rejects(batch([{bank_id:'unused',variant:'dark',settings:{contrast:80}}]),/Game Optimizer/);
  const before=model.clone(e.snapshot().document);count=writes();
  for(const edits of [
    [inherit('movie',['color'],'standard')],
    [inherit('movie',['bogus'])],
    [inherit('movie',['color','color'])],
    [inherit('movie','color')],
    [{...inherit('movie',['color']),settings:{color:56}}],
    [inherit('movie',['backlight']),{bank_id:'movie2',variant:'dark',settings:{backlight:4}}],
    [{bank_id:'movie2',variant:'dark',settings:{backlight:4}},inherit('movie',['backlight'])],
    [inherit('movie',['color']),{bank_id:'game',variant:'dark',settings:{gameSharpness:101}}]
  ])await assert.rejects(batch(edits));
  assert.equal(writes(),count);assert.deepEqual(e.snapshot().document,before,'Invalid later operations cannot partially commit resets');
  await assert.rejects(batch([inherit('movie',['color'])],{revision:0}),/refresh/);
  f.inspectHook(()=>e.setPower('off'));
  await assert.rejects(batch([inherit('movie',['color'])]),/TV|power/);f.inspectHook(null);
  assert.deepEqual(e.snapshot().document,before);
  e.setPower('on');await e.idle();
  // Storage ranges and scopes still guard inheritance, including stale Base data.
  f.descriptionHook((b,descriptions)=>{if(b.id==='movie')descriptions.find(d=>d.key==='color').values.range.max=40;});
  await assert.rejects(batch([inherit('movie',['color'])]),/range|between/);
  assert.deepEqual(e.snapshot().document,before);f.descriptionHook(null);
  await batch([{...inherit('movie',['color']),settings:{backlight:12}}]);
  assert.equal(f.values.movie.backlight,12);assert.equal(f.values.movie2.backlight,12);
  const saved=e.snapshot().document;e.stop();e=f.create();e.setPower('on');await e.idle();
  assert.deepEqual(e.snapshot().document,saved,'Inheritance membership survives restart');
  assert.equal(view.isInherited(bank('movie'),e.snapshot(),'dark','color'),true);e.stop();
};
