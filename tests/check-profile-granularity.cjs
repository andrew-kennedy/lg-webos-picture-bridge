'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const fixture=require('./fixtures/profile-formats.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const initial=structuredClone(fixture);Object.assign(initial.document.banks.find(b=>b.id==='movie_filmMaker').settings,{truMotionJudder:0,truMotionBlur:10});
    await mount(page,initial,{tvRemote:true});
    const button=name=>page.getByRole('button',{name,exact:true});
    await page.evaluate(async()=>{const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi1'],format:['sdr'],family:['game']};e.render();await e.inspect();});
    await page.locator('[data-focus="brightness-links"]').click();
    await page.locator('[data-focus="brightness-link:pc_sdr"]').focus();await page.keyboard.press('Enter');
    assert(await page.getByRole('heading',{name:'Review brightness links'}).isVisible());
    assert(await page.getByText('Linked · Bright 80 / Dark 80 → Independent · Bright 80 / Dark 80',{exact:true}).isVisible());
    await button('Save brightness links').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='pc_sdr').brightness_role),undefined);
    const brightness=page.getByRole('spinbutton',{name:'OLED pixel brightness · SDR',exact:true});await brightness.fill('65');
    await button('Review 1 changes').click();await button('Save standards').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits),[{bank_id:'pc_sdr',variant:'standard',settings:{backlight:65}}]);
    assert.equal(await page.evaluate(()=>window.fixture.preferences.game_sdr),80);
    await page.locator('[data-focus="brightness-link:pc_sdr"]').click();
    assert(await page.getByText('Independent · Bright 65 / Dark 65 → Linked · Bright 80 / Dark 80',{exact:true}).isVisible());
    await button('Save brightness links').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    await page.evaluate(async()=>{window.motionDependencies=true;const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],format:['sdr'],family:['movie']};e.category='motion';await e.refresh(true);});
    assert.equal(await page.getByRole('spinbutton',{name:/^TruMotion de-/}).count(),0,'Off motion excludes unused child controls');
    await page.getByRole('combobox',{name:'TruMotion · SDR',exact:true}).selectOption('user');await button('Review 1 changes').click();await button('Save standards').click();
    const judder=page.getByRole('spinbutton',{name:'TruMotion de-judder · SDR',exact:true}),blur=page.getByRole('spinbutton',{name:'TruMotion de-blur · SDR',exact:true});
    await judder.waitFor();assert.equal(await blur.getAttribute('max'),'10');assert.equal(await blur.inputValue(),'10');assert.equal(await judder.getAttribute('min'),'0');
    await judder.fill('2');await blur.fill('8');await button('Review 2 changes').click();await button('Save standards').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits),[{bank_id:'movie_filmMaker',variant:'standard',settings:{truMotionJudder:2,truMotionBlur:8}}]);
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker_motion').settings.truMotionMode),'user');
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
      await page.screenshot({path:'/tmp/lg-granularity-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);process.stdout.write('Brightness links, native motion scopes and remote navigation passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
