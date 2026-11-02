'use strict';
// Game Optimizer's AI Sound Pro: one On/Off value per HDMI port, listed with
// the Game Optimizer settings, reachable with the remote and saved to the
// port's Game Optimizer audio input.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true});
    const a=actions(page),{q,button}=a;
    await a.setting('backlight').waitFor();await a.ready();
    // Listed in the Game Optimizer section, after the stabilizers.
    const section=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return e.aliasGroups().find(g=>g.aliases.includes('aigamesound'));});
    assert.equal(section&&section.section,'game','AI Sound Pro is a Game Optimizer setting');
    assert.equal(section.aliases.at(-1),'aigamesound');
    assert.match(await a.setting('aigamesound').textContent(),/AI Sound Pro/);
    // The remote reaches it from the list and opens it.
    await a.focusKey('setting:backlight').focus();await a.reach('setting:aigamesound',120);await page.keyboard.press('Enter');await a.ready();
    assert.match(await q('.detail-head .help').textContent(),/Each HDMI port keeps its own setting, used only in Game presets/);
    // One row; a column per port, HDMI 1 on and the others off.
    await a.target({inputs:['hdmi1_pc','hdmi1','hdmi2','hdmi3','hdmi4'],presets:[]});
    const cells=await page.evaluate(()=>{const root=document.querySelector('lg-profile-editor').shadowRoot;
      return [...root.querySelectorAll('[data-focus^="cell:"]')].map(n=>[n.dataset.focus,n.querySelector('.cv')&&n.querySelector('.cv').textContent]);});
    assert(cells.length>=4,'A cell per port: '+JSON.stringify(cells));
    assert(cells.some(([k,v])=>/^cell:hdmi1(_pc)?:port$/.test(k)&&/^on$/i.test(v))&&cells.filter(([k,v])=>/^off$/i.test(v)).length>=3,JSON.stringify(cells));
    // Turn HDMI 1 off; the edit goes to HDMI 1's Game Optimizer audio input.
    const hdmi1=cells.find(([k])=>/^cell:hdmi1(_pc)?:port$/.test(k))[0].split(':')[1];
    await a.target({inputs:[hdmi1],presets:[]});
    await a.choice('aigamesound').selectOption('off');
    await page.locator('lg-profile-editor').getByRole('button',{name:'Review 1 change',exact:true}).click();
    assert(await page.getByText('HDMI 1 · Game Optimizer sound',{exact:false}).first().isVisible(),'Review names the scope');
    await page.locator('lg-profile-editor').getByRole('button',{name:/^Save /}).first().click();
    await page.waitForFunction(()=>window.calls.some(c=>c.action==='edit_many'));
    const saved=(await a.calls('edit_many')).at(-1),bank=await page.evaluate(id=>window.native[id].target,saved.edits[0].bank_id);
    assert.deepEqual(bank,{category:'sound',dimension:{audioInput:'hdmi1_game'}});
    assert.deepEqual(saved.edits.map(e=>[e.settings,e.expected]),[[{aigamesound:'off'},{aigamesound:'on'}]]);
    await a.noOverflow(1920);
    assert.deepEqual(errors,[]);
    console.log('Game sound: AI Sound Pro in Game Optimizer, remote reach, a value per port, saved to the port’s Game Optimizer audio input passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
