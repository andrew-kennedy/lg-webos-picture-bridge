'use strict';
// With no HDMI picture on screen (from Home Assistant), the editor centres on
// the last confirmed HDMI picture and names it Last watched.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    // An app is on screen: LG reports no confirmed HDMI picture.
    await mountFull(page,{tvRemote:true,fileTransfer:false},data=>{data.state.context={ready:false,input:'default',mode:'standard',range:'sdr'};data.lastContext={input:'hdmi3',mode:'filmMaker',range:'sdr',at:'2026-10-31T13:00:00Z'};});
    const a=actions(page),{q,button}=a;
    await a.number('backlight').waitFor();await a.ready();
    assert.equal(await q('.tv-card .card-label').textContent(),'Last watched');
    assert.equal(await q('.tv-card .now').textContent(),'HDMI 3 · SDR Filmmaker');
    assert.equal(await q('.tv-card .dot.last').count(),1,'A hollow marker: not on screen right now');
    const target=await page.evaluate(()=>document.querySelector('lg-profile-editor').target);
    assert.deepEqual([target.inputs,target.presets],[['hdmi3'],['filmMaker']],'Opens on the last HDMI picture');
    assert.match(await a.cell('hdmi3','filmMaker').getAttribute('aria-label'),/last watched/);
    assert.doesNotMatch(await a.cell('hdmi3','filmMaker').getAttribute('aria-label'),/on screen/);
    assert.equal(await a.focusKey('target:live').textContent(),'Last watched');
    assert(await q('.valuebox').getByText('includes what you last watched').isVisible());
    await a.focusKey('open-tv').click();
    assert(await q('.sheet').getByText('HDMI 3 · SDR Filmmaker · SDR · no HDMI picture on screen now',{exact:true}).isVisible());
    await a.focusKey('view-back').click();
    // Before any HDMI picture since the bridge started there is nothing to name.
    await page.evaluate(async()=>{window.lastContext=null;await document.querySelector('lg-profile-editor').refresh(true);});
    assert.equal(await q('.tv-card .now').textContent(),'No HDMI picture yet');
    assert.equal(await a.focusKey('target:live').count(),0);
    // A confirmed HDMI picture is on screen (for example from Home Assistant).
    await page.evaluate(async()=>{window.fixture.context={ready:true,input:'hdmi4',mode:'hdrGame',range:'hdrALLM'};window.lastContext={input:'hdmi4',mode:'hdrGame',range:'hdrALLM'};await document.querySelector('lg-profile-editor').refresh(true);});
    assert.equal(await q('.tv-card .card-label').textContent(),'On TV now');
    assert.equal(await q('.tv-card .dot:not(.last)').count(),1);
    assert.deepEqual(errors,[]);
    console.log('Last watched HDMI picture, empty start and on-screen wording passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
