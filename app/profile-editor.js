/* Shared by the TV app and the Home Assistant panel. No dependencies or polling. */
(function () {
  'use strict';
  const titles = {backlight:'OLED pixel brightness',contrast:'Contrast',brightness:'Black level',color:'Color depth',sharpness:'Sharpness',blackLevel:'HDMI RGB range',colorTemperature:'Color temperature',gameColorDepth:'Game color depth',gameSharpness:'Game sharpness',gameAdjustContrast:'Game contrast',gameBlackLevel:'Game black level',lowLevelAdjustment:'Fine tune dark areas',blackStabilizer:'Black stabilizer',whiteStabilizer:'White stabilizer',hdrDynamicToneMapping:'HDR tone mapping',pictureMode:'Picture mode',realCinema:'Real Cinema',truMotionMode:'TruMotion',enableALLM:'Auto low latency mode',enableQFT:'Quick frame transport'};
  titles.enable144HzBooster='Refresh rate boost';
  Object.assign(titles,{dolbyPrecisionDetail:'Dolby Precision Detail',expressionEnhancer:'Expression Enhancer',gammaLevel:'Gamma fine adjustment',dynamicContrast:'Auto Dynamic Contrast',dynamicColor:'Dynamic color',mpegNoiseReduction:'MPEG noise reduction',gameOptimization:'VRR & G-Sync',inputOptimization:'Prevent input delay',uhdDeepColor:'HDMI Deep Color',freesync:'AMD FreeSync',truMotionJudder:'TruMotion de-judder',truMotionBlur:'TruMotion de-blur',motionProOLED:'OLED Motion'});
  // Plain-language help, checked against the G6's own Settings/Game Optimizer
  // help and value labels. See docs/setting-help.md for sources and caveats.
  // Keep this local: rendering help requires no TV reads or persistent writes.
  const descriptions = {
    backlight:'Sets how much light the OLED panel emits. SDR profiles can share brightness or keep independent values using SDR brightness links. HDR and Dolby Vision have their own saved values.',
    contrast:'Adjusts the difference between light and dark areas. Raising it can make bright shades harder to distinguish.',
    brightness:'Adjusts how dark the picture’s black and shadow areas appear. Too high can make black look gray; too low can hide shadow detail.',
    color:'Adjusts color intensity. Higher values make colors more saturated; this does not change the HDMI signal’s bit depth.',
    tint:'Shifts the balance between red and green. Zero leaves this balance centered.',
    sharpness:'Emphasizes outlines to make edges look crisper. Higher values can add halos; they cannot recover missing source detail.',
    colorTemperature:'Shifts whites toward warm/red or cool/blue. Negative values are warmer (−40 means Warm 40); positive values are cooler.',
    colorGamut:'Chooses the range of colors the TV uses. Auto follows the content; forcing a wider gamut can make ordinary colors look oversaturated.',
    gamma:'Controls the brightness of SDR midtones. Lower gamma makes them lighter; higher gamma makes them darker. HDR uses a different brightness curve.',
    gammaLevel:'Fine adjustment for LG’s adjustable 2.2 gamma option (mediumHavingLevel). Other gamma options do not use this offset.',
    peakBrightness:'Controls the panel’s maximum brightness level, including bright highlights. LG locks this control in SDR Game; HDR Game has a separate value.',
    hdrDynamicToneMapping:'Fits HDR highlights into the TV’s brightness range. On adapts to the scene; HGiG is intended for games calibrated to the display. Off disables the dynamic adjustment.',
    expressionEnhancer:'Processes HDR contrast to make foregrounds, backgrounds and objects stand out. Detail emphasizes detail; highlight is LG’s Brightness option. Off skips this enhancement.',
    dolbyPrecisionDetail:'Extra Dolby Vision clarity and contrast processing on supported models. LG disables this control in this G6’s model configuration for every preset; all six selectable Dolby Vision presets were verified.',
    nearBlackDetail:'Adjusts how detail just above black is rendered. This is a picture-preset control, separate from Game Optimizer’s Fine tune dark areas.',
    dynamicContrast:'Automatically changes contrast according to the picture. This can make scenes look punchier, while changing how shadows and highlights are shown.',
    dynamicColor:'Adds color enhancement to make colors more vivid. This can change their appearance from the source.',
    superResolution:'Processes image edges and textures to make soft material appear more detailed. Stronger settings can make the picture look artificial.',
    noiseReduction:'Smooths visible noise or grain. Stronger filtering can also soften fine texture.',
    mpegNoiseReduction:'Reduces compression artifacts, such as blocks and noise around edges. Stronger filtering can soften detail.',
    smoothGradation:'Smooths visible steps between similar shades, such as bands in a sky. Stronger smoothing can reduce subtle texture.',
    blackLevel:'Matches the source’s RGB signal range: high is Full, low is Limited, and auto detects it. A mismatch can wash out blacks or hide dark and bright detail.',
    realCinema:'Handles the original frame cadence of film content for more even motion. LG disables this control in Game presets; signal conditions can restrict it further. TruMotion controls motion smoothing separately.',
    truMotionMode:'Smooths movement using motion processing. Stronger smoothing can make films look like live video. Save User Selection to edit de-judder and de-blur for this preset, including while its source is inactive.',
    truMotionJudder:'Adjusts smoothing for the stepping motion visible in low-frame-rate content. Used with TruMotion’s User Selection mode.',
    truMotionBlur:'Adjusts TruMotion’s reduction of motion blur. Used with TruMotion’s User Selection mode.',
    motionProOLED:'Uses dark intervals between displayed frames to improve motion clarity. This can dim the picture and make flicker visible.',
    lowLevelAdjustment:'Fine-tunes dark game areas when variable refresh rate is enabled. It adjusts shadow visibility separately from the normal black-level control.',
    blackStabilizer:'Adjusts visibility in dark game scenes, helping objects stand out in shadows. Changes can also alter the intended contrast.',
    whiteStabilizer:'Adjusts visibility in bright game scenes, helping objects stand out in highlights. It is separate from the panel’s Peak brightness setting.',
    gameGenre:'Selects LG’s game tuning bank, such as Standard or FPS. Switching genre can recall different saved Game Optimizer adjustments.',
    inputOptimization:'Selects LG’s input-lag treatment: auto means Standard; on means Boost. Boost applies when using the Game Optimizer picture mode.',
    gameOptimization:'Enables variable refresh rate, including NVIDIA G-Sync compatibility, to reduce tearing and stutter from a supported source.',
    freesync:'Enables AMD FreeSync variable refresh rate for compatible sources, reducing tearing and stutter. It is separate from the VRR & G-Sync switch.',
    enableALLM:'Allows a supported source to request low-latency processing automatically while gaming. Some picture processing is unavailable while ALLM is active.',
    enableQFT:'Reduces video transport delay with a source that supports Quick Frame Transport. Enabling it can restrict resolutions and Dolby Vision on this port.',
    enable144HzBooster:'Enables the TV’s higher refresh-rate mode, up to 165 Hz on this G6. The source must support and output that rate.',
    uhdDeepColor:'Enables the HDMI port’s higher-bandwidth 4K signal modes. The source and cable must support the chosen format.',
    pictureMode:'Chooses which LG picture preset is recalled for the selected input and signal format, including its ALLM state. Each preset has its own saved picture values.'
  };
  // Settings list order by section. Unknown native keys follow alphabetically.
  const order = {
    picture:['backlight','contrast','brightness','color','tint','sharpness','colorTemperature','gamma','gammaLevel','peakBrightness','hdrDynamicToneMapping','expressionEnhancer','dynamicContrast','dynamicColor','colorGamut','superResolution','noiseReduction','mpegNoiseReduction','smoothGradation','nearBlackDetail','dolbyPrecisionDetail','blackLevel'],
    motion:['realCinema','truMotionMode','truMotionJudder','truMotionBlur','motionProOLED','motionPro'],
    game:['gameGenre','inputOptimization','lowLevelAdjustment','blackStabilizer','whiteStabilizer'],
    port:['enableALLM','gameOptimization','freesync','enableQFT','enable144HzBooster','uhdDeepColor'],
    selection:['pictureMode']};
  const sections = {picture:'Picture',motion:'Motion',game:'Game Optimizer',port:'HDMI connection',selection:'Preset selection'};
  const formatNames = {sdr:'SDR',hdr:'HDR',dolbyHdr:'Dolby Vision'};
  const genres = ['Standard','FPS','RPG','RTS','Sports','USER'];
  const pretty = key => titles[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
  const display = value => typeof value === 'object' && value !== null ? [...new Set(Object.values(value))].join(' / ') : String(value === undefined || value === null ? '—' : value);
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const model = window.LGProfileView;
  const presetRank = mode => ['sdr','hdr','dolbyHdr'].indexOf(model.rowFormat('preset',mode))*100+Object.keys(model.modes).indexOf(mode);
  const inputRank = id => {const m=/^hdmi(\d)(_pc)?$/.exec(id);return m?Number(m[1])*2+(m[2]?1:0):99;};
  const optionText = (key,value) => key==='pictureMode'?(model.modes[value]||value):key==='truMotionMode'&&value==='user'?'User Selection':display(value);
  const cellText = (key,value) => key==='pictureMode'&&model.modes[value]?model.shortPreset(value):key==='truMotionMode'&&value==='user'?'User':display(value);
  // One label for a set of values: the value, a numeric span, or Mixed.
  function summarize(key,values) {
    const unique=[...new Set(values.map(display))];
    const mixed=unique.length>1||values.some(v=>v&&typeof v==='object'&&new Set(Object.values(v)).size>1);
    if(!values.length)return {text:'—',mixed:false};
    if(!mixed)return {text:cellText(key,values[0]),full:optionText(key,values[0]),mixed};
    if(values.every(v=>v!==''&&v!==null&&typeof v!=='object'&&!isNaN(Number(v)))){const n=values.map(Number);return {text:Math.min(...n)+'–'+Math.max(...n),full:'Mixed: '+unique.join(' / '),mixed};}
    return {text:'Mixed',full:'Mixed: '+unique.map(v=>optionText(key,v)).join(' / '),mixed};
  }
  class Editor extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});
      this.variant='standard';this.draft={};this.epoch=0;this.editingKey=null;this.live={};this.liveVersion=0;this.expanded=new Set();
      this.setting=null;this.target=null;this.allPresets=false;this.allInputs=false;this.pane='list';this.view='edit';this.memo=new Map();this.liveEpoch=0;this.inflight=new Set();
      // ShadowRoot has no onkeydown event-handler property. Keep one listener
      // across renders, including the empty/offline editor.
      this.shadowRoot.addEventListener('keydown',event=>{this.focusValue=false;this.remoteKey(event);});
      this.shadowRoot.addEventListener('pointerdown',()=>{this.focusValue=false;});
    }
    controls() { return [...this.shadowRoot.querySelectorAll('[data-focus]:not(:disabled)')].filter(n=>{
      const closed=n.closest('details:not([open])');
      return n.getClientRects().length&&(!closed||closed.firstElementChild===n);
    }); }
    scrolls() {const result={};for(const k of ['list','detail','sheet']){const n=this.shadowRoot.querySelector('.'+k);if(n)result[k]=n.scrollTop;}return result;}
    restoreScroll(saved) {if(saved)for(const [k,v] of Object.entries(saved)){const n=this.shadowRoot.querySelector('.'+k);if(n)n.scrollTop=v;}}
    captureFocus() {
      const active=this.shadowRoot.activeElement,controls=this.controls(),index=controls.indexOf(active);
      return index>=0 ? {key:active.dataset.focus,neighbors:controls.slice(index+1).concat(controls.slice(0,index).reverse()).map(n=>n.dataset.focus)} : null;
    }
    restoreFocus(saved) {
      if(!saved || !this.getClientRects().length)return;
      const outer=this.getRootNode().activeElement;
      // A pending response must not pull focus back after the user leaves.
      if(outer && outer!==this && outer!==document.body)return;
      const controls=this.controls(),target=[saved.key,...saved.neighbors].map(key=>controls.find(n=>n.dataset.focus===key)).find(Boolean)||controls[0];
      if(!target)return;
      target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
      this.editing(this.editingKey===target.dataset.focus ? target : null);
    }
    editing(control) {
      this.editingKey=control ? control.dataset.focus : null;
      this.shadowRoot.querySelectorAll('[data-editing]').forEach(n=>n.removeAttribute('data-editing'));
      if(control)control.setAttribute('data-editing','');
      const help=this.shadowRoot.querySelector('.remote-help');
      if(help)help.textContent=control ? 'Arrows adjust · OK or Back finishes editing · Review changes before saving' : 'Arrows move · OK selects or edits · Back returns';
    }
    // Spatial navigation: the nearest control in the arrow's direction,
    // preferring controls that overlap the focused one (the same row/column).
    neighbor(active,key) {
      const a=active.getBoundingClientRect(),vertical=key==='ArrowUp'||key==='ArrowDown',sign=key==='ArrowDown'||key==='ArrowRight'?1:-1;
      let best=null,score=Infinity;
      for(const node of this.controls()) {
        if(node===active)continue;
        const r=node.getBoundingClientRect();
        const centre=vertical?((r.top+r.bottom)-(a.top+a.bottom))/2*sign:((r.left+r.right)-(a.left+a.right))/2*sign;
        if(centre<2)continue;
        const along=vertical?(sign>0?r.top-a.bottom:a.top-r.bottom):(sign>0?r.left-a.right:a.left-r.right);
        const overlap=vertical?Math.min(a.right,r.right)-Math.max(a.left,r.left):Math.min(a.bottom,r.bottom)-Math.max(a.top,r.top);
        const across=vertical?Math.abs((r.left+r.right)-(a.left+a.right))/2:Math.abs((r.top+r.bottom)-(a.top+a.bottom))/2;
        const value=(overlap>0?0:1e6)+Math.max(0,along)+(overlap>0?0:-overlap*2)+across*0.05;
        if(value<score){score=value;best=node;}
      }
      return best;
    }
    remoteKey(event) {
      if(!this.adapter || !this.adapter.tvRemote || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
      const codes={13:'Enter',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',461:'Escape'};
      const key=codes[event.keyCode||event.which]||event.key,active=this.shadowRoot.activeElement;
      if(!active)return;
      const arrow=['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(key);
      const handled=()=>{event.preventDefault();event.stopPropagation();};
      if(key==='Escape'&&!this.editingKey&&!this.busy&&this.back()){handled();return;}
      if(this.busy && (arrow||key==='Enter')){handled();return;}
      if(this.editingKey===active.dataset.focus) {
        if(key==='Enter'||key==='Escape'){this.editing(null);handled();return;}
        if(!arrow)return;
        if(active.tagName==='INPUT'&&active.type==='text'){event.stopPropagation();return;}
        handled();
        if(active.tagName==='SELECT') {
          const options=[...active.options].filter(o=>!o.disabled&&!o.hidden),i=options.indexOf(active.selectedOptions[0]);
          const next=options[Math.max(0,Math.min(options.length-1,i+(['ArrowLeft','ArrowUp'].includes(key)?-1:1)))];
          if(next && active.value!==next.value){active.value=next.value;active.dispatchEvent(new Event('change',{bubbles:true}));}
        } else if(active.tagName==='INPUT') {
          const before=active.value;
          if(['ArrowRight','ArrowUp'].includes(key))active.stepUp();else active.stepDown();
          if(active.value!==before)active.dispatchEvent(new Event('input',{bubbles:true}));
        }
        return;
      }
      if(key==='Enter' && ['SELECT','INPUT'].includes(active.tagName)){this.editing(active);if(active.type==='text')event.stopPropagation();else handled();return;}
      if(key==='Enter'&&['BUTTON','SUMMARY'].includes(active.tagName)){handled();active.click();return;}
      if(!arrow)return;
      handled();this.editing(null);
      const next=this.neighbor(active,key);
      if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'});}
      else if(key==='ArrowUp'&&this.adapter.focusBack)this.adapter.focusBack();
    }
    // Back closes the innermost layer first: review, a side view, then the
    // narrow-screen detail pane. Otherwise the host handles Back.
    back() {
      if(this.review){this.closeReview();return true;}
      if(this.view!=='edit'){this.closeView();return true;}
      if(this.pane==='detail'&&this.narrow()){this.showPane('list');return true;}
      return false;
    }
    configure(adapter) { this.adapter=adapter;this.refresh(true); }
    request(command) { return this.adapter.request(command); }
    recordsFor(variant=this.variant) {
      if(!this.state||!this.state.document)return [];
      if(!this.recordCache||this.recordCache.state!==this.state)this.recordCache={state:this.state,byVariant:new Map()};
      if(!this.recordCache.byVariant.has(variant))this.recordCache.byVariant.set(variant,model.records(this.state,variant));
      return this.recordCache.byVariant.get(variant);
    }
    records() { return this.recordsFor(this.variant); }
    cached(key,build) {
      const stamp=[this.records(),this.liveVersion,this.allPresets,this.allInputs,JSON.stringify(this.target),this.onlyOverrides,this.view];
      const hit=this.memo.get(key);
      if(hit&&hit.stamp.every((v,i)=>v===stamp[i]))return hit.value;
      const value=build();this.memo.set(key,{stamp,value});return value;
    }
    adoptCatalog(catalog) {
      if(!catalog||!this.state.document)return;
      this.managedDocument=this.state.document;
      const managed=new Map(this.managedDocument.banks.map(b=>[b.id,b]));
      this.state={...this.state,document:{...this.managedDocument,banks:catalog.map(b=>{
        const saved=managed.get(b.id),values=(this.live[b.id]||{}).settings||{};
        return {...b,...saved,settings:{...b.settings,...values,...(saved?saved.settings:{})},managed_keys:Object.keys(saved?saved.settings:{})};
      })}};
    }
    hydrate(id,values) {
      const bank=this.state.document.banks.find(b=>b.id===id);
      if(bank&&bank.managed_keys)for(const [key,value] of Object.entries(values))if(Object.hasOwn(bank.settings,key)&&!bank.managed_keys.includes(key))bank.settings[key]=value;
      this.recordCache=null;
    }
    writable() { return !this.status.offline&&this.status.editor_api>=4; }
    schema2() { return this.state.document.schema===2; }
    profileMode() { return this.schema2()&&this.variant!=='standard'; }
    overridesOnly() {return !!this.onlyOverrides&&this.profileMode();}
    // Availability for every record: editable, excluded with a reason, or
    // pending until the TV has described its bank.
    statusMap() {
      return this.cached('status',()=>{
        const {visible,excluded}=model.partition(this.records(),this.live),map=new Map();
        for(const r of visible.concat(excluded))map.set(r.id,r.locked?{state:'unavailable',editable:false,reason:'Choose Bright room or Dark room to edit shared SDR movie brightness.',lg:r.availability}:r.availability);
        return map;
      });
    }
    statusOf(record) { return this.statusMap().get(record.id)||{state:'pending',editable:false}; }
    // LG's own availability, ignoring the editor's room lock on shared values.
    lgStatus(record) { const s=this.statusOf(record);return s.lg||s; }
    byAlias() {
      return this.cached('alias',()=>{const map=new Map();for(const r of this.records()){if(!map.has(r.alias))map.set(r.alias,[]);map.get(r.alias).push(r);}return map;});
    }
    aliasRecords(alias) { return this.byAlias().get(alias)||[]; }
    managedBank(bank) { return !bank.managed_keys||bank.managed_keys.length>0||Object.keys(bank.variants||{}).length>0; }
    // Columns: each physical port shows the input identity it actually uses
    // (PC-labelled or ordinary video), unless all eight are requested.
    inputs() {
      return this.cached('inputs',()=>{
        const all=this.records(),ids=new Set(),ports=new Set(),managed=new Set(),c=this.state.context||{};
        for(const r of all){if(r.port)ports.add(r.port);const d=r.bank.target.dimension;if(d.input)ids.add(d.input);}
        for(const bank of this.state.document.banks)if(bank.target.dimension.input&&this.managedBank(bank))managed.add(bank.target.dimension.input);
        const list=[];
        for(const port of [...ports].sort((a,b)=>inputRank(a)-inputRank(b))) {
          const candidates=[...ids].filter(i=>model.physical(i)===port).sort((a,b)=>inputRank(a)-inputRank(b));
          if(!candidates.length){list.push(port);continue;}
          if(this.allInputs){list.push(...candidates);continue;}
          let chosen=candidates.filter(i=>managed.has(i)||i===c.input||(this.target&&this.target.inputs.includes(i)));
          if(!chosen.length)chosen=[candidates.includes(port)?port:candidates[0]];
          list.push(...chosen);
        }
        return list;
      });
    }
    hasInputTypes() { return this.records().some(r=>/_pc$/.test(r.bank.target.dimension.input||''))&&this.records().some(r=>/^hdmi\d$/.test(r.bank.target.dimension.input||'')); }
    devicesFor(inputs) {
      const doc=this.state.document,names=new Set();
      for(const bank of doc.banks) {
        const d=bank.target.dimension;
        if(!this.managedBank(bank)||!(d.input?inputs.includes(d.input):inputs.some(i=>model.physical(i)===d.gameInput)))continue;
        for(const id of bank.devices||[])if((doc.devices||{})[id])names.add(doc.devices[id]);
      }
      return [...names];
    }
    usage() { return this.cached('usage',()=>model.presetUsage(this.records())); }
    usedPresets() {return this.cached('used',()=>this.computeUsedPresets());}
    computeUsedPresets() {
      const inputs=new Set(this.inputs()),used=new Set(),c=this.state.context||{};
      for(const [input,set] of this.usage())if(inputs.has(input))set.forEach(v=>used.add(v));
      if(c.ready&&c.mode)used.add(c.mode);
      // Managed picture and Game Optimizer banks mark presets you configured.
      for(const r of this.records())if(r.preset&&this.managedBank(r.bank)&&[...inputs].some(i=>model.inColumn(r,i)))used.add(r.preset);
      for(const entry of Object.values(this.draft))if(entry.target.dimension.pictureMode)used.add(entry.target.dimension.pictureMode);
      for(const preset of this.target.presets||[])used.add(preset);
      return used;
    }
    // The visible grid for one setting: columns are inputs (or physical
    // ports for port-wide settings); rows are presets, signal ranges or one
    // port-wide row. Rows the setting never stores are omitted.
    gridSpec(alias) {
      return this.cached('grid:'+alias,()=>{
        const all=this.aliasRecords(alias),kind=all.length?model.coordinates(all[0]).kind:'preset',records=all.filter(r=>model.coordinates(r).kind===kind);
        const inputs=this.inputs(),columns=kind==='port'?[...new Set(inputs.map(model.physical))].map(port=>({id:port,inputs:inputs.filter(i=>model.physical(i)===port),label:model.inputName(port)})):
          inputs.map(id=>({id,inputs:[id],label:model.inputName(id)}));
        for(const column of columns)column.devices=this.devicesFor(column.inputs);
        const shown=records.filter(r=>columns.some(c=>c.inputs.some(i=>model.inColumn(r,i))));
        let rows=kind==='port'?['port']:[...new Set(shown.map(r=>model.coordinates(r).row))].sort(kind==='preset'?(a,b)=>presetRank(a)-presetRank(b):(a,b)=>model.ranges.indexOf(a)-model.ranges.indexOf(b));
        let hidden=0;
        if(kind==='preset'&&!this.allPresets){const used=this.usedPresets(),narrowed=rows.filter(r=>used.has(r));if(narrowed.length){hidden=rows.length-narrowed.length;rows=narrowed;}}
        return {kind,records,columns,rows,hidden,game:records.some(r=>r.bank.target.dimension.gameGenre)};
      });
    }
    filtered(record) {
      const d=record.bank.target.dimension;if(!d.gameGenre)return true;
      return (!Array.isArray(this.target.genres)||this.target.genres.includes(d.gameGenre))&&(!Array.isArray(this.target.allm)||record.signals.some(v=>this.target.allm.includes(v)));
    }
    cellRecords(spec,column,row) {return spec.records.filter(r=>model.coordinates(r).row===row&&column.inputs.some(i=>model.inColumn(r,i))&&this.filtered(r));}
    // Records an edit to this setting would change: the selected targets
    // plus every target sharing a linked SDR brightness value with them.
    targetsFor(alias) {
      return this.cached('targets:'+alias,()=>{
        const all=this.aliasRecords(alias),chosen=all.filter(r=>model.targeted(r,this.target));
        const shared=new Set(chosen.map(r=>r.preference).filter(Boolean)),ids=new Set(chosen.map(r=>r.id));
        const linked=shared.size?all.filter(r=>r.preference&&shared.has(r.preference)&&!ids.has(r.id)):[];
        const affected=chosen.concat(linked),status=r=>this.statusOf(r);
        return {chosen,linked,affected,editable:affected.filter(r=>status(r).editable),pending:affected.filter(r=>status(r).state==='pending'),excluded:affected.filter(r=>!status(r).editable&&status(r).state!=='pending')};
      });
    }
    onScreenTarget() {
      const c=this.state.context||{};
      if(!c.ready||!c.input)return null;
      return {inputs:[c.input],presets:model.modes[c.mode]?[c.mode]:[],ranges:c.range?[c.range]:null,genres:null,allm:null};
    }
    ensureTarget() {
      if(this.target)return;
      this.target=this.onScreenTarget();
      if(this.target)return;
      // Without a picture on screen, start at the first input's mapped (or
      // managed) preset so the list shows real values rather than nothing.
      this.target={inputs:[],presets:[],ranges:null,genres:null,allm:null};
      const usage=this.usage(),records=this.records();
      for(const input of this.inputs()) {
        const own=records.filter(r=>r.preset&&model.inColumn(r,input));if(!own.length)continue;
        const rank=list=>[...new Set(list)].sort((a,b)=>presetRank(a)-presetRank(b));
        const used=rank([...(usage.get(input)||[])].filter(p=>own.some(r=>r.preset===p))),managed=rank(own.filter(r=>this.managedBank(r.bank)).map(r=>r.preset));
        this.target={...this.target,inputs:[input],presets:[(used[0]||managed[0]||rank(own.map(r=>r.preset))[0])]};return;
      }
    }
    ensureSetting() {
      const aliases=this.aliasGroups().flatMap(g=>g.aliases);
      if(!this.setting||!this.byAlias().has(this.setting))this.setting=aliases.includes('backlight')?'backlight':aliases[0]||null;
    }
    async refresh(force=false) {
      const epoch=++this.epoch,focus=this.captureFocus();
      try {
        // A superseded refresh returns null: a newer one owns the view.
        const result=await this.request({action:'get'});if(epoch!==this.epoch)return null;
        if(force||!this.state||this.state.instance_id!==result.state.instance_id||this.state.revision!==result.state.revision||
          JSON.stringify(this.state.context)!==JSON.stringify(result.state.context)||this.state.room!==result.state.room||this.state.active_profile!==result.state.active_profile)this.resetLive();
        this.state=result.state;this.status=result.status||{};this.liveVersion++;
        this.managedDocument=null;this.recordCache=null;
        this.adoptCatalog(result.catalog||((this.state.native_snapshot||{}).document||{}).banks);
        if(this.state.document) {
          // Opening the editor always starts with Base. The viewing profile is
          // separate from the destination of an edit.
          if(!this.namedReady){this.variant='standard';this.namedReady=true;}
          const choices=model.profileOptions(this.state.document);
          if(!choices.some(p=>p[0]===this.variant))this.variant='standard';
          if(this.applyChoice&&this.applyChoice!=='automatic'&&!choices.some(p=>p[0]===this.applyChoice))this.applyChoice=null;
          const banks=this.state.document.banks;
          for(const id of Object.keys(this.live))if(!banks.some(b=>b.id===id&&JSON.stringify(b.target)===JSON.stringify(this.live[id].target)))delete this.live[id];
          this.ensureTarget();this.ensureSetting();
        }
        // Keep wherever the user moved during the request; fall back to the
        // control focused at the start when locking cleared focus.
        this.render(this.captureFocus()||focus);await this.inspect();return true;
      } catch(error){this.error(error.message);return false;}
    }
    // Banks whose descriptions the current view needs: the selected targets
    // for every setting (list values), the focused setting's visible grid,
    // linked brightness partners and the inputs' preset mappings.
    neededBanks() {
      const all=this.records(),inputs=new Set(this.inputs()),chosen=new Map(),add=r=>chosen.set(r.id,r);
      const spec=this.setting?this.gridSpec(this.setting):null;
      const visible=spec?new Set(spec.rows):new Set();
      for(const r of all) {
        if(model.targeted(r,this.target))add(r);
        else if(spec&&r.alias===this.setting&&visible.has(model.coordinates(r).row)&&spec.columns.some(c=>c.inputs.some(i=>model.inColumn(r,i)))&&this.filtered(r))add(r);
        else if(r.key==='pictureMode'&&r.bank.target.dimension.dynamicRange&&inputs.has(r.bank.target.dimension.input))add(r);
        else if(this.view==='tv'&&r.managed&&Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key))add(r);
      }
      const shared=new Set([...chosen.values()].map(r=>r.preference).filter(Boolean));
      if(shared.size)for(const r of all)if(r.preference&&shared.has(r.preference))add(r);
      return [...new Map([...chosen.values()].map(r=>[r.bank.id,r.bank])).values()];
    }
    // Descriptions are kept until the live data is reset (refresh with a new
    // revision/context, another edit destination, or a save). Overlapping
    // reads never request a bank twice, and results from a superseded
    // generation are discarded. The HA transport caps outstanding commands.
    resetLive() {this.live={};this.liveEpoch=(this.liveEpoch||0)+1;this.liveVersion++;this.inflight=new Set();this.failed=new Set();}
    async inspect(force=false) {
      if(!this.state||!this.state.document||this.status.offline)return;
      const generation=this.liveEpoch,inflight=this.inflight||(this.inflight=new Set()),failed=this.failed||(this.failed=new Set());
      // A bank whose read failed waits for Refresh rather than retrying in a loop.
      const pending=this.neededBanks().filter(bank=>(force||!this.live[bank.id]&&!failed.has(bank.id))&&!inflight.has(bank.id)),size=this.status.editor_api>=8?32:1;
      if(!pending.length)return;
      pending.forEach(bank=>inflight.add(bank.id));
      let problem=null;
      try {
        for(let offset=0;offset<pending.length;offset+=size) {
          const chunk=pending.slice(offset,offset+size);
          try {
            const result=await this.request(size===1?{action:'inspect',bank_id:chunk[0].id,variant:this.variant}:{action:'inspect_many',bank_ids:chunk.map(b=>b.id),variant:this.variant});if(generation!==this.liveEpoch)return;
            const items=size===1?[result]:result.banks;
            for(const bank of chunk){const item=items.find(r=>r.id===bank.id);if(!item)throw new Error('The TV did not return every requested bank');this.live[bank.id]={...item,target:bank.target};this.hydrate(bank.id,item.settings);}
            this.liveVersion++;
            if(this.busy){}else if(!this.review&&this.view==='edit')this.renderPanes();else if(this.view==='tv'&&!this.review)this.render();
          } catch(error){if(generation!==this.liveEpoch)return;chunk.forEach(bank=>failed.add(bank.id));problem=problem||model.inputName(chunk[0])+': '+error.message;}
        }
      } finally {if(generation===this.liveEpoch)pending.forEach(bank=>inflight.delete(bank.id));}
      if(problem){this.error(problem+' Use Refresh to read these settings again.');return;}
      // Rows can appear once mappings are read; fetch anything newly visible.
      if(this.neededBanks().some(b=>!this.live[b.id]&&!inflight.has(b.id)&&!failed.has(b.id)))await this.inspect();
    }
    button(label,action,cls,id) { const b=el('button',label,cls);b.type='button';b.onclick=action;b.dataset.focus=id||'button:'+label;return b; }
    select(label,options,value,change,id) {
      const wrap=el('label',undefined,'field'),input=el('select');wrap.append(el('span',label));input.setAttribute('aria-label',label);input.dataset.focus=id||'choice:'+label;
      for(const [v,text] of options){const opt=el('option',text);opt.value=v;input.append(opt);}input.value=value;input.onchange=()=>change(input.value);wrap.append(input);return wrap;
    }
    toggle(label,on,change,id,cls='chip') {const b=this.button(label,change,cls,id);b.setAttribute('aria-pressed',String(on));return b;}
    error(message) {const n=this.shadowRoot.querySelector('.message');if(n){n.textContent=message;n.classList.add('error');}else this.shadowRoot.replaceChildren(el('p',message));}
    lockControls() {if(this.busy)this.shadowRoot.querySelectorAll('button,select,input').forEach(n=>n.disabled=true);}
    entryId(record,variant=this.variant) {return record.preference?'preference:'+record.preference:variant+':'+record.id;}
    draftValue(record) {const entry=this.draft[this.entryId(record)];return entry?entry.value:record.value;}
    entryRecord(entry) {
      if(!model.profileOptions(this.state.document).some(p=>p[0]===entry.variant))throw new Error('The draft profile was removed. Discard this draft and select it again.');
      const record=this.recordsFor(entry.variant).find(r=>r.bank.id===entry.bank_id&&r.key===entry.key);
      if(!record||JSON.stringify(record.bank.target)!==JSON.stringify(entry.target)||record.preference!==entry.preference)throw new Error('A draft target or brightness link changed. Discard this draft and select it again.');
      return record;
    }
    currentEntry(entry) {return this.entryRecord(entry).value;}
    entryApplied(entry) {const r=this.entryRecord(entry);return entry.inherit?r.inherited:model.same(r.value,entry.value)&&!(this.schema2()&&entry.variant!=='standard'&&r.inherited);}
    inheritanceText(records) {
      if(records.some(r=>(this.draft[this.entryId(r)]||{}).inherit))return 'Draft: follow Base';
      if(records.some(r=>this.draft[this.entryId(r)]))return 'Draft: override in '+this.profileName(this.variant);
      return records.every(r=>r.inherited)?'Follows Base · changing it creates an override':records.every(r=>!r.inherited)?'Overrides Base in this profile':'Some targets follow Base; others override it';
    }
    // Stage one value for every editable affected record. Linked SDR
    // brightness records collapse to one entry naming all of their targets.
    stage(records,value,excluded) {
      if(!Object.keys(this.draft).length)this.draftRevision=this.state.revision;
      const all=this.records();
      for(const r of records) {
        const id=this.entryId(r),before=r.preference?model.preferenceValue(this.state,r.preference):r.value;
        const encoded=value!==undefined&&r.key==='blackLevel'?Object.fromEntries(Object.keys(before).map(k=>[k,value])):value;
        if(value===undefined||model.same(before,encoded))delete this.draft[id];
        else this.draft[id]={...(this.draft[id]||{id,bank_id:r.bank.id,key:r.key,variant:this.variant,target:r.bank.target,preference:r.preference,before,nativeOnly:!r.managed}),inherit:false,value:encoded,label:pretty(r.alias),
          targets:(r.preference?all.filter(t=>t.preference===r.preference):[r]).map(t=>({id:t.id,scope:model.storedScope(t)})),excluded};
      }
      this.review=null;
    }
    stageInheritance(records) {
      if(!this.writable()||this.status.editor_api<7||!this.profileMode())return;
      if(!Object.keys(this.draft).length)this.draftRevision=this.state.revision;
      const all=this.records();
      for(const r of records) {
        const id=this.entryId(r);
        if(r.inherited){delete this.draft[id];continue;}
        const affected=r.preference?all.filter(t=>t.preference===r.preference):[r],status=this.statusOf(r);
        this.draft[id]={id,bank_id:r.bank.id,key:r.key,variant:this.variant,target:r.bank.target,preference:r.preference,
          before:r.value,value:model.values(r.bank,this.state,'standard')[r.key],inherit:true,label:pretty(r.alias),
          targets:affected.map(t=>({id:t.id,scope:model.storedScope(t)})),cleanup:status.editable?null:status.reason||'LG doesn’t use this setting here'};
      }
      this.review=null;this.renderPanes();
    }
    editVariant(id,focusValue=false) {
      if(id===this.variant&&!focusValue&&this.view==='edit')return;
      // Targets, the focused setting and drafts survive moving between Base
      // and profiles. Fresh applicability reads follow for the new variant.
      this.variant=id;this.resetLive();this.review=null;this.view='edit';this.focusValue=focusValue;
      if(focusValue)this.pane='detail';
      this.render();this.inspect();
    }
    saveDestination(entries=Object.values(this.draft)) {
      const ids=[...new Set(entries.map(e=>e.variant))];
      if(ids.length!==1)return 'Save all reviewed changes';
      return ids[0]==='standard'?'Save Base':'Save '+this.profileName(ids[0])+' overrides';
    }
    baseImpact(record) {
      const inherited=[],overridden=[];
      for(const profile of this.state.document.profiles||[]) {
        const preference=record.key==='backlight'&&record.bank.brightness_role?profile.id+'/'+record.bank.brightness_role:null;
        const draft=this.draft[preference?'preference:'+preference:profile.id+':'+record.id];
        (draft?draft.inherit?inherited:overridden:model.isInherited(record.bank,this.state,profile.id,record.key)?inherited:overridden).push(profile.name);
      }
      return {inherited,overridden};
    }
    overriddenBy(record) {return (this.state.document.profiles||[]).filter(p=>!model.isInherited(record.bank,this.state,p.id,record.key));}
    profileName(id) {return id==='standard'?'Base':(model.profileOptions(this.state.document).find(p=>p[0]===id)||[id,id])[1];}
    async profileCommand(command) {
      if(Object.keys(this.draft).length){this.error('Save or discard staged edits before changing profiles.');return;}
      return this.mutate({...command,revision:this.state.revision});
    }
    reviewProfile(action) {
      if(Object.keys(this.draft).length){this.error('Save or discard staged edits first.');return;}
      const deleting=action==='delete_profile';
      this.review={action,profile_id:this.variant,revision:this.state.revision,returnFocus:'button:'+(deleting?'Delete ':'Reset ')+this.profileName(this.variant)+(deleting?'':' to Base'),entries:[{label:this.profileName(this.variant),variant:this.variant,before:deleting?'Saved profile':'Profile overrides',value:deleting?'Delete profile':'Inherit every base standard',targets:[{scope:deleting?'An active selection returns to Automatic.':'All ports, formats and settings in this profile. Shared base standards are preserved.'}]}]};
      this.render({key:'review-back',neighbors:[]},false);
    }
    openBrightnessReview(banks,linked,returnFocus) {
      if(Object.keys(this.draft).length){this.error('Save or discard staged value edits before changing brightness links.');return;}
      const usable=new Set(this.records().filter(r=>r.key==='backlight'&&this.lgStatus(r).editable).map(r=>r.bank.id));
      if(banks.some(b=>!usable.has(b.id))){this.error('LG doesn’t use OLED pixel brightness for every selected preset. Select them again.');return;}
      const changed=banks.filter(b=>!!b.brightness_role!==linked);if(!changed.length){this.error('The selected profiles already have this link state.');return;}
      const describe=bank=>(bank.brightness_role?'Linked':'Independent')+' · '+(this.schema2()?model.profileOptions(this.state.document).map(([id,label])=>label+' '+model.values(bank,this.state,id).backlight).join(' / '):'Bright '+model.values(bank,this.state,'bright').backlight+' / Dark '+model.values(bank,this.state,'dark').backlight);
      const entries=changed.map(bank=>{const after=JSON.parse(JSON.stringify(bank));model.setBrightnessLink(after,linked,this.state.preferences,this.state.room,this.state.document);return {label:'SDR brightness link',variant:'All profiles',before:describe(bank),value:describe(after),targets:[{scope:model.inputName(bank)+' · '+model.modes[bank.target.dimension.pictureMode]}]};});
      this.review={action:'set_brightness_links',revision:this.state.revision,links:changed.map(bank=>({bank_id:bank.id,linked})),entries,returnFocus};this.render({key:'review-back',neighbors:[]},false);
    }
    // ---- Targets ----------------------------------------------------------
    changeTarget(change) {
      change(this.target);this.review=null;this.renderPanes();this.inspect();
    }
    rowList(kind) {return kind==='preset'?this.target.presets:model.rangesFor(this.target);}
    setRows(kind,rows) {if(kind==='preset')this.target.presets=rows;else if(kind==='range')this.target.ranges=rows;}
    selectCell(spec,column,row) {
      this.changeTarget(t=>{t.inputs=[...column.inputs];if(spec.kind==='preset'){t.presets=[row];t.ranges=null;}else if(spec.kind==='range')t.ranges=[row];});
    }
    toggleColumn(column) {
      this.changeTarget(t=>{const on=column.inputs.every(i=>t.inputs.includes(i));t.inputs=on?t.inputs.filter(i=>!column.inputs.includes(i)):[...new Set(t.inputs.concat(column.inputs))];});
    }
    toggleRows(spec,rows) {
      this.changeTarget(t=>{
        const current=this.rowList(spec.kind),on=rows.every(r=>current.includes(r));
        this.setRows(spec.kind,on?current.filter(r=>!rows.includes(r)):[...new Set(current.concat(rows))]);
        if(spec.kind==='preset')t.ranges=null;
      });
    }
    selectEverything(spec) {
      this.changeTarget(t=>{t.inputs=[...new Set(spec.columns.flatMap(c=>c.inputs))];if(spec.kind!=='port')this.setRows(spec.kind,[...spec.rows]);if(spec.kind==='preset')t.ranges=null;});
    }
    selectFamily(spec,family) {
      this.changeTarget(t=>{t.presets=spec.rows.filter(r=>model.presetFamily(r)===family);t.ranges=null;if(!t.inputs.length)t.inputs=[...new Set(spec.columns.flatMap(c=>c.inputs))];});
    }
    selectOnScreen() {const live=this.onScreenTarget();if(live)this.changeTarget(t=>Object.assign(t,live));}
    filterChips(label,key,values,names) {
      const field=el('fieldset','', 'filter');field.append(el('legend',label));const list=el('div',undefined,'chips');
      for(const value of values)list.append(this.toggle(names(value),!Array.isArray(this.target[key])||this.target[key].includes(value),()=>this.changeTarget(t=>{
        const next=new Set(t[key]||values);next.has(value)?next.delete(value):next.add(value);t[key]=next.size===values.length?null:[...next];
      }),key+':'+value));
      field.append(list);return field;
    }
    targetPhrase(spec) {
      const t=this.target,columns=spec.columns.filter(c=>c.inputs.some(i=>t.inputs.includes(i)));
      if(!columns.length)return 'No inputs selected';
      const inputs=columns.length===spec.columns.length&&columns.length>1?(spec.kind==='port'?'All ports':'All inputs'):columns.map(c=>c.label).join(', ');
      if(spec.kind==='port')return inputs;
      const selected=this.rowList(spec.kind),parts=[];
      for(const format of ['sdr','hdr','dolbyHdr']) {
        const rows=spec.rows.filter(r=>model.rowFormat(spec.kind,r)===format),chosen=rows.filter(r=>selected.includes(r));
        if(!chosen.length)continue;
        if(spec.kind==='range')parts.push(formatNames[format]+(chosen.length===rows.length?'':' '+chosen.map(r=>model.rowLabel('range',r).toLowerCase()).join(', ')));
        else if(chosen.length===rows.length&&rows.length>1)parts.push('all '+formatNames[format]+(spec.hidden?' presets in use':' presets'));
        else parts.push(...chosen.map(r=>model.modes[r]||r));
      }
      return inputs+' · '+(parts.length?parts.join(', '):'no '+(spec.kind==='range'?'signals':'presets')+' selected');
    }
    isLive(column,row,kind) {
      const c=this.state.context||{};
      return !!c.ready&&column.inputs.includes(c.input)&&(kind==='preset'?row===c.mode:kind==='range'?row===c.range:true);
    }
    // ---- Rendering ---------------------------------------------------------
    narrow() {return !!this.listHost&&!!this.detailHost&&!(this.listHost.getClientRects().length&&this.detailHost.getClientRects().length);}
    showPane(pane) {
      this.pane=pane;const body=this.shadowRoot.querySelector('.body');if(body)body.dataset.pane=pane;
      const host=pane==='list'?this.listHost:this.detailHost,focus=host&&[...host.querySelectorAll('[data-focus]:not(:disabled)')].find(n=>n.getClientRects().length&&(pane==='detail'||n.getAttribute('aria-current')==='true'))||host&&host.querySelector('[data-focus]:not(:disabled)');
      if(focus&&!this.busy)focus.focus();
    }
    openSetting(alias) {
      const changed=alias!==this.setting;this.setting=alias;this.pane='detail';this.review=null;
      if(changed){this.renderPanes();this.inspect();}else this.renderPanes();
      if(this.narrow())this.showPane('detail');
    }
    openView(view) {this.view=view;this.review=null;this.render({key:'view-back',neighbors:[]},false);if(view==='tv')this.inspect();}
    closeView() {const view=this.view;this.view='edit';this.render({key:view==='tv'?'open-tv':'open-profiles',neighbors:[]},false);this.inspect();}
    render(focus=this.captureFocus(),keepScroll=true) {
      const root=this.shadowRoot,previous=this.scrolls();this.memo=new Map();
      if('list' in previous)this.editScroll=previous;
      root.innerHTML=`<style>${styles}</style>`;
      const frame=el('div',undefined,'frame');this.frame=frame;
      if(this.state&&this.state.document&&this.variant!=='standard')frame.classList.add('profile');
      const top=el('header',undefined,'top');top.append(el('h2','Picture settings'));
      const actions=el('div',undefined,'actions');actions.append(this.button('Refresh',()=>this.refresh(true),'small'));
      if(!this.state.document&&this.adapter.fileTransfer!==false)actions.append(...this.backupButtons());
      top.append(actions);frame.append(top);
      if(!this.state.document){this.listHost=this.detailHost=null;frame.append(el('p','Import a profile collection using LG Picture Profiles in Home Assistant.','empty'),el('p',this.status.error||'No collection yet.','message'));root.append(frame);this.lockControls();this.restoreFocus(focus);return;}
      const context=el('div',undefined,'context');context.append(this.editCard(),this.tvCard());frame.append(context);
      const body=el('main',undefined,'body');body.setAttribute('aria-label','Settings editor');frame.append(body);
      this.listHost=this.detailHost=this.gridHost=null;
      if(this.review||this.view!=='edit') {
        body.classList.add('single');const sheet=el('section',undefined,'sheet');body.append(sheet);
        if(this.review)this.renderReview(sheet);else if(this.view==='profiles')this.renderManage(sheet);else this.renderTv(sheet);
      } else {
        body.dataset.pane=this.pane;
        this.listHost=el('nav',undefined,'list');this.listHost.setAttribute('aria-label','Settings');
        this.detailHost=el('section',undefined,'detail');this.detailHost.setAttribute('aria-live','polite');
        body.append(this.listHost,this.detailHost);
      }
      const footer=el('footer',undefined,'footer'),footerActions=el('div',undefined,'actions');this.counts=el('span',undefined,'counts');
      this.reviewButton=this.button('Review changes',()=>this.openEditReview(),'primary','review');this.discardButton=this.button('Discard edits',()=>{this.draft={};this.review=null;this.render();},undefined,'discard');
      footerActions.append(this.discardButton,this.reviewButton);footer.append(this.counts,footerActions);frame.append(footer);this.footer=footer;
      const ack=this.status.backup_sequence&&this.status.backup_sequence===this.status.backup_acknowledged;
      if(this.status.offline||!this.state.enabled||this.status.editor_api<4||!this.status.editor_api)frame.append(el('p',this.status.offline?'TV offline · showing saved backup':this.status.editor_api<4||!this.status.editor_api?'Update LG Picture Bridge to verify which controls apply.':'Profile management is paused. Saved profile changes apply when it resumes.','notice'));
      const status=el('div',undefined,'status');status.append(el('p',this.status.error||this.status.native_backup_error||((ack?'Backup confirmed in Home Assistant':'TV owns standards')+(this.status.native_backup_complete===false?' · Full native snapshot pending':'')),'message'));
      if(this.adapter.tvRemote)status.append(el('p',undefined,'remote-help'));frame.append(status);root.append(frame);
      if(this.listHost)this.fillPanes();
      this.updateFooter();this.lockControls();this.restoreScroll(this.listHost?this.editScroll:keepScroll?previous:null);this.restoreFocus(focus);
      this.editing(root.activeElement&&this.editingKey===root.activeElement.dataset.focus?root.activeElement:null);
      this.focusPendingValue();
    }
    renderPanes() {
      if(!this.listHost||this.review||this.view!=='edit')return;
      const focus=this.captureFocus(),scroll=this.scrolls();this.memo=new Map();
      this.fillPanes();this.updateFooter();this.lockControls();this.restoreScroll(scroll);this.restoreFocus(focus);
      this.focusPendingValue();
    }
    fillPanes() {this.ensureSetting();this.renderList();this.renderDetail();}
    focusPendingValue() {
      if(!this.focusValue||this.busy||!this.getClientRects().length||this.getRootNode().activeElement!==this)return;
      const target=this.detailHost&&this.detailHost.querySelector('.valuebox input:not(:disabled):not([hidden]),.valuebox select:not(:disabled)');
      if(target){this.focusValue=false;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});}
    }
    editCard() {
      const card=el('section',undefined,'card edit-card'),choices=model.profileOptions(this.state.document),schema2=this.schema2();
      const tabs=el('nav',undefined,'tabs');tabs.setAttribute('aria-label','Choose what to edit');tabs.append(el('span','Editing','card-label'));
      for(const [id,label] of choices)tabs.append(this.toggle(id==='standard'?'Base':label,this.variant===id,()=>this.editVariant(id),'edit:'+id,'tab'));
      if(schema2||this.status.editor_api>=6)tabs.append(this.button(this.adapter.fileTransfer!==false?'Profiles & backup':schema2?'Manage profiles':'Named profiles',()=>this.openView('profiles'),'ghost','open-profiles'));
      else if(this.adapter.fileTransfer!==false)tabs.append(this.button('Backup',()=>this.openView('profiles'),'ghost','open-profiles'));
      card.append(tabs);
      const base=this.variant==='standard',note=el('p',schema2?(base?'Starting values. Profiles follow Base unless they override a setting.':'Changes save as '+this.profileName(this.variant)+' overrides. The rest follows Base.'):
        (base?'Base standard values.':this.profileName(this.variant)+' values for this room.'),'edit-note');
      note.id='edit-context';card.append(note);return card;
    }
    tvCard() {
      const card=el('section',undefined,'card tv-card'),c=this.state.context||{},temporary=Object.values(this.state.overrides||{}).reduce((n,v)=>n+Object.keys(v).length,0);
      const line=el('div',undefined,'tv-line');line.append(el('span','On TV now','card-label'));
      const now=el('strong',this.status.offline?'TV offline':c.ready?[model.inputName(c.input),model.modes[c.mode]||c.mode,/ALLM$/.test(c.range||'')?'ALLM':null].filter(Boolean).join(' · '):'No HDMI picture','now');
      if(c.ready&&!this.status.offline)now.prepend(el('span','','dot'));
      line.append(now);card.append(line);
      const using=this.schema2()?'Using '+this.profileName(this.state.active_profile)+' · '+(this.state.selection==='automatic'?'Automatic':'Manual'):'Room: '+this.state.room;
      const second=el('div',undefined,'tv-line');second.append(el('span',using+(this.state.enabled?'':' · paused')+(temporary?' · '+temporary+' temporary':''),'using'),this.button('TV profile & automation',()=>this.openView('tv'),'ghost small','open-tv'));card.append(second);
      return card;
    }
    aliasGroups() {
      return this.cached('groups',()=>{
        const groups=new Map();
        for(const [alias,records] of this.byAlias()) {
          if(this.overridesOnly()&&!records.some(r=>!r.inherited||this.draft[this.entryId(r)]))continue;
          const section=records[0].category;if(!groups.has(section))groups.set(section,[]);groups.get(section).push(alias);
        }
        return Object.keys(sections).filter(s=>groups.has(s)).map(section=>({section,aliases:groups.get(section).sort((a,b)=>{
          const ia=order[section].indexOf(a),ib=order[section].indexOf(b);return (ia<0?999:ia)-(ib<0?999:ib)||pretty(a).localeCompare(pretty(b));})}));
      });
    }
    listValue(alias) {
      const t=this.targetsFor(alias);
      if(!t.chosen.length)return {text:'—',cls:'na',meta:'Not stored for this target'};
      let result;
      if(this.status.offline)result=summarize(alias,t.affected.map(r=>this.draftValue(r)));
      else if(t.pending.length&&!t.editable.length)result={text:'…'};
      else if(!t.editable.length)result={text:'n/a',cls:'na',meta:'Not used here'};
      else result=summarize(alias,t.editable.map(r=>this.draftValue(r)));
      const meta=[];
      if(t.affected.some(r=>this.draft[this.entryId(r)]))meta.push((t.affected.some(r=>(this.draft[this.entryId(r)]||{}).inherit)?'Draft: follow Base':'Draft')+' → '+this.profileName(this.variant));
      if(this.profileMode()&&t.affected.some(r=>!r.inherited))meta.push('Override');
      if(t.linked.length||t.chosen.some(r=>r.preference))meta.push('Linked');
      if(t.affected.some(r=>Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)))meta.push('Temporary on TV');
      return {...result,cls:result.cls||(meta[0]&&meta[0].startsWith('Draft')?'draft':result.mixed?'mixed':''),meta:meta.join(' · ')||result.meta};
    }
    renderList() {
      const host=this.listHost;host.replaceChildren();
      const head=el('div',undefined,'list-head'),spec=this.gridSpec(this.presetAlias());
      head.append(el('span','Values for','card-label'),el('p',this.targetPhrase(spec),'list-for'));
      if(this.profileMode())head.append(this.toggle('Show only overrides',this.overridesOnly(),()=>{this.onlyOverrides=!this.onlyOverrides;this.renderPanes();},'only-overrides'));
      host.append(head);
      const groups=this.aliasGroups();
      if(!groups.length)host.append(el('p',this.overridesOnly()?'No overrides in '+this.profileName(this.variant)+'. Turn off “Show only overrides” to add one.':'No settings stored.','empty'));
      for(const {section,aliases} of groups) {
        host.append(el('h4',sections[section]));
        for(const alias of aliases) {
          const v=this.listValue(alias),item=this.button('',()=>this.openSetting(alias),'item','setting:'+alias);
          item.append(el('span',pretty(alias),'name'),el('span',v.text,'v '+(v.cls||'')));
          if(v.meta)item.append(el('span',v.meta,'meta'));
          item.setAttribute('aria-current',String(alias===this.setting));item.setAttribute('aria-label',pretty(alias)+': '+(v.full||v.text)+(v.meta?' · '+v.meta:''));
          host.append(item);
        }
      }
    }
    presetAlias() {
      if(this.setting&&this.gridSpec(this.setting).kind==='preset')return this.setting;
      return ['backlight','color','contrast'].find(a=>this.byAlias().has(a))||[...this.byAlias().keys()].find(a=>this.gridSpec(a).kind==='preset')||this.setting;
    }
    renderDetail() {
      const host=this.detailHost;host.replaceChildren();
      const alias=this.setting;if(!alias){host.append(el('p','No settings stored.','empty'));return;}
      const head=el('div',undefined,'detail-head');
      head.append(this.button('‹ All settings',()=>this.showPane('list'),'ghost pane-back','pane-back'),el('h3',pretty(alias),'setting-title'));
      if(descriptions[alias]){const help=el('p',descriptions[alias],'help');help.id='help-'+alias;head.append(help);}
      const main=el('div',undefined,'detail-main'),side=el('div',undefined,'extras');host.append(head,main);
      this.gridHost=el('section',undefined,'where');this.gridHost.setAttribute('aria-label','Where this value applies');
      main.append(this.valueBox(alias),this.gridHost,side);this.renderGrid();
      side.append(this.storageDetails(alias));
      if(alias==='backlight'&&this.status.editor_api>=5)side.append(this.linksSection(alias));
      if(['truMotionMode','truMotionJudder','truMotionBlur'].includes(alias)&&this.status.editor_api>=5&&this.state.document.banks.some(b=>b.target.category==='picture'&&!b.target.app_id&&['filmMaker','hdrFilmMaker','dolbyHdrCinema','dolbyHdrCinemaBright'].includes(b.target.dimension.pictureMode)&&['truMotionJudder','truMotionBlur'].some(k=>!Object.hasOwn(b.settings,k)))) {
        const box=el('div',undefined,'section');box.append(el('p','Include the TV’s existing de-judder and de-blur values in your movie standards. TruMotion keeps its saved mode.','note'));
        const b=this.button('Include TruMotion adjustments',()=>this.mutate({action:'include_motion_controls',revision:this.state.revision}));b.dataset.linkAction='';box.append(b);side.append(box);
      }
    }
    valueBox(alias) {
      const box=el('section',undefined,'valuebox'),t=this.targetsFor(alias),spec=this.gridSpec(alias),title=pretty(alias);
      const heading=el('p',undefined,'for');heading.append(el('span','Set for ','card-label'),el('span',this.targetPhrase(spec)));box.append(heading);
      const live=this.onScreenTarget(),c=this.state.context||{};
      const onScreen=live&&t.chosen.some(r=>{const k=model.coordinates(r);return model.inColumn(r,c.input)&&(k.kind==='preset'?k.row===c.mode:k.kind==='range'?k.row===c.range:true);});
      if(!t.chosen.length){box.append(el('p','Nothing selected. Choose inputs and presets in the grid below.','note warn'));return box;}
      const ready=!t.pending.length,control=ready&&t.editable.length&&!this.status.offline?model.combinedControl({records:t.editable},this.live):null;
      const values=t.editable.map(r=>this.draftValue(r)),sum=summarize(alias,values),unique=[...new Set(values.map(display))],disabled=!this.writable();
      const update=value=>{
        this.stage(t.editable,value,t.excluded.map(r=>({id:r.id,scope:model.storedScope(r),reason:this.statusOf(r).reason})));
        this.memo=new Map();this.renderList();this.renderGrid();this.updateFooter();this.lockControls();
        const line=box.querySelector('.draft-line');if(line)line.textContent=this.draftLine(t.editable);
      };
      let input,outside=null;
      // The control offers only what every selected target accepts. A shared
      // stored value outside that is shown as it is, never clamped.
      const current=sum.mixed||!values.length?undefined:values[0];
      if(control&&control.component==='number') {
        input=el('div',undefined,'range');const slider=el('input'),number=el('input');slider.type='range';number.type='number';
        if(current!==undefined&&(Number(current)<Number(control.min)||Number(current)>Number(control.max)))outside='The stored value '+display(current)+' is outside the range every selected target accepts ('+control.min+'–'+control.max+').';
        for(const node of [slider,number]){node.min=control.min;node.max=control.max;node.step=control.step;node.value=current===undefined?'':unique[0];node.setAttribute('aria-label',title);node.dataset.focus='value:'+alias+':'+node.type;node.disabled=disabled;}
        slider.hidden=sum.mixed||!!outside;number.placeholder='Mixed';slider.oninput=()=>{number.value=slider.value;update(Number(slider.value));};
        // An empty or invalid entry stages nothing; leaving it shows the
        // staged value again rather than discarding drafts.
        number.oninput=()=>{const valid=number.value!==''&&number.checkValidity();slider.hidden=!valid;if(valid){slider.value=number.value;update(Number(number.value));}};
        number.onchange=()=>{
          if(number.value!==''&&number.checkValidity())return;
          const now=[...new Set(t.editable.map(r=>display(this.draftValue(r))))],one=now.length===1?now[0]:'';
          number.value=one;slider.hidden=!one||!number.checkValidity();if(!slider.hidden)slider.value=one;
        };
        input.append(slider,number);
      } else if(control&&control.options) {
        input=el('select');input.setAttribute('aria-label',(control.label&&control.label!==title?control.label:title));input.dataset.focus='value:'+alias+':select';
        if(sum.mixed){const option=el('option','Mixed');option.value='';option.disabled=true;input.append(option);}
        else if(current!==undefined&&!control.options.some(v=>String(v)===unique[0])) {
          const option=el('option',optionText(alias,current)+' (not available for every selected target)');option.value=unique[0];option.disabled=true;input.append(option);
          outside=optionText(alias,current)+' is stored, but not every selected target offers it. Choosing another option changes them all.';
        }
        for(const value of control.options){const option=el('option',optionText(alias,value));option.value=value;input.append(option);}input.value=sum.mixed?'':unique[0];input.disabled=disabled;input.onchange=()=>update(input.value);
      } else if(this.status.offline)input=el('p',summarize(alias,t.affected.map(r=>this.draftValue(r))).full||'—','static');
      else if(!ready)input=el('p','Checking which of these targets use '+title+'…','note');
      else if(!t.editable.length)input=el('p',t.excluded.every(r=>this.statusOf(r).lg)?this.statusOf(t.excluded[0]).reason:'LG does not use '+title+' for any selected target.','note warn');
      else input=el('p','These targets have no range or choice in common. Narrow the selection, for example to one format.','note warn');
      if(control&&control.label&&control.label!==title&&input.tagName!=='SELECT')input.prepend(el('span',control.label,'control-label'));
      box.append(input);
      if(outside)box.append(el('p',outside,'note warn outside'));
      const meta=el('p',t.editable.length+' stored '+(t.editable.length===1?'value':'values')+(t.pending.length&&t.editable.length?' · '+t.pending.length+' still being checked':''),'note');
      if(onScreen){meta.append(' · ');meta.append(el('span','includes what’s on screen','live-note'));}
      box.append(meta);
      box.append(el('p',this.draftLine(t.editable),'note draft-line'));
      if(t.linked.length||t.chosen.some(r=>r.preference)) {
        const roles=[...new Set(t.affected.filter(r=>r.preference).map(r=>r.brightnessRole))].map(r=>r==='game_sdr'?'gaming':'movie').join(' and ');
        box.append(el('p','Linked SDR '+roles+' brightness is one shared value'+(t.linked.length?'. This edit also changes '+t.linked.length+' linked '+(t.linked.length===1?'target':'targets')+' outside your selection (dashed in the grid).':' for every linked preset.'),'note linked'));
      }
      if(this.profileMode()) {
        const inherit=el('div',undefined,'row-actions');
        inherit.append(el('p',this.inheritanceText(t.editable.length?t.editable:t.affected),'note inheritance'));
        const base=[...new Set((t.editable.length?t.editable:t.affected).map(r=>display(model.values(r.bank,this.state,'standard')[r.key])))];
        const edit=this.button('Base: '+base.join(' / ')+' · Edit Base',()=>this.editVariant('standard',true),'small','edit-base:'+alias);edit.setAttribute('aria-label','Edit Base for '+title);
        // Removing an override never writes a value, so it may also clean up
        // targets LG no longer uses; it waits for targets still being checked.
        const removable=t.affected.filter(r=>(!r.inherited||this.draft[this.entryId(r)])&&this.statusOf(r).state!=='pending');
        const reset=this.button('Follow Base',()=>this.stageInheritance(removable),'small','inherit:'+alias);reset.setAttribute('aria-label','Remove override for '+title);reset.title='Remove this profile’s override so it follows Base. This does not edit Base.';
        reset.dataset.inherit=removable.length?'1':'';if(this.status.editor_api<7)reset.title='Update LG Picture Bridge to 0.17.1 to return individual settings to Base';
        inherit.append(edit,reset);box.append(inherit);
      } else if(this.schema2()) {
        const overridden=[...new Set(t.editable.flatMap(r=>this.overriddenBy(r).map(p=>p.name)))];
        if(overridden.length)box.append(el('p','Overridden in '+overridden.join(', ')+' — those profiles keep their own value.','note profile-note'));
      }
      const temporary=t.chosen.filter(r=>r.managed&&Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key));
      if(temporary.length) {
        const row=el('div',undefined,'row-actions');row.append(el('p','Temporary on TV: '+[...new Set(temporary.map(r=>display(this.state.overrides[r.bank.id][r.key])))].join(' / '),'note temporary'));
        const restore=this.button('Restore saved value',()=>this.openActionReview('restore',temporary,'restore:'+alias),'small','restore:'+alias),keep=this.button('Keep adjustment',()=>this.openActionReview('save',temporary,'promote:'+alias),'small','promote:'+alias);
        restore.dataset.tempAction=keep.dataset.tempAction=temporary.some(r=>!this.statusOf(r).editable)?'blocked':'';row.append(restore,keep);box.append(row);
      }
      if(t.excluded.length) {
        const list=el('ul',undefined,'targets');
        for(const r of t.excluded) {
          const item=el('li',model.storedScope(r)+' — '+this.statusOf(r).reason);
          if(this.profileMode()&&!r.inherited)item.append(el('span',' · Saved override: '+display(r.value)+' · Base: '+display(model.values(r.bank,this.state,'standard')[r.key])));
          list.append(item);
        }
        box.append(this.details(t.excluded.length+' selected '+(t.excluded.length===1?'value is':'values are')+' skipped: LG doesn’t use '+title+' there','excluded-settings',list));
      }
      box.querySelectorAll('input,select').forEach(node=>node.setAttribute('aria-describedby','edit-context'+(descriptions[alias]?' help-'+alias:'')));
      return box;
    }
    draftLine(records) {
      const drafts=records.map(r=>this.draft[this.entryId(r)]).filter(Boolean);
      if(!drafts.length)return '';
      const ids=new Set(drafts.map(d=>d.id));
      return (drafts.some(d=>d.inherit)?'Draft: follow Base':'Draft: '+[...new Set(drafts.map(d=>display(d.value)))].join(' / '))+' for '+[...ids].length+' '+(ids.size===1?'entry':'entries')+' → '+this.profileName(this.variant)+' (not saved yet)';
    }
    renderGrid() {
      const host=this.gridHost;if(!host)return;host.replaceChildren();
      const alias=this.setting,spec=this.gridSpec(alias),t=this.targetsFor(alias);
      const chosen=new Set(t.chosen.map(r=>r.id)),linked=new Set(t.linked.map(r=>r.id));
      const head=el('div',undefined,'where-head');head.append(el('h4','Where'));
      const quick=el('div',undefined,'chips');
      if(this.onScreenTarget())quick.append(this.button('On screen now',()=>this.selectOnScreen(),'chip live-chip','target:live'));
      quick.append(this.button('Everything shown',()=>this.selectEverything(spec),'chip','target:all'));
      if(spec.kind==='preset'){for(const [family,label] of [['game','All Game presets'],['movie','All movie presets']])if(spec.rows.some(r=>model.presetFamily(r)===family))quick.append(this.button(label,()=>this.selectFamily(spec,family),'chip','target:family:'+family));}
      head.append(quick);host.append(head);
      const views=el('div',undefined,'chips views');
      if(spec.kind==='preset'&&(spec.hidden||this.allPresets))views.append(this.toggle(this.allPresets?'Showing all presets':'Show '+spec.hidden+' more presets',this.allPresets,()=>{this.allPresets=!this.allPresets;this.renderPanes();this.inspect();},'grid:all-presets','chip quiet'));
      if(spec.kind!=='port'&&this.hasInputTypes())views.append(this.toggle(this.allInputs?'Showing PC and video inputs':'Show PC and video inputs separately',this.allInputs,()=>{this.allInputs=!this.allInputs;this.renderPanes();this.inspect();},'grid:all-inputs','chip quiet'));
      if(views.childElementCount)host.append(views);
      if(spec.game) {
        const filters=el('div',undefined,'filters');
        const present=genres.filter(g=>spec.records.some(r=>r.bank.target.dimension.gameGenre===g));
        if(present.length>1)filters.append(this.filterChips('Game Optimizer genres','genres',present,g=>g==='USER'?'User':g));
        filters.append(this.filterChips('Game Optimizer with ALLM','allm',['off','on'],v=>v==='on'?'ALLM on':'ALLM off'));
        host.append(filters);
      }
      const wrap=el('div',undefined,'grid-wrap'),grid=el('div',undefined,'grid');
      grid.style.gridTemplateColumns='minmax(6.5em,max-content) repeat('+spec.columns.length+',minmax(3.6em,1fr))';
      const everyInput=spec.columns.every(c=>c.inputs.every(i=>this.target.inputs.includes(i))),corner=this.button(spec.kind==='port'?'All ports':'All inputs',()=>this.changeTarget(t=>{const all=spec.columns.flatMap(c=>c.inputs);t.inputs=everyInput?t.inputs.filter(i=>!all.includes(i)):[...new Set(t.inputs.concat(all))];}),'corner','cols:all');
      corner.setAttribute('aria-pressed',String(everyInput));grid.append(corner);
      for(const column of spec.columns) {
        const on=column.inputs.every(i=>this.target.inputs.includes(i)),b=this.button('',()=>this.toggleColumn(column),'colh','col:'+column.id);
        b.append(el('span',column.label.replace(/ \(PC\)$/,''),'colname'));
        b.append(el('small',/_pc$/.test(column.id)?'PC input':column.devices.length?column.devices.join(', '):spec.kind==='port'?'':'Video input'));
        if(this.isLive(column,null,'port')&&!this.status.offline)b.append(el('span','','dot'));
        b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',column.label+(column.devices.length?' ('+column.devices.join(', ')+')':'')+(on?' · selected':''));
        grid.append(b);
      }
      const groups=spec.kind==='port'?[[null,spec.rows]]:['sdr','hdr','dolbyHdr'].map(f=>[f,spec.rows.filter(r=>model.rowFormat(spec.kind,r)===f)]).filter(([,rows])=>rows.length);
      const selectedRows=this.rowList(spec.kind);
      for(const [format,rows] of groups) {
        if(format) {
          const count=rows.filter(r=>selectedRows.includes(r)).length,g=this.button(formatNames[format],()=>this.toggleRows(spec,rows),'grouph','group:'+format);
          g.setAttribute('aria-pressed',count===rows.length?'true':count?'mixed':'false');g.setAttribute('aria-label','All '+formatNames[format]+' '+(spec.kind==='range'?'signals':'presets'));grid.append(g);
        }
        for(const row of rows) {
          if(spec.kind==='port')grid.append(el('span','Port-wide','rowh static'));
          else {
            const on=selectedRows.includes(row),h=this.button(model.rowLabel(spec.kind,row),()=>this.toggleRows(spec,[row]),'rowh','row:'+row);
            h.setAttribute('aria-pressed',String(on));h.setAttribute('aria-label',(spec.kind==='preset'?model.modes[row]||row:formatNames[model.rowFormat('range',row)]+' '+model.rowLabel('range',row).toLowerCase())+(on?' · selected':''));grid.append(h);
          }
          for(const column of spec.columns)grid.append(this.cell(spec,column,row,chosen,linked));
        }
      }
      wrap.append(grid);host.append(wrap);
      const legend=el('div',undefined,'legend');
      const mark=(cls,text)=>{const s=el('span');s.append(el('i','', 'mk '+cls),document.createTextNode(text));legend.append(s);};
      mark('sel','Selected');if(this.onScreenTarget())mark('live','On screen');
      if(this.profileMode())mark('ovr','Override in '+this.profileName(this.variant));else if(this.schema2()&&(this.state.document.profiles||[]).length)mark('prof','A profile overrides this');
      if(spec.records.some(r=>r.preference))mark('link','Linked SDR brightness');
      if(spec.records.some(r=>Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)))mark('tmp','Temporary on TV');
      mark('na','n/a: LG doesn’t use it');if(spec.kind==='preset')mark('unused','Faded: input doesn’t select this preset');
      host.append(legend);
    }
    cell(spec,column,row,chosen,linked) {
      const records=this.cellRecords(spec,column,row),alias=this.setting,name=column.label+' · '+(spec.kind==='preset'?model.modes[row]||row:spec.kind==='range'?formatNames[model.rowFormat('range',row)]+' '+model.rowLabel('range',row).toLowerCase():'port-wide');
      const node=this.button('',()=>this.selectCell(spec,column,row),'cell','cell:'+column.id+':'+row);
      if(!records.length){node.disabled=true;node.textContent='·';node.classList.add('none');node.setAttribute('aria-label',name+': not stored');return node;}
      const editable=records.filter(r=>this.statusOf(r).editable),pending=records.filter(r=>this.statusOf(r).state==='pending');
      let sum,reason='';
      if(this.status.offline)sum=summarize(alias,records.map(r=>this.draftValue(r)));
      else if(editable.length)sum=summarize(alias,editable.map(r=>this.draftValue(r)));
      else if(pending.length)sum={text:'…',full:'checking'};
      else {sum={text:'n/a',full:'not used'};reason=this.statusOf(records[0]).reason||'';node.classList.add('excluded');}
      const marks=el('span',undefined,'marks'),flags=[];
      const add=(cls,label)=>{marks.append(el('i','', 'mk '+cls));flags.push(label);};
      if(this.isLive(column,row,spec.kind)&&!this.status.offline)add('live','on screen');
      if(this.profileMode()&&records.some(r=>!r.inherited))add('ovr','override in '+this.profileName(this.variant));
      else if(!this.profileMode()&&this.schema2()){const p=[...new Set(records.flatMap(r=>this.overriddenBy(r).map(p=>p.name)))];if(p.length)add('prof','overridden in '+p.join(', '));}
      if(records.some(r=>r.preference))add('link','linked SDR brightness');
      if(records.some(r=>Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)))add('tmp','temporary on TV');
      const selected=records.some(r=>chosen.has(r.id)),also=!selected&&records.some(r=>linked.has(r.id));
      const drafted=records.some(r=>this.draft[this.entryId(r)]);
      if(selected)node.classList.add('selected');if(also)node.classList.add('also');if(drafted)node.classList.add('drafted');if(sum.mixed)node.classList.add('mixed');
      if(spec.kind==='preset'&&!column.inputs.some(i=>(this.usage().get(i)||new Set()).has(row))&&column.inputs.some(i=>this.usage().has(i)))node.classList.add('unused');
      node.append(marks,el('span',sum.text,'cv'));
      node.setAttribute('aria-pressed',String(selected));
      const label=name+': '+(sum.full||sum.text)+(reason?' — '+reason:'')+(flags.length?' · '+flags.join(' · '):'')+(drafted?' · draft':'')+(also?' · also changes (linked)':'')+(records.length>1?' · '+records.length+' stored values':'');
      node.setAttribute('aria-label',label);node.title=label;
      return node;
    }
    storageDetails(alias) {
      const t=this.targetsFor(alias),list=el('ul',undefined,'targets');
      const linked=new Set(t.linked.map(r=>r.id));
      for(const r of t.affected)list.append(el('li',model.storedScope(r)+' · '+pretty(r.key)+': '+display(r.value)+(this.status.editor_api>=9?(r.managed?' · Temporary adjustments reset':' · Changes persist until edited again'):'')+(linked.has(r.id)?' · linked':'')));
      if(!t.affected.length)list.append(el('li','Nothing selected.'));
      return this.details('Exact TV storage for this selection ('+t.affected.length+')','storage:'+alias,list);
    }
    linksSection(alias) {
      // Only presets where LG uses brightness can change their link; the
      // bridge checks every profile's value before saving one.
      const t=this.targetsFor(alias),candidates=t.affected.filter(r=>model.brightnessRole(r.bank)),bankList=records=>[...new Map(records.map(r=>[r.bank.id,r.bank])).values()];
      const banks=bankList(candidates.filter(r=>this.lgStatus(r).editable)),skipped=bankList(candidates.filter(r=>!this.lgStatus(r).editable)).filter(b=>!banks.includes(b));
      const content=el('div',undefined,'links');
      content.append(el('p','Linked SDR gaming presets share one gaming brightness; linked SDR movie presets share one movie brightness. Each profile can override either value. Unlink a preset to give it its own brightness; unlinking keeps every profile’s current value.','note'));
      if(skipped.length)content.append(el('p',skipped.length+' selected '+(skipped.length===1?'preset is':'presets are')+' not listed: '+(candidates.some(r=>this.lgStatus(r).state==='pending')?'still being checked, or ':'')+'LG doesn’t use OLED pixel brightness there.','note warn'));
      if(!banks.length&&!skipped.length)content.append(el('p','Select SDR presets in the grid to link or unlink them.','note'));
      if(banks.length) {
        const actions=el('div',undefined,'row-actions');
        for(const [label,linked] of [['Link all shown',true],['Unlink all shown',false]]){const b=this.button(label,()=>this.openBrightnessReview(banks,linked,'brightness-links:'+linked),'small','brightness-links:'+linked);b.dataset.linkAction='';actions.append(b);}
        content.append(actions);
        for(const bank of banks) {
          const row=el('div',undefined,'diff'),label=el('div');label.append(el('strong',model.inputName(bank)+' · '+model.modes[bank.target.dimension.pictureMode]),el('p',bank.brightness_role?'Linked to shared '+(bank.brightness_role==='game_sdr'?'gaming':'movie')+' brightness':'Independent brightness','note'));
          const b=this.button(bank.brightness_role?'Unlink':'Link',()=>this.openBrightnessReview([bank],!bank.brightness_role,'brightness-link:'+bank.id),'small','brightness-link:'+bank.id);b.dataset.linkAction='';row.append(label,b);content.append(row);
        }
      }
      content.append(el('p','Save or discard staged value edits before changing links. Home Assistant’s shared sliders affect linked presets only.','note'));
      return this.details('SDR brightness links','brightness-links',content);
    }
    details(label,id,content) {
      const details=el('details'),summary=el('summary',label);summary.dataset.focus=id;details.open=this.expanded.has(id);
      const remember=()=>{if(details.open)this.expanded.add(id);else this.expanded.delete(id);};
      // Record immediately: the browser's queued toggle event can arrive after
      // a render, and detached details must never overwrite the new open state.
      summary.onclick=event=>{event.preventDefault();details.open=!details.open;remember();};
      details.ontoggle=()=>{if(details.isConnected)remember();};details.append(summary,content);return details;
    }
    backupButtons() {
      const download=this.button('Download backup',async()=>{try{this.download(await this.request({action:'backup'}));}catch(e){this.error(e.message);}},'small');
      const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
      file.onchange=async()=>{try{const selected=file.files[0];if(!selected||selected.size>1000000)throw new Error('Choose a JSON profile or backup smaller than 1 MB');const data=JSON.parse(await selected.text());if(!window.confirm('Replace saved standards with this file?'))return;await this.mutate(data.format==='lg-picture-bridge-backup'?{action:'restore_backup',backup:data,revision:this.state.revision}:{action:this.state.document?'import':'initialize',document:data,revision:this.state.revision,enabled:true,room:this.state.room});}catch(e){this.error(e.message);}};
      const importButton=this.button('Import',()=>file.click(),'small');importButton.disabled=!!this.status.offline;return [download,importButton,file];
    }
    sheetHead(sheet,title,note) {
      const head=el('div',undefined,'sheet-head');head.append(this.button('‹ Back to editing',()=>this.closeView(),'ghost','view-back'),el('h3',title));sheet.append(head);
      if(note)sheet.append(el('p',note,'note'));
    }
    renderManage(sheet) {
      this.sheetHead(sheet,this.schema2()?'Manage profiles':'Named profiles');
      let backup=null;
      if(this.adapter.fileTransfer!==false){const row=el('div',undefined,'row-actions');backup=el('div',undefined,'section');row.append(...this.backupButtons());backup.append(el('h4','Backup'),el('p','Home Assistant keeps automatic backups. Download one, or import a backup or profile collection to replace the saved standards.','note'),row);}
      if(!this.schema2()) {
        if(this.status.editor_api>=6){const b=this.button('Enable named profiles',()=>this.profileCommand({action:'upgrade_profiles'}));b.dataset.profileAction='';sheet.append(el('p','Named profiles inherit Base and can be selected by Home Assistant. Upgrading keeps your Bright/Dark values and temporary adjustments.','note'),b);}
        else sheet.append(el('p','Update LG Picture Bridge to use named profiles.','note'));
      } else {
        const doc=this.state.document,list=el('ul',undefined,'targets');
        for(const p of doc.profiles) {
          const count=doc.banks.reduce((n,b)=>n+Object.keys((b.variants||{})[p.id]||{}).length,0)+Object.keys(p.brightness||{}).length;
          list.append(el('li',p.name+' · '+(count?count+' '+(count===1?'override':'overrides'):'follows Base everywhere')+' · ID '+p.id+(p.id===this.state.active_profile?' · on TV now':'')));
        }
        const fields=el('div',undefined,'section');fields.append(el('h4','Profiles'),list);
        const nameLabel=el('label',undefined,'field'),name=el('input');name.type='text';name.maxLength=64;name.placeholder='e.g. Evening';name.value=this.profileNameDraft||'';name.dataset.focus='profile-name';name.setAttribute('aria-label','Profile name');name.oninput=()=>{this.profileNameDraft=name.value;};nameLabel.append(el('span','Profile name'),name);
        const actions=el('div',undefined,'row-actions'),make=copy=>this.profileCommand({action:'create_profile',name:name.value.trim(),copy_from:copy});
        actions.append(this.button('New from Base',()=>make('standard')));
        const selected=this.variant!=='standard'?this.profileName(this.variant):null;
        if(selected)actions.append(this.button('Duplicate '+selected,()=>make(this.variant)),this.button('Rename '+selected,()=>this.profileCommand({action:'rename_profile',profile_id:this.variant,name:name.value.trim()})),this.button('Reset '+selected+' to Base',()=>this.reviewProfile('reset_profile')),this.button('Delete '+selected,()=>this.reviewProfile('delete_profile')));
        const create=el('div',undefined,'section');create.append(el('h4',selected?'New profile or change '+selected:'New profile'),nameLabel,actions,
          el('p',selected?'Actions apply to '+selected+', the profile you are editing. Pick another tab to change a different profile. Duplicating copies only its overrides; Reset removes all of them.':'Pick a profile tab to rename, duplicate, reset or delete it.','note'));
        if(selected)create.append(el('p','Automation profile ID: '+this.variant+'. Renaming keeps this ID.','note'));
        sheet.append(fields,create);
      }
      if(this.status.editor_api>=8) {
        const native=el('div',undefined,'section');native.append(el('h4','Native settings catalog · '+this.state.document.banks.length+' browsable groups'),
          el('p',this.status.editor_api>=9?'Browsing reads LG’s values without adding them to profile management. In Base, native-only edits save directly to LG. Adding a named override or brightness link saves only the baseline needed to restore that setting. Home Assistant receives a complete native backup.':'Discover every preset and game genre offered by this TV. Existing values become Base without changing the picture.','note'));
        const discover=this.button(this.status.editor_api>=9?'Refresh native catalog':'Discover native presets and genres',()=>this.mutate({action:'include_native_catalog',revision:this.state.revision}),undefined,'native-catalog');native.append(discover);sheet.append(native);
      }
      sheet.querySelectorAll('.section button,.sheet>button').forEach(b=>{b.dataset.profileAction='';});
      if(backup)sheet.append(backup);
    }
    renderTv(sheet) {
      const c=this.state.context||{},choices=model.profileOptions(this.state.document);
      this.sheetHead(sheet,'TV profile & automation','Choosing what the TV uses is separate from editing. Editing Base or a profile never changes this selection.');
      const now=el('div',undefined,'section');now.append(el('h4','On screen'),el('p',this.status.offline?'TV offline · showing saved backup':c.ready?[model.inputName(c.input),model.modes[c.mode]||c.mode,c.range?(formatNames[c.range.replace(/ALLM$/,'')]||c.range)+(/ALLM$/.test(c.range)?' with ALLM':''):null].filter(Boolean).join(' · '):'No HDMI picture right now.'));
      sheet.append(now);
      if(this.schema2()) {
        const use=el('div',undefined,'section'),selected=this.applyChoice||this.state.selection||'automatic';
        use.append(el('h4','Profile in use: '+this.profileName(this.state.active_profile)+' · '+(this.state.selection==='automatic'?'Automatic':'Manual')));
        const fields=el('div',undefined,'fields');fields.append(this.select('Profile to apply',[['automatic','Automatic'],...choices.map(([id,l])=>[id,id==='standard'?'Base':l])],selected,id=>{this.applyChoice=id;}));use.append(fields);
        use.append(this.button('Apply profile',()=>this.profileCommand({action:'apply_profile',profile_id:this.applyChoice||this.state.selection||'automatic'}),'tv-primary','profile-apply'));
        use.append(el('p','Applying a profile also clears temporary adjustments. Automatic follows Home Assistant’s bright/dark room context from the sun; a manual choice stays until you pick Automatic again.','note'));
        const bindings=el('div',undefined,'section'),automatic=this.automaticDraft||{...this.state.document.automatic},grid=el('div',undefined,'fields');
        for(const [key,label] of [['bright','Automatic bright room'],['dark','Automatic dark room']])grid.append(this.select(label,choices.map(([id,l])=>[id,id==='standard'?'Base':l]),automatic[key],id=>{this.automaticDraft={...automatic,[key]:id};automatic[key]=id;}));
        bindings.append(el('h4','Automatic bindings'),grid,this.button('Save automatic bindings',()=>this.profileCommand({action:'set_automatic',profiles:this.automaticDraft||this.state.document.automatic})));
        sheet.append(use,bindings);
      }
      const manage=el('div',undefined,'section'),management=this.button(this.state.enabled?'Profile management: On':'Profile management: Off',()=>this.mutate({action:'set_enabled',enabled:!this.state.enabled}),undefined,'management');management.setAttribute('aria-pressed',String(this.state.enabled));
      manage.append(el('h4','Profile management'),management,el('p','Profile management applies saved profiles and resets temporary adjustments to their saved values after a power cycle.','note'));sheet.append(manage);
      // Temporary values are compared with the profile in use on the TV, not
      // the one being edited.
      const temporary=this.records().filter(r=>r.managed&&Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)),active=this.state.active_profile||this.state.room;
      const temp=el('div',undefined,'section');temp.append(el('h4','Temporary adjustments · '+temporary.length));
      if(temporary.length) {
        const list=el('ul',undefined,'targets');for(const r of temporary)list.append(el('li',pretty(r.alias)+' · '+model.storedScope(r)+': '+display(this.state.overrides[r.bank.id][r.key])+' (saved in '+this.profileName(active)+': '+display(model.values(r.bank,this.state,active)[r.key])+')'));temp.append(list);
        const actions=el('div',undefined,'row-actions'),restore=this.button('Restore all to saved values',()=>this.openActionReview('restore',temporary,'restore'),undefined,'restore'),keep=this.button('Keep all adjustments',()=>this.openActionReview('save',temporary,'promote'),undefined,'promote');
        restore.dataset.tempAction=keep.dataset.tempAction=temporary.some(r=>!this.statusOf(r).editable)?'blocked':'';actions.append(restore,keep);temp.append(actions);
      } else temp.append(el('p','Nothing on the TV differs from its saved values.','note'));
      sheet.append(temp);
      sheet.querySelectorAll('.section button').forEach(b=>{if(!('tempAction' in b.dataset))b.dataset.profileAction='';});
    }
    // Drafts need a fresh review after a new saved revision, or when LG now
    // reports a different native-only value than the one they replace (the
    // bridge rejects a native save whose expected value is out of date).
    draftsStale() {
      const entries=Object.values(this.draft);
      return entries.length>0&&(this.draftRevision!==this.state.revision||entries.some(e=>{
        if(!e.nativeOnly||e.inherit||e.preference)return false;
        const settings=(this.live[e.bank_id]||{}).settings;
        return !!settings&&Object.hasOwn(settings,e.key)&&!model.same(settings[e.key],e.before);
      }));
    }
    updateFooter() {
      if(!this.reviewButton)return;const entries=Object.values(this.draft);
      const stale=this.draftsStale(),order=model.profileOptions(this.state.document).map(p=>p[0]),destinations=[...new Set(entries.map(e=>e.variant))].sort((x,y)=>order.indexOf(x)-order.indexOf(y)).map(v=>this.profileName(v));
      this.counts.textContent=entries.length?entries.length+' staged '+(entries.length===1?'change':'changes')+' → '+destinations.join(' + '):'No staged changes';
      this.footer.classList.toggle('dirty',!!entries.length);
      this.reviewButton.textContent=stale?'Review against latest':entries.length?'Review '+entries.length+' changes':'Review changes';this.reviewButton.disabled=!this.writable()||!entries.length||!!this.review;
      this.discardButton.disabled=!entries.length||!!this.review;
      this.shadowRoot.querySelectorAll('[data-profile-action]').forEach(b=>b.disabled=!this.writable()||!!entries.length||!!this.review);
      this.shadowRoot.querySelectorAll('[data-link-action]').forEach(b=>b.disabled=!this.writable()||this.status.editor_api<5||!!entries.length||!!this.review);
      this.shadowRoot.querySelectorAll('[data-temp-action]').forEach(b=>b.disabled=!this.writable()||b.dataset.tempAction==='blocked'||!!entries.length||!!this.review);
      this.shadowRoot.querySelectorAll('[data-inherit]').forEach(b=>{b.disabled=!this.writable()||this.status.editor_api<7||!!this.review||!b.dataset.inherit;});
    }
    openEditReview() {
      try {
        if(this.draftsStale()){for(const entry of Object.values(this.draft)){
          const r=this.entryRecord(entry);entry.before=r.value;
          if(entry.inherit)entry.value=model.values(r.bank,this.state,'standard')[r.key];
          const affected=r.preference?this.recordsFor(entry.variant).filter(t=>t.preference===r.preference):[r];
          entry.targets=affected.map(t=>({id:t.id,scope:model.storedScope(t)}));
          if(this.entryApplied(entry))delete this.draft[entry.id];
        }this.draftRevision=this.state.revision;}
        const entries=Object.values(this.draft);if(!entries.length){this.render();return;}
        const reviewed=JSON.parse(JSON.stringify(entries));
        if(this.schema2())for(const entry of reviewed)if(entry.variant==='standard')entry.baseImpact=this.baseImpact(this.entryRecord(entry));
        this.review={action:'edit_many',revision:this.draftRevision,entries:reviewed,returnFocus:'review'};this.render({key:'review-back',neighbors:[]},false);
      } catch(e){this.error(e.message);}
    }
    async openActionReview(action,records,returnFocus) {
      if(this.busy)return;
      const chosen=records.filter(r=>r.managed).map(r=>({id:r.id,target:JSON.stringify(r.bank.target)}));
      this.busy=true;this.lockControls();const refreshed=await this.refresh();this.busy=false;
      if(!refreshed||!this.writable()){this.render();if(refreshed===null)this.error('The view was refreshed meanwhile. Choose the action again.');else if(!refreshed)this.error('Could not refresh the TV. Try again before reviewing adjustments.');return;}
      const selection={},expected={},entries=[];
      const active=this.state.active_profile||this.state.room,current=this.recordsFor(active),selected=chosen.map(c=>current.find(r=>r.id===c.id&&JSON.stringify(r.bank.target)===c.target));
      if(selected.some(r=>!r)){this.render();this.error('Selected settings changed. Select them again.');return;}
      const shared=new Map();
      for(const r of selected) {
        const temp=(this.state.overrides||{})[r.bank.id]||{},has=Object.hasOwn(temp,r.key);if(action==='save'&&!has)continue;
        (selection[r.bank.id]||(selection[r.bank.id]=[])).push(r.key);
        if(has)(expected[r.bank.id]||(expected[r.bank.id]={}))[r.key]=temp[r.key];
        const bank=r.bank,saved=model.values(bank,this.state,active)[r.key];
        if(action==='save'&&r.preference) {
          if(shared.has(r.preference)&&!model.same(shared.get(r.preference).value,temp[r.key])){this.render();this.error('Selected temporary brightness values conflict. Adjust them to the same value before keeping them.');return;}
          shared.set(r.preference,{preference:r.preference,label:pretty(r.alias),variant:active,before:saved,value:temp[r.key],targets:current.filter(t=>t.preference===r.preference).map(t=>({scope:model.storedScope(t)}))});
        } else entries.push({label:pretty(r.alias),variant:active,before:action==='save'?saved:has?temp[r.key]:(this.live[bank.id]||{settings:{}}).settings[r.key],value:action==='save'?temp[r.key]:saved,targets:[{scope:model.storedScope(r)}]});
      }
      entries.push(...shared.values());
      if(!entries.length){this.render();this.error('No tracked temporary adjustments in this selection.');return;}
      this.review={action,selection,expected,profile_id:this.state.active_profile,room:this.state.room,revision:this.state.revision,entries,returnFocus};this.render({key:'review-back',neighbors:[]},false);
    }
    closeReview() {const key=this.review.returnFocus||'review';this.review=null;this.render({key,neighbors:[]},false);if(this.view==='edit')this.inspect();}
    renderReview(sheet) {
      const r=this.review,variants=[...new Set(r.entries.map(e=>e.variant))];
      const editTitle=this.schema2()&&variants.length===1?(variants[0]==='standard'?'Review Base changes':'Review '+this.profileName(variants[0])+' overrides'):'Review settings changes';
      const head=el('div',undefined,'sheet-head');head.append(el('h3',r.action==='delete_profile'?'Delete profile':r.action==='reset_profile'?'Reset profile to base':r.action==='set_brightness_links'?'Review brightness links':r.action==='edit_many'?editTitle:r.action==='restore'?'Restore '+this.profileName(this.state.active_profile||this.state.room)+' standards':'Keep adjustments in '+this.profileName(this.state.active_profile||this.state.room)));sheet.append(head);
      if(r.action==='edit_many')sheet.append(el('p','Nothing is written until you save. Each change lists the exact TV storage it replaces.','note'));
      for(const entry of r.entries) {
        const row=el('div',undefined,'diff'+(entry.variant==='standard'?' to-base':entry.variant==='All profiles'?'':' to-profile')),label=el('div');label.append(el('strong',entry.label),el('p','Save to: '+this.profileName(entry.variant)+(entry.preference?' · Shared brightness':''),'destination'));
        const list=el('ul',undefined,'targets');entry.targets.forEach(t=>list.append(el('li',t.scope)));label.append(list);
        if(entry.inherit)label.append(el('p','Remove the override and follow future Base changes. Other profile overrides remain saved.','note'));
        if(entry.inherit&&entry.cleanup)label.append(el('p','Clean-up only: '+entry.cleanup.replace(/\.$/,'')+'. Removing this unused override writes no value to the TV.','note warn'));
        if(entry.baseImpact) {
          if(entry.baseImpact.inherited.length)label.append(el('p','Profiles following this Base value: '+entry.baseImpact.inherited.join(', ')+'.','note'));
          if(entry.baseImpact.overridden.length)label.append(el('p','Existing overrides stay in: '+entry.baseImpact.overridden.join(', ')+'.','note'));
        }
        if(entry.nativeOnly&&entry.variant==='standard')label.append(el('p','Saved directly on the TV. Future adjustments to this value persist until you change them again.','note'));
        row.append(label,el('span',display(entry.before)+' → '+(entry.inherit?'Base: ':'')+display(entry.value),'value'));sheet.append(row);
      }
      const excluded=[...new Map(r.entries.flatMap(e=>e.excluded||[]).map(e=>[e.id,e])).values()];
      if(excluded.length) {
        sheet.append(el('h3','Excluded from these edits'));
        const list=el('ul',undefined,'targets');for(const item of excluded)list.append(el('li',item.scope+' — '+item.reason));sheet.append(list);
      }
      const actions=el('div',undefined,'row-actions review-actions');actions.append(this.button('Back to editing',()=>this.closeReview(),undefined,'review-back'),this.button(r.action==='delete_profile'?'Delete profile':r.action==='reset_profile'?'Reset profile':r.action==='set_brightness_links'?'Save brightness links':r.action==='edit_many'?(this.schema2()?this.saveDestination(r.entries):'Save standards'):r.action==='restore'?'Restore selected settings':'Keep these adjustments',()=>this.confirmReview(),'primary','review-confirm'));sheet.append(actions);
    }
    async confirmReview() {
      const r=this.review;if(!r)return;
      if(['delete_profile','reset_profile'].includes(r.action)){await this.mutate({action:r.action,profile_id:r.profile_id,revision:r.revision});return;}
      if(r.action==='set_brightness_links'){await this.mutate({action:r.action,links:r.links,revision:r.revision});return;}
      if(r.action!=='edit_many'){await this.mutate({action:r.action,selection:r.selection,expected:r.expected,room:r.room,profile_id:r.profile_id,revision:r.revision});return;}
      const edits=new Map(),preferences={};
      for(const entry of r.entries) {
        if(entry.inherit&&this.status.editor_api<7){this.error('Update LG Picture Bridge to 0.17.1 to remove individual overrides.');return;}
        if(entry.preference&&!this.schema2()){preferences[entry.preference]=Number(entry.value);continue;}
        const id=entry.bank_id+':'+entry.variant;if(!edits.has(id))edits.set(id,{bank_id:entry.bank_id,variant:entry.variant,settings:{}});
        const edit=edits.get(id);if(entry.inherit){edit.inherit=edit.inherit||[];edit.inherit.push(entry.key);}else {edit.settings[entry.key]=entry.value;if(this.status.editor_api>=9)(edit.expected||(edit.expected={}))[entry.key]=entry.before;}
      }
      await this.mutate({action:'edit_many',edits:[...edits.values()],preferences,revision:r.revision});
    }
    async mutate(command) {
      if(this.busy)return;const returnFocus=this.review&&(this.review.action==='edit_many'?'setting:'+this.setting:this.review.returnFocus),focus=this.review?(returnFocus?{key:returnFocus,neighbors:[]}:null):this.captureFocus();this.busy=true;++this.epoch;this.lockControls();let message,error=false;
      try {
        const reply=await this.request(command);
        if(command.action==='create_profile'&&reply.profile_id){this.variant=reply.profile_id;this.profileNameDraft='';}
        if(command.action==='set_automatic')this.automaticDraft=null;
        if(command.action==='apply_profile')this.applyChoice=null;
        if(command.action==='delete_profile'&&this.view==='profiles')this.variant='standard';
        if(['edit_many','initialize','import','restore_backup'].includes(command.action))this.draft={};this.review=null;this.resetLive();
        if(!await this.refresh())throw new Error('Command accepted, but the saved state could not be refreshed');
        message=this.status.pending_restore?'Standards saved. TV application is pending; the bridge will retry.':'Saved on the TV. Backup is sent to Home Assistant.';
      } catch(e) {
        error=true;this.review=null;await this.refresh(true);
        // A lost reply may follow a successful atomic commit. Re-read before
        // retrying, retaining only edits not confirmed in the saved document.
        for(const entry of Object.values(this.draft))try{if(this.entryApplied(entry))delete this.draft[entry.id];}catch(_){}
        message=e.message+(Object.keys(this.draft).length?' Unsaved drafts remain for review.':'');
      } finally {this.busy=false;this.render(focus);const n=this.shadowRoot.querySelector('.message');if(n){n.textContent=message;n.classList.toggle('error',error);}}
    }
    download(value) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=el('a');a.href=url;a.download='lg-picture-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  const styles=`
  :host{--bg:#0e1726;--surface:#14223a;--raised:#1d2e4a;--line:#2b3d5a;--text:#eaf0f8;--muted:#a9b8cc;--base:#8fe3d2;--base-ink:#05211c;--profile:#cdb9ff;--profile-ink:#1b1037;--live:#7cc8ff;--warn:#ffd28a;--bad:#ffb3bb;
    display:block;height:100%;min-height:0;color:var(--text);background:var(--bg);font:16px/1.4 system-ui,Arial,sans-serif;color-scheme:dark}
  @media(min-width:1500px){:host{font-size:21px}}
  *{box-sizing:border-box}
  button,select,input{font:inherit;color:inherit}
  button,select,input[type=number],input[type=text]{background:var(--raised);border:1px solid #475a78;border-radius:.5em;padding:.4em .7em;min-height:2.5em;max-width:100%}
  button{cursor:pointer}button:disabled{opacity:.42;cursor:default}
  :focus-visible{outline:3px solid #fff;outline-offset:2px}
  [data-editing]{outline:3px solid var(--warn)!important;outline-offset:2px}
  p{margin:0}
  .frame{--accent:var(--base);--ink:var(--base-ink);--tint:rgba(143,227,210,.13);height:100%;display:flex;flex-direction:column;gap:.55em;padding:.9em 1.2em;overflow:hidden;container:frame/inline-size}
  .frame.profile{--accent:var(--profile);--ink:var(--profile-ink);--tint:rgba(205,185,255,.15)}
  .primary,.chip[aria-pressed=true],.tab[aria-pressed=true]{background:var(--accent);color:var(--ink);border-color:var(--accent);font-weight:600}
  .ghost,.quiet{background:transparent}
  .small{min-height:2.2em;font-size:.88em;padding:.3em .65em}
  .top{display:flex;align-items:center;justify-content:space-between;gap:.5em;flex-wrap:wrap}
  .top h2{margin:0;font-size:1.4em;font-weight:600}.actions,.row-actions,.chips,.tabs{display:flex;flex-wrap:wrap;gap:.4em;align-items:center}
  .context{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:.55em}
  .card{border:1px solid var(--line);border-radius:.75em;padding:.55em .8em;background:var(--surface);display:flex;flex-direction:column;gap:.35em;min-width:0}
  .edit-card{border-color:var(--accent);box-shadow:inset 5px 0 0 var(--accent);padding-left:1.05em}
  .tabs .card-label{margin-right:.4em}.tv-line{display:flex;flex-wrap:wrap;align-items:center;gap:.3em .7em}.tv-line button{margin-left:auto}
  .card-label{font-size:.7em;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .edit-card .card-label{color:var(--accent)}
  .edit-note,.using{font-size:.85em;color:var(--muted)}
  .tv-card{justify-content:center}.tv-card .now{display:flex;align-items:center;gap:.45em}
  .dot{display:inline-block;width:.6em;height:.6em;border-radius:50%;background:var(--live);flex:none}
  .body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(14em,30%) minmax(0,1fr);gap:.55em}
  .body.single{grid-template-columns:minmax(0,1fr)}
  .list,.detail,.sheet{min-height:0;overflow:auto;border:1px solid var(--line);border-radius:.75em;background:var(--surface);scroll-padding:3.5em .5em .5em}
  .list{padding-bottom:.5em}
  .list-head{position:sticky;top:0;z-index:1;background:var(--surface);padding:.55em .8em;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:.3em;align-items:flex-start}
  .list-for{font-weight:600;font-size:.92em}
  .list h4,.where h4,.section h4{margin:.9em .8em .25em;font-size:.7em;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .item{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:.6em;width:100%;text-align:left;background:transparent;border:0;border-left:4px solid transparent;border-radius:0;padding:.4em .8em;min-height:2.6em;align-items:center}
  .item[aria-current=true]{background:var(--raised);border-left-color:var(--accent)}
  .item .name{overflow:hidden;text-overflow:ellipsis}
  .item .v{font-variant-numeric:tabular-nums;font-weight:600;max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .v.na{color:var(--muted);font-weight:400}.v.mixed{color:var(--warn)}.v.draft{color:var(--accent)}
  .item .meta{grid-column:1/-1;font-size:.75em;color:var(--muted)}
  .detail{padding:.85em 1em;display:flex;flex-direction:column;gap:.7em}
  .detail-main{display:flex;flex-direction:column;gap:.8em}.extras{display:flex;flex-direction:column;gap:.4em;min-width:0}
  .detail-head{display:flex;flex-direction:column;gap:.3em;align-items:flex-start}
  .setting-title{margin:0;font-size:1.3em}.help{font-size:.88em;color:var(--muted);max-width:60em}
  .pane-back{display:none}
  .valuebox{border:2px solid var(--accent);border-radius:.75em;padding:.65em .9em;background:linear-gradient(var(--tint),var(--tint)),var(--surface);display:flex;flex-direction:column;gap:.4em}
  .valuebox .card-label{color:var(--accent)}
  .for{font-weight:600}.for .card-label{margin-right:.3em}
  .range{display:flex;gap:.6em;align-items:center}.range input[type=range]{flex:1;min-width:4em;accent-color:var(--accent)}.range input[type=number]{width:6.5em}
  .valuebox select{width:min(100%,22em)}
  .note{font-size:.85em;color:var(--muted)}.note:empty{display:none}.note.warn,.temporary{color:var(--warn)}.draft-line{color:var(--accent);font-weight:600}.live-note{color:var(--live)}.linked{color:var(--text)}
  .inheritance{flex-basis:100%;color:var(--text)}.profile-note{color:var(--profile)}
  .where{display:flex;flex-direction:column;gap:.45em}
  .where-head{display:flex;flex-wrap:wrap;gap:.4em;align-items:center}.where-head h4{margin:0 .3em 0 0}
  .chip{font-size:.85em;min-height:2.2em;padding:.25em .65em}
  .filters{display:flex;flex-wrap:wrap;gap:.4em 1.2em}
  .filters .chip[aria-pressed=true]{background:var(--tint);color:var(--text);border-color:var(--accent);font-weight:400}
  .filters .chip[aria-pressed=false]{color:var(--muted);text-decoration:line-through}
  fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-size:.75em;color:var(--muted);margin:0 0 .25em;padding:0}
  .grid-wrap{overflow-x:auto;padding:3px}
  .grid{display:grid;gap:4px;align-items:stretch}
  .corner{font-size:.8em;background:transparent;border-color:var(--line);align-self:stretch;padding:.2em .4em;white-space:nowrap}.corner[aria-pressed=true]{border-color:var(--accent);background:var(--tint)}
  .colh{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:.1em;padding:.3em .2em;min-height:3.3em;background:transparent;border-color:var(--line);min-width:0;position:relative}
  .colh .colname{font-weight:600;font-size:.9em;white-space:nowrap}
  .colh small{font-size:.7em;color:var(--muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .colh .dot{position:absolute;top:.35em;right:.35em;width:.5em;height:.5em}
  .colh[aria-pressed=true],.rowh[aria-pressed=true]{border-color:var(--accent);background:var(--tint)}
  .grouph{grid-column:1/-1;text-align:left;font-size:.72em;font-weight:700;letter-spacing:.09em;text-transform:uppercase;background:transparent;border:0;border-bottom:1px solid var(--line);border-radius:0;color:var(--muted);min-height:2.2em;padding:.4em .3em .2em;margin-top:.3em}
  .grouph[aria-pressed=true]{color:var(--accent);border-bottom-color:var(--accent)}.grouph[aria-pressed=mixed]{color:var(--text)}
  .rowh{text-align:left;font-size:.88em;background:transparent;border-color:var(--line);padding:.25em .55em;min-height:2.4em;white-space:nowrap}
  .rowh.static{display:flex;align-items:center;color:var(--muted)}
  .cell{position:relative;min-width:0;min-height:2.4em;padding:.25em .2em;background:var(--bg);border:1px solid var(--line);font-variant-numeric:tabular-nums;font-size:.92em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cell .cv{display:block;overflow:hidden;text-overflow:ellipsis}
  .cell.selected{border:2px solid var(--accent);background:var(--tint);font-weight:600}
  .cell.also{border:2px dashed var(--accent)}
  .cell.drafted .cv{color:var(--accent);font-weight:700}.cell.drafted::after{content:'';position:absolute;inset:auto 25% 3px;height:2px;background:var(--accent);border-radius:2px}
  .cell.mixed .cv{color:var(--warn)}
  .cell.excluded{color:var(--muted);background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,.05) 6px 12px)}
  .cell.unused:not(.selected) .cv{opacity:.5}
  .cell.none{border-style:dotted;color:#475a78;background:transparent}
  .marks{position:absolute;top:3px;left:3px;display:flex;gap:2px}
  .mk{display:inline-block;width:.45em;height:.45em;border-radius:50%;flex:none}
  .mk.live{background:var(--live)}.mk.ovr{background:var(--profile);border-radius:1px;transform:rotate(45deg)}.mk.prof{border:1.5px solid var(--profile);border-radius:1px;transform:rotate(45deg)}
  .mk.link{width:.8em;height:.2em;border-radius:1px;background:var(--text);margin-top:.12em}.mk.tmp{background:var(--warn)}
  .legend .mk.sel{width:.9em;height:.9em;border-radius:.2em;border:2px solid var(--accent);background:var(--tint)}
  .legend .mk.na{width:.9em;height:.9em;border-radius:.2em;border:1px solid var(--line);background:repeating-linear-gradient(135deg,transparent 0 2px,rgba(255,255,255,.25) 2px 4px)}
  .legend .mk.unused{width:.9em;height:.9em;border-radius:.2em;border:1px solid var(--line);opacity:.5}
  .legend{display:flex;flex-wrap:wrap;gap:.3em 1em;font-size:.75em;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:.4em}
  details summary{cursor:pointer;font-size:.85em;color:var(--muted);padding:.3em 0}
  .targets{padding:0;list-style:none;margin:.3em 0;font-size:.82em;color:var(--muted)}.targets li{border-top:1px solid var(--line);padding:.3em 0;overflow-wrap:anywhere}
  .links .diff{grid-template-columns:1fr auto}
  .sheet{padding:.9em 1.2em}
  .sheet-head{display:flex;align-items:center;gap:.8em;flex-wrap:wrap;margin-bottom:.6em}.sheet h3{margin:.2em 0;font-size:1.2em}
  .section{border-top:1px solid var(--line);padding:.5em 0 .8em;display:flex;flex-direction:column;gap:.5em;align-items:flex-start}.section h4{margin:.4em 0 0}
  .field{display:flex;flex-direction:column;gap:.25em;min-width:0}.field>span{font-size:.78em;color:var(--muted)}
  .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(14em,100%),22em));gap:.6em;width:100%}
  .section>.field{width:min(100%,24em)}
  .tv-primary{background:var(--live);color:#04223a;border-color:var(--live);font-weight:600}
  .diff{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.8em;border-bottom:1px solid var(--line);padding:.6em 0}
  .diff.to-base{box-shadow:inset 4px 0 0 var(--base);padding-left:.8em}.diff.to-profile{box-shadow:inset 4px 0 0 var(--profile);padding-left:.8em}
  .diff .value{font-variant-numeric:tabular-nums;font-weight:600}
  .destination{font-size:.85em;color:var(--accent);margin:.15em 0}.to-base .destination{color:var(--base)}.to-profile .destination{color:var(--profile)}
  .review-actions{margin-top:.8em}
  .footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5em;padding:.45em .7em;border:1px solid var(--line);border-radius:.75em;background:var(--surface)}
  .footer.dirty{border-color:var(--accent);box-shadow:inset 5px 0 0 var(--accent)}
  .counts{font-size:.9em}.footer.dirty .counts{color:var(--accent);font-weight:600}
  .status{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.2em 1em}
  .message,.notice,.remote-help{font-size:.82em;color:var(--muted)}.message{min-height:1.2em}.notice{color:var(--warn)}.error{color:var(--bad)}
  .empty{padding:1em;color:var(--muted)}.static{font-size:1.05em}
  .control-label{font-size:.8em;color:var(--muted);margin-right:.4em}
  @container frame (min-width:1100px){
    .detail-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(16em,22em);grid-template-areas:'where value' 'extras value';align-items:start;gap:.8em 1em}
    .detail-main>.valuebox{grid-area:value;position:sticky;top:0;z-index:1}.detail-main>.where{grid-area:where}.detail-main>.extras{grid-area:extras}
  }
  @container frame (max-width:860px){
    .context{grid-template-columns:minmax(0,1fr)}
    .body{grid-template-columns:minmax(0,1fr)}
    .body[data-pane=list] .detail{display:none}.body[data-pane=detail] .list{display:none}
    .pane-back{display:inline-block}
    .tv-card .using{flex-basis:100%}.tv-card button{margin-left:0}
  }
  @container frame (max-width:480px){
    .top h2{font-size:1.15em}.card{padding:.45em .6em}.edit-card{padding-left:.9em}
    .tab,.top button{min-height:2.3em;padding:.3em .55em;font-size:.9em}
    .grid{gap:3px}.cell{font-size:.85em}.rowh{font-size:.8em;padding:.2em .35em}.colh .colname{font-size:.8em}
    .detail{padding:.7em .6em}.valuebox{padding:.55em .65em}
    .footer{row-gap:.3em}.footer .actions{flex-wrap:wrap;justify-content:flex-end;margin-left:auto}.footer button{font-size:.85em;padding:.3em .55em;white-space:nowrap}.counts{font-size:.8em;flex:1 1 9em;min-width:0}
  }
  @media(max-width:650px){.frame{padding:.6em .6em;gap:.45em}}
  `;
  if(!customElements.get('lg-profile-editor'))customElements.define('lg-profile-editor',Editor);
}());
