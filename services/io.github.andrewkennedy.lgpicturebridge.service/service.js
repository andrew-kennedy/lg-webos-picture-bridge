#!/usr/bin/env node
'use strict';

var fs = require('fs');
var childProcess = require('child_process');

var APP_ID = 'io.github.andrewkennedy.lgpicturebridge';
var SERVICE_ID = APP_ID + '.service';
var APP_ROOT = '/media/developer/apps/usr/palm/applications/' + APP_ID;
var STARTUP_DIRECTORY = '/var/lib/webosbrew/init.d';
var STARTUP_LINK = STARTUP_DIRECTORY + '/55-lg-picture-bridge';
var Service = require('webos-service');
var bridge = require(APP_ROOT + '/bridge/bridge');
var appInfo = require(APP_ROOT + '/appinfo.json');
var store = require(APP_ROOT + '/bridge/lib/config-store');
var healthStore = require(APP_ROOT + '/bridge/lib/health-store');
var uiStatus = require(APP_ROOT + '/bridge/lib/ui-status');
var webhook = require(APP_ROOT + '/bridge/lib/webhook');
var cecGuard = require(APP_ROOT + '/bridge/lib/cec-guard').create();
var service = new Service(SERVICE_ID);
var controller = null;

function loadConfig() {
  return store.exists() ? store.load() : null;
}

function statusSnapshot() {
  var status = uiStatus.build(loadConfig(), controller ? controller.health : healthStore.load(),
    Boolean(controller));
  status.cec_guard = cecGuard.snapshot();
  return status;
}

function respondError(message, error) {
  message.respond({
    returnValue: false,
    errorCode: error.code || 'bridge_error',
    errorText: error.message || String(error)
  });
}

function appIsAuthorized(message) {
  if (message.sender === APP_ID || String(message.sender || '').indexOf(APP_ID + '-') === 0) {
    return true;
  }
  message.respond({
    returnValue: false,
    errorCode: 'unauthorized',
    errorText: 'This method is available only to the LG Picture Bridge app'
  });
  return false;
}

function ensureStartupLink() {
  childProcess.execFileSync(APP_ROOT + '/scripts/install-security.sh', ['install']);
  try {
    fs.mkdirSync(STARTUP_DIRECTORY, 493); // 0755
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  try {
    fs.unlinkSync(STARTUP_LINK);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.symlinkSync(APP_ROOT + '/scripts/startup.sh', STARTUP_LINK);
}

function pairingEvent(config) {
  return {
    event: 'pairing_test',
    dynamic_range: null,
    source: 'pairing',
    observed_at: new Date().toISOString(),
    device_id: config.device_id,
    device_name: config.device_name,
    bridge_version: appInfo.version
  };
}

function sendPairingTest(config, callback) {
  if (config.transport === 'mqtt') {
    if (controller) controller.refreshMqtt();
    callback(null, {statusCode: null});
    return;
  }
  webhook.postJson(config.callback_url, pairingEvent(config), callback);
}

function deliveryStatus(config, response) {
  return config.transport === 'mqtt' ? 'mqtt_' + (controller.health.mqtt.state || 'connecting') :
    'http_' + response.statusCode;
}

service.register('uiStatus', function (message) {
  if (!appIsAuthorized(message)) return;
  message.respond({returnValue: true, status: statusSnapshot()});
});

service.register('setCecGuard', function (message) {
  if (!appIsAuthorized(message)) return;
  try {
    var payload = message.payload || {};
    if (Object.keys(payload).length !== 1 || typeof payload.enabled !== 'boolean') {
      throw new Error('Provide only enabled: true or false');
    }
    cecGuard.setEnabled(payload.enabled);
    message.respond({returnValue: true, status: statusSnapshot()});
  } catch (error) { respondError(message, error); }
});

service.register('configure', function (message) {
  var saved;
  if (!appIsAuthorized(message)) return;
  try {
    saved = store.save(message.payload || {});
    ensureStartupLink();
  } catch (error) {
    respondError(message, error);
    return;
  }

  function configured(error) {
    if (error) {
      error.message = 'Configuration saved, but monitor setup failed: ' + error.message;
      respondError(message, error);
      return;
    }
    sendPairingTest(saved, function (testError, response) {
      if (testError) {
        testError.message = 'Configuration saved, but webhook test failed: ' + testError.message;
        respondError(message, testError);
        return;
      }
      message.respond({
        returnValue: true,
        delivery_status: deliveryStatus(saved, response),
        status: statusSnapshot()
      });
    });
  }

  if (controller) controller.reconfigure(saved, configured);
  else {
    try {
      controller = bridge.start(service, {config: saved});
      configured(null);
    } catch (error) {
      configured(error);
    }
  }
});

function refreshReporting(message) {
  var config;
  var mqttSubmitted = false;
  if (!appIsAuthorized(message)) return;
  try {
    config = loadConfig();
    if (!config) throw new Error('LG Picture Bridge is not configured');
    if (config.transport === 'mqtt' || config.transport === 'both') {
      mqttSubmitted = Boolean(controller && controller.refreshMqtt());
      if (!mqttSubmitted) {
        throw new Error('MQTT republish could not be submitted. Check the broker connection; ' +
          'discovery and state are republished automatically after reconnecting.');
      }
    }
  } catch (error) {
    respondError(message, error);
    return;
  }
  function completed(error, response) {
    if (error) {
      if (mqttSubmitted) error.message = 'MQTT republish submitted; webhook test failed: ' + error.message;
      respondError(message, error);
      return;
    }
    message.respond({
      returnValue: true,
      mqtt_submitted: mqttSubmitted,
      webhook_status: response ? response.statusCode : null,
      ha_receipt_confirmed: false,
      status: statusSnapshot()
    });
  }
  if (config.transport === 'mqtt') completed(null, null);
  else webhook.postJson(config.callback_url, pairingEvent(config), completed);
}

service.register('refreshReporting', refreshReporting);
// Compatibility for older installed frontends; use the same truthful result/errors.
service.register('testWebhook', refreshReporting);

try {
  if (store.exists()) controller = bridge.start(service, {config: store.load()});
  cecGuard.start(); // Independently fail-open: never prevents the MQTT bridge from starting.
} catch (error) {
  process.stderr.write(new Date().toISOString() + ' Service startup failed: ' +
    (error.stack || error.message) + '\n');
  process.exit(1);
}
