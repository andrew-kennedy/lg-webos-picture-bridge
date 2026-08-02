'use strict';

var assert = require('assert');
var app = require('../app/appinfo.json');
var servicePackage = require(
  '../services/io.github.andrewkennedy.lgpicturebridge.service/package.json'
);
var services = require(
  '../services/io.github.andrewkennedy.lgpicturebridge.service/services.json'
);
var manifest = require(
  '../app/security/io.github.andrewkennedy.lgpicturebridge.manifest.json'
);
var role = require(
  '../app/security/io.github.andrewkennedy.lgpicturebridge.service.role.json'
);

module.exports = function () {
  assert.strictEqual(servicePackage.version, app.version);
  assert.strictEqual(servicePackage.name, app.id + '.service');
  assert.strictEqual(services.id, app.id + '.service');
  assert.strictEqual(services.services[0].name, app.id + '.service');
  assert.strictEqual(manifest.id, app.id);
  assert.strictEqual(manifest.version, app.version);
  assert.deepStrictEqual(role.permissions[0].outbound, [
    'com.webos.service.videooutput',
    'com.webos.settingsservice'
  ]);
};
