'use strict';

// Device identities are configuration, never firmware-specific constants.
var ACTIONS = ['automatic_selection'];
var INPUTS = ['hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'];
function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_cec_policy', label + ' must be an object');
  Object.keys(value).forEach(function (key) {
    if (keys.indexOf(key) === -1) fail('invalid_cec_policy', 'Unknown ' + label + ' field: ' + key);
  });
}
function integer(value, max) { return typeof value === 'number' && isFinite(value) && value >= 0 && value <= max && Math.floor(value) === value; }
function normalize(value) {
  object(value, ['version', 'enabled', 'rules'], 'policy');
  if (value.version !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.rules) || value.rules.length > 32) {
    fail('invalid_cec_policy', 'Provide version: 1, enabled: boolean and up to 32 rules');
  }
  var ids = Object.create(null);
  return {version: 1, enabled: value.enabled, rules: value.rules.map(function (rule) {
    object(rule, ['id', 'match', 'block'], 'rule');
    if (typeof rule.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(rule.id) ||
        ['constructor', 'prototype', '__proto__'].indexOf(rule.id) !== -1 || ids[rule.id]) {
      fail('invalid_cec_policy', 'Rule IDs must be unique, 1–64 letters, digits, hyphens or underscores');
    }
    ids[rule.id] = true;
    object(rule.match, ['input', 'vendor_id', 'osd_name', 'device_type', 'physical_address'], 'match');
    if (!Object.keys(rule.match).length) fail('invalid_cec_policy', 'Each rule needs at least one explicit match field');
    var match = {};
    Object.keys(rule.match).sort().forEach(function (key) {
      var v = rule.match[key];
      if (key === 'input' && INPUTS.indexOf(v) === -1) fail('invalid_cec_policy', 'input must be hdmi1, hdmi2, hdmi3 or hdmi4');
      if (key === 'osd_name' && (typeof v !== 'string' || !v.trim() || v.length > 64 || /[\x00-\x1f\x7f]/.test(v))) {
        fail('invalid_cec_policy', 'osd_name must be a nonempty name of at most 64 characters');
      }
      var maximum = {vendor_id: 16777215, device_type: 7, physical_address: 65535};
      if (Object.prototype.hasOwnProperty.call(maximum, key) && !integer(v, maximum[key])) {
        fail('invalid_cec_policy', key + ' must be an in-range integer');
      }
      match[key] = key === 'osd_name' ? v.trim() : v;
    });
    if (!Array.isArray(rule.block) || !rule.block.length || rule.block.length > 2) fail('invalid_cec_policy', 'block must be a nonempty action list');
    var block = [];
    rule.block.forEach(function (action) {
      if (ACTIONS.indexOf(action) === -1) fail('unsupported_cec_action', 'Unsupported CEC action: ' + String(action).slice(0, 64));
      if (block.indexOf(action) !== -1) fail('invalid_cec_policy', 'Duplicate block action');
      block.push(action);
    });
    return {id: rule.id, match: match, block: block.sort()};
  })};
}
function normalizeCommand(value) {
  if (value && Object.keys(value).length === 1 && typeof value.enabled === 'boolean') return {enabled: value.enabled};
  return normalize(value);
}
function empty() { return {version: 1, enabled: false, rules: []}; }

// ES5, pure and self-contained: this function is also embedded in native Qt QML.
function matchingRule(policy, action, appId, launchUniqueId, uniqueId, devices) {
  if (!policy || policy.version !== 1 || policy.enabled !== true || action !== 'automatic_selection' ||
      launchUniqueId || !Array.isArray(policy.rules) || policy.rules.length > 32 || !Array.isArray(devices)) return null;
  var input = /^com\.webos\.app\.hdmi([1-4])$/.exec(appId || '');
  if (!input || uniqueId === undefined || uniqueId === null || uniqueId === '') return null;
  var selected = null;
  for (var i = 0; i < devices.length; i++) {
    var device = devices[i];
    if (device && String(device.uniqueId) === String(uniqueId)) {
      if (selected) return null; // Ambiguity is never permission to block.
      selected = device;
    }
  }
  if (!selected || selected.id !== 'SIMPLINK' || Number(selected.portId) !== Number(input[1])) return null;
  var identity = {input: 'hdmi' + input[1], vendor_id: selected.vendorId, osd_name: selected.osdName,
    device_type: selected.cecpDevType, physical_address: selected.physicalAddress};
  for (var r = 0; r < policy.rules.length; r++) {
    var rule = policy.rules[r];
    if (!rule || !rule.match || !Array.isArray(rule.block) || rule.block.indexOf(action) === -1) continue;
    var keys = Object.keys(rule.match), matches = keys.length > 0;
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k], expected = rule.match[key], actual = identity[key];
      if (!Object.prototype.hasOwnProperty.call(identity, key) || actual === undefined || actual === null) { matches = false; break; }
      if (key === 'osd_name') {
        if (typeof actual !== 'string' || typeof expected !== 'string' || actual.trim().toLowerCase() !== expected.trim().toLowerCase()) matches = false;
      } else if (key === 'input') {
        if (actual !== expected) matches = false;
      } else if (typeof expected !== 'number' || !isFinite(Number(actual)) || Number(actual) !== expected) matches = false;
    }
    if (matches) return rule.id;
  }
  return null;
}

module.exports = {normalize: normalize, normalizeCommand: normalizeCommand, empty: empty, matchingRule: matchingRule,
  capabilities: function () { return {supported_actions: ACTIONS.slice(), inputs: INPUTS.slice(),
    direction: 'tv_to_device', standby_supported: false,
    standby_reason: 'No verified per-device standby interception on this firmware',
    automatic_selection_scope: 'LG HDMI app automatic CEC selection only; explicit selection and other power paths are unchanged'}; }};
