'use strict';

var store = require('./config-store');

function build(config, health, running, currentTime) {
  var snapshot = health || null;
  var subscriptions = snapshot && snapshot.subscriptions ? snapshot.subscriptions : {};
  var subscriptionNames = Object.keys(subscriptions);
  var activeSubscriptions = subscriptionNames.filter(function (name) {
    return subscriptions[name].state === 'subscribed' ||
      subscriptions[name].state === 'responding';
  });
  var nowMs = currentTime === undefined ? Date.now() : Number(currentTime);
  var heartbeatAge = snapshot && snapshot.heartbeat_at ?
    nowMs - new Date(snapshot.heartbeat_at).getTime() : null;
  var monitorHealthy = Boolean(running && snapshot && heartbeatAge >= 0 &&
    heartbeatAge < 120000 && activeSubscriptions.length > 0);
  var monitorState = 'not_configured';

  if (config && !running) monitorState = 'stopped';
  else if (config && running && !snapshot) monitorState = 'starting';
  else if (config && running && monitorHealthy && snapshot.last_dynamic_range) {
    monitorState = 'monitoring';
  } else if (config && running && monitorHealthy) monitorState = 'connected';
  else if (config && running && snapshot && snapshot.last_error) monitorState = 'error';
  else if (config && running) monitorState = 'waiting_for_luna';

  return {
    paired: Boolean(config),
    running: Boolean(running),
    monitor_healthy: monitorHealthy,
    monitor_state: monitorState,
    app_version: snapshot ? snapshot.bridge_version : null,
    bridge_version: snapshot ? snapshot.bridge_version : null,
    callback_display: config ? store.redactCallback(config.callback_url) : null,
    device_id: config ? config.device_id : null,
    device_name: config ? config.device_name : null,
    command_api_enabled: config ? Boolean(config.command_token) : false,
    command_api_port: config && config.command_token ? config.command_port : null,
    command_api: snapshot ? snapshot.command_api : null,
    subscription_states: subscriptions,
    current_picture_context: snapshot ? snapshot.current_picture_context : null,
    last_dynamic_range: snapshot ? snapshot.last_dynamic_range : null,
    last_source: snapshot ? snapshot.last_source : null,
    last_observed_at: snapshot ? snapshot.last_observed_at : null,
    last_delivery_at: snapshot ? snapshot.last_delivery_at : null,
    last_delivery_status: snapshot ? snapshot.last_delivery_status : null,
    last_command: snapshot ? snapshot.last_command : null,
    last_error: snapshot ? snapshot.last_error : null
  };
}

module.exports = {build: build};
