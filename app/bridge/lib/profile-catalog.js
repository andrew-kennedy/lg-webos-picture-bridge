'use strict';

// Named profiles are partial overlays on the same native bank identities.
// Selection belongs to the session journal, never to the standard revision.
const view = require('../../profile-view');
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const roles = ['game_sdr','movie_sdr'];
function ids(doc) { return doc.schema===2 ? doc.profiles.map(p=>p.id) : ['bright','dark']; }
function valid(doc,id) { return id==='standard'||ids(doc).includes(id); }
function profile(doc,id) {
  if(id==='standard')return doc;
  const found=doc.profiles.find(p=>p.id===id);
  if(!found)throw new Error('Unknown profile');return found;
}
function validate(doc) {
  const brightness=(value,complete=false)=>{
    if(!plain(value)||Object.keys(value).some(k=>!roles.includes(k))||
       complete&&roles.some(k=>!Object.hasOwn(value,k))||
       Object.values(value).some(v=>!Number.isInteger(v)||v<0||v>100))throw new Error('Invalid shared profile brightness');
  };
  brightness(doc.brightness,true);
  if(!Array.isArray(doc.profiles)||doc.profiles.length>32)throw new Error('Expected up to 32 named profiles');
  const seen=new Set(),names=new Set(['automatic','base standard']);
  for(const p of doc.profiles) {
    if(!plain(p)||Object.keys(p).some(k=>!['id','name','brightness'].includes(k))||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(p.id||'')||['constructor','prototype','__proto__','standard','automatic'].includes(p.id)||seen.has(p.id))throw new Error('Profile IDs must be unique');
    if(typeof p.name!=='string'||!p.name.trim()||p.name!==p.name.trim()||p.name.length>64||/[\x00-\x1f\x7f]/.test(p.name)||names.has(p.name.toLowerCase()))throw new Error('Choose a unique profile name (1–64 characters)');
    brightness(p.brightness||{});seen.add(p.id);names.add(p.name.toLowerCase());
  }
  if(!plain(doc.automatic)||Object.keys(doc.automatic).length!==2||['bright','dark'].some(k=>!valid(doc,doc.automatic[k])))throw new Error('Choose profiles for both automatic room conditions');
}
function upgrade(document,preferences) {
  if(document.schema===2)return clone(document);
  const doc=clone(document);
  doc.schema=2;doc.brightness={game_sdr:preferences.game_sdr,movie_sdr:preferences.movie_dark};
  doc.profiles=[{id:'bright',name:'Bright room',brightness:{movie_sdr:preferences.movie_bright}},
    {id:'dark',name:'Dark room',brightness:{movie_sdr:preferences.movie_dark}}];
  doc.automatic={bright:'bright',dark:'dark'};
  return doc;
}
function preferences(doc) {
  return {game_sdr:doc.brightness.game_sdr,movie_bright:view.brightness(doc,doc.automatic.bright).movie_sdr,
    movie_dark:view.brightness(doc,doc.automatic.dark).movie_sdr};
}
function legacyPatch(doc,patch) {
  const seen={};
  for(const [key,value] of Object.entries(patch)) {
    const id=key==='game_sdr'?'standard':doc.automatic[key.slice(6)],role=key==='game_sdr'?'game_sdr':'movie_sdr',identity=id+'/'+role;
    if(Object.hasOwn(seen,identity)&&seen[identity]!==value)throw new Error('Automatic room bindings share one profile; use the same brightness');
    seen[identity]=value;setBrightness(doc,id,role,value);
  }
}
function setBrightness(doc,id,role,value) {
  const p=profile(doc,id);p.brightness=p.brightness||{};
  p.brightness[role]=Number(value);
}
function edit(doc,bank,id,key,value,reset=false) {
  if(!valid(doc,id))throw new Error('Unknown profile');
  if(reset&&id==='standard')throw new Error('Base standards cannot inherit from themselves');
  if(key==='backlight'&&bank.brightness_role) {
    if(reset&&!Object.hasOwn(profile(doc,id).brightness||{},bank.brightness_role))return;
    const p=profile(doc,id);p.brightness=p.brightness||{};
    if(reset)delete p.brightness[bank.brightness_role];else setBrightness(doc,id,bank.brightness_role,value);
  } else if(id==='standard')bank.settings[key]=value;
  else {
    if(reset&&!Object.hasOwn((bank.variants||{})[id]||{},key))return;
    bank.variants=bank.variants||{};bank.variants[id]=bank.variants[id]||{};
    if(reset)delete bank.variants[id][key];else bank.variants[id][key]=value;
    if(!Object.keys(bank.variants[id]).length)delete bank.variants[id];
    if(!Object.keys(bank.variants).length)delete bank.variants;
  }
}
module.exports={ids,valid,profile,validate,upgrade,preferences,legacyPatch,edit,setBrightness};
