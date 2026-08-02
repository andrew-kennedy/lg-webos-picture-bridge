#!/usr/bin/env node
'use strict';

var APP_ID = 'io.github.andrewkennedy.lgpicturebridge';
var SERVICE_ID = APP_ID + '.service';
var APP_ROOT = '/media/developer/apps/usr/palm/applications/' + APP_ID;
var Service = require('webos-service');
var bridge = require(APP_ROOT + '/bridge/bridge');

try {
  bridge.start(new Service(SERVICE_ID));
} catch (error) {
  process.stderr.write(new Date().toISOString() + ' Service startup failed: ' +
    (error.stack || error.message) + '\n');
  process.exit(1);
}
