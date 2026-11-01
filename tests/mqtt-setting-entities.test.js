'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var discovery = require('../app/bridge/lib/mqtt-discovery');
var store = require('../app/bridge/lib/config-store');
var catalog = require('../app/bridge/lib/settings-catalog');

// 0.22.3: the per-setting HA entities are opt-in; commands alone no longer create them.
module.exports = function () {
  var base = {transport: 'mqtt', device_id: 'test-tv', device_name: 'Test TV',
    mqtt: {host: '127.0.0.1', commands_enabled: true}};
  assert.strictEqual(store.validate(base).mqtt.settings_entities_enabled, false, 'Off unless asked for');
  assert.strictEqual(store.validate(Object.assign({}, base, {mqtt: Object.assign({}, base.mqtt,
    {settings_entities_enabled: true})})).mqtt.settings_entities_enabled, true);
  assert.throws(function () { store.validate({mqtt: {host: 'broker', settings_entities_enabled: 'true'}}); },
    /settings_entities_enabled must be a boolean/);

  function run(enabled) {
    var config = store.validate(Object.assign({}, base, {mqtt: Object.assign({}, base.mqtt,
      {settings_entities_enabled: enabled})}));
    var id = discovery.identity(config.device_id), prefix = config.mqtt.topic_prefix + '/' + id;
    var sent = [], subscriptions = [], fake = new EventEmitter();
    var monitor = {controls: {picture_backlight: {id: 'picture_backlight', category: 'picture', key: 'backlight',
      name: 'OLED Pixel Brightness', component: 'number', min: 0, max: 100, step: 1, value: 40, available: true,
      dimension: {input: 'hdmi1', pictureMode: 'hdrGame'}}}, context_id: 'a', observed_at: 1, context: {}};
    fake.publish = function (topic, payload, retain) { sent.push({topic: topic, payload: payload, retain: retain}); return true; };
    fake.subscribe = function (topic) { subscriptions.push(topic); };
    fake.start = function () { fake.emit('connect'); };
    fake.stop = function (callback) { if (callback) callback(); };
    var publisher = discovery.create(config, function () {}, {client: {create: function () { return fake; }},
      service: {}, applyPolicy: function () {},
      settingsMonitor: {snapshot: function () { return monitor; }, onChange: function () { return function () {}; },
        contextChanged: function () {}, refresh: function () {}, write: function () {}, current: function () { return true; }}});
    publisher.picture({input: 'hdmi1', raw_dynamic_range: 'hdr10', dynamic_range: 'hdr10', picture_mode: 'hdrGame'});
    publisher.signal({input: 'hdmi1', signal_present: true});
    publisher.start();
    fake.emit('subscribed', prefix + '/settings/command');
    fake.emit('message', 'homeassistant/status', 'online');
    publisher.stop();
    return {sent: sent, subscriptions: subscriptions, id: id, prefix: prefix};
  }

  var off = run(false);
  assert.ok(!off.subscriptions.includes(off.prefix + '/settings/command'), 'No settings command channel');
  assert.ok(!off.sent.some(function (s) { return s.topic.indexOf(off.prefix + '/settings/') === 0; }),
    'No per-setting state, status or observations');
  var configs = off.sent.filter(function (s) { return /_setting_|_settings_command/.test(s.topic); });
  assert.ok(configs.length > 0 && configs.every(function (s) { return s.payload === '' && s.retain; }),
    'Only retained tombstones for setting entities');
  catalog.entries.forEach(function (entry) {
    ['number', 'select'].forEach(function (kind) {
      assert.ok(off.sent.some(function (s) {
        return s.topic === 'homeassistant/' + kind + '/' + off.id + '_setting_' + entry.id + '/config' && s.payload === '';
      }), 'Removes ' + kind + ' ' + entry.id);
    });
  });
  assert.ok(off.sent.some(function (s) {
    return s.topic === 'homeassistant/sensor/' + off.id + '_settings_command/config' && s.payload === '';
  }), 'Removes the settings command reply sensor');
  assert.ok(off.sent.some(function (s) { return s.topic === off.prefix + '/state'; }), 'Status entities still publish');
  assert.ok(off.subscriptions.includes(off.prefix + '/profiles/command'), 'LG Picture Profiles keeps its channel');

  var on = run(true);
  assert.ok(on.subscriptions.includes(on.prefix + '/settings/command'));
  var backlight = on.sent.filter(function (s) {
    return s.topic === 'homeassistant/number/' + on.id + '_setting_picture_backlight/config';
  }).at(-1);
  assert.ok(backlight && JSON.parse(backlight.payload).command_topic === on.prefix + '/settings/command',
    'Opting in still announces the controls');
};
