'use strict';

var crypto = require('crypto');
var mqtt = require('./mqtt-client');
var mqttCommands = require('./mqtt-commands');
var mqttCec = require('./mqtt-cec');
var appInfo = require('../../appinfo.json');

function identity(deviceId) {
  return 'lgpb_' + crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 16);
}
function buildDiscovery(config) {
  var id = identity(config.device_id);
  var base = config.mqtt.topic_prefix + '/' + id;
  var device = {identifiers: [id], name: config.device_name, manufacturer: 'LG / webOS Homebrew',
    model: 'LG Picture Bridge', sw_version: appInfo.version};
  var entities = [
    ['binary_sensor', 'hdmi_signal', 'HDMI signal', 'signal_present', null],
    ['sensor', 'input', 'Input', 'input', null],
    ['sensor', 'dynamic_range', 'Dynamic range', 'dynamic_range', null],
    ['sensor', 'picture_mode', 'Picture mode', 'picture_mode', null],
    ['sensor', 'signal_state', 'Signal state', 'signal_state', 'diagnostic'],
    ['sensor', 'screensaver_type', 'Screensaver type', 'screensaver_type', 'diagnostic']
  ];
  if (config.mqtt.commands_enabled) {
    entities.push(['sensor', 'picture_command', 'Picture command', 'state', 'diagnostic']);
  }
  return entities.map(function (entity) {
    var payload = {
      name: entity[2], unique_id: id + '_' + entity[1],
      default_entity_id: entity[0] + '.lg_tv_' + entity[1],
      device: device, origin: {name: 'LG Picture Bridge', sw_version: appInfo.version,
        support_url: 'https://github.com/andrew-kennedy/lg-webos-picture-bridge'},
      state_topic: base + '/state', availability_topic: base + '/availability',
      payload_available: 'online', payload_not_available: 'offline',
      expire_after: 90,
      value_template: '{{ value_json.' + entity[3] + ' }}'
    };
    if (entity[0] === 'binary_sensor') {
      payload.payload_on = 'ON'; payload.payload_off = 'OFF';
      payload.icon = 'mdi:video-input-hdmi';
      payload.value_template = "{{ 'ON' if value_json.signal_present == true else ('OFF' if value_json.signal_present == false else 'None') }}";
    }
    if (entity[4]) payload.entity_category = entity[4];
    if (entity[1] === 'picture_command') {
      payload.state_topic = base + '/command_status';
      payload.json_attributes_topic = payload.state_topic;
      payload.icon = 'mdi:tune';
    }
    return {topic: config.mqtt.discovery_prefix + '/' + entity[0] + '/' + id + '_' + entity[1] + '/config', payload: payload};
  });
}
function physicalInput(value) { return value ? String(value).replace(/_pc$/, '') : null; }
function snapshot(picture, signal, config) {
  var aligned = picture && signal && physicalInput(picture.input) === signal.input && signal.input;
  return {
    device_id: config.device_id,
    input: signal ? signal.input : null,
    picture_input_dimension: aligned ? picture.input : null,
    dynamic_range: aligned && signal.signal_present === true ? picture.dynamic_range : null,
    picture_mode: aligned ? picture.picture_mode : null,
    signal_present: signal ? signal.signal_present : null,
    signal_state: signal ? signal.signal_state : null,
    screensaver_type: signal ? signal.screensaver_type : null,
    observed_at: new Date().toISOString(),
    bridge_version: appInfo.version
  };
}
function create(config, onHealth, dependencies) {
  var deps = dependencies || {};
  var settings = config.mqtt;
  var id = identity(config.device_id);
  var base = settings.topic_prefix + '/' + id;
  var picture = null;
  var signal = null;
  var contextKey = null;
  var contextRevision = 0;
  var online = false;
  var timer = null;
  var refreshTimer = null;
  var stopped = false;
  var lastPublished = null;
  var client = (deps.client || mqtt).create({host: settings.host, port: settings.port,
    tls: settings.tls, ca: settings.ca, username: settings.username, password: settings.password,
    client_id: id, availability_topic: base + '/availability'});
  var commands = settings.commands_enabled ? mqttCommands.create({
    topic: base + '/command',
    applyPolicy: deps.applyPolicy,
    context: function () { return contextRevision; },
    pictureReady: function () { return Boolean(snapshot(picture, signal, config).dynamic_range); },
    publish: function (status) {
      return online && !stopped ? client.publish(base + '/command_status', JSON.stringify(status), false) : false;
    }
  }) : null;
  var cec = settings.cec_commands_enabled && deps.cecGuard ? mqttCec.create({
    topic: base + '/cec/command', guard: deps.cecGuard, service: deps.service,
    publish: function (status) {
      return online && !stopped ? client.publish(base + '/cec/state', JSON.stringify(status), false) : false;
    }
  }) : null;

  function observeContext() {
    // Mode notifications are caused by our own writes. Only routing/range/signal invalidate
    // work; use a revision so loss-and-recovery to the SAME context also invalidates old work.
    var next = JSON.stringify([picture && picture.input, picture && picture.raw_dynamic_range,
      signal && signal.input, signal && signal.signal_present]);
    if (next !== contextKey) { contextKey = next; contextRevision += 1; }
  }

  function reportHealth(state, error) {
    onHealth({state: state, last_error: error || null, state_topic: base + '/state',
      last_published_at: lastPublished, commands_enabled: Boolean(commands),
      commands_ready: Boolean(commands && commands.status().ready),
      cec_commands_enabled: Boolean(cec), cec_commands_ready: Boolean(cec && cec.status().ready)});
  }

  function publish() {
    if (!online || stopped) return false;
    var state = snapshot(picture, signal, config);
    var submitted = false;
    // Do not retain observations: HA must not replay stale no-signal states on restart.
    if (client.publish(base + '/state', JSON.stringify(state), false)) {
      lastPublished = state.observed_at;
      reportHealth('connected');
      submitted = true;
    }
    if (commands && commands.status().ready && !commands.publish()) submitted = false;
    if (cec && !cec.publish()) submitted = false;
    return submitted;
  }
  function announce() {
    if (!online || stopped) return false;
    var submitted = true;
    buildDiscovery(config).forEach(function (item) {
      if (!client.publish(item.topic, JSON.stringify(item.payload), true)) submitted = false;
    });
    if (cec) {
      mqttCec.discovery(config, id, cec.status().session_id).forEach(function (item) {
        if (!client.publish(item.topic, JSON.stringify(item.payload), true)) submitted = false;
      });
    } else if (deps.cecGuard) {
      ['sensor', 'switch'].forEach(function (kind) {
        if (!client.publish(settings.discovery_prefix + '/' + kind + '/' + id + '_cec_filter/config', '', true)) submitted = false;
      });
    }
    if (!commands) {
      // Remove the opt-in entity when commands are subsequently disabled.
      if (!client.publish(settings.discovery_prefix + '/sensor/' + id + '_picture_command/config', '', true)) {
        submitted = false;
      }
    }
    if (!publish()) submitted = false;
    if (!client.publish(base + '/availability', 'online', true)) submitted = false;
    // QoS 0 only confirms submission to the local socket, not broker/HA receipt.
    return submitted;
  }
  function update() {
    clearTimeout(timer);
    timer = setTimeout(publish, config.debounce_ms);
  }
  client.on('status', function (status) {
    reportHealth(status.state, status.error);
  });
  client.on('connect', function () {
    online = true;
    if (commands) { commands.connect(); client.subscribe(base + '/command'); }
    if (cec) { cec.connect(); client.subscribe(base + '/cec/command'); }
    client.subscribe(settings.discovery_prefix + '/status');
    announce();
  });
  client.on('subscribed', function (topic) {
    if (commands && topic === base + '/command') { commands.subscribed(); reportHealth('connected'); }
    if (cec && topic === base + '/cec/command') { cec.subscribed(); reportHealth('connected'); }
  });
  client.on('disconnect', function () {
    online = false; if (commands) commands.disconnect(); if (cec) cec.disconnect(); reportHealth('disconnected');
  });
  client.on('message', function (topic, message, metadata) {
    if (topic === settings.discovery_prefix + '/status' && message === 'online') announce();
    if (commands && topic === base + '/command') commands.receive(message, metadata);
    if (cec && topic === base + '/cec/command') cec.receive(message, metadata);
  });
  return {
    start: function () { client.start(); if (cec) cec.start(); refreshTimer = setInterval(publish, 30000); },
    picture: function (value) { picture = value; observeContext(); update(); },
    signal: function (value) {
      signal = value;
      observeContext();
      // Invalidated sessions and real signal loss are published immediately.
      if (!value || value.signal_present !== true) { clearTimeout(timer); publish(); }
      else update();
    },
    refresh: announce,
    stop: function (callback) {
      stopped = true; if (commands) commands.disconnect();
      if (cec) cec.stop();
      clearTimeout(timer); clearInterval(refreshTimer); client.stop(callback);
    }
  };
}

module.exports = {create: create, buildDiscovery: buildDiscovery, identity: identity, snapshot: snapshot};
