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
    await mount(page,state,{tvRemote:true,fileTransfer:false});
    const a=actions(page),{button}=a;
    await a.focusKey('setting:backlight').waitFor();
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
        if(command.action==='inspect_many'&&command.bank_ids.includes(window.nativeBank.id)) {
          const rest=command.bank_ids.filter(id=>id!==window.nativeBank.id),others=rest.length?(await original({...command,bank_ids:rest})).banks:[];
          return {banks:others.concat([{
            id:window.nativeBank.id,settings:structuredClone(window.nativeValues),
            controls:{backlight:{component:'number',min:0,max:100,step:1},color:{component:'number',min:0,max:100,step:1}},
            availability:{backlight:{state:'editable',editable:true},color:{state:'editable',editable:true}}
          }])};
        }
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
      editor.target={inputs:['hdmi2'],presets:['expert1'],ranges:null,genres:null,allm:null};editor.variant='standard';await editor.refresh(true);
    });
    await a.open('backlight');
    // An unused input's unused preset is still a full column and row.
    assert(await a.focusKey('col:hdmi2').isVisible());assert(await a.focusKey('row:expert1').isVisible());
    assert.equal(await a.number('backlight').inputValue(),'42','Read values fill native-only catalog placeholders');
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.some(b=>b.id==='native_unused')),false);
    await a.number('backlight').fill('43');await button('Review 1 changes').click();
    assert(await page.getByText('Saved directly on the TV. Future adjustments to this value persist until you change them again.',{exact:true}).isVisible());
    await a.focusKey('review-confirm').click();await a.saved();await a.ready();
    assert.equal(await a.number('backlight').inputValue(),'43');
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.some(b=>b.id==='native_unused')),false);
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit_many').at(-1).edits[0].expected),{backlight:42});
    await page.evaluate(()=>{window.loseNativeReply=true;});await a.number('backlight').fill('44');await button('Review 1 changes').click();await a.focusKey('review-confirm').click();
    await page.getByText('Reply lost',{exact:false}).waitFor();await a.ready();assert.equal(await a.number('backlight').inputValue(),'44');
    assert.equal(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length),0,'A lost native-save reply is reconciled from a fresh LG read');
    await a.focusKey('edit:dark').click();await a.ready();await a.number('backlight').fill('45');
    await button('Review 1 changes').click();await a.focusKey('review-confirm').click();await a.saved();await a.ready();
    const managed=await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='native_unused'));
    assert.deepEqual(managed.settings,{backlight:44});assert.deepEqual(managed.variants,{dark:{backlight:45}});
    assert.equal(await a.number('backlight').inputValue(),'45');
    await a.open('color');assert.equal(await a.number('color').inputValue(),'50','Unmanaged sibling values remain browsable after partial enrollment');
    await a.focusKey('button:Refresh').focus();await page.keyboard.press('ArrowDown');
    assert.notEqual((await a.focused()).label,'Refresh');
    assert.deepEqual(errors,[]);console.log('Native browsing, direct save, sparse overlays, stale-review payloads and lost-reply recovery passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
