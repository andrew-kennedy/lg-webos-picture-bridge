#!/usr/bin/env node
'use strict';

var store = require('./lib/config-store');

function decodeBase64(value) {
  return Buffer.from ? Buffer.from(value, 'base64').toString('utf8') : new Buffer(value, 'base64').toString('utf8');
}
function main() {
  var command = process.argv[2];
  var config;
  if (command === 'pair-stdin') {
    // Node 0.12's readFileSync does not accept numeric file descriptors.
    var input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      input += chunk;
      if (input.length > 65536) reportError(new Error('Pairing input is too large'));
    });
    process.stdin.on('error', reportError);
    process.stdin.on('end', function () {
      try {
        config = store.save(JSON.parse(input));
        process.stdout.write(JSON.stringify({paired: true, transport: config.transport}) + '\n');
      } catch (error) { reportError(error); }
    });
    return;
  }
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
  throw new Error('Usage: configure.js pair BASE64_JSON | pair-stdin | clear');
}

function reportError(error) {
  process.stderr.write('Configuration error: ' + error.message + '\n');
  process.exit(1);
}

try { main(); } catch (error) { reportError(error); }
