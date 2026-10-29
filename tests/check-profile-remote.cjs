'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const {setup}=require('./fixtures/editor-host.cjs');
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
      await page.keyboard.press('Enter');await page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Import',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Download backup',exact:true}).count(),0);
      assert.equal(await page.locator('lg-profile-editor input[type=file]').count(),0);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await page.keyboard.press('ArrowDown');
      const focused=()=>page.evaluate(()=>{
        const n=document.querySelector('#profile-editor').shadowRoot.activeElement;
        return n?{key:n.dataset.focus,label:n.getAttribute('aria-label')||n.textContent,type:n.type,editing:n.hasAttribute('data-editing')}:null;
      });
      const legacy=code=>page.evaluate(code=>{
        const root=document.querySelector('#profile-editor').shadowRoot;
        (root.activeElement||document.activeElement).dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:code,which:code,bubbles:true,composed:true,cancelable:true}));
      },code);
      const walk=async(key)=>{
        for(let i=0;i<150;i++){if((await focused())?.key===key)return;await page.keyboard.press('ArrowDown');}
        assert.fail('Remote cannot reach '+key);
      };
      assert.equal((await focused()).label,'Refresh');
      await legacy(39);assert.equal((await focused()).key,'scope:port:hdmi3');
      await legacy(13);assert.equal((await focused()).key,'scope:port:hdmi3','Filtering preserves focus');
      await page.getByText('No saved settings match this selection.',{exact:true}).waitFor();
      await legacy(13);
      await walk('more-factors');await legacy(13);
      assert.equal(await page.getByLabel('Room variant',{exact:true}).isVisible(),true,'Legacy OK opens grouping details');
      await walk('choice:Room variant');await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await legacy(461);
      assert.equal(await page.getByLabel('Room variant',{exact:true}).inputValue(),'bright');
      assert.equal((await focused()).editing,false);assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),false);
      await page.keyboard.press('Enter');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
      await walk('scope:format:sdr');await page.keyboard.press('Enter');
      await page.getByRole('slider',{name:'Color depth · HDR',exact:true}).waitFor();
      const colorKey='setting:color:["HDR"]:range';
      await walk(colorKey);
      assert.equal(await page.evaluate(()=>window.calls.filter(c=>!['get','inspect'].includes(c.action)).length),0,'Arrow navigation and filters do not mutate settings');
      await page.keyboard.press('Enter');await legacy(37);await legacy(461);
      assert.equal(await page.getByRole('spinbutton',{name:'Color depth · HDR',exact:true}).inputValue(),'49');
      await page.evaluate(()=>{window.delayInspect=true;window.inspected=false;document.querySelector('#profile-editor').inspect(true).then(()=>{window.inspected=true;});});
      await page.waitForFunction(()=>window.inspected);
      assert.equal((await focused()).key,colorKey,'Async metadata refresh preserves exact remote focus');
      assert.equal(await page.getByRole('slider',{name:'Color depth · HDR',exact:true}).inputValue(),'49');
      await page.evaluate(()=>{window.delayInspect=false;});
      await walk('setting:sharpness:["HDR"]:range');await page.keyboard.press('Enter');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('slider',{name:'Sharpness · HDR',exact:true}).inputValue(),'0','Remote respects native lower bound');
      await walk('review');await page.keyboard.press('Enter');assert.equal((await focused()).key,'review-back');
      await legacy(461);assert.equal((await focused()).key,'review','Back leaves review before leaving the app');
      await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');assert.equal((await focused()).key,'review-confirm');
      await legacy(13);await page.getByText('Saved on the TV.',{exact:false}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many')),[{action:'edit_many',edits:[{bank_id:'game',variant:'standard',settings:{gameColorDepth:49}}],preferences:{},revision:7}]);
      assert(await focused(),'Saving retains an enabled remote focus target');
      await walk('management');await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Automatic profiles: Off',exact:true}).waitFor();
      assert.equal((await focused()).key,'management');assert.equal((await focused()).label,'Automatic profiles: Off');
      await walk('button:Refresh');await page.keyboard.press('Enter');
      await page.getByRole('slider',{name:'Color depth · HDR',exact:true}).waitFor();
      assert.equal((await focused()).label,'Refresh');
      await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await page.keyboard.press('ArrowDown');await page.evaluate(()=>{window.delayGet=true;});
      await page.keyboard.press('Enter');await legacy(461);await page.waitForTimeout(200);
      assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-button','Late response does not steal focus from the closed editor');
      await page.evaluate(()=>{window.fixture.document=null;window.offline=true;window.delayGet=false;});
      await page.keyboard.press('Enter');await page.getByText('No collection yet.',{exact:true}).waitFor();
      await page.keyboard.press('ArrowDown');assert.equal((await focused()).label,'Refresh');
      await page.keyboard.press('ArrowRight');assert.equal((await focused()).label,'Refresh');
      await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
      await legacy(461);assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
      assert.deepEqual(errors,[]);await page.close();
      console.log('Remote '+viewport.width+'x'+viewport.height+': arrow-only scope/details navigation, bounded drafts, review/back/save, async focus and empty view passed.');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
