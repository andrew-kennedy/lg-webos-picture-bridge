'use strict';

// Metadata and observed native values live only in RAM. The complete value
// snapshot goes to HA; it is never the collection reconciled on the TV.
const catalog=require('./profile-native-catalog');
const model=require('./profile-model');
function create(options) {
  let definitions=null, loading=null, captured=null, updated=null;
  const values=new Map(),stamps=new Map();
  const identity=target=>model.canonical(target);
  function remember(target,patch,stamp=options.now()) {
    const id=identity(target),old=values.get(id)||{},next={...old},seen=stamps.get(id)||{};
    for(const [key,value] of Object.entries(patch))if(seen[key]===undefined||stamp>=seen[key]) {next[key]=model.clone(value);seen[key]=stamp;}
    stamps.set(id,seen);
    if(model.canonical(old)===model.canonical(next))return false;
    values.set(id,next);updated=new Date(options.now()).toISOString();return true;
  }
  async function load(refresh=false) {
    if(refresh)definitions=null;
    if(!definitions) {
      if(!loading)loading=catalog.discover(options.document(),{index:options.index}).then(v=>{definitions=v;}).finally(()=>{loading=null;});
      await loading;
    }
    return metadata();
  }
  function metadata() {
    const managed=options.document(),byTarget=new Map((managed?managed.banks:[]).map(b=>[identity(b.target),b]));
    const result=(definitions||[]).map(b=>{
      const saved=byTarget.get(identity(b.target));byTarget.delete(identity(b.target));
      return {...model.clone(b),...(saved?{id:saved.id,name:saved.name,devices:saved.devices||[]}:{}),
        settings:Object.fromEntries([...new Set([...Object.keys(b.settings),...Object.keys(saved?saved.settings:{})])].map(k=>[k,null]))};
    });
    for(const b of byTarget.values())result.push({id:b.id,name:b.name,devices:b.devices||[],target:model.clone(b.target),settings:Object.fromEntries(Object.keys(b.settings).map(k=>[k,null]))});
    return result;
  }
  function browser(document=options.document()) {
    if(!document)return null;
    const result=model.clone(document),managed=new Map(document.banks.map(b=>[identity(b.target),b]));
    result.banks=metadata().map(b=>{
      const saved=managed.get(identity(b.target));
      return {...b,...model.clone(saved||{}),settings:{...b.settings,...values.get(identity(b.target)),...(saved?saved.settings:{})}};
    });
    return result;
  }
  async function prepare(ids,readCache=new Map()) {
    await load();
    const all=metadata(),chosen=ids.map(id=>{const b=all.find(b=>b.id===id);if(!b)throw new Error('Unknown native bank');return b;});
    const needed=new Map();
    for(const bank of chosen) {
      needed.set(bank.id,bank);
      const d=bank.target.dimension;
      for(const b of all)if(d.pictureMode&&b.target.app_id&&b.target.dimension.input===d.input&&b.target.dimension.pictureMode===d.pictureMode ||
          d.gameGenre&&b.target.category==='other'&&b.target.dimension.gameInput===d.gameInput&&!b.target.dimension.dynamicRange)needed.set(b.id,b);
    }
    const pending=[...needed.values()].filter(b=>!readCache.has('native:'+b.id));
    for(let i=0;i<pending.length;i+=8) {
      const chunk=pending.slice(i,i+8);
      const result=await options.read({action:'read',banks:chunk.map(b=>({id:b.id,target:b.target,keys:Object.keys(b.settings)}))});
      for(const b of chunk) {
        const value=result.banks.find(r=>r.id===b.id);
        if(!value||Object.keys(b.settings).some(k=>value.settings[k]===undefined))throw new Error('Incomplete native value read');
        remember(b.target,value.settings);readCache.set('native:'+b.id,value.settings);
      }
    }
    return chosen.map(b=>browser().banks.find(v=>v.id===b.id));
  }
  async function capture(check=()=>{}) {
    await load();const all=metadata();
    for(let i=0;i<all.length;i+=8) {
      check();const chunk=all.slice(i,i+8);
      const result=await options.read({action:'read',banks:chunk.map(b=>({id:b.id,target:b.target,keys:Object.keys(b.settings)}))});
      check();
      for(const b of chunk) {
        const value=result.banks.find(v=>v.id===b.id);
        if(!value||Object.keys(b.settings).some(k=>value.settings[k]===undefined))throw new Error('Incomplete native backup read');
        remember(b.target,value.settings);
      }
    }
    captured=new Date(options.now()).toISOString();return backup();
  }
  function backup() {
    if(!captured)return null;
    const all=metadata();
    if(all.some(b=>Object.keys(b.settings).some(k=>(values.get(identity(b.target))||{})[k]===undefined)))return null;
    return {captured_at:captured,updated_at:updated||captured,document:{schema:1,name:'Native LG settings',devices:model.clone(options.document().devices),
      banks:all.map(b=>({...b,settings:Object.fromEntries(Object.keys(b.settings).map(k=>[k,model.clone(values.get(identity(b.target))[k])]))}))}};
  }
  return {load,metadata,browser,prepare,capture,backup,remember,captured:()=>captured};
}
module.exports={create};
