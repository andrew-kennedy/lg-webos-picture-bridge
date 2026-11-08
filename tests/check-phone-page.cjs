'use strict';
// On a phone the editor scrolls as one page inside its own box: the host page
// never scrolls (in Home Assistant's app that is pull-to-refresh), the review
// row stays on screen, a setting opens at its top and Back returns to the same
// place in the list. Wider layouts keep their scrolling panes.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
const layout=page=>page.evaluate(()=>{
  const r=document.querySelector('lg-profile-editor').shadowRoot,box=n=>n&&n.getBoundingClientRect(),style=n=>n&&getComputedStyle(n);
  const p=r.querySelector('.page'),body=r.querySelector('.body'),footer=box(r.querySelector('.footer')),head=r.querySelector('.list-head');
  return {document:document.documentElement.scrollHeight,viewport:innerHeight,footerTop:footer.top,footerBottom:footer.bottom,
    paged:p.getClientRects().length>0,pageTop:box(p)?.top,pageBottom:box(p)?.bottom,scroll:p.scrollTop,scrollable:p.scrollHeight>p.clientHeight,
    overflow:style(p).overflowY,overscroll:style(p).overscrollBehaviorY,bodyTop:box(body).top,headTop:head&&box(head).top,mode:p.dataset.mode,
    panes:[...r.querySelectorAll('.list,.detail,.sheet')].filter(n=>n.getClientRects().length).map(n=>[style(n).overflowY,style(n).overscrollBehaviorY])};
});
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    // An iPhone's panel area once Home Assistant's safe-area insets are taken out.
    const page=await browser.newPage({viewport:{width:390,height:751}});page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{});
    const a=actions(page),{q}=a;
    await a.setting('backlight').waitFor();await a.ready();
    let m=await layout(page);
    assert(m.paged&&m.scrollable&&m.overflow==='auto'&&m.overscroll==='contain','One contained page scrolls on a phone');
    assert.deepEqual(m.panes,[['visible','contain']],'The list is part of the page, not a scroller of its own');
    assert.equal(m.document,m.viewport,'The host page never scrolls');
    assert(m.footerBottom<=m.viewport&&m.pageBottom<=m.footerTop+1,'The review row is pinned below the page');
    // Scroll into the list: its header sticks to the top of the page.
    await page.mouse.move(200,500);await page.mouse.wheel(0,900);
    await page.waitForFunction(()=>document.querySelector('lg-profile-editor').shadowRoot.querySelector('.page').scrollTop>=800);
    m=await layout(page);const listScroll=m.scroll;
    assert(Math.abs(m.headTop-m.pageTop)<=1,'The list header sticks');
    assert.equal(m.document,m.viewport);
    // A setting opens at its top; Back returns to the same place in the list.
    const item=a.setting('noiseReduction');await item.scrollIntoViewIfNeeded();const before=(await layout(page)).scroll;
    await item.click();await a.ready();
    m=await layout(page);
    assert(Math.abs(m.bodyTop-m.pageTop)<=1,'The setting starts at the top of the page, got '+(m.bodyTop-m.pageTop));
    assert(m.footerBottom<=m.viewport,'Review row visible with a setting open');
    assert.equal(m.document,m.viewport);
    await q('.pane-back').click();
    m=await layout(page);
    assert.equal(m.scroll,before,'Back returns to the same place in the list');
    assert(listScroll>0);
    assert(await item.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'The opened setting is still in view');
    // Review has its own scroll position; closing it returns to the edit position.
    await a.open('color');await a.number('color').fill('51');
    const edit=(await layout(page)).scroll;
    await page.getByRole('button',{name:/^Review \d+ changes?$/}).click();
    m=await layout(page);
    assert.equal(m.mode,'review');assert.notEqual(m.scroll,edit,'Review does not inherit the edit scroll');
    // It starts at its own top, moved only as far as needed to show its focused Back control.
    assert(await page.evaluate(()=>{const r=document.querySelector('lg-profile-editor').shadowRoot,f=r.activeElement,b=f.getBoundingClientRect(),p=r.querySelector('.page').getBoundingClientRect();return f.dataset.focus==='review-back'&&b.top>=p.top&&b.bottom<=p.bottom;}),'The focused Back control is in view');
    assert(m.footerBottom<=m.viewport);
    await a.focusKey('review-back').click();
    m=await layout(page);
    assert.equal(m.mode,'edit');assert.equal(m.scroll,edit,'Closing review restores the edit position');
    await a.noOverflow(390);
    // Wider layouts keep two scrolling panes and no page scroller.
    await page.setViewportSize({width:1280,height:720});
    m=await layout(page);
    assert(!m.paged,'No page scroller on wide layouts');
    assert.deepEqual(m.panes,[['auto','contain'],['auto','contain']],'The panes scroll and contain their overscroll');
    assert.equal(m.document,720);
    assert.deepEqual(errors,[]);
    console.log('Phone page: one contained scroller, pinned review row, sticky list header, setting opens at top, Back and review keep their place, wide panes unchanged passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
