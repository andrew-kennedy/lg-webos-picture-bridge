'use strict';
module.exports={schema:1,owner_id:'owner',instance_id:'instance',sequence:1,revision:7,enabled:true,room:'dark',preferences:{movie_bright:100,movie_dark:3,game_sdr:80},overrides:{movie:{color:55}},document:{schema:1,name:'Living room G6',devices:{apple:'Apple TV',shield:'NVIDIA Shield',switch:'Nintendo Switch 2'},banks:[
  {id:'movie',name:'HDMI 3 · SDR Filmmaker',devices:['apple','shield'],target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}},settings:{backlight:3,color:50,sharpness:0,colorTemperature:-40,contrast:85,brightness:50,colorGamut:'auto',peakBrightness:'off',gamma:'bt1886'},brightness_role:'movie_sdr'},
  {id:'movie_motion',name:'HDMI 3 · SDR Filmmaker motion',devices:['shield','apple'],target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'},app_id:'com.webos.app.hdmi3'},settings:{truMotionMode:'off'}},
  {id:'game',name:'HDMI 3 · HDR Game Optimizer',devices:['switch'],target:{category:'other',dimension:{gameInput:'hdmi3',dynamicRange:'hdrALLM',gameGenre:'Standard'}},settings:{gameColorDepth:50,gameSharpness:0}}
]}};
