'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var monitor = require('../app/bridge/lib/signal-monitor');

module.exports = function () {
  var calls = [], changes = [], health = [];
  var service = {subscribe: function (uri, payload) {
    var sub = new EventEmitter();
    sub.cancel = function () { sub.emit('cancel'); };
    calls.push({uri: uri, payload: payload, sub: sub}); return sub;
  }};
  var watcher = monitor.create(service, function (state) { changes.push(state); }, function (state) { health.push(state); });
  function respond(index, payload) { calls[index].sub.emit('response', {payload: payload}); }
  function foreground(input) { return {returnValue: true, subscribed: true, appId: 'com.webos.app.' + input}; }
  function video(id, input) {
    return {returnValue: true, subscribed: true, clients: [
      {appId: 'com.webos.app.' + input, activation: true, sinkName: 'MAIN', sourceName: 'HDMI', clientId: id},
      {appId: 'com.webos.app.hdmi2', activation: false, sinkName: 'MAIN', sourceName: 'HDMI', clientId: 'cached'}
    ], video: [{connected: true}]};
  }
  function state(id, signal, saver) {
    return {returnValue: true, pipelineId: id, signalState: {videoSignalState: signal, screensaverType: saver}};
  }
  function latest() { return changes[changes.length - 1]; }
  watcher.start();
  assert.strictEqual(calls[0].uri, 'luna://com.webos.applicationManager/getForegroundAppInfo');
  assert.strictEqual(calls[1].uri, 'luna://com.webos.service.videooutput/getStatus');
  respond(1, video('session1', 'hdmi3'));
  assert.strictEqual(latest().signal_present, null, 'Video alone cannot identify the foreground input');
  respond(0, foreground('hdmi3'));
  assert.strictEqual(calls[2].uri, 'luna://com.webos.service.extinputs.hdmi/getSignalState');
  assert.deepStrictEqual(calls[2].payload, {pipelineId: 'session1', subscribe: true});
  assert.strictEqual(latest().signal_present, null, 'Connected video output is not proof of signal');
  respond(2, state('session1', 'good', 'NO_SCREEN_SAVER'));
  assert.strictEqual(latest().signal_present, true);
  respond(2, state('session1', 'bad', 'NO_SIGNAL'));
  assert.strictEqual(latest().signal_present, false);
  assert.strictEqual(latest().input, 'hdmi3');
  respond(2, state('session1', 'good', 'NO_SCREEN_SAVER'));
  respond(0, foreground('hdmi1'));
  assert.strictEqual(latest().signal_present, null);
  assert.strictEqual(latest().pipeline_id, null, 'Old port pipeline cannot follow the foreground switch');
  respond(1, video('session2', 'hdmi1'));
  var count = changes.length;
  respond(2, state('session1', 'bad', 'NO_SIGNAL'));
  assert.strictEqual(changes.length, count, 'Old session callback must be ignored');
  respond(3, state('wrong-session', 'good', 'NO_SCREEN_SAVER'));
  assert.strictEqual(changes.length, count);
  respond(3, state('session2', 'unknown', 'UNKNOWN'));
  assert.strictEqual(latest().signal_present, null);
  respond(3, state('session2', 'good', 'NO_SCREEN_SAVER'));
  respond(3, {subscription: true});
  assert.strictEqual(latest().signal_present, true, 'Acknowledgements are not observations');
  calls[3].sub.emit('error', new Error('lost'));
  assert.strictEqual(latest().signal_present, null, 'Lost subscription must not become OFF');
  assert.strictEqual(health[health.length - 1].state, 'error');
  respond(1, video('session3', 'hdmi1'));
  respond(4, state('session3', 'good', 'NO_SCREEN_SAVER'));
  var ambiguous = video('session3', 'hdmi1'); ambiguous.clients.push(ambiguous.clients[0]);
  respond(1, ambiguous);
  assert.strictEqual(latest().pipeline_id, null, 'Ambiguous MAIN sessions fail unknown');
  respond(0, foreground('home'));
  assert.strictEqual(latest().input, null);
  calls[0].sub.emit('cancel');
  assert.strictEqual(latest().signal_present, null);
  watcher.stop(); count = changes.length;
  respond(0, foreground('hdmi3'));
  respond(1, video('late', 'hdmi3'));
  assert.strictEqual(changes.length, count);
  assert.strictEqual(monitor.pipelineFor('com.webos.app.hdmi3', {clients: []}), null);
};
