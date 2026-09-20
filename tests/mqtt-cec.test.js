'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var cec = require('../app/bridge/lib/mqtt-cec');
var policy = require('../app/bridge/lib/cec-policy');
var discovery = require('../app/bridge/lib/mqtt-discovery');
var store = require('../app/bridge/lib/config-store');
module.exports = function () {
  var clock = 100000, sent = [], calls = 0, saved = policy.empty();
  var guard = {snapshot: function () { return {enabled: saved.enabled, policy: saved, policy_hash: 'hash-' + calls,
    filter_state: saved.enabled ? 'active' : 'off', capabilities: policy.capabilities()}; },
  applyCommand: function (value) { calls++; if (value.version) saved = value; else saved.enabled = value.enabled; return this.snapshot(); }};
  var channel = cec.create({topic: 'test/cec/command', guard: guard, now: function () { return clock; },
    publish: function (value) { sent.push(value); return true; }});
  channel.connect(); channel.subscribed();
  function envelope(id, p) { return {protocol: 1, session_id: channel.status().session_id, request_id: id,
    expires_at: 130, policy: p}; }
  var configuration = {version: 1, enabled: true, rules: [{id: 'generic', match: {input: 'hdmi4'}, block: ['automatic_selection']}]};
  var request = JSON.stringify(envelope('test1', configuration));
  channel.receive(request, {retain: true}); assert.strictEqual(calls, 0);
  channel.receive(request, {retain: false}); assert.strictEqual(calls, 1);
  assert.strictEqual(channel.status().results.test1.ok, true);
  assert.strictEqual(channel.status().results.test1.applied.rule_count, 1);
  channel.receive(request, {retain: false}); assert.strictEqual(calls, 1, 'Exact retry is idempotent');
  var bad = JSON.parse(JSON.stringify(configuration)); bad.rules[0].block.push('standby');
  channel.receive(JSON.stringify(envelope('unsupported', bad)), {retain: false});
  assert.strictEqual(calls, 1); assert.strictEqual(channel.status().results.unsupported.error, 'unsupported_cec_action');
  channel.receive(JSON.stringify(envelope('off', {enabled: false})), {retain: false});
  assert.strictEqual(calls, 2); assert.strictEqual(saved.enabled, false); assert.strictEqual(saved.rules.length, 1);
  var expired = envelope('expired', configuration); expired.expires_at = 99;
  channel.receive(JSON.stringify(expired), {retain: false}); assert.strictEqual(calls, 2);
  var oldSession = request; channel.disconnect(); channel.connect(); channel.subscribed();
  channel.receive(oldSession, {retain: false}); assert.strictEqual(calls, 2);
  assert.strictEqual(channel.status().results.test1.error, 'stale_session');
  assert.deepStrictEqual(channel.status().capabilities.supported_actions, ['automatic_selection']);
  channel.stop();

  var config = store.validate({device_id: 'test', mqtt: {host: 'broker', cec_commands_enabled: true}});
  var entities = cec.discovery(config, 'test', 'abc123');
  assert.strictEqual(entities.length, 2);
  assert.strictEqual(entities[1].payload.optimistic, false);
  assert(entities[1].payload.command_template.indexOf('abc123') !== -1);
  assert(entities[1].payload.command_template.indexOf('sensor.lg_tv') === -1, 'HA entity renaming must not break control');
  assert.strictEqual(entities[0].payload.expire_after, 90);
  assert.strictEqual(store.validate({mqtt: {host: 'broker'}}).mqtt.cec_commands_enabled, false);
  assert.throws(function () { store.validate({mqtt: {host: 'broker', cec_commands_enabled: 'true'}}); });

  var fake = new EventEmitter(), subscriptions = []; sent = [];
  fake.start = function () { this.emit('connect'); };
  fake.stop = function () {};
  fake.subscribe = function (topic) { subscriptions.push(topic); };
  fake.publish = function (topic, payload, retain) { sent.push({topic: topic, payload: payload, retain: retain}); return true; };
  var publisher = discovery.create(config, function () {}, {cecGuard: guard, client: {create: function () { return fake; }}});
  publisher.start();
  var topic = subscriptions.filter(function (t) { return /cec\/command$/.test(t); })[0];
  assert(topic, 'CEC works independently of picture command opt-in');
  fake.emit('subscribed', topic);
  var status = JSON.parse(sent.filter(function (s) { return /cec\/state$/.test(s.topic); }).pop().payload);
  assert.strictEqual(status.ready, true);
  assert(sent.some(function (s) { return /switch.*cec_filter\/config$/.test(s.topic) && s.retain; }));
  fake.emit('message', topic, JSON.stringify({protocol: 1, session_id: status.session_id, request_id: 'live',
    expires_at: Date.now() / 1000 + 30, policy: {enabled: true}}), {retain: false});
  assert.strictEqual(saved.enabled, true);
  assert.strictEqual(sent.filter(function (s) { return /cec\/state$/.test(s.topic); }).pop().retain, false);
  publisher.signal({input: null, signal_present: null});
  assert.strictEqual(saved.enabled, true, 'Policy configuration does not require an active picture');
  publisher.stop();
};
