'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

module.exports = function () {
  var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-picture-health-'));
  process.env.LG_PICTURE_BRIDGE_RUNTIME_DIR = temporary;
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
  delete process.env.LG_PICTURE_BRIDGE_RUNTIME_DIR;
  var clock = require('./fake-clock')(), writes = [], current = {value:1};
  var writer = healthStore.createWriter(function (value) { writes.push(Object.assign({},value)); },
    function () { return current; }, clock);
  writer.request(); clock.tick(900); current.value = 2;
  for (var i = 0; i < 100; i++) writer.request();
  assert.strictEqual(writes.length,0);
  clock.tick(100);
  assert.deepStrictEqual(writes,[{value:2}], 'A callback burst writes only the latest health at a bounded deadline');
  writer.request(); writer.flush();
  assert.strictEqual(writes.length,2,'Fatal/startup health can be flushed immediately');
  clock.tick(1000); assert.strictEqual(writes.length,2);
  current.value=3; writer.request(); writer.stop();
  assert.strictEqual(writes[2].value,3,'Shutdown flushes pending diagnostics');
  writer.request(); clock.tick(1000); assert.strictEqual(writes.length,3);
};
