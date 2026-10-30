'use strict';

// Read LG's factory declarations once, on demand. Keep only reviewed HDMI
// descriptions in RAM. No generated files, polling, or changes to LG's database.
const fs = require('fs');
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = ['key','category','dimension','dbtype','dataType','vtype','ui','values','condition','app_id'];
let loaded;

// The large override array is streamed so opening the editor does not require
// retaining a second copy of LG's whole settings database in bridge memory.
async function readArray(path, visit, stream = fs.createReadStream(path,{encoding:'utf8',highWaterMark:65536})) {
  let started = false, ended = false, depth = 0, quoted = false, escaped = false, buffer = '', bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > 100 * 1024 * 1024) throw new Error('Native description file exceeds its size limit');
    let start = depth ? 0 : -1;
    for (let i=0;i<chunk.length;i++) {
      const c=chunk[i];
      if (depth) {
        if (quoted) { if (escaped) escaped=false; else if (c==='\\') escaped=true; else if (c==='"') quoted=false; }
        else if (c==='"') quoted=true;
        else if (c==='{') depth++;
        else if (c==='}') {
          depth--;
          if (!depth) {
            buffer += chunk.slice(start,i+1);
            if (buffer.length > 262144) throw new Error('Native description record exceeds its size limit');
            visit(JSON.parse(buffer));buffer='';start=-1;
          }
        }
      } else if (!started && c==='[') started=true;
      else if (started && !ended && c==='{') { depth=1;start=i; }
      else if (started && !ended && c===']') ended=true;
      else if (!/[\s,]/.test(c)) throw new Error('Invalid native description array');
    }
    if (depth) buffer += chunk.slice(start);
    if (buffer.length > 262144) throw new Error('Native description record exceeds its size limit');
  }
  if (!started || !ended || depth || quoted) throw new Error('Incomplete native description array');
}

function merge(base, patch) {
  if (!plain(base) || !plain(patch)) return clone(patch);
  const result=clone(base);
  for (const [key,value] of Object.entries(patch)) {
    if (key==='arrayExt' && Array.isArray(result[key]) && Array.isArray(value))
      result[key]=result[key].map(item=>{const replacement=value.find(v=>v.value===item.value);return replacement?merge(item,replacement):item;});
    else result[key]=plain(value) && plain(result[key])?merge(result[key],value):clone(value);
  }
  return result;
}

function create(environment, allowed) {
  const base=new Map(), overrides=new Map();
  function accept(record, isOverride) {
    if (!plain(record) || typeof record.key !== 'string') return;
    const key=record.key.split('@')[0];
    if (!allowed.has(key)) return;
    if (record.country && record.country !== 'none') return;
    if (record.app_id && record.app_id !== 'default') return;
    if (isOverride && !/@(?:picture|other)\$hdmi[1-4](?:_pc)?\./.test(record.key)) return;
    if (!isOverride && !['picture','other'].includes(record.category)) return;
    const conditions=Object.entries(record.condition || {});
    if (conditions.some(([k,v])=>environment[k] !== v)) return;
    const map=isOverride?overrides:base, id=isOverride?record.key:record.category+'/'+key, score=conditions.length;
    const prior=map.get(id);
    if (prior && prior.score>=score) return;
    map.set(id,{score,description:Object.fromEntries(fields.filter(k=>Object.hasOwn(record,k)).map(k=>[k,clone(record[k])]))});
  }
  function resolve(key, target) {
    const found=base.get(target.category+'/'+key);if (!found) return null;
    const d=target.dimension,layout=target.category==='picture'?['input','pictureMode','dynamicRange']:['gameInput','gameGenre','dynamicRange','uhdDeepColor'];
    const name=key+'@'+target.category+'$'+layout.map(k=>d[k] || 'x').join('.');
    const override=overrides.get(name), result=override?merge(found.description,override.description):clone(found.description);
    result.key=key;
    if ((result.dimension || []).slice().sort().join() !== Object.keys(d).sort().join() || Boolean(result.dbtype==='M') !== Boolean(target.app_id)) return null;
    return result;
  }
  return {accept,resolve,size:()=>base.size+overrides.size};
}

async function load(allowed) {
  if (!loaded) loaded=(async()=>{
    const env=JSON.parse(await fs.promises.readFile('/var/luna/preferences/environmentCondition','utf8'));
    const index=create(env,new Set(allowed));
    await readArray('/etc/palm/description.json',record=>index.accept(record,false));
    await readArray('/etc/palm/override.json',record=>index.accept(record,true));
    return index;
  })().catch(()=>({resolve:()=>null,size:()=>0}));
  return loaded;
}
module.exports={load,create,readArray,merge};
