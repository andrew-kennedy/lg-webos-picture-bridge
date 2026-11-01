'use strict';
// A preset an input's saved Preset selection never picks is locked: shown
// faded, not selectable, and left out of edits that span it. Drafting a
// selection for it, or watching it on screen, unlocks it.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true},data=>{data.state.context={ready:false};delete data.lastContext;});
    const a=actions(page),{q,button}=a;
    await a.setting('contrast').waitFor();await a.ready();
    await a.open('contrast');
    // Columns are input identities (HDMI 1 is the PC input here).
    const {usage,columns}=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');
      return {usage:Object.fromEntries([...e.usage()].map(([k,v])=>[k,[...v]])),columns:e.gridSpec('contrast').columns.map(c=>({id:c.id,inputs:c.inputs}))};});
    const uses=c=>c.inputs.some(i=>(usage[i]||[]).includes('filmMaker')),known=c=>c.inputs.some(i=>usage[i]);
    const user=(columns.find(c=>known(c)&&uses(c))||{}).id,locked=(columns.find(c=>known(c)&&!uses(c))||{}).id;
    assert(user&&locked,'The fixture has an input that uses SDR Filmmaker and one that never does: '+JSON.stringify({usage,columns}));
    const cell=a.cell(locked,'filmMaker');
    assert(await cell.isDisabled(),'A preset the input never selects is locked');
    assert.match(await cell.getAttribute('aria-label'),/never selects this preset · locked/);
    assert.match(await cell.textContent(),/\d/,'Its stored value stays visible');
    assert(await a.cell(user,'filmMaker').isEnabled());
    assert(await q('.legend').getByText('Faded: locked, the input never selects this preset').isVisible());
    // A whole-row edit across every input leaves the locked value out.
    await a.target({inputs:columns.flatMap(c=>c.inputs),presets:['filmMaker']});
    assert(await q('.valuebox').getByText('never select',{exact:false}).first().isVisible(),'The value box says why values are skipped');
    await a.number('contrast').fill('91');
    await page.locator('lg-profile-editor').getByRole('button',{name:/^Review \d+ changes?$/}).click();
    const banks=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return e.review.entries.map(x=>x.target.dimension.input+':'+x.target.dimension.pictureMode);});
    assert(banks.length>0&&banks.every(b=>!b.startsWith(locked+':'))&&banks.some(b=>b.startsWith(user+':')),'Locked values never enter an edit: '+banks.join(', '));
    await button('Back to editing').click();await button('Discard edits').click();
    // Drafting a selection that uses the preset unlocks it at once.
    await a.target({inputs:[locked],presets:['filmMaker'],ranges:['sdr']});await a.open('pictureMode');
    await a.choice('pictureMode').selectOption('filmMaker');
    await a.target({inputs:[locked],presets:['filmMaker']});await a.open('contrast');
    assert(await a.cell(locked,'filmMaker').isEnabled(),'A drafted selection unlocks the preset');
    await button('Discard edits').click();
    assert(await a.cell(locked,'filmMaker').isDisabled());
    // So does watching it: the picture on screen is always editable.
    await page.evaluate(async input=>{const e=document.querySelector('lg-profile-editor');e.state.context={ready:true,input,mode:'filmMaker',range:'sdr'};e.memo=new Map();e.renderPanes();},locked);
    assert(await a.cell(locked,'filmMaker').isEnabled(),'The preset on screen is editable');
    assert.deepEqual(errors,[]);
    console.log('Locked presets: faded and disabled, left out of row edits, unlocked by a drafted selection or the picture on screen passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
