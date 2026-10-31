'use strict';

// Discover storage identities from the model's native declarations. This is
// enrollment, not a picture recipe: existing native values become Base and no
// setting is written. Availability is still checked separately for every edit.
const crypto=require('crypto');
const banks=require('./profile-banks');
const view=require('../../profile-view');
const descriptions=require('./profile-descriptions');
const canonical=value=>JSON.stringify(Object.keys(value).sort().reduce((r,k)=>(r[k]=value[k]&&typeof value[k]==='object'?JSON.parse(canonical(value[k])):value[k],r),{}));
const visible=d=>d&&d.ui&&d.ui.visible===true&&d.ui.active===true;
const choices=d=>visible(d)?(d.values&&d.values.arrayExt||[]).filter(v=>v.visible===true&&v.active===true).map(v=>v.value):[];
const omitted=new Set(['motionEyeCare','aiHdrRemastering','ambientLightCompensation']);

function plan(document,index,inputs) {
  inputs=inputs||[1,2,3,4].flatMap(n=>['hdmi'+n,'hdmi'+n+'_pc']);
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>8||new Set(inputs).size!==inputs.length||inputs.some(v=>!/^hdmi[1-4](_pc)?$/.test(v)))throw new Error('Choose valid native HDMI input identities');
  const result=[],seen=new Set();
  function add(target,keys,name) {
    const identity=canonical(target);if(seen.has(identity))return;seen.add(identity);
    const existing=document.banks.find(b=>canonical(b.target)===identity);
    const missing=keys.filter(k=>!existing||!Object.hasOwn(existing.settings,k)).filter(k=>index.resolve(k,target));
    if(!missing.length)return;
    const port=(target.dimension.input||target.dimension.gameInput).replace(/_pc$/,'');
    const peers=document.banks.filter(b=>(b.target.dimension.input||b.target.dimension.gameInput||'').replace(/_pc$/,'')===port);
    const family=target.dimension.gameGenre?'game':target.dimension.pictureMode?view.presetFamily(target.dimension.pictureMode):null;
    const matching=family?peers.filter(b=>b.target.dimension.gameGenre?family==='game':b.target.dimension.pictureMode&&view.presetFamily(b.target.dimension.pictureMode)===family):peers;
    const devices=[...new Set(matching.flatMap(b=>b.devices||[]))];
    const bank=existing||{id:'native_'+crypto.createHash('sha256').update(identity).digest('hex').slice(0,24),name,devices,target,settings:{}};
    result.push({bank,keys:missing,existing:!!existing});
  }
  for(const input of inputs) {
    const port=input.replace(/_pc$/,''),modes=new Set();
    for(const dynamicRange of banks.RANGES) {
      const target={category:'picture',dimension:{input,dynamicRange}};
      const offered=choices(index.resolve('pictureMode',target)).filter(v=>view.presetsFor(dynamicRange).includes(v));
      if(!offered.length)continue;
      offered.forEach(v=>modes.add(v));
      add(target,['pictureMode'],input+' '+dynamicRange+' preset selection');
    }
    for(const pictureMode of modes) {
      const target={category:'picture',dimension:{input,pictureMode}};
      add(target,banks.PICTURE.filter(k=>!omitted.has(k)),input+' '+view.modes[pictureMode]);
      add({...target,app_id:'com.webos.app.'+port},['truMotionMode'],input+' '+view.modes[pictureMode]+' motion');
    }
    const target={category:'other',dimension:{gameInput:port}};
    add(target,banks.PORT,port+' connection');
    const genres=choices(index.resolve('gameGenre',target)).filter(v=>['Standard','FPS','RPG','RTS','Sports','USER'].includes(v));
    for(const dynamicRange of banks.RANGES)for(const gameGenre of genres)
      add({category:'other',dimension:{gameInput:port,dynamicRange,gameGenre}},banks.GAME,port+' '+dynamicRange+' '+gameGenre+' Game Optimizer');
  }
  return result;
}

async function expand(document,read,guard,options={}) {
  const index=options.index||await descriptions.load(banks.descriptionKeys);
  if(!index.size())throw new Error('The TV did not supply its native preset catalog');
  const candidate=JSON.parse(JSON.stringify(document)),pending=plan(document,index,options.inputs);
  let added=0,settings=0;
  for(let offset=0;offset<pending.length;offset+=8) {
    guard();const chunk=pending.slice(offset,offset+8);
    const result=await read({action:'read',banks:chunk.map(p=>({id:p.bank.id,target:p.bank.target,keys:p.keys}))});
    guard();
    for(const item of chunk) {
      const values=result.banks.find(b=>b.id===item.bank.id);
      if(!values||item.keys.some(k=>values.settings[k]===undefined))throw new Error('Incomplete native catalog read');
      let bank=candidate.banks.find(b=>b.id===item.bank.id);
      if(!bank){bank=JSON.parse(JSON.stringify(item.bank));candidate.banks.push(bank);added++;}
      for(const key of item.keys){bank.settings[key]=values.settings[key];settings++;}
    }
  }
  return {document:candidate,added_banks:added,added_settings:settings};
}
module.exports={plan,expand};
