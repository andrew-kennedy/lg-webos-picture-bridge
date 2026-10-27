'use strict';

const crypto = require('crypto');
const fs = require('fs');
const model = require('./profile-model');
const banks = require('./profile-banks');
const disk = require('./profile-store');

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
    return {configured:!!saved,owner_id:saved && saved.owner_id,instance_id:instance,revision:saved ? saved.revision : 0,
      enabled:!!(saved && saved.enabled),room,power,context,temporary_count:Object.values(overrides).reduce((n,v) => n + Object.keys(v).length,0),
      pending_restore:Object.keys(journal.restore).length > 0,applying,changed_count:changedCount,
      error:loadError || lastError,backup_sequence:latestBackup ? sequence : null,backup_acknowledged:acknowledged,
      active_devices:document() ? [...new Set(document().banks.filter(b => model.active(b,context)).flatMap(b => b.devices || []))].map(d => document().devices[d]) : []};
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
  async function inspect(bank) {
    guard();
    if (options.inspect) return options.inspect(bank);
    return new Promise((resolve,reject) => {
      const epoch = powerEpoch;
      const check = () => { guard(); if (epoch !== powerEpoch) throw new Error('TV power session changed'); };
      const run = done => banks.inspect(options.service,bank,check,() => context).then(v => done(null,v),done);
      if (options.enqueue) options.enqueue(run,(e,v) => e ? reject(e) : resolve(v)); else run((e,v) => e ? reject(e) : resolve(v));
    });
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
        const bank = bankById(input.bank_id), result = await inspect(bank);
        delete result.descriptions; return result;
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
      if (input.action === 'edit') {
        checkRevision(input);
        const original = bankById(input.bank_id), candidate = model.clone(saved);
        const bank = candidate.document.banks.find(b => b.id === original.id), variant = input.variant || 'standard', patch = input.settings;
        if (!['standard','bright','dark'].includes(variant) || !patch || !Object.keys(patch).length || Object.keys(patch).some(k => !Object.hasOwn(bank.settings,k))) throw new Error('Invalid bank edit');
        const live = await inspect(bank), encoded = {};
        for (const [k,v] of Object.entries(patch)) encoded[k] = banks.encode(k,v,live.settings[k],(live.descriptions || []).find(d => d.key === k),bank);
        externalGuard(); checkRevision(input);
        for (const [k,v] of Object.entries(encoded)) {
          if (k === 'backlight' && bank.brightness_role) {
            if (bank.brightness_role === 'game_sdr') candidate.preferences.game_sdr = Number(v);
            else if (variant === 'standard') throw new Error('Choose Bright or Dark to edit shared movie SDR brightness');
            else candidate.preferences['movie_' + variant] = Number(v);
          } else if (variant === 'standard') bank.settings[k] = v;
          else { bank.variants = bank.variants || {}; bank.variants[variant] = bank.variants[variant] || {}; bank.variants[variant][k] = v; }
        }
        model.validate(candidate.document); model.preferences(candidate.preferences);
        saved = candidate;
        const affected = Object.keys(encoded).filter(k => variant === 'standard' || variant === room ||
          (k === 'backlight' && bank.brightness_role === 'game_sdr'));
        for (const k of affected) if (overrides[bank.id]) delete overrides[bank.id][k];
        // Editing an inactive room variant must not change today's viewing value.
        if (affected.length) mergeScopes(journal.restore,{[bank.id]:affected});
        journal.dirty = dirtyScopes(); persistStandards(); await reconcile(); return status();
      }
      if (input.action === 'restore') {
        const selection = selected(input.scope || 'all');
        for (const bank of selection) journal.restore[bank.id] = Object.keys(bank.settings);
        writeJournal(); changed(true); return reconcile();
      }
      if (input.action === 'save') {
        guard(); checkRevision(input); await recover();
        const selection = selected(input.scope || 'active'), candidate = model.clone(saved);
        for (const original of selection) {
          const bank = candidate.document.banks.find(b => b.id === original.id);
          for (const [k,v] of Object.entries(overrides[bank.id] || {})) {
            if (k === 'backlight' && bank.brightness_role) candidate.preferences[bank.brightness_role === 'movie_sdr' ? 'movie_' + room : 'game_sdr'] = Number(v);
            else if (model.environmentKeys(bank).includes(k) && bank.variants) { bank.variants[room] = bank.variants[room] || {}; bank.variants[room][k] = v; }
            else bank.settings[k] = v;
          }
        }
        model.validate(candidate.document); model.preferences(candidate.preferences); saved = candidate;
        for (const bank of selection) { delete overrides[bank.id]; delete journal.restore[bank.id]; }
        journal.dirty = dirtyScopes(); persistStandards(); return status();
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
