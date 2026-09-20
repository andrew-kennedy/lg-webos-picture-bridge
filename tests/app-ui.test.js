'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function setup(initial) {
  var elements = {}, events = {}, interval;
  var ui = {status: initial, calls: [], confirmed: false, hold: false};
  var html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  html.replace(/id="([^"]+)"/g, function (unused, id) {
    elements[id] = {textContent: '', className: '', disabled: false, events: {}, scrollTop: 0, clientHeight: 400,
      focus: function () { document.activeElement = this; },
      addEventListener: function (name, handler) { this.events[name] = handler; }};
  });
  var document = {hidden: false, getElementById: function (id) {
    assert.ok(elements[id], 'Missing HTML element: ' + id); return elements[id];
  }, addEventListener: function (event, handler) { events[event] = handler; }};
  function PalmServiceBridge() {}
  PalmServiceBridge.prototype.call = function (uri, payload) {
    var bridge = this;
    var call = {uri: uri, payload: JSON.parse(payload), respond: function (result) {
      bridge.onservicecallback(JSON.stringify(result));
    }};
    ui.calls.push(call);
    if (ui.hold) return;
    if (uri.endsWith('/setCecGuard')) {
      ui.status.cec_guard = {enabled: call.payload.enabled, supported: true, lease_active: call.payload.enabled};
      call.respond({returnValue: true, status: ui.status});
    } else if (uri.endsWith('/refreshReporting')) {
      call.respond(ui.reportingResult || {returnValue: true, mqtt_submitted: true, status: ui.status});
    } else call.respond({returnValue: true, status: ui.status});
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8'), {
    document: document, PalmServiceBridge: PalmServiceBridge,
    window: {confirm: function (message) {
      assert.ok(message.includes('Home Assistant entities are not deleted') ||
        message.includes('CEC filtering') || message.includes('rules configured by Home Assistant')); return ui.confirmed;
    }, setTimeout: function () {}, setInterval: function (handler, delay) {
      assert.strictEqual(delay, 5000); interval = handler;
    }}
  });
  ui.elements = elements;
  ui.document = document;
  ui.tick = function () { interval(); };
  ui.click = function (id) { elements[id].events.click({type: 'click'}); };
  ui.launch = function (params) { events.webOSLaunch({detail: params || {}}); };
  ui.key = function (key) {
    var prevented = false;
    events.keydown({keyCode: key, preventDefault: function () { prevented = true; }});
    return prevented;
  };
  ui.launch();
  return ui;
}

