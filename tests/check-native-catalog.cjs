'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const state=structuredClone(require('./fixtures/profile-formats.cjs'));
for(const [mode,settings] of [['expert1',{color:40,gamma:'high2'}],['expert2',{color:45,gamma:'high2'}],['hdrCinemaBright',{color:55,gamma:'high2'}],['dolbyHdrGame',{color:50,gamma:'high2'}]])
  for(const input of ['hdmi3','hdmi3_pc'])state.document.banks.push({id:input+'_'+mode,name:mode,devices:[],target:{category:'picture',dimension:{input,pictureMode:mode}},settings});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await mount(page,state,{tvRemote:true});
  const a=actions(page),{q,button}=a;
  await a.focusKey('setting:gamma').waitFor();
  await page.evaluate(async()=>{
   window.editorApi=8;window.unavailable={};
   for(const input of ['hdmi3','hdmi3_pc']) {
    window.unavailable[input+'_hdrCinemaBright']={gamma:'Gamma does not apply to HDR'};
    window.unavailable[input+'_dolbyHdrGame']={gamma:'Gamma does not apply to Dolby Vision',color:'Game Optimizer uses its separate Color Depth'};
   }
   const e=document.querySelector('lg-profile-editor');e.target={inputs:['hdmi3','hdmi3_pc'],presets:['expert1','expert2','hdrCinemaBright','dolbyHdrGame'],ranges:null,genres:null,allm:null};await e.refresh(true);
  });
  // Expert / ISF, HDR Cinema Home and Dolby Vision Game are ordinary rows;
  // PC and video identities of one port are separate columns.
  await a.open('gamma');
  for(const row of ['expert1','expert2'])assert(await a.focusKey('row:'+row).isVisible());
  assert.equal(await a.focusKey('row:hdrCinemaBright').count(),1,'Gamma rows include HDR presets so their exclusion is visible');
  assert.match(await a.cell('hdmi3','hdrCinemaBright').getAttribute('aria-label'),/not used — Gamma does not apply to HDR/);
  assert(await a.focusKey('col:hdmi3_pc').getByText('PC input').isVisible());assert(await a.focusKey('col:hdmi3').isVisible());
  assert.equal(await a.choice('gamma').inputValue(),'high2');
  assert(await q('.valuebox').getByText('4 selected values are skipped',{exact:false}).isVisible());
  await a.open('color');
  assert.equal(await a.number('color').inputValue(),'');await a.number('color').fill('51');
  await button('Review 6 changes').click();
  assert(await page.getByRole('heading',{name:'Excluded from these edits',exact:true}).isVisible());
  assert(await page.getByText('HDMI 3 · Dolby Vision Game · Picture — Game Optimizer uses its separate Color Depth',{exact:true}).isVisible());
  await button('Save standards').click();await a.saved();
  const edits=(await a.calls('edit_many')).at(-1).edits;
  assert(edits.every(e=>!e.bank_id.includes('dolbyHdrGame')),'Disabled targets cannot enter a combined save');assert.equal(edits.length,6);
  // Remote: the corner selects every input; OK on a column header narrows.
  await a.focusKey('cols:all').focus();await page.keyboard.press('Enter');
  assert.equal(await a.focusKey('cols:all').getAttribute('aria-pressed'),'true','The corner adds HDMI 1 and HDMI 4');
  await page.keyboard.press('Enter');assert.equal(await a.focusKey('cols:all').getAttribute('aria-pressed'),'false','A second OK clears every input');
  await page.keyboard.press('Enter');assert.equal(await a.focusKey('cols:all').getAttribute('aria-pressed'),'true');
  await a.reach('col:hdmi3_pc');await page.keyboard.press('Enter');await a.ready();
  assert.deepEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').target.inputs.sort()),['hdmi1_pc','hdmi3','hdmi4']);
  assert.equal(await a.focusKey('col:hdmi3_pc').getAttribute('aria-pressed'),'false');
  assert((await a.calls('inspect_many')).length>0,'Availability reads are batched');
  for(const width of [1920,1280,390,320]) {
   await page.setViewportSize({width,height:width>1000?720:844});
   await a.noOverflow(width);
  }
  assert.deepEqual(errors,[]);console.log('Expanded presets, separate input types, combined edits, disabled target exclusions, review and remote target selection passed.');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
