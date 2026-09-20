'use strict';
var assert = require('assert');
var inventory = require('../app/bridge/lib/cec-inventory');
module.exports = function () {
  var payload = {returnValue: true, devices: [{id: 'HDMI_3', lastUniqueId: 8, connected: true,
    subList: [{id: 'SIMPLINK', portId: 3, uniqueId: 4, vendorId: 123, osdName: 'Player', cecpDevType: 4, physicalAddress: 12800},
      {id: 'URCU', brandName: 'IR-only'}, {id: 'SIMPLINK', portId: 4}]}]};
  var devices = inventory.extract(payload);
  assert.strictEqual(devices.length, 1); assert.strictEqual(devices[0].vendor_id, 123);
  assert(!Object.prototype.hasOwnProperty.call(devices[0], 'active'), 'Cached CEC metadata is not external switch route');
  assert.throws(function () { inventory.extract({returnValue: false}); });
  var replies = [], polls = [], intervals = [], deadlines = [], changes = [];
  var service = {call: function (uri, params, callback) { assert(uri.endsWith('/getAllInputStatus')); replies.push(callback); polls.push(uri); return {cancel: function () {}}; }};
  var watcher = inventory.create(service, function (value) { changes.push(value); }, {
    setInterval: function (callback, ms) { assert.strictEqual(ms, 30000); intervals.push(callback); return 1; }, clearInterval: function () {},
    setTimeout: function (callback) { deadlines.push(callback); return 1; }, clearTimeout: function () {}});
  watcher.start(); replies[0]({payload: payload});
  assert.strictEqual(changes[0].state, 'observed');
  intervals[0](); deadlines[1]();
  assert.strictEqual(changes[1].state, 'unavailable'); assert.deepStrictEqual(changes[1].devices, []);
  replies[1]({payload: payload}); assert.strictEqual(changes.length, 2, 'Late responses cannot revive timed-out discovery');
  intervals[0](); watcher.stop(); replies[2]({payload: payload}); assert.strictEqual(changes.length, 2);
};
