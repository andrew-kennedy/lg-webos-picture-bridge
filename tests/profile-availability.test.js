'use strict';
const assert = require('node:assert/strict');
const availability = require('../app/bridge/lib/profile-availability');
const native = require('../app/bridge/lib/profile-descriptions');
const {Readable} = require('node:stream');
module.exports = async function () {
  const base = {category:'picture',key:'gamma',dimension:['input','pictureMode'],dbtype:'G',dataType:'string',vtype:'ArrayExt',
    ui:{visible:true,active:true},values:{arrayExt:['medium','high2','mediumHavingLevel'].map(value=>({value,visible:true,active:true}))}};
  const index=native.create({panelType:'OLED',boardTypeStr:'_O26_'},new Set(['gamma']));
  index.accept(base,false);
  index.accept({key:'gamma@picture$hdmi3.hdrGame.x',ui:{active:false}},true);
  index.accept({key:'gamma@picture$hdmi3.hdrGame.x',condition:{boardTypeStr:'_O22_',panelType:'OLED'},ui:{active:true}},true);
  const target={category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrGame'}};
  assert.equal(index.resolve('gamma',target).ui.active,false,'A different board cannot enable an HDR gamma control');
  assert.equal(index.resolve('gamma',{...target,dimension:{input:'hdmi3',pictureMode:'filmMaker'}}).ui.active,true);
  assert.equal(index.resolve('gamma',{...target,app_id:'com.webos.app.hdmi3'}),null,'Factory metadata must match app ownership');
  const source=JSON.stringify([base,{key:'escaped',text:'a } " \\ end',nested:{a:[1,{b:true}]}}]),parsed=[];
  await native.readArray('unused',v=>parsed.push(v),Readable.from(Array.from(source)));
  assert.deepEqual(parsed,JSON.parse(source),'Streaming handles every possible chunk boundary, nested records and escaped delimiters');
  await assert.rejects(native.readArray('unused',()=>{},Readable.from(['[{"key":"bad"'])),/Incomplete/);
  assert.deepEqual(native.merge({arrayExt:[{value:'a',visible:true,active:true},{value:'b',visible:true,active:true}]},
    {arrayExt:[{value:'a',visible:false}]}).arrayExt,[{value:'a',visible:false,active:true},{value:'b',visible:true,active:true}]);

  function check(key,mode,value,patch={}) {
    const bank={id:'bank',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:mode}},settings:{[key]:value,...patch.settings}};
    const description={...base,key,...patch.description};
    const options={reviewed:true,document:{banks:[bank]},values:b=>b.settings,context:{ready:true,input:'hdmi4',mode:'game',range:'sdr'},...patch.options};
    return availability.describe(key,bank,{factory:description,value,live:description,...patch.info},options);
  }
  assert.equal(check('gamma','hdrGame','medium').editable,false);
  assert.equal(check('gamma','dolbyHdrCinema','medium').editable,false);
  assert.equal(check('gamma','filmMaker','medium').state,'unverified','Inactive SDR Gamma cannot inherit stale factory choices');
  assert.equal(check('backlight','filmMaker','medium').editable,true,'Other inactive valid SDR controls must not inherit the active HDR lock');
  assert.equal(check('gammaLevel','filmMaker',0,{settings:{gamma:'mediumHavingLevel'}}).state,'unverified','A saved adjustable Gamma value does not establish that the inactive profile offers it');
  assert.equal(check('gammaLevel','filmMaker','medium',{settings:{gamma:'high2'}}).editable,false);
  assert.equal(check('gamma','filmMaker','medium',{options:{reviewed:false}}).state,'unverified');
  for (const key of ['contrast','brightness','sharpness','color']) assert.equal(check(key,'hdrGame','medium').state,'unavailable');
  assert.equal(check('realCinema','game','medium').editable,false);
  assert.equal(check('peakBrightness','game','medium').editable,false);
  assert.equal(check('dolbyPrecisionDetail','dolbyHdrCinemaBright','medium').state,'unverified','Saving a Precision Detail value cannot prove support');
  for (const preset of ['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrStandard','dolbyHdrVivid','dolbyHdrGame','dolbyHdrPersonalized'])
    assert.equal(check('dolbyPrecisionDetail',preset,'medium',{options:{capabilities:{dolbyPrecisionDetail:false}}}).state,'unavailable','An explicit model capability denial applies in every preset');
  assert.equal(check('dolbyPrecisionDetail','dolbyHdrCinemaBright','medium',{options:{capabilities:{dolbyPrecisionDetail:true}}}).state,'unverified','Hardware support alone cannot prove support in an inactive preset');
  const blackLevel={...base,key:'blackLevel',dataType:'object',values:{arrayExt:['auto','low','high'].map(value=>({value,visible:true,active:true}))}};
  for (const mode of ['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame']) {
    const bank={id:'dv',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:mode}},settings:{blackLevel:{unknown:'auto'}}};
    const inspection={settings:bank.settings,factory_descriptions:{blackLevel}};
    const options={reviewed:true,document:{banks:[bank]},values:b=>b.settings};
    assert.equal(availability.describe('blackLevel',bank,{factory:blackLevel,value:bank.settings.blackLevel},options).state,'unverified','Factory metadata cannot establish an inactive Dolby Vision HDMI range control');
    assert.throws(()=>availability.assertEditable('blackLevel',{unknown:'high'},bank,inspection,options),/activate this profile/,'Saving and combined edits must reject unverified Dolby Vision HDMI range changes');
    const context={ready:true,input:'hdmi3',mode,range:'dolbyHdr'};
    const current={dimension:bank.target.dimension,settings:bank.settings};
    assert.equal(availability.describe('blackLevel',bank,{factory:blackLevel,live:{...blackLevel,ui:{visible:true,active:false}},current,value:bank.settings.blackLevel},{...options,context}).state,'unavailable','The active Dolby Vision controller lock overrides permissive factory metadata');
    assert.equal(availability.describe('blackLevel',bank,{factory:blackLevel,live:blackLevel,current,value:bank.settings.blackLevel},{...options,context}).editable,true,'The inactive-profile guard does not invent a model-wide ban if a future live context permits the control');
  }
  for (const mode of ['filmMaker','hdrFilmMaker','game','hdrGame'])
    assert.equal(check('blackLevel',mode,{unknown:'auto'},{description:blackLevel}).editable,true,'Verified non-Dolby factory HDMI range controls remain available');
  for (const key of ['peakBrightness','dynamicContrast','noiseReduction','mpegNoiseReduction','smoothGradation','truMotionMode']) {
    const description={...base,key,values:{arrayExt:['off','on'].map(value=>({value,visible:true,active:true}))}};
    for (const mode of key==='peakBrightness'?['hdrGame','dolbyHdrGame']:['game','hdrGame','dolbyHdrGame']) {
      const target={category:'picture',dimension:{input:'hdmi3',pictureMode:mode}};
      if(key==='truMotionMode')target.app_id='com.webos.app.hdmi3';
      const bank={id:'processing',target,settings:{[key]:'off'}};
      const options={reviewed:true,document:{banks:[bank]},values:b=>b.settings};
      const inspection={settings:bank.settings,factory_descriptions:{[key]:description}};
      assert.equal(availability.describe(key,bank,{factory:description,value:'off'},options).state,'unverified','Inactive Game processing must not use permissive factory choices');
      assert.throws(()=>availability.assertEditable(key,'on',bank,inspection,options),/activate this profile/,'Single and combined edits must reject unverified Game processing');
      const current={dimension:target.dimension,settings:bank.settings,...(target.app_id?{app_id:target.app_id}:{})};
      const context={ready:true,input:'hdmi3',mode,range:mode==='game'?'sdrALLM':mode==='hdrGame'?'hdrALLM':'dolbyHdrALLM'};
      const liveOptions={...options,context};
      const info={factory:description,live:{...description,ui:{visible:true,active:false}},current,value:'off'};
      assert.equal(availability.describe(key,bank,info,liveOptions).state,'unavailable','Live Game processing locks remain authoritative');
      info.live=description;
      assert.equal(availability.describe(key,bank,info,liveOptions).editable,true,'A verified live context may enable processing; the guard is not a permanent Game-mode ban');
      if(target.app_id) {
        info.current={...current,app_id:'com.webos.app.hdmi1'};
        assert.equal(availability.describe(key,bank,info,liveOptions).state,'unverified','TruMotion requires the matching HDMI application as well as the preset');
      }
    }
    for(const mode of ['filmMaker','hdrFilmMaker','dolbyHdrCinema','dolbyHdrCinemaBright'])
      assert.equal(check(key,mode,'off',{description}).editable,true,'The Game-specific guard preserves reviewed inactive movie controls');
  }
  const port={id:'port',target:{category:'other',dimension:{gameInput:'hdmi1'}},settings:{inputOptimization:'auto'}};
  const portDescription={...base,key:'inputOptimization',dimension:['gameInput'],values:{arrayExt:[{value:'auto',visible:true,active:true},{value:'on',visible:true,active:true}]}};
  assert.equal(availability.describe('inputOptimization',port,{factory:portDescription,value:'auto'},{reviewed:true,values:b=>b.settings,context:{ready:false}}).state,'unverified','The hidden factory baseline cannot establish a port runtime gaming control');
  const active={dimension:{input:'hdmi3',pictureMode:'filmMaker'}};
  const ctx={ready:true,input:'hdmi3',mode:'filmMaker',range:'sdr'};
  assert.equal(check('gamma','filmMaker','medium',{info:{current:active,live:{...base,ui:{active:false,visible:true}}},options:{context:ctx}}).editable,false,'A live native lock takes precedence over factory rules');
  assert.equal(check('gamma','filmMaker','medium',{info:{current:{...active,settings:{brightnessActive:false}}},options:{context:ctx}}).editable,false,'LG settings-group locks apply even when the individual description is enabled');
  assert.equal(check('gamma','filmMaker','medium',{info:{current:{...active,settings:{isfMode:{filmMaker:'locked'}}}},options:{context:ctx}}).editable,false,'The editor cannot bypass the native calibration lock');
  assert.equal(check('gamma','filmMaker','medium',{info:{current:{...active,settings:{isfMode:{filmMaker:'locked'}}}}}).editable,false,'A preset calibration lock also protects that inactive preset');
  assert.equal(check('gamma','filmMaker','medium',{info:{current:active},options:{context:{...ctx,ready:false}}}).state,'unverified','A stale or absent signal cannot supply Gamma choices');
  const currentGamma={...base,values:{arrayExt:['low','medium','high1','high2','mediumHavingLevel'].map(value=>({value,active:true,visible:['high2','mediumHavingLevel'].includes(value)}))}};
  const confirmedGamma=check('gamma','filmMaker','mediumHavingLevel',{info:{current:active,live:currentGamma},options:{context:ctx}});
  assert.deepEqual(confirmedGamma.control.options,['high2','mediumHavingLevel'],'Active Gamma exposes only the choices actually offered by the G6');
  const gammaBank={id:'sdr_movie',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}},settings:{gamma:'mediumHavingLevel'}};
  assert.throws(()=>availability.assertEditable('gamma','medium',gammaBank,{settings:gammaBank.settings,factory_descriptions:{gamma:base}},
    {reviewed:true,document:{banks:[gammaBank]},values:b=>b.settings}),/activate this SDR profile/,'The save path also rejects unverified factory Gamma choices');
  assert.equal(availability.matchesActive({category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'game'}},
    {ready:true,input:'hdmi1',mode:'game',range:'sdr'},{dimension:{input:'hdmi1_pc',pictureMode:'game'}}),false,'PC and ordinary HDMI are distinct native inputs');
  assert.equal(availability.matchesActive({category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'},app_id:'com.webos.app.hdmi3'},
    ctx,{...active,app_id:'com.webos.app.hdmi1'}),false,'An unrelated HDMI app cannot supply live motion metadata');
  const hdrOptions={...base,values:{arrayExt:['on','off','HGIG'].map(value=>({value,visible:true,active:true}))}};
  assert.deepEqual(check('hdrDynamicToneMapping','hdrFilmMaker','off',{description:hdrOptions}).control.options,['on','off']);
  assert.equal(check('hdrDynamicToneMapping','hdrFilmMaker','HGIG',{description:hdrOptions}).editable,true,'An invalid historical value must be correctable');
  assert.deepEqual(check('hdrDynamicToneMapping','hdrGame','off',{description:hdrOptions}).control.options,['on','off','HGIG']);
  const bank={id:'hdr_movie',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'hdrFilmMaker'}},settings:{hdrDynamicToneMapping:'HGIG'}};
  const inspection={settings:bank.settings,factory_descriptions:{hdrDynamicToneMapping:{...hdrOptions,key:'hdrDynamicToneMapping'}}};
  const options={reviewed:true,document:{banks:[bank]},values:b=>b.settings};
  assert.equal(availability.assertEditable('hdrDynamicToneMapping','off',bank,inspection,options),'off');
  assert.throws(()=>availability.assertEditable('hdrDynamicToneMapping','HGIG',bank,inspection,options),/unavailable/,'Correcting a historical value does not permit saving it again');
  let requests=0;
  const service={call(uri,params,callback){
    requests++;assert.equal(uri,'luna://com.webos.service.config/getConfigs');
    assert.deepEqual(params,{configNames:['tv.model.dolbyVisionPrecisionDetail']});
    callback({payload:{returnValue:true,configs:{'tv.model.dolbyVisionPrecisionDetail':false}}});
  }};
  assert.deepEqual(await availability.loadCapabilities(service),{dolbyPrecisionDetail:false});
  await availability.loadCapabilities(service);assert.equal(requests,1,'Model capabilities are read once on demand, without polling');
  assert.deepEqual(await availability.loadCapabilities({call(uri,params,callback){callback({payload:{returnValue:false}});}}),{},'A failed capability read is unknown, not a model-level denial');
};
