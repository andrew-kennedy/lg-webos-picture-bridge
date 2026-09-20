'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function setup(config) {
  var methods = {};
  var state = {config: config, submitted: true, mqttCalls: 0, webhookCalls: 0, webhookError: null, cecCalls: 0};
  var controller = {health: {mqtt: {state: 'connecting'}},
    refreshMqtt: function () { state.mqttCalls++; return state.submitted; },
    reconfigure: function (unused, callback) { callback(null); }};
  function Service() { this.register = function (name, handler) { methods[name] = handler; }; }
  var dependencies = {
    'fs': {mkdirSync: function () {}, unlinkSync: function () {}, symlinkSync: function () {}},
    'child_process': {execFileSync: function () {}},
    'webos-service': Service,
    '/bridge/bridge': {start: function () { return controller; }},
    '/appinfo.json': {version: 'test'},
    '/bridge/lib/config-store': {exists: function () { return Boolean(state.config); },
      load: function () { return state.config; }, save: function (value) { state.config = value; return value; }},
    '/bridge/lib/health-store': {load: function () { return {}; }},
    '/bridge/lib/cec-guard': {create: function () { return {start: function () {},
      snapshot: function () { return {enabled: false}; },
      setEnabled: function () { state.cecCalls++; }}; }},
    '/bridge/lib/ui-status': {build: function (value) { return {configured: Boolean(value)}; }},
    '/bridge/lib/webhook': {postJson: function (url, payload, callback) {
      state.webhookCalls++; assert.strictEqual(payload.event, 'pairing_test');
      callback(state.webhookError, {statusCode: 200});
    }}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../services/io.github.andrewkennedy.lgpicturebridge.service/service.js'), 'utf8'), {
    require: function (name) {
      var key = name.replace('/media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge', '');
      assert.ok(dependencies[key], 'Unexpected require: ' + key); return dependencies[key];
    }, process: {stderr: {write: function () {}}, exit: function () { throw new Error('Unexpected exit'); }}
  });
  state.call = function (name, sender, payload) {
    var response;
    methods[name]({sender: sender === undefined ? 'io.github.andrewkennedy.lgpicturebridge-123' : sender,
      payload: payload, respond: function (value) { response = value; }});
    assert.ok(response); return response;
  };
  return state;
}

module.exports = function () {
  var service = setup({transport: 'mqtt'});
  var result = service.call('refreshReporting');
  assert.strictEqual(result.returnValue, true);
  assert.strictEqual(result.mqtt_submitted, true);
  assert.strictEqual(result.webhook_status, null);
  assert.strictEqual(result.ha_receipt_confirmed, false);
  assert.strictEqual(service.webhookCalls, 0);
  service.submitted = false;
  result = service.call('refreshReporting');
  assert.strictEqual(result.returnValue, false);
  assert.ok(result.errorText.includes('could not be submitted'));
  result = service.call('testWebhook');
  assert.strictEqual(result.returnValue, false, 'Legacy alias must not silently succeed while disconnected');
  var before = service.mqttCalls;
  assert.strictEqual(service.call('refreshReporting', 'untrusted.app').returnValue, false);
  assert.strictEqual(service.mqttCalls, before, 'Authorization is checked before publishing');
  assert.strictEqual(service.call('setCecGuard', 'untrusted.app', {enabled: true}).returnValue, false);
  assert.strictEqual(service.cecCalls, 0, 'Root changes require the authorized TV app');
  assert.strictEqual(service.call('setCecGuard', undefined, {enabled: 'true'}).returnValue, false);
  assert.strictEqual(service.call('setCecGuard', undefined, {enabled: true, command: 'anything'}).returnValue, false);
  assert.strictEqual(service.cecCalls, 0);
  assert.strictEqual(service.call('setCecGuard', undefined, {enabled: true}).returnValue, true);
  assert.strictEqual(service.cecCalls, 1);

  service = setup({transport: 'both', callback_url: 'http://ha/test'});
  result = service.call('refreshReporting');
  assert.strictEqual(result.mqtt_submitted, true);
  assert.strictEqual(result.webhook_status, 200);
  assert.strictEqual(service.webhookCalls, 1);
  service.webhookError = new Error('connection refused');
  result = service.call('refreshReporting');
  assert.strictEqual(result.returnValue, false);
  assert.ok(result.errorText.includes('MQTT republish submitted; webhook test failed'));

  service = setup({transport: 'webhook', callback_url: 'http://ha/test'});
  result = service.call('testWebhook');
  assert.strictEqual(service.mqttCalls, 0);
  assert.strictEqual(result.mqtt_submitted, false);
  assert.strictEqual(result.webhook_status, 200);
  assert.strictEqual(result.ha_receipt_confirmed, false);

  service = setup(null);
  assert.strictEqual(service.call('refreshReporting').returnValue, false);
  service.submitted = false;
  result = service.call('configure', undefined, {transport: 'mqtt'});
  assert.strictEqual(result.returnValue, true, 'Saving configuration is separate from connection readiness');
  assert.strictEqual(result.status.configured, true);
  assert.strictEqual(result.delivery_status, 'mqtt_connecting');
  service.webhookError = new Error('connection refused');
  result = service.call('configure', undefined, {transport: 'webhook'});
  assert.strictEqual(result.returnValue, false);
  assert.ok(result.errorText.includes('Configuration saved, but webhook test failed'));
};
