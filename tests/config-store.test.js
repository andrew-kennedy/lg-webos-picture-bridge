'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

module.exports = function () {
  var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-picture-bridge-'));
  process.env.LG_PICTURE_BRIDGE_STATE_DIR = temporary;
  delete require.cache[require.resolve('../app/bridge/lib/config-store')];
  var store = require('../app/bridge/lib/config-store');

  var saved = store.save({
    callback_url: 'http://homeassistant.local:8123/api/webhook/a-secret-value',
    device_id: 'living-room-c9',
    device_name: 'Living Room C9',
    debounce_ms: 900,
    command_token: '0123456789abcdef0123456789abcdef',
    command_port: 49191
  });
  assert.strictEqual(saved.debounce_ms, 900);
  assert.strictEqual(saved.command_port, 49191);
  assert.deepStrictEqual(store.load(), saved);
  assert.strictEqual(
    store.redactCallback(saved.callback_url),
    'http://homeassistant.local:8123/api/webhook/••••••••'
  );
  assert.throws(function () { store.validate({callback_url: 'file:///tmp/nope'}); });
  assert.throws(function () { store.validate({callback_url: 'http://user:password@example.test/hook'}); });
  assert.throws(function () { store.validate({callback_url: 'http://example.test/hook\nnext'}); });
  assert.throws(function () { store.validate({callback_url: 'http://example.test/hook value'}); });
  assert.throws(function () {
    store.validate({callback_url: 'http://example.test/hook', command_token: 'too-short'});
  });
  assert.throws(function () {
    store.validate({
      callback_url: 'http://example.test/hook',
      command_token: '0123456789abcdef 0123456789abcdef'
    });
  });
  store.clear();
  assert.strictEqual(store.exists(), false);
  fs.rmSync(temporary, {recursive: true, force: true});
  delete process.env.LG_PICTURE_BRIDGE_STATE_DIR;
};
