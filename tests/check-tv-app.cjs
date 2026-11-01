'use strict';
// The TV's own app covers the HDMI picture: no "On TV now" card, the profile
// in use sits in the header, and the editor still opens on the last HDMI
// picture. Clicks land while setting descriptions are still arriving.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,tvApp:true,fileTransfer:false},data=>{
      data.state.context={ready:false,input:'default',mode:'standard',range:'sdr'};
      data.lastContext={input:'hdmi3',mode:'filmMaker',range:'sdr',at:'2026-10-31T13:00:00Z'};
    });
    const a=actions(page),{q}=a;
    await a.number('backlight').waitFor();await a.ready();
    assert.equal(await q('.tv-card').count(),0,'No On TV now card inside the TV app');
    assert.equal(await q('.top .tv-using').textContent(),'Using Dark room · Automatic');
    const context=await q('.context').boundingBox(),edit=await q('.edit-card').boundingBox();
    assert(edit.width>context.width-4,'The Editing card uses the full width');
    const target=await page.evaluate(()=>document.querySelector('lg-profile-editor').target);
    assert.deepEqual([target.inputs,target.presets],[['hdmi3'],['filmMaker']],'Still opens on the last HDMI picture');
    // The remote reaches the profile view in the header, and Back returns there.
    await a.focusKey('edit:standard').focus();await a.reach('open-tv');await page.keyboard.press('Enter');
    assert(await q('.sheet').getByText('the TV returns here when you close this app',{exact:false}).isVisible());
    await page.keyboard.press('Escape');assert.equal((await a.focused()).key,'open-tv');
    for(const width of [1280,960]){await page.setViewportSize({width,height:width*9/16});await a.noOverflow(width);}
    await page.setViewportSize({width:1920,height:1080});

    // Human-speed clicks (press, hold, release) during a slow load all land:
    // arriving data no longer redraws the button under the pointer.
    await page.evaluate(()=>{window.delayInspect=true;window.calls.length=0;document.querySelector('lg-profile-editor').refresh(true);});
    await page.waitForFunction(()=>window.calls.filter(c=>c.action==='inspect_many').length>=1);
    let landed=0;
    for(const key of ['target:family:movie','target:family:game','target:family:movie']) {
      const before=await page.evaluate(()=>JSON.stringify(document.querySelector('lg-profile-editor').target.presets));
      const box=await a.focusKey(key).boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      // Data arrives while the button is held.
      await page.waitForTimeout(220);await page.mouse.up();await page.waitForTimeout(30);
      if(await page.evaluate(b=>JSON.stringify(document.querySelector('lg-profile-editor').target.presets)!==b,before))landed++;
    }
    assert.equal(landed,3,'Every click during loading takes effect');
    await a.ready();
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').deferredRender),null,'Deferred redraws ran after release');
    // Wheel-scrolling the right pane while new rows load keeps its position:
    // redraws no longer scroll the still-focused chip back into view.
    await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');e.allPresets=false;e.renderPanes();});
    await a.focusKey('grid:all-presets').click();
    const detail=await q('.detail').boundingBox();
    await page.mouse.move(detail.x+detail.width/2,detail.y+detail.height/2);await page.mouse.wheel(0,700);
    await page.waitForFunction(()=>document.querySelector('lg-profile-editor').shadowRoot.querySelector('.detail').scrollTop>=600);
    const scrolled=await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.querySelector('.detail').scrollTop);
    await a.ready();await page.waitForFunction(()=>document.querySelector('lg-profile-editor').inflight.size===0);
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.querySelector('.detail').scrollTop),scrolled,'Loading never scrolls the right pane back up');
    assert.equal((await a.focused()).key,'grid:all-presets','Focus is kept without being scrolled into view');
    assert.deepEqual(errors,[]);
    console.log('TV app header without On TV now, last-picture default, clicks during loading and scroll position during loading passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
