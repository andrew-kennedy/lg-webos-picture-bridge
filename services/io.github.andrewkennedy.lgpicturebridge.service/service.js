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
var service = new Service(SERVICE_ID);
var controller = null;

function loadConfig() {
  return store.exists() ? store.load() : null;
}

function statusSnapshot() {
  return uiStatus.build(loadConfig(), controller ? controller.health : healthStore.load(),
    Boolean(controller));
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
  webhook.postJson(config.callback_url, pairingEvent(config), callback);
}

service.register('uiStatus', function (message) {
  if (!appIsAuthorized(message)) return;
  message.respond({returnValue: true, status: statusSnapshot()});
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
      respondError(message, error);
      return;
    }
    sendPairingTest(saved, function (testError, response) {
      if (testError) {
        respondError(message, testError);
        return;
      }
      message.respond({
        returnValue: true,
        delivery_status: 'http_' + response.statusCode,
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
      respondError(message, error);
    }
  }
});

service.register('testWebhook', function (message) {
  var config;
  if (!appIsAuthorized(message)) return;
  try {
    config = loadConfig();
    if (!config) throw new Error('LG Picture Bridge is not paired');
  } catch (error) {
    respondError(message, error);
    return;
  }
  sendPairingTest(config, function (error, response) {
    if (error) {
      respondError(message, error);
      return;
    }
    message.respond({
      returnValue: true,
      delivery_status: 'http_' + response.statusCode,
      status: statusSnapshot()
    });
  });
});

try {
  if (store.exists()) controller = bridge.start(service, {config: store.load()});
} catch (error) {
  process.stderr.write(new Date().toISOString() + ' Service startup failed: ' +
    (error.stack || error.message) + '\n');
  process.exit(1);
}
