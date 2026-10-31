'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const {setup}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const state=require('./fixtures/profile-editor.cjs');
const appRoot=process.env.PROFILE_TEST_APP_ROOT||path.join(__dirname,'../app');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1920,height:1080},{width:1280,height:720}]) {
      const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('http://bridge.test/**',route=>{
        const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
        if(!/^(index\.html|app\.js|profile-editor\.js|profile-view\.js|styles\.css|assets\/icon160\.png)$/.test(name))return route.abort();
        return route.fulfill({path:path.join(appRoot,name)});
      });
      await page.addInitScript(setup,state);await page.goto('http://bridge.test/');
      await page.evaluate(()=>document.dispatchEvent(new CustomEvent('webOSLaunch',{detail:{}})));
      await page.waitForFunction(()=>document.activeElement.id==='refresh-button');
      await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-button');
      await page.keyboard.press('Enter');
      const a=actions(page);
      await a.number('backlight').or(a.focusKey('setting:backlight')).first().waitFor();await a.ready();
      assert.equal(await page.getByRole('button',{name:'Import',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Download backup',exact:true}).count(),0);
      assert.equal(await page.locator('lg-profile-editor input[type=file]').count(),0);
      assert.equal(await a.focusKey('open-profiles').count(),0,'Schema 1 without named-profile support has no profile view on the TV');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await page.keyboard.press('ArrowDown');
      // Legacy LG key codes, dispatched like the webOS remote.
      const legacy=code=>page.evaluate(code=>{
        const root=document.querySelector('#profile-editor').shadowRoot;
        (root.activeElement||document.activeElement).dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:code,which:code,bubbles:true,composed:true,cancelable:true}));
      },code);
      assert.equal((await a.focused()).label,'Refresh');
      await legacy(40);assert.notEqual((await a.focused()).label,'Refresh','Legacy Down moves spatially');
      // Choose a setting from the list, a target in the grid, then edit.
      await a.reach('setting:color');await legacy(13);
      assert.equal(await a.focusKey('setting:color').getAttribute('aria-current'),'true');
      assert.equal(await page.evaluate(()=>window.calls.filter(c=>!['get','inspect','inspect_many'].includes(c.action)).length),0,'Arrow navigation and selection do not mutate settings');
      await a.reach('cell:hdmi3:hdrGame');await legacy(13);await a.ready();
      assert.equal(await a.cell('hdmi3','hdrGame').getAttribute('aria-pressed'),'true','OK selects a grid target');
      const colorKey='value:color:number';
      await a.reach(colorKey);await page.keyboard.press('Enter');assert((await a.focused()).editing);
      await legacy(37);await legacy(461);
      assert.equal(await a.number('color').inputValue(),'49');assert.equal((await a.focused()).editing,false);
      assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),false,'Back first ends editing');
      await page.evaluate(()=>{window.delayInspect=true;window.inspected=false;document.querySelector('#profile-editor').inspect(true).then(()=>{window.inspected=true;});});
      await page.waitForFunction(()=>window.inspected);
      assert.equal((await a.focused()).key,colorKey,'Async metadata refresh preserves exact remote focus');
      assert.equal(await a.slider('color').inputValue(),'49');
      await page.evaluate(()=>{window.delayInspect=false;});
      await a.reach('setting:sharpness');await page.keyboard.press('Enter');await a.ready();
      await a.reach('value:sharpness:number');await page.keyboard.press('Enter');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
      assert.equal(await a.number('sharpness').inputValue(),'0','Remote respects native lower bound');
      await a.reach('review');await page.keyboard.press('Enter');assert.equal((await a.focused()).key,'review-back');
      await legacy(461);assert.equal((await a.focused()).key,'review','Back leaves review before leaving the app');
      await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');assert.equal((await a.focused()).key,'review-confirm');
      await legacy(13);await a.saved();
      assert.deepEqual(await a.calls('edit_many'),[{action:'edit_many',edits:[{bank_id:'game',variant:'standard',settings:{gameColorDepth:49}}],preferences:{},revision:7}]);
      assert(await a.focused(),'Saving retains an enabled remote focus target');
      // Viewing-profile controls live in their own view; Back returns.
      await a.reach('open-tv');await page.keyboard.press('Enter');assert.equal((await a.focused()).key,'view-back');
      await a.reach('management');await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Profile management: Off',exact:true}).waitFor();
      assert.equal((await a.focused()).key,'management');
      await legacy(461);assert.equal((await a.focused()).key,'open-tv','Back closes the view and returns focus');
      await a.reach('button:Refresh');await page.keyboard.press('Enter');
      await a.number('sharpness').waitFor();
      assert.equal((await a.focused()).label,'Refresh');
      await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await page.keyboard.press('ArrowDown');await page.evaluate(()=>{window.delayGet=true;});
      await page.keyboard.press('Enter');await legacy(461);await page.waitForTimeout(200);
      assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-button','Late response does not steal focus from the closed editor');
      await page.evaluate(()=>{window.fixture.document=null;window.offline=true;window.delayGet=false;});
      await page.keyboard.press('Enter');await page.getByText('No collection yet.',{exact:true}).waitFor();
      await page.keyboard.press('ArrowDown');assert.equal((await a.focused()).label,'Refresh');
      await page.keyboard.press('ArrowRight');assert.equal((await a.focused()).label,'Refresh');
      await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await legacy(461);assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
      assert.deepEqual(errors,[]);await page.close();
      console.log('Remote '+viewport.width+'x'+viewport.height+': spatial list/grid/value navigation, legacy keys, editing, review/back/save, views, async focus and empty view passed.');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
