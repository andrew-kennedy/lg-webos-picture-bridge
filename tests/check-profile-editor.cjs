'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const state=require('./fixtures/profile-editor.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844},{width:320,height:640}]) {
      const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await mount(page,state);
      const color=page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true});await color.waitFor();
      assert(await page.getByRole('button',{name:'Import',exact:true}).isVisible());
      assert(await page.getByRole('button',{name:'Download backup',exact:true}).isVisible());
      assert(await page.getByText('Shared values on HDMI 3: Apple TV, NVIDIA Shield',{exact:true}).count());
      assert(await page.getByText('Temporary: 55').isVisible());
      const temperature=page.getByRole('spinbutton',{name:'Color temperature · SDR'});
      assert.equal(await temperature.getAttribute('min'),'-50');assert.equal(await temperature.getAttribute('max'),'50');
      await page.getByRole('spinbutton',{name:'Sharpness · HDR',exact:true}).fill('4');
      assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').length),0,'Editing is a draft until explicit preview and save');
      await page.getByRole('button',{name:'Review 1 changes',exact:true}).click();
      assert(await page.getByText('HDMI 3 · HDR + ALLM · Game Optimizer / Standard',{exact:true}).isVisible());
      await page.getByRole('button',{name:'Save standards',exact:true}).click();
      await page.getByText('Saved on the TV.',{exact:false}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many')),[{action:'edit_many',edits:[{bank_id:'game',variant:'standard',settings:{gameSharpness:4}}],preferences:{},revision:7}]);
      await page.getByRole('button',{name:'Motion',exact:true}).click();
      await page.getByRole('combobox',{name:'Real Cinema · SDR',exact:true}).waitFor();
      await page.getByRole('combobox',{name:'TruMotion · SDR',exact:true}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'Contrast',exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),viewport.height,'Only the editor body scrolls');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
      const body=page.locator('lg-profile-editor .body');assert(await body.evaluate(n=>n.clientHeight>=100));
      assert(await page.getByRole('button',{name:'Restore selected',exact:true}).isVisible());
      for(const n of await page.locator('lg-profile-editor button').all()) {
        const b=await n.boundingBox();if(b)assert(b.x>=0&&b.x+b.width<=viewport.width+1,'Controls must not overflow horizontally');
      }
      assert.deepEqual(errors,[]);
      if(viewport.width===1920||viewport.width===390)await page.screenshot({path:'/tmp/lg-scope-editor-'+viewport.width+'.png'});
      await page.close();
    }
    console.log('Scope editor: desktop, 720p TV and narrow mobile layout; native limits, exact preview/save and Real Cinema passed.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
