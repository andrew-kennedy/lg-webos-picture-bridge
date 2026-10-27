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
  var fixture = 'Item {\n    function windowMinimizedAction () {\n' +
    '        deeplinkHandler.launchUniqueId = "";\n' +
    '        isSetCecUniqueId = false;\n        uniqueId = "0";\n    }\n' +
    '    function _setCecUniqueId () {\n        var cecUniqueId = uniqueId|0;\n' +
    '        setCECUniqueId(cecUniqueId, portId);\n    }\n}';
  var generated = patch.injectForTest(fixture);
  assert(!/Apple|4346|appletv/.test(generated), 'Generated QML contains no built-in device identity');
  assert.throws(function () { patch.injectForTest(generated); }, /Unexpected/);
  assert.throws(function () { patch.injectForTest(fixture + fixture); }, /Unexpected/);
  assert.throws(function () { patch.injectForTest(fixture.replace('deeplinkHandler.launchUniqueId = "";', '')); }, /Unexpected/);
  var calls = 0, fail = false, raw = JSON.stringify(lease), clock = 2000;
  function XHR() { this.status = 0; }
  XHR.prototype.open = function (method, url, async) {
    assert.strictEqual(method, 'GET'); assert.strictEqual(url, patch.POLICY_URL); assert.strictEqual(async, false);
  };
  XHR.prototype.send = function () { if (fail) throw Error('File read denied'); this.responseText = raw; };
  var context = {XMLHttpRequest: XHR, console: {log: function () {}}, Date: {now: function () { return clock; }},
    portId: 2, uniqueId: 4, subList: [device], deeplinkHandler: {launchUniqueId: ''},
    Qt: {binding: function (evaluate) { return {evaluate: evaluate}; }},
    setCECUniqueId: function (id, port) { assert.strictEqual(id, Number(context.uniqueId)); assert.strictEqual(port, 2); calls++; }};
  // Model QML's binding removal after an imperative assignment. LG assigns
  // launchUniqueId when a user selects a CEC device; that value must not survive
  // HDMI minimization and masquerade as a fresh explicit selection on wake.
  var selection = {evaluate: function () { return context.deeplinkHandler.launchUniqueId; }};
  Object.defineProperty(context, 'launchUniqueId', {
    get: function () { return selection && selection.evaluate ? selection.evaluate() : selection; },
    set: function (value) { selection = value; }
  });
  vm.runInNewContext(generated.replace(/^Item \{/, '').replace(/\}\s*$/, ''), context);
  context._setCecUniqueId(); assert.strictEqual(calls, 0);
  raw = JSON.stringify(Object.assign({}, lease, {enabled: false}));
  context._setCecUniqueId(); assert.strictEqual(calls, 1, 'Disable takes effect in cached QML');
  raw = JSON.stringify(lease); clock = 91000;
  context._setCecUniqueId(); assert.strictEqual(calls, 2, 'Dead bridge fails open without a watchdog');
  clock = 2000; fail = true; context._setCecUniqueId(); assert.strictEqual(calls, 3);
  fail = false; raw = 'malformed'; context._setCecUniqueId(); assert.strictEqual(calls, 4);
  rules.rules[0].match.vendor_id = 999;
  raw = JSON.stringify(lease); context._setCecUniqueId(); assert.strictEqual(calls, 5, 'Rules update without recompiling QML');
  rules.rules[0].match.vendor_id = 12345; raw = JSON.stringify(lease);
  context._setCecUniqueId(); assert.strictEqual(calls, 5);
  context.launchUniqueId = '4'; context._setCecUniqueId(); assert.strictEqual(calls, 6);
  context.deeplinkHandler.launchUniqueId = '';
  assert.strictEqual(context.launchUniqueId, '4', 'Reproduce LG retaining the explicit device after clearing only the source');
  context.windowMinimizedAction();
  assert.strictEqual(context.launchUniqueId, '', 'Standby clears the retained explicit device');
  assert.strictEqual(context.isSetCecUniqueId, false);
  context.uniqueId = 4; context._setCecUniqueId();
  assert.strictEqual(calls, 6, 'Wake-time automatic selection is filtered after earlier explicit selection');
  context.deeplinkHandler.launchUniqueId = '4';
  context._setCecUniqueId();
  assert.strictEqual(calls, 7, 'A fresh deferred explicit selection still follows the restored binding');
  context.windowMinimizedAction();
  context.launchUniqueId = '4'; context.uniqueId = 4; context._setCecUniqueId();
  assert.strictEqual(calls, 8, 'A fresh direct explicit selection remains available after repeated wakes');
  context.windowMinimizedAction(); context.uniqueId = 255;
  context._setCecUniqueId();
  assert.strictEqual(calls, 8, 'Wake with unknown ID cannot restore the protected last physical route');
  context.subList = [Object.assign({}, device, {uniqueId: 8, vendorId: 456}), device];
  context._setCecUniqueId();
  assert.strictEqual(calls, 8, 'The wake-time fallback is filtered with multiple devices on the input');
  context.uniqueId = 8; context._setCecUniqueId();
  assert.strictEqual(calls, 9, 'A known unprotected source can still select the shared input');
  context.uniqueId = 255; clock = 91000; context._setCecUniqueId();
  assert.strictEqual(calls, 10, 'Unknown-device fallback also fails open when the bridge lease expires');
  clock = 2000; context.launchUniqueId = '4'; context._setCecUniqueId();
  assert.strictEqual(calls, 11, 'A fresh explicit selection keeps LG behavior even with unknown cached ID');
};
