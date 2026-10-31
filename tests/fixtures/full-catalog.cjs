'use strict';
// A G6-sized native catalog layered over the managed format fixture: eight
// input identities × 22 presets, preset mappings, port banks and Game
// Optimizer genres (548 groups, as on the verified TV). Values and
// availability are deterministic and follow the audited G6 rules closely
// enough to exercise exclusions; they are not a substitute for the audits.
const catalog=require('../../app/bridge/lib/profile-catalog');
const banks=require('../../app/bridge/lib/profile-banks');
const presets={sdr:['personalized','vivid','normal','eco','cinema','game','filmMaker','expert1','expert2'],hdr:['hdrPersonalized','hdrVivid','hdrStandard','hdrEco','hdrCinemaBright','hdrGame','hdrFilmMaker'],dolbyHdr:['dolbyHdrPersonalized','dolbyHdrVivid','dolbyHdrStandard','dolbyHdrCinemaBright','dolbyHdrCinema','dolbyHdrGame']};
const genres=['Standard','FPS','RPG','RTS','Sports','USER'];
const omitted=new Set(['motionEyeCare','aiHdrRemastering','ambientLightCompensation']);
const defaultMapping={sdr:'normal',sdrALLM:'game',hdr:'hdrStandard',hdrALLM:'hdrGame',dolbyHdr:'dolbyHdrStandard',dolbyHdrALLM:'dolbyHdrGame'};
const canonical=target=>JSON.stringify(target,Object.keys(target).concat(Object.keys(target.dimension)).sort());
const formatOf=mode=>mode.startsWith('dolbyHdr')?'dolbyHdr':mode.startsWith('hdr')?'hdr':'sdr';
function pictureValue(key,mode,input) {
  const f=formatOf(mode),game=/game$/i.test(mode),movie=/cinema|filmmaker/i.test(mode);
  const values={backlight:f==='sdr'?(movie?40:80):100,contrast:f==='sdr'?85:100,brightness:50,color:/vivid/i.test(mode)?60:/^expert/.test(mode)?45:50,tint:0,sharpness:game||movie?0:10,
    colorTemperature:movie||/^expert/.test(mode)?-40:0,colorGamut:'auto',gamma:f==='sdr'?(movie?'bt1886':'high2'):'medium',gammaLevel:0,peakBrightness:'off',hdrDynamicToneMapping:game?'HGIG':'on',
    expressionEnhancer:'off',dynamicContrast:movie?'off':'low',dynamicColor:'off',superResolution:'off',noiseReduction:'off',mpegNoiseReduction:'off',smoothGradation:'low',realCinema:'on',
    truMotionJudder:0,truMotionBlur:10,motionProOLED:'off',filmmakerAmbientLight:'off',dolbyPrecisionDetail:'off',nearBlackDetail:0,blackLevel:{hdmi:'auto'}};
  if(key==='color'&&input==='hdmi2'&&mode==='normal')return 55;
  return values[key];
}
const portValues={gameGenre:'Standard',inputOptimization:'auto',gameOptimization:'on',enableALLM:'on',enableQFT:'off',enable144HzBooster:'off',uhdDeepColor:'on',freesync:'off'};
const gameValue=(key,range,genre)=>({gameAdjustContrast:range.startsWith('sdr')?95:100,gameBlackLevel:50,gameColorDepth:genre==='FPS'?55:50,gameSharpness:0,blackStabilizer:genre==='FPS'?13:10,whiteStabilizer:10,lowLevelAdjustment:0})[key];
// Builds {state, catalog, native}. state.document holds the managed banks only.
function build() {
  const state=structuredClone(require('./profile-formats.cjs'));
  state.document=catalog.upgrade(state.document,state.preferences);
  state.selection='automatic';state.active_profile='dark';state.room='dark';
  state.context={ready:true,input:'hdmi4',mode:'hdrGame',range:'hdrALLM'};
  state.document.banks.find(b=>b.id==='movie_filmMaker').variants={dark:{color:47}};
  const managed=new Map(state.document.banks.map(b=>[canonical(b.target),b])),list=[],native={};let n=0;
  function add(target,settings,name) {
    const existing=managed.get(canonical(target)),id=existing?existing.id:'native_'+(n++);
    list.push({id,name,devices:existing?existing.devices||[]:[],target,settings:Object.fromEntries(Object.keys(settings).concat(existing?Object.keys(existing.settings):[]).map(k=>[k,null]))});
    native[id]={target,settings};
  }
  for(const input of [1,2,3,4].flatMap(i=>['hdmi'+i,'hdmi'+i+'_pc'])) {
    const port=input.replace(/_pc$/,'');
    for(const range of banks.RANGES)add({category:'picture',dimension:{input,dynamicRange:range}},{pictureMode:defaultMapping[range]},input+' '+range+' preset selection');
    for(const mode of Object.values(presets).flat()) {
      add({category:'picture',dimension:{input,pictureMode:mode}},Object.fromEntries(banks.PICTURE.filter(k=>!omitted.has(k)).map(k=>[k,pictureValue(k,mode,input)])),input+' '+mode);
      add({category:'picture',dimension:{input,pictureMode:mode},app_id:'com.webos.app.'+port},{truMotionMode:'off'},input+' '+mode+' motion');
    }
    if(input.endsWith('_pc'))continue;
    add({category:'other',dimension:{gameInput:port}},{...portValues},port+' connection');
    for(const range of banks.RANGES)for(const genre of genres)add({category:'other',dimension:{gameInput:port,dynamicRange:range,gameGenre:genre}},Object.fromEntries(banks.GAME.map(k=>[k,gameValue(k,range,genre)])),port+' '+range+' '+genre);
  }
  return {state,catalog:list,native};
}
// Evaluated in the page after editor-host's setup(): adds catalog discovery,
// native reads and native-only saves around the managed fixture transport.
function install(data) {
  const original=window.requestProfile,numbers={backlight:[0,100],contrast:[0,100],brightness:[0,100],color:[0,100],tint:[-50,50],sharpness:[0,50],colorTemperature:[-50,50],gammaLevel:[-3,3],nearBlackDetail:[0,10],
    truMotionJudder:[0,10],truMotionBlur:[0,10],gameAdjustContrast:[0,100],gameBlackLevel:[0,100],gameColorDepth:[0,100],gameSharpness:[0,50],blackStabilizer:[0,20],whiteStabilizer:[0,20],lowLevelAdjustment:[0,20]};
  const choices={colorGamut:['auto','extended','wide'],gamma:['high2','mediumHavingLevel','bt1886'],peakBrightness:['off','low','medium','high'],hdrDynamicToneMapping:['on','HGIG','off'],expressionEnhancer:['off','detail','highlight'],
    dynamicContrast:['off','low','medium','high'],dynamicColor:['off','low','medium','high'],superResolution:['off','low','medium','high'],noiseReduction:['off','low','medium','high','auto'],mpegNoiseReduction:['off','low','medium','high','auto'],
    smoothGradation:['off','low','medium','high'],realCinema:['off','on'],truMotionMode:['off','cinemaClear','natural','smooth','user'],motionProOLED:['off','on'],filmmakerAmbientLight:['off','on'],dolbyPrecisionDetail:['off','on'],blackLevel:['auto','high','low'],
    gameGenre:['Standard','FPS','RPG','RTS','Sports','USER'],inputOptimization:['auto','on'],gameOptimization:['off','on'],enableALLM:['off','on'],enableQFT:['off','on'],enable144HzBooster:['off','on'],uhdDeepColor:['off','on'],freesync:['off','on']};
  const mapping={sdr:['personalized','vivid','normal','eco','cinema','game','filmMaker','expert1','expert2'],hdr:['hdrPersonalized','hdrVivid','hdrStandard','hdrEco','hdrCinemaBright','hdrGame','hdrFilmMaker'],dolbyHdr:['dolbyHdrPersonalized','dolbyHdrVivid','dolbyHdrStandard','dolbyHdrCinemaBright','dolbyHdrCinema','dolbyHdrGame']};
  window.native=data.native;window.editorApi=9;
  const managed=id=>window.fixture.document.banks.find(b=>b.id===id);
  const values=id=>({...window.native[id].settings,...(managed(id)||{settings:{}}).settings});
  function reason(target,key,settings) {
    const d=target.dimension,mode=d.pictureMode||'',f=mode.startsWith('dolbyHdr')?'dolbyHdr':mode.startsWith('hdr')?'hdr':'sdr',game=/game$/i.test(mode);
    if(!mode)return null;
    if(key==='dolbyPrecisionDetail')return 'This G6’s model configuration disables Dolby Precision Detail.';
    if(['gamma','gammaLevel'].includes(key)&&f!=='sdr')return 'Gamma applies to SDR only.';
    if(key==='gammaLevel'&&settings.gamma!=='mediumHavingLevel')return 'Used only with adjustable 2.2 gamma.';
    if(game&&['contrast','brightness','color','sharpness'].includes(key))return 'Game Optimizer replaces this control in Game presets.';
    if(game&&['realCinema','truMotionMode','truMotionJudder','truMotionBlur','dynamicContrast','noiseReduction','mpegNoiseReduction','smoothGradation'].includes(key))return 'LG disables this in Game presets.';
    if(key==='peakBrightness'&&mode==='game')return 'LG locks Peak brightness in SDR Game.';
    if(['expressionEnhancer','hdrDynamicToneMapping'].includes(key)&&f!=='hdr')return 'HDR10/HLG only.';
    if(['colorGamut','blackLevel'].includes(key)&&f==='dolbyHdr')return 'Dolby Vision controls this.';
    if(['truMotionJudder','truMotionBlur'].includes(key)) {
      const motion=Object.keys(window.native).find(id=>{const t=window.native[id].target;return t.app_id&&t.dimension.input===d.input&&t.dimension.pictureMode===mode;});
      if(!motion||values(motion).truMotionMode!=='user')return 'Requires TruMotion User Selection in this preset.';
    }
    return null;
  }
  function describe(id) {
    const target=window.native[id].target,settings=values(id),controls={},availability={};
    for(const key of Object.keys(settings)) {
      const why=reason(target,key,settings);
      if(why){availability[key]={state:'unavailable',editable:false,reason:why};continue;}
      availability[key]={state:'editable',editable:true,source:'audited'};
      if(numbers[key])controls[key]={component:'number',min:numbers[key][0],max:numbers[key][1],step:1};
      else if(key==='pictureMode')controls[key]={component:'select',options:mapping[target.dimension.dynamicRange.replace(/ALLM$/,'')]};
      else controls[key]={component:'select',options:choices[key]||[String(settings[key])]};
    }
    if(controls.enable144HzBooster)controls.enable144HzBooster.label='165 Hz boost';
    return {id,settings:structuredClone(settings),controls,availability};
  }
  window.requestProfile=async command=>{
    if(command.action==='get') {
      const result=await original(command);result.status.editor_api=window.editorApi;
      result.catalog=data.catalog.map(b=>({...b,devices:(managed(b.id)||b).devices||[],settings:{...b.settings,...Object.fromEntries(Object.keys((managed(b.id)||{settings:{}}).settings).map(k=>[k,null]))}}));
      return result;
    }
    if(command.action==='inspect'||command.action==='inspect_many') {
      window.calls.push(structuredClone(command));
      if(window.delayInspect)await new Promise(resolve=>setTimeout(resolve,100));
      const ids=command.action==='inspect'?[command.bank_id]:command.bank_ids,result=ids.map(describe);
      return command.action==='inspect'?result[0]:{banks:result};
    }
    if(command.action==='edit_many') {
      if(command.revision!==window.fixture.revision)throw new Error('Profiles changed; refresh before saving');
      const nativeEdits=command.edits.filter(e=>!managed(e.bank_id)),rest=command.edits.filter(e=>managed(e.bank_id));
      // Like the bridge, a native-only value must match the reviewed LG value.
      for(const edit of nativeEdits)for(const key of Object.keys(edit.settings))
        if(!edit.expected||String(edit.expected[key])!==String(window.native[edit.bank_id].settings[key]))throw new Error('Native values changed or were not reviewed; refresh before saving');
      // Record the batch as sent; the managed half goes through the base transport.
      window.calls.push(structuredClone(command));const recorded=window.calls.length;
      const reply=rest.length||Object.keys(command.preferences||{}).length?await original({...command,edits:rest}):{revision:window.fixture.revision};
      window.calls.splice(recorded,window.calls.length-recorded);
      for(const edit of nativeEdits) {
        if(edit.variant==='standard')Object.assign(window.native[edit.bank_id].settings,edit.settings);
        else {
          const meta=data.catalog.find(b=>b.id===edit.bank_id);
          window.fixture.document.banks.push({id:edit.bank_id,name:meta.name,devices:meta.devices,target:structuredClone(meta.target),settings:Object.fromEntries(Object.keys(edit.settings).map(k=>[k,window.native[edit.bank_id].settings[k]])),variants:{[edit.variant]:edit.settings}});
          window.fixture.revision++;
        }
      }
      return reply;
    }
    return original(command);
  };
}
async function mountFull(page,options={},mutate) {
  const {mount}=require('./editor-host.cjs'),data=build();
  if(mutate)mutate(data);
  await page.addInitScript(()=>{window.__fullCatalog=true;});
  // Install the catalog transport before the editor's first request.
  await mount(page,data.state,{...options,deferred:true});
  await page.evaluate(install,data);
  await page.evaluate(options=>{const {deferred,...rest}=options;document.querySelector('lg-profile-editor').configure({...rest,request:window.requestProfile});},options);
  return data;
}
module.exports={build,install,mountFull,presets,genres};
