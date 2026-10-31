'use strict';
const assert=require('node:assert/strict');
const banks=require('../app/bridge/lib/profile-banks');
const availability=require('../app/bridge/lib/profile-availability');
const factories=require('../app/bridge/lib/profile-descriptions');
module.exports=async function(){
  const target={category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}};
  const factory={key:'truMotionBlur',category:'picture',dbtype:'G',dimension:['input','pictureMode'],dataType:'string',vtype:'Range',values:{range:{min:0,max:10,interval:1}},ui:{visible:true,active:true}};
  const live={...factory,dbtype:'M',dataType:'',ui:{visible:false,active:false}};
  const bank={id:'movie',target};
  assert.equal(banks.encodingDescription('truMotionBlur',bank,live,factory,true),factory);
  assert.equal(banks.encodingDescription('truMotionBlur',bank,live,factory,false),live,'Unknown firmware retains strict scope validation');
  assert.equal(banks.encodingDescription('truMotionBlur',{target:{...target,dimension:{input:'hdmi4',pictureMode:'game'}}},live,factory,true),live,'No fallback for unreviewed profiles');
  assert.throws(()=>banks.encode('truMotionBlur',9,'10',live,bank),/app scope/);
  const load=factories.load,platform=availability.reviewedPlatform,writes=[];let value='10';
  try {
    factories.load=async()=>({resolve:(key,t)=>key==='truMotionBlur'&&JSON.stringify(t)===JSON.stringify(target)?factory:null});
    availability.reviewedPlatform=()=>({reviewed:true});
    const service={call(uri,params,cb){
      let response={returnValue:true};
      if(uri.endsWith('getSystemSettings'))response={...response,dimension:params.dimension,settings:{truMotionBlur:value}};
      else if(uri.endsWith('getSystemSettingDesc'))response.results=[live];
      else {writes.push(params);value=params.settings.truMotionBlur;}
      cb({payload:response});return {cancel(){}};
    }};
    const command=banks.normalize({action:'apply',banks:[{...bank,settings:{truMotionBlur:9},expected:{truMotionBlur:'10'}}]});
    const result=await banks.run(service,command,()=>{},()=>({input:'hdmi4',mode:'hdrGame',range:'hdrALLM',ready:true}));
    assert.equal(result.banks[0].settings.truMotionBlur,'9');
    assert.equal(writes.length,1);assert.deepEqual(writes[0].dimension,target.dimension);assert.equal(writes[0].app_id,undefined,'Never retarget movie values to the active HDMI app');
    await assert.rejects(banks.run(service,banks.normalize({action:'apply',banks:[{...bank,settings:{truMotionBlur:11},expected:{truMotionBlur:'9'}}]}),()=>{}),/outside/);
    assert.equal(writes.length,1,'The target native range is still enforced');
  } finally {factories.load=load;availability.reviewedPlatform=platform;}
};
