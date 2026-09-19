'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var discovery = require('../app/bridge/lib/mqtt-discovery');
var store = require('../app/bridge/lib/config-store');

module.exports = function () {
  var config = store.validate({transport: 'mqtt', device_id: 'test-tv', device_name: 'Test TV',
    mqtt: {host: '127.0.0.1', username: 'bridge', password: 'private-secret'}});
  assert.strictEqual(config.callback_url, null);
  assert.strictEqual(config.mqtt.port, 1883);
  assert.throws(function () { store.validate({transport: 'mqtt'}); });
  ['mqtt://host', 'foo/#', 'host\nname'].forEach(function (host) {
    assert.throws(function () { store.validate({mqtt: {host: host}}); });
  });
  assert.throws(function () { store.validate({mqtt: {host: 'localhost', topic_prefix: 'test/#'}}); });
  assert.throws(function () { store.validate({mqtt: {host: 'localhost', password: 'no-user'}}); });
  assert.throws(function () { store.validate({mqtt: {host: 'localhost', port: 0}}); });
  var messages = discovery.buildDiscovery(config);
  assert.strictEqual(messages.length, 6);
  assert.ok(!JSON.stringify(messages).includes('private-secret'));
  messages.forEach(function (message) {
    assert.ok(message.payload.unique_id);
    assert.strictEqual(message.payload.expire_after, 90);
    assert.ok(message.payload.default_entity_id.includes('.lg_tv_'));
    assert.ok(message.payload.availability_topic.endsWith('/availability'));
  });
  var picture = {input: 'hdmi3', dynamic_range: 'dolby_vision', picture_mode: 'dolbyHdrCinema'};
  var signal = {input: 'hdmi3', signal_present: true, signal_state: 'good'};
  assert.strictEqual(discovery.snapshot(picture, signal, config).dynamic_range, 'dolby_vision');
  signal.signal_present = false;
  assert.strictEqual(discovery.snapshot(picture, signal, config).dynamic_range, null);
  assert.strictEqual(discovery.snapshot(picture, signal, config).picture_mode, 'dolbyHdrCinema');
  signal.input = 'hdmi1'; signal.signal_present = true;
  assert.strictEqual(discovery.snapshot(picture, signal, config).picture_mode, null);
  assert.strictEqual(discovery.snapshot(null, null, config).signal_present, null);
  picture.input = 'hdmi1_pc';
  assert.strictEqual(discovery.snapshot(picture, signal, config).dynamic_range, 'dolby_vision');

  var sent = [];
  var fake = new EventEmitter();
  fake.publish = function (topic, payload, retain) { sent.push({topic: topic, payload: payload, retain: retain}); return true; };
  fake.subscribe = function (topic) { assert.strictEqual(topic, 'homeassistant/status'); };
  fake.start = function () { fake.emit('connect'); };
  fake.stop = function () {};
  var publisher = discovery.create(config, function () {}, {client: {create: function () { return fake; }}});
  publisher.picture(picture); publisher.signal(signal); publisher.start();
  assert.strictEqual(sent.filter(function (s) { return s.topic.endsWith('/config'); }).length, 6);
  assert.strictEqual(sent.find(function (s) { return s.topic.endsWith('/state'); }).retain, false);
  signal = {input: 'hdmi1', signal_present: false, signal_state: 'bad'};
  publisher.signal(signal);
  assert.strictEqual(JSON.parse(sent[sent.length - 1].payload).signal_present, false);
  var previous = sent.length;
  fake.emit('message', 'homeassistant/status', 'online');
  assert.strictEqual(sent.length, previous + 8, 'HA birth must republish discovery, state, availability');
  fake.emit('disconnect');
  previous = sent.length;
  publisher.signal(null);
  assert.strictEqual(sent.length, previous);
  publisher.stop();
};
