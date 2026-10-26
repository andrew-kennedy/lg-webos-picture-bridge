'use strict';

var crypto = require('crypto');
var mqtt = require('./mqtt-client');
var mqttCommands = require('./mqtt-commands');
var mqttCec = require('./mqtt-cec');
var mqttSettings = require('./mqtt-settings');
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
function snapshot(picture, signal, config, timing) {
  timing = timing || {};
  var aligned = picture && signal && physicalInput(picture.input) === signal.input && signal.input;
  // HLG uses the HDR picture bank on G6. The MAIN video output identifies the
  // transfer function; wait for coherent picture dimensions during transitions.
  var videoRange = signal && signal.dynamic_range;
  var coherent = aligned && (!videoRange || videoRange === picture.dynamic_range ||
    (videoRange === 'hlg' && picture.dynamic_range === 'hdr10'));
  return {
    device_id: config.device_id,
    input: signal ? signal.input : null,
    picture_input_dimension: aligned ? picture.input : null,
    dynamic_range: coherent && signal.signal_present === true ? (videoRange || picture.dynamic_range) : null,
    picture_mode: aligned ? picture.picture_mode : null,
    signal_present: signal ? signal.signal_present : null,
    signal_state: signal ? signal.signal_state : null,
    screensaver_type: signal ? signal.screensaver_type : null,
    observed_at: timing.observed_at || null,
    heartbeat_at: timing.heartbeat_at || new Date().toISOString(),
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
  var lastObserved = null;
  var clock = deps.now || Date.now;
  var later = deps.setTimeout || setTimeout, cancelLater = deps.clearTimeout || clearTimeout;
  var schedule = deps.setInterval || setInterval, cancel = deps.clearInterval || clearInterval;
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
  var controls = settings.commands_enabled && deps.service ? mqttSettings.create({
    config: config, id: id, service: deps.service, enqueue: deps.enqueueSetting,
    publish: function (topic, payload, retain) { return online && !stopped && client.publish(topic, payload, retain); },
    context: function () {
      return {input: picture && picture.input, mode: picture && picture.picture_mode,
        range: picture && picture.raw_dynamic_range, ready: Boolean(snapshot(picture, signal, config).dynamic_range)};
    }
  }) : null;

  function observeContext() {
    // Mode notifications are caused by our own writes. Only routing/range/signal invalidate
    // work; use a revision so loss-and-recovery to the SAME context also invalidates old work.
    var next = JSON.stringify([picture && picture.input, picture && picture.raw_dynamic_range,
      signal && signal.input, signal && signal.signal_present, signal && signal.dynamic_range]);
    if (next !== contextKey) { contextKey = next; contextRevision += 1; }
    if (controls) controls.contextChanged();
  }

  function reportHealth(state, error) {
    onHealth({state: state, last_error: error || null, state_topic: base + '/state',
      last_published_at: lastPublished, commands_enabled: Boolean(commands),
      commands_ready: Boolean(commands && commands.status().ready),
      cec_commands_enabled: Boolean(cec), cec_commands_ready: Boolean(cec && cec.status().ready)});
  }

  function publish() {
    if (!online || stopped) return false;
    var state = snapshot(picture, signal, config, {
      observed_at: lastObserved, heartbeat_at: new Date(clock()).toISOString()
    });
    var submitted = false;
    // Do not retain observations: HA must not replay stale no-signal states on restart.
    if (client.publish(base + '/state', JSON.stringify(state), false)) {
      lastPublished = state.heartbeat_at;
      reportHealth('connected');
      submitted = true;
    }
    if (commands && commands.status().ready && !commands.publish()) submitted = false;
    if (cec && !cec.publish()) submitted = false;
    if (controls && !controls.publish()) submitted = false;
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
    if (controls) controls.refresh();
    else if (deps.service) mqttSettings.tombstones(config, id).forEach(function (topic) { client.publish(topic, '', true); });
    if (!publish()) submitted = false;
    if (!client.publish(base + '/availability', 'online', true)) submitted = false;
    // QoS 0 only confirms submission to the local socket, not broker/HA receipt.
    return submitted;
  }
  function update() {
    cancelLater(timer);
    timer = later(publish, config.debounce_ms);
  }
  function observed(value) {
    if (!value) return;
    var timestamp = Object.prototype.hasOwnProperty.call(value, 'observed_at') ?
      value.observed_at : new Date(clock()).toISOString();
    if (timestamp && isFinite(Date.parse(timestamp)) && (!lastObserved || timestamp > lastObserved)) lastObserved = timestamp;
  }
  client.on('status', function (status) {
    reportHealth(status.state, status.error);
  });
  client.on('connect', function () {
    online = true;
    if (commands) { commands.connect(); client.subscribe(base + '/command'); }
    if (cec) { cec.connect(); client.subscribe(base + '/cec/command'); }
    if (controls) { controls.connect(); client.subscribe(base + '/settings/command'); }
    client.subscribe(settings.discovery_prefix + '/status');
    announce();
  });
  client.on('subscribed', function (topic) {
    if (commands && topic === base + '/command') { commands.subscribed(); reportHealth('connected'); }
    if (cec && topic === base + '/cec/command') { cec.subscribed(); reportHealth('connected'); }
    if (controls && topic === base + '/settings/command') controls.subscribed();
  });
  client.on('disconnect', function () {
    online = false; if (commands) commands.disconnect(); if (cec) cec.disconnect(); reportHealth('disconnected');
    if (controls) controls.disconnect();
  });
  client.on('message', function (topic, message, metadata) {
    if (topic === settings.discovery_prefix + '/status' && message === 'online') announce();
    if (commands && topic === base + '/command') commands.receive(message, metadata);
    if (cec && topic === base + '/cec/command') cec.receive(message, metadata);
    if (controls && topic === base + '/settings/command') controls.receive(message, metadata);
  });
  return {
    start: function () { client.start(); if (cec) cec.start(); if (controls) controls.start(); refreshTimer = schedule(publish, 30000); },
    picture: function (value) { picture = value; observed(value); observeContext(); update(); },
    signal: function (value) {
      signal = value;
      observed(value);
      observeContext();
      // Invalidated sessions and real signal loss are published immediately.
      if (!value || value.signal_present !== true) { cancelLater(timer); publish(); }
      else update();
    },
    refresh: announce,
    stop: function (callback) {
      stopped = true; if (commands) commands.disconnect();
      if (cec) cec.stop();
      if (controls) controls.stop();
      cancelLater(timer); cancel(refreshTimer); client.stop(callback);
    }
  };
}

module.exports = {create: create, buildDiscovery: buildDiscovery, identity: identity, snapshot: snapshot};
