'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

module.exports = function () {
  var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-picture-pairing-test-'));
  var environment = Object.assign({}, process.env, {LG_PICTURE_BRIDGE_STATE_DIR: temporary});
  var config = {transport: 'mqtt', device_id: 'stdin-test', mqtt: {
    host: 'localhost', username: 'test-user', password: 'test-password'
  }};
  try {
    var output = childProcess.execFileSync(process.execPath,
      [path.join(__dirname, '../app/bridge/configure.js'), 'pair-stdin'],
      {input: JSON.stringify(config), env: environment, encoding: 'utf8'});
    assert.deepStrictEqual(JSON.parse(output), {paired: true, transport: 'mqtt'});
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(temporary, 'config.json'), 'utf8')).mqtt.password,
      config.mqtt.password);
    assert.strictEqual(fs.statSync(path.join(temporary, 'config.json')).mode & 511, 384);
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
};
