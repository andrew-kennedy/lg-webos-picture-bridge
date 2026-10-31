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
    initial.document.banks.find(b=>b.id==='movie_filmMaker').variants={dark:{color:50}};
    initial.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:60}};
    await mount(page,initial,{tvRemote:true});
    const button=name=>page.getByRole('button',{name,exact:true}),saved=()=>page.getByText('Saved on the TV.',{exact:false}).waitFor();
    await page.evaluate(async()=>{const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],format:['sdr','hdr'],family:['movie']};await e.refresh(true);});
    await button('Edit profile').click();
    await page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true}).waitFor();
    const inspections=await page.evaluate(()=>window.calls.filter(c=>c.action==='inspect').length);
    await button('Show only overrides').click();
    assert.equal(await page.getByRole('spinbutton',{name:'OLED pixel brightness · HDR',exact:true}).count(),0);
    assert.equal(await page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true}).inputValue(),'50','Equal-valued pins are shown');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='inspect').length),inspections,'Filtering reuses cached descriptions');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').length),0,'Filtering is read-only');
    await button('Remove override for Color depth · SDR').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>Object.values(document.querySelector('lg-profile-editor').draft)[0].inherit),true);
    await button('Review 1 changes').click();assert(await page.getByText('50 → Base: 50',{exact:true}).isVisible());
    await page.evaluate(()=>{window.failNextBatch='before';});await button('Save Dark room overrides').click();
    await page.getByText(/Unsaved drafts remain/).waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),1,'Equal-value reset is not mistaken for a successful save');
    await button('Review against latest').click();assert(await page.getByText('50 → Base: 50',{exact:true}).isVisible());
    await page.evaluate(()=>{window.failNextBatch='after';});await button('Save Dark room overrides').click();
    await page.getByText('Reply lost',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),0,'Lost reply reconciles membership, not just numbers');
    assert.equal(await page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.fixture.document.profiles.find(p=>p.id==='dark').brightness.movie_sdr),3,'Single reset keeps other overrides');
    // A grouped control resets each native value to its distinct base.
    await page.evaluate(async()=>{
      const e=document.querySelector('lg-profile-editor'),banks=window.fixture.document.banks;
      const sdr=banks.find(b=>b.id==='movie_filmMaker'),hdr=banks.find(b=>b.id==='movie_hdrFilmMaker');
      sdr.settings.color=51;sdr.variants={dark:{color:55}};hdr.settings.color=48;
      window.fixture.revision++;e.split=[];await e.refresh(true);
    });
    await button('Remove override for Color depth · All selected values').click();
    await button('Remove override for OLED pixel brightness · Linked SDR movie values').click();
    await button('Review 3 changes').click();
    for(const text of ['55 → Base: 51','60 → Base: 48','3 → Base: 3'])assert(await page.getByText(text,{exact:true}).isVisible());
    await button('Save Dark room overrides').click();await saved();
    assert(await page.getByText(/^No overrides in this selection/).isVisible());
    const edits=await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits);
    assert.deepEqual(edits.map(e=>[e.bank_id,e.inherit]),[['movie_filmMaker',['color','backlight']],['movie_hdrFilmMaker',['color']]]);
    await button('Show only overrides').click();
    const color=page.getByRole('spinbutton',{name:'Color depth · All selected values',exact:true});
    assert.equal(await color.inputValue(),'','Different inherited Base values remain Mixed');
    // A pending reset re-reviews the latest Base, never pins its old number.
    await page.evaluate(async()=>{const b=window.fixture.document.banks.find(b=>b.id==='movie_filmMaker');b.variants={dark:{color:55}};window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.scope.format=['sdr'];e.split=['format'];await e.refresh(true);});
    await button('Remove override for Color depth · SDR').click();
    await page.evaluate(async()=>{window.fixture.document.banks.find(b=>b.id==='movie_filmMaker').settings.color=53;window.fixture.revision++;await document.querySelector('lg-profile-editor').refresh();});
    await button('Review against latest').click();assert(await page.getByText('55 → Base: 53',{exact:true}).isVisible());
    await button('Save Dark room overrides').click();await saved();assert.equal(await page.getByRole('spinbutton',{name:'Color depth · SDR',exact:true}).inputValue(),'53');
    // A narrow port filter still previews every linked gaming brightness bank.
    await page.evaluate(async()=>{window.fixture.document.profiles.find(p=>p.id==='dark').brightness.game_sdr=70;window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi1'],format:['sdr'],family:['game']};e.onlyOverrides=true;await e.refresh(true);});
    await button('Remove override for OLED pixel brightness · Linked SDR gaming values').click();await button('Review 1 changes').click();
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').review.entries[0].targets.length),3);
    await button('Save Dark room overrides').click();await saved();assert.equal(await page.evaluate(()=>window.fixture.document.profiles.find(p=>p.id==='dark').brightness.game_sdr),undefined);
    // Unused overrides remain visible in the excluded list and can be removed.
    await page.evaluate(async()=>{window.fixture.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:59}};window.unavailable={movie_hdrFilmMaker:{color:'Unavailable in this signal'}};window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],format:['hdr'],family:['movie']};await e.refresh(true);});
    await page.locator('[data-focus="excluded-settings"]').click();
    await button('Remove override for Color depth · HDMI 3 · HDR Filmmaker · Picture').click();await button('Review 1 changes').click();await button('Save Dark room overrides').click();await saved();
    assert(await page.getByText(/^No overrides in this selection/).isVisible());
    // Read-only / older bridge views cannot submit an unsupported reset.
    await page.evaluate(async()=>{window.editorApi=6;window.unavailable={};window.fixture.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:59}};window.fixture.revision++;await document.querySelector('lg-profile-editor').refresh(true);});
    assert(await button('Remove override for Color depth · HDR').isDisabled());
    await page.evaluate(async()=>{window.editorApi=7;window.offline=true;await document.querySelector('lg-profile-editor').refresh();});
    assert(await button('Remove override for Color depth · HDR').isDisabled());assert(await button('Show only overrides').isEnabled());
    await page.evaluate(async()=>{window.offline=false;await document.querySelector('lg-profile-editor').refresh(true);});
    await button('Edit Base').click();
    assert.equal(await button('Show only overrides').count(),0);assert.equal(await page.getByRole('button',{name:/^Remove override for/}).count(),0);
    await button('Edit profile').click();
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      await button('Remove override for Color depth · HDR').scrollIntoViewIfNeeded();
      assert(await page.evaluate(()=>{const body=document.querySelector('lg-profile-editor').shadowRoot.querySelector('.body');return document.documentElement.scrollWidth<=innerWidth&&body.scrollWidth<=body.clientWidth;}),'No horizontal overflow at '+width);
      await page.screenshot({path:'/tmp/lg-inheritance-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Override filtering, per-setting inheritance, mixed bases, shared targets, concurrent edits, lost replies, excluded cleanup, remote controls and offline/version gates passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
