'use strict';
const assert=require('node:assert/strict');
const rules=require('../app/bridge/lib/profile-rules');
const availability=require('../app/bridge/lib/profile-availability');

module.exports=()=>{
  const portKeys=new Set(['gameGenre','inputOptimization','gameOptimization','enableALLM','enableQFT','enable144HzBooster','uhdDeepColor','freesync']);
  const gameKeys=new Set(['gameAdjustContrast','gameBlackLevel','gameColorDepth','gameSharpness','blackStabilizer','whiteStabilizer','lowLevelAdjustment']);
  const observed=new Map();
  for(const file of ['g6-pc-hdr-audit','g6-sdr-movie-audit','g6-hdr-movie-audit','g6-dolby-vision-movie-audit','g6-switch-game-audit','g6-ps5-game-audit']) {
    const audit=require('../docs/'+file+'.json');
    for(const sample of audit.samples) {
      const context=sample.context||{input:audit.input,mode:audit.preset,range:sample.settings_range};
      const port=context.input.replace(/_pc$/,''),values=structuredClone(audit.baseline_controls);
      for(const [key,value] of Object.entries(sample.control_differences_from_baseline||sample.changes_from_baseline||sample.changes_from_sdr||{}))
        values[key]={...values[key],...value};
      for(const [key,value] of Object.entries(values)) {
        const target=portKeys.has(key)?{category:'other',dimension:{gameInput:port}}:
          gameKeys.has(key)?{category:'other',dimension:{gameInput:port,dynamicRange:context.range,gameGenre:'Standard'}}:
          key==='pictureMode'?{category:'picture',dimension:{input:context.input,dynamicRange:context.range}}:
          {category:'picture',dimension:{input:context.input,pictureMode:context.mode},...(key==='truMotionMode'?{app_id:'com.webos.app.'+port}:{})};
        const id=JSON.stringify([target,key]);
        if(!observed.has(id))observed.set(id,{key,target,samples:[]});
        observed.get(id).samples.push(value);
      }
    }
  }
  let verified=0;
  for(const {key,target,samples} of observed.values()) {
    const rule=rules.resolve(key,target);if(!rule)continue;verified++;
    const enabled=samples.filter(s=>s.editor==='editable');
    assert.equal(rule.editable,enabled.length>0,JSON.stringify({key,target})+' must agree with the recorded native audits');
    if(!rule.editable)continue;
    for(const sample of enabled) {
      if(rule.control.component==='select')assert(rule.control.options.every(v=>sample.options.includes(v)),key+' cannot invent an unaudited choice');
      else for(const k of ['min','max','step'])assert.equal(rule.control[k],sample[k],key+' '+k+' must match the audited native range');
    }
  }
  assert(verified>=40,'The regression must cover the real audited profiles, not only one fixture');
  const ps5={id:'ps5_hdr',target:{category:'picture',dimension:{input:'hdmi4',pictureMode:'hdrGame'}},settings:{expressionEnhancer:'off'}};
  const options={reviewed:true,document:{banks:[ps5]},values:b=>b.settings,context:{ready:true,input:'hdmi3',mode:'filmMaker',range:'sdr'}};
  const result=availability.describe('expressionEnhancer',ps5,{value:'off'},options);
  assert.equal(result.source,'audited');
  assert.deepEqual(result.control.options,['off','detail','highlight'],'Inactive PS5 HDR keeps its verified options without the current source’s descriptions');
  assert.equal(availability.describe('expressionEnhancer',ps5,{value:'off'},{...options,reviewed:false}).state,'unverified','A different firmware cannot inherit G6 rules');
  assert.equal(rules.resolve('gamma',{category:'picture',dimension:{input:'hdmi2',pictureMode:'game'}}),null,'An unaudited input cannot borrow a similarly named preset');
  assert.equal(rules.resolve('truMotionMode',{category:'picture',dimension:{input:'hdmi4',pictureMode:'hdrGame'},app_id:'com.webos.app.hdmi3'}),null,'Rules preserve the exact HDMI app binding');
  assert.equal(rules.resolve('inputOptimization',{category:'other',dimension:{gameInput:'hdmi2'}}),null);
};
