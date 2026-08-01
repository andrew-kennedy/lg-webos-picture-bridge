#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var store = require('./lib/config-store');

var APP_ID = 'io.github.andrewkennedy.lgpicturebridge';
var RUNNER_PATH = '/media/developer/apps/usr/palm/applications/' + APP_ID + '/scripts/runner.sh';

function processIsRunning(pidFile) {
  var pid;
  if (!fs.existsSync(pidFile)) return false;
  pid = String(fs.readFileSync(pidFile, 'utf8')).trim();
  if (!/^\d+$/.test(pid)) return false;
  try {
    process.kill(Number(pid), 0);
    return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').indexOf(RUNNER_PATH) !== -1;
  } catch (error) {
    return false;
  }
}

var pidFile = path.join(store.stateDir(), 'bridge.pid');
var paired = store.exists();
var config = paired ? store.load() : null;
process.stdout.write(JSON.stringify({
  paired: paired,
  running: processIsRunning(pidFile),
  callback_display: config ? store.redactCallback(config.callback_url) : null,
  device_id: config ? config.device_id : null,
  device_name: config ? config.device_name : null
}) + '\n');
