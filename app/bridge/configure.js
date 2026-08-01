#!/usr/bin/env node
'use strict';

var store = require('./lib/config-store');

function decodeBase64(value) {
  return Buffer.from ? Buffer.from(value, 'base64').toString('utf8') : new Buffer(value, 'base64').toString('utf8');
}
function main() {
  var command = process.argv[2];
  var config;
  if (command === 'pair') {
    if (!process.argv[3] || !/^[A-Za-z0-9+/=]+$/.test(process.argv[3])) {
      throw new Error('Missing or invalid base64 pairing payload');
    }
    config = store.save(JSON.parse(decodeBase64(process.argv[3])));
    process.stdout.write(JSON.stringify({
      paired: true,
      callback_display: store.redactCallback(config.callback_url)
    }) + '\n');
    return;
  }
  if (command === 'clear') {
    store.clear();
    process.stdout.write(JSON.stringify({paired: false}) + '\n');
    return;
  }
  throw new Error('Usage: configure.js pair BASE64_JSON | clear');
}

try {
  main();
} catch (error) {
  process.stderr.write('Configuration error: ' + error.message + '\n');
  process.exit(1);
}
