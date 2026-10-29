'use strict';

// Explicit saved-bank operations for the HA companion. This interface is bounded
// to reviewed picture/HDMI settings, and never accepts arbitrary Luna methods.
var settings = require('./settings-controls');
var executor = require('./luna-executor');
var PRESETS = ['filmMaker', 'hdrFilmMaker', 'game', 'hdrGame', 'dolbyHdrGame',
  'dolbyHdrCinema', 'dolbyHdrCinemaBright'];
var RANGES = ['sdr', 'sdrALLM', 'hdr', 'hdrALLM', 'dolbyHdr', 'dolbyHdrALLM'];
var PICTURE = ('backlight contrast brightness color tint sharpness colorTemperature colorGamut gamma gammaLevel ' +
  'peakBrightness hdrDynamicToneMapping expressionEnhancer dynamicContrast dynamicColor superResolution ' +
  'noiseReduction mpegNoiseReduction smoothGradation realCinema truMotionJudder truMotionBlur motionEyeCare motionProOLED ' +
  'aiHdrRemastering ambientLightCompensation filmmakerAmbientLight dolbyPrecisionDetail nearBlackDetail blackLevel').split(' ');
var GAME = ['gameAdjustContrast', 'gameBlackLevel', 'gameColorDepth', 'gameSharpness',
  'blackStabilizer', 'whiteStabilizer', 'lowLevelAdjustment'];
var PORT = ['gameGenre', 'inputOptimization', 'gameOptimization', 'enableALLM', 'enableQFT',
  'enable144HzBooster', 'uhdDeepColor', 'freesync'];
