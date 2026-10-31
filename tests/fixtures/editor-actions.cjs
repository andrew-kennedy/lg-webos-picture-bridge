'use strict';
// Shared browser-test helpers for the target-grid editor.
function actions(page) {
  const q=selector=>page.locator('lg-profile-editor '+selector);
  const editor=fn=>page.evaluate(fn);
  return {
    q,
    button:name=>page.getByRole('button',{name,exact:true}),
    focusKey:key=>q('[data-focus="'+key+'"]'),
    setting:alias=>q('[data-focus="setting:'+alias+'"]'),
    cell:(column,row)=>q('[data-focus="cell:'+column+':'+row+'"]'),
    number:alias=>q('[data-focus="value:'+alias+':number"]'),
    slider:alias=>q('[data-focus="value:'+alias+':range"]'),
    choice:alias=>q('[data-focus="value:'+alias+':select"]'),
    saved:()=>page.getByText('Saved on the TV.',{exact:false}).waitFor(),
    calls:action=>page.evaluate(action=>window.calls.filter(c=>c.action===action),action),
    async open(alias){await q('[data-focus="setting:'+alias+'"]').click();await this.ready();},
    // Wait until every value the current setting would change has been described.
    ready:()=>page.waitForFunction(()=>{const e=document.querySelector('lg-profile-editor');return e.state&&e.setting&&e.targetsFor(e.setting).pending.length===0;}),
    // Set the target directly for tests that are not about choosing it.
    async target(target){await page.evaluate(async target=>{const e=document.querySelector('lg-profile-editor');e.target={ranges:null,genres:null,allm:null,...target};e.renderPanes();await e.inspect();},target);await this.ready();},
    focused:()=>page.evaluate(()=>{const e=document.querySelector('lg-profile-editor'),n=e.shadowRoot.activeElement;return n?{key:n.dataset.focus,label:n.getAttribute('aria-label')||n.textContent,editing:n.hasAttribute('data-editing')}:null;}),
    // Arrow-only navigation toward a control, using the editor's own spatial
    // rules. Fails if the remote cannot reach it.
    async reach(key,limit=80){
      const seen=[];
      for(let i=0;i<limit;i++) {
        const step=await page.evaluate(({key,seen})=>{
          const e=document.querySelector('lg-profile-editor'),root=e.shadowRoot,active=root.activeElement,target=root.querySelector('[data-focus="'+key+'"]');
          if(!target)return {missing:true};if(active===target)return {done:true};
          const a=active.getBoundingClientRect(),t=target.getBoundingClientRect(),dx=(t.left+t.right-a.left-a.right)/2,dy=(t.top+t.bottom-a.top-a.bottom)/2;
          const vert=[dy>0?'ArrowDown':'ArrowUp',dy],horiz=[dx>0?'ArrowRight':'ArrowLeft',dx];
          const options=(Math.abs(dy)>=Math.abs(dx)?[vert,horiz]:[horiz,vert]).filter(([,d])=>Math.abs(d)>4).map(([k])=>[k,e.neighbor(active,k)]).filter(([,n])=>n);
          const fresh=options.find(([,n])=>!seen.includes(n.dataset.focus))||options[0];
          return {key:fresh&&fresh[0],from:active.dataset.focus};
        },{key,seen});
        if(step.done)return;if(step.missing)throw new Error('No control '+key);
        if(!step.key)throw new Error('Remote is stuck before '+key+' at '+step.from);
        seen.push(step.from);await page.keyboard.press(step.key);
      }
      throw new Error('Remote cannot reach '+key+' from '+JSON.stringify(await this.focused()));
    },
    async noOverflow(width){
      const ok=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor'),body=e.shadowRoot.querySelector('.body');return document.documentElement.scrollWidth<=innerWidth&&(!body||body.scrollWidth<=body.clientWidth);});
      if(!ok)throw new Error('Horizontal overflow at '+width);
    },
    editor
  };
}
module.exports={actions};
