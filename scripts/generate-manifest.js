#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var project = require('./project');

var app = project.appInfo();
var ipk = project.findIpk();
var tag = process.env.RELEASE_TAG || 'v' + app.version;
var repository = 'https://github.com/andrew-kennedy/lg-webos-picture-bridge';
var releaseBase = repository + '/releases/download/' + tag;
var output = path.join(project.ROOT, 'dist', app.id + '.manifest.json');
var manifest = {
  id: app.id,
  version: app.version,
  type: app.type,
  title: app.title,
  appDescription: app.appDescription,
  iconUri: 'https://raw.githubusercontent.com/andrew-kennedy/lg-webos-picture-bridge/main/app/assets/icon160.png',
  sourceUrl: repository,
  rootRequired: true,
  ipkUrl: releaseBase + '/' + path.basename(ipk),
  ipkHash: {sha256: project.sha256(ipk)},
  ipkSize: fs.statSync(ipk).size
};

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(output + '\n');
