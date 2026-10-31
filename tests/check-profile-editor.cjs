'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const state=require('./fixtures/profile-editor.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844},{width:320,height:640}]) {
      const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await mount(page,state);
      const a=actions(page),{q,button}=a,narrow=viewport.width<700;
      const open=async alias=>{if(narrow&&await a.focusKey('pane-back').isVisible())await a.focusKey('pane-back').click();await a.open(alias);};
      await a.focusKey('setting:color').waitFor();await a.ready();
      // Without a picture on screen the editor starts at the first managed preset.
      assert.deepEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').target.presets),['filmMaker']);
      await open('color');
      assert.equal(await a.number('color').inputValue(),'50');
      assert(await q('.valuebox').getByText('Temporary on TV: 55').isVisible());
      assert.match(await a.focusKey('col:hdmi3').textContent(),/Apple TV, NVIDIA Shield, Nintendo Switch 2/,'Column headers name the devices sharing an input');
      await open('colorTemperature');
      assert.equal(await a.number('colorTemperature').getAttribute('min'),'-50');assert.equal(await a.number('colorTemperature').getAttribute('max'),'50');
      // Choose HDR Game on HDMI 3, then edit Game Optimizer sharpness.
      await open('sharpness');await a.cell('hdmi3','hdrGame').click();await a.ready();
      await a.number('sharpness').fill('4');
      assert.equal((await a.calls('edit_many')).length,0,'Editing is a draft until explicit preview and save');
      await button('Review 1 changes').click();
      assert(await page.getByText('HDMI 3 · HDR + ALLM · Game Optimizer / Standard',{exact:true}).isVisible());
      await button('Save standards').click();await a.saved();
      assert.deepEqual(await a.calls('edit_many'),[{action:'edit_many',edits:[{bank_id:'game',variant:'standard',settings:{gameSharpness:4}}],preferences:{},revision:7}]);
      // Motion settings are listed with their own native targets.
      await a.target({inputs:['hdmi3'],presets:['filmMaker']});
      if(narrow)await a.focusKey('pane-back').click();
      assert(await a.setting('realCinema').isVisible());assert(await a.setting('truMotionMode').isVisible());
      await open('realCinema');assert.equal(await a.choice('realCinema').inputValue(),'on');
      await open('truMotionMode');assert.equal(await a.choice('truMotionMode').inputValue(),'off');
      // Backup tools live with profile management in Home Assistant.
      await a.focusKey('open-profiles').click();
      assert(await button('Download backup').isVisible());assert(await button('Import').isVisible());
      await a.focusKey('view-back').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),viewport.height,'Only the editor panes scroll');
      await a.noOverflow(viewport.width);
      for(const n of await q('button').all()) {
        const b=await n.boundingBox();if(b)assert(b.x>=0&&b.x+b.width<=viewport.width+1,'Controls must not overflow horizontally');
      }
      assert.deepEqual(errors,[]);
      if(viewport.width===1920||viewport.width===390)await page.screenshot({path:'/tmp/lg-scope-editor-'+viewport.width+'.png'});
      await page.close();
    }
    console.log('Editor: desktop, 720p TV and narrow mobile layout; native limits, exact preview/save, motion and backup tools passed.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
