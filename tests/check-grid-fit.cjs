'use strict';
// TV remotes only scroll vertically, so the target grid must never need
// sideways scrolling at TV sizes. When columns don't fit beside the value
// box, the value box moves above the grid.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    for(const [width,height] of [[1920,1080],[1280,720],[960,540]]) {
      const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
      await mountFull(page,{tvRemote:true,fileTransfer:false});const a=actions(page);
      await a.number('backlight').waitFor();await a.ready();
      for(const [label,allPresets,allInputs] of [['default',false,false],['all presets',true,false],['PC and video',false,true],['both',true,true]]) {
        const r=await page.evaluate(async ([allPresets,allInputs])=>{
          const e=document.querySelector('lg-profile-editor');e.allPresets=allPresets;e.allInputs=allInputs;e.renderPanes();await e.inspect();
          const w=e.shadowRoot.querySelector('.grid-wrap'),main=e.shadowRoot.querySelector('.detail-main');
          return {visible:w.clientWidth,needed:w.scrollWidth,stacked:main.classList.contains('stacked'),columns:e.shadowRoot.querySelectorAll('.colh').length};
        },[allPresets,allInputs]);
        assert(r.needed<=r.visible+1,width+'x'+height+' '+label+': the grid needs '+r.needed+'px but shows '+r.visible+'px');
        if(width===1920&&!allInputs)assert.equal(r.stacked,false,'Four inputs keep the value box beside the grid');
        if(width>=1280&&allInputs)assert.equal(r.stacked,true,width+': eight columns move the value box above the grid');
      }
      // Moving the remote across cells never flips the layout.
      await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');e.allInputs=true;e.renderPanes();});
      await a.focusKey('col:hdmi1').focus();
      for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(()=>document.querySelector('lg-profile-editor').shadowRoot.querySelector('.detail-main').classList.contains('stacked')),width>=1280);
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Grid fit: no sideways scrolling at TV sizes, stacked value box for wide grids, stable while navigating passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
