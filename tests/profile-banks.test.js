'use strict';
var assert = require('assert');
var banks = require('../app/bridge/lib/profile-banks');
module.exports = async function () {
  var target = {category:'other',dimension:{gameInput:'hdmi1',dynamicRange:'hdrALLM',gameGenre:'Standard'}};
  var values = {gameColorDepth:55,gameSharpness:10}, writes = [], wrongScope = false, ignoreWrite = false;
  var service = {call:function (uri,params,callback) {
    var response;
    if (uri.endsWith('getSystemSettingDesc')) {
      assert.deepStrictEqual(Object.keys(params).sort(),['category','keys'],'G6 descriptions reject saved-value dimensions');
      response = {returnValue:true,results:params.keys.map(function (key) {
      return {key:key,dimension:Object.keys(target.dimension),dbtype:'G',dataType:'int',vtype:'Range',
        ui:{visible:false,active:false},values:{range:{min:0,max:key==='gameSharpness'?50:100,interval:1}}};
    })}; }
    else if (uri.endsWith('getSystemSettings')) response = {returnValue:true,
      dimension:wrongScope?{gameInput:'hdmi3'}:params.dimension,
      settings:Object.fromEntries(params.keys.map(function(k){return [k,values[k]];}))};
    else {
      writes.push(params);
      if (!ignoreWrite) Object.assign(values,params.settings);
      response = {returnValue:true};
    }
    callback({payload:response});return {cancel:function(){}};
  }};
  function command(action,extra) {return banks.normalize({action:action,banks:[Object.assign({id:'pc_hdr',target:target},extra)]});}
  var read = await banks.run(service,command('read',{keys:['gameColorDepth','gameSharpness']}),function(){});
  assert.deepStrictEqual(read.banks[0].settings,values);
  var apply = command('apply',{settings:{gameColorDepth:50,gameSharpness:0},expected:{gameColorDepth:55,gameSharpness:10}});
  var result = await banks.run(service,apply,function(){},function(){return {input:'hdmi3',mode:'dolbyHdrCinema',range:'dolbyHdr',ready:true};});
  assert.deepStrictEqual(result.banks[0].changed,['gameColorDepth','gameSharpness']);
  assert.deepStrictEqual(writes[0].dimension,target.dimension);
  assert.strictEqual(writes[0].store,true);
  assert.strictEqual(writes[0].valueCheck,false,'Explicit validated banks must not use the active signal visibility filter');
  await banks.run(service,apply,function(){});
  assert.strictEqual(writes.length,1,'Already-correct values never cause flash writes');
  values.gameSharpness=5;
  await assert.rejects(banks.run(service,apply,function(){}),/changed since/);
  assert.strictEqual(writes.length,1,'A stale expected value cannot overwrite a newer edit');
  var tooHigh=command('apply',{settings:{gameSharpness:51},expected:{gameSharpness:5}});
  await assert.rejects(banks.run(service,tooHigh,function(){}),/outside/);
  wrongScope=true;
  await assert.rejects(banks.run(service,command('read',{keys:['gameSharpness']}),function(){}),/different/);
  wrongScope=false;ignoreWrite=true;
  await assert.rejects(banks.run(service,command('apply',{settings:{gameSharpness:0},expected:{gameSharpness:5}}),function(){}),/readback/);
  assert.throws(function(){command('read',{keys:['factoryReset']});},/Unreviewed/);
  assert.throws(function(){banks.normalize({action:'apply',banks:[{id:'x',target:target,settings:{gameSharpness:0}}]});},/expected/);
  assert.throws(function(){banks.target({category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'game'},app_id:'com.webos.app.hdmi3'});},/app/);
  assert.throws(function(){banks.target({category:'other',dimension:{gameInput:'hdmi1_pc'}});});
  var pictureTarget = {category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}};
  assert(banks.target(pictureTarget).allowed.includes('truMotionJudder'));
  assert(banks.target(pictureTarget).allowed.includes('truMotionBlur'));
  assert(!banks.target(pictureTarget).allowed.includes('truMotionMode'));
  assert.deepStrictEqual(banks.target({...pictureTarget,app_id:'com.webos.app.hdmi3'}).allowed,['truMotionMode'],'Only the M database setting is scoped to the HDMI app');
  assert.throws(function(){banks.normalize({action:'read',banks:Array(9).fill({id:'x',target:target,keys:['gameSharpness']})});});
  assert.throws(function(){banks.normalize({action:'read',banks:[{id:'constructor',target:target,keys:['gameSharpness']}]});});
  await assert.rejects(banks.run(service,command('read',{keys:['gameSharpness']}),function(){throw Error('expired');}),/expired/);

  var mapping = {category:'picture',dimension:{input:'hdmi3',dynamicRange:'dolbyHdr'}};
  var selected = 'dolbyHdrCinema', mappingWrites = [];
  var onHome = {call:function (uri,params,callback) {
    var response;
    if(uri.endsWith('getSystemSettings')) response={returnValue:true,dimension:params.dimension,settings:{pictureMode:selected}};
    else if(uri.endsWith('getSystemSettingDesc')) response={returnValue:true,results:[{key:'pictureMode',dimension:['input','dynamicRange'],dbtype:'G',dataType:'',vtype:'ArrayExt',values:{arrayExt:[
      {value:'filmMaker',visible:true,active:true},{value:'dolbyHdrCinemaBright',visible:false,active:true}]} }]};
    else if(params.valueCheck!==false) response={returnValue:false,errorText:'There is No matched extended item: pictureMode'};
    else {mappingWrites.push(params);selected=params.settings.pictureMode;response={returnValue:true};}
    callback({payload:response});return {cancel:function(){}};
  }};
  var dvCommand = banks.normalize({action:'apply',banks:[{id:'dv',target:mapping,settings:{pictureMode:'dolbyHdrCinemaBright'},expected:{pictureMode:'dolbyHdrCinema'}}]});
  var saved = await banks.run(onHome,dvCommand,function(){},function(){return {input:'default',range:'sdr',mode:'filmMaker',ready:false};});
  assert.equal(saved.banks[0].settings.pictureMode,'dolbyHdrCinemaBright');
  assert.equal(mappingWrites.length,1,'Saving an inactive DV bank must not activate it');
  assert.deepStrictEqual(mappingWrites[0].dimension,mapping.dimension);
  var invalidFamily = banks.normalize({action:'apply',banks:[{id:'dv',target:mapping,settings:{pictureMode:'hdrGame'},expected:{pictureMode:'dolbyHdrCinemaBright'}}]});
  await assert.rejects(banks.run(onHome,invalidFamily,function(){}),/does not match range/);
  assert.equal(mappingWrites.length,1,'Skipping native visibility checks cannot admit an invalid preset family');

  const motionBank={id:'movie_motion',target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'dolbyHdrCinemaBright'},app_id:'com.webos.app.hdmi3'},settings:{truMotionMode:'off'}};
  const motionService={call(uri,params,callback){
    let response={returnValue:true};
    if(uri.endsWith('getSystemSettingDesc')){
      assert.equal(params.app_id,motionBank.target.app_id,'Motion descriptions must use the target HDMI app, as LG Settings does');
      response.results=[{key:'truMotionMode',dbtype:'M',dimension:['input','pictureMode'],dataType:'string',vtype:'ArrayExt',ui:{visible:true,active:true},values:{arrayExt:[{value:'off',visible:true,active:true}]}}];
    }
    else if(uri.endsWith('getConfigs'))response.configs={'tv.model.dolbyVisionPrecisionDetail':false};
    else if(params.dimension || params.current_app){
      assert.deepStrictEqual(params.keys,['truMotionMode'],'An app-scoped query must not mix in global settings');
      Object.assign(response,{app_id:motionBank.target.app_id,dimension:motionBank.target.dimension,settings:{truMotionMode:'off'}});
    } else Object.assign(response,{dimension:{input:'hdmi3'},settings:{clarityActive:true,isfMode:{dolbyHdrCinemaBright:'day'}}});
    callback({payload:response});return {cancel(){}};
  }};
  const motion=await banks.inspect(motionService,motionBank,()=>{},()=>({ready:true,input:'hdmi3',mode:'dolbyHdrCinemaBright',range:'dolbyHdr'}),{reviewed:true,document:{banks:[motionBank]},values:b=>b.settings});
  assert.deepStrictEqual(motion.active_values.dimension,motionBank.target.dimension,'Global lock reads must preserve the app value binding');
  assert.equal(motion.availability.truMotionMode.editable,false);
  assert.match(motion.availability.truMotionMode.reason,/calibration/,'App-scoped controls still respect the preset calibration lock');
};
