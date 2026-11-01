'use strict';
// Game genres are six saved copies of the same Game Optimizer values. The
// editor works in Standard only: no Game genre setting, no genre chips, no
// genre wording, and other genres' banks (from an older bridge's catalog) are
// ignored, never read or edited. Game rows edit Standard.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
    // An older bridge also lists FPS banks.
    await mountFull(page,{tvRemote:true},data=>{
      const standard=data.catalog.find(b=>b.target.dimension.gameGenre==='Standard'&&b.target.dimension.gameInput==='hdmi3'&&b.target.dimension.dynamicRange==='hdrALLM');
      const target={...standard.target,dimension:{...standard.target.dimension,gameGenre:'FPS'}};
      data.catalog.push({...structuredClone(standard),id:'native_fps',name:'hdmi3 hdrALLM FPS',target});
      data.native.native_fps={target,settings:{...structuredClone(data.native[standard.id]||{settings:{}}).settings,gameColorDepth:65}};
    });
    const a=actions(page),{q}=a;
    await a.setting('backlight').waitFor();await a.ready();
    assert.equal(await a.setting('gameGenre').count(),0,'Game genre is not listed');
    const stored=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');
      return {saved:e.state.document.banks.filter(b=>b.managed_keys&&b.managed_keys.includes('gameGenre')).map(b=>b.settings.gameGenre),
        fps:e.records().filter(r=>r.bank.target.dimension.gameGenre&&r.bank.target.dimension.gameGenre!=='Standard').length};});
    assert(stored.saved.length&&stored.saved.every(v=>v==='Standard'),'Profiles still store each port’s genre as Standard, so the bridge keeps it there: '+JSON.stringify(stored));
    assert.equal(stored.fps,0,'Other genres are ignored');
    for(const alias of ['inputOptimization','blackStabilizer','whiteStabilizer'])assert.equal(await a.setting(alias).count(),1,alias+' is still listed');
    // Contrast across Game presets edits Game Optimizer's Standard value.
    await a.open('contrast');
    await a.target({inputs:['hdmi3'],presets:['hdrGame']});
    const games=await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return [...new Set(e.targetsFor('contrast').editable.filter(r=>r.key!==r.alias).map(r=>r.bank.target.dimension.gameGenre))];});
    assert.deepEqual(games,['Standard'],'Game rows edit the Standard genre');
    assert.equal(await q('[data-focus^="genres:"]').count(),0,'No genre chips');
    assert.equal(await q('legend').getByText('Game Optimizer genres').count(),0);
    assert.match(await q('.game-note').textContent(),/^Edits Game Optimizer’s own Contrast for Game presets\. LG uses it instead of the ordinary Contrast there\.$/);
    const help=await q('.detail-head .help').textContent();
    assert.match(help,/Game Optimizer’s own Contrast\. The Game rows here edit it\./);
    assert.doesNotMatch(help+await q('.valuebox').textContent(),/genre/i,'No genre wording');
    const read=await page.evaluate(()=>window.calls.filter(c=>c.action.startsWith('inspect')).flatMap(c=>c.bank_ids||[c.bank_id]));
    assert(!read.includes('native_fps'),'Other genres are never read');
    assert.deepEqual(errors,[]);
    console.log('Game genres: no Game genre setting or chips, other genres ignored and never read, Game rows edit Standard, no genre wording passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
