'use strict';
var assert = require('assert');
var inventory = require('../app/bridge/lib/cec-inventory');
var tracker = require('../app/bridge/lib/cec-devices');
var mqttCecDevices = require('../app/bridge/lib/mqtt-cec-devices');
var discovery = require('../app/bridge/lib/mqtt-discovery');
var EventEmitter = require('events');

// EIM records on HDMI 3, as captured from a G6 on 2026-11-08 while a Switch 2
// woke (01:46:44–52) and slept (dropped at 01:48:36, 18 s after sleep).
function record(unique, name, vendor, address, power) {
  return {id: 'SIMPLINK', portId: 3, uniqueId: unique, osdName: name, vendorId: vendor, cecpDevType: unique === 8 && !name ? 8 : 4,
    physicalAddress: address, cecPower: power};
}
var appleTv = record(4, 'Apple TV', 4346, 12800, 'Off'), shield = record(11, 'SHIELD', 1099, 13056, 'Off');
function observed(list) {
  return {state: 'observed', devices: inventory.extract({returnValue: true, devices: [{id: 'HDMI_3', subList: list}]})};
}
function memory(initial) {
  var saved = initial || [], writes = 0;
  return {load: function () { return JSON.parse(JSON.stringify(saved)); },
    save: function (devices) { writes++; saved = JSON.parse(JSON.stringify(devices)); },
    saved: function () { return saved; }, writes: function () { return writes; }};
}
function awake(devices, key) { return devices.snapshot().devices[key].awake; }

