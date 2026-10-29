'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const fixture=structuredClone(require('./fixtures/profile-editor.cjs'));
fixture.document.devices.pc='PC';
fixture.document.banks.push(
  // Deliberately unrelated IDs/names: grouping comes from scope, not naming.
  {id:'pc_picture',name:'Old picture label',devices:['pc'],target:{category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'game'}},settings:{color:50}},
  {id:'motion_a',name:'Unrelated motion label',devices:['pc'],target:{category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'game'},app_id:'com.webos.app.hdmi1'},settings:{truMotionMode:'off'}},
  {id:'pc_hdr',name:'Old HDR label',devices:['pc'],target:{category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'hdrGame'}},settings:{color:50}},
  {id:'motion_b',name:'Another motion label',devices:['pc'],target:{category:'picture',dimension:{input:'hdmi1_pc',pictureMode:'hdrGame'},app_id:'com.webos.app.hdmi1'},settings:{truMotionMode:'off'}},
  {id:'pc_mapping',name:'Raw mapping',devices:['pc'],target:{category:'picture',dimension:{input:'hdmi1_pc',dynamicRange:'sdrALLM'}},settings:{pictureMode:'game'}},
  {id:'pc_sliders',name:'Raw sliders',devices:['pc'],target:{category:'other',dimension:{gameInput:'hdmi1',dynamicRange:'sdrALLM',gameGenre:'Standard'}},settings:{gameColorDepth:50}}
);
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>html,body{height:100%;margin:0}lg-profile-editor{height:100%}</style><lg-profile-editor></lg-profile-editor>');
    await page.addScriptTag({path:path.join(process.env.PROFILE_TEST_APP_ROOT||path.join(__dirname,'../app'),'profile-editor.js')});
    await page.evaluate(initial=>{
      window.fixture=initial;window.calls=[];
      document.querySelector('lg-profile-editor').configure({request:async command=>{
        window.calls.push(structuredClone(command));
        if(command.action==='get')return {state:structuredClone(window.fixture),status:{offline:!!window.offline}};
        const bank=window.fixture.document.banks.find(b=>b.id===(command.bank_id||command.scope));
        if(command.action==='inspect') {
          const controls={};
          Object.entries(bank.settings).forEach(([key,value])=>{controls[key]=typeof value==='number'?{component:'number',min:0,max:100,step:1}:{component:'select',options:key==='truMotionMode'?['off','on']:[value,'on']};});
          if(window.slowInspect===bank.id)await new Promise(resolve=>setTimeout(resolve,100));
          return {id:bank.id,settings:structuredClone(bank.settings),controls};
        }
        if(['edit','save'].includes(command.action)) {
          if(command.revision!==window.fixture.revision)throw new Error('Profiles changed; refresh before saving');
          if(window.failBank===bank.id){window.failBank=null;window.fixture.revision++;throw new Error('Another editor changed the profiles');}
          window.fixture.revision++;
        }
        if(command.action==='edit') {
          if(command.variant==='standard')Object.assign(bank.settings,command.settings);
          else {bank.variants=bank.variants||{};bank.variants[command.variant]={...(bank.variants[command.variant]||{}),...command.settings};}
        }
        return {revision:window.fixture.revision};
      }});
    },fixture);
    const profiles=page.getByLabel('Profile',{exact:true}),device=page.getByLabel('Device',{exact:true});
    const waitSaved=()=>page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const edits=()=>page.evaluate(()=>window.calls.filter(c=>c.action==='edit'));
    await page.getByRole('combobox',{name:'TruMotion',exact:true}).waitFor();
    assert.equal(await profiles.locator('option').count(),6,'Picture/motion pairs produce one choice each');
    assert(await profiles.locator('option').evaluateAll(nodes=>nodes.every(n=>!n.textContent.includes('Old ')&&!n.textContent.includes('motion label'))));
    await device.selectOption('pc');
    assert.deepEqual(await profiles.locator('option').allTextContents(),['SDR Game','HDR Game','SDR with ALLM · Preset selection','SDR with ALLM · Game Optimizer (Standard)']);
    assert.equal(await profiles.inputValue(),'pc_picture');
    await page.getByRole('spinbutton',{name:'Color depth',exact:true}).fill('51');
    await page.getByRole('combobox',{name:'TruMotion',exact:true}).selectOption('on');
    assert.equal((await edits()).length,0,'Drafts never apply just from browsing/editing');
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual(await edits(),[
      {action:'edit',bank_id:'pc_picture',variant:'standard',settings:{color:51},revision:7},
      {action:'edit',bank_id:'motion_a',variant:'standard',settings:{truMotionMode:'on'},revision:8}
    ]);
    assert.deepEqual(await page.evaluate(()=>window.fixture.document.banks.filter(b=>['pc_hdr','motion_b'].includes(b.id)).map(b=>b.settings)),[{color:50},{truMotionMode:'off'}],'HDR stays independent');
    await page.getByRole('spinbutton',{name:'Color depth',exact:true}).fill('52');
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.equal((await edits()).length,3,'Only the edited section is written');
    await page.getByRole('button',{name:'Restore this profile',exact:true}).click();await waitSaved();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='restore')),[{action:'restore',scope:'pc_picture'},{action:'restore',scope:'motion_a'}]);
    await page.getByRole('button',{name:'Keep current adjustments',exact:true}).click();await waitSaved();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='save')),[{action:'save',scope:'pc_picture',revision:10},{action:'save',scope:'motion_a',revision:11}]);
    // A failure in Motion must not claim the whole profile succeeded or discard
    // its draft. A retry sends only the unconfirmed section at the new revision.
    await page.getByRole('spinbutton',{name:'Color depth',exact:true}).fill('53');
    await page.getByRole('combobox',{name:'TruMotion',exact:true}).selectOption('off');
    await page.evaluate(()=>{window.failBank='motion_a';});
    await page.getByRole('button',{name:'Save standard',exact:true}).click();
    await page.getByText('1 of 2 sections confirmed.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('spinbutton',{name:'Color depth',exact:true}).inputValue(),'53');
    assert.equal(await page.getByRole('combobox',{name:'TruMotion',exact:true}).inputValue(),'off');
    assert.deepEqual(await page.evaluate(()=>document.querySelector('lg-profile-editor').draft),{motion_a:{truMotionMode:'off'}});
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual((await edits()).at(-1),{action:'edit',bank_id:'motion_a',variant:'standard',settings:{truMotionMode:'off'},revision:14});
    await page.getByLabel('Room variant',{exact:true}).selectOption('dark');
    await page.getByRole('combobox',{name:'TruMotion',exact:true}).selectOption('on');
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual((await edits()).at(-1),{action:'edit',bank_id:'motion_a',variant:'dark',settings:{truMotionMode:'on'},revision:15});
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='motion_a').settings.truMotionMode),'off','A room edit preserves the base standard');
    // A response from an abandoned profile must not populate the newly chosen one.
    await page.evaluate(()=>{window.slowInspect='pc_hdr';});
    await profiles.selectOption('pc_hdr');await profiles.selectOption('pc_picture');
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole('combobox',{name:'TruMotion',exact:true}).inputValue(),'on');
    assert.equal(await page.getByRole('spinbutton',{name:'Color depth',exact:true}).inputValue(),'53');
    await device.selectOption('apple');
    assert.equal(await profiles.locator('option').count(),1);
    assert(await page.getByText('Shared by Apple TV and NVIDIA Shield.',{exact:false}).isVisible());
    assert(await page.getByRole('heading',{name:'Motion',exact:true}).isVisible());
    await page.evaluate(async()=>{window.offline=true;await document.querySelector('lg-profile-editor').refresh();});
    assert(await page.getByText('TV offline · saved backup',{exact:true}).isVisible());
    assert(await page.getByRole('button',{name:'Restore this profile',exact:true}).isDisabled());
    assert(await page.getByRole('combobox',{name:'TruMotion',exact:true}).isDisabled());
    // Different membership cannot be combined just because two native targets
    // use the same input/preset. Each device filter must retain its own scope.
    await page.evaluate(async()=>{window.fixture.document.banks.find(b=>b.id==='movie_motion').devices=['shield'];await document.querySelector('lg-profile-editor').refresh();});
    assert.equal(await page.getByRole('heading',{name:'Motion',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('Profile groups: scope-based names, device filters, Picture/Motion routing, revisions, partial failure/retry, room variants, stale reads and offline display passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
