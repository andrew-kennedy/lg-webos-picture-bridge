'use strict';

var assert = require('assert');
var vm = require('vm');
var guard = require('../experiments/apple-tv-cec/guard');

module.exports = function () {
    var apple = {id: 'SIMPLINK', uniqueId: 4, vendorId: 4346, portId: 3,
        cecpDevType: 4, osdName: 'Apple TV'};
    function run(changes) {
        var args = ['com.webos.app.hdmi3', '', '4', [apple], 1001, 1000, 31000];
        Object.keys(changes || {}).forEach(function (key) { args[Number(key)] = changes[key]; });
        return guard.shouldSuppress.apply(null, args);
    }
    assert.strictEqual(run(), true);
    assert.strictEqual(run({0: 'com.webos.app.hdmi1'}), false);
    assert.strictEqual(run({0: 'com.webos.app.hdmi4'}), false);
    assert.strictEqual(run({1: '4'}), false, 'Explicit device selection remains untouched');
    assert.strictEqual(run({2: '8'}), false, 'Logical address is not hardcoded');
    assert.strictEqual(run({3: []}), false);
    assert.strictEqual(run({3: null}), false);
    assert.strictEqual(run({3: [apple, apple]}), false, 'Ambiguous discovery fails open');
    assert.strictEqual(run({4: 31000}), false, 'Already cached QML expires too');
    assert.strictEqual(run({4: 999}), false, 'Clock moving before trial fails open');
    assert.strictEqual(run({4: NaN}), false);
    ['id', 'portId', 'vendorId', 'cecpDevType', 'osdName'].forEach(function (key) {
        var device = JSON.parse(JSON.stringify(apple));
        delete device[key];
        assert.strictEqual(run({3: [device]}), false, 'Missing identity ' + key);
    });
    var nintendo = {id: 'SIMPLINK', uniqueId: 4, portId: 3, vendorId: 6380,
        cecpDevType: 4, osdName: 'Nintendo Switch'};
    assert.strictEqual(run({3: [nintendo]}), false, 'Nintendo on same port/address is not blocked');
    var relocated = JSON.parse(JSON.stringify(apple));
    relocated.uniqueId = 8;
    assert.strictEqual(run({2: '8', 3: [relocated]}), true);
    assert.throws(function () { guard.checkOriginal(new Buffer('unknown firmware')); }, /Unsupported/);
    assert.throws(function () { guard.build(new Buffer('unknown firmware'), 1000, 31000); }, /Unsupported/);
    var fixture = 'ModelBase {\n    function _setCecEnable() {\n' +
        '            externalService.setCecUniqueId(pipelineId, uniqueId);\n    }\n}\n';
    var patched = guard.injectForTest(fixture, 1000, 31000);
    assert.strictEqual(patched.split('externalService.setCecUniqueId(pipelineId, uniqueId);').length, 2);
    assert(patched.indexOf('LGPB_CEC_TRIAL suppressed') !== -1);
    assert(patched.indexOf('Date.now(), 1000, 31000') !== -1);
    assert.throws(function () { guard.injectForTest(patched, 1000, 31000); }, /Unexpected/);
    assert.throws(function () { guard.injectForTest(fixture, 1000, 601001); }, /30 to 600/);
    assert.throws(function () { guard.injectForTest(fixture + fixture, 1000, 31000); }, /Unexpected/);
    var context = {};
    // The generated helper and call-site must remain valid standalone ES5 JavaScript.
    vm.runInNewContext(patched.replace('ModelBase {', '').replace(/}\s*$/, ''), context);
    assert.strictEqual(context._lgpbShouldSuppress('com.webos.app.hdmi3', '', 4,
        [apple], 1001, 1000, 31000), true);
    var calls = 0;
    context.externalService = {setCecUniqueId: function () { calls++; }};
    context.globalVars = {appId: 'com.webos.app.hdmi3', launchParam: {launchUniqueId: ''}};
    context.inputInfoModel = {subList: [apple]};
    context.uniqueId = '4'; context.pipelineId = 'hdmi-session';
    context.Date = {now: function () { return 1001; }};
    context.console = {log: function () {}};
    context._setCecEnable(); assert.strictEqual(calls, 0);
    context.Date.now = function () { return 31000; };
    context._setCecEnable(); assert.strictEqual(calls, 1, 'Original call resumes after deadline');
};
