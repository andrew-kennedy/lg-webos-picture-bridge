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
var appPermissions = require(
  '../app/security/io.github.andrewkennedy.lgpicturebridge.app.perm.json'
);
var appRole = require(
  '../app/security/io.github.andrewkennedy.lgpicturebridge.app.role.json'
);

module.exports = function () {
  assert.strictEqual(servicePackage.version, app.version);
  assert.strictEqual(servicePackage.name, app.id + '.service');
  assert.strictEqual(services.id, app.id + '.service');
  assert.strictEqual(services.services[0].name, app.id + '.service');
  assert.strictEqual(manifest.id, app.id);
  assert.strictEqual(manifest.version, app.version);
  assert.deepStrictEqual(appPermissions[app.id + '-*'], ['private', 'public']);
  assert.strictEqual(appRole.appId, app.id);
  assert.deepStrictEqual(appRole.allowedNames, [app.id + '-*']);
  assert.deepStrictEqual(appRole.permissions[0].outbound, [
    app.id + '.service',
    'org.webosbrew.hbchannel.service'
  ]);
  assert.ok(manifest.roleFiles.some(function (roleFile) {
    return roleFile.indexOf(app.id + '.app.role.json') !== -1;
  }));
  assert.ok(manifest.clientPermissionFiles.some(function (permissionFile) {
    return permissionFile.indexOf(app.id + '.app.perm.json') !== -1;
  }));
  assert.deepStrictEqual(role.permissions[0].outbound, [
    'com.webos.service.videooutput',
    'com.webos.settingsservice'
  ]);
  assert.deepStrictEqual(role.permissions[0].inbound, ['*']);
};
