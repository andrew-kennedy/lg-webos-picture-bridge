'use strict';
const banks=[];
function add(id,devices,category,dimension,settings,extra={}) {
  const target={category,dimension};if(extra.app_id)target.app_id=extra.app_id;
  banks.push({id,name:id,devices,target,settings,...(extra.variants?{variants:extra.variants}:{})});
}
for(const [device,input] of [['pc','hdmi1_pc'],['ps5','hdmi4'],['switch','hdmi3']]) {
  const physical=input.replace(/_pc$/,'');
  add(device+'_port',[device],'other',{gameInput:physical},{gameGenre:'Standard',enableQFT:'off',enable144HzBooster:'off'});
  for(const range of ['sdr','hdr']) {
    const mode=range==='sdr'?'game':'hdrGame',contrast=range==='sdr'?95:100;
    add(device+'_'+range,[device],'picture',{input,pictureMode:mode},{color:50,sharpness:0,contrast,brightness:50,backlight:range==='sdr'?80:100});
    add(device+'_'+range+'_motion',[device],'picture',{input,pictureMode:mode},{truMotionMode:'off'},{app_id:'com.webos.app.'+physical});
    for(const signal of device==='switch'?[range+'ALLM']:[range,range+'ALLM']) {
      add(device+'_'+signal+'_game',[device],'other',{gameInput:physical,dynamicRange:signal,gameGenre:'Standard'},
        {gameColorDepth:50,gameSharpness:0,gameAdjustContrast:contrast,gameBlackLevel:50,blackStabilizer:10});
      add(device+'_'+signal+'_mapping',[device],'picture',{input,dynamicRange:signal},{pictureMode:mode});
    }
  }
}
for(const [range,mode] of [['sdr','filmMaker'],['hdr','hdrFilmMaker'],['dolbyHdr','dolbyHdrCinema'],['dolbyHdr','dolbyHdrCinemaBright']]) {
  add('movie_'+mode,['apple','shield'],'picture',{input:'hdmi3',pictureMode:mode},{color:50,backlight:mode==='filmMaker'?3:100});
  add('movie_'+mode+'_motion',['shield','apple'],'picture',{input:'hdmi3',pictureMode:mode},{truMotionMode:'off'},{app_id:'com.webos.app.hdmi3'});
  if(mode!=='dolbyHdrCinemaBright')add('movie_'+range+'_mapping',['apple','shield'],'picture',{input:'hdmi3',dynamicRange:range},{pictureMode:mode},
    range==='dolbyHdr'?{variants:{bright:{pictureMode:'dolbyHdrCinemaBright'},dark:{pictureMode:'dolbyHdrCinema'}}}:{});
}
add('switch_dv_unused_mapping',['switch'],'picture',{input:'hdmi3',dynamicRange:'dolbyHdrALLM'},{pictureMode:'dolbyHdrGame'});
module.exports={schema:1,revision:7,enabled:true,room:'dark',preferences:{game_sdr:80,movie_dark:3,movie_bright:100},overrides:{},document:{schema:1,name:'Profiles',devices:{pc:'PC',ps5:'PlayStation 5',switch:'Nintendo Switch 2',apple:'Apple TV',shield:'NVIDIA Shield'},banks}};
