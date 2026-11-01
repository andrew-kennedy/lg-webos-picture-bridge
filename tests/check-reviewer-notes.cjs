'use strict';
// Reviewer notes are reference text only: a box on each covered setting and a
// full Reviewer settings page, reachable and scrollable with the TV remote.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    // The TV app, driven by the remote.
    let page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,tvApp:true,fileTransfer:false});
    let a=actions(page),{q}=a;
    await a.number('backlight').waitFor();await a.ready();
    const calls=(await page.evaluate(()=>window.calls.length));
    await a.open('contrast');
    const box=q('.reviewer');
    assert.match(await box.textContent(),/RTINGS\s*SDR Filmmaker 95 · HDR Filmmaker 100/,'Contrast shows RTINGS’ values');
    await a.open('backlight');
    assert.match(await q('.reviewer').textContent(),/HDTVTestSDR in a dim room: mid-20s/,'OLED pixel brightness shows both reviewers');
    await a.open('color');
    assert.match(await q('.reviewer').textContent(),/RTINGSLeft at the FILMMAKER default/,'Settings RTINGS leaves at default say so');
    assert(await q('.detail-head .help').getByText('Game Optimizer’s own Color Depth',{exact:false}).isVisible(),'Color depth explains the Game Optimizer value');
    await a.open('gameGenre');
    assert.equal(await q('.reviewer').count(),0,'Settings neither reviewer covers have no box');
    await a.open('hdrDynamicToneMapping');
    await a.focusKey('open-reviews:hdrDynamicToneMapping').focus();await page.keyboard.press('Enter');
    const sheet=q('.sheet');
    assert.equal(await sheet.locator('h3').textContent(),'Reviewer settings');
    assert.deepEqual(await sheet.locator('.section h4').allTextContents(),['SDR movies','HDR movies','Dolby Vision','Motion','Processing','Gaming','Sources']);
    assert.equal(await sheet.locator('a').count(),0,'The TV app shows addresses, not links it cannot open');
    assert(await sheet.getByText('https://www.rtings.com/tv/reviews/lg/g6-oled/settings',{exact:true}).isVisible());
    assert(await sheet.getByText('white balance',{exact:false}).count(),'Says which unit-specific values were left out');
    assert(await sheet.getByText('Neither RTINGS nor HDTVTest publishes Dolby Vision picture values',{exact:false}).isVisible(),'Dolby Vision says what the sources do not give');
    // The arrows walk note by note down to the sources at the bottom.
    await a.reach('reviews:source:hdtvtestPs5');
    const scroll=await page.evaluate(()=>{const root=document.querySelector('lg-profile-editor').shadowRoot,s=root.querySelector('.sheet'),last=root.querySelector('[data-focus="reviews:source:hdtvtestPs5"]').getBoundingClientRect(),box=s.getBoundingClientRect();
      return {top:s.scrollTop,visible:last.top>=box.top&&last.bottom<=box.bottom+1,rest:s.scrollHeight-s.clientHeight-s.scrollTop};});
    assert(scroll.top>0&&scroll.visible&&scroll.rest<40,'The remote scrolls the page to its end: '+JSON.stringify(scroll));
    await page.keyboard.press('Escape');
    assert.equal((await a.focused()).key,'open-reviews:hdrDynamicToneMapping','Back returns to the setting');
    await a.focusKey('open-reviews').click();await page.keyboard.press('Escape');
    assert.equal((await a.focused()).key,'open-reviews','Back returns to the header button');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>!['inspect_many','status','state'].includes(c.action)).length),
      await page.evaluate(n=>window.calls.slice(0,n).filter(c=>!['inspect_many','status','state'].includes(c.action)).length,calls),'Notes send nothing to the TV');
    for(const width of [1280,960]){await page.setViewportSize({width,height:width*9/16});await a.focusKey('open-reviews').click();await a.noOverflow(width);await page.keyboard.press('Escape');await a.noOverflow(width);}
    await page.close();

    // The Home Assistant panel: real links, no extra focus stops.
    page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{});
    a=actions(page);({q}=a);
    await a.setting('backlight').waitFor();await a.ready();
    await a.focusKey('open-reviews').click();
    const links=await q('.sheet a').evaluateAll(n=>n.map(a=>[a.href,a.target,a.rel]));
    assert.equal(links.length,4);
    assert(links.every(([href,target,rel])=>href.startsWith('https://')&&target==='_blank'&&rel.includes('noopener')));
    assert.equal(await q('.review-note[tabindex]').count(),0);
    await a.noOverflow(390);
    assert.deepEqual(errors,[]);
    console.log('Reviewer notes: setting boxes, full page, remote scrolling, Back focus, links in Home Assistant and no overflow passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
