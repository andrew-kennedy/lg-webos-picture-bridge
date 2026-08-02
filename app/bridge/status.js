#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var store = require('./lib/config-store');
var healthStore = require('./lib/health-store');
var appInfo = require('../appinfo.json');

var APP_ID = 'io.github.andrewkennedy.lgpicturebridge';
var RUNNER_PATH = '/media/developer/apps/usr/palm/applications/' + APP_ID + '/scripts/runner.sh';

function processIsRunning(pidFile) {
  var pid;
  if (!fs.existsSync(pidFile)) return false;
  pid = String(fs.readFileSync(pidFile, 'utf8')).trim();
  if (!/^\d+$/.test(pid)) return false;
  try {
    process.kill(Number(pid), 0);
    return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').indexOf(RUNNER_PATH) !== -1;
  } catch (error) {
    return false;
  }
}

var pidFile = path.join(store.stateDir(), 'bridge.pid');
var paired = store.exists();
var config = paired ? store.load() : null;
var running = processIsRunning(pidFile);
var health = healthStore.load();
var heartbeatAge = health && health.heartbeat_at ?
  Date.now() - new Date(health.heartbeat_at).getTime() : null;
var subscriptions = health && health.subscriptions ? health.subscriptions : {};
var subscriptionNames = Object.keys(subscriptions);
var activeSubscriptions = subscriptionNames.filter(function (name) {
  return subscriptions[name].state === 'subscribed' || subscriptions[name].state === 'responding';
});
var monitorHealthy = running && health && heartbeatAge >= 0 && heartbeatAge < 120000 &&
  activeSubscriptions.length > 0;
var monitorState = 'not_configured';

if (paired && !running) monitorState = 'stopped';
else if (paired && running && !health) monitorState = 'starting';
else if (paired && running && monitorHealthy && health.last_dynamic_range) monitorState = 'monitoring';
else if (paired && running && monitorHealthy) monitorState = 'connected';
else if (paired && running && health && health.last_error) monitorState = 'error';
else if (paired && running) monitorState = 'waiting_for_luna';

process.stdout.write(JSON.stringify({
  paired: paired,
  running: running,
  monitor_healthy: monitorHealthy,
  monitor_state: monitorState,
  app_version: appInfo.version,
  bridge_version: health ? health.bridge_version : null,
  callback_display: config ? store.redactCallback(config.callback_url) : null,
  device_id: config ? config.device_id : null,
  device_name: config ? config.device_name : null,
  command_api_enabled: config ? Boolean(config.command_token) : false,
  command_api_port: config && config.command_token ? config.command_port : null,
  command_api: health ? health.command_api : null,
  subscription_states: subscriptions,
  current_picture_context: health ? health.current_picture_context : null,
  last_dynamic_range: health ? health.last_dynamic_range : null,
  last_source: health ? health.last_source : null,
  last_observed_at: health ? health.last_observed_at : null,
  last_delivery_at: health ? health.last_delivery_at : null,
  last_delivery_status: health ? health.last_delivery_status : null,
  last_command: health ? health.last_command : null,
  last_error: health ? health.last_error : null
}) + '\n');
