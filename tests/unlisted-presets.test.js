'use strict';
// Eco (LG's energy-rating preset, with Standard's menu and no picture tuning of
// its own) and Photo (a partial preset) are not offered. Personalized, which
// LG's Picture Wizard builds, stays. Saved values naming them stay valid.
const assert = require('node:assert/strict');
const native = require('../app/bridge/lib/profile-native-catalog');
const availability = require('../app/bridge/lib/profile-availability');
const model = require('../app/bridge/lib/profile-model');
const view = require('../app/profile-view');

module.exports = () => {
  for (const mode of ['eco','hdrEco','photo']) assert.equal(view.listed(mode),false,mode);
  for (const mode of ['personalized','hdrPersonalized','dolbyHdrPersonalized','normal','vivid','cinema','hdrCinemaBright','sports']) assert.equal(view.listed(mode),true,mode);
  const offered = {sdr:['personalized','vivid','normal','eco','cinema','photo','game','filmMaker'],hdr:['hdrPersonalized','hdrStandard','hdrEco','hdrGame']};
  const choice = (key,target,options) => ({key,category:target.category,dimension:Object.keys(target.dimension),dbtype:'G',dataType:'string',vtype:'ArrayExt',
    ui:{visible:true,active:true},values:{arrayExt:options.map(value=>({value,visible:true,active:true}))}});
  const index = {size:()=>1,resolve(key,target){
    const d=target.dimension;
    if(key==='pictureMode'&&d.input&&d.dynamicRange)return offered[d.dynamicRange.replace(/ALLM$/,'')]?choice(key,target,offered[d.dynamicRange.replace(/ALLM$/,'')]):null;
    if(key==='backlight'&&d.pictureMode&&!target.app_id)return {...choice(key,target,[]),dataType:'int',vtype:'Range',values:{range:{min:0,max:100,interval:1}}};
    return null;
  }};
  const planned = native.plan({schema:1,name:'t',devices:{},banks:[]},index,['hdmi2'],true);
  const presets = [...new Set(planned.map(p=>p.bank.target.dimension.pictureMode).filter(Boolean))].sort();
  assert.deepEqual(presets,['filmMaker','game','hdrGame','hdrPersonalized','hdrStandard','normal','personalized','vivid','cinema'].sort(),'No Eco or Photo picture banks');
  // Preset selection choices leave them out too.
  const mapping = {id:'m',target:{category:'picture',dimension:{input:'hdmi2',dynamicRange:'sdr'}},settings:{pictureMode:'eco'}};
  const described = availability.describe('pictureMode',mapping,{factory:choice('pictureMode',mapping.target,offered.sdr),value:'eco'},{reviewed:true,values:b=>b.settings});
  assert.equal(described.editable,true);
  assert.deepEqual(described.control.options,['personalized','vivid','normal','cinema','game','filmMaker']);
  // A profile or the TV can still hold Eco: it stays a valid saved value.
  model.validate({schema:1,name:'t',devices:{},banks:[{...mapping,name:'HDMI 2 SDR preset selection',devices:[]}]});
};
