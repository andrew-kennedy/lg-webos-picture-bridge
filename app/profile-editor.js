/* Shared by the TV app and the Home Assistant panel. No dependencies or polling. */
(function () {
  'use strict';
  const titles = {backlight:'OLED pixel brightness',contrast:'Contrast',brightness:'Black level',color:'Color depth',sharpness:'Sharpness',blackLevel:'HDMI RGB range',colorTemperature:'Color temperature',gameColorDepth:'Game color depth',gameSharpness:'Game sharpness',gameAdjustContrast:'Game contrast',gameBlackLevel:'Game black level',lowLevelAdjustment:'Fine tune dark areas',blackStabilizer:'Black stabilizer',whiteStabilizer:'White stabilizer',hdrDynamicToneMapping:'HDR tone mapping',pictureMode:'Picture mode',truMotionMode:'TruMotion',enableALLM:'Auto low latency mode',enableQFT:'Quick frame transport'};
  const pretty = key => titles[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
  const display = value => typeof value === 'object' ? [...new Set(Object.values(value || {}))].join(' / ') : String(value === undefined || value === null ? '—' : value);
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const model = window.LGProfileView;
  class Editor extends HTMLElement {
    constructor() {
      super();this.attachShadow({mode:'open'});this.device='all';this.view='profiles';this.bankId=null;this.variant='standard';this.draft={};this.epoch=0;this.editingKey=null;
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
        const previous=this.banks();this.state=result.state;this.status=result.status || {};this.draft={};
        // Keep metadata only while every native scope in this profile matches.
        if(JSON.stringify(previous.map(b=>[b.id,b.target]))!==JSON.stringify(this.banks().map(b=>[b.id,b.target])))this.live=null;
        this.render(this.captureFocus()||focus);await this.inspect();
      }
      catch(error){this.error(error.message);}
    }
    async inspect() {
      const banks=this.banks();if(!banks.length || this.status.offline)return;
      const epoch=++this.epoch;
      for(const bank of banks) {
        try {const result=await this.request({action:'inspect',bank_id:bank.id});if(epoch!==this.epoch)return;this.live=this.live||{};this.live[bank.id]=result;this.renderRows();}
        catch(error){if(epoch!==this.epoch)return;this.error(model.sectionName(bank)+': '+error.message);}
      }
    }
    groups() {return this.state ? model.groups(this.state,this.variant,this.view) : [];}
    group() {return this.groups().find(g=>g.id===this.bankId);}
    banks() {const group=this.group();return group?group.banks:[];}
    select(label,values,selected,change) {
      const wrap=el('label',undefined,'choice');wrap.append(el('span',label));const select=el('select');select.setAttribute('aria-label',label);select.dataset.focus='choice:'+label;
      values.forEach(([v,name])=>{const opt=el('option',name);opt.value=v;select.append(opt);});select.value=selected;select.onchange=()=>change(select.value);wrap.append(select);return wrap;
    }
    button(label,action,cls,id) {const b=el('button',label,cls);b.type='button';b.onclick=action;b.dataset.focus=id||'button:'+label;return b;}
    error(message) {const status=this.shadowRoot.querySelector('.message');if(status){status.textContent=message;status.classList.add('error');}else{this.shadowRoot.replaceChildren(el('p',message));}}
    lockControls() {if(this.busy)this.shadowRoot.querySelectorAll('button,select,input').forEach(n=>n.disabled=true);}
    async mutate(command) {
      if(this.busy)return;const focus=this.captureFocus(),commands=Array.isArray(command)?command:[command];if(!commands.length)return;
      const remaining=JSON.parse(JSON.stringify(this.draft));let revision=this.state.revision,completed=0,message,error=false;
      this.busy=true;++this.epoch;this.lockControls();
      try {
        for(const next of commands) {
          const payload={...next};if(Object.hasOwn(payload,'revision'))payload.revision=revision;
          const result=await this.request(payload);completed++;
          if(payload.action==='edit')delete remaining[payload.bank_id];
          // Carry the acknowledged revision forward; never silently rebase a
          // second section onto an unrelated change made by another editor.
          if(completed<commands.length && Object.hasOwn(commands[completed],'revision')) {
            if(!result || !Number.isSafeInteger(result.revision))throw new Error('TV did not confirm the saved revision. Refresh before continuing.');
            revision=result.revision;
          }
        }
        await this.refresh(focus);message='Saved on the TV. Backup is sent to Home Assistant.';
      } catch(e) {
        error=true;await this.refresh(focus);this.draft=remaining;
        message=(commands.length>1?completed+' of '+commands.length+' updates confirmed. ':'')+e.message+(Object.keys(remaining).length?' Unsaved edits are still shown.':'');
      } finally {
        this.busy=false;this.render(focus);const status=this.shadowRoot.querySelector('.message');status.textContent=message;status.classList.toggle('error',error);
      }
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
        .actions{justify-content:flex-start}.choice{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}.choice span{font-size:12px;font-weight:600;color:#acbad0;letter-spacing:.05em;text-transform:uppercase}select{width:100%;text-overflow:ellipsis}.toolbar{flex-wrap:nowrap}.toolbar .choice:first-child{flex:1.3}
        .body{min-height:0;flex:1;overflow:auto;border:1px solid #34445b;border-radius:12px}.section h3{font-size:inherit;margin:0;padding:12px 20px;background:#1c2b40;border-bottom:1px solid #34445b;color:#9be2cd}.section+.section{border-top:1px solid #34445b}.row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.3fr) minmax(100px,.7fr);gap:18px;align-items:center;padding:15px 20px;border-bottom:1px solid #2b3a4e}.row:last-child{border:0}.row strong{font-size:15px}.range{display:flex;align-items:center;gap:12px}input[type=range]{accent-color:#91e4d4;min-width:70px;flex:1;width:100%}input[type=number]{width:84px}.observed{font-size:13px;color:#a9b7cb}.temporary{color:#ffd695}.message{min-height:22px;color:#a9b7cb;font-size:14px}.error{color:#ffb0b8}.footer{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.empty{padding:20px}.notice{font-size:14px;margin:0;color:#c2cde0}
        @media(min-width:1500px){:host{font-size:22px}.top h2{font-size:34px}.muted,.notice,.message,.row strong{font-size:20px}.choice span,.observed{font-size:17px}.row{padding:19px 24px}.frame{padding:28px;gap:20px}button,select,input[type=number]{min-height:52px}.badge{font-size:17px}}
        @media(max-width:650px){.frame{padding:14px;gap:12px}.top h2{font-size:23px}.toolbar{flex-wrap:wrap}.toolbar .choice,.toolbar .choice:first-child{flex:1 1 42%}.row{grid-template-columns:1fr;gap:8px;padding:14px}.footer .actions{width:100%}.top .actions{gap:6px}button{padding:8px}.observed{font-size:12px}}
      </style>`;
      const frame=el('div',undefined,'frame'),top=el('div',undefined,'top'),heading=el('div');
      heading.append(el('h2','Picture profiles'),el('p',this.state.enabled?'Standards live on your TV. Everyday adjustments reset after a power cycle.':'Standards live on your TV. Automatic picture management is paused.','muted'));top.append(heading);
      const topActions=el('div',undefined,'actions');topActions.append(this.button('Refresh',()=>this.refresh()));
      topActions.append(this.button('Download backup',async()=>{try{this.download(await this.request({action:'backup'}),'lg-picture-backup.json');}catch(e){this.error(e.message);}}));
      const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.onchange=async()=>{try{const selected=file.files[0];if(!selected || selected.size>1000000)throw new Error('Choose a JSON profile or backup file smaller than 1 MB');const data=JSON.parse(await selected.text());if(!window.confirm('Replace saved picture standards with this file? Historical temporary adjustments will not be applied.'))return;await this.mutate(data.format==='lg-picture-bridge-backup'?{action:'restore_backup',backup:data,revision:this.state.revision}:{action:this.state.document?'import':'initialize',document:data,revision:this.state.revision,enabled:true,room:this.state.room});}catch(e){this.error(e.message);}};
      const importButton=this.button('Import',()=>file.click());importButton.disabled=!!this.status.offline;topActions.append(importButton,file);top.append(topActions);frame.append(top);
      const doc=this.state.document;
      if(!doc){frame.append(el('p','Import a profile collection to get started. Existing Home Assistant standards migrate automatically when both components are updated.','empty'),el('div',this.status.error || 'No collection yet.','message'));root.append(frame);this.lockControls();this.restoreFocus(focus);return;}
      if(this.device!=='all'&&!Object.hasOwn(doc.devices,this.device))this.device='all';
      const visible=this.groups().filter(g=>this.device==='all'||g.devices.includes(this.device));
      if(!visible.some(g=>g.id===this.bankId))this.bankId=visible[0]&&visible[0].id;
      const toolbar=el('div',undefined,'toolbar');
      toolbar.append(this.select('Device',[['all','All devices'],...Object.entries(doc.devices)],this.device,v=>{this.device=v;this.draft={};this.live=null;this.render();this.inspect();}));
      const label=g=>(this.device==='all'?(g.devices.map(d=>doc.devices[d]).join(' / ')||model.inputName(g.input))+' · ':'')+g.name;
      const choices=visible.map(g=>[g.id,label(g)+(visible.filter(other=>label(other)===label(g)).length>1?' · '+model.inputName(g.input):'')]);
      toolbar.append(this.select(this.view==='profiles'?'Format':this.view==='input'?'Input':'Native settings',choices,this.bankId,v=>{this.bankId=v;this.draft={};this.live=null;this.render();this.inspect();}));
      toolbar.append(this.select('Room variant',[['standard','Base standard'],['bright','Bright room'],['dark','Dark room']],this.variant,v=>{this.variant=v;this.draft={};this.live=null;this.render();this.inspect();}));
      toolbar.append(this.select('View',[['profiles','Picture profiles'],['input','HDMI options'],['advanced','Advanced native settings']],this.view,v=>{this.view=v;this.draft={};this.live=null;this.render();this.inspect();}));frame.append(toolbar);
      const group=this.group(),names=((group && group.devices)||[]).map(d=>doc.devices[d]);
      const stateLine=el('div',undefined,'top');
      const hint=this.view==='input'?'HDMI options apply across formats.':this.view==='advanced'?'Edit individual saved settings.':group&&group.presets&&group.presets.length?'Preset: '+group.presets.map(p=>model.modes[p]||p).join(' / ')+'.':'Saved picture settings.';
      stateLine.append(el('p',(names.length>1?'Shared by '+names.join(' and ')+'. ':'')+(group?model.inputName(group.input)+'. ':'')+hint,'notice'));
      const ack=this.status.backup_acknowledged===this.status.backup_sequence && this.status.backup_sequence;
      stateLine.append(el('span',this.status.offline?'TV offline · saved backup':ack?'Backup confirmed in HA':'TV owns standards','badge'));frame.append(stateLine);
      this.rows=el('div',undefined,'body');this.rows.setAttribute('aria-label','Profile settings');frame.append(this.rows);
      const footer=el('div',undefined,'footer'),actions=el('div',undefined,'actions');
      this.saveButton=this.button('Save standard',()=>this.mutate(this.banks().filter(b=>Object.keys(this.draft[b.id]||{}).length).map(b=>({action:'edit',bank_id:b.id,variant:this.variant,settings:this.draft[b.id],revision:this.state.revision}))),'primary');
      const restore=this.button('Restore this profile',()=>this.mutate(this.group().scopeBanks.map(b=>({action:'restore',scope:b.id}))));
      const promote=this.button('Keep current adjustments',()=>this.mutate(this.group().scopeBanks.map(b=>({action:'save',scope:b.id,revision:this.state.revision}))));
      [restore,promote].forEach(b=>b.disabled=!!this.status.offline||!group);actions.append(this.saveButton,restore,promote);
      const manage=this.button(this.state.enabled?'Automatic profiles: On':'Automatic profiles: Off',()=>this.mutate({action:'set_enabled',enabled:!this.state.enabled}),undefined,'management');manage.disabled=!!this.status.offline;manage.setAttribute('aria-pressed',String(this.state.enabled));manage.setAttribute('aria-describedby','management-help');
      const managementHelp=el('p',this.state.enabled?'Automatic profiles apply day/night settings and reset temporary adjustments after a power cycle.':'Automatic profiles are paused. Current TV settings stay in place.','muted');managementHelp.id='management-help';
      footer.append(actions,manage);frame.append(footer,managementHelp,el('div',this.status.error||('Current room: '+this.state.room+' · '+(this.status.temporary_count === undefined ? Object.values(this.state.overrides||{}).reduce((n,v)=>n+Object.keys(v).length,0) : this.status.temporary_count)+' temporary adjustments · Revision '+this.state.revision),'message'));
      if(this.adapter && this.adapter.tvRemote)frame.append(el('p',undefined,'muted remote-help'));
      root.append(frame);this.renderRows();this.lockControls();this.restoreFocus(focus);this.editing(root.activeElement && root.activeElement.dataset.focus===this.editingKey ? root.activeElement : null);
    }
    renderRows() {
      if(!this.rows)return;const focus=this.captureFocus();this.rows.replaceChildren();
      const group=this.group(),summarize=values=>[...new Set(values.map(display))].join(' / ');
      if(group&&group.missingPreset)this.rows.append(el('p','A selected preset has no picture values in this collection. Use Advanced native settings to review preset selection.','empty notice'));
      for(const part of model.rows(group)) {
        const section=el('section',undefined,'section'),title=el('h3',part.name);
        title.id='section-'+part.name.replace(/ /g,'-');section.setAttribute('aria-labelledby',title.id);section.append(title);
        for(const item of part.rows) {
          const records=item.bindings.map(({bank,key})=>{
            const saved=model.values(bank,this.state,this.variant)[key],draft=this.draft[bank.id]||{};
            return {bank,key,saved,value:Object.hasOwn(draft,key)?draft[key]:saved};
          });
          const key=item.key,value=records[0].value;
          const mixed=records.some(r=>!model.same(r.value,value))||(key==='blackLevel'&&new Set(Object.values(value)).size>1);
          const row=el('div',undefined,'row'),name=el('div');name.append(el('strong',pretty(key)));
          const brightness=records.find(r=>r.key==='backlight'&&r.bank.brightness_role);
          if(brightness)name.append(el('p',brightness.bank.brightness_role==='game_sdr'?'Shared SDR game brightness':this.variant==='standard'?'Choose Bright or Dark to edit shared movie brightness':'Shared SDR movie brightness','muted'));
          if(mixed)name.append(el('p','Saved values differ. Choose a value to use for this format.','muted'));
          row.append(name);
          const control=model.control(item,this.live),disabled=!!this.status.offline||!!(brightness&&brightness.bank.brightness_role==='movie_sdr'&&this.variant==='standard');let input;
          const update=v=>{
            for(const r of records) {
              const next=r.key==='blackLevel'?Object.fromEntries(Object.keys(r.saved).map(k=>[k,v])):v;
              const draft=this.draft[r.bank.id]||{};
              if(v===undefined||model.same(r.saved,next))delete draft[r.key];else draft[r.key]=next;
              if(Object.keys(draft).length)this.draft[r.bank.id]=draft;else delete this.draft[r.bank.id];
            }
            this.saveButton.disabled=!!this.status.offline||!Object.keys(this.draft).length;
          };
          if(control&&control.component==='number') {
            input=el('div',undefined,'range');const slider=el('input'),number=el('input');slider.type='range';number.type='number';
            [slider,number].forEach(n=>{n.min=control.min;n.max=control.max;n.step=control.step;n.value=mixed?'':value;n.setAttribute('aria-label',pretty(key));n.dataset.focus='setting:'+item.id+':'+n.type;n.disabled=disabled;});
            slider.hidden=mixed;number.placeholder='Mixed';
            slider.oninput=()=>{number.value=slider.value;update(Number(slider.value));};
            number.oninput=()=>{slider.hidden=number.value==='';if(number.value!=='')slider.value=number.value;update(number.value===''?undefined:Number(number.value));};input.append(slider,number);
          } else if(control&&control.options) {
            input=el('select');input.setAttribute('aria-label',pretty(key));input.dataset.focus='setting:'+item.id;
            if(mixed){const option=el('option','Mixed');option.value='';option.disabled=true;input.append(option);}
            control.options.forEach(v=>{const option=el('option',v);option.value=v;input.append(option);});input.value=mixed?'':display(value);input.disabled=disabled;input.onchange=()=>update(input.value);
          } else input=el('span',mixed?'Mixed: '+summarize(records.map(r=>r.value)):display(value));
          row.append(input);
          const temporary=records.filter(r=>Object.hasOwn((this.state.overrides||{})[r.bank.id]||{},r.key)).map(r=>this.state.overrides[r.bank.id][r.key]);
          const observed=records.map(r=>this.live&&this.live[r.bank.id]?this.live[r.bank.id].settings[r.key]:undefined);
          row.append(el('span',temporary.length?'Temporary: '+summarize(temporary):observed.every(v=>v!==undefined)?'TV: '+summarize(observed):this.status.offline?'Last saved standard':'Reading TV ranges…',temporary.length?'observed temporary':'observed'));
          section.append(row);
        }
        this.rows.append(section);
      }
      if(!this.banks().length)this.rows.append(el('p','No saved settings in this view. Check HDMI options or Advanced native settings.','empty'));
      this.saveButton.disabled=!!this.status.offline||!this.banks().some(b=>Object.keys(this.draft[b.id]||{}).length);
      this.lockControls();
      this.restoreFocus(focus);
    }
  }
  if(!customElements.get('lg-profile-editor'))customElements.define('lg-profile-editor',Editor);
}());
