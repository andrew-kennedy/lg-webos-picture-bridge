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
    backlight:'Sets how much light the OLED panel emits. SDR movie brightness uses the Bright and Dark room values; HDR and Dolby Vision have their own saved values.',
    contrast:'Adjusts the difference between light and dark areas. Raising it can make bright shades harder to distinguish.',
    brightness:'Adjusts how dark the picture’s black and shadow areas appear. Too high can make black look gray; too low can hide shadow detail.',
    color:'Adjusts color intensity. Higher values make colors more saturated; this does not change the HDMI signal’s bit depth.',
    tint:'Shifts the balance between red and green. Zero leaves this balance centered.',
    sharpness:'Emphasizes outlines to make edges look crisper. Higher values can add halos; they cannot recover missing source detail.',
    colorTemperature:'Shifts whites toward warm/red or cool/blue. Negative values are warmer (−40 means Warm 40); positive values are cooler.',
    colorGamut:'Chooses the range of colors the TV uses. Auto follows the content; forcing a wider gamut can make ordinary colors look oversaturated.',
    gamma:'Controls the brightness of SDR midtones. Lower gamma makes them lighter; higher gamma makes them darker. HDR uses a different brightness curve.',
    gammaLevel:'Fine adjustment for LG’s adjustable 2.2 gamma option (mediumHavingLevel). Other gamma options do not use this offset.',
    peakBrightness:'Controls the panel’s maximum brightness level, including bright highlights. It is separate from overall OLED pixel brightness.',
    hdrDynamicToneMapping:'Fits HDR highlights into the TV’s brightness range. On adapts to the scene; HGiG is intended for games calibrated to the display. Off disables the dynamic adjustment.',
    expressionEnhancer:'Processes HDR contrast to make foregrounds, backgrounds and objects stand out. Detail emphasizes detail; highlight is LG’s Brightness option. Off skips this enhancement.',
    dolbyPrecisionDetail:'Extra clarity and contrast processing for Dolby Vision, making fine textures more visible. Turning it off still allows normal Dolby Vision playback.',
    nearBlackDetail:'Adjusts how detail just above black is rendered. This is a picture-preset control, separate from Game Optimizer’s Fine tune dark areas.',
    dynamicContrast:'Automatically changes contrast according to the picture. This can make scenes look punchier, while changing how shadows and highlights are shown.',
    dynamicColor:'Adds color enhancement to make colors more vivid. This can change their appearance from the source.',
    superResolution:'Processes image edges and textures to make soft material appear more detailed. Stronger settings can make the picture look artificial.',
    noiseReduction:'Smooths visible noise or grain. Stronger filtering can also soften fine texture.',
    mpegNoiseReduction:'Reduces compression artifacts, such as blocks and noise around edges. Stronger filtering can soften detail.',
    smoothGradation:'Smooths visible steps between similar shades, such as bands in a sky. Stronger smoothing can reduce subtle texture.',
    blackLevel:'Matches the source’s RGB signal range: high is Full, low is Limited, and auto detects it. A mismatch can wash out blacks or hide dark and bright detail.',
    realCinema:'Handles the original frame cadence of film content for more even motion. TruMotion is the separate control for motion smoothing.',
    truMotionMode:'Smooths movement using motion processing. Stronger smoothing can make films look like live video; User Selection enables the individual adjustments.',
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
  const pretty = key => titles[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
  const display = value => typeof value === 'object' ? [...new Set(Object.values(value || {}))].join(' / ') : String(value === undefined || value === null ? '—' : value);
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const model = window.LGProfileView;
  class Editor extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});this.scope={};this.category='picture';this.split=['format'];this.variant='standard';this.draft={};this.epoch=0;this.editingKey=null;this.live={};this.expanded=new Set();
      // ShadowRoot has no onkeydown event-handler property. Keep one listener
      // across renders, including the empty/offline editor.
      this.shadowRoot.addEventListener('keydown',event=>this.remoteKey(event));
    }
    controls() { return [...this.shadowRoot.querySelectorAll('[data-focus]:not(:disabled)')].filter(n=>n.getClientRects().length); }
    captureFocus() {
      const active=this.shadowRoot.activeElement,controls=this.controls(),index=controls.indexOf(active);
      return index>=0 ? {key:active.dataset.focus,neighbors:controls.slice(index+1).concat(controls.slice(0,index).reverse()).map(n=>n.dataset.focus),scroll:this.rows ? this.rows.scrollTop : 0} : null;
    }
    restoreFocus(saved) {
      if(!saved || !this.getClientRects().length)return;
      const outer=this.getRootNode().activeElement;
      // A pending response must not pull focus back after the user leaves.
      if(outer && outer!==this && outer!==document.body)return;
      const controls=this.controls(),target=[saved.key,...saved.neighbors].map(key=>controls.find(n=>n.dataset.focus===key)).find(Boolean)||controls[0];
      if(!target)return;
      if(this.rows)this.rows.scrollTop=saved.scroll;
      target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
      this.editing(this.editingKey===target.dataset.focus ? target : null);
    }
    editing(control) {
      this.editingKey=control ? control.dataset.focus : null;
      this.shadowRoot.querySelectorAll('[data-editing]').forEach(n=>n.removeAttribute('data-editing'));
      if(control)control.setAttribute('data-editing','');
      const help=this.shadowRoot.querySelector('.remote-help');
      if(help)help.textContent=control ? 'Arrows adjust · OK or Back finishes editing · Review changes before saving' : 'Arrows move · OK edits a value or selects a button · Back returns';
    }
    remoteKey(event) {
      if(!this.adapter || !this.adapter.tvRemote || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
      const codes={13:'Enter',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',461:'Escape'};
      const key=codes[event.keyCode||event.which]||event.key,active=this.shadowRoot.activeElement;
      if(!active)return;
      if(key==='Escape'&&this.review&&!this.editingKey){this.closeReview();event.preventDefault();event.stopPropagation();return;}
      const arrow=['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(key);
      const handled=()=>{event.preventDefault();event.stopPropagation();};
      if(this.busy && (arrow||key==='Enter')){handled();return;}
      if(this.editingKey===active.dataset.focus) {
        if(key==='Enter'||key==='Escape'){this.editing(null);handled();return;}
        if(!arrow)return;
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
      if(key==='Enter' && ['SELECT','INPUT'].includes(active.tagName)){this.editing(active);handled();return;}
      if(key==='Enter'&&active.tagName==='BUTTON'){handled();active.click();return;}
      if(key==='Enter'&&active.tagName==='SUMMARY'){handled();active.click();return;}
      if(!arrow)return;
      handled();this.editing(null);
      const controls=this.controls(),i=controls.indexOf(active),direction=['ArrowLeft','ArrowUp'].includes(key)?-1:1;
      if(i===0 && direction<0 && this.adapter.focusBack){this.adapter.focusBack();return;}
      const next=controls[(i+direction+controls.length)%controls.length];
      if(next){next.focus();next.scrollIntoView({block:'nearest',inline:'nearest'});}
    }
    configure(adapter) { this.adapter=adapter;this.refresh(true); }
    request(command) { return this.adapter.request(command); }
    records() { return this.state?model.records(this.state,this.variant):[]; }
    selectedRows() { return model.scopeRows(this.records(),this.scope,this.category,this.split); }
    selectedRecords() { return [...new Map(this.selectedRows().flatMap(row=>row.cells.flatMap(cell=>cell.records)).map(r=>[r.id,r])).values()]; }
    writable() { return !this.status.offline&&this.status.editor_api>=3; }
    async refresh(force=false) {
      const epoch=++this.epoch,focus=this.captureFocus();
      try {
        const result=await this.request({action:'get'});if(epoch!==this.epoch)return false;
        if(force||!this.state||this.state.instance_id!==result.state.instance_id)this.live={};
        this.state=result.state;this.status=result.status||{};
        const banks=(this.state.document||{}).banks||[];
        for(const id of Object.keys(this.live))if(!banks.some(b=>b.id===id&&JSON.stringify(b.target)===JSON.stringify(this.live[id].target)))delete this.live[id];
        this.render(focus);await this.inspect();return true;
      } catch(error){this.error(error.message);return false;}
    }
    async inspect(force=false) {
      if(!this.state||this.status.offline)return;
      const epoch=++this.epoch,banks=[...new Map(this.selectedRecords().map(r=>[r.bank.id,r.bank])).values()];
      for(const bank of banks) {
        if(this.live[bank.id]&&!force)continue;
        try {
          const result=await this.request({action:'inspect',bank_id:bank.id});if(epoch!==this.epoch)return;
          this.live[bank.id]={...result,target:bank.target};if(!this.review)this.renderRows();
        } catch(error){if(epoch!==this.epoch)return;this.error(model.inputName(bank)+': '+error.message);}
      }
    }
    button(label,action,cls,id) { const b=el('button',label,cls);b.type='button';b.onclick=action;b.dataset.focus=id||'button:'+label;return b; }
    select(label,options,value,change) {
      const wrap=el('label',undefined,'choice'),input=el('select');wrap.append(el('span',label));input.setAttribute('aria-label',label);input.dataset.focus='choice:'+label;
      for(const [v,text] of options){const opt=el('option',text);opt.value=v;input.append(opt);}input.value=value;input.onchange=()=>change(input.value);wrap.append(input);return wrap;
    }
    toggle(label,on,change,id) {const b=this.button(label,change,'chip',id);b.setAttribute('aria-pressed',String(on));return b;}
    error(message) {const n=this.shadowRoot.querySelector('.message');if(n){n.textContent=message;n.classList.add('error');}else this.shadowRoot.replaceChildren(el('p',message));}
    lockControls() {if(this.busy)this.shadowRoot.querySelectorAll('button,select,input').forEach(n=>n.disabled=true);}
    entryId(record,variant=this.variant) {return record.preference?'preference:'+record.preference:variant+':'+record.id;}
    draftValue(record) {const entry=this.draft[this.entryId(record)];return entry?entry.value:record.value;}
    currentEntry(entry) {
      if(entry.preference)return this.state.preferences[entry.preference];
      const bank=(this.state.document||{}).banks.find(b=>b.id===entry.bank_id);
      if(!bank||JSON.stringify(bank.target)!==JSON.stringify(entry.target)||!Object.hasOwn(bank.settings,entry.key))throw new Error('A draft target changed or was removed. Discard this draft and select it again.');
      return model.values(bank,this.state,entry.variant)[entry.key];
    }
    stage(cell,value) {
      if(!Object.keys(this.draft).length)this.draftRevision=this.state.revision;
      for(const r of cell.records) {
        const id=this.entryId(r),before=r.preference?this.state.preferences[r.preference]:r.value;
        const encoded=value!==undefined&&r.key==='blackLevel'?Object.fromEntries(Object.keys(before).map(k=>[k,value])):value;
        if(value===undefined||model.same(before,encoded))delete this.draft[id];
        else this.draft[id]={...(this.draft[id]||{id,bank_id:r.bank.id,key:r.key,variant:this.variant,target:r.bank.target,preference:r.preference,before}),value:encoded,label:pretty(r.alias),targets:cell.records.filter(t=>r.preference?t.preference===r.preference:t.id===r.id).map(t=>({id:t.id,scope:model.storedScope(t)}))};
      }
      this.review=null;this.updateFooter();
    }
    changeView(change) {change();this.review=null;this.render();this.inspect();}
    chips(label,key,choices,labels) {
      const field=el('fieldset');field.append(el('legend',label));const list=el('div',undefined,'chips');
      for(const value of choices)list.append(this.toggle(labels(value),!Array.isArray(this.scope[key])||this.scope[key].includes(value),()=>this.changeView(()=>{
        const next=new Set(this.scope[key]||choices);next.has(value)?next.delete(value):next.add(value);this.scope[key]=next.size===choices.length?null:[...next];
      }),'scope:'+key+':'+value));field.append(list);return field;
    }
    details(label,id,content) {
      const details=el('details'),summary=el('summary',label);summary.dataset.focus=id;details.open=this.expanded.has(id);
      const remember=()=>{if(details.open)this.expanded.add(id);else this.expanded.delete(id);};
      // Record immediately: the browser's queued toggle event can arrive after
      // a render, and detached details must never overwrite the new open state.
      summary.onclick=event=>{event.preventDefault();details.open=!details.open;remember();};
      details.ontoggle=()=>{if(details.isConnected)remember();};details.append(summary,content);return details;
    }
    render(focus=this.captureFocus()) {
      const root=this.shadowRoot;root.innerHTML=`<style>
      :host{display:block;height:100%;min-height:0;color:#e9eef6;background:#101a2b;font:16px/1.4 system-ui,Arial,sans-serif;color-scheme:dark}*{box-sizing:border-box}
      button,select,input{font:inherit;color:inherit}button,select,input[type=number]{background:#22334b;border:1px solid #53637a;border-radius:8px;padding:8px 11px;min-height:40px;max-width:100%}button,summary{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #6ee7e5;outline-offset:2px}[data-editing]{outline:3px solid #ffd695!important;outline-offset:2px}
      button.primary,button[aria-pressed=true]{background:#91e4d4;color:#091c23;border-color:#91e4d4}.frame{height:100%;display:flex;flex-direction:column;gap:12px;padding:20px;overflow:hidden}.top,.actions,.footer,.row-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.top,.footer{justify-content:space-between}.top h2{font-size:25px;margin:0;font-weight:600}.muted,.notice,.message,.comparison,.targets{font-size:13px;color:#b5c2d4}.muted{margin:4px 0}.message{min-height:18px;margin:0}.error{color:#ffb0b8}.temporary,.mixed{color:#ffd695}.body{flex:1;min-height:100px;overflow:auto;border:1px solid #34445b;border-radius:12px;scroll-padding:12px}.filters,.grouping,.review{padding:14px 18px}.filters{display:grid;gap:12px}.filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.chips,.categories{display:flex;flex-wrap:wrap;gap:6px}fieldset{border:0;padding:0;margin:0;min-width:0}legend,.choice>span{font-size:12px;color:#b5c2d4;margin:0 0 6px;padding:0}.chip{font-size:14px;min-height:36px;padding:6px 9px}.choice{display:flex;flex-direction:column;min-width:0}select{width:100%}.categories{padding:12px 18px;background:#1c2b40;border-block:1px solid #34445b}.grouping{border-bottom:1px solid #34445b}.row{padding:16px 18px;display:grid;grid-template-columns:minmax(140px,.7fr) minmax(0,2fr);gap:14px;border-bottom:1px solid #34445b}.row h3{font:inherit;font-weight:600;margin:0}.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:16px;min-width:0}.cell{min-width:0}.cell-label{display:block;font-size:13px;color:#b5c2d4;margin-bottom:5px}.range{display:flex;gap:10px;align-items:center}.range input[type=range]{min-width:60px;width:100%;flex:1;accent-color:#91e4d4}.range input[type=number]{width:78px}.comparison{margin:5px 0}.targets{padding:0;list-style:none;margin:6px 0}.targets li{border-top:1px solid #34445b;padding:6px 0;overflow-wrap:anywhere}summary{font-size:13px;color:#b5c2d4;padding:5px 0}.badge{border:1px solid #487165;border-radius:16px;padding:4px 9px;color:#9be2cd;font-size:12px}.review h3{margin:0 0 12px}.diff{display:grid;grid-template-columns:1fr auto;gap:12px;border-bottom:1px solid #34445b;padding:10px 0}.diff .value{font-variant-numeric:tabular-nums}.empty{padding:20px}.remote-help{margin:0;font-size:13px;color:#b5c2d4}.counts{font-size:13px;color:#b5c2d4}.scope-note{font-size:13px;color:#b5c2d4;margin:8px 0 0}
      @media(min-width:1500px){:host{font-size:21px}.top h2{font-size:30px}.chip{font-size:19px}.muted,.notice,.message,.comparison,.targets,.scope-note,.counts,.remote-help,summary,.cell-label{font-size:17px}legend,.choice>span,.badge{font-size:16px}button,select,input[type=number]{min-height:48px}.cells{grid-template-columns:repeat(auto-fit,minmax(min(285px,100%),1fr))}.frame{padding:24px;gap:14px}}
      @media(max-width:650px){.frame{padding:12px;gap:9px}.top h2{font-size:22px}.top .actions{gap:5px}.top button{padding:6px 8px}.filters,.grouping,.categories,.review{padding:12px}.filter-grid{grid-template-columns:1fr}.row{grid-template-columns:1fr;padding:12px}.cells{grid-template-columns:1fr}.footer .actions{width:100%}.footer button{font-size:13px;padding:6px 8px}.counts{font-size:12px}.message{font-size:12px}.body{min-height:100px}}
      </style>`;
      const frame=el('div',undefined,'frame'),top=el('div',undefined,'top'),heading=el('div');heading.append(el('h2','Picture standards'),el('p','Saved on your TV. Everyday adjustments reset after a power cycle.','muted'));top.append(heading);
      const actions=el('div',undefined,'actions');actions.append(this.button('Refresh',()=>this.refresh(true)));
      if(this.adapter.fileTransfer!==false){actions.append(this.button('Download backup',async()=>{try{this.download(await this.request({action:'backup'}));}catch(e){this.error(e.message);}}));const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.onchange=async()=>{try{const selected=file.files[0];if(!selected||selected.size>1000000)throw new Error('Choose a JSON profile or backup smaller than 1 MB');const data=JSON.parse(await selected.text());if(!window.confirm('Replace saved standards with this file?'))return;await this.mutate(data.format==='lg-picture-bridge-backup'?{action:'restore_backup',backup:data,revision:this.state.revision}:{action:this.state.document?'import':'initialize',document:data,revision:this.state.revision,enabled:true,room:this.state.room});}catch(e){this.error(e.message);}};const importButton=this.button('Import',()=>file.click());importButton.disabled=!!this.status.offline;actions.append(importButton,file);}
      top.append(actions);frame.append(top);
      if(!this.state.document){frame.append(el('p','Import a profile collection using LG Picture Profiles in Home Assistant.','empty'),el('p',this.status.error||'No collection yet.','message'));root.append(frame);this.lockControls();this.restoreFocus(focus);return;}
      this.rows=el('div',undefined,'body');this.rows.setAttribute('aria-label','Settings editor');frame.append(this.rows);
      if(this.review)this.renderReview();else {
        const all=this.records(),opts=model.options(all),filters=el('div',undefined,'filters');
        filters.append(this.chips('Select ports','port',opts.port,v=>model.inputName(v)));
        const family=this.chips('Preset family','family',opts.family,v=>v==='game'?'Gaming':'Movies');
        family.append(el('p','Editor groups: Gaming contains Game presets; Movies contains Filmmaker, Cinema and Cinema Home.','scope-note'));
        const filterGrid=el('div',undefined,'filter-grid');filterGrid.append(this.chips('Select formats','format',opts.format,v=>model.formats[v]),family);filters.append(filterGrid);
        const presets=this.chips('Exact presets','preset',opts.preset,v=>model.modes[v]||v);
        presets.append(el('p','A specific LG picture mode, such as HDR Game or Dolby Vision Cinema. Choose a family for a broad selection, or an exact preset to narrow it.','scope-note'));
        const more=el('div',undefined,'filters');more.append(presets,this.chips('ALLM signal','allm',opts.allm,v=>v==='on'?'On':'Off'));
        if(opts.genre.length>1)more.append(this.chips('Game genres','genre',opts.genre,v=>v));else if(opts.genre.length)more.append(el('p','Managed game genre: '+opts.genre.join(', '),'muted'));
        more.append(this.select('Room variant',[['standard','Base standard'],['bright','Bright room'],['dark','Dark room']],this.variant,v=>this.changeView(()=>{this.variant=v;})));
        filters.append(this.details('More factors · '+(this.variant==='standard'?'Base standard':this.variant+' room'),'more-factors',more));this.rows.append(filters);
        const categories=el('nav',undefined,'categories');categories.setAttribute('aria-label','Settings categories');
        for(const [key,label] of Object.entries(model.categories))categories.append(this.toggle(label,this.category===key,()=>this.changeView(()=>{this.category=key;}),'category:'+key));this.rows.append(categories);
        const grouping=el('div',undefined,'grouping'),field=el('fieldset'),chips=el('div',undefined,'chips');field.append(el('legend','Show separate controls by'));
        for(const [key,label] of [['port','Port'],['format','Format'],['family','Preset family'],['preset','Exact preset'],['genre','Genre'],['allm','ALLM']])if(key!=='genre'||opts.genre.length>1)chips.append(this.toggle(label,this.split.includes(key),()=>this.changeView(()=>{this.split=this.split.includes(key)?this.split.filter(k=>k!==key):[...this.split,key];}),'split:'+key));
        field.append(chips);grouping.append(field,el('p',this.category==='port'?'Connection settings are shared by every device and format on each port.':this.category==='selection'?'Choose which preset LG uses for each input and signal. Exact preset and genre filters do not split these mappings.':'Preset family separates Gaming and Movies. Exact preset separates individual LG picture modes. Mixed values stay separate until you explicitly edit a combined control.','scope-note'));this.rows.append(grouping);
        this.settings=el('div');this.rows.append(this.settings);
      }
      const footer=el('div',undefined,'footer'),footerActions=el('div',undefined,'actions');this.counts=el('span',undefined,'counts');
      this.reviewButton=this.button('Review changes',()=>this.openEditReview(),'primary','review');this.discardButton=this.button('Discard edits',()=>{this.draft={};this.review=null;this.render();},undefined,'discard');
      this.restoreButton=this.button('Restore selected',()=>this.openActionReview('restore'),undefined,'restore');this.keepButton=this.button('Keep adjustments',()=>this.openActionReview('save'),undefined,'promote');
      const manage=this.button(this.state.enabled?'Automatic profiles: On':'Automatic profiles: Off',()=>this.mutate({action:'set_enabled',enabled:!this.state.enabled}),undefined,'management');manage.disabled=!this.writable();manage.setAttribute('aria-pressed',String(this.state.enabled));
      footerActions.append(this.reviewButton,this.discardButton,this.restoreButton,this.keepButton,manage);footer.append(this.counts,footerActions);frame.append(footer);
      const ack=this.status.backup_sequence&&this.status.backup_sequence===this.status.backup_acknowledged;
      frame.append(el('p',this.status.offline?'TV offline · showing saved backup':this.status.editor_api<3||!this.status.editor_api?'Update LG Picture Bridge to 0.14.0 or newer to use this editor.':this.state.enabled?'Automatic profiles apply day/night settings and restore temporary adjustments after a power cycle.':'Automatic profiles are paused; current TV settings stay in place.','muted'));
      frame.append(el('p',this.status.error||('Current room: '+this.state.room+' · '+(ack?'Backup confirmed in HA':'TV owns standards')),'message'));
      if(this.adapter.tvRemote)frame.append(el('p',undefined,'remote-help'));root.append(frame);
      if(!this.review)this.renderRows();this.updateFooter();this.lockControls();this.restoreFocus(focus);this.editing(root.activeElement&&this.editingKey===root.activeElement.dataset.focus?root.activeElement:null);
    }
    renderRows() {
      if(!this.settings||this.review)return;const focus=this.captureFocus();this.settings.replaceChildren();
      for(const row of this.selectedRows()) {
        const section=el('section',undefined,'row'),name=el('div'),cells=el('div',undefined,'cells');name.append(el('h3',pretty(row.key)));
        if(descriptions[row.key]){const help=el('p',descriptions[row.key],'muted setting-help');help.id='help-'+row.key;name.append(help);}
        section.append(name,cells);
        for(const cell of row.cells) {
          const group=el('div',undefined,'cell'),ready=cell.records.every(r=>this.live[r.bank.id]&&Object.hasOwn(this.live[r.bank.id].settings,r.key)),control=ready?model.combinedControl(cell,this.live):null;
          const label=(control&&control.label)||pretty(row.key),fieldLabel=label+' · '+cell.label,vals=cell.records.map(r=>this.draftValue(r)),unique=[...new Set(vals.map(display))],mixed=unique.length>1||vals.some(v=>v&&typeof v==='object'&&new Set(Object.values(v)).size>1);
          group.append(el('span',cell.label,'cell-label'));
          if(cell.brightnessRole)group.append(el('p',cell.brightnessRole==='game_sdr'?'Shared SDR game brightness':this.variant==='standard'?'Choose Bright or Dark under More factors to edit shared movie brightness':'Shared SDR movie brightness','muted'));
          const disabled=!this.writable()||cell.records.some(r=>r.locked);let input;
          const update=value=>{this.stage(cell,value);const comparison=group.querySelector('.comparison');if(comparison)comparison.textContent=value===undefined?'Edit cleared; saved values retained.':'Draft · '+display(value);};
          if(control&&control.component==='number') {
            input=el('div',undefined,'range');const slider=el('input'),number=el('input');slider.type='range';number.type='number';
            for(const node of [slider,number]){node.min=control.min;node.max=control.max;node.step=control.step;node.value=mixed?'':unique[0];node.setAttribute('aria-label',fieldLabel);node.dataset.focus='setting:'+cell.id+':'+node.type;node.disabled=disabled;}
            slider.hidden=mixed;number.placeholder='Mixed';slider.oninput=()=>{number.value=slider.value;update(Number(slider.value));};number.oninput=()=>{const valid=number.value!==''&&number.checkValidity();slider.hidden=!valid;if(valid)slider.value=number.value;update(valid?Number(number.value):undefined);};input.append(slider,number);
          } else if(control&&control.options) {
            input=el('select');input.setAttribute('aria-label',fieldLabel);input.dataset.focus='setting:'+cell.id;
            if(mixed){const option=el('option','Mixed');option.value='';option.disabled=true;input.append(option);}
            for(const value of control.options){const option=el('option',value);option.value=value;input.append(option);}input.value=mixed?'':unique[0];input.disabled=disabled;input.onchange=()=>update(input.value);
          } else input=el('span',mixed?'Mixed: '+unique.join(' / '):unique[0],mixed?'mixed':'');
          group.append(input);
          if(descriptions[row.key])group.querySelectorAll('input,select').forEach(node=>node.setAttribute('aria-describedby','help-'+row.key));
          if(!ready&&!this.status.offline)group.append(el('p','Reading TV ranges…','muted'));else if(!control&&!this.status.offline)group.append(el('p','No common writable control. Split by Format or Preset to edit separately.','muted'));
          const temporary=cell.records.filter(r=>Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)).map(r=>this.state.overrides[r.bank.id][r.key]);
          const observed=cell.records.map(r=>(this.live[r.bank.id]||{settings:{}}).settings[r.key]);
          group.append(el('p',temporary.length?'Temporary: '+[...new Set(temporary.map(display))].join(' / '):this.status.offline?'Saved backup':ready?'Last TV read: '+[...new Set(observed.map(display))].join(' / '):'Limits must be read before editing.','comparison'+(temporary.length?' temporary':'')));
          const targets=el('ul',undefined,'targets');for(const r of cell.records)targets.append(el('li',model.storedScope(r)+' · '+pretty(r.key)+': '+display(r.value)));
          group.append(this.details(cell.records.length+' stored '+(cell.records.length===1?'value':'values'),'targets:'+cell.id,targets));
          const shared=[...new Set(cell.records.filter(r=>r.devices.length>1).map(r=>model.inputName(r.port)+': '+r.devices.map(d=>this.state.document.devices[d]).join(', ')))];
          if(shared.length)group.append(el('p','Shared values on '+shared.join('; '),'scope-note'));
          if(cell.records.some(r=>r.preference))group.append(el('p','This shared brightness preference also affects matching profiles outside the selected ports.','scope-note'));
          cells.append(group);
        }
        this.settings.append(section);
      }
      if(!this.settings.childElementCount)this.settings.append(el('p','No saved settings match this selection.','empty'));
      this.updateFooter();this.lockControls();this.restoreFocus(focus);
    }
    updateFooter() {
      if(!this.reviewButton)return;const entries=Object.values(this.draft),shown=new Set(this.selectedRecords().map(r=>this.entryId(r))),outside=entries.filter(e=>!shown.has(e.id)).length;
      const stale=entries.length&&this.draftRevision!==this.state.revision;
      this.counts.textContent=this.selectedRecords().length+' stored values · '+entries.length+' staged changes'+(outside?' ('+outside+' outside this selection)':'');
      this.reviewButton.textContent=stale?'Review against latest':entries.length?'Review '+entries.length+' changes':'Review changes';this.reviewButton.disabled=!this.writable()||!entries.length||!!this.review;
      this.discardButton.disabled=!entries.length||!!this.review;this.restoreButton.disabled=!this.writable()||!shown.size||!!entries.length||!!this.review;this.keepButton.disabled=this.restoreButton.disabled;
    }
    openEditReview() {
      try {
        if(this.draftRevision!==this.state.revision){for(const entry of Object.values(this.draft)){entry.before=this.currentEntry(entry);if(model.same(entry.before,entry.value))delete this.draft[entry.id];}this.draftRevision=this.state.revision;}
        const entries=Object.values(this.draft);if(!entries.length){this.render();return;}
        this.review={action:'edit_many',revision:this.draftRevision,entries:JSON.parse(JSON.stringify(entries))};this.render({key:'review-back',neighbors:[],scroll:0});
      } catch(e){this.error(e.message);}
    }
    async openActionReview(action) {
      if(this.busy)return;
      const chosen=this.selectedRecords().map(r=>({id:r.id,target:JSON.stringify(r.bank.target)}));
      this.busy=true;this.lockControls();const refreshed=await this.refresh();this.busy=false;
      if(!refreshed||!this.writable()){this.render();if(!refreshed)this.error('Could not refresh the TV. Try again before reviewing adjustments.');return;}
      const selection={},expected={},entries=[];
      const records=model.records(this.state,this.state.room),selected=chosen.map(c=>records.find(r=>r.id===c.id&&JSON.stringify(r.bank.target)===c.target));
      if(selected.some(r=>!r)){this.render();this.error('Selected settings changed. Select them again.');return;}
      const shared=new Map();
      for(const r of selected) {
        const temp=(this.state.overrides||{})[r.bank.id]||{},has=Object.hasOwn(temp,r.key);if(action==='save'&&!has)continue;
        (selection[r.bank.id]||(selection[r.bank.id]=[])).push(r.key);
        if(has)(expected[r.bank.id]||(expected[r.bank.id]={}))[r.key]=temp[r.key];
        const bank=r.bank,current=model.values(bank,this.state,this.state.room)[r.key];
        if(action==='save'&&r.preference) {
          if(shared.has(r.preference)&&!model.same(shared.get(r.preference).value,temp[r.key])){this.render();this.error('Selected temporary brightness values conflict. Adjust them to the same value before keeping them.');return;}
          shared.set(r.preference,{preference:r.preference,label:pretty(r.alias),variant:this.state.room,before:current,value:temp[r.key],targets:records.filter(t=>t.preference===r.preference).map(t=>({scope:model.storedScope(t)}))});
        } else entries.push({label:pretty(r.alias),variant:this.state.room,before:action==='save'?current:has?temp[r.key]:(this.live[bank.id]||{settings:{}}).settings[r.key],value:action==='save'?temp[r.key]:current,targets:[{scope:model.storedScope(r)}]});
      }
      entries.push(...shared.values());
      if(!entries.length){this.render();this.error('No tracked temporary adjustments in this selection.');return;}
      this.review={action,selection,expected,room:this.state.room,revision:this.state.revision,entries};this.render({key:'review-back',neighbors:[],scroll:0});
    }
    closeReview() {const key=this.review.action==='edit_many'?'review':this.review.action==='restore'?'restore':'promote';this.review=null;this.render({key,neighbors:[],scroll:0});}
    renderReview() {
      const box=el('section',undefined,'review'),r=this.review;box.append(el('h3',r.action==='edit_many'?'Review saved standards':r.action==='restore'?'Restore current '+this.state.room+' room standards':'Keep current '+this.state.room+' room adjustments'));
      for(const entry of r.entries) {
        const row=el('div',undefined,'diff'),label=el('div');label.append(el('strong',entry.label),el('p',entry.preference?'Shared preference: '+entry.preference:'Room variant: '+entry.variant,'muted'));
        const list=el('ul',undefined,'targets');entry.targets.forEach(t=>list.append(el('li',t.scope)));label.append(list);row.append(label,el('span',display(entry.before)+' → '+display(entry.value),'value'));box.append(row);
      }
      const actions=el('div',undefined,'actions');actions.append(this.button('Back to editing',()=>this.closeReview(),undefined,'review-back'),this.button(r.action==='edit_many'?'Save standards':r.action==='restore'?'Restore selected settings':'Keep these adjustments',()=>this.confirmReview(),'primary','review-confirm'));box.append(actions);this.rows.append(box);
    }
    async confirmReview() {
      const r=this.review;if(!r)return;
      if(r.action!=='edit_many'){await this.mutate({action:r.action,selection:r.selection,expected:r.expected,room:r.room,revision:r.revision});return;}
      const edits=new Map(),preferences={};
      for(const entry of r.entries) {
        if(entry.preference){preferences[entry.preference]=Number(entry.value);continue;}
        const id=entry.bank_id+':'+entry.variant;if(!edits.has(id))edits.set(id,{bank_id:entry.bank_id,variant:entry.variant,settings:{}});edits.get(id).settings[entry.key]=entry.value;
      }
      await this.mutate({action:'edit_many',edits:[...edits.values()],preferences,revision:r.revision});
    }
    async mutate(command) {
      if(this.busy)return;const focus=this.captureFocus();this.busy=true;++this.epoch;this.lockControls();let message,error=false;
      try {
        await this.request(command);if(['edit_many','initialize','import','restore_backup'].includes(command.action))this.draft={};this.review=null;this.live={};
        if(!await this.refresh())throw new Error('Command accepted, but the saved state could not be refreshed');
        message=this.status.pending_restore?'Standards saved. TV application is pending; the bridge will retry.':'Saved on the TV. Backup is sent to Home Assistant.';
      } catch(e) {
        error=true;this.review=null;await this.refresh();
        // A lost reply may follow a successful atomic commit. Re-read before
        // retrying, retaining only edits not confirmed in the saved document.
        for(const entry of Object.values(this.draft))try{if(model.same(this.currentEntry(entry),entry.value))delete this.draft[entry.id];}catch(_){}
        message=e.message+(Object.keys(this.draft).length?' Unsaved drafts remain for review.':'');
      } finally {this.busy=false;this.render(focus);const n=this.shadowRoot.querySelector('.message');n.textContent=message;n.classList.toggle('error',error);}
    }
    download(value) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=el('a');a.href=url;a.download='lg-picture-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  if(!customElements.get('lg-profile-editor'))customElements.define('lg-profile-editor',Editor);
}());
