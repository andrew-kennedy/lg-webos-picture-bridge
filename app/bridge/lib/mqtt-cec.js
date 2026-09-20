'use strict';

var commands = require('./mqtt-commands');
var policy = require('./cec-policy');
var inventory = require('./cec-inventory');

function discovery(config, id, session) {
  var base = config.mqtt.topic_prefix + '/' + id;
  var common = {device: {identifiers: [id], name: config.device_name},
    availability_topic: base + '/availability', payload_available: 'online', payload_not_available: 'offline',
    state_topic: base + '/cec/state', entity_category: 'config'};
  function entity(component, suffix, name) {
    var payload = JSON.parse(JSON.stringify(common));
    payload.name = name; payload.unique_id = id + '_' + suffix;
    payload.default_entity_id = component + '.lg_tv_' + suffix;
    return {topic: config.mqtt.discovery_prefix + '/' + component + '/' + payload.unique_id + '/config', payload: payload};
  }
  var status = entity('sensor', 'cec_filter', 'CEC filtering status');
  status.payload.entity_category = 'diagnostic';
  status.payload.value_template = '{{ value_json.filter_state }}';
  status.payload.json_attributes_topic = base + '/cec/state';
  status.payload.expire_after = 90;
  var toggle = entity('switch', 'cec_filter', 'CEC filtering');
  toggle.payload.value_template = "{{ 'ON' if value_json.enabled else 'OFF' }}";
  toggle.payload.command_topic = base + '/cec/command';
  toggle.payload.payload_on = 'ON'; toggle.payload.payload_off = 'OFF';
  toggle.payload.optimistic = false; toggle.payload.retain = false;
  // Discovery is refreshed per MQTT session, so no HA entity ID is embedded in
  // this template. Renaming the status sensor does not break the switch.
  toggle.payload.command_template = "{{ {'protocol': 1, 'session_id': '" + (session || '') +
    "', 'request_id': 'ha-cec-' ~ ((as_timestamp(now()) * 1000000) | int) ~ '-' ~ (range(100000) | random), " +
    "'expires_at': as_timestamp(now()) + 30, 'policy': {'enabled': value == 'ON'}} | to_json }}";
  return [status, toggle];
}
function create(options) {
  var guard = options.guard;
  var devices = {state: 'starting', devices: [], observed_at: null};
  var channel;
  function snapshot() {
    var status = guard.snapshot();
    status.inventory = devices;
    var command = channel.status();
    Object.keys(command).forEach(function (key) { status[key] = command[key]; });
    return status;
  }
  function publish() { return options.publish(snapshot()); }
  channel = commands.create({topic: options.topic, normalize: policy.normalizeCommand,
    now: options.now, publish: publish,
    applyPolicy: function (value, callback, check) {
      try { check(); callback(null, guard.applyCommand(value)); } catch (error) { callback(error); }
    },
    summarizeResult: function (value) { return {policy_hash: value.policy_hash, enabled: value.enabled,
      filter_state: value.filter_state, rule_count: value.policy.rules.length}; }});
  var watcher = options.service ? inventory.create(options.service, function (value) {
    devices = value; publish();
  }, options.inventoryDependencies) : null;
  return {connect: channel.connect, subscribed: channel.subscribed, disconnect: channel.disconnect,
    receive: channel.receive, status: snapshot, publish: publish,
    start: function () { if (watcher) watcher.start(); }, stop: function () { channel.disconnect(); if (watcher) watcher.stop(); }};
}
module.exports = {create: create, discovery: discovery};
