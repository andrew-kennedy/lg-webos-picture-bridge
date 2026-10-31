'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const fixture=require('./fixtures/profile-formats.cjs');
const catalog=require('../app/bridge/lib/profile-catalog');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const initial=structuredClone(fixture);initial.document=catalog.upgrade(initial.document,initial.preferences);
    initial.selection='automatic';initial.active_profile='dark';
    await mount(page,initial,{tvRemote:true});
    const a=actions(page),{button}=a,variant=()=>page.evaluate(()=>document.querySelector('lg-profile-editor').variant);
    await a.focusKey('edit:standard').waitFor();await a.target({inputs:['hdmi3'],presets:['filmMaker']});
    assert.equal(await a.focusKey('edit:standard').getAttribute('aria-pressed'),'true','Base is the default even while Dark is the viewing profile');
    assert.deepEqual(await page.locator('lg-profile-editor .tabs .tab').allTextContents(),['Base','Bright room','Dark room']);
    assert.equal(await page.getByRole('combobox',{name:'Room variant'}).count(),0);
    // Create a profile from Base with the remote's text entry behaviour.
    await a.focusKey('open-profiles').click();
    assert(await page.getByRole('heading',{name:'Manage profiles'}).isVisible());
    await page.getByRole('textbox',{name:'Profile name'}).focus();await page.keyboard.press('Enter');
    await page.keyboard.type('Evening');await page.keyboard.press('ArrowLeft');await page.keyboard.press('End');await page.keyboard.press('Enter');
    await button('New from Base').click();await a.saved();
    const id=await variant();assert.match(id,/^p_/);
    assert.equal(await a.focusKey('edit:'+id).getAttribute('aria-pressed'),'true','A new profile opens for editing');
    await a.focusKey('open-tv').click();
    assert.equal(await page.getByRole('combobox',{name:'Profile to apply',exact:true}).inputValue(),'automatic','Creating/editing never selects a profile');
    await a.focusKey('view-back').click();
    await a.open('backlight');
    assert.equal(await a.number('backlight').inputValue(),'3','New profile inherits base movie brightness');
    await a.number('backlight').fill('17');await button('Review 1 changes').click();
    await button('Save Evening overrides').click();await a.saved();
    assert.equal((await page.evaluate(()=>window.fixture.document.profiles.at(-1))).brightness.movie_sdr,17);
    await a.focusKey('open-tv').click();
    await page.getByRole('combobox',{name:'Profile to apply',exact:true}).selectOption(id);await button('Apply profile').click();await a.saved();
    assert.equal(await page.evaluate(()=>window.fixture.selection),id);
    assert(await page.getByText('Using Evening · Manual').isVisible(),'The header shows the profile the TV uses');
    await a.focusKey('view-back').click();
    await a.focusKey('open-profiles').click();
    await page.getByRole('textbox',{name:'Profile name'}).fill('Late evening');await button('Rename Evening').click();await a.saved();
    assert.equal(await variant(),id,'Renaming keeps the stable ID');
    assert(await page.getByText('Automation profile ID: '+id+'. Renaming keeps this ID.').isVisible());
    await page.getByRole('textbox',{name:'Profile name'}).fill('Evening cinema');await button('Duplicate Late evening').click();await a.saved();
    const duplicate=await variant();assert.notEqual(duplicate,id);
    await a.focusKey('view-back').click();await a.ready();
    assert.equal(await a.number('backlight').inputValue(),'17','Duplicates copy overrides');
    await a.focusKey('open-profiles').click();
    await button('Reset Evening cinema to Base').click();await button('Reset profile').click();await a.saved();
    await a.focusKey('view-back').click();await a.ready();
    assert.equal(await a.number('backlight').inputValue(),'3');
    await a.focusKey('open-tv').click();
    await page.getByRole('combobox',{name:'Automatic bright room',exact:true}).selectOption(id);await button('Save automatic bindings').click();await a.saved();
    assert.equal(await page.evaluate(()=>window.fixture.document.automatic.bright),id);
    await a.focusKey('view-back').click();
    await a.focusKey('open-profiles').click();
    await button('Delete Evening cinema').click();await button('Delete profile').click();await a.saved();
    await a.focusKey('view-back').click();
    assert.equal(await a.focusKey('edit:standard').getAttribute('aria-pressed'),'true');
    await a.ready();assert.equal(await a.number('backlight').isEnabled(),true,'Base movie brightness is editable in named collections');
    // Remote: views are reachable and a text field never traps the arrows.
    await a.focusKey('edit:standard').focus();await a.reach('open-tv');await page.keyboard.press('Enter');
    await a.reach('profile-apply');await page.keyboard.press('Escape');assert.equal((await a.focused()).key,'open-tv');
    await a.reach('open-profiles');await page.keyboard.press('Enter');
    await page.getByRole('textbox',{name:'Profile name'}).focus();await page.keyboard.press('ArrowDown');
    assert.notEqual((await a.focused()).key,'profile-name','Arrows leave a text field that is not being edited');
    await page.keyboard.press('Escape');
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      await a.noOverflow(width);
      await page.screenshot({path:'/tmp/lg-named-profiles-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Named profile creation, inheritance, edit/apply separation, stable rename, reset, automatic bindings and remote navigation passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
