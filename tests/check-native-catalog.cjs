'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const state=structuredClone(require('./fixtures/profile-formats.cjs'));
for(const [mode,settings] of [['expert1',{color:40,gamma:'high2'}],['expert2',{color:45,gamma:'high2'}],['hdrCinemaBright',{color:55,gamma:'high2'}],['dolbyHdrGame',{color:50,gamma:'high2'}]])
  for(const input of ['hdmi3','hdmi3_pc'])state.document.banks.push({id:input+'_'+mode,name:mode,devices:[],target:{category:'picture',dimension:{input,pictureMode:mode}},settings});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await mount(page,state,{tvRemote:true});
  await page.evaluate(async()=>{
   window.editorApi=8;window.unavailable={};
   for(const input of ['hdmi3','hdmi3_pc']) {
    window.unavailable[input+'_hdrCinemaBright']={gamma:'Gamma does not apply to HDR'};
    window.unavailable[input+'_dolbyHdrGame']={gamma:'Gamma does not apply to Dolby Vision',color:'Game Optimizer uses its separate Color Depth'};
   }
   const e=document.querySelector('lg-profile-editor');e.scope={port:['hdmi3'],preset:['expert1','expert2','hdrCinemaBright','dolbyHdrGame']};e.split=[];await e.refresh(true);
  });
  const gamma=page.getByRole('combobox',{name:'Gamma · All selected values',exact:true});await gamma.waitFor();
  assert.equal(await gamma.inputValue(),'high2');
  assert(await page.getByText('4 disabled or unverified values excluded from this control.',{exact:false}).isVisible());
  const color=page.getByRole('spinbutton',{name:'Color depth · All selected values',exact:true});assert.equal(await color.inputValue(),'');await color.fill('51');
  await page.getByRole('button',{name:'Review 6 changes',exact:true}).click();
  assert(await page.getByRole('heading',{name:'Excluded from these edits',exact:true}).isVisible());
  assert(await page.getByText('HDMI 3 · Dolby Vision Game · Picture — Game Optimizer uses its separate Color Depth',{exact:true}).isVisible());
  await page.getByRole('button',{name:'Save standards',exact:true}).click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
  const edits=await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits);
  assert(edits.every(e=>!e.bank_id.includes('dolbyHdrGame')),'Disabled targets cannot enter a grouped save');assert.equal(edits.length,6);
  await page.locator('[data-focus="more-factors"]').click();
  for(const preset of ['SDR Expert / ISF Bright','SDR Expert / ISF Dark','HDR Cinema Home','Dolby Vision Game'])assert(await page.getByRole('button',{name:preset,exact:true}).isVisible());
  await page.locator('[data-focus="split:input_type"]').click();
  assert(await page.getByRole('spinbutton',{name:'Color depth · PC input',exact:true}).isVisible());
  assert(await page.getByRole('spinbutton',{name:'Color depth · Video input',exact:true}).isVisible());
  // No grouping is reachable with the TV remote; it changes presentation only.
  await page.locator('[data-focus="split:none"]').focus();await page.keyboard.press('Enter');
  assert(await page.getByRole('spinbutton',{name:'Color depth · All selected values',exact:true}).isVisible());
  assert((await page.evaluate(()=>window.calls.filter(c=>c.action==='inspect_many').length))>0,'Availability reads are batched');
  for(const width of [1920,1280,390,320]) {
   await page.setViewportSize({width,height:width>1000?720:844});
   assert(await page.evaluate(()=>{const body=document.querySelector('lg-profile-editor').shadowRoot.querySelector('.body');return document.documentElement.scrollWidth<=innerWidth&&body.scrollWidth<=body.clientWidth;}),'No overflow at '+width);
  }
  assert.deepEqual(errors,[]);console.log('Expanded presets, input type, ungrouped edits, disabled target exclusions, review and remote navigation passed.');
 } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
