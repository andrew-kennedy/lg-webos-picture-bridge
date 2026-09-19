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
  assert.strictEqual(publisher.refresh(), false, 'Before connection, republish must not claim submission');
  publisher.picture(picture); publisher.signal(signal); publisher.start();
  assert.strictEqual(sent.filter(function (s) { return s.topic.endsWith('/config') && s.payload; }).length, 6);
  assert.strictEqual(sent.filter(function (s) { return s.topic.endsWith('_picture_command/config') && !s.payload; }).length, 1);
  assert.strictEqual(sent.find(function (s) { return s.topic.endsWith('/state'); }).retain, false);
  signal = {input: 'hdmi1', signal_present: false, signal_state: 'bad'};
  publisher.signal(signal);
  assert.strictEqual(JSON.parse(sent[sent.length - 1].payload).signal_present, false);
  var previous = sent.length;
  fake.emit('message', 'homeassistant/status', 'online');
  assert.strictEqual(sent.length, previous + 9, 'HA birth must republish discovery, command tombstone, state, availability');
  assert.strictEqual(publisher.refresh(), true, 'Connected republish reports local submission');
  var normalPublish = fake.publish;
  ['_input/config', '/state', '/availability', '_picture_command/config'].forEach(function (suffix) {
    fake.publish = function (topic, payload, retain) {
      if (topic.endsWith(suffix)) return false;
      return normalPublish(topic, payload, retain);
    };
    assert.strictEqual(publisher.refresh(), false, 'A failed ' + suffix + ' submission must not look successful');
  });
  fake.publish = normalPublish;
  fake.emit('disconnect');
  assert.strictEqual(publisher.refresh(), false);
  previous = sent.length;
  publisher.signal(null);
  assert.strictEqual(sent.length, previous);
  publisher.stop();
  assert.strictEqual(publisher.refresh(), false);

  config.mqtt.commands_enabled = true;
  messages = discovery.buildDiscovery(config);
  assert.strictEqual(messages.length, 7);
  assert.ok(messages[6].payload.json_attributes_topic.endsWith('/command_status'));
  assert.throws(function () { store.validate({mqtt: {host: 'localhost', commands_enabled: 'true'}}); });
  var subscriptions = [], applications = [], lastGuard;
  fake = new EventEmitter(); sent = [];
  fake.publish = function (topic, payload, retain) { sent.push({topic: topic, payload: payload, retain: retain}); return true; };
  fake.subscribe = function (topic) { subscriptions.push(topic); };
  fake.start = function () { fake.emit('connect'); };
  fake.stop = function () {};
  publisher = discovery.create(config, function () {}, {client: {create: function () { return fake; }},
    applyPolicy: function (policy, callback, guard) {
      lastGuard = guard;
      applications.push(policy); guard(); callback(null, {dry_run: true, operation_count: 3});
    }});
  picture = {input: 'hdmi3', raw_dynamic_range: 'sdr', dynamic_range: 'sdr'};
  publisher.picture(picture); publisher.signal({input: 'hdmi3', signal_present: true}); publisher.start();
  assert.strictEqual(sent.filter(function (s) { return s.topic.endsWith('/command_status'); }).length, 0,
    'Commands are not ready until the broker accepts the subscription');
  var topic = subscriptions.find(function (t) { return t.endsWith('/command'); });
  fake.emit('subscribed', topic);
  var status = JSON.parse(sent[sent.length - 1].payload);
  assert.strictEqual(status.ready, true);
  var commandPublish = fake.publish;
  fake.publish = function (topic, payload, retain) {
    return topic.endsWith('/command_status') ? false : commandPublish(topic, payload, retain);
  };
  assert.strictEqual(publisher.refresh(), false, 'A failed command-status publish must not look successful');
  fake.publish = commandPublish;
  var request = {protocol: 1, session_id: status.session_id, request_id: 'ha-test', expires_at: Date.now()/1000+30,
    policy: {input:'hdmi3', scope:'active', dry_run:true, modes:{sdr:'expert1'}, presets:{expert1:{settings:{backlight:80}}}}};
  fake.emit('message', topic, JSON.stringify(request), {retain:false});
  assert.strictEqual(applications.length, 1);
  assert.strictEqual(JSON.parse(sent[sent.length - 1].payload).results['ha-test'].ok, true);
  assert.strictEqual(sent[sent.length - 1].retain, false);
  publisher.picture({input:'hdmi3',raw_dynamic_range:'sdr',dynamic_range:'sdr',picture_mode:'expert2'});
  assert.doesNotThrow(lastGuard, 'Our own picture-mode update must not invalidate work');
  publisher.signal({input:'hdmi3',signal_present:false});
  publisher.signal({input:'hdmi3',signal_present:true});
  assert.throws(lastGuard, /changed/, 'Signal loss and recovery to the same context must invalidate older work');
  publisher.stop();
};
