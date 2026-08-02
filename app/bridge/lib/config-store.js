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
  if (typeof config.callback_url !== 'string' || config.callback_url.length > 2048) {
    throw new Error('callback_url is required and must be shorter than 2048 characters');
  }
  if (!/^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(config.callback_url)) {
    throw new Error('callback_url must be a single HTTP or HTTPS URL without control characters');
  }
  parsed = url.parse(config.callback_url);
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new Error('callback_url must use HTTP or HTTPS and include a hostname');
  }
  if (parsed.auth || parsed.hash) {
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
    callback_url: config.callback_url,
    device_id: String(config.device_id || 'lg-webos-tv').slice(0, 128),
    device_name: String(config.device_name || 'LG webOS TV').slice(0, 128),
    debounce_ms: Math.round(debounce),
    command_token: commandToken,
    command_port: commandPort
  };
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
