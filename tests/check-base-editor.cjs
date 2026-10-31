'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const catalog=require('../app/bridge/lib/profile-catalog');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const state=structuredClone(require('./fixtures/profile-formats.cjs'));
    state.document=catalog.upgrade(state.document,state.preferences);state.selection='automatic';state.active_profile='dark';
    state.document.banks.find(b=>b.id==='movie_filmMaker').variants={dark:{color:55}};
    await mount(page,state,{tvRemote:true,fileTransfer:false});
    const button=name=>page.getByRole('button',{name,exact:true}),saved=()=>page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const color=page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true});
    await button('Edit Base').waitFor();
    assert.equal(await button('Edit Base').getAttribute('aria-pressed'),'true');
    assert(await page.getByText('On TV: Dark room · Automatic',{exact:true}).isVisible());
    await page.screenshot({path:'/tmp/lg-base-editor-home.png'});
    await page.evaluate(async()=>{const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],format:['sdr'],preset:['filmMaker']};e.render();await e.inspect();});
    assert.equal(await color.inputValue(),'50');
    await color.fill('51');await button('Review 1 changes').click();
    assert(await page.getByRole('heading',{name:'Review Base changes',exact:true}).isVisible());
    assert(await page.getByText('Profiles following this Base value: Bright room.',{exact:true}).isVisible());
    assert(await page.getByText('Existing overrides stay in: Dark room.',{exact:true}).isVisible());
    await button('Back to editing').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.activeElement.textContent),'Save Base');
    await page.keyboard.press('Enter');await saved();
    let bank=await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker'));
    assert.equal(bank.settings.color,51);assert.equal(bank.variants.dark.color,55,'Saving Base keeps explicit profile overrides');
    await button('Edit profile').click();assert.equal(await color.inputValue(),'55');
    await color.fill('56');
    // The per-setting shortcut preserves a profile draft and focuses the same
    // Base control after a delayed applicability read, including remote use.
    await page.evaluate(()=>{window.delayInspect=true;});
    await button('Edit Base for Color depth · SDR').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('lg-profile-editor').shadowRoot.activeElement?.getAttribute('aria-label')==='Color depth · SDR');
    assert.equal(await color.inputValue(),'51');
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),1);
    assert.deepEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').scope),{port:['hdmi3'],format:['sdr'],preset:['filmMaker']});
    await color.fill('52');await button('Review 2 changes').click();
    assert(await page.getByText('Save to: Base',{exact:true}).isVisible());
    assert(await page.getByText('Save to: Dark room',{exact:true}).isVisible());
    await page.screenshot({path:'/tmp/lg-base-editor-review.png'});
    await button('Save all reviewed changes').click();await saved();
    bank=await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker'));
    assert.equal(bank.settings.color,52);assert.equal(bank.variants.dark.color,56);
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='apply_profile').length),0,'Editing never changes viewing-profile selection');
    assert.equal(await page.evaluate(()=>window.fixture.selection),'automatic');
    // An override reset only changes membership. It never writes a new Base.
    await button('Edit profile').click();await button('Remove override for Color depth · SDR').click();
    await button('Review 1 changes').click();await button('Save Dark room overrides').click();await saved();
    bank=await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker'));
    assert.equal(bank.settings.color,52);assert.equal(bank.variants?.dark?.color,undefined);
    assert.equal(await color.inputValue(),'52');
    // The frequently changed linked brightness has explicit room overrides.
    // Review makes clear why saving Base will not replace the Dark value.
    await button('Edit Base').click();
    const light=page.getByRole('spinbutton',{name:'OLED pixel brightness · Linked SDR movie values',exact:true});
    await light.fill('10');await button('Review 1 changes').click();
    assert(await page.getByText('Existing overrides stay in: Bright room, Dark room.',{exact:true}).isVisible());
    await button('Save Base').click();await saved();
    assert.equal(await page.evaluate(()=>window.fixture.document.brightness.movie_sdr),10);
    await button('Edit profile').click();assert.equal(await light.inputValue(),'3');
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?1080:844});
      await button('Edit Base for Color depth · SDR').scrollIntoViewIfNeeded();
      assert(await page.evaluate(()=>{const body=document.querySelector('lg-profile-editor').shadowRoot.querySelector('.body');return document.documentElement.scrollWidth<=innerWidth&&body.scrollWidth<=body.clientWidth;}),'No horizontal overflow at '+width);
      await page.screenshot({path:'/tmp/lg-base-editor-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Default Base editing, explicit save destination, inheritance impact, profile-to-Base remote shortcut, mixed drafts and responsive layout passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
