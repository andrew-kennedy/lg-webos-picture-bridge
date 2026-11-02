'use strict';
// TV apps (LG's "default" input: the Home Screen and webOS apps) is an input
// column after the HDMI ports. It stores picture and preset-selection values,
// so motion and HDMI port settings show no TV apps column.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull,addTvApps}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,fileTransfer:false},addTvApps);
    const a=actions(page),{q}=a;
    await a.number('backlight').waitFor();await a.ready();
    const columns=()=>page.evaluate(()=>[...document.querySelector('lg-profile-editor').shadowRoot.querySelectorAll('.colh')].map(n=>n.dataset.focus.slice(4)));
    await a.open('sharpness');
    assert.equal((await columns()).at(-1),'default','TV apps follow the HDMI inputs');
    assert.equal(await a.focusKey('col:default').locator('.colname').textContent(),'TV apps');
    assert(await a.focusKey('col:default').getByText('Home & apps',{exact:true}).isVisible());
    // A TV apps value is edited like any input: a native-only Base save.
    await a.cell('default','filmMaker').click();await a.ready();
    assert(await q('.valuebox').getByText('TV apps · SDR Filmmaker',{exact:true}).first().isVisible());
    assert.equal(await a.number('sharpness').inputValue(),'10');
    await a.number('sharpness').fill('0');await a.button('Review 1 change').click();
    await a.focusKey('review-confirm').click();await a.saved();await a.ready();
    assert.deepEqual((await a.calls('edit_many')).at(-1).edits,[{bank_id:'native_tv_apps_filmMaker',variant:'standard',settings:{sharpness:0},expected:{sharpness:10}}]);
    assert.equal(await a.number('sharpness').inputValue(),'0');
    // Preset selection has TV apps rows; TruMotion and HDMI port settings have no TV apps column.
    await a.open('pictureMode');
    assert((await columns()).includes('default'));
    assert(await a.cell('default','sdr').isVisible());
    await a.open('truMotionMode');assert(!(await columns()).includes('default'),'TV apps store TruMotion per app');
    await a.open('enableALLM');assert(!(await columns()).includes('default'),'No HDMI port settings for TV apps');
    await a.open('backlight');await a.noOverflow(1920);
    await page.setViewportSize({width:1280,height:720});await a.noOverflow(1280);
    assert.deepEqual(errors,[]);
    console.log('TV apps input: column after HDMI, native-only Base edit, preset selection rows, no motion or port column passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
