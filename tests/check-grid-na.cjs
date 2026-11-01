'use strict';
// Rows and columns where LG uses a setting nowhere take no grid space (for
// example TruMotion in Game presets and on PC inputs). They stay while still
// loading, return on request, and never empty the whole grid.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,fileTransfer:false});
    const a=actions(page),{q}=a;
    await a.number('backlight').waitFor();await a.ready();
    const rows=()=>page.evaluate(()=>[...document.querySelector('lg-profile-editor').shadowRoot.querySelectorAll('.rowh')].map(n=>n.dataset.focus.slice(4)));
    const columns=()=>page.evaluate(()=>[...document.querySelector('lg-profile-editor').shadowRoot.querySelectorAll('.colh')].map(n=>n.dataset.focus.slice(4)));
    const games=list=>list.filter(r=>/game$/i.test(r));
    const chip=()=>a.focusKey('grid:show-na');
    // Brightness is used everywhere: no hidden lines and no chip.
    assert(games(await rows()).length,'Game presets are shown for brightness');assert.equal(await chip().count(),0);

    // TruMotion: LG disables it in every Game preset, so those rows go.
    await a.open('truMotionMode');
    assert.deepEqual(games(await rows()),[],'n/a Game rows take no space');
    assert(!(await rows()).includes('hdrGame'),'Even the selected on-screen preset is hidden when LG never uses it there');
    assert(await q('.valuebox').getByText('HDMI 4 · HDR Game (n/a)',{exact:true}).isVisible(),'A hidden selected target is still named, marked n/a');
    assert.match(await chip().textContent(),/^Show \d+ presets? LG doesn’t use$/);
    assert.equal(await q('.cell.excluded').count(),0,'No n/a cells remain');
    // While descriptions are reloading nothing is known yet, so nothing hides.
    assert(await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');e.resetLive();e.renderPanes();return [...e.shadowRoot.querySelectorAll('.rowh')].some(n=>/game$/i.test(n.dataset.focus));}),'Rows stay until LG has described them');
    await page.evaluate(()=>document.querySelector('lg-profile-editor').inspect());await a.ready();
    assert.deepEqual(games(await rows()),[]);

    // A whole input column that LG never uses also goes (here PC inputs).
    await page.evaluate(async()=>{window.extraReason=(t,key)=>/_pc$/.test(t.dimension.input||'')&&key==='truMotionMode'?'Motion processing has not been audited for this PC profile.':null;
      const e=document.querySelector('lg-profile-editor');e.allInputs=true;e.resetLive();e.renderPanes();await e.inspect();});
    await a.ready();
    assert.deepEqual((await columns()).filter(c=>/_pc$/.test(c)),[],'n/a PC columns take no space');
    assert((await columns()).includes('hdmi3'));
    assert.match(await chip().textContent(),/^Show \d+ presets? and 4 inputs LG doesn’t use$/);
    // The remote reaches the chip, and Enter brings everything back.
    await a.focusKey('cell:hdmi3:filmMaker').focus();await a.reach('grid:show-na');await page.keyboard.press('Enter');
    assert(games(await rows()).length,'Showing n/a rows again');assert((await columns()).some(c=>/_pc$/.test(c)));
    assert.equal(await chip().getAttribute('aria-pressed'),'true');assert.equal(await chip().textContent(),'Showing n/a presets and inputs');
    assert(await q('.cell.excluded').count()>0);
    await chip().click();assert.deepEqual(games(await rows()),[]);
    await page.evaluate(()=>{window.extraReason=null;const e=document.querySelector('lg-profile-editor');e.allInputs=false;e.resetLive();e.renderPanes();return e.inspect();});

    // A setting LG uses nowhere keeps its grid, so the n/a cells explain it.
    await a.open('dolbyPrecisionDetail');
    assert((await rows()).length>0,'The grid is never emptied');assert.equal(await chip().count(),0);
    assert(await q('.cell.excluded').count()>0);
    await a.noOverflow(1920);
    assert.deepEqual(errors,[]);
    console.log('Grid n/a lines: hidden TruMotion Game rows and PC columns, kept while loading, show/hide chip with the remote, never an empty grid passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