function fail(message, code) { var e = new Error(message); e.code = code || 'invalid_profile_bank'; return e; }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function same(a, b) {
  if (plain(a) && plain(b)) return Object.keys(a).sort().join() === Object.keys(b).sort().join() &&
    Object.keys(a).every(function (k) { return same(a[k], b[k]); });
  return a !== undefined && b !== undefined && String(a) === String(b);
}
function target(source) {
  if (!plain(source) || Object.keys(source).some(function (k) { return !['category','dimension','app_id'].includes(k); }) ||
      !plain(source.dimension)) throw fail('A category and explicit dimensions are required');
  var d = source.dimension, names = Object.keys(d).sort().join(), allowed;
  if (source.category === 'picture') {
    if (!/^hdmi[1-4](_pc)?$/.test(d.input || '')) throw fail('Invalid picture input');
    if (names === 'input,pictureMode' && PRESETS.includes(d.pictureMode)) {
      allowed = source.app_id ? ['truMotionMode'] : PICTURE;
      if (source.app_id && source.app_id !== 'com.webos.app.' + d.input.replace(/_pc$/, '')) throw fail('Wrong app binding');
    } else if (names === 'dynamicRange,input' && RANGES.includes(d.dynamicRange) && !source.app_id) allowed = ['pictureMode'];
  } else if (source.category === 'other' && /^hdmi[1-4]$/.test(d.gameInput || '') && !source.app_id) {
    if (names === 'gameInput') allowed = PORT;
    else if (names === 'dynamicRange,gameGenre,gameInput' && RANGES.includes(d.dynamicRange) &&
      ['Standard','FPS','RPG','RTS','Sports','USER'].includes(d.gameGenre)) allowed = GAME;
  }
  if (!allowed) throw fail('Unsupported saved-bank dimensions');
  return {target: JSON.parse(JSON.stringify(source)), allowed: allowed};
}
function normalize(command) {
  if (!plain(command) || !['read','apply'].includes(command.action) ||
      Object.keys(command).some(function (k) { return !['action','banks'].includes(k); }) ||
      !Array.isArray(command.banks) || !command.banks.length || command.banks.length > 8) throw fail('Read/apply requires 1–8 banks');
  var ids = {};
  return {action: command.action, banks: command.banks.map(function (bank) {
    if (!plain(bank) || !/^[a-zA-Z0-9_-]{1,80}$/.test(bank.id || '') ||
        ['__proto__','prototype','constructor'].includes(bank.id) || ids[bank.id] ||
        Object.keys(bank).some(function (k) { return !['id','target','keys','settings','expected'].includes(k); })) throw fail('Invalid bank ID or fields');
    ids[bank.id] = true;
    var t = target(bank.target), keys = command.action === 'read' ? bank.keys : Object.keys(bank.settings || {});
    if (!Array.isArray(keys) || !keys.length || keys.length > 40 || new Set(keys).size !== keys.length ||
        keys.some(function (k) { return !t.allowed.includes(k); })) throw fail('Unreviewed setting in saved bank');
    if (command.action === 'apply' && (!plain(bank.settings) || !plain(bank.expected) ||
        keys.slice().sort().join() !== Object.keys(bank.expected).sort().join())) throw fail('Apply requires expected values for every setting');
    return {id: bank.id, target: t.target, keys: keys,
      settings: command.action === 'apply' ? JSON.parse(JSON.stringify(bank.settings)) : null,
      expected: command.action === 'apply' ? JSON.parse(JSON.stringify(bank.expected)) : null};
  })};
}
function request(service, method, payload) {
  return new Promise(function (resolve, reject) {
    settings.call(service, method, payload, function (error, result) {
      if (error) reject(error);
      else if (result.returnValue !== true) reject(fail(result.errorText || 'TV did not confirm read', 'profile_read_failed'));
      else resolve(result);
    });
  });
}
function write(service, payload) {
  return new Promise(function (resolve, reject) {
    executor.executeOne(service, {kind:'saved_profile', params:payload}, function (error, result) { if (error) reject(error); else resolve(result); });
  });
}
function encode(key, value, previous, desc, bank) {
  if (key === 'pictureMode') {
    var range = bank.target.dimension.dynamicRange;
    var allowed = range.startsWith('sdr') ? ['game','filmMaker'] : range.startsWith('hdr') ? ['hdrGame','hdrFilmMaker'] :
      ['dolbyHdrGame','dolbyHdrCinema','dolbyHdrCinemaBright'];
    if (!allowed.includes(value)) throw fail('Picture mode does not match range');
    return value;
  }
  if (key === 'blackLevel') {
    if (!plain(value) || !plain(previous) || Object.keys(value).sort().join() !== Object.keys(previous).sort().join() ||
        Object.values(value).some(function (v) { return !['auto','high','low'].includes(v); })) throw fail('Invalid HDMI black-level structure');
    return value;
  }
  if (!desc || (desc.dimension || []).slice().sort().join() !== Object.keys(bank.target.dimension).sort().join()) {
    throw fail('TV setting dimensions do not match the requested bank');
  }
  if (Boolean(desc.dbtype === 'M') !== Boolean(bank.target.app_id)) throw fail('TV app scope does not match requested bank');
  var expanded = Object.assign({}, desc, {ui:{visible:true,active:true}});
  if (desc.values && Array.isArray(desc.values.arrayExt)) expanded.values = {arrayExt:desc.values.arrayExt.map(function (v) {
    return Object.assign({}, v, {visible:true,active:true});
  })};
  var control = settings.describe({key:key}, expanded, previous);
  if (!control) throw fail('TV does not describe a writable value for ' + key);
  return settings.encode(control, value);
}
async function run(service, command, guard, context) {
  var results = [];
  for (var bank of command.banks) {
    guard();
    var params = Object.assign({}, bank.target, {keys:bank.keys});
    var before = await request(service, 'getSystemSettings', params);
    if (Object.keys(bank.target.dimension).some(function (k) { return !before.dimension || before.dimension[k] !== bank.target.dimension[k]; }) ||
        (bank.target.app_id && before.app_id !== bank.target.app_id) || bank.keys.some(function (k) { return before.settings[k] === undefined; })) {
      throw fail('TV read returned a different or incomplete saved bank', 'profile_scope_mismatch');
    }
    var result = {id:bank.id, target:bank.target, settings:before.settings, changed:[]};
    if (command.action === 'apply') {
      // The G6 description schema accepts category/keys, not saved-value dimensions.
      // Validate the returned dimension names and app ownership against our target below.
      var desc = await request(service, 'getSystemSettingDesc', {category:bank.target.category,keys:bank.keys});
      var patch = {};
      for (var key of bank.keys) {
        if (same(before.settings[key], bank.settings[key])) continue;
        if (!same(before.settings[key], bank.expected[key])) throw fail('Setting changed since it was read: ' + key, 'profile_conflict');
        patch[key] = encode(key, bank.settings[key], before.settings[key], (desc.results || []).find(function (d) { return d.key === key; }), bank);
      }
      guard();
      if (Object.keys(patch).length) {
        // LG's ArrayExt check uses the CURRENT signal's visible choices even
        // for an explicit inactive bank (for example DV while Home is SDR).
        // Values were already checked above against the native ranges/options
        // and reviewed mode families. Avoid that second active-context filter;
        // scope, expected values and native readback still have to match.
        await write(service, Object.assign({}, bank.target, {settings:patch,store:true,notify:true,valueCheck:false}));
        var active = context && context();
        if (patch.pictureMode && active && active.ready && active.input === bank.target.dimension.input && active.range === bank.target.dimension.dynamicRange) {
          guard();
          await write(service, Object.assign({}, bank.target, {settings:{pictureMode:patch.pictureMode},store:false,notify:true}));
        }
        var after = await request(service, 'getSystemSettings', params);
        if (Object.keys(bank.target.dimension).some(function (k) { return !after.dimension || after.dimension[k] !== bank.target.dimension[k]; }) ||
            (bank.target.app_id && after.app_id !== bank.target.app_id) || bank.keys.some(function (k) { return !same(after.settings[k], bank.settings[k]); })) {
          throw fail('Saved-bank readback did not match', 'profile_readback_failed');
        }
        result.settings = after.settings; result.changed = Object.keys(patch);
      }
    }
    results.push(result);
  }
  return {action:command.action, banks:results};
}
// Reuse the existing category subscriptions for managed values that need no
// individual HA control (for example structured HDMI RGB range).
var observationKeys = {picture:PICTURE.concat(['pictureMode','truMotionMode','truMotionJudder','truMotionBlur']),
  other:GAME.concat(PORT)};
