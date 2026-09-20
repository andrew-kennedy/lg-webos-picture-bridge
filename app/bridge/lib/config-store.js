'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');

var DEFAULT_STATE_DIR = '/var/lib/io.github.andrewkennedy.lgpicturebridge';

function stateDir() {
  return process.env.LG_PICTURE_BRIDGE_STATE_DIR || DEFAULT_STATE_DIR;
}

function configPath() {
  return path.join(stateDir(), 'config.json');
}

function ensureDirectory(directory) {
  if (fs.existsSync(directory)) return;
  fs.mkdirSync(directory, 448); // 0700
}

function validate(input) {
  var parsed;
  var debounce;
  var commandPort;
  var commandToken;
  var config = input || {};
  var mqtt = validateMqtt(config.mqtt);
  var transport = config.transport || (mqtt ? (config.callback_url ? 'both' : 'mqtt') : 'webhook');
  var usesWebhook = transport === 'webhook' || transport === 'both';
  if (['webhook', 'mqtt', 'both'].indexOf(transport) === -1) throw new Error('Invalid transport');
  if (transport !== 'webhook' && !mqtt) throw new Error('MQTT configuration is required');
  if (usesWebhook && (typeof config.callback_url !== 'string' || !config.callback_url)) {
    throw new Error('callback_url is required for webhook transport');
  }
  if (config.callback_url && (typeof config.callback_url !== 'string' || config.callback_url.length > 2048)) {
    throw new Error('callback_url is required and must be shorter than 2048 characters');
  }
  if (config.callback_url && !/^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(config.callback_url)) {
    throw new Error('callback_url must be a single HTTP or HTTPS URL without control characters');
  }
  parsed = config.callback_url ? url.parse(config.callback_url) : null;
  if (parsed && ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname)) {
    throw new Error('callback_url must use HTTP or HTTPS and include a hostname');
  }
  if (parsed && (parsed.auth || parsed.hash)) {
    throw new Error('callback_url must not contain credentials or a fragment');
  }
  debounce = Number(config.debounce_ms || 1200);
  if (!isFinite(debounce) || debounce < 250 || debounce > 10000) {
    throw new Error('debounce_ms must be between 250 and 10000');
  }
  commandToken = config.command_token === undefined || config.command_token === null ?
    null : String(config.command_token);
  if (commandToken === '') commandToken = null;
  if (commandToken && (commandToken.length < 24 || commandToken.length > 256 ||
      /\s/.test(commandToken))) {
    throw new Error('command_token must contain 24 to 256 characters without whitespace');
  }
  commandPort = Number(config.command_port || 49191);
  if (!isFinite(commandPort) || Math.round(commandPort) !== commandPort ||
      commandPort < 1024 || commandPort > 65535) {
    throw new Error('command_port must be an integer between 1024 and 65535');
  }
  return {
    callback_url: config.callback_url || null,
    transport: transport,
    mqtt: mqtt,
    device_id: String(config.device_id || 'lg-webos-tv').slice(0, 128),
    device_name: String(config.device_name || 'LG webOS TV').slice(0, 128),
    debounce_ms: Math.round(debounce),
    command_token: commandToken,
    command_port: commandPort
  };
}

function validateMqtt(value) {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('mqtt must be an object');
  if (typeof value.host !== 'string' || !/^[a-zA-Z0-9._:-]{1,253}$/.test(value.host)) throw new Error('Invalid MQTT host');
  var secure = value.tls === true;
  if (value.commands_enabled !== undefined && typeof value.commands_enabled !== 'boolean') {
    throw new Error('mqtt.commands_enabled must be a boolean');
  }
  if (value.cec_commands_enabled !== undefined && typeof value.cec_commands_enabled !== 'boolean') {
    throw new Error('mqtt.cec_commands_enabled must be a boolean');
  }
  if (value.tls !== undefined && typeof value.tls !== 'boolean') throw new Error('mqtt.tls must be a boolean');
  var port = value.port === undefined ? (secure ? 8883 : 1883) : Number(value.port);
  if (!isFinite(port) || Math.floor(port) !== port || port < 1 || port > 65535) throw new Error('Invalid MQTT port');
  function credential(name) {
    if (value[name] === undefined || value[name] === null) return '';
    if (typeof value[name] !== 'string' || value[name].length > 1024 || /[\x00-\x1f\x7f]/.test(value[name])) throw new Error('Invalid MQTT ' + name);
    return value[name];
  }
  function prefix(name, fallback) {
    var text = value[name] === undefined ? fallback : value[name];
    if (typeof text !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(text) || text.length > 128) throw new Error('Invalid MQTT ' + name);
    return text;
  }
  var username = credential('username');
  var password = credential('password');
  if (password && !username) throw new Error('MQTT password requires a username');
  if (value.ca && (!secure || typeof value.ca !== 'string' || value.ca.length > 16384 || value.ca.indexOf('-----BEGIN CERTIFICATE-----') === -1)) throw new Error('Invalid MQTT CA certificate');
  return {host: value.host, port: port, tls: secure, ca: value.ca || null,
    commands_enabled: value.commands_enabled === true,
    cec_commands_enabled: value.cec_commands_enabled === true,
    username: username, password: password,
    topic_prefix: prefix('topic_prefix', 'lg_picture_bridge'),
    discovery_prefix: prefix('discovery_prefix', 'homeassistant')};
}

function save(input) {
  var config = validate(input);
  var target = configPath();
  var temporary = target + '.tmp-' + process.pid;
  ensureDirectory(stateDir());
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', {mode: 384}); // 0600
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 384); } catch (error) { /* Best effort on webOS. */ }
  return config;
}

function load() {
  return validate(JSON.parse(fs.readFileSync(configPath(), 'utf8')));
}

function exists() {
  return fs.existsSync(configPath());
}

function clear() {
  if (exists()) fs.unlinkSync(configPath());
}

function redactCallback(callbackUrl) {
  var parsed;
  var segments;
  if (!callbackUrl) return null;
  parsed = url.parse(callbackUrl);
  segments = (parsed.pathname || '').split('/');
  if (segments.length > 2) segments[segments.length - 1] = '••••••••';
  return parsed.protocol + '//' + parsed.host + segments.join('/');
}

module.exports = {
  clear: clear,
  configPath: configPath,
  exists: exists,
  load: load,
  redactCallback: redactCallback,
  save: save,
  stateDir: stateDir,
  validate: validate
};
