'use strict';
const assert=require('node:assert/strict');
const {fixture,doc}=require('./profile-engine.test');

module.exports=async()=>{
  const collection=structuredClone(doc);
  collection.banks.push(
    {id:'pc_sdr',name:'PC SDR',devices:['switch_2'],target:{category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'game'}},settings:{gamma:'mediumHavingLevel',gammaLevel:0}},
    {id:'ps5_hdr',name:'PS5 HDR',devices:['switch_2'],target:{category:'picture',dimension:{input:'hdmi4',pictureMode:'hdrGame'}},settings:{expressionEnhancer:'off',gamma:'mediumHavingLevel',gammaLevel:0,peakBrightness:'high'}});
  const f=fixture(collection);let e=f.create();e.setPower('on');await e.idle();
  await e.command({action:'initialize',document:collection,enabled:true,migration_id:'test',room:'dark'});
  const context={ready:true,input:'hdmi3',mode:'filmMaker',range:'sdr'};
  e.contextChanged(context);
  f.descriptionHook((bank,descriptions)=>{
    for(const d of descriptions) {
      const options={gamma:['low','medium','high1','high2','mediumHavingLevel'],expressionEnhancer:['off','detail','highlight'],peakBrightness:['off','low','medium','high']}[d.key];
      if(options) {d.values={arrayExt:options.map(value=>({value,visible:false,active:false}))};d.ui={visible:false,active:false};}
      if(d.key==='gammaLevel')d.values={range:{min:-3,max:3,interval:1}};
    }
  });
  const edit=(bank_id,settings)=>({bank_id,settings}),batch=edits=>e.command({action:'edit_many',revision:e.status().revision,edits});
  const writes=()=>f.writes.filter(n=>n==='profiles').length;
  let count=writes();const visible=structuredClone(f.values.movie);
  await batch([edit('pc_sdr',{gamma:'high2'}),edit('ps5_hdr',{expressionEnhancer:'detail'})]);await e.idle();
  assert.equal(writes(),count+1,'Different inactive profiles commit in one standards revision');
  assert.equal(f.values.pc_sdr.gamma,'high2');assert.equal(f.values.ps5_hdr.expressionEnhancer,'detail');
  assert.deepEqual(f.values.movie,visible,'Editing inactive targets cannot change the displayed movie bank');
  assert.deepEqual(e.status().context,context,'Inactive editing never selects a source or forces a picture preset');
  count=writes();
  await assert.rejects(batch([edit('pc_sdr',{gammaLevel:1})]),/adjustable 2.2/);
  await assert.rejects(batch([edit('pc_sdr',{gamma:'mediumHavingLevel'}),edit('ps5_hdr',{gammaLevel:1})]),/apply to SDR/);
  await assert.rejects(batch([edit('pc_sdr',{gamma:'mediumHavingLevel'}),edit('ps5_hdr',{peakBrightness:'low'})]),/does not use/);
  await assert.rejects(batch([edit('pc_sdr',{gamma:'medium'})]),/unavailable/);
  assert.equal(writes(),count,'Invalid dependencies and unsupported targets abort before committing any part of a batch');
  assert.equal(f.values.pc_sdr.gamma,'high2');
  await batch([edit('pc_sdr',{gammaLevel:1,gamma:'mediumHavingLevel'})]);await e.idle();
  assert.equal(f.values.pc_sdr.gammaLevel,1,'The complete candidate controls dependent availability regardless of field order');
  e.stop();e=f.create();e.setPower('on');await e.idle();e.contextChanged(context);
  await batch([edit('pc_sdr',{gammaLevel:0}),edit('ps5_hdr',{expressionEnhancer:'off'})]);await e.idle();
  assert.equal(f.values.pc_sdr.gammaLevel,0);assert.equal(f.values.ps5_hdr.expressionEnhancer,'off');
  assert.deepEqual(f.values.movie,visible,'Verified inactive editing survives a service restart without a runtime observation cache');
  e.stop();
};
