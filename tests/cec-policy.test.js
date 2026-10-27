'use strict';
var assert = require('assert');
var policy = require('../app/bridge/lib/cec-policy');
module.exports = function () {
  function rule(match) { return {version: 1, enabled: true, rules: [{id: 'test', match: match, block: ['automatic_selection']}]}; }
  var a = {id: 'SIMPLINK', portId: 3, vendorId: 123, uniqueId: 8, physicalAddress: 12800, osdName: 'Player', cecpDevType: 4};
  function matches(p, d, app, explicit) { return policy.matchingRule(p, 'automatic_selection', app || 'com.webos.app.hdmi3', explicit, 8, d || [a]); }
  assert.strictEqual(matches(policy.normalize(rule({vendor_id: 123, osd_name: 'player'}))), 'test');
  assert.strictEqual(matches(policy.normalize(rule({input: 'hdmi3'}))), 'test');
  assert.strictEqual(matches(policy.normalize(rule({physical_address: 12800, device_type: 4}))), 'test');
  assert.strictEqual(matches(rule({vendor_id: 999})), null);
  assert.strictEqual(matches(rule({input: 'hdmi3'}), [a, a]), null);
  assert.strictEqual(matches(rule({input: 'hdmi3'}), [a], 'com.webos.app.hdmi4'), null);
  assert.strictEqual(matches(rule({input: 'hdmi3'}), [a], undefined, '8'), null);
  var other = Object.assign({}, a, {uniqueId: 4, vendorId: 456, osdName: 'Other player'});
  function fallback(devices, explicit, id, app, enabled) {
    var p = rule({input: 'hdmi3', vendor_id: 123, osd_name: 'player'});
    if (enabled === false) p.enabled = false;
    return policy.matchingRule(p, 'automatic_selection', app || 'com.webos.app.hdmi3', explicit,
      id === undefined ? 255 : id, devices);
  }
  assert.strictEqual(fallback([other, a]), 'test', 'Unknown fallback may restore a protected player behind a shared input');
  assert.strictEqual(fallback([a, other], '', '255'), 'test', 'LG also reports the sentinel as a string');
  assert.strictEqual(fallback([other]), null, 'An unrelated player alone does not block an unknown fallback');
  assert.strictEqual(fallback([]), null, 'Missing inventory fails open');
  assert.strictEqual(fallback([a], '8'), null, 'Explicit device selection bypasses the filter');
  assert.strictEqual(fallback([a, other], '', 4), null, 'Known unrelated devices on the shared input remain selectable');
  assert.strictEqual(fallback([a], '', 0), null, 'Selecting the TV itself is not an unknown-device fallback');
  assert.strictEqual(fallback([a], '', -1), null, 'Only the observed 255 sentinel uses fallback matching');
  assert.strictEqual(fallback([a], '', 255, 'com.webos.app.hdmi4'), null, 'A protected device on another input is irrelevant');
  assert.strictEqual(fallback([a], '', 255, undefined, false), null, 'Disabling policy also disables fallback filtering');
  assert.strictEqual(fallback([Object.assign({}, a, {id: 'HDMI'})]), null);
  assert.strictEqual(fallback([Object.assign({}, a, {uniqueId: 255})]), null, 'Unidentified inventory is not proof of a protected CEC device');
  ['hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'].forEach(function (input, index) {
    var d = Object.assign({}, a, {portId: index + 1});
    assert.strictEqual(matches(rule({input: input}), [d], 'com.webos.app.' + input), 'test');
  });
  [{}, {shell: 'x'}, {input: 'hdmi5'}, {vendor_id: '123'}, {vendor_id: -1}, {vendor_id: 16777216},
    {physical_address: 65536}, {device_type: 8}, {osd_name: ''}, {osd_name: '\nPlayer'}].forEach(function (match) {
    assert.throws(function () { policy.normalize(rule(match)); });
  });
  var unsupported = rule({input: 'hdmi3'}); unsupported.rules[0].block.push('standby');
  assert.throws(function () { policy.normalize(unsupported); }, function (e) { return e.code === 'unsupported_cec_action'; });
  var duplicate = rule({input: 'hdmi1'}); duplicate.rules.push(duplicate.rules[0]);
  assert.throws(function () { policy.normalize(duplicate); });
  assert.deepStrictEqual(policy.normalizeCommand({enabled: false}), {enabled: false});
  assert.throws(function () { policy.normalizeCommand({enabled: true, command: 'reboot'}); });
  assert.deepStrictEqual(policy.capabilities().supported_actions, ['automatic_selection']);
};
