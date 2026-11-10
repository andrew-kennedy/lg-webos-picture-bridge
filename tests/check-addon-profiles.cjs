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
    await a.focusKey('edit:standard').waitFor();
    await a.focusKey('open-profiles').click();
    await page.getByRole('textbox',{name:'Profile name'}).fill('DTM fix');
    await button('New add-on from Base').click();
    assert(await page.getByText('Name the add-on group first').isVisible(),'An add-on needs a group');
    await page.getByRole('textbox',{name:'Add-on group'}).fill('Switch 2 HDR');
    await button('New add-on from Base').click();await a.saved();
    const id=await variant();
    assert.deepEqual(await page.evaluate(i=>window.fixture.document.profiles.find(p=>p.id===i).group,id),'Switch 2 HDR');
    await a.focusKey('view-back').click();await a.ready();
    assert.deepEqual(await page.locator('lg-profile-editor .tabs .tab').allTextContents(),['Base','Bright room','Dark room','Switch 2 HDR · DTM fix']);
    assert(await page.getByText('When this add-on is selected').isVisible(),'The add-on tab explains layering');
    await a.focusKey('open-tv').click();
    const apply=await page.getByRole('combobox',{name:'Profile to apply',exact:true}).locator('option').allTextContents();
    assert(!apply.some(t=>t.includes('DTM')),'Add-ons are not main profiles');
    const bright=await page.getByRole('combobox',{name:'Automatic bright room',exact:true}).locator('option').allTextContents();
    assert(!bright.some(t=>t.includes('DTM')),'Add-ons cannot be room bindings');
    const select=page.getByRole('combobox',{name:'Switch 2 HDR',exact:true});
    assert.equal(await select.inputValue(),'none');
    await select.selectOption(id);await button('Apply Switch 2 HDR').click();await a.saved();
    assert.deepEqual(await page.evaluate(()=>window.fixture.addons),{'Switch 2 HDR':id});
    assert.equal(await page.evaluate(()=>window.fixture.selection),'automatic','Choosing an add-on keeps Automatic');
    assert(await page.getByText('Using Dark room · Automatic + Switch 2 HDR · DTM fix').first().isVisible(),'The header names the add-on in use');
    await page.getByRole('combobox',{name:'Switch 2 HDR',exact:true}).selectOption('none');await button('Apply Switch 2 HDR').click();await a.saved();
    assert.deepEqual(await page.evaluate(()=>window.fixture.addons),{});
    for(const width of [1920,390]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      await a.noOverflow(width);
      await page.screenshot({path:'/tmp/lg-addon-profiles-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Add-on creation, labels, separate selection, header and layout passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
