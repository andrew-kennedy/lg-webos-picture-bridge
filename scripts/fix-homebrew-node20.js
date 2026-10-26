#!/usr/bin/env node
'use strict';

// One-time, reversible repair for throwaway96 Homebrew Channel v0.8.0-rc1.
// Run over root SSH on the TV, not through the Homebrew service being repaired.
var fs = require('fs');
var crypto = require('crypto');
var servicePath = '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/service.js';
var backupPath = '/home/root/hbchannel-0.8.0-rc1-before-node20-fix.js';
var originalHash = 'd25c08900c0f7d4a136fb84664378204b7ee1dd9a833de0f8a67fbc56a52b3ab';
var prefix = '// G6 Node 20: keep LS2 work alive until Homebrew\'s existing idle timer quits.\n' +
  'setInterval(function () {}, 60000);\n';
var oldQuit = 'null===(e=this._service)||void 0===e||e.unregister()';
var newQuit = 'null===(e=this._service)||void 0===e||"function"!=typeof e.unregister||e.unregister()';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function transform(original) {
  if (hash(original) !== originalHash) throw new Error('Unknown Homebrew service version; refusing to modify it.');
  var source = original.toString('utf8');
  if (source.split(oldQuit).length !== 2) throw new Error('Expected idle-cleanup code was not found exactly once.');
  return Buffer.from(prefix + source.replace(oldQuit, newQuit));
}

function replaceFile(contents) {
  var temporaryPath = servicePath + '.node20-fix-' + process.pid;
  var mode = fs.statSync(servicePath).mode & 511;
  var created = false;
  try {
    fs.writeFileSync(temporaryPath, contents, { flag: 'wx', mode: mode });
    created = true;
    fs.chmodSync(temporaryPath, mode);
    fs.renameSync(temporaryPath, servicePath);
  } finally {
    if (created && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

try {
  var action = process.argv[2] || 'check';
  if (['check', 'apply', 'restore'].indexOf(action) === -1) throw new Error('Usage: node fix-homebrew-node20.js {check|apply|restore}');
  if (action !== 'check' && process.getuid() !== 0) throw new Error('Run this repair through the TV root SSH shell.');
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('This repair is intended for Node 20 or newer.');

  var current = fs.readFileSync(servicePath);
  var original = hash(current) === originalHash ? current : fs.readFileSync(backupPath);
  var patched = transform(original);
  if (!current.equals(original) && !current.equals(patched)) throw new Error('Homebrew changed since the backup; refusing to overwrite it.');

  if (action === 'check') {
    console.log(current.equals(patched) ? 'Node 20 installer fix is applied.' : 'Known Homebrew 0.8.0-rc1: Node 20 installer fix is available.');
  } else if (action === 'apply') {
    if (fs.existsSync(backupPath)) {
      if (!fs.readFileSync(backupPath).equals(original)) throw new Error('Existing backup differs; refusing to replace it.');
    } else {
      fs.writeFileSync(backupPath, original, { flag: 'wx', mode: 384 });
    }
    if (!current.equals(patched)) replaceFile(patched);
    console.log('Node 20 installer fix applied. Original: ' + backupPath);
  } else {
    if (!current.equals(original)) replaceFile(original);
    console.log('Original Homebrew 0.8.0-rc1 service restored.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
