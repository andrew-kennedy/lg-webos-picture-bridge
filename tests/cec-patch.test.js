'use strict';
var assert = require('assert');
var vm = require('vm');
var patch = require('../app/bridge/lib/cec-patch');

module.exports = function () {
  var device = {id: 'SIMPLINK', portId: 2, vendorId: 12345, uniqueId: 4, cecpDevType: 4, osdName: 'Test player'};
  var rules = {version: 1, enabled: true, rules: [{id: 'player', match: {input: 'hdmi2', vendor_id: 12345}, block: ['automatic_selection']}]};
  var lease = {schema: 2, enabled: true, issued_at: 1000, expires_at: 91000, policy: rules};
  assert(patch.validLease(lease, 1000));
  assert(!patch.validLease(lease, 999));
  assert(!patch.validLease(lease, 91000));
  assert(!patch.validLease(Object.assign({}, lease, {expires_at: 91001}), 2000));
  assert(!patch.validLease(Object.assign({}, lease, {enabled: false}), 2000));
  assert(!patch.validLease(Object.assign({}, lease, {expires_at: '91000'}), 2000));
  assert(!patch.validLease(Object.assign({}, lease, {schema: 1}), 2000), 'Old leases cannot enable new generic QML');
  assert(!patch.validLease(null, 2000));
  assert.throws(function () { patch.build('unrecognized firmware'); }, /Unsupported/);
  var fixture = 'ModelBase {\n    function _setCecEnable() {\n' +
    '            externalService.setCecUniqueId(pipelineId, uniqueId);\n    }\n}';
  var generated = patch.injectForTest(fixture);
  assert(!/Apple|4346|appletv/.test(generated), 'Generated QML contains no built-in device identity');
  assert.throws(function () { patch.injectForTest(generated); }, /Unexpected/);
  assert.throws(function () { patch.injectForTest(fixture + fixture); }, /Unexpected/);
  var calls = 0, fail = false, raw = JSON.stringify(lease), clock = 2000;
  function XHR() { this.status = 0; }
  XHR.prototype.open = function (method, url, async) {
    assert.strictEqual(method, 'GET'); assert.strictEqual(url, patch.POLICY_URL); assert.strictEqual(async, false);
  };
  XHR.prototype.send = function () { if (fail) throw Error('File read denied'); this.responseText = raw; };
  var context = {XMLHttpRequest: XHR, console: {log: function () {}}, Date: {now: function () { return clock; }},
    globalVars: {appId: 'com.webos.app.hdmi2', launchParam: {}}, uniqueId: 4, pipelineId: 'fixed',
    inputInfoModel: {subList: [device]}, externalService: {setCecUniqueId: function () { calls++; }}};
  vm.runInNewContext(generated.replace(/^ModelBase \{/, '').replace(/\}\s*$/, ''), context);
  context._setCecEnable(); assert.strictEqual(calls, 0);
  raw = JSON.stringify(Object.assign({}, lease, {enabled: false}));
  context._setCecEnable(); assert.strictEqual(calls, 1, 'Disable takes effect in cached QML');
  raw = JSON.stringify(lease); clock = 91000;
  context._setCecEnable(); assert.strictEqual(calls, 2, 'Dead bridge fails open without a watchdog');
  clock = 2000; fail = true; context._setCecEnable(); assert.strictEqual(calls, 3);
  fail = false; raw = 'malformed'; context._setCecEnable(); assert.strictEqual(calls, 4);
  rules.rules[0].match.vendor_id = 999;
  raw = JSON.stringify(lease); context._setCecEnable(); assert.strictEqual(calls, 5, 'Rules update without recompiling QML');
  rules.rules[0].match.vendor_id = 12345; raw = JSON.stringify(lease);
  context._setCecEnable(); assert.strictEqual(calls, 5);
  context.globalVars.launchParam.launchUniqueId = '4'; context._setCecEnable(); assert.strictEqual(calls, 6);
};
