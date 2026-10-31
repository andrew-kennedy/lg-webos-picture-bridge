'use strict';

// Reviewed G6 rules for saved standards, independent of the currently playing
// input. profile-availability gates these on the exact controller/model before
// using them. Evidence and signal limits: docs/setting-availability.md and the
// linked PC, movie, Switch and PS5 audits. No observations or cache reach flash.
const games = new Set(['hdmi1_pc/game','hdmi1_pc/hdrGame','hdmi3/game','hdmi3/hdrGame','hdmi4/game','hdmi4/hdrGame']);
const movies = new Set(['hdmi3/filmMaker','hdmi3/hdrFilmMaker','hdmi3/dolbyHdrCinema','hdmi3/dolbyHdrCinemaBright']);
const ports = new Set(['hdmi1','hdmi3','hdmi4']);
const processing = new Set(['peakBrightness','dynamicContrast','noiseReduction','mpegNoiseReduction','smoothGradation']);
const blocked = reason => ({editable:false,reason});
const select = (options, condition) => ({editable:true,control:{component:'select',options,choices:options,data_type:'string'},...(condition?{condition}:{})});
const number = (min,max) => ({editable:true,control:{component:'number',min,max,step:1,data_type:'int'}});

function resolve(key,target) {
  const d=target.dimension || {}, dimensions=Object.keys(d).sort().join();
  if(target.category==='other' && dimensions==='gameInput' && !target.app_id && ports.has(d.gameInput)) {
    // These are saved port preferences used by Game Optimizer. A movie's live
    // disabled flag must not prevent configuring the port for its next game.
    if(key==='inputOptimization')return select(['auto','on'],'Used when Game Optimizer is active.');
    if(key==='gameGenre')return select(['Standard','FPS','RPG','RTS','Sports','USER'],'Used when Game Optimizer is active.');
    return null;
  }
  if(target.category!=='picture' || dimensions!=='input,pictureMode')return null;
  const identity=d.input+'/'+d.pictureMode,isGame=games.has(identity),isMovie=movies.has(identity);
  if(!isGame&&!isMovie)return null;
  if(target.app_id) {
    if(target.app_id!=='com.webos.app.'+d.input.replace(/_pc$/,''))return null;
    if(key==='truMotionMode'&&isGame)return blocked('LG does not use TruMotion in this verified Game Optimizer profile.');
    return null;
  }
  const sdr=['game','filmMaker'].includes(d.pictureMode),dolby=d.pictureMode.startsWith('dolbyHdr');
  if(sdr&&key==='gamma')return select(['high2','mediumHavingLevel']);
  // The caller validates the saved/candidate Gamma dependency first.
  if(sdr&&key==='gammaLevel')return number(-3,3);
  if(isGame&&processing.has(key))return blocked('LG does not use this processing control in this verified Game Optimizer profile.');
  if(d.input==='hdmi1_pc'&&['dynamicColor','superResolution','expressionEnhancer'].includes(key))
    return blocked('LG does not use this processing control in the verified PC Game Optimizer profile.');
  if(key==='expressionEnhancer'&&['hdrGame','hdrFilmMaker'].includes(d.pictureMode))
    return select(['off','detail','highlight']);
  if(dolby&&key==='blackLevel')return blocked('LG manages HDMI input range in this verified Dolby Vision profile.');
  if(dolby&&key==='colorGamut')return blocked('LG manages the color gamut in this verified Dolby Vision profile.');
  return null;
}

module.exports={resolve};
