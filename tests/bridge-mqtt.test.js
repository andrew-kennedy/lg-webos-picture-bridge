'use strict';
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var store = require('../app/bridge/lib/config-store');

module.exports = function () {
  var subscriptions = [];
  var publishers = [];
  var signalCallback;
  var webhookCalls = 0;
  var stopped = false;
  var sourcePath = path.resolve(__dirname, '../app/bridge/bridge.js');
  var holder = {exports: {}};
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
    module: holder,
    require: function (name) { return require(path.resolve(path.dirname(sourcePath), name)); },
    process: {stdout: {write: function () {}}, on: function () {}, exit: function () { stopped = true; }},
    setTimeout: function () { return 1; }, clearTimeout: function () {},
    setInterval: function () { return 1; }, clearInterval: function () {}, Date: Date, Buffer: Buffer
  });
  var service = {
    register: function () {},
    subscribe: function (uri) {
      var sub = new EventEmitter();
      sub.cancel = function () { sub.emit('cancel'); };
      subscriptions.push({uri: uri, sub: sub});
      return sub;
    }
  };
  var config = store.validate({mqtt: {host:'broker'}, device_id:'test'});
  var bridge = holder.exports.start(service, {
    config: config, healthStore: {save: function () {}},
    webhook: {postJson: function () { webhookCalls++; }},
    signalMonitor: {create: function (unused, callback) {
      signalCallback = callback;
      return {start: function () {}, stop: function () {}};
    }},
    mqttDiscovery: {create: function (unused, onHealth) {
      var publisher = {pictures:[], signals:[], status:onHealth,
        picture: function (value) { this.pictures.push(value); },
        signal: function (value) { this.signals.push(value); },
        start: function () { onHealth({state:'connected'}); },
        stop: function (callback) { if (callback) callback(); }, refresh: function () {}};
      publishers.push(publisher); return publisher;
    }}
  });
  var pictureSub = subscriptions.find(function (s) { return s.uri.includes('settingsservice'); }).sub;
  function picture(mode) {
    pictureSub.emit('response', {payload:{returnValue:true, subscribed:true,
      dimension:{input:'hdmi3', dynamicRange:'sdr', _3dStatus:'2d'}, settings:{pictureMode:mode}}});
  }
  picture('expert1'); picture('expert2');
  assert.strictEqual(publishers[0].pictures[publishers[0].pictures.length - 1].picture_mode, 'expert2');
  assert.strictEqual(webhookCalls, 0, 'MQTT-only must not call webhook');
  signalCallback({input:'hdmi3', signal_present:false});
  assert.strictEqual(publishers[0].signals[publishers[0].signals.length - 1].signal_present, false);
  pictureSub.emit('error', new Error('disconnected'));
  assert.strictEqual(bridge.health.current_picture_context, null);
  assert.strictEqual(publishers[0].pictures[publishers[0].pictures.length - 1], null);
  var next = store.validate({mqtt:{host:'other-broker'}, device_id:'test'});
  bridge.reconfigure(next, function (error) { assert.ifError(error); });
  assert.strictEqual(publishers.length, 2);
  publishers[0].status({state:'stale-error'});
  assert.strictEqual(bridge.health.mqtt.state, 'connected');
  bridge.stop('test');
  assert.strictEqual(stopped, true);
};
