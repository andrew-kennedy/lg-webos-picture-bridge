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
  'app/scripts/runner.sh',
  'app/scripts/setup.sh',
  'app/scripts/startup.sh',
  'site/index.html',
  'site/full_description.html'
];

if (app.version !== pkg.version) throw new Error('package.json and appinfo.json versions differ');
if (app.appDescription.length > 60) throw new Error('appDescription exceeds webOS TV\'s 60-character limit');
required.forEach(function (relative) {
  if (!fs.existsSync(path.join(project.ROOT, relative))) throw new Error('Missing required file: ' + relative);
});
process.stdout.write('Project metadata and required files are valid.\n');
