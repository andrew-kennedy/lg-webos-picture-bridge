'use strict';
// A setting the TV model never uses (Dolby Precision Detail on the G6) is not
// listed: the bridge names it in status, and older bridges reveal it through
// each inspected bank's model switches. Its stored values are kept.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const reason='LG disables Dolby Precision Detail in this TV model configuration, for every preset.';
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    // Bridge 0.25.0: status names the setting, so it never appears.
    let page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true},data=>{data.unsupported={dolbyPrecisionDetail:reason};});
    let a=actions(page);
    await a.setting('backlight').waitFor();await a.ready();
    assert.equal(await a.setting('dolbyPrecisionDetail').count(),0,'Dolby Precision Detail is not listed');
    for(const alias of ['nearBlackDetail','blackLevel','smoothGradation'])assert.equal(await a.setting(alias).count(),1,alias+' is still listed');
    const kept=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return e.records().filter(r=>r.alias==='dolbyPrecisionDetail').length;});
    assert(kept>0,'Its stored records are kept, only hidden');
    await a.open('nearBlackDetail');await a.noOverflow(1920);
    await page.close();

    // An older bridge: the setting shows until the first inspected bank
    // reports the model switch, then disappears, even while it was open.
    page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true});
    a=actions(page);
    await a.setting('dolbyPrecisionDetail').waitFor();await a.ready();
    await a.open('dolbyPrecisionDetail');
    await page.evaluate(async()=>{const e=document.querySelector('lg-profile-editor');
      // The next reads report the model switch, as bridges 0.17–0.24 do.
      const request=e.adapter.request;e.adapter.request=async command=>{const r=await request(command);
        if(command.action==='inspect_many')for(const b of r.banks)b.capabilities={dolbyPrecisionDetail:false};
        if(command.action==='inspect')r.capabilities={dolbyPrecisionDetail:false};return r;};
      e.resetLive();e.renderPanes();await e.inspect();});
    await a.ready();
    assert.equal(await a.setting('dolbyPrecisionDetail').count(),0,'Hidden once an inspected bank reports the model switch');
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').setting),'backlight','The open setting moves to a listed one');
    assert(await a.number('backlight').isVisible());
    assert.deepEqual(errors,[]);
    console.log('Unsupported settings: hidden from status or inspected model switches, stored values kept, open setting moves on passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
