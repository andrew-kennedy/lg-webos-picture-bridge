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
    const initial=structuredClone(fixture);initial.document.banks.find(b=>b.id==='pc_sdr_game').settings.gameColorDepth=55;
    await mount(page,initial);
    const a=actions(page),{q,button}=a,control=(role,name)=>page.getByRole(role,{name,exact:true});
    const save=async()=>{
      await page.getByRole('button',{name:/^Review (\d+ changes|against latest)$/}).click();
      await button('Save standards').click();await a.saved();
    };
    const reviewed=()=>page.evaluate(()=>document.querySelector('lg-profile-editor').review.entries.map(e=>e.bank_id));
    await a.focusKey('setting:backlight').waitFor();await a.ready();
    assert.equal(await a.setting('backlight').count(),1,'SDR, HDR and DV brightness are one setting');
    // HDR brightness on every input: the HDR group × all inputs.
    await a.open('backlight');
    await a.cell('hdmi1_pc','hdrGame').click();await a.focusKey('group:hdr').click();await a.focusKey('cols:all').click();await a.ready();
    assert.equal(await a.number('backlight').inputValue(),'100');assert.equal(await a.number('backlight').getAttribute('min'),'0');assert.equal(await a.number('backlight').getAttribute('max'),'100');
    await a.number('backlight').fill('99');await button('Review 4 changes').click();
    assert.deepEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').review.entries.map(e=>({bank:e.bank_id,key:e.key,preference:e.preference||null}))),[
      {bank:'pc_hdr',key:'backlight',preference:null},{bank:'ps5_hdr',key:'backlight',preference:null},{bank:'switch_hdr',key:'backlight',preference:null},{bank:'movie_hdrFilmMaker',key:'backlight',preference:null}
    ],'Editing HDR brightness cannot change shared SDR preferences or Dolby Vision');
    await button('Back to editing').click();await button('Discard edits').click();
    assert.equal(await a.number('backlight').inputValue(),'100');assert.equal((await a.calls('edit_many')).length,0);
    // Unequal native standards show Mixed, with no implied slider value.
    await a.target({inputs:['hdmi1_pc'],presets:['game']});await a.open('color');
    assert.equal(await a.number('color').inputValue(),'','Unequal native standards display Mixed');
    assert(await a.slider('color').isHidden(),'Mixed must not imply a slider value');
    assert.match(await a.cell('hdmi1_pc','game').textContent(),/50–55/);
    // Re-selecting targets reuses cached descriptions.
    await a.focusKey('col:hdmi3').click();await a.ready();await a.focusKey('col:hdmi3').click();await a.ready();
    const reads=(await a.calls('inspect')).length;
    await a.focusKey('col:hdmi3').click();await a.ready();await a.focusKey('col:hdmi3').click();await a.ready();
    assert.equal((await a.calls('inspect')).length,reads,'Selection changes use cached metadata');
    assert.equal((await a.calls('edit_many')).length,0);
    await a.number('color').fill('50');await save();
    assert.deepEqual((await a.calls('edit_many'))[0],{action:'edit_many',edits:[{bank_id:'pc_sdr_game',variant:'standard',settings:{gameColorDepth:50}}],preferences:{},revision:7});
    // Drafts for several settings save together as one revision.
    await a.number('color').fill('51');await a.open('truMotionMode');await a.choice('truMotionMode').selectOption('on');
    assert.match(await a.setting('color').textContent(),/Draft/,'The list marks settings with drafts');
    await save();
    const broad=(await a.calls('edit_many')).at(-1);
    assert.equal(broad.edits.length,4);assert.equal(broad.revision,8);
    assert.deepEqual(broad.edits.map(e=>e.bank_id),['pc_sdr','pc_sdr_game','pc_sdrALLM_game','pc_sdr_motion']);
    assert.equal(await page.evaluate(()=>window.fixture.revision),9,'Broad edits use one revision, not one per native bank');
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='pc_hdr').settings.color),50);
    // Temporary adjustments: restore or keep exactly the reviewed keys.
    await page.evaluate(async()=>{window.fixture.overrides.pc_sdr={realCinema:'on',color:57};await document.querySelector('lg-profile-editor').refresh(true);});
    await a.open('realCinema');assert(await q('.valuebox').getByText('Temporary on TV: on').isVisible());
    await button('Restore saved value').click();await button('Restore selected settings').click();await a.saved();
    assert.deepEqual((await a.calls('restore')).at(-1).selection,{pc_sdr:['realCinema']},'Restoring one setting never restores the whole picture bank');
    await page.evaluate(async()=>{window.fixture.overrides.pc_sdr={realCinema:'on',color:57};await document.querySelector('lg-profile-editor').refresh(true);});
    await a.ready();await button('Keep adjustment').click();await button('Keep these adjustments').click();await a.saved();
    assert.deepEqual((await a.calls('save')).at(-1).selection,{pc_sdr:['realCinema']});
    assert.deepEqual((await a.calls('save')).at(-1).expected,{pc_sdr:{realCinema:'on'}});
    assert.equal(await page.evaluate(()=>window.fixture.overrides.pc_sdr.color),57);
    await a.focusKey('open-tv').click();assert(await page.getByText('Temporary adjustments · 1').isVisible());
    await button('Restore all to saved values').click();await button('Restore selected settings').click();await a.saved();
    assert.deepEqual((await a.calls('restore')).at(-1).selection,{pc_sdr:['color']});
    await a.focusKey('view-back').click();
    // Drafts keep their exact targets when the selection moves elsewhere.
    await a.open('color');await a.number('color').fill('52');
    await a.target({inputs:['hdmi1_pc'],presets:['hdrGame']});
    assert(await q('.footer').getByText('3 staged changes → Base').isVisible());
    await page.evaluate(()=>{window.failNextBatch='before';});
    await button('Review 3 changes').click();await button('Save standards').click();
    await page.getByText('Unsaved drafts remain for review.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),3);
    await save();
    assert.deepEqual((await a.calls('edit_many')).at(-1).edits.map(e=>e.bank_id),['pc_sdr','pc_sdr_game','pc_sdrALLM_game'],'Retry retains the original SDR targets despite the HDR selection');
    await a.target({inputs:['hdmi1_pc'],presets:['game']});await a.number('color').fill('53');
    await page.evaluate(()=>{window.failNextBatch='after';});
    await button('Review 3 changes').click();await button('Save standards').click();
    await page.getByText('Reply lost',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),0,'A committed batch with a lost response must not be sent twice');
    assert.equal(await a.number('color').inputValue(),'53');
    // Linked SDR gaming brightness previews every linked preset, even from one input.
    await a.open('backlight');await a.number('backlight').fill('75');
    await button('Review 1 changes').click();
    const targets=await q('.sheet .targets li').allTextContents();
    assert.equal(targets.length,3);assert(targets.some(t=>t.includes('HDMI 4')));assert(targets.some(t=>t.includes('HDMI 3')),'Shared brightness preview expands beyond the selected HDMI 1');
    await button('Save standards').click();await a.saved();
    assert.deepEqual((await a.calls('edit_many')).at(-1).edits,[]);
    assert.deepEqual((await a.calls('edit_many')).at(-1).preferences,{game_sdr:75});
    // Real Cinema: Mixed across game and movie presets; one movie target edits one bank.
    await a.target({inputs:['hdmi1_pc','hdmi3','hdmi4'],presets:['game','filmMaker']});await a.open('realCinema');
    assert.equal(await a.choice('realCinema').inputValue(),'');assert.equal(await a.choice('realCinema').locator('option:checked').textContent(),'Mixed');
    await a.target({inputs:['hdmi1_pc','hdmi3','hdmi4'],presets:['filmMaker']});
    assert.equal(await a.choice('realCinema').inputValue(),'on');
    await a.choice('realCinema').selectOption('off');await save();
    assert.deepEqual((await a.calls('edit_many')).at(-1).edits,[{bank_id:'movie_filmMaker',variant:'standard',settings:{realCinema:'off'}}]);
    // Port-wide connection settings: one column per port, native labels.
    await a.open('enable144HzBooster');await control('combobox','165 Hz boost').waitFor();
    await a.open('enableQFT');
    assert.equal(await a.focusKey('cols:all').getAttribute('aria-pressed'),'true','The previous all-input selection carries over');
    await a.focusKey('cols:all').click();assert(await q('.valuebox').getByText('Nothing selected.',{exact:false}).isVisible(),'The corner toggles every input off');
    await a.focusKey('cols:all').click();await a.ready();
    assert.equal(await control('combobox','Quick frame transport').count(),1);
    assert.equal(await q('.valuebox .for').textContent(),'Set for All ports');
    const hdmi3=await a.focusKey('col:hdmi3').textContent();
    for(const name of ['Nintendo Switch 2','Apple TV','NVIDIA Shield'])assert(hdmi3.includes(name),'Port header lists '+name);
    // Preset selection: dormant mappings are rows of their own.
    await a.open('pictureMode');await a.cell('hdmi3','dolbyHdrALLM').click();await a.ready();
    const mapping=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return e.targetsFor('pictureMode').chosen.map(r=>r.bank.id);});
    assert.deepEqual(mapping,['switch_dv_unused_mapping'],'Dormant mappings are accessible under Preset selection');
    // A disabled ordinary control is skipped, not averaged into the value.
    await a.target({inputs:['hdmi1_pc'],presets:['game']});await a.open('color');
    await page.evaluate(async()=>{
      window.fixture.document.banks.find(b=>b.id==='pc_sdr').settings.color=13;
      window.unavailable={pc_sdr:{color:'Game Optimizer uses its own Color Depth control.'}};
      await document.querySelector('lg-profile-editor').refresh(true);
    });
    await a.ready();
    assert.equal(await a.number('color').inputValue(),'53','An unused ordinary value cannot make valid Game Optimizer controls look mixed');
    const excluded=a.focusKey('excluded-settings');assert(await excluded.isVisible());
    await excluded.click();assert(await page.getByText('Game Optimizer uses its own Color Depth control.',{exact:false}).isVisible());
    await a.number('color').fill('54');await button('Review 2 changes').click();
    assert.deepEqual(await reviewed(),['pc_sdr_game','pc_sdrALLM_game'],'A combined value only targets verified applicable banks');
    await button('Back to editing').click();await button('Discard edits').click();
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='pc_sdr').settings.color),13,'Selecting never removes or rewrites existing standards');
    await page.evaluate(async()=>{window.editorApi=2;await document.querySelector('lg-profile-editor').refresh();});
    assert(await page.getByText('Update LG Picture Bridge to verify which controls apply.',{exact:true}).isVisible());
    assert(await a.number('color').isDisabled(),'An older bridge must never receive unsupported batch writes');
    await page.evaluate(async()=>{window.offline=true;await document.querySelector('lg-profile-editor').refresh();});
    assert(await page.getByText('TV offline · showing saved backup',{exact:true}).isVisible());
    assert.equal(await a.number('color').count(),0,'Offline shows saved values without editing');
    assert(await q('.valuebox .static').isVisible());
    assert.deepEqual(errors,[]);
    console.log('Targets: Mixed values, cached metadata, atomic broad edits, exact restore/keep, conflicts, lost replies, fixed draft targets, shared brightness, Real Cinema, port settings, dormant mappings and offline/version gates passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
