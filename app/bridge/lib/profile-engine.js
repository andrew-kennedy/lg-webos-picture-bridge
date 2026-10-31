'use strict';

const crypto = require('crypto');
const fs = require('fs');
const model = require('./profile-model');
const banks = require('./profile-banks');
const disk = require('./profile-store');
const availability = require('./profile-availability');
const view = require('../../profile-view');
const catalog = require('./profile-catalog');
const nativeState = require('./profile-native-state');

function create(options) {
  const store = options.store || disk.create(), clock = options.now || Date.now;
  const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
  const instance = crypto.randomBytes(16).toString('hex');
  let boot = options.bootId;
  if (!boot) { try { boot = fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(); } catch (_) { boot = null; } }
  let saved = null, journal = {dirty:{},restore:{},boot_id:boot,power:null,environment:null,revision:0};
  let overrides = {}, context = {}, observations = {}, versions = {}, own = {}, recovery = true;
  let power = null, powerEpoch = 0, room = 'dark', loadError = null, lastError = null, changedCount = 0;
  let tail = Promise.resolve(), pending = 0, timer = null, stopped = false, applying = false, sequence = 0;
  let latestBackup = null, acknowledged = null, listeners = new Set(), backupListeners = new Set();
  let latestObservations = [];
  let recoveryTimer = null, retryDelay = 5000;
  let captureTimer = null, nativeError = null;
  let catalogueReady=false;
  const browser = nativeState.create({document,now:clock,index:options.nativeDescriptions,read:command=>native(command)});
  const defaults = {movie_bright:100,movie_dark:3,game_sdr:80};
  try {
    saved = store.read('profiles');
    if (saved) {
      saved.document = model.validate(saved.document);
      if(saved.document.schema===1)saved.preferences = model.preferences(saved.preferences);
      if (saved.schema !== 1 || typeof saved.owner_id !== 'string' || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || typeof saved.enabled !== 'boolean') throw new Error('Invalid profile storage');
      journal = Object.assign(journal,store.read('profile-session') || {});
      validateScopes(journal.dirty); validateScopes(journal.restore);
      if(journal.native)for(const entry of journal.native)banks.normalize({action:'apply',banks:[entry]});
      if (journal.revision !== saved.revision) journal.restore = allKeys();
      if (journal.power === 'off' || (boot && journal.boot_id && boot !== journal.boot_id)) mergeScopes(journal.restore,journal.dirty);
      room = journal.room || (journal.environment && journal.environment.room) || 'dark';
      if(!['bright','dark'].includes(room))throw new Error('Invalid saved room');
      if(saved.document.schema===1||selection()!=='automatic'&&!catalog.valid(saved.document,selection()))journal.selection='automatic';
    }
  } catch (error) { loadError = 'Profile recovery required: ' + error.message; }

  function document() { return saved && saved.document; }
  function preferences(candidate=saved) { return candidate ? candidate.document.schema===2?catalog.preferences(candidate.document):candidate.preferences : defaults; }
  function selection() { return journal.selection||'automatic'; }
  function activeProfile(candidate=saved) {
    if(!candidate||candidate.document.schema!==2)return room;
    return selection()!=='automatic'&&catalog.valid(candidate.document,selection())?selection():candidate.document.automatic[room];
  }
  function resolved(bank,variant=activeProfile(),candidate=saved,adjustments) {
    return candidate.document.schema===2?Object.assign(view.values(bank,candidate,variant),adjustments||{}):model.desired(bank,variant,preferences(candidate),adjustments);
  }
  function allKeys() { return Object.fromEntries(document().banks.map(b => [b.id,Object.keys(b.settings)])); }
  function bankById(id) { const b = document() && document().banks.find(b => b.id === id); if (!b) throw new Error('Unknown native bank'); return b; }
  function validateScopes(scopes, collection = document()) {
    if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes)) throw new Error('Invalid recovery journal');
    for (const [id,keys] of Object.entries(scopes)) {
      const bank = collection.banks.find(b => b.id === id);
      if (!bank || !Array.isArray(keys) || keys.length > 40 || keys.some(k => !Object.hasOwn(bank.settings,k))) throw new Error('Invalid recovery scope');
    }
  }
  function mergeScopes(target, source) {
    for (const [id,keys] of Object.entries(source)) target[id] = [...new Set((target[id] || []).concat(keys))];
  }
  function environment() { return document().schema===2?{profile:activeProfile(),brightness:view.brightness(document(),activeProfile())}:{room,preferences:model.clone(preferences())}; }
  function writeJournal() {
    if (!saved) return;
    journal.boot_id = boot; journal.revision = saved.revision; journal.room=room;
    store.write('profile-session',journal);
  }
  function dirtyScopes() {
    const scopes = {};
    for (const [id,values] of Object.entries(overrides)) if (Object.keys(values).length) scopes[id] = Object.keys(values).sort();
    return scopes;
  }
  function syncDirty() {
    const next = dirtyScopes();
    if (model.canonical(next) !== model.canonical(journal.dirty)) { journal.dirty = next; writeJournal(); return true; }
    return false;
  }
  function snapshot(complete = false) {
    return {schema:1,owner_id:saved && saved.owner_id,instance_id:instance,sequence,revision:saved ? saved.revision : 0,
      document:model.clone(document()),preferences:model.clone(preferences()),enabled:!!(saved && saved.enabled),
      room,selection:selection(),active_profile:activeProfile(),environment:model.clone(journal.environment),overrides:model.clone(overrides),
      recovery:{dirty:model.clone(journal.dirty),restore:model.clone(journal.restore),boot_id:boot,power,reconstructing:recovery},
      migration_id:saved && saved.migration_id || null,context:model.clone(context),created_at:new Date(clock()).toISOString(),
      ...(complete?{native_snapshot:browser.backup()}:{}),storage_mode:'native'};
  }
  function status() {
    return {configured:!!saved,editor_api:9,profile_schema:document()&&document().schema,selection:selection(),active_profile:activeProfile(),owner_id:saved && saved.owner_id,instance_id:instance,revision:saved ? saved.revision : 0,
      enabled:!!(saved && saved.enabled),room,power,context,temporary_count:Object.values(overrides).reduce((n,v) => n + Object.keys(v).length,0),
      pending_restore:Object.keys(journal.restore).length > 0||!!(journal.native&&journal.native.length),applying,changed_count:changedCount,native_backup_error:nativeError,native_backup_complete:!!browser.captured(),
      error:loadError || lastError,backup_sequence:latestBackup ? sequence : null,backup_acknowledged:acknowledged,
      active_devices:document() ? [...new Set(document().banks.filter(b =>
        (Object.hasOwn(b.target.dimension,'pictureMode') || Object.hasOwn(b.target.dimension,'dynamicRange')) &&
        model.active(b,context)).flatMap(b => b.devices || []))].map(d => document().devices[d]) : []};
  }
  function notify() { for (const fn of listeners) fn(status()); }
  function publishBackup() {
    cancel(timer); timer = null;
    if (!saved || loadError) return null;
    sequence++;
    latestBackup = model.backup(snapshot(true));
    for (const fn of backupListeners) fn(latestBackup);
    notify(); return latestBackup;
  }
  function changed(immediate = false) {
    notify();
    if (immediate) publishBackup();
    else if (!timer) timer = later(publishBackup,500);
  }
  function guard() {
    if (stopped || loadError || power !== 'on') throw new Error(loadError || 'TV must be on for native bank operations');
  }
  function native(command, extraGuard = () => {}) {
    const epoch = powerEpoch;
    return new Promise((resolve,reject) => {
      const check = () => { guard(); if (powerEpoch !== epoch) throw new Error('TV power session changed'); extraGuard(); };
      const run = done => banks.run(options.service,banks.normalize(command),check,() => context).then(v => done(null,v),done);
      if (options.runBanks) options.runBanks(command,check,() => context).then(resolve,reject);
      else if (options.enqueue) options.enqueue(run,(e,v) => e ? reject(e) : resolve(v));
      else run((e,v) => e ? reject(e) : resolve(v));
    }).then(result=>{
      for(const item of result.banks||[]) {
        const bank=command.banks.find(b=>b.id===item.id);
        if(bank&&item.settings)browser.remember(bank.target,item.settings);
      }
      return result;
    });
  }
  function serial(run) {
    if (pending >= 16) return Promise.reject(new Error('Profile manager is busy'));
    pending++;
    const result = tail.then(() => { if (stopped) throw new Error('Profile manager stopped'); return run(); });
    tail = result.catch(() => {}).finally(() => { pending--; });
    return result;
  }
  function queueSync() {
    return serial(reconcile).catch(error => { lastError = error.message; changed(); });
  }
  function queueCapture() {
    cancel(captureTimer);
    // Allow startup restoration to finish first. This is power-event work,
    // never polling, and the full snapshot is kept in RAM only.
    captureTimer=later(()=>{captureTimer=null;serial(async()=>{
      if(!saved||power!=='on')return;
      const epoch=powerEpoch;
      try {await browser.capture(()=>{guard();if(epoch!==powerEpoch)throw new Error('TV power session changed');});catalogueReady=true;nativeError=null;changed(true);}
      catch(error){nativeError=error.message;notify();}
    }).catch(()=>{});},1500);
  }
  function selected(scope) {
    if (!document()) throw new Error('Import a profile collection first');
    if (scope === 'all') return document().banks;
    if (scope === 'active') {
      if (!context.ready) throw new Error('No confirmed active HDMI picture');
      return document().banks.filter(b => model.active(b,context));
    }
    return [bankById(scope)];
  }
  function selectedKeys(input, fallback) {
    if (!Object.hasOwn(input,'selection')) return Object.fromEntries(selected(input.scope || fallback).map(b=>[b.id,Object.keys(b.settings)]));
    validateScopes(input.selection);
    if (!Object.keys(input.selection).length || Object.values(input.selection).some(keys=>!keys.length || new Set(keys).size!==keys.length)) throw new Error('Choose explicit settings to change');
    return model.clone(input.selection);
  }
  function observe(items) {
    latestObservations = items || [];
    let nativeChanged=false;
    for(const item of items||[]) {
      if(!item.target||!Number.isFinite(Date.parse(item.observed_at)))continue;
      try {model.observedValue(item.key,item.value,item.target);nativeChanged=browser.remember(item.target,{[item.key]:item.value},Date.parse(item.observed_at))||nativeChanged;}catch(_){}
    }
    if(nativeChanged)changed();
    if (!saved || !saved.enabled || loadError || recovery) return;
    let modified = false, restoreModified = false;
    for (const item of items || []) {
      const bank = document().banks.find(b => model.canonical(b.target) === model.canonical(item.target) && Object.hasOwn(b.settings,item.key));
      const stamp = Date.parse(item.observed_at), k = item.key;
      if (!bank || !Number.isFinite(stamp)) continue;
      try { model.observedValue(k,item.value,bank.target); } catch (_) { continue; }
      const id = bank.id + '/' + k, old = observations[id];
      if (old && stamp < old.stamp) continue;
      observations[id] = {stamp,value:model.clone(item.value)};
      if (old && model.same(old.value,item.value)) continue;
      const writing = own[id];
      if (writing && ((model.same(item.value,writing.after) && (versions[id] || 0) === writing.version) ||
          (!old && model.same(item.value,writing.before)))) continue;
      let standard = model.same(item.value,resolved(bank)[k]);
      const env = journal.environment;
      if (env && model.environmentKeys(bank).includes(k)) {
        const previous=env.profile?{...bank.settings,...(bank.variants||{})[env.profile]}:model.desired(bank,env.room,env.preferences);
        if(env.profile&&bank.brightness_role)previous.backlight=env.brightness[bank.brightness_role];
        standard=standard||model.same(item.value,previous[k]);
      }
      const values = overrides[bank.id] || {}, prior = values[k];
      if ((standard && Object.hasOwn(values,k)) || (!standard && !model.same(prior,item.value))) {
        if (standard) delete values[k]; else values[k] = model.clone(item.value);
        if (Object.keys(values).length) overrides[bank.id] = values; else delete overrides[bank.id];
        versions[id] = (versions[id] || 0) + 1; modified = true;
        if (power === 'on' && (journal.restore[bank.id] || []).includes(k)) {
          journal.restore[bank.id] = journal.restore[bank.id].filter(v => v !== k);
          if (!journal.restore[bank.id].length) delete journal.restore[bank.id];
          restoreModified = true;
        }
      } else if (old) versions[id] = (versions[id] || 0) + 1;
      if (k === 'gameGenre') context.gameGenre = item.value;
    }
    if (modified) {
      // Only dirty key membership reaches flash. Holding a slider rewrites no file.
      const wrote = syncDirty();
      // A newer manual edit wins over an older queued restore. Its own dirty
      // scope still restores on the next power cycle.
      if (restoreModified && !wrote) writeJournal();
      if (power === 'off') { mergeScopes(journal.restore,journal.dirty); writeJournal(); }
      changed();
    }
  }
  async function recover() {
    if (!recovery || !saved) return;
    // Reconstruct temporary values after a service restart from the small durable
    // key journal. Do not mistake a process restart for a power cycle.
    const recovered = {};
    for (const [id,keys] of Object.entries(journal.dirty)) {
      if (!keys.length) continue;
      const bank = bankById(id);
      const result = await native({action:'read',banks:[{id,target:bank.target,keys}]});
      recovered[id] = Object.fromEntries(keys.map(k => [k,result.banks[0].settings[k]]));
    }
    overrides = recovered; recovery = false;
  }
  async function applyBank(bank, keys, force) {
    if (!keys.length) return 0;
    const id = bank.id, before = (await native({action:'read',banks:[{id,target:bank.target,keys}]})).banks[0].settings;
    const values = resolved(bank,activeProfile(),saved,force ? {} : overrides[id]), patch = {}, expected = {}, marks = {};
    for (const k of keys) {
      const identity = id + '/' + k;
      marks[k] = versions[identity] || 0;
      if (!model.same(before[k],values[k])) { patch[k] = values[k]; expected[k] = before[k]; }
    }
    let result = {settings:before,changed:[]};
    try {
      for (const k of Object.keys(patch)) own[id + '/' + k] = {before:before[k],after:patch[k],version:marks[k]};
      if (Object.keys(patch).length) result = (await native({action:'apply',banks:[{id,target:bank.target,settings:patch,expected}]},() => {
        for (const k of Object.keys(patch)) if ((versions[id + '/' + k] || 0) !== marks[k]) throw new Error('Setting changed during profile restoration');
      })).banks[0];
      for (const k of keys) {
        const identity = id + '/' + k;
        if ((versions[identity] || 0) !== marks[k]) continue;
        observations[identity] = {stamp:clock(),value:model.clone(Object.hasOwn(result.settings,k) ? result.settings[k] : before[k])};
        if (force && overrides[id]) delete overrides[id][k];
        if (journal.restore[id]) journal.restore[id] = journal.restore[id].filter(v => v !== k);
      }
      if (overrides[id] && !Object.keys(overrides[id]).length) delete overrides[id];
      if (journal.restore[id] && !journal.restore[id].length) delete journal.restore[id];
      return result.changed.length;
    } finally { for (const k of Object.keys(patch)) delete own[id + '/' + k]; }
  }
  async function reconcile() {
    if (!saved || power !== 'on' || loadError || !saved.enabled&&!(journal.native&&journal.native.length)) return status();
    applying = true; changedCount = 0; notify();
    try {
      await applyNativePending();
      if(!saved.enabled)return status();
      await recover();
      const envChanged = model.canonical(journal.environment) !== model.canonical(environment());
      for (const bank of document().banks) {
        const forced = journal.restore[bank.id] || [];
        if (forced.length) { changedCount += await applyBank(bank,forced,true); journal.dirty = dirtyScopes(); writeJournal(); }
        const keys = envChanged ? model.environmentKeys(bank).filter(k => !forced.includes(k) && !Object.hasOwn(overrides[bank.id] || {},k)) : [];
        if (keys.length) changedCount += await applyBank(bank,keys,false);
      }
      const env = environment();
      if (model.canonical(journal.environment) !== model.canonical(env)) { journal.environment = env; writeJournal(); }
      lastError = null;
      cancel(recoveryTimer); recoveryTimer = null; retryDelay = 5000;
      return status();
    } catch (error) {
      lastError = error.message;
      if (!recoveryTimer && power === 'on' && !stopped) {
        recoveryTimer = later(() => { recoveryTimer = null; queueSync(); },retryDelay);
        retryDelay = Math.min(retryDelay * 2,300000);
      }
      throw error;
    }
    finally { applying = false; observe(latestObservations); changed(); }
  }
  function setPower(value) {
    if (!['on','off'].includes(value) || power === value) return;
    const previous = power; power = value; powerEpoch++;
    if (value === 'off') { cancel(recoveryTimer); recoveryTimer = null; cancel(captureTimer);captureTimer=null; }
    if (value === 'off') mergeScopes(journal.restore,journal.dirty);
    if (saved && (journal.power !== value || previous === 'off')) { journal.power = value; writeJournal(); }
    changed(true);
    if (value === 'on') {queueSync();queueCapture();}
  }
  function checkRevision(command) {
    if (!saved || command.revision !== saved.revision) throw new Error('Profiles changed; refresh before saving');
  }
  function persistStandards() {
    if(saved.document.schema===2)delete saved.preferences;
    saved.revision++;
    try { store.write('profiles',saved); writeJournal(); }
    catch (error) { loadError = 'Profile storage failed; recover before continuing: ' + error.message; notify(); throw error; }
    changed(true);
  }
  function commitCandidate(candidate) {
    const affected={};
    for(const bank of candidate.document.banks) {
      const old=document().banks.find(b=>b.id===bank.id);
      const before=old?resolved(old):{},after=resolved(bank,activeProfile(candidate),candidate);
      const keys=Object.keys(after).filter(k=>!model.same(before[k],after[k]));
      if(keys.length)affected[bank.id]=keys;
    }
    saved=candidate;
    if(selection()!=='automatic'&&!catalog.valid(document(),selection()))journal.selection='automatic';
    for(const [id,keys] of Object.entries(affected))for(const key of keys)if(overrides[id])delete overrides[id][key];
    mergeScopes(journal.restore,affected);journal.dirty=dirtyScopes();persistStandards();
    queueSync();return status();
  }
  function editorOptions(variant = 'standard', candidate = saved) {
    if (candidate&&!catalog.valid(candidate.document,variant)) throw new Error('Unknown profile');
    return {document:candidate && browser.browser(candidate.document),context,
      reviewed:options.availabilityReviewed,
      values:bank => {
        if(candidate&&candidate.document.schema===2)return resolved(bank,variant,candidate);
        const value = {...bank.settings,...(variant === 'standard' ? {} : (bank.variants || {})[variant] || {})};
        if (bank.brightness_role && candidate) value.backlight = candidate.preferences[
          bank.brightness_role === 'game_sdr' ? 'game_sdr' : 'movie_' + (variant === 'standard' ? room : variant)];
        return value;
      }};
  }
  async function inspect(bank, variant = 'standard', readCache) {
    guard();
    if (options.inspect) return options.inspect(bank);
    return new Promise((resolve,reject) => {
      const epoch = powerEpoch;
      const check = () => { guard(); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
      const run = done => banks.inspect(options.service,bank,check,() => context,{...editorOptions(variant),readCache}).then(v => done(null,v),done);
      if (options.enqueue) options.enqueue(run,(e,v) => e ? reject(e) : resolve(v)); else run((e,v) => e ? reject(e) : resolve(v));
    });
  }
  async function inspectNative(id,variant='standard',readCache=new Map()) {
    const [bank]=await browser.prepare([id],readCache);
    const result=await inspect(bank,variant,readCache);
    browser.remember(bank.target,result.settings);
    return {bank,result};
  }
  async function applyNativePending() {
    if(!journal.native||!journal.native.length)return;
    const conflicts=[];
    for(const entry of journal.native) {
      const keys=Object.keys(entry.settings),actual=(await native({action:'read',banks:[{id:entry.id,target:entry.target,keys}]})).banks[0].settings;
      const settings={},expected={};
      for(const key of keys) {
        if(model.same(actual[key],entry.settings[key]))continue;
        if(!model.same(actual[key],entry.expected[key])) {conflicts.push(entry.id+'/'+key);delete entry.settings[key];delete entry.expected[key];continue;}
        settings[key]=entry.settings[key];expected[key]=actual[key];
      }
      if(Object.keys(settings).length)await native({action:'apply',banks:[{id:entry.id,target:entry.target,settings,expected}]});
    }
    delete journal.native;writeJournal();changed(true);
    if(conflicts.length)throw new Error('Native values changed after review; newer values were preserved. Refresh and review again: '+conflicts.join(', '));
  }
  async function validateSharedBrightness(candidate, patch, inspected, check) {
    if(candidate.document.schema===2) {
      for(const bank of candidate.document.banks.filter(b=>b.brightness_role))for(const variant of ['standard',...catalog.ids(candidate.document)]) {
        const value=resolved(bank,variant,candidate).backlight;
        if(model.same(value,resolved(bankById(bank.id),variant).backlight))continue;
        if(!inspected.has(bank.id))inspected.set(bank.id,await inspect(bankById(bank.id)));
        check();availability.assertEditable('backlight',value,bank,inspected.get(bank.id),editorOptions(variant,candidate));
      }
      return;
    }
    for (const bank of candidate.document.banks.filter(b=>b.brightness_role)) {
      const roles = bank.brightness_role === 'game_sdr' ? ['game_sdr'] : ['movie_bright','movie_dark'];
      for (const role of roles.filter(r=>Object.hasOwn(patch,r))) {
        if (!inspected.has(bank.id)) inspected.set(bank.id,await inspect(bankById(bank.id)));
        check();
        availability.assertEditable('backlight',candidate.preferences[role],bank,inspected.get(bank.id),
          editorOptions(role === 'game_sdr' ? 'standard' : role.slice(6),candidate));
      }
    }
  }
  function encodeStandard(key, value, live, bank) {
    return banks.encode(key,value,live.settings[key],banks.encodingDescription(key,bank,
      (live.descriptions || []).find(d=>d.key===key),(live.factory_descriptions || {})[key],options.availabilityReviewed),bank);
  }
  async function initialize(command) {
    if (saved) {
      if (command.migration_id && command.migration_id === saved.migration_id) return status();
      throw new Error('TV already owns a profile collection; use an explicit import');
    }
    if (loadError) throw new Error(loadError);
    const doc = model.validate(command.document), prefs = model.preferences(command.preferences || defaults);
    const initial = model.scopedValues(doc,command.overrides || {});
    validateScopes(command.restore || {},doc);
    if (command.migration_id !== undefined && (typeof command.migration_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(command.migration_id))) throw new Error('Invalid migration identity');
    if (!command.migration_id) {
      for (const bank of doc.banks) {
        const live = await inspect(bank);
        for (const values of [bank.settings,...Object.values(bank.variants || {})])
          for (const [k,v] of Object.entries(values)) encodeStandard(k,v,live,bank);
      }
    }
    saved = {schema:1,owner_id:crypto.randomBytes(16).toString('hex'),revision:1,document:doc,preferences:prefs,
      enabled:command.enabled === true,migration_id:typeof command.migration_id === 'string' ? command.migration_id.slice(0,128) : null};
    overrides = initial; recovery = false;
    room = ['bright','dark'].includes(command.room) ? command.room : room;
    journal = {dirty:dirtyScopes(),restore:command.migration_id ? command.restore || {} : allKeys(),boot_id:boot,power,revision:1,environment:null};
    validateScopes(journal.restore);
    if (command.pending_restore || power === 'off') mergeScopes(journal.restore,journal.dirty);
    if(saved.document.schema===2)delete saved.preferences;
    store.write('profiles',saved); writeJournal(); changed(true);
    await reconcile(); return status();
  }
  async function command(input, externalGuard = () => {}) {
    if (!input || typeof input !== 'object' || typeof input.action !== 'string' || JSON.stringify(input).length > 900000) throw new Error('Invalid profile command');
    return serial(async () => {
      externalGuard();
      if(saved&&document().schema===2&&input.action==='edit')input={action:'edit_many',revision:input.revision,edits:[{bank_id:input.bank_id,variant:input.variant,settings:input.settings,expected:input.expected}]};
      if (input.action === 'get') {
        if(saved&&power==='on')try{await browser.load();catalogueReady=true;}catch(error){nativeError=error.message;}
        return {state:snapshot(),status:status(),...(catalogueReady?{catalog:browser.metadata()}: {})};
      }
      if (input.action === 'backup') return publishBackup();
      if (input.action === 'capture_native') {
        guard();if(!saved)throw new Error('Import a profile collection first');
        const epoch=powerEpoch;
        await browser.capture(()=>{externalGuard();guard();if(epoch!==powerEpoch)throw new Error('TV power session changed');});
        catalogueReady=true;nativeError=null;publishBackup();return status();
      }
      if (input.action === 'initialize') return initialize(input);
      if (input.action === 'restore_backup') {
        const backup = model.decodeBackup(input.backup);
        if (saved) checkRevision(input);
        const doc = model.validate(backup.document);
        const nativeRestore=[],epoch=powerEpoch;
        if(backup.native_snapshot) {
          guard();
          // A full restore is a bounded, transient intent. Native-only values
          // never become permanent profile standards after restoration.
          for(const bank of backup.native_snapshot.document.banks) {
            const managed=doc.banks.find(b=>model.canonical(b.target)===model.canonical(bank.target));
            const keys=Object.keys(bank.settings).filter(k=>!managed||!Object.hasOwn(managed.settings,k));
            if(!keys.length)continue;
            const actual=(await native({action:'read',banks:[{id:bank.id,target:bank.target,keys}]})).banks[0].settings;
            externalGuard();guard();if(epoch!==powerEpoch)throw new Error('TV power session changed');if(saved)checkRevision(input);
            const settings=Object.fromEntries(keys.filter(k=>!model.same(actual[k],bank.settings[k])).map(k=>[k,bank.settings[k]]));
            if(Object.keys(settings).length)nativeRestore.push({id:bank.id,target:bank.target,settings,expected:Object.fromEntries(Object.keys(settings).map(k=>[k,actual[k]]))});
          }
        }
        // Commit only after every read succeeds. Historical temporary values
        // never get silently applied as the new session's preferences.
        saved = {schema:1,owner_id:saved ? saved.owner_id : crypto.randomBytes(16).toString('hex'),
          revision:(saved ? saved.revision : 0),document:doc,preferences:model.preferences(backup.preferences),enabled:backup.enabled === true};
        overrides = {}; recovery = false; loadError = null;
        journal.selection=backup.selection||'automatic';journal.native=nativeRestore;
        journal.dirty = {}; journal.restore = allKeys(); journal.environment = null;
        persistStandards(); await reconcile(); return status();
      }
      if (loadError) throw new Error(loadError);
      if (!saved) throw new Error('Import a profile collection first');
      if(input.action==='upgrade_profiles') {
        if(document().schema===2)return status();
        checkRevision(input);
        saved.document=model.validate(catalog.upgrade(document(),preferences()));
        journal.selection='automatic';
        // This is a lossless representation change. It must not touch the
        // picture or clear temporary adjustments during installation.
        if(journal.environment)journal.environment={profile:journal.environment.room,
          brightness:{game_sdr:journal.environment.preferences.game_sdr,movie_sdr:journal.environment.preferences['movie_'+journal.environment.room]}};
        persistStandards();return status();
      }
      if(['create_profile','rename_profile','delete_profile','set_automatic','reset_profile'].includes(input.action)) {
        checkRevision(input);
        if(document().schema!==2)throw new Error('Upgrade the profile collection first');
        const candidate=model.clone(saved),doc=candidate.document;
        let created;
        if(input.action==='create_profile') {
          const source=input.copy_from||'standard';if(!catalog.valid(doc,source))throw new Error('Unknown source profile');
          created='p_'+crypto.randomBytes(8).toString('hex');
          const copied=source==='standard'?{}:catalog.profile(doc,source);
          doc.profiles.push({id:created,name:input.name,brightness:model.clone(copied.brightness||{})});
          for(const bank of doc.banks)if((bank.variants||{})[source])bank.variants[created]=model.clone(bank.variants[source]);
        } else if(input.action==='set_automatic')doc.automatic=model.clone(input.profiles);
        else {
          if(input.profile_id==='standard')throw new Error('Base standard cannot be renamed, deleted or reset');
          const p=catalog.profile(doc,input.profile_id);
          if(input.action==='rename_profile')p.name=input.name;
          else if(input.action==='reset_profile') {
            p.brightness={};for(const bank of doc.banks)if(bank.variants)delete bank.variants[p.id];
          } else {
            if(Object.values(doc.automatic).includes(p.id))throw new Error('Change automatic room bindings before deleting this profile');
            doc.profiles=doc.profiles.filter(v=>v.id!==p.id);
            for(const bank of doc.banks)if(bank.variants)delete bank.variants[p.id];
          }
        }
        model.validate(doc);externalGuard();checkRevision(input);
        if(model.canonical(doc)===model.canonical(document()))return status();
        const result=commitCandidate(candidate);return created?{...result,profile_id:created}:result;
      }
      if(input.action==='apply_profile') {
        if(document().schema!==2)throw new Error('Upgrade the profile collection first');
        if(input.profile_id!=='automatic'&&!catalog.valid(document(),input.profile_id))throw new Error('Unknown profile');
        if(input.clear_adjustments!==undefined&&typeof input.clear_adjustments!=='boolean')throw new Error('Expected clear_adjustments boolean');
        if(input.revision!==undefined)checkRevision(input);
        journal.selection=input.profile_id;
        if(input.clear_adjustments!==false)mergeScopes(journal.restore,allKeys());
        writeJournal();changed(true);return reconcile();
      }
      if (input.action === 'inspect'||input.action==='inspect_many') {
        const ids=input.action==='inspect'?[input.bank_id]:input.bank_ids;
        if(!Array.isArray(ids)||!ids.length||ids.length>32||new Set(ids).size!==ids.length)throw new Error('Inspect 1–32 unique native banks');
        const results=[],readCache=new Map(),captured=model.canonical(context),epoch=powerEpoch;
        const chosen=catalogueReady?await browser.prepare(ids,readCache):ids.map(bankById);
        for(const bank of chosen) {
          const result=await inspect(bank,input.variant||'standard',readCache);
          browser.remember(bank.target,result.settings);
          externalGuard();guard();if(epoch!==powerEpoch||captured!==model.canonical(context))throw new Error('TV signal changed while checking availability');
          for(const key of ['descriptions','factory_descriptions','active_values','preset_description','genre_description'])delete result[key];
          results.push(result);
        }
        return input.action==='inspect'?results[0]:{banks:results};
      }
      if(input.action==='include_native_catalog') {
        guard();checkRevision(input);
        if(options.availabilityReviewed!==true&&!availability.reviewedPlatform().reviewed)throw new Error('Native catalog requires the reviewed TV software');
        await browser.load(true);externalGuard();catalogueReady=true;
        return {...status(),catalog:browser.metadata()};
      }
      if(input.action==='compact_management') {
        guard();checkRevision(input);validateScopes(input.keep);
        if(!browser.backup()||acknowledged!==sequence)throw new Error('Capture a complete native backup and wait for Home Assistant to acknowledge it before compacting');
        if(journal.native&&journal.native.length)throw new Error('Finish pending native edits first');
        const keep=model.clone(input.keep),candidate=model.clone(saved);
        mergeScopes(keep,journal.dirty);mergeScopes(keep,journal.restore);
        mergeScopes(keep,Object.fromEntries(Object.entries(overrides).map(([id,v])=>[id,Object.keys(v)])));
        for(const bank of document().banks)mergeScopes(keep,{[bank.id]:model.environmentKeys(bank)});
        candidate.document.banks=candidate.document.banks.filter(b=>(keep[b.id]||[]).length).map(b=>{
          b.settings=Object.fromEntries(Object.entries(b.settings).filter(([k])=>keep[b.id].includes(k)));return b;
        });
        model.validate(candidate.document);externalGuard();checkRevision(input);
        if(model.canonical(candidate.document)===model.canonical(document()))return status();
        saved=candidate;
        for(const scopes of [journal.dirty,journal.restore,overrides])for(const id of Object.keys(scopes))if(!Object.keys(scopes[id]).length)delete scopes[id];
        persistStandards();return status();
      }
      if (input.action === 'set_environment') {
        if (!['bright','dark'].includes(input.room)) throw new Error('Expected bright or dark room');
        if (room !== input.room) { room = input.room; writeJournal(); changed(); }
        return reconcile();
      }
      if (input.action === 'set_enabled') {
        if (typeof input.enabled !== 'boolean') throw new Error('Expected enabled boolean');
        if (saved.enabled !== input.enabled) { saved.enabled = input.enabled; persistStandards(); }
        return reconcile();
      }
      if (input.action === 'set_brightness') {
        checkRevision(input);
        const next = model.preferences(Object.assign({},preferences(),input.values));
        if(document().schema===2) {
          const candidate=model.clone(saved);catalog.legacyPatch(candidate.document,input.values);
          model.validate(candidate.document);
          if(model.canonical(candidate.document)===model.canonical(document()))return status();
          await validateSharedBrightness(candidate,{},new Map(),()=>{externalGuard();checkRevision(input);});
          return commitCandidate(candidate);
        }
        if (model.canonical(next) !== model.canonical(preferences())) { saved.preferences = next; persistStandards(); }
        return reconcile();
      }
      if (input.action === 'set_brightness_links') {
        guard(); checkRevision(input);
        if (!Array.isArray(input.links) || !input.links.length || input.links.length > 768) throw new Error('Choose brightness links');
        const candidate = model.clone(saved), seen = new Set(), epoch = powerEpoch;
        const check = () => { externalGuard(); guard(); checkRevision(input); if (powerEpoch !== epoch) throw new Error('TV power session changed'); };
        for (const link of input.links) {
          if (!link || Object.keys(link).some(k=>!['bank_id','linked'].includes(k)) || seen.has(link.bank_id)) throw new Error('Invalid or duplicate brightness link');
          const info=catalogueReady?await inspectNative(link.bank_id):null;
          const original=info?info.bank:bankById(link.bank_id);
          let bank=candidate.document.banks.find(b=>b.id===original.id);
          if(!bank) {bank={id:original.id,name:original.name,devices:original.devices||[],target:model.clone(original.target),settings:{}};candidate.document.banks.push(bank);}
          if(!Object.hasOwn(bank.settings,'backlight'))bank.settings.backlight=info?info.result.settings.backlight:original.settings.backlight;
          seen.add(bank.id); view.setBrightnessLink(bank,link.linked,preferences(candidate),room,candidate.document);
          const live = info?info.result:await inspect(original); check();
          for (const variant of ['standard',...catalog.ids(candidate.document)]) {
            const opts = editorOptions(variant,candidate);
            availability.assertEditable('backlight',opts.values(bank).backlight,bank,live,opts);
          }
        }
        model.validate(candidate.document); check();
        if (model.canonical(candidate.document) === model.canonical(saved.document)) return status();
        return commitCandidate(candidate);
      }
      if (input.action === 'include_motion_controls') {
        guard(); checkRevision(input);
        const candidate=model.clone(saved), epoch=powerEpoch;
        const check=()=>{externalGuard();guard();checkRevision(input);if(powerEpoch!==epoch)throw new Error('TV power session changed');};
        for (const bank of candidate.document.banks) {
          const d=bank.target.dimension;
          if(bank.target.category!=='picture'||bank.target.app_id||!['filmMaker','hdrFilmMaker','dolbyHdrCinema','dolbyHdrCinemaBright'].includes(d.pictureMode))continue;
          const keys=['truMotionJudder','truMotionBlur'].filter(k=>!Object.hasOwn(bank.settings,k));
          if(!keys.length)continue;
          const values=(await native({action:'read',banks:[{id:bank.id,target:bank.target,keys}]},check)).banks[0].settings;
          for(const key of keys)bank.settings[key]=values[key];
          const live=await inspect(bank);check();
          for(const key of keys)bank.settings[key]=encodeStandard(key,values[key],live,bank);
        }
        model.validate(candidate.document);check();
        if(model.canonical(candidate.document)!==model.canonical(saved.document)){saved=candidate;persistStandards();}
        return status();
      }
      if (input.action === 'restore_scope') {
        guard(); checkRevision(input);
        if(input.scope!==undefined&&!['all','active'].includes(input.scope))throw new Error('Unknown scope');
        const requested=view.scopeSelection(snapshot(),input.filters,input.categories), selection={},excluded=[], epoch=powerEpoch, currentRoom=activeProfile(), currentContext=model.canonical(context);
        const check=()=>{externalGuard();guard();checkRevision(input);if(powerEpoch!==epoch||activeProfile()!==currentRoom||model.canonical(context)!==currentContext)throw new Error('TV session, signal or room changed');};
        for(const [id,keys] of Object.entries(requested)) {
          const bank=bankById(id);if(input.scope==='active'&&!model.active(bank,context))continue;
          const live=await inspect(bank,currentRoom);check();
          for(const key of keys) {
            try {availability.assertEditable(key,resolved(bank,currentRoom)[key],bank,live,editorOptions(currentRoom));}
            catch(error){if(error.code!=='profile_setting_unavailable')throw error;excluded.push({bank_id:id,key,reason:error.message});continue;}
            (selection[id]||(selection[id]=[])).push(key);
          }
        }
        check();if(!Object.keys(selection).length)throw new Error('No applicable settings match this scope');
        mergeScopes(journal.restore,selection);writeJournal();changed(true);
        return {...await reconcile(),selection,excluded};
      }
      if (input.action === 'import') {
        checkRevision(input);
        const doc = model.validate(input.document);
        // Validate every value against the TV before committing a new standard.
        for (const bank of doc.banks) {
          const live = await inspect(bank);
          for (const values of [bank.settings,...Object.values(bank.variants || {})])
            for (const [k,v] of Object.entries(values)) encodeStandard(k,v,live,bank);
          externalGuard();
        }
        const oldPreferences=preferences();
        saved.document = doc; if(doc.schema===1)saved.preferences=oldPreferences;
        if(selection()!=='automatic'&&!catalog.valid(doc,selection()))journal.selection='automatic';
        overrides = {}; journal.dirty = {}; journal.restore = allKeys();
        persistStandards(); await reconcile(); return status();
      }
      if (input.action === 'edit_many') {
        guard(); checkRevision(input);
        if(journal.native&&journal.native.length)throw new Error('Finish pending native edits before saving another batch');
        const edits = input.edits === undefined ? [] : input.edits, prefPatch = input.preferences === undefined ? {} : input.preferences;
        const candidate = model.clone(saved), seen = new Set(), prefValues = {}, inspected = new Map(), epoch = powerEpoch, direct=new Map(), readCache=new Map(), originals=new Map();
        const check = () => { externalGuard(); guard(); checkRevision(input); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
        if (!prefPatch || typeof prefPatch !== 'object' || Array.isArray(prefPatch)) throw new Error('Invalid brightness preferences');
        if (!Array.isArray(edits) || edits.length > 768 || (!edits.length && !Object.keys(prefPatch).length)) throw new Error('Choose settings to edit');
        model.preferences({...preferences(candidate),...prefPatch});
        if(candidate.document.schema===2)catalog.legacyPatch(candidate.document,prefPatch);
        else candidate.preferences = model.preferences({...candidate.preferences,...prefPatch});
        if(candidate.document.schema===2)for(const [key,value] of Object.entries(prefPatch)) {
          const variant=key==='game_sdr'?'standard':candidate.document.automatic[key.slice(6)],role=key==='game_sdr'?'game_sdr':'movie_sdr';
          prefValues[variant+'/'+role]=value;
        } else Object.assign(prefValues,prefPatch);
        for (const edit of edits) {
          if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('Invalid bank edit');
          if(!originals.has(edit.bank_id)) {
            if(catalogueReady||!document().banks.some(b=>b.id===edit.bank_id)) {
              const info=await inspectNative(edit.bank_id,'standard',readCache);catalogueReady=true;
              originals.set(edit.bank_id,info.bank);inspected.set(edit.bank_id,info.result);
            } else originals.set(edit.bank_id,bankById(edit.bank_id));
          }
          const original=originals.get(edit.bank_id),bank=original,variant=edit.variant||'standard',patch=edit.settings===undefined?{}:edit.settings,inherit=edit.inherit===undefined?[]:edit.inherit;
          if (!catalog.valid(candidate.document,variant) || !patch || typeof patch !== 'object' || Array.isArray(patch) ||
              !Array.isArray(inherit) || inherit.length>40 || new Set(inherit).size!==inherit.length ||
              (!Object.keys(patch).length&&!inherit.length) || [...Object.keys(patch),...inherit].some(k=>typeof k!=='string'||!Object.hasOwn(bank.settings,k))) throw new Error('Invalid bank edit');
          if(inherit.length&&(candidate.document.schema!==2||variant==='standard'))throw new Error('Only named profiles can inherit from Base');
          if (!inspected.has(bank.id)) inspected.set(bank.id,await inspect(original));
          check();
          const live = inspected.get(bank.id);
          for (const [key,value] of Object.entries(patch)) {
            const identity = bank.id+'/'+variant+'/'+key;
            if (seen.has(identity)) throw new Error('Duplicate setting in batch');
            seen.add(identity);
            const encoded = encodeStandard(key,value,live,bank);
            let destination=candidate.document.banks.find(b=>b.id===bank.id);
            const managed=destination&&Object.hasOwn(destination.settings,key);
            if(!managed) {
              if(!edit.expected||!Object.hasOwn(edit.expected,key)||!model.same(edit.expected[key],live.settings[key]))throw new Error('Native values changed or were not reviewed; refresh before saving');
              if(variant==='standard') {
                if(!model.same(encoded,live.settings[key])) {
                  if(!direct.has(bank.id))direct.set(bank.id,{id:bank.id,target:bank.target,settings:{},expected:{}});
                  direct.get(bank.id).settings[key]=encoded;direct.get(bank.id).expected[key]=live.settings[key];
                }
                continue;
              }
              if(!destination) {
                destination={id:bank.id,name:bank.name,devices:bank.devices||[],target:model.clone(bank.target),settings:{}};
                candidate.document.banks.push(destination);
              }
              // First explicit overlay owns only this key and its native
              // baseline. Merely inspecting a bank never takes ownership.
              destination.settings[key]=model.clone(live.settings[key]);
            }
            if(candidate.document.schema===2) {
              if(key==='backlight'&&destination.brightness_role) {
                const shared=variant+'/'+destination.brightness_role;
                if(Object.hasOwn(prefValues,shared)&&(prefValues[shared]===null||!model.same(prefValues[shared],encoded)))throw new Error('Conflicting shared brightness values');
                prefValues[shared]=encoded;
              }
              catalog.edit(candidate.document,destination,variant,key,encoded);
            } else if (key==='backlight' && destination.brightness_role) {
              if (destination.brightness_role==='movie_sdr' && variant==='standard') throw new Error('Choose Bright or Dark to edit shared movie SDR brightness');
              const role = destination.brightness_role==='game_sdr'?'game_sdr':'movie_'+variant;
              if (Object.hasOwn(prefValues,role) && !model.same(prefValues[role],encoded)) throw new Error('Conflicting shared brightness values');
              prefValues[role] = Number(encoded); candidate.preferences[role] = Number(encoded);
            } else {
              const previous = variant==='standard'?destination.settings[key]:Object.assign({},destination.settings,(destination.variants || {})[variant])[key];
              if (model.same(previous,encoded)) continue;
              if (variant==='standard') destination.settings[key]=encoded;
              else { destination.variants=destination.variants || {}; destination.variants[variant]=destination.variants[variant] || {}; destination.variants[variant][key]=encoded; }
            }
          }
          for(const key of inherit) {
            const identity=bank.id+'/'+variant+'/'+key;
            if(seen.has(identity))throw new Error('Duplicate setting in batch');
            seen.add(identity);
            if(key==='backlight'&&bank.brightness_role) {
              const shared=variant+'/'+bank.brightness_role;
              if(Object.hasOwn(prefValues,shared)&&prefValues[shared]!==null)throw new Error('Conflicting shared brightness values');
              prefValues[shared]=null;
            }
            const destination=candidate.document.banks.find(b=>b.id===bank.id);
            if(destination&&Object.hasOwn(destination.settings,key))catalog.edit(candidate.document,destination,variant,key,undefined,true);
          }
          check();
        }
        // A batch may edit Base and add its first named override together.
        // In that case the explicit Base edit is the new managed baseline.
        for(const [id,entry] of direct) {
          const bank=candidate.document.banks.find(b=>b.id===id);
          if(bank)for(const key of Object.keys(entry.settings))if(Object.hasOwn(bank.settings,key)) {
            bank.settings[key]=entry.settings[key];delete entry.settings[key];delete entry.expected[key];
          }
          if(!Object.keys(entry.settings).length)direct.delete(id);
        }
        model.validate(candidate.document); model.preferences(preferences(candidate));
        // Validate the completed candidate, so dependency edits in the same
        // transaction are independent of their order. Nothing is persisted or
        // applied until every target passes its own applicability check.
        const validation={...candidate,document:browser.browser(candidate.document)};
        for(const entry of direct.values())Object.assign(validation.document.banks.find(b=>b.id===entry.id).settings,entry.settings);
        for (const edit of edits) {
          const bank = validation.document.banks.find(b=>b.id===edit.bank_id), live = inspected.get(bank.id);
          for (const [key,value] of Object.entries(edit.settings||{}))
            availability.assertEditable(key,value,bank,live,editorOptions(edit.variant || 'standard',validation));
          // Removing an override can also clean up a dormant/unused setting.
          // Validate Base's storage scope and range without treating cleanup
          // as permission to introduce a new processing value in that mode.
          for(const key of edit.inherit||[])encodeStandard(key,resolved(bank,edit.variant,validation)[key],live,bank);
        }
        await validateSharedBrightness(candidate,prefValues,inspected,check);
        check();
        if(direct.size)journal.native=[...direct.values()];
        if (model.canonical(candidate.document)===model.canonical(saved.document) && model.canonical(candidate.preferences)===model.canonical(saved.preferences)) {
          if(direct.size){writeJournal();await reconcile();}return status();
        }
        // Persist once after validating the entire candidate. Native writes
        // remain compared, verified and journaled by the shared commit path.
        return commitCandidate(candidate);
      }
      if (input.action === 'edit') {
        guard(); checkRevision(input); const epoch = powerEpoch;
        const check = () => { externalGuard(); guard(); checkRevision(input); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
        const original = bankById(input.bank_id), candidate = model.clone(saved);
        const bank = candidate.document.banks.find(b => b.id === original.id), variant = input.variant || 'standard', patch = input.settings;
        if (!catalog.valid(candidate.document,variant) || !patch || !Object.keys(patch).length || Object.keys(patch).some(k => !Object.hasOwn(bank.settings,k))) throw new Error('Invalid bank edit');
        const live = await inspect(bank), encoded = {}, prefValues = {};
        for (const [k,v] of Object.entries(patch)) encoded[k] = encodeStandard(k,v,live,bank);
        check();
        for (const [k,v] of Object.entries(encoded)) {
          if (k === 'backlight' && bank.brightness_role) {
            if (bank.brightness_role !== 'game_sdr' && variant === 'standard') throw new Error('Choose Bright or Dark to edit shared movie SDR brightness');
            const role = bank.brightness_role === 'game_sdr' ? 'game_sdr' : 'movie_' + variant;
            prefValues[role] = Number(v); candidate.preferences[role] = Number(v);
          } else if (variant === 'standard') bank.settings[k] = v;
          else { bank.variants = bank.variants || {}; bank.variants[variant] = bank.variants[variant] || {}; bank.variants[variant][k] = v; }
        }
        model.validate(candidate.document); model.preferences(preferences(candidate));
        for (const [key,value] of Object.entries(encoded))
          availability.assertEditable(key,value,bank,live,editorOptions(variant,candidate));
        await validateSharedBrightness(candidate,prefValues,new Map([[bank.id,live]]),check);
        check();
        saved = candidate;
        const affected = Object.keys(encoded).filter(k => variant === 'standard' || variant === room ||
          (k === 'backlight' && bank.brightness_role === 'game_sdr'));
        for (const k of affected) if (overrides[bank.id]) delete overrides[bank.id][k];
        // Editing an inactive room variant must not change today's viewing value.
        if (affected.length) mergeScopes(journal.restore,{[bank.id]:affected});
        journal.dirty = dirtyScopes(); persistStandards(); await reconcile(); return status();
      }
      if (input.action === 'restore') {
        if (Object.hasOwn(input,'selection')) { guard(); checkRevision(input); }
        if (input.selection && (input.room !== room || document().schema===2&&input.profile_id!==activeProfile())) throw new Error('Room changed or active profile changed; review the selected settings again');
        const selection = selectedKeys(input,'all');
        mergeScopes(journal.restore,selection);
        writeJournal(); changed(true); return reconcile();
      }
      if (input.action === 'save') {
        guard(); checkRevision(input); const epoch = powerEpoch; await recover();
        externalGuard(); guard(); checkRevision(input);
        if (epoch !== powerEpoch) throw new Error('TV power session changed');
        if (input.selection && (input.room !== room || document().schema===2&&input.profile_id!==activeProfile())) throw new Error('Room changed or active profile changed; review the selected settings again');
        const selection = selectedKeys(input,'active'), candidate = model.clone(saved), prefValues = {}, promoted = model.clone(overrides);
        for (const [id,keys] of Object.entries(selection)) {
          const bank = candidate.document.banks.find(b => b.id === id);
          for (const [k,v] of Object.entries(promoted[bank.id] || {})) {
            if (!keys.includes(k)) continue;
            if (input.selection && (!input.expected || !input.expected[id] || !model.same(input.expected[id][k],v))) throw new Error('Temporary adjustments changed; review them again');
            if(candidate.document.schema===2) {
              if(k==='backlight'&&bank.brightness_role) {
                const shared=activeProfile()+'/'+bank.brightness_role;
                if(Object.hasOwn(prefValues,shared)&&!model.same(prefValues[shared],v))throw new Error('Conflicting temporary values for shared brightness');
                prefValues[shared]=v;
              }
              catalog.edit(candidate.document,bank,activeProfile(),k,v);
            } else if (k === 'backlight' && bank.brightness_role) {
              const role=bank.brightness_role === 'movie_sdr' ? 'movie_' + room : 'game_sdr';
              if (Object.hasOwn(prefValues,role) && !model.same(prefValues[role],v)) throw new Error('Conflicting temporary values for shared brightness');
              prefValues[role]=Number(v); candidate.preferences[role]=Number(v);
            }
            else if (model.environmentKeys(bank).includes(k) && bank.variants) { bank.variants[room] = bank.variants[room] || {}; bank.variants[room][k] = v; }
            else bank.settings[k] = v;
          }
        }
        if (input.selection) for (const [id,keys] of Object.entries(selection)) for (const key of keys) {
          if (!input.expected || !input.expected[id] || !Object.hasOwn(input.expected[id],key) || !model.same(input.expected[id][key],(overrides[id] || {})[key])) throw new Error('Temporary adjustments changed; review them again');
        }
        model.validate(candidate.document); model.preferences(preferences(candidate));
        const inspected = new Map();
        const check = () => {
          externalGuard(); guard(); checkRevision(input);
          if (epoch !== powerEpoch) throw new Error('TV power session changed');
          if (input.selection && (input.room !== room || document().schema===2&&input.profile_id!==activeProfile())) throw new Error('Room changed or active profile changed; review the selected settings again');
        };
        for (const [id,keys] of Object.entries(selection)) {
          const bank = candidate.document.banks.find(b=>b.id===id), adjusted = keys.filter(k=>Object.hasOwn(promoted[id] || {},k));
          if (!adjusted.length) continue;
          const live = await inspect(bankById(id));
          inspected.set(id,live); check();
          for (const key of adjusted) availability.assertEditable(key,promoted[id][key],bank,live,editorOptions(activeProfile(),candidate));
        }
        await validateSharedBrightness(candidate,prefValues,inspected,check);
        check();
        for (const [id,keys] of Object.entries(selection)) for (const key of keys) {
          const before = promoted[id] || {}, now = overrides[id] || {};
          if (Object.hasOwn(before,key) !== Object.hasOwn(now,key) || Object.hasOwn(before,key) && !model.same(before[key],now[key]))
            throw new Error('Temporary adjustments changed; review them again');
        }
        saved = candidate;
        for (const [id,keys] of Object.entries(selection)) {
          for (const key of keys) if (overrides[id]) delete overrides[id][key];
          if (overrides[id] && !Object.keys(overrides[id]).length) delete overrides[id];
          if (journal.restore[id]) { journal.restore[id]=journal.restore[id].filter(k=>!keys.includes(k)); if (!journal.restore[id].length) delete journal.restore[id]; }
        }
        journal.dirty = dirtyScopes(); persistStandards(); queueSync(); return status();
      }
      if (input.action === 'reconcile') return reconcile();
      throw new Error('Unknown profile action');
    });
  }
  return {command,status,snapshot,observe,setPower,
    contextChanged(value) { context = value || {}; notify(); },
    ownsProfiles() { return !!saved || !!loadError; },
    environment(value) {
      if (value && value.protocol === 1 && ['bright','dark'].includes(value.room) && value.room !== room)
        command({action:'set_environment',room:value.room}).catch(e => { lastError = e.message; notify(); });
    },
    acknowledge(value) {
      if (latestBackup && value && value.instance_id === instance && value.owner_id === saved.owner_id &&
          value.sequence === sequence && value.sha256 === latestBackup.sha256) { acknowledged = sequence; notify(); }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onBackup(fn) { backupListeners.add(fn); return () => backupListeners.delete(fn); },
    republishBackup() { if (latestBackup) { for (const fn of backupListeners) fn(latestBackup); } else publishBackup(); },
    stop() { stopped = true; cancel(timer); cancel(recoveryTimer);cancel(captureTimer); if (saved && !loadError) publishBackup(); listeners.clear(); backupListeners.clear(); },
    idle() { return tail; }
  };
}
module.exports = {create};
