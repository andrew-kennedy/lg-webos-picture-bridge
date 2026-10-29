/* Shared by the TV app and the Home Assistant panel. No dependencies or polling. */
(function () {
  'use strict';
  const titles = {backlight:'OLED pixel brightness',contrast:'Contrast',brightness:'Black level',color:'Color depth',sharpness:'Sharpness',colorTemperature:'Color temperature',gameColorDepth:'Game color depth',gameSharpness:'Game sharpness',gameAdjustContrast:'Game contrast',gameBlackLevel:'Game black level',lowLevelAdjustment:'Fine tune dark areas',blackStabilizer:'Black stabilizer',whiteStabilizer:'White stabilizer',hdrDynamicToneMapping:'HDR tone mapping',pictureMode:'Picture mode',truMotionMode:'TruMotion',enableALLM:'Auto low latency mode',enableQFT:'Quick frame transport'};
  const pretty = key => titles[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
  const display = value => typeof value === 'object' ? [...new Set(Object.values(value || {}))].join(' / ') : String(value === undefined || value === null ? '—' : value);
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  class Editor extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});this.device='all';this.bankId=null;this.variant='standard';this.draft={};this.epoch=0;this.editingKey=null;
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
      if(help)help.textContent=control ? 'Arrows adjust · OK or Back finishes editing · Save standard applies changes' : 'Arrows move · OK edits a value or selects a button · Back returns';
    }
    remoteKey(event) {
      if(!this.adapter || !this.adapter.tvRemote || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
      const codes={13:'Enter',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',461:'Escape'};
      const key=codes[event.keyCode||event.which]||event.key,active=this.shadowRoot.activeElement;
      if(!active)return;
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
      if(!arrow)return;
      handled();this.editing(null);
      const controls=this.controls(),i=controls.indexOf(active),direction=['ArrowLeft','ArrowUp'].includes(key)?-1:1;
      if(i===0 && direction<0 && this.adapter.focusBack){this.adapter.focusBack();return;}
      const next=controls[(i+direction+controls.length)%controls.length];
      if(next){next.focus();next.scrollIntoView({block:'nearest',inline:'nearest'});}
    }
    configure(adapter) { this.adapter=adapter;this.refresh(); }
    async request(command) { if(!this.adapter)throw new Error('Editor is not connected');return this.adapter.request(command); }
    async refresh(focus) {
      const epoch=++this.epoch;
      try {
        const result=await this.request({action:'get'});if(epoch!==this.epoch)return;
        const previous=this.bank();this.state=result.state;this.status=result.status || {};this.draft={};
        // Keep the same bank's controls usable while refreshing their metadata.
        if(!previous || !this.bank() || JSON.stringify(previous.target)!==JSON.stringify(this.bank().target))this.live=null;
        this.render(this.captureFocus()||focus);await this.inspect();
      }
      catch(error){this.error(error.message);}
    }
    async inspect() {
      const bank=this.bank();if(!bank || this.status.offline)return;
      const epoch=++this.epoch;
      try {const result=await this.request({action:'inspect',bank_id:bank.id});if(epoch!==this.epoch)return;this.live=result;this.renderRows();}
      catch(error){if(epoch===this.epoch)this.error(error.message);}
    }
    bank() {return this.state && this.state.document && this.state.document.banks.find(b=>b.id===this.bankId);}
    select(label,values,selected,change) {
      const wrap=el('label',undefined,'choice');wrap.append(el('span',label));const select=el('select');select.setAttribute('aria-label',label);select.dataset.focus='choice:'+label;
      values.forEach(([v,name])=>{const opt=el('option',name);opt.value=v;select.append(opt);});select.value=selected;select.onchange=()=>change(select.value);wrap.append(select);return wrap;
    }
    button(label,action,cls,id) {const b=el('button',label,cls);b.type='button';b.onclick=action;b.dataset.focus=id||'button:'+label;return b;}
    error(message) {const status=this.shadowRoot.querySelector('.message');if(status){status.textContent=message;status.classList.add('error');}else{this.shadowRoot.replaceChildren(el('p',message));}}
    async mutate(command) {
      if(this.busy)return;const focus=this.captureFocus();this.busy=true;
      const buttons=[...this.shadowRoot.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
      try {await this.request(command);await this.refresh(focus);this.shadowRoot.querySelector('.message').textContent='Saved on the TV. Backup is sent to Home Assistant.';}
      catch(error){this.error(error.message);}finally{this.busy=false;buttons.forEach(([b,disabled])=>b.disabled=disabled);this.restoreFocus(this.captureFocus()||focus);}
    }
    download(value,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    render(focus=this.captureFocus()) {
      const root=this.shadowRoot;root.innerHTML=`<style>
        :host{display:block;height:100%;min-height:0;color:#e9eef6;background:#101a2b;font:16px/1.45 system-ui,Arial,sans-serif;color-scheme:dark}
        *{box-sizing:border-box}button,select,input{font:inherit}button,select,input[type=number]{color:inherit;background:#22334b;border:1px solid #53637a;border-radius:9px;padding:9px 12px;min-height:42px}
        button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:hover:not(:disabled){background:#304965}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #6ee7e5;outline-offset:2px}
        [data-editing]{outline:3px solid #ffd695!important;outline-offset:2px}.remote-help{margin:0}
        .primary{background:#91e4d4;color:#091c23;border-color:#91e4d4;font-weight:650}.primary:hover:not(:disabled){background:#b8f3e8}
        .frame{height:100%;display:flex;flex-direction:column;padding:24px;gap:16px;overflow:hidden}.top,.toolbar,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.top h2{font-size:26px;margin:0;font-weight:650;letter-spacing:-.5px}.muted{color:#a9b7cb;font-size:14px;margin:4px 0}.badge{font-size:12px;border:1px solid #487165;border-radius:20px;padding:4px 10px;color:#9be2cd}
        .actions{justify-content:flex-start}.choice{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}.choice span{font-size:12px;font-weight:600;color:#acbad0;letter-spacing:.05em;text-transform:uppercase}select{width:100%;text-overflow:ellipsis}.toolbar{flex-wrap:nowrap}.toolbar .choice:nth-child(2){flex:2}
        .body{min-height:0;flex:1;overflow:auto;border:1px solid #34445b;border-radius:12px}.row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.3fr) minmax(100px,.7fr);gap:18px;align-items:center;padding:15px 20px;border-bottom:1px solid #2b3a4e}.row:last-child{border:0}.row strong{font-size:15px}.range{display:flex;align-items:center;gap:12px}input[type=range]{accent-color:#91e4d4;min-width:70px;flex:1;width:100%}input[type=number]{width:84px}.observed{font-size:13px;color:#a9b7cb}.temporary{color:#ffd695}.message{min-height:22px;color:#a9b7cb;font-size:14px}.error{color:#ffb0b8}.footer{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.empty{padding:20px}.notice{font-size:14px;margin:0;color:#c2cde0}
        @media(min-width:1500px){:host{font-size:22px}.top h2{font-size:34px}.muted,.notice,.message,.row strong{font-size:20px}.choice span,.observed{font-size:17px}.row{padding:19px 24px}.frame{padding:28px;gap:20px}button,select,input[type=number]{min-height:52px}.badge{font-size:17px}}
        @media(max-width:650px){.frame{padding:14px;gap:12px}.top h2{font-size:23px}.toolbar{flex-wrap:wrap}.choice{flex-basis:42%}.toolbar .choice:nth-child(2){flex-basis:100%;order:3}.row{grid-template-columns:1fr;gap:8px;padding:14px}.footer .actions{width:100%}.top .actions{gap:6px}button{padding:8px}.observed{font-size:12px}}
      </style>`;
      const frame=el('div',undefined,'frame'),top=el('div',undefined,'top'),heading=el('div');
      heading.append(el('h2','Picture profiles'),el('p',this.state.enabled?'Standards live on your TV. Everyday adjustments reset after a power cycle.':'Standards live on your TV. Automatic picture management is paused.','muted'));top.append(heading);
      const topActions=el('div',undefined,'actions');topActions.append(this.button('Refresh',()=>this.refresh()));
      topActions.append(this.button('Download backup',async()=>{try{this.download(await this.request({action:'backup'}),'lg-picture-backup.json');}catch(e){this.error(e.message);}}));
      const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.onchange=async()=>{try{const selected=file.files[0];if(!selected || selected.size>1000000)throw new Error('Choose a JSON profile or backup file smaller than 1 MB');const data=JSON.parse(await selected.text());if(!window.confirm('Replace saved picture standards with this file? Historical temporary adjustments will not be applied.'))return;await this.mutate(data.format==='lg-picture-bridge-backup'?{action:'restore_backup',backup:data,revision:this.state.revision}:{action:this.state.document?'import':'initialize',document:data,revision:this.state.revision,enabled:true,room:this.state.room});}catch(e){this.error(e.message);}};
      const importButton=this.button('Import',()=>file.click());importButton.disabled=!!this.status.offline;topActions.append(importButton,file);top.append(topActions);frame.append(top);
      const doc=this.state.document;
      if(!doc){frame.append(el('p','Import a profile collection to get started. Existing Home Assistant standards migrate automatically when both components are updated.','empty'),el('div',this.status.error || 'No collection yet.','message'));root.append(frame);this.restoreFocus(focus);return;}
      const visible=doc.banks.filter(b=>this.device==='all'||(b.devices||[]).includes(this.device));
      if(!visible.some(b=>b.id===this.bankId))this.bankId=visible[0]&&visible[0].id;
      const toolbar=el('div',undefined,'toolbar');
      toolbar.append(this.select('Device',[['all','All devices'],...Object.entries(doc.devices)],this.device,v=>{this.device=v;this.draft={};this.live=null;this.render();this.inspect();}));
      toolbar.append(this.select('Native profile',visible.map(b=>[b.id,b.name]),this.bankId,v=>{this.bankId=v;this.draft={};this.live=null;this.render();this.inspect();}));
      toolbar.append(this.select('Room variant',[['standard','Base standard'],['bright','Bright room'],['dark','Dark room']],this.variant,v=>{this.variant=v;this.draft={};this.render();}));frame.append(toolbar);
      const bank=this.bank(),names=((bank && bank.devices)||[]).map(d=>doc.devices[d]);
      const stateLine=el('div',undefined,'top');
      stateLine.append(el('p',(names.length>1?'Shared by '+names.join(' and ')+'. ':'')+'Inactive profiles can be edited without switching HDMI inputs.','notice'));
      const ack=this.status.backup_acknowledged===this.status.backup_sequence && this.status.backup_sequence;
      stateLine.append(el('span',this.status.offline?'TV offline · saved backup':ack?'Backup confirmed in HA':'TV owns standards','badge'));frame.append(stateLine);
      this.rows=el('div',undefined,'body');this.rows.setAttribute('aria-label','Profile settings');frame.append(this.rows);
      const footer=el('div',undefined,'footer'),actions=el('div',undefined,'actions');
      this.saveButton=this.button('Save standard',()=>this.mutate({action:'edit',bank_id:this.bankId,variant:this.variant,settings:this.draft,revision:this.state.revision}),'primary');
      const restore=this.button('Restore this profile',()=>this.mutate({action:'restore',scope:this.bankId}));
      const promote=this.button('Keep current adjustments',()=>this.mutate({action:'save',scope:this.bankId,revision:this.state.revision}));
      [restore,promote].forEach(b=>b.disabled=!!this.status.offline);actions.append(this.saveButton,restore,promote);
      const manage=this.button(this.state.enabled?'Automatic profiles: On':'Automatic profiles: Off',()=>this.mutate({action:'set_enabled',enabled:!this.state.enabled}),undefined,'management');manage.disabled=!!this.status.offline;manage.setAttribute('aria-pressed',String(this.state.enabled));manage.setAttribute('aria-describedby','management-help');
      const managementHelp=el('p',this.state.enabled?'Automatic profiles apply day/night settings and reset temporary adjustments after a power cycle.':'Automatic profiles are paused. Current TV settings stay in place.','muted');managementHelp.id='management-help';
      footer.append(actions,manage);frame.append(footer,managementHelp,el('div',this.status.error||('Current room: '+this.state.room+' · '+(this.status.temporary_count === undefined ? Object.values(this.state.overrides||{}).reduce((n,v)=>n+Object.keys(v).length,0) : this.status.temporary_count)+' temporary adjustments · Revision '+this.state.revision),'message'));
      if(this.adapter && this.adapter.tvRemote)frame.append(el('p',undefined,'muted remote-help'));
      root.append(frame);this.renderRows();this.restoreFocus(focus);this.editing(root.activeElement && root.activeElement.dataset.focus===this.editingKey ? root.activeElement : null);
    }
    renderRows() {
      const bank=this.bank();if(!bank||!this.rows)return;const focus=this.captureFocus();this.rows.replaceChildren();
      const room=this.variant==='standard'?this.state.room:this.variant;
      const values={...bank.settings,...(this.variant==='standard'?{}:(bank.variants||{})[room]||{})};
      if(bank.brightness_role)values.backlight=this.state.preferences[bank.brightness_role==='game_sdr'?'game_sdr':'movie_'+room];
      Object.entries(values).forEach(([key,saved])=>{
        const value=Object.hasOwn(this.draft,key)?this.draft[key]:saved,row=el('div',undefined,'row'),name=el('div');name.append(el('strong',pretty(key)));
        if(key==='backlight'&&bank.brightness_role)name.append(el('p',bank.brightness_role==='game_sdr'?'Shared SDR game brightness':this.variant==='standard'?'Choose Bright or Dark to edit shared movie brightness':'Shared SDR movie brightness','muted'));
        row.append(name);
        const control=this.live&&this.live.controls[key];let input;
        const update=v=>{this.draft[key]=v;this.saveButton.disabled=false;};
        if(control&&control.component==='number') {
          input=el('div',undefined,'range');const slider=el('input'),number=el('input');slider.type='range';number.type='number';
          [slider,number].forEach(n=>{n.min=control.min;n.max=control.max;n.step=control.step;n.value=value;n.setAttribute('aria-label',pretty(key));n.dataset.focus='setting:'+key+':'+n.type;n.disabled=!!this.status.offline||(key==='backlight'&&bank.brightness_role==='movie_sdr'&&this.variant==='standard');});
          slider.oninput=()=>{number.value=slider.value;update(Number(slider.value));};number.oninput=()=>{slider.value=number.value;update(Number(number.value));};input.append(slider,number);
        } else {
          let choices=control&&control.options;
          if(key==='blackLevel')choices=['auto','high','low'];
          if(key==='pictureMode')choices=bank.target.dimension.dynamicRange.startsWith('sdr')?['filmMaker','game']:bank.target.dimension.dynamicRange.startsWith('hdr')?['hdrFilmMaker','hdrGame']:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame'];
          if(choices){input=el('select');input.setAttribute('aria-label',pretty(key));input.dataset.focus='setting:'+key;choices.forEach(v=>{const o=el('option',v);o.value=v;input.append(o);});input.value=display(value);input.disabled=!!this.status.offline;input.onchange=()=>update(key==='blackLevel'?Object.fromEntries(Object.keys(saved).map(k=>[k,input.value])):input.value);}
          else input=el('span',display(value));
        }
        row.append(input);
        const temporary=(this.state.overrides||{})[bank.id]||{},current=this.live?this.live.settings[key]:undefined;
        row.append(el('span',Object.hasOwn(temporary,key)?'Temporary: '+display(temporary[key]):this.live?'TV: '+display(current):this.status.offline?'Last saved standard':'Reading TV range…',Object.hasOwn(temporary,key)?'observed temporary':'observed'));
        this.rows.append(row);
      });
      this.saveButton.disabled=!!this.status.offline||!Object.keys(this.draft).length;
      this.restoreFocus(focus);
    }
  }
  if(!customElements.get('lg-profile-editor'))customElements.define('lg-profile-editor',Editor);
}());
