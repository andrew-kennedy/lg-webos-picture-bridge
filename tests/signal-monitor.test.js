'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var monitor = require('../app/bridge/lib/signal-monitor');

module.exports = function () {
  var calls = [];
  var changes = [];
  var health = [];
  var service = {subscribe: function (uri, payload) {
    var sub = new EventEmitter();
    sub.cancel = function () { sub.emit('cancel'); };
    calls.push({uri: uri, payload: payload, sub: sub});
    return sub;
  }};
  var watcher = monitor.create(service, function (state) { changes.push(state); }, function (state) { health.push(state); });
  function respond(index, payload) { calls[index].sub.emit('response', {payload: payload}); }
  function foreground(id, input) {
    return {returnValue: true, appId: 'com.webos.app.' + (input || 'hdmi3'), acbs: [
      {playerType: 'external input', pipelineId: id}
    ]};
  }
  function state(id, signal, saver) {
    return {returnValue: true, externalInputId: id, signalState: {videoSignalState: signal, screensaverType: saver}};
  }
  watcher.start();
  respond(0, foreground('session1'));
  assert.strictEqual(calls[1].payload.externalInputId, 'session1');
  respond(1, state('session1', 'good', 'NO_SCREEN_SAVER'));
  assert.strictEqual(changes[changes.length - 1].signal_present, true);
  respond(1, state('session1', 'bad', 'NO_SIGNAL'));
  assert.strictEqual(changes[changes.length - 1].signal_present, false);
  assert.strictEqual(changes[changes.length - 1].input, 'hdmi3');
  respond(1, state('session1', 'good', 'NO_SCREEN_SAVER'));
  assert.strictEqual(changes[changes.length - 1].signal_present, true);
  respond(0, foreground('session2', 'hdmi1'));
  assert.strictEqual(changes[changes.length - 1].signal_present, null);
  var count = changes.length;
  respond(1, state('session1', 'bad', 'NO_SIGNAL'));
  assert.strictEqual(changes.length, count, 'Old session callback must be ignored');
  respond(2, state('wrong-session', 'good', 'NO_SCREEN_SAVER'));
  assert.strictEqual(changes.length, count);
  respond(2, state('session2', 'unexpected', 'OTHER'));
  assert.strictEqual(changes[changes.length - 1].signal_present, null);
  respond(2, state('session2', 'good', 'NO_SCREEN_SAVER'));
  calls[2].sub.emit('error', new Error('lost'));
  assert.strictEqual(changes[changes.length - 1].signal_present, null, 'Lost subscription must not become OFF');
  assert.strictEqual(health[health.length - 1].state, 'error');
  watcher.stop();
  count = changes.length;
  respond(0, foreground('late'));
  assert.strictEqual(changes.length, count);
};