function observation(category, key, description, record, context) {
  if (!description || !record || !context || !context.ready ||
      !/^hdmi[1-4](_pc)?$/.test(context.input || '') || !Array.isArray(description.dimension) ||
      !Number.isFinite(record.observed_at)) return null;
  var dimensions = {}, physical = context.input.replace(/_pc$/, '');
  var expected = {input:context.input, pictureMode:context.mode, dynamicRange:context.range, gameInput:physical};
  for (var name of description.dimension) {
    var value = (record.dimension || {})[name];
    if (typeof value !== 'string' || (expected[name] && expected[name] !== value)) return null;
    dimensions[name] = value;
  }
  var scope = {category:category, dimension:dimensions};
  if (description.dbtype === 'M') {
    if (record.app_id !== 'com.webos.app.' + physical) return null;
    scope.app_id = record.app_id;
  }
  try { if (!target(scope).allowed.includes(key)) return null; } catch (error) { return null; }
  if (record.value === null || record.value === undefined || JSON.stringify(record.value).length > 2048) return null;
  return {target:scope, key:key, value:record.value, observed_at:new Date(record.observed_at).toISOString()};
}
module.exports = {normalize:normalize, target:target, run:run, same:same,
  observationKeys:observationKeys, observation:observation, request:request, encode:encode,
  async inspect(service, bank, guard, context) {
    var result = (await run(service, normalize({action:'read',banks:[{
      id:bank.id,target:bank.target,keys:Object.keys(bank.settings)}]}),guard,context)).banks[0];
    guard();
    var desc = await request(service,'getSystemSettingDesc',{category:bank.target.category,keys:Object.keys(bank.settings)});
    result.descriptions = desc.results || [];
    result.controls = {};
    for (var key of Object.keys(bank.settings)) {
      var d = result.descriptions.find(v => v.key === key);
      if (!d) continue;
      var expanded = Object.assign({},d,{ui:{visible:true,active:true}});
      if (d.values && Array.isArray(d.values.arrayExt)) expanded.values = {arrayExt:d.values.arrayExt.map(v => Object.assign({},v,{visible:true,active:true}))};
      var control = settings.describe({key:key},expanded,result.settings[key]);
      if (control) result.controls[key] = control;
    }
    return result;
  }};
