'use strict';

const crypto = require('crypto');
const fs = require('fs');
const model = require('./profile-model');
const banks = require('./profile-banks');
const disk = require('./profile-store');
const availability = require('./profile-availability');
const view = require('../../profile-view');

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
  const defaults = {movie_bright:100,movie_dark:3,game_sdr:80};
  try {
    saved = store.read('profiles');
    if (saved) {
      saved.document = model.validate(saved.document); saved.preferences = model.preferences(saved.preferences);
      if (saved.schema !== 1 || typeof saved.owner_id !== 'string' || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || typeof saved.enabled !== 'boolean') throw new Error('Invalid profile storage');
      journal = Object.assign(journal,store.read('profile-session') || {});
      validateScopes(journal.dirty); validateScopes(journal.restore);
      if (journal.revision !== saved.revision) journal.restore = allKeys();
      if (journal.power === 'off' || (boot && journal.boot_id && boot !== journal.boot_id)) mergeScopes(journal.restore,journal.dirty);
      room = journal.environment && ['bright','dark'].includes(journal.environment.room) ? journal.environment.room : 'dark';
    }
  } catch (error) { loadError = 'Profile recovery required: ' + error.message; }

  function document() { return saved && saved.document; }
  function preferences() { return saved ? saved.preferences : defaults; }
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
  function environment() { return {room,preferences:model.clone(preferences())}; }
  function writeJournal() {
    if (!saved) return;
    journal.boot_id = boot; journal.revision = saved.revision;
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
  function snapshot() {
    return {schema:1,owner_id:saved && saved.owner_id,instance_id:instance,sequence,revision:saved ? saved.revision : 0,
      document:model.clone(document()),preferences:model.clone(preferences()),enabled:!!(saved && saved.enabled),
      room,environment:model.clone(journal.environment),overrides:model.clone(overrides),
      recovery:{dirty:model.clone(journal.dirty),restore:model.clone(journal.restore),boot_id:boot,power,reconstructing:recovery},
      migration_id:saved && saved.migration_id || null,context:model.clone(context),created_at:new Date(clock()).toISOString()};
  }
  function status() {
    return {configured:!!saved,editor_api:5,owner_id:saved && saved.owner_id,instance_id:instance,revision:saved ? saved.revision : 0,
      enabled:!!(saved && saved.enabled),room,power,context,temporary_count:Object.values(overrides).reduce((n,v) => n + Object.keys(v).length,0),
      pending_restore:Object.keys(journal.restore).length > 0,applying,changed_count:changedCount,
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
    latestBackup = model.backup(snapshot());
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
    serial(reconcile).catch(error => { lastError = error.message; changed(); });
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
      let standard = model.same(item.value,model.desired(bank,room,preferences())[k]);
      const env = journal.environment;
      if (env && model.environmentKeys(bank).includes(k)) standard = standard || model.same(item.value,model.desired(bank,env.room,env.preferences)[k]);
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
    const values = model.desired(bank,room,preferences(),force ? {} : overrides[id]), patch = {}, expected = {}, marks = {};
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
    if (!saved || !saved.enabled || power !== 'on' || loadError) return status();
    applying = true; changedCount = 0; notify();
    try {
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
    if (value === 'off') { cancel(recoveryTimer); recoveryTimer = null; }
    if (value === 'off') mergeScopes(journal.restore,journal.dirty);
    if (saved && (journal.power !== value || previous === 'off')) { journal.power = value; writeJournal(); }
    changed(true);
    if (value === 'on') queueSync();
  }
  function checkRevision(command) {
    if (!saved || command.revision !== saved.revision) throw new Error('Profiles changed; refresh before saving');
  }
  function persistStandards() {
    saved.revision++;
    try { store.write('profiles',saved); writeJournal(); }
    catch (error) { loadError = 'Profile storage failed; recover before continuing: ' + error.message; notify(); throw error; }
    changed(true);
  }
  function editorOptions(variant = 'standard', candidate = saved) {
    if (!['standard','bright','dark'].includes(variant)) throw new Error('Unknown room variant');
    return {document:candidate && candidate.document,context,
      reviewed:options.availabilityReviewed,
      values:bank => {
        const value = {...bank.settings,...(variant === 'standard' ? {} : (bank.variants || {})[variant] || {})};
        if (bank.brightness_role && candidate) value.backlight = candidate.preferences[
          bank.brightness_role === 'game_sdr' ? 'game_sdr' : 'movie_' + (variant === 'standard' ? room : variant)];
        return value;
      }};
  }
  async function inspect(bank, variant = 'standard') {
    guard();
    if (options.inspect) return options.inspect(bank);
    return new Promise((resolve,reject) => {
      const epoch = powerEpoch;
      const check = () => { guard(); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
      const run = done => banks.inspect(options.service,bank,check,() => context,editorOptions(variant)).then(v => done(null,v),done);
      if (options.enqueue) options.enqueue(run,(e,v) => e ? reject(e) : resolve(v)); else run((e,v) => e ? reject(e) : resolve(v));
    });
  }
  async function validateSharedBrightness(candidate, patch, inspected, check) {
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
          for (const [k,v] of Object.entries(values)) banks.encode(k,v,live.settings[k],(live.descriptions || []).find(d => d.key === k),bank);
      }
    }
    saved = {schema:1,owner_id:crypto.randomBytes(16).toString('hex'),revision:1,document:doc,preferences:prefs,
      enabled:command.enabled === true,migration_id:typeof command.migration_id === 'string' ? command.migration_id.slice(0,128) : null};
    overrides = initial; recovery = false;
    room = ['bright','dark'].includes(command.room) ? command.room : room;
    journal = {dirty:dirtyScopes(),restore:command.migration_id ? command.restore || {} : allKeys(),boot_id:boot,power,revision:1,environment:null};
    validateScopes(journal.restore);
    if (command.pending_restore || power === 'off') mergeScopes(journal.restore,journal.dirty);
    store.write('profiles',saved); writeJournal(); changed(true);
    await reconcile(); return status();
  }
  async function command(input, externalGuard = () => {}) {
    if (!input || typeof input !== 'object' || typeof input.action !== 'string' || JSON.stringify(input).length > 900000) throw new Error('Invalid profile command');
    return serial(async () => {
      externalGuard();
      if (input.action === 'get') return {state:snapshot(),status:status()};
      if (input.action === 'backup') return publishBackup();
      if (input.action === 'initialize') return initialize(input);
      if (input.action === 'restore_backup') {
        const backup = model.decodeBackup(input.backup);
        if (saved) checkRevision(input);
        const doc = model.validate(backup.document);
        // Restore standards deliberately. Historical temporary values never get
        // silently applied as the new viewing session's preferences.
        saved = {schema:1,owner_id:saved ? saved.owner_id : crypto.randomBytes(16).toString('hex'),
          revision:(saved ? saved.revision : 0),document:doc,preferences:model.preferences(backup.preferences),enabled:backup.enabled === true};
        overrides = {}; recovery = false; loadError = null;
        journal.dirty = {}; journal.restore = allKeys(); journal.environment = null;
        persistStandards(); await reconcile(); return status();
      }
      if (loadError) throw new Error(loadError);
      if (!saved) throw new Error('Import a profile collection first');
      if (input.action === 'inspect') {
        const bank = bankById(input.bank_id), result = await inspect(bank,input.variant || 'standard');
        delete result.descriptions; delete result.factory_descriptions; delete result.active_values; return result;
      }
      if (input.action === 'set_environment') {
        if (!['bright','dark'].includes(input.room)) throw new Error('Expected bright or dark room');
        if (room !== input.room) { room = input.room; changed(); }
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
        if (model.canonical(next) !== model.canonical(preferences())) { saved.preferences = next; persistStandards(); }
        return reconcile();
      }
      if (input.action === 'set_brightness_links') {
        guard(); checkRevision(input);
        if (!Array.isArray(input.links) || !input.links.length || input.links.length > 100) throw new Error('Choose brightness links');
        const candidate = model.clone(saved), seen = new Set(), epoch = powerEpoch;
        const check = () => { externalGuard(); guard(); checkRevision(input); if (powerEpoch !== epoch) throw new Error('TV power session changed'); };
        for (const link of input.links) {
          if (!link || Object.keys(link).some(k=>!['bank_id','linked'].includes(k)) || seen.has(link.bank_id)) throw new Error('Invalid or duplicate brightness link');
          const original = bankById(link.bank_id), bank = candidate.document.banks.find(b=>b.id===original.id);
          seen.add(bank.id); view.setBrightnessLink(bank,link.linked,candidate.preferences,room);
          const live = await inspect(original); check();
          for (const variant of ['standard','bright','dark']) {
            const opts = editorOptions(variant,candidate);
            availability.assertEditable('backlight',opts.values(bank).backlight,bank,live,opts);
          }
        }
        model.validate(candidate.document); check();
        if (model.canonical(candidate.document) === model.canonical(saved.document)) return status();
        const affected = {};
        for (const id of seen) {
          const bank = candidate.document.banks.find(b=>b.id===id);
          if (!model.same(model.desired(bank,room,candidate.preferences).backlight,model.desired(bankById(id),room,saved.preferences).backlight)) {
            affected[id]=['backlight']; if (overrides[id]) delete overrides[id].backlight;
          }
        }
        saved=candidate; mergeScopes(journal.restore,affected); journal.dirty=dirtyScopes(); persistStandards();
        queueSync(); return status();
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
          for(const key of keys)bank.settings[key]=banks.encode(key,values[key],live.settings[key],live.descriptions.find(d=>d.key===key),bank);
        }
        model.validate(candidate.document);check();
        if(model.canonical(candidate.document)!==model.canonical(saved.document)){saved=candidate;persistStandards();}
        return status();
      }
      if (input.action === 'restore_scope') {
        guard(); checkRevision(input);
        if(input.scope!==undefined&&!['all','active'].includes(input.scope))throw new Error('Unknown scope');
        const requested=view.scopeSelection(snapshot(),input.filters,input.categories), selection={},excluded=[], epoch=powerEpoch, currentRoom=room, currentContext=model.canonical(context);
        const check=()=>{externalGuard();guard();checkRevision(input);if(powerEpoch!==epoch||room!==currentRoom||model.canonical(context)!==currentContext)throw new Error('TV session, signal or room changed');};
        for(const [id,keys] of Object.entries(requested)) {
          const bank=bankById(id);if(input.scope==='active'&&!model.active(bank,context))continue;
          const live=await inspect(bank,currentRoom);check();
          for(const key of keys) {
            try {availability.assertEditable(key,model.desired(bank,currentRoom,preferences())[key],bank,live,editorOptions(currentRoom));}
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
            for (const [k,v] of Object.entries(values)) banks.encode(k,v,live.settings[k],(live.descriptions || []).find(d => d.key === k),bank);
          externalGuard();
        }
        saved.document = doc; overrides = {}; journal.dirty = {}; journal.restore = allKeys();
        persistStandards(); await reconcile(); return status();
      }
      if (input.action === 'edit_many') {
        guard(); checkRevision(input);
        const edits = input.edits === undefined ? [] : input.edits, prefPatch = input.preferences === undefined ? {} : input.preferences;
        const candidate = model.clone(saved), seen = new Set(), prefValues = {}, inspected = new Map(), epoch = powerEpoch;
        const check = () => { externalGuard(); guard(); checkRevision(input); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
        if (!prefPatch || typeof prefPatch !== 'object' || Array.isArray(prefPatch)) throw new Error('Invalid brightness preferences');
        if (!Array.isArray(edits) || edits.length > 300 || (!edits.length && !Object.keys(prefPatch).length)) throw new Error('Choose settings to edit');
        candidate.preferences = model.preferences({...candidate.preferences,...prefPatch});
        Object.assign(prefValues,prefPatch);
        for (const edit of edits) {
          if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('Invalid bank edit');
          const original = bankById(edit.bank_id), bank = candidate.document.banks.find(b=>b.id===original.id), variant = edit.variant || 'standard', patch = edit.settings;
          if (!['standard','bright','dark'].includes(variant) || !patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(k=>!Object.hasOwn(bank.settings,k))) throw new Error('Invalid bank edit');
          if (!inspected.has(bank.id)) inspected.set(bank.id,await inspect(original));
          check();
          const live = inspected.get(bank.id);
          for (const [key,value] of Object.entries(patch)) {
            const identity = bank.id+'/'+variant+'/'+key;
            if (seen.has(identity)) throw new Error('Duplicate setting in batch');
            seen.add(identity);
            const encoded = banks.encode(key,value,live.settings[key],(live.descriptions || []).find(d=>d.key===key),bank);
            if (key==='backlight' && bank.brightness_role) {
              if (bank.brightness_role==='movie_sdr' && variant==='standard') throw new Error('Choose Bright or Dark to edit shared movie SDR brightness');
              const role = bank.brightness_role==='game_sdr'?'game_sdr':'movie_'+variant;
              if (Object.hasOwn(prefValues,role) && !model.same(prefValues[role],encoded)) throw new Error('Conflicting shared brightness values');
              prefValues[role] = Number(encoded); candidate.preferences[role] = Number(encoded);
            } else {
              const previous = variant==='standard'?bank.settings[key]:Object.assign({},bank.settings,(bank.variants || {})[variant])[key];
              if (model.same(previous,encoded)) continue;
              if (variant==='standard') bank.settings[key]=encoded;
              else { bank.variants=bank.variants || {}; bank.variants[variant]=bank.variants[variant] || {}; bank.variants[variant][key]=encoded; }
            }
          }
          check();
        }
        model.validate(candidate.document); model.preferences(candidate.preferences);
        // Validate the completed candidate, so dependency edits in the same
        // transaction are independent of their order. Nothing is persisted or
        // applied until every target passes its own applicability check.
        for (const edit of edits) {
          const bank = candidate.document.banks.find(b=>b.id===edit.bank_id), live = inspected.get(bank.id);
          for (const [key,value] of Object.entries(edit.settings))
            availability.assertEditable(key,value,bank,live,editorOptions(edit.variant || 'standard',candidate));
        }
        await validateSharedBrightness(candidate,prefValues,inspected,check);
        check();
        if (model.canonical(candidate.document)===model.canonical(saved.document) && model.canonical(candidate.preferences)===model.canonical(saved.preferences)) return status();
        const affected = {};
        // Resolve shared preferences and inactive room variants before committing.
        // The whole standard document is validated and persisted once; native
        // writes remain journaled, compared and retried by the existing engine.
        for (const bank of candidate.document.banks) {
          const before = model.desired(bankById(bank.id),room,saved.preferences), after = model.desired(bank,room,candidate.preferences);
          const keys = Object.keys(after).filter(k=>!model.same(before[k],after[k]));
          if (keys.length) affected[bank.id]=keys;
        }
        saved=candidate;
        for (const [id,keys] of Object.entries(affected)) for (const key of keys) if (overrides[id]) delete overrides[id][key];
        mergeScopes(journal.restore,affected); journal.dirty=dirtyScopes(); persistStandards();
        queueSync(); return status();
      }
      if (input.action === 'edit') {
        guard(); checkRevision(input); const epoch = powerEpoch;
        const check = () => { externalGuard(); guard(); checkRevision(input); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
        const original = bankById(input.bank_id), candidate = model.clone(saved);
        const bank = candidate.document.banks.find(b => b.id === original.id), variant = input.variant || 'standard', patch = input.settings;
        if (!['standard','bright','dark'].includes(variant) || !patch || !Object.keys(patch).length || Object.keys(patch).some(k => !Object.hasOwn(bank.settings,k))) throw new Error('Invalid bank edit');
        const live = await inspect(bank), encoded = {}, prefValues = {};
        for (const [k,v] of Object.entries(patch)) encoded[k] = banks.encode(k,v,live.settings[k],(live.descriptions || []).find(d => d.key === k),bank);
        check();
        for (const [k,v] of Object.entries(encoded)) {
          if (k === 'backlight' && bank.brightness_role) {
            if (bank.brightness_role !== 'game_sdr' && variant === 'standard') throw new Error('Choose Bright or Dark to edit shared movie SDR brightness');
            const role = bank.brightness_role === 'game_sdr' ? 'game_sdr' : 'movie_' + variant;
            prefValues[role] = Number(v); candidate.preferences[role] = Number(v);
          } else if (variant === 'standard') bank.settings[k] = v;
          else { bank.variants = bank.variants || {}; bank.variants[variant] = bank.variants[variant] || {}; bank.variants[variant][k] = v; }
        }
        model.validate(candidate.document); model.preferences(candidate.preferences);
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
        if (input.selection && input.room !== room) throw new Error('Room changed; review the selected settings again');
        const selection = selectedKeys(input,'all');
        mergeScopes(journal.restore,selection);
        writeJournal(); changed(true); return reconcile();
      }
      if (input.action === 'save') {
        guard(); checkRevision(input); const epoch = powerEpoch; await recover();
        externalGuard(); guard(); checkRevision(input);
        if (epoch !== powerEpoch) throw new Error('TV power session changed');
        if (input.selection && input.room !== room) throw new Error('Room changed; review the selected settings again');
        const selection = selectedKeys(input,'active'), candidate = model.clone(saved), prefValues = {}, promoted = model.clone(overrides);
        for (const [id,keys] of Object.entries(selection)) {
          const bank = candidate.document.banks.find(b => b.id === id);
          for (const [k,v] of Object.entries(promoted[bank.id] || {})) {
            if (!keys.includes(k)) continue;
            if (input.selection && (!input.expected || !input.expected[id] || !model.same(input.expected[id][k],v))) throw new Error('Temporary adjustments changed; review them again');
            if (k === 'backlight' && bank.brightness_role) {
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
        model.validate(candidate.document); model.preferences(candidate.preferences);
        const inspected = new Map();
        const check = () => {
          externalGuard(); guard(); checkRevision(input);
          if (epoch !== powerEpoch) throw new Error('TV power session changed');
          if (input.selection && input.room !== room) throw new Error('Room changed; review the selected settings again');
        };
        for (const [id,keys] of Object.entries(selection)) {
          const bank = candidate.document.banks.find(b=>b.id===id), adjusted = keys.filter(k=>Object.hasOwn(promoted[id] || {},k));
          if (!adjusted.length) continue;
          const live = await inspect(bankById(id));
          inspected.set(id,live); check();
          for (const key of adjusted) availability.assertEditable(key,promoted[id][key],bank,live,editorOptions(room,candidate));
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
    stop() { stopped = true; cancel(timer); cancel(recoveryTimer); if (saved && !loadError) publishBackup(); listeners.clear(); backupListeners.clear(); },
    idle() { return tail; }
  };
}
module.exports = {create};
