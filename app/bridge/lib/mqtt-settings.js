'use strict';

var commands = require('./mqtt-commands');
var settings = require('./settings-controls');
var catalog = require('./settings-catalog');
function discovery(config, id, session, snapshot) {
  var base = config.mqtt.topic_prefix + '/' + id;
  return Object.keys(snapshot.controls).sort().map(function (key) {
    var control = snapshot.controls[key], component = control.component;
    var uid = id + '_setting_' + key;
    var stateTopic = base + '/settings/' + key;
    var payload = {name: control.name, unique_id: uid,
      default_entity_id: component + '.lg_tv_' + key.toLowerCase(),
      device: {identifiers: [id], name: config.device_name}, entity_category: 'config',
      state_topic: stateTopic, value_template: '{{ value_json.value }}',
      json_attributes_topic: stateTopic,
      availability_mode: 'all', availability: [
        {topic: base + '/availability'},
        {topic: stateTopic, value_template: "{{ 'online' if value_json.available else 'offline' }}"}
      ],
      command_topic: base + '/settings/command', retain: false, optimistic: false,
      command_template: "{{ {'protocol': 1, 'session_id': '" + (session || '') +
        "', 'request_id': 'ha-setting-' ~ ((as_timestamp(now()) * 1000000) | int) ~ '-' ~ (range(100000) | random), " +
        "'expires_at': as_timestamp(now()) + 30, 'policy': {'setting': '" + key +
        "', 'context_id': '" + (snapshot.context_id || '') + "', 'value': value}} | to_json }}"};
    if (component === 'number') {
      payload.min = control.min; payload.max = control.max; payload.step = control.step; payload.mode = 'slider';
    } else payload.options = control.options;
    return {topic: config.mqtt.discovery_prefix + '/' + component + '/' + uid + '/config', payload: payload};
  });
}
function create(options) {
  var base = options.config.mqtt.topic_prefix + '/' + options.id;
  var online = false, announced = {}, published = {}, known = {}, latest = {controls: {}, context_id: null};
  var channel, monitor;
  function publish(topic, value, retain) { return online && options.publish(topic, JSON.stringify(value), Boolean(retain)); }
  function observation(topic, value, force) {
    var serialized = JSON.stringify(value);
    if (!force && published[topic] === serialized) return true;
    value.observed_at = new Date(latest.observed_at || 0).toISOString();
    if (!publish(topic, value, false)) return false;
    published[topic] = serialized;
    return true;
  }
  function status() {
    var s = channel.status();
    s.context = latest.context; s.context_id = latest.context_id;
    s.control_count = Object.keys(latest.controls).length;
    s.available_count = Object.keys(latest.controls).filter(function (key) { return latest.controls[key].available; }).length;
    return s;
  }
  function announce(force) {
    if (!online) return false;
    var ok = true;
    if (force) retiredTopics(options.config, options.id).forEach(function (topic) { options.publish(topic, '', true); });
    discovery(options.config, options.id, channel.status().session_id, latest).forEach(function (message) {
      var serialized = JSON.stringify(message.payload);
      if (force || announced[message.topic] !== serialized) {
        if (options.publish(message.topic, serialized, true)) announced[message.topic] = serialized;
        else ok = false;
      }
    });
    Object.keys(latest.controls).forEach(function (id) {
      var c = latest.controls[id]; known[id] = c;
      if (!observation(base + '/settings/' + id, {value: c.value, available: c.available && channel.status().ready && Boolean(latest.observed_at),
        category: c.category, key: c.key, dimension: c.dimension, backend: 'root_luna',
        context_id: latest.context_id}, force)) ok = false;
    });
    Object.keys(known).forEach(function (id) {
      if (!latest.controls[id]) observation(base + '/settings/' + id, {value: known[id].value, available: false}, force);
    });
    var statusTopic = options.config.mqtt.discovery_prefix + '/sensor/' + options.id + '_settings_command/config';
    var statusPayload = {name: 'Settings command', unique_id: options.id + '_settings_command',
      default_entity_id: 'sensor.lg_tv_settings_command', device: {identifiers: [options.id], name: options.config.device_name},
      state_topic: base + '/settings/status', json_attributes_topic: base + '/settings/status',
      value_template: '{{ value_json.state }}', availability_topic: base + '/availability',
      expire_after: 90, entity_category: 'diagnostic'};
    if (force || !announced[statusTopic]) {
      if (publish(statusTopic, statusPayload, true)) announced[statusTopic] = true;
      else ok = false;
    }
    if (!publish(base + '/settings/status', status(), false)) ok = false;
    return ok;
  }
  monitor = (options.createMonitor || settings.create)(options.service, {context: options.context,
    changed: function (snapshot) { latest = snapshot; announce(false); }});
  channel = commands.create({topic: base + '/settings/command', normalize: settings.normalize,
    publish: function () { return publish(base + '/settings/status', status(), false); },
    applyPolicy: function (command, callback, guard) {
      var run = function (done) { monitor.write(command, done, guard); };
      if (options.enqueue) options.enqueue(run, callback); else run(callback);
    }, summarizeResult: function (value) { return value; }});
  return {connect: function () { online = true; announced = {}; published = {}; channel.connect(); monitor.contextChanged(); },
    subscribed: function () { channel.subscribed(); announce(true); },
    disconnect: function () { online = false; channel.disconnect(); },
    receive: channel.receive, status: status,
    refresh: function () { monitor.refresh(); return announce(true); },
    publish: function () { return announce(false); },
    contextChanged: monitor.contextChanged,
    start: monitor.start, stop: function () { monitor.stop(); channel.disconnect(); online = false; }};
}
function tombstones(config, id) {
  var items = [];
  catalog.entries.forEach(function (e) { ['number', 'select'].forEach(function (kind) {
    items.push(config.mqtt.discovery_prefix + '/' + kind + '/' + id + '_setting_' + e.id + '/config');
  }); });
  items.push(config.mqtt.discovery_prefix + '/sensor/' + id + '_settings_command/config');
  return items.concat(retiredTopics(config, id));
}
function retiredTopics(config, id) {
  var items = [];
  catalog.retiredIds.forEach(function (key) { ['number','select'].forEach(function (kind) {
    items.push(config.mqtt.discovery_prefix + '/' + kind + '/' + id + '_setting_' + key + '/config');
  }); });
  return items;
}
module.exports = {create: create, discovery: discovery, tombstones: tombstones};
