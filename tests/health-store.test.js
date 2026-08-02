'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

module.exports = function () {
  var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-picture-health-'));
  process.env.LG_PICTURE_BRIDGE_STATE_DIR = temporary;
  delete require.cache[require.resolve('../app/bridge/lib/config-store')];
  delete require.cache[require.resolve('../app/bridge/lib/health-store')];
  var healthStore = require('../app/bridge/lib/health-store');
  var expected = {
    bridge_version: '0.2.0',
    subscriptions: {videooutput: {state: 'subscribed'}},
    last_dynamic_range: 'hdr10'
  };

  healthStore.save(expected);
  assert.deepStrictEqual(healthStore.load(), expected);
  assert.strictEqual(fs.statSync(healthStore.healthPath()).mode & 511, 384); // 0600
  healthStore.clear();
  assert.strictEqual(healthStore.load(), null);
  fs.rmSync(temporary, {recursive: true, force: true});
  delete process.env.LG_PICTURE_BRIDGE_STATE_DIR;
};
