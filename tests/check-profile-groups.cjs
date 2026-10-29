'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const fixture=require('./fixtures/profile-formats.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>html,body{height:100%;margin:0}lg-profile-editor{height:100%}</style><lg-profile-editor></lg-profile-editor>');
    const appRoot=process.env.PROFILE_TEST_APP_ROOT||path.join(__dirname,'../app');
    for(const file of ['profile-view.js','profile-editor.js'])await page.addScriptTag({path:path.join(appRoot,file)});
    await page.evaluate(initial=>{
      window.fixture=initial;window.calls=[];
      window.fixture.document.banks.find(b=>b.id==='pc_sdr_game').settings.gameColorDepth=55;
      document.querySelector('lg-profile-editor').configure({request:async command=>{
        window.calls.push(structuredClone(command));
        if(command.action==='get')return {state:structuredClone(window.fixture),status:{offline:!!window.offline}};
        const bank=window.fixture.document.banks.find(b=>b.id===(command.bank_id||command.scope));
        if(command.action==='inspect') {
          const controls={};
          Object.entries(bank.settings).forEach(([key,value])=>{controls[key]=typeof value==='number'?{component:'number',min:0,max:100,step:1}:{component:'select',options:['truMotionMode','enableQFT'].includes(key)?['off','on']:[value]};});
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
    const formats=page.getByLabel('Format',{exact:true}),device=page.getByLabel('Device',{exact:true}),view=page.getByLabel('View',{exact:true});
    const color=page.getByRole('spinbutton',{name:'Color depth',exact:true}),motion=page.getByRole('combobox',{name:'TruMotion',exact:true});
    const waitSaved=()=>page.getByText('Saved on the TV.',{exact:false}).waitFor();
    const commands=action=>page.evaluate(action=>window.calls.filter(c=>c.action===action),action);
    const revision=()=>page.evaluate(()=>window.fixture.revision);
    await color.waitFor();
    assert.equal(await formats.locator('option').count(),9,'Nine real format profiles replace native bank choices');
    for(const id of ['pc','ps5','switch']) {
      await device.selectOption(id);
      assert.deepEqual(await formats.locator('option').allTextContents(),['SDR','HDR']);
    }
    await device.selectOption('pc');
    await color.waitFor();
    assert.equal(await color.count(),1);
    assert.equal(await color.inputValue(),'','Unequal saved controls are visibly mixed, never silently synchronized');
    assert(await page.getByRole('slider',{name:'Color depth',exact:true}).isHidden(),'A mixed slider must not imply an arbitrary value');
    assert.equal((await commands('edit')).length,0);
    await color.fill('50');await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual(await commands('edit'),[{action:'edit',bank_id:'pc_sdr_game',variant:'standard',settings:{gameColorDepth:50},revision:7}],'An explicit common value changes only the differing native setting');
    const start=await revision();
    await color.fill('51');await motion.selectOption('on');
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual((await commands('edit')).slice(-4),[
      {action:'edit',bank_id:'pc_sdr',variant:'standard',settings:{color:51},revision:start},
      {action:'edit',bank_id:'pc_sdr_motion',variant:'standard',settings:{truMotionMode:'on'},revision:start+1},
      {action:'edit',bank_id:'pc_sdr_game',variant:'standard',settings:{gameColorDepth:51},revision:start+2},
      {action:'edit',bank_id:'pc_sdrALLM_game',variant:'standard',settings:{gameColorDepth:51},revision:start+3}
    ]);
    assert.equal(await page.evaluate(()=>window.fixture.document.banks.find(b=>b.id==='pc_hdr').settings.color),50);
    await page.getByRole('button',{name:'Restore this profile',exact:true}).click();await waitSaved();
    const scopes=['pc_sdr','pc_sdr_motion','pc_sdr_game','pc_sdrALLM_game','pc_sdr_mapping','pc_sdrALLM_mapping'];
    assert.deepEqual((await commands('restore')).map(c=>c.scope),scopes,'Restore covers picture, motion, optimizer and routing for SDR only');
    const saveRevision=await revision();
    await page.getByRole('button',{name:'Keep current adjustments',exact:true}).click();await waitSaved();
    assert.deepEqual(await commands('save'),scopes.map((scope,i)=>({action:'save',scope,revision:saveRevision+i})));
    // A partial save preserves drafts for all unconfirmed native targets.
    await color.fill('52');await motion.selectOption('off');
    await page.evaluate(()=>{window.failBank='pc_sdr_motion';});
    await page.getByRole('button',{name:'Save standard',exact:true}).click();
    await page.getByText('1 of 4 updates confirmed.',{exact:false}).waitFor();
    assert.equal(await color.inputValue(),'52');
    assert.deepEqual(await page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).sort()),['pc_sdr_motion','pc_sdr_game','pc_sdrALLM_game'].sort());
    const retryRevision=await revision();
    await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.deepEqual((await commands('edit')).slice(-3).map(c=>[c.bank_id,c.revision]),[['pc_sdr_motion',retryRevision],['pc_sdr_game',retryRevision+1],['pc_sdrALLM_game',retryRevision+2]]);
    // No stale description can bring an abandoned format's values into view.
    await page.evaluate(()=>{window.slowInspect='pc_hdr';});
    await formats.selectOption('pc_hdr');await formats.selectOption('pc_sdr');
    await page.waitForTimeout(150);assert.equal(await color.inputValue(),'52');
    await device.selectOption('apple');
    assert.deepEqual(await formats.locator('option').allTextContents(),['SDR','HDR','Dolby Vision']);
    await formats.selectOption('movie_dolbyHdrCinema');
    await page.getByLabel('Room variant',{exact:true}).selectOption('bright');
    await page.getByText('Preset: Dolby Vision Cinema Home.',{exact:false}).waitFor();
    await color.fill('54');await page.getByRole('button',{name:'Save standard',exact:true}).click();await waitSaved();
    assert.equal((await commands('edit')).at(-1).bank_id,'movie_dolbyHdrCinemaBright');
    assert.equal((await commands('edit')).at(-1).variant,'bright');
    await page.getByLabel('Room variant',{exact:true}).selectOption('dark');
    await page.getByText('Preset: Dolby Vision Cinema.',{exact:false}).waitFor();assert.equal(await color.inputValue(),'50');
    assert(await page.getByText('Shared by Apple TV and NVIDIA Shield.',{exact:false}).isVisible());
    await view.selectOption('input');
    assert.equal(await page.getByLabel('Input',{exact:true}).locator('option').count(),1,'Shared port options are visible from Apple TV too');
    await page.getByRole('combobox',{name:'Quick frame transport',exact:true}).waitFor();
    assert(await page.getByText('HDMI options apply across formats.',{exact:false}).isVisible());
    await device.selectOption('switch');await view.selectOption('advanced');
    const native=page.getByLabel('Native settings',{exact:true});
    assert(await native.locator('option[value="switch_dv_unused_mapping"]').count());
    await native.selectOption('switch_dv_unused_mapping');
    assert.equal(await page.getByRole('combobox',{name:'Picture mode',exact:true}).inputValue(),'dolbyHdrGame','Dormant mappings stay accessible only in advanced settings');
    await view.selectOption('profiles');
    assert.deepEqual(await formats.locator('option').allTextContents(),['SDR','HDR']);
    await color.waitFor();
    await page.evaluate(async()=>{window.offline=true;await document.querySelector('lg-profile-editor').refresh();});
    assert(await page.getByText('TV offline · saved backup',{exact:true}).isVisible());
    assert(await page.getByRole('button',{name:'Restore this profile',exact:true}).isDisabled());
    assert(await color.isDisabled());
    assert.deepEqual(errors,[]);
    console.log('Format profiles: SDR/HDR/DV choices, merged controls, mixed values, precise scoped writes, revisions/retry, room-selected DV, shared HDMI options, advanced access and offline display passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
