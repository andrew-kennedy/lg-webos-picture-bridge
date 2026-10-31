'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const fixture=require('./fixtures/profile-formats.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const initial=structuredClone(fixture);Object.assign(initial.document.banks.find(b=>b.id==='movie_filmMaker').settings,{truMotionJudder:0,truMotionBlur:10});
    await mount(page,initial,{tvRemote:true});
    const a=actions(page),{button}=a;
    await a.focusKey('setting:backlight').waitFor();await a.target({inputs:['hdmi1_pc'],presets:['game']});
    await a.open('backlight');
    await a.focusKey('brightness-links').click();
    await a.focusKey('brightness-link:pc_sdr').focus();await page.keyboard.press('Enter');
    assert(await page.getByRole('heading',{name:'Review brightness links'}).isVisible());
    assert(await page.getByText('Linked · Bright 80 / Dark 80 → Independent · Bright 80 / Dark 80',{exact:true}).isVisible());
    await button('Save brightness links').click();await a.saved();
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='pc_sdr').brightness_role),undefined);
    await a.ready();
    assert.equal(await a.cell('hdmi3','game').getAttribute('class').then(c=>/\balso\b/.test(c)),false,'An unlinked preset no longer changes its former partners');
    await a.number('backlight').fill('65');
    await button('Review 1 changes').click();await button('Save standards').click();await a.saved();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits),[{bank_id:'pc_sdr',variant:'standard',settings:{backlight:65}}]);
    assert.equal(await page.evaluate(()=>window.fixture.preferences.game_sdr),80);
    await a.focusKey('brightness-link:pc_sdr').click();
    assert(await page.getByText('Independent · Bright 65 / Dark 65 → Linked · Bright 80 / Dark 80',{exact:true}).isVisible());
    await button('Save brightness links').click();await a.saved();
    // TruMotion de-judder/de-blur exist only with User Selection in that preset.
    await page.evaluate(async()=>{window.motionDependencies=true;const e=document.querySelector('lg-profile-editor');e.target={inputs:['hdmi3'],presets:['filmMaker'],ranges:null,genres:null,allm:null};await e.refresh(true);});
    await a.open('truMotionJudder');
    assert.equal(await a.number('truMotionJudder').count(),0,'Off motion excludes unused child controls');
    assert(await page.getByText(/LG does not use TruMotion de-judder/).isVisible());
    await a.open('truMotionMode');await a.choice('truMotionMode').selectOption('user');
    await button('Review 1 changes').click();await button('Save standards').click();await a.saved();
    await a.open('truMotionJudder');
    assert.equal(await a.number('truMotionJudder').getAttribute('min'),'0');
    await a.number('truMotionJudder').fill('2');
    await a.open('truMotionBlur');assert.equal(await a.number('truMotionBlur').getAttribute('max'),'10');assert.equal(await a.number('truMotionBlur').inputValue(),'10');
    await a.number('truMotionBlur').fill('8');
    await button('Review 2 changes').click();await button('Save standards').click();await a.saved();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits),[{bank_id:'movie_filmMaker',variant:'standard',settings:{truMotionJudder:2,truMotionBlur:8}}]);
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker_motion').settings.truMotionMode),'user');
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      await a.noOverflow(width);
      await page.screenshot({path:'/tmp/lg-granularity-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);process.stdout.write('Brightness links, native motion scopes and remote activation passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
