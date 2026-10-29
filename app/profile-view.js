/* Presentation of native settings as device/format profiles. No reads or writes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LGProfileView = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const formats = {sdr:'SDR',hdr:'HDR',dolbyHdr:'Dolby Vision'};
  const modes = {game:'SDR Game',hdrGame:'HDR Game',filmMaker:'SDR Filmmaker',hdrFilmMaker:'HDR Filmmaker',dolbyHdrGame:'Dolby Vision Game',dolbyHdrCinema:'Dolby Vision Cinema',dolbyHdrCinemaBright:'Dolby Vision Cinema Home'};
  const gameKeys = {gameColorDepth:'color',gameSharpness:'sharpness',gameAdjustContrast:'contrast',gameBlackLevel:'brightness'};
  const membership = bank => JSON.stringify([...(bank.devices||[])].sort());
  const physical = input => String(input||'').replace(/_pc$/,'');
  const input = bank => bank.target.dimension.input||bank.target.dimension.gameInput;
  const isGame = mode => /game$/i.test(mode||'');
  function format(bank) {
    const d=bank.target.dimension;
    if(d.dynamicRange)return d.dynamicRange.replace(/ALLM$/,'');
    if(d.pictureMode)return d.pictureMode.startsWith('dolbyHdr')?'dolbyHdr':d.pictureMode.startsWith('hdr')?'hdr':'sdr';
    return null;
  }
  function values(bank,state,variant) {
    const room=variant==='standard'?state.room:variant;
    const result={...bank.settings,...(variant==='standard'?{}:(bank.variants||{})[room]||{})};
    if(bank.brightness_role)result.backlight=state.preferences[bank.brightness_role==='game_sdr'?'game_sdr':'movie_'+room];
    return result;
  }
  function inputName(bank) {
    return String(typeof bank==='string'?bank:input(bank)||'').replace(/^hdmi([1-4])(_pc)?$/,(_,n,pc)=>'HDMI '+n+(pc?' (PC)':''));
  }
  function sectionName(bank) {
    const d=bank.target.dimension;
    return bank.target.category==='picture'?(d.pictureMode?(bank.target.app_id?'Motion':'Picture'):'Preset selection'):(d.gameGenre?'Game Optimizer':'HDMI port settings');
  }
  function nativeName(bank) {
    const d=bank.target.dimension;
    if(d.pictureMode)return (modes[d.pictureMode]||d.pictureMode)+(bank.target.app_id?' · Motion':' · Picture');
    if(d.dynamicRange)return formats[format(bank)]+(/ALLM$/.test(d.dynamicRange)?' with ALLM':'')+' · '+(d.gameGenre?'Game Optimizer ('+d.gameGenre+')':'Preset selection');
    return inputName(bank)+' · HDMI port settings';
  }
  function groups(state,variant,view) {
    const doc=state.document;
    if(!doc)return [];
    // Keep the two detailed views disjoint so changing View cannot leave the
    // same HDMI bank selected with identical controls under a different name.
    if(view==='advanced'||view==='input')return doc.banks.filter(bank=>view==='input'?!format(bank):!!format(bank)).map(bank=>({
      id:bank.id,name:nativeName(bank),devices:view==='input'?[...new Set(doc.banks.filter(b=>physical(input(b))===input(bank)).flatMap(b=>b.devices||[]))]:bank.devices||[],banks:[bank],scopeBanks:[bank],format:format(bank),input:input(bank),view
    }));
    const groups=[];
    // A range mapping alone is not a usable picture profile. For example a
    // dormant Dolby Vision ALLM mapping must not advertise Switch DV support.
    for(const bank of doc.banks.filter(b=>b.target.dimension.pictureMode&&!b.target.app_id)) {
      const family=format(bank),port=input(bank),members=membership(bank);
      let group=groups.find(g=>g.format===family&&g.input===port&&g.members===members);
      if(!group){group={id:bank.id,name:formats[family],devices:bank.devices||[],format:family,input:port,members,candidates:[],view:'profiles'};groups.push(group);}
      group.candidates.push(bank);
    }
    for(const bank of doc.banks.filter(b=>b.target.app_id)) {
      const group=groups.find(g=>g.format===format(bank)&&g.input===input(bank)&&g.members===membership(bank));
      if(group)group.candidates.push(bank);
    }
    // Optimizer-only collections are supported too. Prefer an existing picture
    // input (including its PC dimension), but never combine ambiguous inputs.
    for(const bank of doc.banks.filter(b=>b.target.dimension.gameGenre)) {
      const matches=groups.filter(g=>g.format===format(bank)&&physical(g.input)===input(bank)&&g.members===membership(bank));
      if(matches.length===1)matches[0].candidates.push(bank);
      else if(!matches.length)groups.push({id:bank.id,name:formats[format(bank)],devices:bank.devices||[],format:format(bank),input:input(bank),members:membership(bank),candidates:[bank],view:'profiles'});
    }
    for(const group of groups) {
      const mappings=doc.banks.filter(b=>b.target.category==='picture'&&b.target.dimension.dynamicRange&&
        input(b)===group.input&&format(b)===group.format&&membership(b)===group.members);
      const ports=doc.banks.filter(b=>!format(b)&&input(b)===physical(group.input));
      const genre=ports.length===1?(values(ports[0],state,variant).gameGenre||'Standard'):'Standard';
      const selected=new Set(mappings.map(b=>values(b,state,variant).pictureMode));
      group.banks=group.candidates.filter(bank=>{
        const d=bank.target.dimension;
        if(d.pictureMode)return !selected.size||selected.has(d.pictureMode);
        const mapping=mappings.find(b=>b.target.dimension.dynamicRange===d.dynamicRange);
        return d.gameGenre===genre&&(!mapping||isGame(values(mapping,state,variant).pictureMode));
      });
      group.scopeBanks=[...group.banks,...mappings];
      group.presets=[...new Set(group.banks.map(b=>b.target.dimension.pictureMode).filter(Boolean))];
      group.missingPreset=[...selected].some(mode=>!group.banks.some(b=>b.target.dimension.pictureMode===mode));
    }
    return groups;
  }
  function rows(group) {
    const sections=new Map();
    if(!group)return [];
    for(const bank of group.banks)for(const key of Object.keys(bank.settings)) {
      const alias=group.view==='profiles'&&gameKeys[key],name=alias||key;
      const section=alias?'Picture':sectionName(bank);
      if(!sections.has(section))sections.set(section,new Map());
      const entries=sections.get(section),id=group.view==='profiles'?name:bank.id+':'+key;
      if(!entries.has(id))entries.set(id,{id:group.id+':'+section+':'+id,key:name,bindings:[]});
      entries.get(id).bindings.push({bank,key});
    }
    const order=['Picture','Game Optimizer','Motion','Preset selection','HDMI port settings'];
    return [...sections].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0])).map(([name,entries])=>({name,rows:[...entries.values()]}));
  }
  function same(a,b) {
    if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.keys(a).sort().join()===Object.keys(b).sort().join()&&Object.keys(a).every(k=>same(a[k],b[k]));
    return a!==undefined&&b!==undefined&&String(a)===String(b);
  }
  function control(row,live) {
    const controls=row.bindings.map(({bank,key})=>{
      if(key==='blackLevel')return {component:'select',options:['auto','high','low']};
      if(key==='pictureMode')return {component:'select',options:format(bank)==='sdr'?['filmMaker','game']:format(bank)==='hdr'?['hdrFilmMaker','hdrGame']:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame']};
      return live&&live[bank.id]&&live[bank.id].controls[key];
    });
    if(controls.some(c=>!c))return null;
    const first=controls[0];
    if(controls.some(c=>c.component!==first.component))return null;
    if(first.component==='number') {
      const min=Math.max(...controls.map(c=>c.min)),max=Math.min(...controls.map(c=>c.max)),step=first.step;
      if(min>max||controls.some(c=>c.step!==step||Math.abs((min-c.min)/step-Math.round((min-c.min)/step))>1e-6))return null;
      return {component:'number',min,max,step};
    }
    const options=first.options.filter(v=>controls.every(c=>c.options.includes(v)));
    const label=first.label&&controls.every(c=>c.label===first.label)?{label:first.label}:{};
    return options.length?{component:'select',options,...label}:null;
  }
  return {groups,rows,values,control,same,inputName,sectionName,modes};
});
