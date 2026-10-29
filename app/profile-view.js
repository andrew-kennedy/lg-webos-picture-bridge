/* Pure scope/grouping model for native settings. No reads or writes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LGProfileView = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const formats = {sdr:'SDR',hdr:'HDR',dolbyHdr:'Dolby Vision'};
  const modes = {game:'SDR Game',hdrGame:'HDR Game',filmMaker:'SDR Filmmaker',hdrFilmMaker:'HDR Filmmaker',dolbyHdrGame:'Dolby Vision Game',dolbyHdrCinema:'Dolby Vision Cinema',dolbyHdrCinemaBright:'Dolby Vision Cinema Home'};
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
    const room=variant==='standard'?state.room:variant;
    const result={...bank.settings,...(variant==='standard'?{}:(bank.variants||{})[room]||{})};
    if(bank.brightness_role)result.backlight=state.preferences[bank.brightness_role==='game_sdr'?'game_sdr':'movie_'+room];
    return result;
  }
  function inputName(bank) {
    return String(typeof bank==='string'?bank:input(bank)||'').replace(/^hdmi([1-4])(_pc)?$/,(_,n,pc)=>'HDMI '+n+(pc?' (PC)':''));
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
  const categories={picture:'Picture',motion:'Motion',game:'Gaming',port:'HDMI connection',selection:'Preset selection'};
  const motionKeys=new Set(['realCinema','truMotionMode','truMotionJudder','truMotionBlur','motionProOLED','motionPro']);
  function records(state,variant='standard') {
    const doc=state.document;if(!doc)return [];
    const mappings=doc.banks.filter(b=>b.target.category==='picture'&&b.target.dimension.dynamicRange);
    const mappedModes=b=>[b.settings.pictureMode,...Object.values(b.variants||{}).map(v=>v.pictureMode)].filter(Boolean);
    const result=[];
    for(const bank of doc.banks) {
      const d=bank.target.dimension,port=physical(input(bank)),family=format(bank),nativePreset=d.pictureMode;
      const matching=mappings.filter(m=>physical(input(m))===port&&format(m)===family&&(!d.dynamicRange||m.target.dimension.dynamicRange===d.dynamicRange));
      const mappedPreset=d.gameGenre&&matching.length===1?values(matching[0],state,variant).pictureMode:null;
      const preset=nativePreset||(isGame(mappedPreset)?mappedPreset:null);
      const signals=d.dynamicRange?[/ALLM$/.test(d.dynamicRange)?'on':'off']:[...new Set(matching.filter(m=>input(m)===input(bank)&&mappedModes(m).includes(nativePreset)).map(m=>/ALLM$/.test(m.target.dimension.dynamicRange)?'on':'off'))];
      const deviceIds=!family?[...new Set(doc.banks.filter(b=>physical(input(b))===port).flatMap(b=>b.devices||[]))]:bank.devices||[];
      for(const key of Object.keys(bank.settings)) {
        const category=motionKeys.has(key)?'motion':bank.target.category==='picture'?(d.dynamicRange?'selection':'picture'):
          gameKeys[key]?'picture':d.gameGenre||['gameGenre','inputOptimization'].includes(key)?'game':'port';
        const preference=key==='backlight'&&bank.brightness_role?(bank.brightness_role==='game_sdr'?'game_sdr':variant==='standard'?null:'movie_'+variant):null;
        result.push({id:bank.id+':'+key,bank,key,alias:gameKeys[key]||key,category,port,format:family,preset,
          family:d.gameGenre?'game':preset?(isGame(preset)?'game':'movie'):d.dynamicRange?(isGame(values(bank,state,variant).pictureMode)?'game':'movie'):null,
          genre:d.gameGenre||null,signals:signals.length?signals:['off','on'],devices:deviceIds,
          preference,brightnessRole:key==='backlight'?bank.brightness_role:null,
          locked:key==='backlight'&&bank.brightness_role==='movie_sdr'&&variant==='standard',
          value:values(bank,state,variant)[key]});
      }
    }
    return result;
  }
  function options(all) {
    const unique=(key,order)=>[...new Set(all.map(r=>r[key]).filter(Boolean))].sort((a,b)=>order?order.indexOf(a)-order.indexOf(b):a.localeCompare(b));
    return {port:unique('port'),format:unique('format',['sdr','hdr','dolbyHdr']),family:unique('family',['game','movie']),
      preset:unique('preset'),genre:unique('genre'),allm:['off','on']};
  }
  function matches(record,scope={}) {
    for(const key of ['port','format','family','preset','genre']) if(record[key]&&Array.isArray(scope[key])&&!scope[key].includes(record[key]))return false;
    return !Array.isArray(scope.allm)||record.signals.some(v=>scope.allm.includes(v));
  }
  function factor(record,key) {
    if(record.preference)return record.preference==='game_sdr'?'All SDR game profiles':'All SDR movie profiles';
    if(key==='port')return inputName(record.port);
    if(key==='format')return formats[record.format]||'All formats';
    if(key==='family')return record.family==='game'?'Gaming':record.family==='movie'?'Movies':'All presets';
    if(key==='preset')return modes[record.preset]||record.preset||'All presets';
    if(key==='genre')return record.genre||'All genres';
    if(key==='allm')return record.signals.length>1?'Shared across ALLM':record.signals[0]==='on'?'ALLM on':'ALLM off';
  }
  function scopeRows(all,scope,category,split) {
    const selected=all.filter(r=>r.category===category&&matches(r,scope)),rows=new Map();
    for(const record of selected) {
      // Shared SDR preferences must never masquerade as independent per-port
      // values. Resolve their full affected set even under a narrow filter.
      const id=record.alias+(record.brightnessRole?':'+record.brightnessRole:''),cellParts=record.preference?[factor(record,'port')]:split.map(k=>factor(record,k));
      if(!rows.has(id))rows.set(id,{id,key:record.alias,brightnessRole:record.brightnessRole,cells:new Map()});
      const row=rows.get(id),cellKey=JSON.stringify(cellParts);
      if(!row.cells.has(cellKey))row.cells.set(cellKey,{id:id+':'+cellKey,label:cellParts.length?cellParts.join(' · '):'All selected values',records:[]});
      const cell=row.cells.get(cellKey);
      for(const item of record.preference?all.filter(r=>r.preference===record.preference):[record])if(!cell.records.some(r=>r.id===item.id))cell.records.push(item);
    }
    return [...rows.values()].map(row=>({...row,cells:[...row.cells.values()]}));
  }
  function storedScope(record) {
    const bank=record.bank,d=bank.target.dimension;
    const detail=d.pictureMode?(modes[d.pictureMode]||d.pictureMode)+' · '+(bank.target.app_id?'Motion':'Picture'):
      d.dynamicRange?(formats[record.format]||record.format)+(d.dynamicRange.endsWith('ALLM')?' + ALLM':' without ALLM')+' · '+(d.gameGenre?'Game Optimizer / '+d.gameGenre:'Preset selection'):'Shared port settings';
    return inputName(input(bank))+' · '+detail;
  }
  function combinedControl(cell,live) { return control({bindings:cell.records.map(r=>({bank:r.bank,key:r.key}))},live); }
  return {values,control,same,inputName,modes,categories,formats,records,options,matches,factor,scopeRows,storedScope,combinedControl};
});
