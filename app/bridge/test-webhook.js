#!/usr/bin/env node
'use strict';

var store = require('./lib/config-store');
var webhook = require('./lib/webhook');
var appInfo = require('../appinfo.json');

try {
  var config = store.load();
  webhook.postJson(config.callback_url, {
    event: 'pairing_test',
    dynamic_range: null,
    previous_dynamic_range: null,
    source: 'pairing',
    raw_value: null,
    observed_at: new Date().toISOString(),
    device_id: config.device_id,
    device_name: config.device_name,
    bridge_version: appInfo.version
  }, function (error, response) {
    if (error) {
      process.stderr.write('Pairing test failed: ' + error.message + '\n');
      process.exit(1);
    }
    process.stdout.write('Pairing test delivered (HTTP ' + response.statusCode + ')\n');
  });
} catch (error) {
  process.stderr.write('Pairing test failed: ' + error.message + '\n');
  process.exit(1);
}
