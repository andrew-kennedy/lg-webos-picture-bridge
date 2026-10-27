'use strict';

// A collection describes LG's native banks. Two devices on the same native bank
// deliberately share one standard; selecting a source never runs a picture recipe.
const banks = require('./profile-banks');
const crypto = require('crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function fail(message) { throw new Error(message); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function fields(value, allowed) {
  if (!plain(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('Unexpected profile fields');
}
function scalar(key, value, target) {
  if (key === 'blackLevel') {
    fields(value, ['secam','ntsc','pal60','ntsc443','pal','unknown','paln','palm']);
    if (Object.keys(value).length !== 8 || Object.values(value).some(v => !['auto','high','low'].includes(v))) fail('Invalid HDMI black level');
  } else if (key === 'pictureMode') {
    const range = target.dimension.dynamicRange.replace(/ALLM$/, '');
    const modes = {sdr:['filmMaker','game'], hdr:['hdrFilmMaker','hdrGame'], dolbyHdr:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame']};
    if (!(modes[range] || []).includes(value)) fail('Picture mode must match the signal range');
  } else if (!['string','number','boolean'].includes(typeof value) || String(value).length > 100 ||
      (typeof value === 'number' && !Number.isFinite(value))) fail('Invalid setting value');
}
function observedValue(key, value, target) {
  // A remote can select a preset outside our curated standards. Track that
  // deviation so power-cycle restoration still works, but never promote it
  // without the stricter standard validation.
  if (key === 'pictureMode' && typeof value === 'string' && value.length > 0 && value.length <= 100) return;
  scalar(key,value,target);
}
function validate(document) {
  fields(document, ['schema','name','devices','banks']);
  if (document.schema !== 1 || typeof document.name !== 'string' || !document.name.length || document.name.length > 100) fail('Expected a named schema 1 collection');
  const devices = document.devices || {}, ids = new Set(), targets = new Set();
  if (!plain(devices) || Object.keys(devices).length > 20 || Object.keys(devices).some(k =>
    !/^[a-z][a-z0-9_]{0,39}$/.test(k) || ['constructor','prototype','__proto__'].includes(k) ||
    typeof devices[k] !== 'string' || devices[k].length > 80)) fail('Invalid device names');
  if (!Array.isArray(document.banks) || !document.banks.length || document.banks.length > 100) fail('Expected 1–100 native banks');
  for (const bank of document.banks) {
    fields(bank, ['id','name','devices','target','settings','variants','brightness_role']);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(bank.id || '') || ['constructor','prototype','__proto__'].includes(bank.id) || ids.has(bank.id)) fail('Bank IDs must be unique');
    if (typeof bank.name !== 'string' || !bank.name.length || bank.name.length > 120) fail('Each bank needs a name');
    if (!Array.isArray(bank.devices || []) || (bank.devices || []).some(d => !Object.hasOwn(devices,d))) fail('Unknown device binding');
    const target = banks.target(bank.target), identity = canonical(target.target);
    if (targets.has(identity)) fail('Devices sharing a native bank must share one standard');
    ids.add(bank.id); targets.add(identity);
    if (!plain(bank.settings) || !Object.keys(bank.settings).length || Object.keys(bank.settings).length > 40 ||
        Object.keys(bank.settings).some(k => !target.allowed.includes(k))) fail('Unreviewed or missing settings');
    const variants = bank.variants || {};
    fields(variants, ['bright','dark']);
    for (const values of [bank.settings, ...Object.values(variants)]) {
      fields(values, Object.keys(bank.settings));
      Object.keys(values).forEach(k => scalar(k, values[k], bank.target));
    }
    if (![undefined,null,'movie_sdr','game_sdr'].includes(bank.brightness_role) ||
        (bank.brightness_role && !Object.hasOwn(bank.settings,'backlight'))) fail('Invalid brightness role');
  }
  if (Buffer.byteLength(JSON.stringify(document)) > 200000) fail('Profile collection too large');
  return clone(document);
}
function preferences(value) {
  fields(value, ['movie_bright','movie_dark','game_sdr']);
  for (const k of ['movie_bright','movie_dark','game_sdr']) {
    if (!Number.isInteger(value[k]) || value[k] < 0 || value[k] > 100) fail('SDR brightness must be an integer from 0 to 100');
  }
  return clone(value);
}
function desired(bank, room, prefs, overrides) {
  const result = Object.assign({}, clone(bank.settings), clone((bank.variants || {})[room] || {}));
  if (bank.brightness_role) result.backlight = prefs[bank.brightness_role === 'movie_sdr' ? 'movie_' + room : 'game_sdr'];
  return Object.assign(result, overrides || {});
}
function environmentKeys(bank) {
  return [...new Set(Object.values(bank.variants || {}).flatMap(v => Object.keys(v)).concat(bank.brightness_role ? ['backlight'] : []))];
}
function active(bank, context) {
  const d = bank.target.dimension;
  return !!context.ready && (!d.input || d.input === context.input) &&
    (!d.gameInput || d.gameInput === String(context.input || '').replace(/_pc$/, '')) &&
    (!d.pictureMode || d.pictureMode === context.mode) && (!d.dynamicRange || d.dynamicRange === context.range) &&
    (!d.gameGenre || d.gameGenre === (context.gameGenre || 'Standard'));
}
function scopedValues(document, input) {
  if (!plain(input)) fail('Invalid adjustment map');
  const result = {};
  for (const [id, values] of Object.entries(input)) {
    const bank = document.banks.find(b => b.id === id);
    if (!bank) fail('Unknown adjustment bank');
    fields(values, Object.keys(bank.settings));
    Object.entries(values).forEach(([k,v]) => observedValue(k,v,bank.target));
    if (Object.keys(values).length) result[id] = clone(values);
  }
  return result;
}
function backup(state) {
  const state_json = JSON.stringify(state);
  return {protocol:1, format:'lg-picture-bridge-backup', state_json,
    sha256:crypto.createHash('sha256').update(state_json).digest('hex')};
}
function decodeBackup(envelope) {
  if (!plain(envelope) || envelope.protocol !== 1 || envelope.format !== 'lg-picture-bridge-backup' ||
      typeof envelope.state_json !== 'string' || Buffer.byteLength(envelope.state_json) > 750000 ||
      crypto.createHash('sha256').update(envelope.state_json).digest('hex') !== envelope.sha256) fail('Backup checksum or format is invalid');
  const state = JSON.parse(envelope.state_json);
  if (state.schema !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 1) fail('Invalid backup state');
  validate(state.document); preferences(state.preferences); scopedValues(state.document,state.overrides || {});
  return state;
}
module.exports = {clone, canonical, validate, preferences, desired, environmentKeys, active, scopedValues,
  backup, decodeBackup, scalar, observedValue, same:banks.same};
