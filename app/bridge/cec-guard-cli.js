#!/usr/bin/env node
'use strict';

var guard = require('./lib/cec-guard').create();
try {
  var action = process.argv[2];
  if (action === 'status') process.stdout.write(JSON.stringify(guard.snapshot()) + '\n');
  else if (action === 'suspend') guard.suspend();
  else if (action === 'remove') guard.remove();
  else if (action === 'watchdog') guard.watchdog(process.argv[3]);
  else throw new Error('Usage: cec-guard-cli.js status | suspend | remove | watchdog ID');
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
