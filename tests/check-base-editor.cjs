'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
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
    const a=actions(page),{q,button}=a,bank=()=>page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='movie_filmMaker'));
    await a.focusKey('edit:standard').waitFor();
    assert.equal(await a.focusKey('edit:standard').getAttribute('aria-pressed'),'true','Base is the default even while Dark is the viewing profile');
    assert(await q('.tv-card').getByText('Using Dark room · Automatic').isVisible());
    assert(await q('.edit-card').getByText('Starting values. Profiles follow Base unless they override a setting.').isVisible());
    await page.screenshot({path:'/tmp/lg-base-editor-home.png'});
    await a.target({inputs:['hdmi3'],presets:['filmMaker']});await a.open('color');
    assert.equal(await a.number('color').inputValue(),'50');
    assert.match(await a.cell('hdmi3','filmMaker').getAttribute('aria-label'),/overridden in Dark room/,'Base cells show where a profile keeps its own value');
    assert(await q('.valuebox').getByText('Overridden in Dark room — those profiles keep their own value.').isVisible());
    await a.number('color').fill('51');await button('Review 1 changes').click();
    assert(await page.getByRole('heading',{name:'Review Base changes',exact:true}).isVisible());
    assert(await page.getByText('Profiles following this Base value: Bright room.',{exact:true}).isVisible());
    assert(await page.getByText('Existing overrides stay in: Dark room.',{exact:true}).isVisible());
    await button('Back to editing').focus();await page.keyboard.press('ArrowRight');
    assert.equal((await a.focused()).label,'Save Base');
    await page.keyboard.press('Enter');await a.saved();
    let saved=await bank();
    assert.equal(saved.settings.color,51);assert.equal(saved.variants.dark.color,55,'Saving Base keeps explicit profile overrides');
    await a.focusKey('edit:dark').click();await a.ready();
    assert.equal(await a.number('color').inputValue(),'55');
    assert.match(await q('.frame').getAttribute('class'),/profile/,'Profile editing uses the profile accent');
    assert(await q('.valuebox .inheritance').getByText('Overrides Base in this profile').isVisible());
    await a.number('color').fill('56');
    // The per-setting shortcut keeps the profile draft, the targets and the
    // setting, and focuses the Base value after a delayed read, including remote use.
    await page.evaluate(()=>{window.delayInspect=true;});
    await button('Edit Base for Color depth').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('lg-profile-editor').shadowRoot.activeElement?.getAttribute('aria-label')==='Color depth');
    assert.equal(await a.number('color').inputValue(),'51');
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),1);
    assert.deepEqual(await page.evaluate(()=>{const t=document.querySelector('lg-profile-editor').target;return [t.inputs,t.presets];}),[['hdmi3'],['filmMaker']]);
    await page.evaluate(()=>{window.delayInspect=false;});
    await a.number('color').fill('52');
    assert(await q('.footer').getByText('2 staged changes → Base + Dark room').isVisible());
    await button('Review 2 changes').click();
    assert(await page.getByText('Save to: Base',{exact:true}).isVisible());
    assert(await page.getByText('Save to: Dark room',{exact:true}).isVisible());
    await page.screenshot({path:'/tmp/lg-base-editor-review.png'});
    await button('Save all reviewed changes').click();await a.saved();
    saved=await bank();assert.equal(saved.settings.color,52);assert.equal(saved.variants.dark.color,56);
    assert.equal((await a.calls('apply_profile')).length,0,'Editing never changes viewing-profile selection');
    assert.equal(await page.evaluate(()=>window.fixture.selection),'automatic');
    // Follow Base removes the override only; it never writes a new Base.
    await a.focusKey('edit:dark').click();await a.ready();await button('Remove override for Color depth').click();
    assert(await q('.valuebox').getByText('Draft: follow Base').first().isVisible());
    await button('Review 1 changes').click();await button('Save Dark room overrides').click();await a.saved();
    saved=await bank();assert.equal(saved.settings.color,52);assert.equal(saved.variants?.dark?.color,undefined);
    assert.equal(await a.number('color').inputValue(),'52');
    // Linked movie brightness has explicit room overrides; the review says why
    // saving Base will not replace them.
    await a.focusKey('edit:standard').click();await a.open('backlight');
    await a.number('backlight').fill('10');await button('Review 1 changes').click();
    assert(await page.getByText('Existing overrides stay in: Bright room, Dark room.',{exact:true}).isVisible());
    await button('Save Base').click();await a.saved();
    assert.equal(await page.evaluate(()=>window.fixture.document.brightness.movie_sdr),10);
    await a.focusKey('edit:dark').click();await a.ready();assert.equal(await a.number('backlight').inputValue(),'3');
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?1080:844});
      if(width<700&&await a.focusKey('setting:backlight').isVisible())await a.open('backlight');
      await button('Edit Base for OLED pixel brightness').scrollIntoViewIfNeeded();
      await a.noOverflow(width);
      await page.screenshot({path:'/tmp/lg-base-editor-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Default Base editing, explicit save destination, inheritance impact, profile-to-Base remote shortcut, mixed drafts and responsive layout passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
