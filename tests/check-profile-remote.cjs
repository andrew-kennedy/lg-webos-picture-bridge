'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const state=require('./fixtures/profile-editor.cjs');
const appRoot=process.env.PROFILE_TEST_APP_ROOT||path.join(__dirname,'../app');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1920,height:1080},{width:1280,height:720}]) {
    const page=await browser.newPage({viewport}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://bridge.test/**',route=>{
      const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
      if(!/^(index\.html|app\.js|profile-editor\.js|styles\.css|assets\/icon160\.png)$/.test(name))return route.abort();
      return route.fulfill({path:path.join(appRoot,name)});
    });
    await page.addInitScript(initial=>{
      window.fixture=initial;window.calls=[];
      window.PalmServiceBridge=function(){};
      window.PalmServiceBridge.prototype.call=async function(uri,payload){
        const command=JSON.parse(payload);let result={};
        if(uri.endsWith('/profiles')) {
          window.calls.push(command);
          if(command.action==='get'){
            if(window.delayGet)await new Promise(resolve=>setTimeout(resolve,150));
            result={state:window.fixture,status:{offline:!!window.offline,temporary_count:1}};
          }
          if(command.action==='inspect'){
            const bank=window.fixture.document.banks.find(b=>b.id===command.bank_id),controls={};
            Object.entries(bank.settings).forEach(([k,v])=>{controls[k]=typeof v==='number'?{component:'number',min:k==='colorTemperature'?-50:0,max:k==='colorTemperature'?50:100,step:1}:{component:'select',options:[v,'on']};});
            if(window.delayInspect)await new Promise(resolve=>setTimeout(resolve,150));
            result={id:bank.id,settings:bank.settings,controls};
          }
          if(command.action==='edit'){Object.assign(window.fixture.document.banks.find(b=>b.id===command.bank_id).settings,command.settings);window.fixture.revision++;result={revision:window.fixture.revision};}
          if(command.action==='set_enabled'){window.fixture.enabled=command.enabled;window.fixture.revision++;}
        }
        this.onservicecallback(JSON.stringify({returnValue:true,result,status:{configured:true,running:true,monitor_healthy:true,transport:'mqtt',mqtt_commands_enabled:true,mqtt:{state:'connected',commands_ready:true}}}));
      };
    },state);
    await page.goto('http://bridge.test/');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('webOSLaunch',{detail:{}})));
    await page.waitForFunction(()=>document.querySelector('#status-title').textContent!=='Checking configuration…');
    await page.waitForFunction(()=>document.activeElement.id==='refresh-button');
    // Enter from the real status-screen focus ring, without a pointer or Tab.
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-button');
    await page.keyboard.press('Enter');
    await page.getByRole('spinbutton',{name:'Color depth',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
    await page.keyboard.press('ArrowDown');
    const focused=()=>page.evaluate(()=>{
      const n=document.querySelector('#profile-editor').shadowRoot.activeElement;
      return n ? {label:n.getAttribute('aria-label')||n.textContent,type:n.type,editing:n.hasAttribute('data-editing')} : null;
    });
    assert.equal((await focused()).label,'Refresh');
    await page.keyboard.press('ArrowRight');
    assert.equal((await focused()).label,'Download backup','Right must escape Refresh inside the shadow root');
    const legacy=code=>page.evaluate(code=>{
      const root=document.querySelector('#profile-editor').shadowRoot;
      (root.activeElement||document.activeElement).dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:code,which:code,bubbles:true,composed:true,cancelable:true}));
    },code);
    const walk=async(label,type)=>{
      for(let i=0;i<70;i++){
        const active=await focused();
        if(active && active.label===label && (!type || active.type===type))return;
        await page.keyboard.press('ArrowDown');
      }
      assert.fail('Remote cannot reach '+label+' '+(type||''));
    };
    await legacy(39);assert.equal((await focused()).label,'Import');
    await legacy(40);assert.equal((await focused()).label,'Device');
    await page.keyboard.press('ArrowRight');assert.equal((await focused()).label,'Profile');
    assert.equal(await page.getByLabel('Profile',{exact:true}).inputValue(),'movie','Navigation must not change a selector');
    await legacy(37);assert.equal((await focused()).label,'Device');
    await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByLabel('Device',{exact:true}).inputValue(),'apple');
    assert.equal((await focused()).label,'Device','Device filtering must retain focus after render');
    assert.equal((await focused()).editing,true);
    await legacy(461);assert.equal((await focused()).editing,false,'Back finishes editing before leaving the screen');
    assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),false);
    await page.keyboard.press('Enter');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
    assert.equal(await page.getByLabel('Device',{exact:true}).inputValue(),'all');
    await walk('TruMotion');
    assert.equal((await focused()).type,'select-one','Arrow navigation crosses from Picture into Motion');
    await walk('Profile');
    await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
    await page.getByRole('slider',{name:'Game color depth',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Profile',{exact:true}).inputValue(),'game');
    assert.equal((await focused()).label,'Profile');
    await page.keyboard.press('ArrowRight');assert.equal((await focused()).label,'Room variant');
    assert(await page.locator('lg-profile-editor .body').evaluate(n=>n.clientHeight>100));
    const bounds=await page.getByRole('button',{name:'Automatic profiles: On'}).boundingBox();
    assert(bounds.y>=0 && bounds.y+bounds.height<=viewport.height,'Remote help must not push footer actions off-screen');
    if(viewport.width===1920)await page.screenshot({path:'/tmp/lg-profile-remote.png'});
    await page.keyboard.press('ArrowDown');assert.deepEqual(await focused(),{label:'Game color depth',type:'range',editing:false});
    await page.keyboard.press('ArrowDown');assert.equal((await focused()).type,'number');
    await page.keyboard.press('ArrowUp');assert.equal((await focused()).type,'range');
    assert.equal(await page.getByRole('slider',{name:'Game color depth',exact:true}).inputValue(),'50');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>!['get','inspect'].includes(c.action)).length),0,'Moving focus must not write TV settings');
    await page.keyboard.press('Enter');await legacy(37);
    assert.equal(await page.getByRole('spinbutton',{name:'Game color depth',exact:true}).inputValue(),'49');
    await legacy(461);
    await page.evaluate(()=>{
      window.delayInspect=true;window.inspected=false;
      document.querySelector('#profile-editor').inspect().then(()=>{window.inspected=true;});
    });
    await page.waitForFunction(()=>window.inspected);
    assert.deepEqual(await focused(),{label:'Game color depth',type:'range',editing:false},'An asynchronous range update must preserve focus');
    assert.equal(await page.getByRole('slider',{name:'Game color depth',exact:true}).inputValue(),'49','Metadata refresh must preserve the draft');
    await page.evaluate(()=>{window.delayInspect=false;});
    await walk('Game sharpness','range');await page.keyboard.press('Enter');await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByRole('slider',{name:'Game sharpness',exact:true}).inputValue(),'0','Remote editing must respect the native minimum');
    await page.keyboard.press('Enter');
    await walk('Save standard');await page.keyboard.press('Enter');
    await page.getByText('Saved on the TV.',{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='edit')),[{action:'edit',bank_id:'game',variant:'standard',settings:{gameColorDepth:49},revision:7}]);
    assert.equal((await focused()).label,'Restore this profile','When Save becomes disabled, keep focus on the adjacent enabled action');
    await walk('Automatic profiles: On');await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Automatic profiles: Off',exact:true}).waitFor();
    assert.equal((await focused()).label,'Automatic profiles: Off','Toggling management retains focus despite a label change');
    assert.equal(await page.getByRole('button',{name:'Automatic profiles: Off'}).getAttribute('aria-pressed'),'false');
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.action==='set_enabled')),[{action:'set_enabled',enabled:false}]);
    await walk('Refresh');await page.keyboard.press('Enter');
    await page.getByRole('slider',{name:'Game color depth',exact:true}).waitFor();
    assert.equal((await focused()).label,'Refresh','Refreshing must not drop focus into the page');
    await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
    await page.keyboard.press('ArrowDown');
    await page.evaluate(()=>{window.delayGet=true;});
    await page.keyboard.press('Enter');await legacy(461);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-button','A late response must not pull focus back into the closed editor');
    // The empty/offline view has no body or footer, but its header still works.
    await page.evaluate(()=>{window.fixture.document=null;window.offline=true;});
    await page.keyboard.press('Enter');await page.getByText('No collection yet.',{exact:true}).waitFor();
    await page.keyboard.press('ArrowDown');assert.equal((await focused()).label,'Refresh');
    await page.keyboard.press('ArrowRight');assert.equal((await focused()).label,'Download backup');
    await page.keyboard.press('ArrowDown');assert.equal((await focused()).label,'Refresh','Skip disabled import and hidden file input');
    await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'profiles-close');
    await legacy(461);assert.equal(await page.locator('#profiles-view').evaluate(n=>n.hidden),true);
    assert.deepEqual(errors,[]);
    console.log(`Profile remote ${viewport.width}x${viewport.height}: arrow-only entry, legacy keys, selectors, bounded draft editing, async refresh, save, management, empty/offline view and Back passed.`);
    await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
