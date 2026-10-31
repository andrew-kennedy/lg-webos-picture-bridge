'use strict';
// The target grid at G6 scale (548 native groups): one value for chosen
// inputs × presets, exact previews, linked brightness, availability
// exclusions, bounded reads, and remote navigation.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mountFull}=require('./fixtures/full-catalog.cjs');
const {actions}=require('./fixtures/editor-actions.cjs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await mountFull(page,{tvRemote:true,fileTransfer:false});
    const a=actions(page),{q,button}=a,editor=()=>page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return {target:e.target,setting:e.setting,draft:Object.values(e.draft)};});
    await a.number('backlight').waitFor();await a.ready();
    // Opens on what the TV is showing, like the native menu, in Base.
    assert.deepEqual((await editor()).target.inputs,['hdmi4']);assert.deepEqual((await editor()).target.presets,['hdrGame']);
    assert.equal(await a.number('backlight').inputValue(),'100');
    assert(await q('.tv-card').getByText('HDMI 4 · HDR Game · ALLM').isVisible());
    assert(await q('.tv-card').getByText('Using Dark room · Automatic').isVisible());
    assert.equal(await a.focusKey('edit:standard').getAttribute('aria-pressed'),'true');
    assert.match(await a.cell('hdmi4','hdrGame').getAttribute('aria-label'),/on screen/);
    // Reads are batched, bounded and never repeated for the same bank.
    const reads=await a.calls('inspect_many'),ids=reads.flatMap(c=>c.bank_ids);
    assert(reads.every(c=>c.bank_ids.length<=32));assert.equal(new Set(ids).size,ids.length,'No bank is described twice');
    assert(ids.length<300,'Opening reads the visible grid and selection, not all 548 groups ('+ids.length+')');
    // Columns are the inputs actually used; rows are presets in use.
    assert.deepEqual(await q('.colh .colname').allTextContents(),['HDMI 1','HDMI 2','HDMI 3','HDMI 4']);
    assert.match(await a.focusKey('col:hdmi1_pc').textContent(),/PC input/);assert.match(await a.focusKey('col:hdmi3').textContent(),/Apple TV/);
    assert.equal(await a.focusKey('row:expert1').count(),0,'Unused presets wait behind Show more');
    await a.focusKey('grid:all-presets').click();await a.focusKey('row:expert1').waitFor();
    await a.focusKey('grid:all-presets').click();assert.equal(await a.focusKey('row:expert1').count(),0);

    // Story 1: one Black level for SDR Filmmaker on every HDMI input.
    await a.open('brightness');
    await a.cell('hdmi3','filmMaker').click();await a.focusKey('cols:all').click();await a.ready();
    assert.match(await q('.valuebox .for').textContent(),/All inputs · SDR Filmmaker/);
    await a.number('brightness').fill('52');
    let draft=(await editor()).draft;
    assert.deepEqual(draft.map(d=>[d.target.dimension.input,d.target.dimension.pictureMode,d.key]).sort(),[['hdmi1_pc','filmMaker','brightness'],['hdmi2','filmMaker','brightness'],['hdmi3','filmMaker','brightness'],['hdmi4','filmMaker','brightness']]);
    for(const input of ['hdmi1_pc','hdmi2','hdmi3','hdmi4'])assert.match(await a.cell(input,'filmMaker').getAttribute('class'),/drafted/);
    assert(await q('.footer').getByText('4 staged changes → Base').isVisible());
    await button('Review 4 changes').click();
    assert(await page.getByRole('heading',{name:'Review Base changes'}).isVisible());
    assert.equal(await q('.sheet .diff').count(),4);
    await button('Save Base').click();await a.saved();
    const saved=(await a.calls('edit_many')).at(-1);
    assert.equal(saved.edits.length,4);assert(saved.edits.every(e=>e.variant==='standard'&&e.settings.brightness===52));
    assert(saved.edits.filter(e=>e.bank_id.startsWith('native_')).every(e=>e.expected&&e.expected.brightness===50),'Native-only edits carry the reviewed value');

    // Story 2: Color depth for all Dolby Vision presets on all inputs. Game
    // presets use Game Optimizer's own value; the ordinary one is skipped.
    await a.open('color');
    await a.cell('hdmi4','dolbyHdrCinema').click();await a.focusKey('group:dolbyHdr').click();await a.focusKey('cols:all').click();await a.ready();
    assert.equal(await a.focusKey('group:dolbyHdr').getAttribute('aria-pressed'),'true');
    assert.match(await q('.valuebox .for').textContent(),/All inputs · all Dolby Vision presets in use/);
    assert.equal(await a.number('color').inputValue(),'','Different genre values show Mixed');
    assert(await q('.valuebox').getByText(/values are skipped/).isVisible());
    await a.number('color').fill('50');
    draft=(await editor()).draft;
    assert(draft.length>0&&draft.every(d=>(d.target.dimension.pictureMode||d.target.dimension.dynamicRange).startsWith('dolbyHdr')),'Only Dolby Vision targets are staged');
    assert(draft.every(d=>d.key!=='color'||!/game$/i.test(d.target.dimension.pictureMode)),'Disabled ordinary color in DV Game is never staged');
    await button('Review '+draft.length+' changes').click();
    assert(await page.getByRole('heading',{name:'Excluded from these edits'}).isVisible());
    assert(await page.getByText('Game Optimizer replaces this control in Game presets.',{exact:false}).first().isVisible());
    await button('Back to editing').click();
    // Story 3: narrow the same edit to HDMI 3 and HDMI 4.
    await a.focusKey('col:hdmi1_pc').click();await a.focusKey('col:hdmi2').click();await a.ready();
    assert.match(await q('.valuebox .for').textContent(),/^Set for HDMI 3, HDMI 4 · all Dolby Vision/);
    await a.number('color').fill('49');
    draft=(await editor()).draft;
    const latest=draft.filter(d=>d.value===49);
    assert(latest.length&&latest.every(d=>['hdmi3','hdmi4'].includes((d.target.dimension.input||d.target.dimension.gameInput).replace(/_pc$/,''))));
    assert(draft.some(d=>d.value===50&&(d.target.dimension.input||d.target.dimension.gameInput)==='hdmi2'),'Earlier drafts outside the new selection are kept');
    await button('Discard edits').click();assert.equal((await editor()).draft.length,0);

    // Linked SDR gaming brightness: selecting one shows every partner it changes.
    await a.open('backlight');await a.cell('hdmi1_pc','game').click();await a.ready();
    for(const input of ['hdmi3','hdmi4'])assert.match(await a.cell(input,'game').getAttribute('class'),/\balso\b/);
    assert(await q('.valuebox').getByText(/also changes 2 linked targets/).isVisible());
    await a.number('backlight').fill('75');
    await button('Review 1 changes').click();
    assert.equal(await q('.sheet .targets li').count(),3,'Shared brightness previews every linked preset');
    await button('Back to editing').click();await button('Discard edits').click();

    // PC and video banks are separate inputs; port-wide settings use ports.
    await a.focusKey('grid:all-inputs').click();await a.focusKey('col:hdmi1').waitFor();
    assert.deepEqual(await q('.colh .colname').allTextContents(),['HDMI 1','HDMI 1','HDMI 2','HDMI 2','HDMI 3','HDMI 3','HDMI 4','HDMI 4']);
    await a.focusKey('grid:all-inputs').click();
    await a.open('enableQFT');assert.equal(await q('.colh').count(),4);assert(await a.focusKey('cols:all').getByText('All ports').isVisible());

    // Remote: 2D movement inside the grid; OK selects a target.
    await a.open('contrast');
    await a.cell('hdmi3','filmMaker').focus();
    await page.keyboard.press('ArrowRight');assert.equal((await a.focused()).key,'cell:hdmi4:filmMaker');
    await page.keyboard.press('ArrowUp');assert.match((await a.focused()).key,/^cell:hdmi4:/);
    await page.keyboard.press('Enter');
    const picked=(await a.focused()).key.split(':')[2];assert.deepEqual((await editor()).target.presets,[picked]);
    await a.reach('row:'+picked);await page.keyboard.press('ArrowLeft');assert.match((await a.focused()).key,/^setting:/,'Left from the grid returns to the settings list');
    await a.reach('value:contrast:number');await page.keyboard.press('Enter');await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
    const remoteDraft=(await editor()).draft;
    assert(remoteDraft.length>=1&&remoteDraft.every(d=>(d.target.dimension.input||d.target.dimension.gameInput)==='hdmi4'),'Remote adjusts the selected target only');
    assert.equal(remoteDraft.length,await page.evaluate(()=>{const e=document.querySelector('lg-profile-editor');return new Set(e.targetsFor('contrast').editable.map(r=>e.entryId(r))).size;}));
    await a.reach('review');await page.keyboard.press('Enter');await a.reach('review-confirm');await page.keyboard.press('Enter');await a.saved();

    // A profile tab changes the destination colour, text and markers.
    await a.focusKey('edit:dark').click();await a.open('color');await a.cell('hdmi3','filmMaker').click();await a.ready();
    assert.match(await q('.frame').getAttribute('class'),/profile/);
    assert(await q('.edit-card').getByText('Changes save as Dark room overrides. The rest follows Base.').isVisible());
    assert.match(await a.cell('hdmi3','filmMaker').getAttribute('aria-label'),/override in Dark room/);
    assert.equal(await a.number('color').inputValue(),'47');
    for(const [width,height] of [[1920,1080],[1280,720],[390,844],[320,640]]) {
      await page.setViewportSize({width,height});await a.noOverflow(width);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),height,'Only the editor panes scroll');
      await page.screenshot({path:'/tmp/lg-target-grid-'+width+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Target grid: on-screen default, bounded reads, all-inputs/all-Dolby-Vision/some-ports edits, exclusions, linked brightness, input types, remote grid navigation, profile destination and responsive layout passed.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