module.exports = function () {
  assert.deepStrictEqual(['On', 'Off', 'transitionToOn', 'transitionToStandby', 'Unknown', undefined].map(inventory.power),
    ['on', 'standby', 'turning_on', 'turning_off', 'unknown', 'unknown']);
  assert.strictEqual(tracker.slug('Switch 2'), 'switch_2');

  var store = memory(), clock = 0;
  var devices = tracker.create({store: store, now: function () { return clock; }});
  // Switch 2 asleep: only Apple TV and the Shield are listed.
  var result = devices.observe(observed([appleTv, shield]));
  assert.deepStrictEqual(result.added.sort(), ['apple_tv', 'shield']);
  assert.strictEqual(awake(devices, 'apple_tv'), false); assert.strictEqual(awake(devices, 'shield'), false);

  // First wake ever: the Switch appears unnamed, so it is not yet a device.
  result = devices.observe(observed([appleTv, record(8, '', 0, 13056, 'Unknown'), shield]));
  assert.deepStrictEqual(result.added, []);
  devices.observe(observed([appleTv, record(8, '', 0, 13056, 'transitionToOn'), shield]));
  result = devices.observe(observed([appleTv, record(8, 'Switch 2', 2495, 13056, 'On'), shield]));
  assert.deepStrictEqual(result.added, ['switch_2']);
  assert.strictEqual(awake(devices, 'switch_2'), true);
  assert.strictEqual(store.saved().filter(function (d) { return d.key === 'switch_2'; })[0].logical_address, 8);

  // Sleep: LG drops logical address 8 from the list. A known missing device is off.
  clock = 5000;
  result = devices.observe(observed([appleTv, shield]));
  assert(result.changed);
  var switch2 = devices.snapshot().devices.switch_2;
  assert.deepStrictEqual([switch2.awake, switch2.present, switch2.power, switch2.changed_at], [false, false, 'absent', new Date(5000).toISOString()]);

  // After a restart it is remembered, and the unnamed record of a later wake is
  // matched by address: Unknown keeps off, Off stays off, transitionToOn is on.
  var restarted = tracker.create({store: store, now: function () { return clock; }});
  result = restarted.observe(observed([appleTv, shield]));
  assert.deepStrictEqual(result.added, []);
  assert.strictEqual(awake(restarted, 'switch_2'), false);
  restarted.observe(observed([appleTv, record(8, '', 0, 13056, 'Unknown'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), false, 'Unknown keeps the last known state');
  restarted.observe(observed([appleTv, record(8, '', 0, 13056, 'Off'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), false);
  restarted.observe(observed([appleTv, record(8, '', 0, 13056, 'transitionToOn'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), true, 'Waking counts as on');
  restarted.observe(observed([appleTv, record(8, 'Switch 2', 2495, 13056, 'On'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), true);
  restarted.observe(observed([appleTv, record(8, 'Switch 2', 2495, 13056, 'Unknown'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), true, 'A transient Unknown does not turn it off');
  // A different device at the Switch's port but another logical address is not the Switch.
  restarted.observe(observed([appleTv, record(9, '', 0, 13056, 'On'), shield]));
  assert.strictEqual(awake(restarted, 'switch_2'), false);

  // Apple TV waking reports On while still listed.
  restarted.observe(observed([record(4, 'Apple TV', 4346, 12800, 'On'), shield]));
  assert.strictEqual(awake(restarted, 'apple_tv'), true);

  // An unavailable list is unknown for everyone, not off.
  restarted.observe({state: 'unavailable', devices: []});
  assert.deepStrictEqual(Object.keys(restarted.snapshot().devices).map(function (key) { return awake(restarted, key); }), [null, null, null]);

  // Saves only when something about a device changes.
  var writes = store.writes();
  restarted.observe(observed([appleTv, record(8, 'Switch 2', 2495, 13056, 'On'), shield]));
  restarted.observe(observed([appleTv, shield]));
  assert.strictEqual(store.writes(), writes);

  // MQTT: discovery once per new device, state on change, not retained.
  var sent = [];
  var channel = mqttCecDevices.create({config: {device_name: 'LG TV', mqtt: {topic_prefix: 'lgpb', discovery_prefix: 'homeassistant'}},
    id: 'lgpb_x', base: 'lgpb/lgpb_x', store: memory(),
    publish: function (topic, payload, retain) { sent.push({topic: topic, payload: payload, retain: retain}); return true; }});
  channel.observe(observed([appleTv, shield]));
  var configs = sent.filter(function (s) { return /\/config$/.test(s.topic); });
  assert.deepStrictEqual(configs.map(function (s) { return s.topic; }).sort(),
    ['homeassistant/binary_sensor/lgpb_x_cec_apple_tv/config', 'homeassistant/binary_sensor/lgpb_x_cec_shield/config']);
  var payload = JSON.parse(configs[0].payload);
  assert.strictEqual(payload.device_class, 'power'); assert(configs.every(function (s) { return s.retain; }));
  assert(/binary_sensor\.lg_tv_cec_(apple_tv|shield)/.test(payload.default_entity_id));
  var states = sent.filter(function (s) { return s.topic === 'lgpb/lgpb_x/cec/devices'; });
  assert.strictEqual(states.length, 1); assert.strictEqual(states[0].retain, false);
  assert.strictEqual(JSON.parse(states[0].payload).devices.apple_tv.awake, false);
  sent = [];
  channel.observe(observed([appleTv, shield]));
  assert.strictEqual(sent.length, 0, 'An unchanged list publishes nothing');
  channel.observe(observed([appleTv, record(8, 'Switch 2', 2495, 13056, 'On'), shield]));
  assert.deepStrictEqual(sent.map(function (s) { return s.topic; }),
    ['homeassistant/binary_sensor/lgpb_x_cec_switch_2/config', 'lgpb/lgpb_x/cec/devices']);

  // The inventory subscribes when the service can, and resubscribes after a loss.
  var subscriptions = [], changes = [], timers = [];
  function subscription() {
    var handlers = {};
    var sub = {on: function (event, handler) { handlers[event] = handler; }, cancel: function () { sub.cancelled = true; }, handlers: handlers};
    subscriptions.push(sub); return sub;
  }
  var watcher = inventory.create({subscribe: function (uri, params) {
    assert(uri.endsWith('/getAllInputStatus')); assert.deepStrictEqual(params, {subscribe: true}); return subscription();
  }, call: function () { throw new Error('No polling with a subscription'); }}, function (value) { changes.push(value); }, {
    setInterval: function () { throw new Error('No polling with a subscription'); }, clearInterval: function () {},
    setTimeout: function (callback, ms) { timers.push({callback: callback, ms: ms}); return timers.length; }, clearTimeout: function () {}});
  watcher.start();
  var push = function (list) { subscriptions[subscriptions.length - 1].handlers.response({payload: {returnValue: true, subscribed: true, devices: [{id: 'HDMI_3', subList: list}]}}); };
  push([appleTv, shield]); push([appleTv, record(8, 'Switch 2', 2495, 13056, 'On'), shield]);
  assert.strictEqual(changes.length, 2);
  assert.strictEqual(changes[1].devices.filter(function (d) { return d.logical_address === 8; })[0].power, 'on');
  subscriptions[0].handlers.cancel();
  assert.strictEqual(changes[2].state, 'unavailable');
  var retry = timers.filter(function (t) { return t.ms === 30000; });
  assert.strictEqual(retry.length, 1); retry[0].callback();
  assert.strictEqual(subscriptions.length, 2);
  push([appleTv, shield]);
  assert.strictEqual(changes[3].state, 'observed');
  watcher.stop(); assert(subscriptions[1].cancelled);

  // Through the bridge's MQTT publisher: the one inventory subscription feeds the
  // device entities without CEC filter commands; a connect announces them.
  var bus = [], fake = new EventEmitter(), handlers = {};
  fake.publish = function (topic, payload, retain) { bus.push({topic: topic, payload: payload, retain: retain}); return true; };
  fake.subscribe = function () {}; fake.start = function () { fake.emit('connect'); }; fake.stop = function (done) { if (done) done(); };
  var publisher = discovery.create({device_id: 'tv', device_name: 'LG TV', debounce_ms: 0,
    mqtt: {host: 'h', port: 1883, topic_prefix: 'lgpb', discovery_prefix: 'homeassistant'}}, function () {}, {
    client: {create: function () { return fake; }}, cecDeviceStore: memory(),
    service: {subscribe: function () { return {on: function (event, handler) { handlers[event] = handler; }, cancel: function () {}}; }},
    setInterval: function () { return 1; }, clearInterval: function () {}});
  publisher.start();
  handlers.response({payload: {returnValue: true, devices: [{id: 'HDMI_3', subList: [appleTv, record(8, 'Switch 2', 2495, 13056, 'On')]}]}});
  var id = discovery.identity('tv');
  assert(bus.some(function (m) { return m.topic === 'homeassistant/binary_sensor/' + id + '_cec_switch_2/config' && m.retain; }));
  var last = bus.filter(function (m) { return m.topic === 'lgpb/' + id + '/cec/devices'; }).pop();
  assert.strictEqual(JSON.parse(last.payload).devices.switch_2.awake, true);
  handlers.response({payload: {returnValue: true, devices: [{id: 'HDMI_3', subList: [appleTv]}]}});
  last = bus.filter(function (m) { return m.topic === 'lgpb/' + id + '/cec/devices'; }).pop();
  assert.strictEqual(JSON.parse(last.payload).devices.switch_2.awake, false);
  publisher.stop();
};