module.exports = function () {
  var status = {configured: true, running: true, monitor_healthy: true, transport: 'mqtt',
    mqtt_commands_enabled: true, mqtt: {state: 'connected', commands_ready: true},
    command_api_enabled: true, command_api_port: 49191, command_api: {state: 'listening'}};
  var ui = setup(status);
  var el = ui.elements;
  assert.strictEqual(el['status-title'].textContent, 'Monitoring · broker connected');
  assert.strictEqual(el['test-button'].textContent, 'Republish discovery');
  assert.strictEqual(el['command-display'].textContent, 'MQTT listener ready · HTTP listening on port 49191');
  assert.ok(el['reporting-help'].textContent.includes('does not change picture settings'));
  assert.strictEqual(el['cec-button'].disabled, true, 'Older service without guard cannot enable it');
  status.cec_guard = {enabled: false, supported: true}; ui.tick();
  assert.strictEqual(el['cec-button'].disabled, false);
  ui.confirmed = true; ui.click('cec-button');
  assert.strictEqual(ui.calls[ui.calls.length - 1].payload.enabled, true);
  assert.strictEqual(el['cec-button'].textContent, 'CEC filtering: On');
  ui.click('cec-button'); assert.strictEqual(ui.calls[ui.calls.length - 1].payload.enabled, false);
  assert.ok(el['cec-display'].textContent.includes('LG default'));
  ui.confirmed = false;
  el['refresh-button'].focus();
  assert.strictEqual(ui.key(39), true);
  assert.strictEqual(ui.document.activeElement, el['restart-button']);
  assert.strictEqual(ui.key(40), true);
  assert.strictEqual(el.content.scrollTop, 240);
  assert.strictEqual(ui.document.activeElement, el['restart-button'], 'Scrolling leaves actions focused');
  assert.strictEqual(ui.key(38), true);
  assert.strictEqual(el.content.scrollTop, 0);
  assert.strictEqual(ui.key(37), true);
  assert.strictEqual(ui.document.activeElement, el['refresh-button']);
  assert.strictEqual(ui.key(13), false, 'Native OK/Enter still activates buttons');
  assert.strictEqual(ui.key(461), false, 'Native webOS Back handling is untouched');
  status.mqtt.commands_ready = false; ui.tick();
  assert.ok(el['command-display'].textContent.includes('waiting for command subscription'));
  status.mqtt.commands_ready = true; ui.tick();
  ui.click('test-button');
  assert.ok(ui.calls[ui.calls.length - 1].uri.endsWith('/refreshReporting'));
  assert.ok(el['operation-display'].textContent.includes('HA receipt not confirmed'));
  var operation = el['operation-display'].textContent;
  ui.tick();
  assert.strictEqual(el['operation-display'].textContent, operation, 'Auto-refresh preserves last action result');
  var count = ui.calls.length;
  ui.document.hidden = true; ui.tick();
  assert.strictEqual(ui.calls.length, count, 'Hidden app must not poll');
  ui.document.hidden = false;
  ui.hold = true; ui.tick(); count = ui.calls.length; ui.tick(); ui.click('test-button');
  assert.strictEqual(ui.calls.length, count, 'No overlapping polling/action calls');
  ui.calls[count - 1].respond({returnValue: true, status: status}); ui.hold = false;

  status.mqtt.state = 'disconnected'; ui.tick();
  assert.strictEqual(el['status-title'].textContent, 'Configured · broker disconnected');
  assert.ok(!el['command-display'].textContent.includes('listener ready'));
  ui.reportingResult = {returnValue: false, errorText: 'MQTT republish could not be submitted.'};
  ui.click('test-button');
  assert.ok(el['operation-display'].textContent.includes('Failed: MQTT'));
  status.mqtt_commands_enabled = false; ui.tick();
  assert.ok(el['command-display'].textContent.includes('mqtt.commands_enabled is false'));
  assert.ok(!el['command-display'].textContent.includes('token'));
  status.mqtt.state = 'connected'; status.running = false; ui.tick();
  assert.strictEqual(el['status-title'].textContent, 'Configured, but monitor is stopped');
  assert.ok(el['delivery-display'].textContent.includes('Broker: stopped'));
  assert.strictEqual(el['luna-display'].textContent, 'Not running');

  status.transport = 'both'; status.running = true; ui.tick();
  assert.strictEqual(el['test-button'].textContent, 'Republish + test webhook');
  assert.ok(el['callback-display'].textContent.includes('legacy webhook'));
  ui.reportingResult = {returnValue: true, mqtt_submitted: true, webhook_status: 200, status: status};
  ui.click('test-button');
  assert.ok(el['operation-display'].textContent.includes('MQTT republish submitted'));
  assert.ok(el['operation-display'].textContent.includes('Webhook HTTP 200'));

  status.transport = 'webhook'; status.callback_display = 'http://ha/api/webhook/••••••••'; ui.tick();
  assert.strictEqual(el['test-button'].textContent, 'Send webhook test');
  ui.reportingResult = {returnValue: true, webhook_status: 204, status: status}; ui.click('test-button');
  assert.strictEqual(el['operation-display'].textContent, 'Webhook HTTP 204 (automation not verified)');

  count = ui.calls.length; ui.click('clear-button');
  assert.strictEqual(ui.calls.length, count, 'Removal needs confirmation');
  ui.confirmed = true; ui.click('clear-button');
  assert.ok(ui.calls[ui.calls.length - 1].payload.command.endsWith('setup.sh clear'));
  assert.strictEqual(el['status-title'].textContent, 'Not configured');
  assert.strictEqual(el['test-button'].disabled, true);
  count = ui.calls.length; ui.tick();
  assert.strictEqual(ui.calls.length, count, 'Do not reactivate the service after removing its configuration');

  status.transport = 'mqtt'; status.mqtt.state = 'connecting'; status.mqtt.commands_ready = false;
  ui.launch({setup: {mqtt: {host: 'broker'}, device_id: 'test-tv'}});
  assert.strictEqual(el['operation-display'].textContent, 'Configuration saved · check connection status above');
  assert.strictEqual(el['status-title'].textContent, 'Configured · broker connecting');

  ui.hold = true; ui.tick(); var oldPoll = ui.calls[ui.calls.length - 1];
  ui.launch({setup: {mqtt: {host: 'broker'}, device_id: 'test-tv'}});
  var configure = ui.calls[ui.calls.length - 1];
  oldPoll.respond({returnValue: true, status: {configured: false}});
  assert.strictEqual(el['status-title'].textContent, 'Configuring bridge…', 'Ignore pre-configuration status responses');
  configure.respond({returnValue: true, status: status});
  assert.strictEqual(el['status-title'].textContent, 'Configured · broker connecting');

  ui = setup({paired: false, running: false});
  assert.strictEqual(ui.elements['status-title'].textContent, 'Not configured', 'Old status schema remains readable');
  ui.elements['restart-button'].focus(); ui.key(39);
  assert.strictEqual(ui.document.activeElement, ui.elements['clear-button'], 'Skip disabled republish action');
};
