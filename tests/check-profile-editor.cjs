'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const state={schema:1,owner_id:'owner',instance_id:'instance',sequence:1,revision:7,enabled:true,room:'dark',preferences:{movie_bright:100,movie_dark:3,game_sdr:80},overrides:{movie:{color:55}},document:{schema:1,name:'Living room G6',devices:{apple:'Apple TV',shield:'NVIDIA Shield',switch:'Nintendo Switch 2'},banks:[
  {id:'movie',name:'HDMI 3 · SDR Filmmaker',devices:['apple','shield'],target:{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}},settings:{backlight:3,color:50,sharpness:0,colorTemperature:-40,contrast:85,brightness:50,colorGamut:'auto',peakBrightness:'off',gamma:'bt1886'},brightness_role:'movie_sdr'},
  {id:'game',name:'HDMI 3 · HDR Game Optimizer',devices:['switch'],target:{category:'other',dimension:{gameInput:'hdmi3',dynamicRange:'hdrALLM',gameGenre:'Standard'}},settings:{gameColorDepth:50,gameSharpness:0}}
]}};
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844}]) {
      const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<style>html,body{height:100%;margin:0}lg-profile-editor{height:100%}</style><lg-profile-editor></lg-profile-editor>');
      await page.addScriptTag({path:path.join(__dirname,'../app/profile-editor.js')});
      await page.evaluate(initial=>{
        window.calls=[];window.fixture=initial;window.confirm=()=>true;
        document.querySelector('lg-profile-editor').configure({request:async command=>{
          window.calls.push(command);
          if(command.action==='get')return {state:window.fixture,status:{temporary_count:1,backup_sequence:1,backup_acknowledged:1}};
          if(command.action==='inspect'){
            const bank=window.fixture.document.banks.find(b=>b.id===command.bank_id),controls={};
            Object.entries(bank.settings).forEach(([k,v])=>{controls[k]=typeof v==='number'?{component:'number',min:k==='colorTemperature'?-50:0,max:k==='colorTemperature'?50:100,step:1}:{component:'select',options:[v,'on']};});
            return {id:bank.id,settings:bank.settings,controls};
          }
          if(command.action==='edit'){Object.assign(window.fixture.document.banks.find(b=>b.id===command.bank_id).settings,command.settings);window.fixture.revision++;}
          return {};
        }});
      },state);
      await page.getByLabel('Color depth',{exact:true}).first().waitFor();
      assert(await page.getByText('Shared by Apple TV and NVIDIA Shield.',{exact:false}).isVisible());
      assert(await page.getByText('Temporary: 55').isVisible());
      const temperature=page.getByRole('spinbutton',{name:'Color temperature'});
      assert.equal(await temperature.getAttribute('min'),'-50');
      assert.equal(await temperature.getAttribute('max'),'50');
      await page.getByLabel('Native profile',{exact:true}).selectOption('game');
      await page.getByRole('spinbutton',{name:'Game sharpness'}).fill('4');
      await page.getByRole('button',{name:'Save standard',exact:true}).click();
      await page.waitForFunction(()=>window.fixture.revision===8);
      await page.getByText('Saved on the TV.',{exact:false}).waitFor();
      const edits=await page.evaluate(()=>window.calls.filter(c=>c.action==='edit'));
      assert.deepEqual(edits,[{action:'edit',bank_id:'game',variant:'standard',settings:{gameSharpness:4},revision:7}]);
      await page.getByLabel('Native profile',{exact:true}).selectOption('movie');
      await page.getByRole('spinbutton',{name:'Color depth',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),viewport.height,'The page itself must not scroll');
      const body=page.locator('lg-profile-editor').locator('.body');
      assert(await body.evaluate(n=>n.clientHeight>100));
      assert(await page.getByRole('button',{name:'Save standard',exact:true}).isVisible());
      assert.deepEqual(errors,[]);
      if(viewport.width===1920)await page.screenshot({path:'/tmp/lg-profile-editor-desktop.png'});
      if(viewport.width===390)await page.screenshot({path:'/tmp/lg-profile-editor-mobile.png'});
      await page.close();
    }
    console.log('Profile editor: desktop, TV and mobile layout; inactive-bank editing; TV metadata ranges; explicit save passed.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
