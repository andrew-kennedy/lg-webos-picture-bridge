'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
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
    const button=name=>page.getByRole('button',{name,exact:true});
    await page.evaluate(async()=>{const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],format:['sdr'],family:['movie']};e.render();await e.inspect();});
    assert.equal(await button('Edit Base').getAttribute('aria-pressed'),'true','Base is the default even while Dark is the viewing profile');
    assert.equal(await page.getByRole('combobox',{name:'Profile to edit',exact:true}).count(),0);
    await button('Edit profile').click();
    assert.equal(await page.getByRole('combobox',{name:'Profile to edit',exact:true}).inputValue(),'dark');
    assert.equal(await page.getByRole('combobox',{name:'Room variant'}).count(),0);
    await page.locator('[data-focus="profile-management"]').focus();await page.keyboard.press('Enter');
    await page.getByRole('textbox',{name:'Profile name'}).focus();await page.keyboard.press('Enter');
    await page.keyboard.type('Evening');await page.keyboard.press('ArrowLeft');await page.keyboard.press('End');await page.keyboard.press('Enter');
    await button('New from base').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const id=await page.getByRole('combobox',{name:'Profile to edit',exact:true}).inputValue();
    assert.match(id,/^p_/);
    await page.locator('[data-focus="viewing-profile"]').click();
    assert.equal(await page.getByRole('combobox',{name:'Profile to apply',exact:true}).inputValue(),'automatic','Creating/editing never selects a profile');
    const light=page.getByRole('spinbutton',{name:'OLED pixel brightness · Linked SDR movie values',exact:true});
    await light.waitFor();assert.equal(await light.inputValue(),'3','New profile inherits base movie brightness');
    await light.fill('17');await button('Review 1 changes').click();
    await button('Save Evening overrides').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const saved=await page.evaluate(()=>window.fixture.document.profiles.at(-1));assert.equal(saved.brightness.movie_sdr,17);
    await page.getByRole('combobox',{name:'Profile to apply',exact:true}).selectOption(id);await button('Apply profile').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.selection),id);
    await page.getByRole('textbox',{name:'Profile name'}).fill('Late evening');await button('Rename selected').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Profile to edit',exact:true}).inputValue(),id);
    await page.getByRole('textbox',{name:'Profile name'}).fill('Evening cinema');await button('Duplicate selected').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const duplicate=await page.getByRole('combobox',{name:'Profile to edit',exact:true}).inputValue();assert.notEqual(duplicate,id);
    assert.equal(await light.inputValue(),'17');
    await button('Reset selected to base').click();await button('Reset profile').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await light.inputValue(),'3');
    await page.getByRole('combobox',{name:'Automatic bright room',exact:true}).selectOption(id);await button('Save automatic bindings').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.document.automatic.bright),id);
    await button('Delete selected').click();await button('Delete profile').click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await button('Edit Base').getAttribute('aria-pressed'),'true');
    assert.equal(await light.isEnabled(),true,'Base movie brightness is editable in named collections');
    // Remote arrows reach and leave the new controls without being trapped or
    // trying to stepUp a text input. Closed details must remain out of the path.
    await page.locator('[data-focus="profile-management"]').click();
    await button('Edit Base').focus();
    const visited=new Set();
    for(let i=0;i<65;i++){visited.add(await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.activeElement.dataset.focus));await page.keyboard.press('ArrowDown');}
    assert(visited.has('profile-apply'));assert(!visited.has('profile-name'));
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
      await page.screenshot({path:'/tmp/lg-named-profiles-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Named profile creation, inheritance, edit/apply separation, stable rename, reset, automatic bindings and remote navigation passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
