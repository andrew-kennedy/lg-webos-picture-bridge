/* Pure scope/grouping model for native settings. No reads or writes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LGProfileView = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const formats = {sdr:'SDR',hdr:'HDR',dolbyHdr:'Dolby Vision'};
  // Recognized native identities, not a list of recommended presets. The TV's
  // model-specific descriptions decide which of these actually exist.
  const modes = {game:'SDR Game',hdrGame:'HDR Game',filmMaker:'SDR Filmmaker',hdrFilmMaker:'HDR Filmmaker',dolbyHdrGame:'Dolby Vision Game',dolbyHdrCinema:'Dolby Vision Filmmaker',dolbyHdrCinemaBright:'Dolby Vision Cinema Home',
    normal:'SDR Standard',vivid:'SDR Vivid',cinema:'SDR Cinema',expert1:'SDR Expert / ISF Bright',expert2:'SDR Expert / ISF Dark',eco:'SDR Eco',personalized:'SDR Personalized',sports:'SDR Sports',photo:'SDR Photo',
    hdrStandard:'HDR Standard',hdrVivid:'HDR Vivid',hdrCinema:'HDR Cinema',hdrCinemaBright:'HDR Cinema Home',hdrEco:'HDR Eco',hdrPersonalized:'HDR Personalized',
    dolbyHdrStandard:'Dolby Vision Standard',dolbyHdrVivid:'Dolby Vision Vivid',dolbyHdrPersonalized:'Dolby Vision Personalized'};
  const families={game:'Gaming',movie:'Cinema / Filmmaker',expert:'Expert / ISF',general:'Standard / Vivid',personalized:'Personalized',eco:'Eco'};
  const presetFormat=mode=>mode.startsWith('dolbyHdr')?'dolbyHdr':mode.startsWith('hdr')?'hdr':'sdr';
  const presetsFor=range=>Object.keys(modes).filter(mode=>presetFormat(mode)===range.replace(/ALLM$/,''));
  const presetFamily=mode=>/game$/i.test(mode||'')?'game':/cinema|filmmaker/i.test(mode||'')?'movie':/^expert/.test(mode||'')?'expert':/personalized/i.test(mode||'')?'personalized':/eco/i.test(mode||'')?'eco':'general';
  const gameKeys = {gameColorDepth:'color',gameSharpness:'sharpness',gameAdjustContrast:'contrast',gameBlackLevel:'brightness'};
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
    if(state.document.schema===2) {
      const result={...bank.settings,...(bank.variants||{})[variant]||{}};
      if(bank.brightness_role)result.backlight=brightness(state.document,variant)[bank.brightness_role];
      return result;
    }
    const room=variant==='standard'?state.room:variant;
    const result={...bank.settings,...(variant==='standard'?{}:(bank.variants||{})[room]||{})};
    if(bank.brightness_role)result.backlight=state.preferences[bank.brightness_role==='game_sdr'?'game_sdr':'movie_'+room];
    return result;
  }
  function profileOptions(document) {
    return [['standard','Base standard'],...(document.schema===2?document.profiles.map(p=>[p.id,p.name]):[['bright','Bright room'],['dark','Dark room']])];
  }
  function brightness(document,variant) {
    const profile=(document.profiles||[]).find(p=>p.id===variant);
    return {...document.brightness,...profile&&profile.brightness||{}};
  }
  function preferenceValue(state,key) {
    if(state.document.schema!==2)return state.preferences[key];
    const [variant,role]=key.split('/');return brightness(state.document,variant)[role];
  }
  function isInherited(bank,state,variant,key) {
    const doc=state.document;
    if(doc.schema!==2||variant==='standard')return false;
    if(key==='backlight'&&bank.brightness_role)return !Object.hasOwn((doc.profiles.find(p=>p.id===variant)||{}).brightness||{},bank.brightness_role);
    return !Object.hasOwn((bank.variants||{})[variant]||{},key);
  }
  function inputName(bank) {
    return String(typeof bank==='string'?bank:input(bank)||'').replace(/^hdmi([1-4])(_pc)?$/,(_,n,pc)=>'HDMI '+n+(pc?' (PC)':''));
  }
  function brightnessRole(bank) {
    if(bank.target.category!=='picture'||bank.target.app_id||!Object.hasOwn(bank.settings,'backlight'))return null;
    const mode=bank.target.dimension.pictureMode;
    return mode&&presetFormat(mode)==='sdr'?(isGame(mode)?'game_sdr':'movie_sdr'):null;
  }
  function setBrightnessLink(bank,linked,preferences,room,document) {
    const role=brightnessRole(bank);
    if(!role||typeof linked!=='boolean')throw new Error('Choose an SDR picture profile and a brightness link state');
    if(!!bank.brightness_role===linked)return;
    if(linked)bank.brightness_role=role;
    else if(document&&document.schema===2) {
      bank.settings.backlight=brightness(document,'standard')[role];
      bank.variants=bank.variants||{};
      for(const profile of document.profiles) {
        const value=brightness(document,profile.id)[role];
        if(!same(value,bank.settings.backlight)) {
          bank.variants[profile.id]=bank.variants[profile.id]||{};bank.variants[profile.id].backlight=value;
        } else if(bank.variants[profile.id])delete bank.variants[profile.id].backlight;
      }
      delete bank.brightness_role;
    }
    else {
      // Freeze the effective standards, never a temporary viewing adjustment.
      bank.settings.backlight=preferences[role==='game_sdr'?'game_sdr':'movie_'+room];
      if(role==='movie_sdr')bank.variants=bank.variants||{};
      for(const variant of ['bright','dark']) {
        if(role==='movie_sdr')bank.variants[variant]=bank.variants[variant]||{};
        if(bank.variants&&bank.variants[variant]&&(role==='movie_sdr'||Object.hasOwn(bank.variants[variant],'backlight')))
          bank.variants[variant].backlight=preferences[role==='game_sdr'?'game_sdr':'movie_'+variant];
      }
      delete bank.brightness_role;
    }
  }
  function same(a,b) {
    if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.keys(a).sort().join()===Object.keys(b).sort().join()&&Object.keys(a).every(k=>same(a[k],b[k]));
    return a!==undefined&&b!==undefined&&String(a)===String(b);
  }
  function control(row,live) {
    const controls=row.bindings.map(({bank,key})=>{
      if(!live||!live[bank.id]||!live[bank.id].availability||!live[bank.id].availability[key]||live[bank.id].availability[key].editable!==true)return null;
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
  const categories={picture:'Picture',motion:'Motion',game:'Gaming',port:'HDMI connection',selection:'Preset selection'};
  const motionKeys=new Set(['realCinema','truMotionMode','truMotionJudder','truMotionBlur','motionProOLED','motionPro']);
  function records(state,variant='standard') {
    const doc=state.document;if(!doc)return [];
    const result=[];
    for(const bank of doc.banks) {
      const d=bank.target.dimension,port=physical(input(bank)),family=format(bank),nativePreset=d.pictureMode;
      // Game genre banks exist independently of the preset currently mapped
      // to a signal. Picture banks themselves are shared across ALLM states.
      const preset=nativePreset||(d.gameGenre?{sdr:'game',hdr:'hdrGame',dolbyHdr:'dolbyHdrGame'}[family]:null);
      const signals=d.dynamicRange?[/ALLM$/.test(d.dynamicRange)?'on':'off']:['off','on'];
      const deviceIds=!family?[...new Set(doc.banks.filter(b=>physical(input(b))===port).flatMap(b=>b.devices||[]))]:bank.devices||[];
      for(const key of Object.keys(bank.settings)) {
        const category=motionKeys.has(key)?'motion':bank.target.category==='picture'?(d.dynamicRange?'selection':'picture'):
          gameKeys[key]?'picture':d.gameGenre||['gameGenre','inputOptimization'].includes(key)?'game':'port';
        const preference=key==='backlight'&&bank.brightness_role?(doc.schema===2?variant+'/'+bank.brightness_role:bank.brightness_role==='game_sdr'?'game_sdr':variant==='standard'?null:'movie_'+variant):null;
        result.push({id:bank.id+':'+key,bank,key,alias:gameKeys[key]||key,category,port,format:family,preset,
          managed:!bank.managed_keys||bank.managed_keys.includes(key),
          input_type:d.input?(/_pc$/.test(d.input)?'pc':'video'):null,
          family:d.gameGenre?'game':preset?presetFamily(preset):d.dynamicRange?presetFamily(values(bank,state,variant).pictureMode):null,
          genre:d.gameGenre||null,signals:signals.length?signals:['off','on'],devices:deviceIds,
          preference,brightnessRole:key==='backlight'?bank.brightness_role:null,
          locked:doc.schema!==2&&key==='backlight'&&bank.brightness_role==='movie_sdr'&&variant==='standard',
          inherited:isInherited(bank,state,variant,key),
          value:values(bank,state,variant)[key]});
      }
    }
    return result;
  }
  function options(all) {
    const unique=(key,order)=>[...new Set(all.map(r=>r[key]).filter(Boolean))].sort((a,b)=>order?order.indexOf(a)-order.indexOf(b):a.localeCompare(b));
    return {port:unique('port'),input_type:unique('input_type',['video','pc']),format:unique('format',['sdr','hdr','dolbyHdr']),family:unique('family',Object.keys(families)),
      preset:unique('preset'),genre:unique('genre'),allm:['off','on']};
  }
  function matches(record,scope={}) {
    for(const key of ['port','input_type','format','family','preset','genre']) if(record[key]&&Array.isArray(scope[key])&&!scope[key].includes(record[key]))return false;
    return !Array.isArray(scope.allm)||record.signals.some(v=>scope.allm.includes(v));
  }
  function factor(record,key) {
    if(record.preference)return record.preference.includes('/')?(record.brightnessRole==='game_sdr'?'Linked SDR gaming values':'Linked SDR movie values'):(record.preference==='game_sdr'?'All SDR game profiles':'All SDR movie profiles');
    if(key==='port')return inputName(record.port);
    if(key==='input_type')return record.input_type==='pc'?'PC input':record.input_type==='video'?'Video input':'Both input types';
    if(key==='format')return formats[record.format]||'All formats';
    if(key==='family')return families[record.family]||'All presets';
    if(key==='preset')return modes[record.preset]||record.preset||'All presets';
    if(key==='genre')return record.genre||'All genres';
    if(key==='allm')return record.signals.length>1?'Shared across ALLM':record.signals[0]==='on'?'ALLM on':'ALLM off';
  }
  function scopeRows(all,scope,category,split) {
    const selected=all.filter(r=>(category==='all'||r.category===category)&&matches(r,scope)),rows=new Map();
    for(const record of selected) {
      // Shared SDR preferences must never masquerade as independent per-port
      // values. Resolve their full affected set even under a narrow filter.
      const id=record.alias,cellParts=record.preference?[factor(record,'port')]:split.map(k=>factor(record,k));
      if(!rows.has(id))rows.set(id,{id,key:record.alias,cells:new Map()});
      // Brightness is one visible setting. Shared SDR preferences still need
      // distinct cells so a combined edit cannot retarget HDR or another role.
      const row=rows.get(id),cellKey=JSON.stringify(record.brightnessRole?[record.brightnessRole,...cellParts]:cellParts);
      if(!row.cells.has(cellKey))row.cells.set(cellKey,{id:id+':'+cellKey,label:record.locked?'SDR movie profiles':cellParts.length?cellParts.join(' · '):'All selected values',brightnessRole:record.brightnessRole,records:[]});
      const cell=row.cells.get(cellKey);
      for(const item of record.preference?all.filter(r=>r.preference===record.preference):[record])if(!cell.records.some(r=>r.id===item.id))cell.records.push(item);
    }
    return [...rows.values()].map(row=>{
      const cells=[...row.cells.values()];
      if(row.key==='backlight') {
        const order=['sdr','hdr','dolbyHdr'],rank=c=>Math.min(...c.records.map(r=>order.indexOf(r.format)));
        cells.sort((a,b)=>rank(a)-rank(b));
        for(const cell of cells)if(!cell.brightnessRole&&!split.includes('format')) {
          const ranges=[...new Set(cell.records.map(r=>r.format))].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).map(f=>formats[f]||f).join(' / ');
          cell.label=ranges+(split.length?' · '+cell.label:'');
        }
      }
      return {...row,cells};
    });
  }
  function storedScope(record) {
    const bank=record.bank,d=bank.target.dimension;
    const detail=d.pictureMode?(modes[d.pictureMode]||d.pictureMode)+' · '+(bank.target.app_id?'Motion':'Picture'):
      d.dynamicRange?(formats[record.format]||record.format)+(d.dynamicRange.endsWith('ALLM')?' + ALLM':' without ALLM')+' · '+(d.gameGenre?'Game Optimizer / '+d.gameGenre:'Preset selection'):'Shared port settings';
    return inputName(input(bank))+' · '+detail;
  }
  function combinedControl(cell,live) {
    if(cell.records.some(r=>r.availability&&!r.availability.editable))return null;
    return control({bindings:cell.records.map(r=>({bank:r.bank,key:r.key}))},live);
  }
  function applicability(record,live) {
    const bank=live&&live[record.bank.id];
    if(!bank)return {state:'pending',editable:false,reason:'Checking applicability…'};
    return bank.availability&&bank.availability[record.key]||{state:'unverified',editable:false,reason:'Update the bridge to verify this setting for the selected profile.'};
  }
  function partition(all,live) {
    const visible=[],excluded=[];
    const sharedStatus=new Map();
    for(const r of all)if(r.preference) {
      const status=applicability(r,live),prior=sharedStatus.get(r.preference);
      if(!prior||prior.editable||prior.state==='pending'&&!status.editable&&status.state!=='pending')sharedStatus.set(r.preference,status);
    }
    for(const record of all) {
      let status=applicability(record,live);
      if(record.preference) {
        const shared=sharedStatus.get(record.preference);
        const blocked=shared&&!shared.editable&&shared.state!=='pending'?shared:null;
        if(blocked)status={...blocked,reason:'Shared brightness affects another profile: '+blocked.reason};
        else if(shared&&shared.state==='pending')status={state:'pending',editable:false,reason:'Checking all profiles affected by shared brightness…'};
      }
      if(status.editable||status.state==='pending')visible.push({...record,availability:status});
      else excluded.push({...record,availability:status});
    }
    return {visible,excluded};
  }
  function scopeSelection(state,scope={},selectedCategories=Object.keys(categories)) {
    const all=records(state,state.active_profile||state.room),available=options(all);
    if(!scope||typeof scope!=='object'||Array.isArray(scope)||Object.keys(scope).some(k=>!Object.hasOwn(available,k)))throw new Error('Unknown scope filter');
    for(const [key,list] of Object.entries(scope))if(!Array.isArray(list)||!list.length||list.some(v=>!available[key].includes(v)))throw new Error('Unknown or empty '+key+' filter');
    if(!Array.isArray(selectedCategories)||!selectedCategories.length||selectedCategories.some(k=>!Object.hasOwn(categories,k)))throw new Error('Unknown or empty settings category');
    const selection={};
    for(const category of selectedCategories)for(const row of scopeRows(all,scope,category,[]))for(const cell of row.cells)for(const r of cell.records) {
      const keys=selection[r.bank.id]||(selection[r.bank.id]=[]);if(!keys.includes(r.key))keys.push(r.key);
    }
    if(!Object.keys(selection).length)throw new Error('No managed settings match this scope');
    return selection;
  }
  // Target grid. Every stored value has one row and belongs to one or more
  // input columns. Picture, motion and preset-selection banks use a native
  // input identity (hdmi1 or hdmi1_pc). Game Optimizer and connection banks
  // belong to the physical port, so they appear under each input of that port.
  const ranges=['sdr','sdrALLM','hdr','hdrALLM','dolbyHdr','dolbyHdrALLM'];
  const rangeFormat=range=>range.replace(/ALLM$/,'');
  function coordinates(record) {
    const d=record.bank.target.dimension;
    if(record.preset)return {kind:'preset',row:record.preset};
    if(d.dynamicRange)return {kind:'range',row:d.dynamicRange};
    return {kind:'port',row:'port'};
  }
  function inColumn(record,input) {
    const d=record.bank.target.dimension;
    return d.input?d.input===input:physical(input)===record.port;
  }
  // A target is the Cartesian product of inputs and rows, narrowed by Game
  // Optimizer genre and ALLM where those dimensions exist. Unknown rows never
  // match: a range row cannot select a picture preset or the reverse.
  function targeted(record,target) {
    if(!target||!(target.inputs||[]).some(input=>inColumn(record,input)))return false;
    const {kind,row}=coordinates(record);
    if(kind==='preset'&&!(target.presets||[]).includes(row))return false;
    if(kind==='range'&&!rangesFor(target).includes(row))return false;
    const d=record.bank.target.dimension;
    if(d.gameGenre&&Array.isArray(target.genres)&&!target.genres.includes(d.gameGenre))return false;
    if(d.gameGenre&&Array.isArray(target.allm)&&!record.signals.some(v=>target.allm.includes(v)))return false;
    return true;
  }
  // Explicit range rows win. Otherwise follow the selected presets' formats.
  function rangesFor(target) {
    if(Array.isArray(target.ranges))return target.ranges;
    const wanted=new Set((target.presets||[]).map(presetFormat));
    return ranges.filter(range=>wanted.has(rangeFormat(range)));
  }
  // Presets that an input's preset-selection banks recall for any signal, in
  // Base or any profile. Unknown (unread) mappings contribute nothing.
  function presetUsage(all) {
    const usage=new Map();
    for(const record of all)if(record.key==='pictureMode'&&record.bank.target.dimension.dynamicRange) {
      const input=record.bank.target.dimension.input,set=usage.get(input)||new Set();
      for(const value of [record.bank.settings.pictureMode,...Object.values(record.bank.variants||{}).map(v=>v.pictureMode)])if(typeof value==='string'&&modes[value])set.add(value);
      usage.set(input,set);
    }
    return usage;
  }
  const shortPreset=mode=>(modes[mode]||mode).replace(/^(SDR|HDR|Dolby Vision) /,'');
  function rowLabel(kind,row) {
    if(kind==='preset')return shortPreset(row);
    if(kind==='range')return /ALLM$/.test(row)?'With ALLM':'Without ALLM';
    return 'Port-wide';
  }
  const rowFormat=(kind,row)=>kind==='preset'?presetFormat(row):kind==='range'?rangeFormat(row):null;
  return {values,brightness,profileOptions,preferenceValue,isInherited,control,same,inputName,brightnessRole,setBrightnessLink,scopeSelection,modes,families,presetsFor,presetFamily,categories,formats,records,options,matches,factor,scopeRows,storedScope,combinedControl,applicability,partition,
    ranges,coordinates,inColumn,targeted,rangesFor,presetUsage,shortPreset,rowLabel,rowFormat,physical};
});
