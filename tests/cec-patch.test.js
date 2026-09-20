'use strict';
var assert = require('assert');
var vm = require('vm');
var patch = require('../app/bridge/lib/cec-patch');

module.exports = function () {
  var apple = {id: 'SIMPLINK', portId: 3, vendorId: 4346, uniqueId: 4, cecpDevType: 4, osdName: 'Apple TV'};
  var nintendo = {id: 'SIMPLINK', portId: 3, vendorId: 2495, uniqueId: 8, cecpDevType: 4, osdName: 'Switch 2'};
  assert(patch.matchesApple('com.webos.app.hdmi3', '', 4, [apple, nintendo]));
  assert(!patch.matchesApple('com.webos.app.hdmi3', '', 8, [apple, nintendo]));
  assert(!patch.matchesApple('com.webos.app.hdmi3', '4', 4, [apple]));
  assert(!patch.matchesApple('com.webos.app.hdmi1', '', 4, [apple]));
  assert(!patch.matchesApple('com.webos.app.hdmi3', '', 4, [apple, apple]));
  assert(!patch.matchesApple('com.webos.app.hdmi3', '', 4, null));
  ['id', 'portId', 'vendorId', 'cecpDevType', 'osdName'].forEach(function (key) {
    var d = Object.assign({}, apple); delete d[key];
    assert(!patch.matchesApple('com.webos.app.hdmi3', '', 4, [d]));
  });
  var lease = {schema: 1, enabled: true, issued_at: 1000, expires_at: 91000};
  assert(patch.validLease(lease, 1000));
  assert(!patch.validLease(lease, 999));
  assert(!patch.validLease(lease, 91000));
  assert(!patch.validLease(Object.assign({}, lease, {expires_at: 91001}), 2000));
  assert(!patch.validLease(Object.assign({}, lease, {enabled: false}), 2000));
  assert(!patch.validLease(Object.assign({}, lease, {expires_at: '91000'}), 2000));
  assert(!patch.validLease(null, 2000));
  assert.throws(function () { patch.build('unrecognized firmware'); }, /Unsupported/);
  var fixture = 'ModelBase {\n    function _setCecEnable() {\n' +
    '            externalService.setCecUniqueId(pipelineId, uniqueId);\n    }\n}';
  var generated = patch.injectForTest(fixture);
  assert.throws(function () { patch.injectForTest(generated); }, /Unexpected/);
  assert.throws(function () { patch.injectForTest(fixture + fixture); }, /Unexpected/);
  var calls = 0, reads = 0, fail = false, raw = JSON.stringify(lease), clock = 2000;
  function XHR() { this.status = 0; }
  XHR.prototype.open = function (method, url, async) {
    assert.strictEqual(method, 'GET'); assert.strictEqual(url, patch.POLICY_URL); assert.strictEqual(async, false);
  };
  XHR.prototype.send = function () { reads++; if (fail) throw Error('File read denied'); this.responseText = raw; };
  var context = {XMLHttpRequest: XHR, console: {log: function () {}}, Date: {now: function () { return clock; }},
    globalVars: {appId: 'com.webos.app.hdmi3', launchParam: {}}, uniqueId: 4, pipelineId: 'fixed',
    inputInfoModel: {subList: [apple, nintendo]}, externalService: {setCecUniqueId: function () { calls++; }}};
  vm.runInNewContext(generated.replace(/^ModelBase \{/, '').replace(/\}\s*$/, ''), context);
  context._setCecEnable(); assert.strictEqual(calls, 0);
  raw = JSON.stringify(Object.assign({}, lease, {enabled: false}));
  context._setCecEnable(); assert.strictEqual(calls, 1, 'Disable takes effect in already-loaded QML');
  raw = JSON.stringify(lease); clock = 91000;
  context._setCecEnable(); assert.strictEqual(calls, 2, 'Dead bridge fails open without a watchdog');
  clock = 2000; fail = true;
  context._setCecEnable(); assert.strictEqual(calls, 3, 'Denied/missing local policy fails open');
  fail = false; raw = 'malformed';
  context._setCecEnable(); assert.strictEqual(calls, 4);
  raw = JSON.stringify(lease); context.uniqueId = 8;
  var oldReads = reads; context._setCecEnable();
  assert.strictEqual(calls, 5); assert.strictEqual(reads, oldReads, 'Nintendo path does not even read the policy');
};
