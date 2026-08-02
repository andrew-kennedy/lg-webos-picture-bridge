#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var project = require('./project');

var app = project.appInfo();
var pkg = project.packageInfo();
var required = [
  'app/index.html',
  'app/app.js',
  'app/assets/icon80.png',
  'app/assets/icon130.png',
  'app/assets/icon160.png',
  'app/bridge/bridge.js',
  'app/bridge/lib/health-store.js',
  'app/bridge/lib/command-server.js',
  'app/bridge/lib/luna-executor.js',
  'app/bridge/lib/picture-policy.js',
  'app/bridge/lib/ui-status.js',
  'app/scripts/runner.sh',
  'app/scripts/install-security.sh',
  'app/scripts/setup.sh',
  'app/scripts/startup.sh',
  'app/security/io.github.andrewkennedy.lgpicturebridge.manifest.json',
  'app/security/io.github.andrewkennedy.lgpicturebridge.service.perm.json',
  'app/security/io.github.andrewkennedy.lgpicturebridge.service.role.json',
  'app/security/io.github.andrewkennedy.lgpicturebridge.service.service',
  'site/index.html',
  'site/full_description.html',
  'services/io.github.andrewkennedy.lgpicturebridge.service/package.json',
  'services/io.github.andrewkennedy.lgpicturebridge.service/services.json',
  'services/io.github.andrewkennedy.lgpicturebridge.service/service.js'
];

if (app.version !== pkg.version) throw new Error('package.json and appinfo.json versions differ');
var servicePackage = project.readJson(path.join(
  project.ROOT,
  'services/io.github.andrewkennedy.lgpicturebridge.service/package.json'
));
if (app.version !== servicePackage.version) {
  throw new Error('package.json, appinfo.json, and service package versions differ');
}
if (app.appDescription.length > 60) throw new Error('appDescription exceeds webOS TV\'s 60-character limit');
required.forEach(function (relative) {
  if (!fs.existsSync(path.join(project.ROOT, relative))) throw new Error('Missing required file: ' + relative);
});
process.stdout.write('Project metadata and required files are valid.\n');
