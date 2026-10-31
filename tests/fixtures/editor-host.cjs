'use strict';
// Browser interactions share a deterministic TV transport; engine tests cover
// atomicity, native validation, persistence and recovery separately.
function setup(initial) {
  window.fixture=structuredClone(initial);window.calls=[];window.editorApi=initial.document.schema===2?7:5;
  window.confirm=()=>true;
  window.requestProfile=async command=>{
    window.calls.push(structuredClone(command));
    if(command.action==='get') {
      if(window.delayGet)await new Promise(resolve=>setTimeout(resolve,150));
      if(window.failGet)throw new Error('Disconnected');
      return {state:structuredClone(window.fixture),status:{editor_api:window.editorApi,offline:!!window.offline,backup_sequence:1,backup_acknowledged:1}};
    }
    if(command.action==='inspect') {
      const bank=window.fixture.document.banks.find(b=>b.id===command.bank_id),controls={};
      for(const [key,value] of Object.entries(bank.settings)) {
        controls[key]=typeof value==='number'?{component:'number',min:key==='colorTemperature'?-50:0,max:key==='colorTemperature'||/Sharpness|sharpness/.test(key)?50:/Stabilizer/.test(key)?20:100,step:1}:
          {component:'select',options:['on','off'].includes(value)?['off','on']:[value]};
      }
      if(controls.enable144HzBooster)controls.enable144HzBooster.label='165 Hz boost';
      if(window.motionDependencies&&controls.truMotionMode)controls.truMotionMode.options=['off','user'];
      if(window.slowInspect===bank.id||window.delayInspect)await new Promise(resolve=>setTimeout(resolve,100));
      if(controls.pictureMode)controls.pictureMode.options=bank.target.dimension.dynamicRange.startsWith('sdr')?['filmMaker','game']:bank.target.dimension.dynamicRange.startsWith('hdr')?['hdrFilmMaker','hdrGame']:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame'];
      if(controls.blackLevel)controls.blackLevel={component:'select',options:['auto','high','low']};
      const availability=Object.fromEntries(Object.keys(bank.settings).map(key=>[key,{state:'editable',editable:true}]));
      for(const [key,reason] of Object.entries((window.unavailable||{})[bank.id]||{})) {
        availability[key]={state:'unavailable',editable:false,reason};delete controls[key];
      }
      if(window.motionDependencies)for(const key of ['truMotionJudder','truMotionBlur'].filter(k=>Object.hasOwn(bank.settings,k))) {
        const motion=window.fixture.document.banks.find(b=>b.target.app_id&&b.target.dimension.input===bank.target.dimension.input&&b.target.dimension.pictureMode===bank.target.dimension.pictureMode);
        if(!motion||motion.settings.truMotionMode!=='user'){availability[key]={state:'unavailable',editable:false,reason:'Requires TruMotion User Selection in this preset.'};delete controls[key];}
        else controls[key]={component:'number',min:0,max:10,step:1};
      }
      return {id:bank.id,settings:structuredClone(bank.settings),controls,availability};
    }
    if(['edit_many','save','restore','set_brightness_links'].includes(command.action)&&command.revision!==window.fixture.revision)throw new Error('Profiles changed; refresh before saving');
    if(command.action==='set_brightness_links') {
      for(const link of command.links)window.LGProfileView.setBrightnessLink(window.fixture.document.banks.find(b=>b.id===link.bank_id),link.linked,window.fixture.preferences,window.fixture.room,window.fixture.document);
      window.fixture.revision++;
    }
    if(command.action==='edit_many') {
      if(window.failNextBatch==='before'){window.failNextBatch=null;window.fixture.revision++;throw new Error('Another editor changed the profiles');}
      const next=structuredClone(window.fixture);
      for(const edit of command.edits) {
        const bank=next.document.banks.find(b=>b.id===edit.bank_id);edit.settings=edit.settings||{};
        for(const key of edit.inherit||[]) {
          if(key==='backlight'&&bank.brightness_role)delete next.document.profiles.find(p=>p.id===edit.variant).brightness[bank.brightness_role];
          else if(bank.variants&&bank.variants[edit.variant]){delete bank.variants[edit.variant][key];if(!Object.keys(bank.variants[edit.variant]).length)delete bank.variants[edit.variant];}
        }
        if(next.document.schema===2&&bank.brightness_role&&Object.hasOwn(edit.settings,'backlight')) {
          const target=edit.variant==='standard'?next.document:next.document.profiles.find(p=>p.id===edit.variant);target.brightness=target.brightness||{};target.brightness[bank.brightness_role]=edit.settings.backlight;
          delete edit.settings.backlight;
        }
        if(edit.variant==='standard')Object.assign(bank.settings,edit.settings);
        else {bank.variants=bank.variants||{};bank.variants[edit.variant]={...(bank.variants[edit.variant]||{}),...edit.settings};}
      }
      Object.assign(next.preferences,command.preferences);next.revision++;window.fixture=next;
      if(window.failNextBatch==='after'){window.failNextBatch=null;throw new Error('Reply lost');}
    }
    if(command.action==='create_profile') {
      const id='p_'+window.fixture.revision,source=window.fixture.document.profiles.find(p=>p.id===command.copy_from);
      window.fixture.document.profiles.push({id,name:command.name,brightness:structuredClone(source&&source.brightness||{})});
      for(const bank of window.fixture.document.banks)if((bank.variants||{})[command.copy_from])bank.variants[id]=structuredClone(bank.variants[command.copy_from]);
      window.fixture.revision++;return {revision:window.fixture.revision,profile_id:id};
    }
    if(command.action==='rename_profile'){window.fixture.document.profiles.find(p=>p.id===command.profile_id).name=command.name;window.fixture.revision++;}
    if(command.action==='set_automatic'){window.fixture.document.automatic=command.profiles;window.fixture.revision++;}
    if(command.action==='apply_profile'){window.fixture.selection=command.profile_id;window.fixture.active_profile=command.profile_id==='automatic'?window.fixture.document.automatic[window.fixture.room]:command.profile_id;window.fixture.overrides={};}
    if(command.action==='reset_profile') {
      window.fixture.document.profiles.find(p=>p.id===command.profile_id).brightness={};
      for(const bank of window.fixture.document.banks)if(bank.variants)delete bank.variants[command.profile_id];window.fixture.revision++;
    }
    if(command.action==='delete_profile'){window.fixture.document.profiles=window.fixture.document.profiles.filter(p=>p.id!==command.profile_id);window.fixture.revision++;}
    if(command.action==='set_enabled'){window.fixture.enabled=command.enabled;window.fixture.revision++;}
    if(['restore','save'].includes(command.action)) {
      if(command.room!==window.fixture.room)throw new Error('Room changed; review again');
      for(const [id,keys] of Object.entries(command.selection)) {
        const bank=window.fixture.document.banks.find(b=>b.id===id),overrides=window.fixture.overrides[id]||{};
        for(const key of keys) {
          if(command.action==='save')bank.settings[key]=overrides[key];
          delete overrides[key];
        }
      }
      if(command.action==='save')window.fixture.revision++;
    }
    return {revision:window.fixture.revision};
  };
  window.PalmServiceBridge=function(){};
  window.PalmServiceBridge.prototype.call=async function(uri,payload) {
    try {
      const result=uri.endsWith('/profiles')?await window.requestProfile(JSON.parse(payload)):{};
      this.onservicecallback(JSON.stringify({returnValue:true,result,status:{configured:true,running:true,monitor_healthy:true,transport:'mqtt',mqtt_commands_enabled:true,mqtt:{state:'connected',commands_ready:true}}}));
    } catch(e){this.onservicecallback(JSON.stringify({returnValue:false,errorText:e.message}));}
  };
}
async function mount(page,state,options={}) {
  const path=require('node:path'),appRoot=process.env.PROFILE_TEST_APP_ROOT||path.join(__dirname,'../../app');
  await page.setContent('<style>html,body{height:100%;margin:0}lg-profile-editor{height:100%}</style><lg-profile-editor></lg-profile-editor>');
  for(const file of ['profile-view.js','profile-editor.js'])await page.addScriptTag({path:path.join(appRoot,file)});
  await page.evaluate(setup,state);
  await page.evaluate(options=>document.querySelector('lg-profile-editor').configure({...options,request:window.requestProfile}),options);
}
module.exports={setup,mount};
