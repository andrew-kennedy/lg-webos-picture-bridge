'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mount}=require('./fixtures/editor-host.cjs');
const catalog=require('../app/bridge/lib/profile-catalog');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const state=structuredClone(require('./fixtures/profile-formats.cjs'));
    state.document=catalog.upgrade(state.document,state.preferences);state.selection='automatic';state.active_profile='dark';
    await mount(page,state,{tvRemote:true,fileTransfer:false});
    await page.evaluate(async()=>{
      const original=window.requestProfile;
      window.editorApi=9;window.nativeValues={backlight:42,color:50};
      window.nativeBank={id:'native_unused',name:'Unused ISF',devices:[],target:{category:'picture',dimension:{input:'hdmi2',pictureMode:'expert1'}},settings:{backlight:null,color:null}};
      const editor=document.querySelector('lg-profile-editor');
      editor.adapter.request=async command=>{
        if(command.action==='get') {
          const result=await original(command);
          result.catalog=result.state.document.banks.filter(b=>b.id!==window.nativeBank.id).concat([window.nativeBank]);return result;
        }
        if(command.action==='inspect_many'&&command.bank_ids.includes(window.nativeBank.id))return {banks:[{
          id:window.nativeBank.id,settings:structuredClone(window.nativeValues),
          controls:{backlight:{component:'number',min:0,max:100,step:1},color:{component:'number',min:0,max:100,step:1}},
          availability:{backlight:{state:'editable',editable:true},color:{state:'editable',editable:true}}
        }]};
        if(command.action==='edit_many'&&command.edits.every(e=>e.bank_id===window.nativeBank.id)) {
          window.calls.push(structuredClone(command));
          for(const edit of command.edits) {
            if(edit.variant==='standard')Object.assign(window.nativeValues,edit.settings);
            else {
              const bank=structuredClone(window.nativeBank);bank.settings=Object.fromEntries(Object.keys(edit.settings).map(k=>[k,window.nativeValues[k]]));bank.variants={[edit.variant]:edit.settings};
              window.fixture.document.banks.push(bank);window.fixture.revision++;
            }
          }
          if(window.loseNativeReply){window.loseNativeReply=false;throw new Error('Reply lost');}
          return {};
        }
        return original(command);
      };
      editor.scope={port:['hdmi2'],preset:['expert1']};editor.split=[];editor.variant='standard';await editor.refresh(true);
    });
    const light=page.getByRole('spinbutton',{name:'OLED pixel brightness · SDR',exact:true});
    await light.waitFor();assert.equal(await light.inputValue(),'42','Read values fill native-only catalog placeholders');
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.some(b=>b.id==='native_unused')),false);
    await light.fill('43');await page.getByRole('button',{name:'Review 1 changes',exact:true}).click();
    assert(await page.getByText('Save directly to LG’s native storage; this does not enroll a managed standard.',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.equal(await light.inputValue(),'43');
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.some(b=>b.id==='native_unused')),false);
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits[0].expected),{backlight:42});
    await page.evaluate(()=>{window.loseNativeReply=true;});await light.fill('44');await page.getByRole('button',{name:'Review 1 changes',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Reply lost',{exact:false}).waitFor();assert.equal(await light.inputValue(),'44');
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),0,'A lost native-save reply is reconciled from a fresh LG read');
    await page.getByRole('combobox',{name:'Profile to edit',exact:true}).selectOption('dark');await light.fill('45');
    await page.getByRole('button',{name:'Review 1 changes',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const managed=await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='native_unused'));
    assert.deepEqual(managed.settings,{backlight:44});assert.deepEqual(managed.variants,{dark:{backlight:45}});
    assert.equal(await light.inputValue(),'45');
    assert.equal(await page.getByRole('spinbutton',{name:'Color depth · All selected values',exact:true}).inputValue(),'50','Unmanaged sibling values remain browsable after partial enrollment');
    await page.getByRole('button',{name:'Refresh',exact:true}).focus();await page.keyboard.press('ArrowDown');
    assert.notEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.activeElement.textContent),'Refresh');
    assert.deepEqual(errors,[]);console.log('Native browsing, direct save, sparse overlays, stale-review payloads and lost-reply recovery passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
