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
    initial.document.banks.find(b=>b.id==='movie_filmMaker').variants={dark:{color:50}};
    initial.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:60}};
    await mount(page,initial,{tvRemote:true});
    const a=actions(page),{q,button}=a,drafts=()=>page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length);
    const refresh=fn=>page.evaluate(fn);
    await a.focusKey('edit:standard').waitFor();await a.target({inputs:['hdmi3'],presets:['filmMaker']});
    await a.focusKey('edit:dark').click();await a.open('color');
    const inspections=(await a.calls('inspect')).length;
    await a.focusKey('only-overrides').click();
    assert(await a.setting('color').isVisible());assert(await a.setting('backlight').isVisible(),'Dark overrides SDR movie brightness');
    assert.equal(await a.setting('contrast').count(),0,'Settings without overrides are hidden');
    assert.equal(await a.number('color').inputValue(),'50','Equal-valued pins are shown');
    assert.equal((await a.calls('inspect')).length,inspections,'Filtering reuses cached descriptions');
    assert.equal((await a.calls('edit_many')).length,0,'Filtering is read-only');
    await button('Remove override for Color depth').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>Object.values(document.querySelector('lg-profile-editor').draft)[0].inherit),true);
    await button('Review 1 changes').click();assert(await page.getByText('50 → Base: 50',{exact:true}).isVisible());
    await refresh(()=>{window.failNextBatch='before';});await button('Save Dark room overrides').click();
    await page.getByText(/Unsaved drafts remain/).waitFor();
    assert.equal(await drafts(),1,'Equal-value reset is not mistaken for a successful save');
    await button('Review against latest').click();assert(await page.getByText('50 → Base: 50',{exact:true}).isVisible());
    await refresh(()=>{window.failNextBatch='after';});await button('Save Dark room overrides').click();
    await page.getByText('Reply lost',{exact:true}).waitFor();
    assert.equal(await drafts(),0,'Lost reply reconciles membership, not just numbers');
    assert(await a.setting('color').isVisible(),'Only-overrides lists everything the profile changes, here HDR Filmmaker');
    assert.doesNotMatch(await a.cell('hdmi3','filmMaker').getAttribute('aria-label'),/override in Dark room/,'SDR Filmmaker follows Base again');
    assert.match(await a.cell('hdmi3','hdrFilmMaker').getAttribute('aria-label'),/override in Dark room/);
    assert.equal(await page.evaluate(()=>window.fixture.document.profiles.find(p=>p.id==='dark').brightness.movie_sdr),3,'Single reset keeps other overrides');
    // One action resets each native value to its own Base.
    await refresh(async()=>{
      const e=document.querySelector('lg-profile-editor'),banks=window.fixture.document.banks;
      const sdr=banks.find(b=>b.id==='movie_filmMaker'),hdr=banks.find(b=>b.id==='movie_hdrFilmMaker');
      sdr.settings.color=51;sdr.variants={dark:{color:55}};hdr.settings.color=48;
      window.fixture.revision++;e.target.presets=['filmMaker','hdrFilmMaker'];await e.refresh(true);
    });
    await a.open('color');await button('Remove override for Color depth').click();
    await a.open('backlight');await button('Remove override for OLED pixel brightness').click();
    await button('Review 3 changes').click();
    for(const text of ['55 → Base: 51','60 → Base: 48','3 → Base: 3'])assert(await page.getByText(text,{exact:true}).isVisible());
    await button('Save Dark room overrides').click();await a.saved();
    assert.deepEqual(await q('.list .item').evaluateAll(n=>n.map(i=>i.dataset.focus)),['setting:pictureMode'],'Only the Dolby Vision preset mapping override remains');
    const edits=(await a.calls('edit_many')).at(-1).edits;
    assert.deepEqual(edits.map(e=>[e.bank_id,e.inherit]),[['movie_filmMaker',['color','backlight']],['movie_hdrFilmMaker',['color']]]);
    await a.focusKey('only-overrides').click();await a.open('color');
    assert.equal(await a.number('color').inputValue(),'','Different inherited Base values remain Mixed');
    // A pending reset re-reviews the latest Base, never pins its old number.
    await refresh(async()=>{const b=window.fixture.document.banks.find(b=>b.id==='movie_filmMaker');b.variants={dark:{color:55}};window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.target.presets=['filmMaker'];await e.refresh(true);});
    await a.ready();await button('Remove override for Color depth').click();
    await refresh(async()=>{window.fixture.document.banks.find(b=>b.id==='movie_filmMaker').settings.color=53;window.fixture.revision++;await document.querySelector('lg-profile-editor').refresh();});
    await button('Review against latest').click();assert(await page.getByText('55 → Base: 53',{exact:true}).isVisible());
    await button('Save Dark room overrides').click();await a.saved();await a.ready();assert.equal(await a.number('color').inputValue(),'53');
    // Resetting linked gaming brightness from one input previews every linked preset.
    await refresh(async()=>{window.fixture.document.profiles.find(p=>p.id==='dark').brightness.game_sdr=70;window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.target={inputs:['hdmi1_pc'],presets:['game'],ranges:null,genres:null,allm:null};e.onlyOverrides=true;await e.refresh(true);});
    await a.open('backlight');await button('Remove override for OLED pixel brightness').click();await button('Review 1 changes').click();
    assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').review.entries[0].targets.length),3);
    await button('Save Dark room overrides').click();await a.saved();
    assert.equal(await page.evaluate(()=>window.fixture.document.profiles.find(p=>p.id==='dark').brightness.game_sdr),undefined);
    // An override on a target LG no longer uses can still be removed.
    await refresh(async()=>{window.fixture.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:59}};window.unavailable={movie_hdrFilmMaker:{color:'Unavailable in this signal'}};window.fixture.revision++;const e=document.querySelector('lg-profile-editor');e.target={inputs:['hdmi3'],presets:['hdrFilmMaker'],ranges:null,genres:null,allm:null};e.setting='color';await e.refresh(true);});
    await a.ready();assert.equal(await a.number('color').count(),0,'No value control for an excluded target');
    await a.focusKey('excluded-settings').click();assert(await page.getByText(/Saved override: 59 · Base: 48/).isVisible());
    await button('Remove override for Color depth').click();await button('Review 1 changes').click();await button('Save Dark room overrides').click();await a.saved();
    assert.deepEqual(await q('.list .item').evaluateAll(n=>n.map(i=>i.dataset.focus)),['setting:pictureMode'],'Only the Dolby Vision preset mapping override remains');
    // Read-only and older bridge views cannot submit an unsupported reset.
    await refresh(async()=>{window.editorApi=6;window.unavailable={};window.fixture.document.banks.find(b=>b.id==='movie_hdrFilmMaker').variants={dark:{color:59}};window.fixture.revision++;await document.querySelector('lg-profile-editor').refresh(true);});
    await a.ready();assert(await button('Remove override for Color depth').isDisabled());
    await refresh(async()=>{window.editorApi=7;window.offline=true;await document.querySelector('lg-profile-editor').refresh();});
    assert(await button('Remove override for Color depth').isDisabled());assert(await a.focusKey('only-overrides').isEnabled());
    await refresh(async()=>{window.offline=false;await document.querySelector('lg-profile-editor').refresh(true);});
    await a.focusKey('edit:standard').click();
    assert.equal(await a.focusKey('only-overrides').count(),0);assert.equal(await page.getByRole('button',{name:/^Remove override for/}).count(),0);
    await a.focusKey('edit:dark').click();await a.ready();
    for(const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width>=1000?720:844});
      if(width<700&&await a.setting('color').isVisible())await a.open('color');
      await button('Remove override for Color depth').scrollIntoViewIfNeeded();
      await a.noOverflow(width);
      await page.screenshot({path:'/tmp/lg-inheritance-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Override filtering, per-setting inheritance, mixed bases, shared targets, concurrent edits, lost replies, excluded cleanup, remote controls and offline/version gates passed.\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
