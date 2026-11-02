'use strict';

// The browser catalog describes storage, not ownership. Enumerating it never
// reads values, enrolls standards or writes LG settings.
const crypto=require('crypto');
const banks=require('./profile-banks');
const view=require('../../profile-view');
const descriptions=require('./profile-descriptions');
const canonical=value=>JSON.stringify(Object.keys(value).sort().reduce((r,k)=>(r[k]=value[k]&&typeof value[k]==='object'?JSON.parse(canonical(value[k])):value[k],r),{}));
const visible=d=>d&&d.ui&&d.ui.visible===true&&d.ui.active===true;
const choices=d=>visible(d)?(d.values&&d.values.arrayExt||[]).filter(v=>v.visible===true&&v.active===true).map(v=>v.value):[];
const omitted=new Set(['motionEyeCare','aiHdrRemastering','ambientLightCompensation']);
// LG ships two OLED Motion controls and enables one per model through the
// motionProMode condition: the G6 (oled_motion) uses on/off motionPro, while
// oled_motion_pro models use the leveled motionProOLED. List only the one this
// TV's factory table enables, so the editor never shows a permanently hidden twin.
const variants=new Set(['motionPro','motionProOLED']);
const offered=(index,key,target)=>!variants.has(key)||visible(index.resolve(key,target));
const portOf=target=>{const d=target.dimension||{};return String(d.input||d.gameInput||String(d.audioInput||'').replace(/_game$/,'')).replace(/_pc$/,'');};

// unsupported: keys this TV model never uses (see availability.unsupported).
function plan(document,index,inputs,all=false,unsupported=[]) {
  const skip=new Set([...omitted,...unsupported]);
  // "default" is LG's input for the Home Screen and webOS apps (TV apps).
  inputs=inputs||[1,2,3,4].flatMap(n=>['hdmi'+n,'hdmi'+n+'_pc']).concat('default');
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>9||new Set(inputs).size!==inputs.length||inputs.some(v=>!/^(hdmi[1-4](_pc)?|default)$/.test(v)))throw new Error('Choose valid native HDMI or TV app input identities');
  const result=[],seen=new Set();
  function add(target,keys,name) {
    const identity=canonical(target);if(seen.has(identity))return;seen.add(identity);
    const existing=document.banks.find(b=>canonical(b.target)===identity);
    const missing=keys.filter(k=>all||!existing||!Object.hasOwn(existing.settings,k)).filter(k=>index.resolve(k,target));
    if(!missing.length)return;
    const port=portOf(target),gameOnly=t=>!!t.dimension.gameGenre||t.category==='sound';
    const peers=document.banks.filter(b=>portOf(b.target)===port);
    const family=gameOnly(target)?'game':target.dimension.pictureMode?view.presetFamily(target.dimension.pictureMode):null;
    const matching=family?peers.filter(b=>gameOnly(b.target)?family==='game':b.target.dimension.pictureMode&&view.presetFamily(b.target.dimension.pictureMode)===family):peers;
    const devices=[...new Set(matching.flatMap(b=>b.devices||[]))];
    const bank=existing||{id:'native_'+crypto.createHash('sha256').update(identity).digest('hex').slice(0,24),name,devices,target,settings:{}};
    result.push({bank,keys:missing,existing:!!existing});
  }
  for(const input of inputs) {
    const port=input.replace(/_pc$/,''),modes=new Set(),apps=input==='default',label=apps?'TV apps':input;
    for(const dynamicRange of banks.RANGES) {
      const target={category:'picture',dimension:{input,dynamicRange}};
      const offered=choices(index.resolve('pictureMode',target)).filter(v=>view.presetsFor(dynamicRange).includes(v));
      if(!offered.length)continue;
      offered.forEach(v=>modes.add(v));
      add(target,['pictureMode'],label+' '+dynamicRange+' preset selection');
    }
    for(const pictureMode of modes) {
      const target={category:'picture',dimension:{input,pictureMode}};
      add(target,banks.PICTURE.filter(k=>!skip.has(k)&&offered(index,k,target)),label+' '+view.modes[pictureMode]);
      // TV apps store TruMotion per app, and have no Game Optimizer or HDMI port banks.
      if(!apps)add({...target,app_id:'com.webos.app.'+port},['truMotionMode'],input+' '+view.modes[pictureMode]+' motion');
    }
    if(apps)continue;
    // Game Optimizer's AI Sound Pro, on the port's Game Optimizer audio input.
    add({category:'sound',dimension:{audioInput:port+'_game'}},banks.SOUND,port+' Game Optimizer sound');
    const target={category:'other',dimension:{gameInput:port}};
    // LG's game genres (Standard, FPS, RPG, RTS, Sports, User) are six saved
    // copies of the same seven Game Optimizer values; only their factory
    // starting values differ. Profiles already choose values per device, so
    // the catalog lists the Standard genre and leaves the genre selector out.
    add(target,banks.PORT.filter(k=>k!=='gameGenre'),port+' connection');
    const genres=choices(index.resolve('gameGenre',target)).filter(v=>v==='Standard');
    for(const dynamicRange of banks.RANGES)for(const gameGenre of genres)
      add({category:'other',dimension:{gameInput:port,dynamicRange,gameGenre}},banks.GAME,port+' '+dynamicRange+' '+gameGenre+' Game Optimizer');
  }
  return result;
}

async function discover(document,options={}) {
  const index=options.index||await descriptions.load(banks.descriptionKeys);
  if(!index.size())throw new Error('The TV did not supply its native preset catalog');
  return plan(document,index,options.inputs,true,options.unsupported).map(({bank,keys})=>({id:bank.id,name:bank.name,devices:bank.devices||[],target:bank.target,settings:Object.fromEntries(keys.map(k=>[k,null]))}));
}
module.exports={plan,discover};
