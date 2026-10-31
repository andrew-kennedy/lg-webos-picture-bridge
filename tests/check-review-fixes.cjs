'use strict';
// Regressions found reviewing the target grid: stale native drafts, link
// availability, override clean-up, cleared numbers, values outside a combined
// control, the TV sheet's saved values and focus after a refresh.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const drafts=page=>page.evaluate(()=>Object.keys(document.querySelector('lg-profile-editor').draft).length);
// Rewrites LG's descriptions of one bank, as an unverified or narrower model would report it.
const describe=(page,fix)=>page.evaluate(async source=>{
  const e=document.querySelector('lg-profile-editor'),original=e.adapter.request,fix=new Function('b','return ('+source+')(b)');
  e.adapter.request=async c=>{const r=await original(c);if(c.action==='inspect')return fix(r);if(c.action==='inspect_many')return {banks:r.banks.map(fix)};return r;};
  await e.refresh(true);
},fix.toString());
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  const fresh=async()=>{
    const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,fileTransfer:false});const a=actions(page);await a.number('backlight').waitFor();await a.ready();return {page,a,button:a.button};
  };
  try {
    {
      // A native-only value LG changes after staging is re-reviewed, and the
      // save sends the value the review showed.
      const {page,a,button}=await fresh();
      await a.open('brightness');await a.cell('hdmi3','filmMaker').click();await a.focusKey('cols:all').click();await a.ready();
      await a.number('brightness').fill('52');const staged=await drafts(page);
      // LG's own values change; no saved standard revision does.
      const changed=await page.evaluate(()=>Object.values(document.querySelector('lg-profile-editor').draft).filter(d=>d.nativeOnly).map(d=>{window.native[d.bank_id].settings.brightness=51;return d.bank_id;}));
      assert.equal(changed.length,staged,'Every SDR Filmmaker brightness is native-only here');
      // Clearing the field stages nothing, and leaving it shows the draft again.
      await a.number('brightness').fill('');assert.equal(await drafts(page),staged,'Clearing the number keeps staged drafts');
      await a.number('brightness').blur();assert.equal(await a.number('brightness').inputValue(),'52');
      await button('Refresh').click();
      await page.waitForFunction(()=>document.querySelector('lg-profile-editor').reviewButton.textContent==='Review against latest');
      await button('Review against latest').click();
      const rows=await a.q('.sheet .diff .value').allTextContents();
      assert.deepEqual(rows,changed.map(()=>'51 → 52'),'The review shows the latest LG values');
      await a.focusKey('review-confirm').click();await a.saved();
      const sent=(await a.calls('edit_many')).at(-1).edits;
      assert.deepEqual(sent.map(e=>[e.bank_id,e.settings.brightness,e.expected.brightness]).sort(),changed.map(id=>[id,52,51]).sort(),'Each save expects the reviewed LG value');
      await page.close();
    }
    {
      // Links are offered only where LG uses brightness.
      const {page,a,button}=await fresh();
      await describe(page,b=>{if(b.id==='movie_filmMaker'){b.availability.backlight={state:'unverified',editable:false,reason:'Not verified on this input'};delete b.controls.backlight;}return b;});
      await a.ready();await a.cell('hdmi3','filmMaker').click();await a.ready();
      await a.focusKey('brightness-links').click();
      assert.equal(await a.focusKey('brightness-link:movie_filmMaker').count(),0);
      assert(await a.q('.links').getByText('1 selected preset is not listed',{exact:false}).isVisible());
      // Presets where LG uses brightness still link and unlink.
      await a.focusKey('col:hdmi2').click();await a.ready();
      assert(await a.q('[data-focus^="brightness-link:"]').count()>0);await button('Unlink all shown').waitFor();
      await page.close();
    }
    {
      // Follow Base may clean up an override LG doesn't use; the review says so.
      const {page,a,button}=await fresh();
      await describe(page,b=>{if(b.id==='movie_filmMaker'){b.availability.color={state:'unverified',editable:false,reason:'Not verified on this input'};delete b.controls.color;}return b;});
      await a.focusKey('edit:dark').click();await a.ready();await a.open('color');await a.cell('hdmi3','filmMaker').click();await a.ready();
      await button('Remove override for Color depth').click();await button('Review 1 changes').click();
      assert(await page.getByText('47 → Base: 50',{exact:true}).isVisible());
      assert(await page.getByText(/^Clean-up only: Not verified on this input\. Removing this unused override writes no value to the TV\.$/).isVisible());
      await page.close();
    }
    {
      // A shared value outside what every selected target accepts is shown,
      // never clamped or blanked.
      const {page,a}=await fresh();
      await describe(page,b=>{if(b.id==='movie_filmMaker'){if(b.controls.gamma)b.controls.gamma.options=b.controls.gamma.options.filter(o=>o!==b.settings.gamma);if(b.controls.color)b.controls.color={component:'number',min:0,max:40,step:1};}return b;});
      await a.open('color');await a.cell('hdmi3','filmMaker').click();await a.focusKey('col:hdmi1_pc').click();await a.ready();
      const values=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return [...new Set(e.targetsFor('color').editable.map(r=>r.value))];});
      assert.deepEqual(values,[50]);
      assert.equal(await a.number('color').inputValue(),'50');assert(await a.slider('color').isHidden(),'No slider clamps the stored value');
      assert(await a.q('.valuebox .outside').getByText('The stored value 50 is outside the range every selected target accepts (0–40).',{exact:true}).isVisible());
      await a.open('gamma');await a.ready();
      const gamma=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return [...new Set(e.targetsFor('gamma').editable.map(r=>String(r.value)))];});
      assert.equal(gamma.length,1,'Both targets store one gamma');
      assert.equal(await a.choice('gamma').inputValue(),gamma[0]);
      assert.match(await a.choice('gamma').locator('option:checked').textContent(),/not available for every selected target/);
      assert.equal(await drafts(page),0,'Showing values stages nothing');
      await page.close();
    }
    {
      // The TV sheet compares temporary values with the profile in use.
      const {page,a,button}=await fresh();
      await page.evaluate(async()=>{window.fixture.overrides={movie_filmMaker:{color:60}};await document.querySelector('lg-profile-editor').refresh(true);});
      await button('TV profile & automation').click();
      assert(await a.q('.sheet').getByText(/Picture: 60 \(saved in Dark room: 47\)$/).isVisible());
      await page.close();
    }
    {
      // A refresh response doesn't pull focus back after the user moves on.
      const {page,a,button}=await fresh();
      await page.evaluate(()=>{window.delayGet=true;});
      await button('Refresh').focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');
      const moved=(await a.focused()).key;assert.notEqual(moved,'button:Refresh');
      await page.waitForTimeout(400);assert.equal((await a.focused()).key,moved);
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Stale native drafts, link availability, override clean-up, cleared numbers, out-of-range values, TV saved values and refresh focus passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
