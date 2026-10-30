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
  assert.deepStrictEqual(appPermissions[app.id + '-*'], [app.id + '.control', 'private', 'public']);
  var api = require('../app/security/io.github.andrewkennedy.lgpicturebridge.api.json');
  assert(api[app.id + '.control'].includes(app.id + '.service/uiStatus'));
  assert(api[app.id + '.control'].every(function (uri) {
    return uri.indexOf(app.id + '.service/') === 0 || uri === 'org.webosbrew.hbchannel.service/exec';
  }));
  assert.strictEqual(manifest.apiPermissionFiles.length, 1);
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
    'com.webos.settingsservice',
    'com.webos.service.config',
    'com.webos.applicationManager',
    'com.webos.service.extinputs.hdmi',
    'com.webos.service.eim',
    'com.webos.service.tvpower'
  ]);
  assert.deepStrictEqual(role.permissions[0].inbound, ['*']);
};
