'use strict';

var assert = require('assert');
var status = require('../app/bridge/lib/ui-status');

module.exports = function () {
  var now = Date.parse('2026-08-02T08:00:30.000Z');
  var config = {
    callback_url: 'http://homeassistant.local:8123/api/webhook/private-value',
    device_id: 'living-room-lg-c9',
    device_name: 'Living Room LG C9',
    command_token: '0123456789abcdef0123456789abcdef',
    command_port: 49191
  };
  var health = {
    bridge_version: '0.3.1',
    heartbeat_at: '2026-08-02T08:00:00.000Z',
    subscriptions: {
      picture: {state: 'subscribed'},
      videooutput: {state: 'unavailable'}
    },
    current_picture_context: {input: 'hdmi3', dynamic_range: 'dolby_vision'},
    last_dynamic_range: 'dolby_vision',
    last_source: 'picture',
    last_delivery_at: '2026-08-02T08:00:01.000Z',
    last_delivery_status: 'http_200',
    command_api: {state: 'listening', port: 49191},
    last_error: null
  };
  var paired = status.build(config, health, true, now);
  var unpaired = status.build(null, null, false, now);

  assert.strictEqual(paired.paired, true);
  assert.strictEqual(paired.monitor_healthy, true);
  assert.strictEqual(paired.monitor_state, 'monitoring');
  assert.strictEqual(paired.callback_display,
    'http://homeassistant.local:8123/api/webhook/••••••••');
  assert.strictEqual(paired.command_api_enabled, true);
  assert.deepStrictEqual(paired.current_picture_context,
    {input: 'hdmi3', dynamic_range: 'dolby_vision'});
  assert.strictEqual(unpaired.paired, false);
  assert.strictEqual(unpaired.monitor_state, 'not_configured');
};
