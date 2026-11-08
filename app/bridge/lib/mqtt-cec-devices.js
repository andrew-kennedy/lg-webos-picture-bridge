'use strict';

var tracker = require('./cec-devices');

// One Home Assistant binary_sensor per CEC source (device_class power), read
// from LG's own CEC device list. On: the device reports On or is waking. Off:
// it reports standby or LG dropped it (no longer answering). Unknown: the TV's
// list is unavailable or the device has not reported yet. Read-only.
function discovery(config, id, key, name) {
  var base = config.mqtt.topic_prefix + '/' + id;
  var unique = id + '_cec_' + key;
  var lookup = "value_json.devices.get('" + key + "')";
  return {topic: config.mqtt.discovery_prefix + '/binary_sensor/' + unique + '/config', payload: {
    name: name + ' power (CEC)', unique_id: unique, default_entity_id: 'binary_sensor.lg_tv_cec_' + key,
    device: {identifiers: [id], name: config.device_name}, device_class: 'power',
    state_topic: base + '/cec/devices', availability_topic: base + '/availability',
    payload_available: 'online', payload_not_available: 'offline', expire_after: 90,
    payload_on: 'ON', payload_off: 'OFF',
    value_template: '{% set d = ' + lookup + " %}{{ 'None' if d is none or d.awake is none else ('ON' if d.awake else 'OFF') }}",
    json_attributes_topic: base + '/cec/devices',
    json_attributes_template: '{{ ' + lookup + ' | tojson }}'
  }};
}
function create(options) {
  var devices = options.tracker || tracker.create({store: options.store, now: options.now});
  var inventory = null;
  function state() {
    var value = devices.snapshot();
    value.inventory_state = inventory ? inventory.state : 'starting';
    value.observed_at = inventory ? inventory.changed_at : null;
    return value;
  }
  function announce(keys) {
    var known = devices.known(), submitted = true;
    known.forEach(function (entry) {
      if (keys && keys.indexOf(entry.key) < 0) return;
      var item = discovery(options.config, options.id, entry.key, entry.name);
      if (!options.publish(item.topic, JSON.stringify(item.payload), true)) submitted = false;
    });
    return submitted;
  }
  function publish() { return options.publish(options.base + '/cec/devices', JSON.stringify(state()), false); }
  return {
    observe: function (value) {
      inventory = value;
      var result = devices.observe(value);
      if (result.added.length) announce(result.added);
      if (result.changed) publish();
    },
    announce: function () { return announce(null); },
    publish: publish,
    status: state
  };
}
module.exports = {create: create, discovery: discovery};
