'use strict';

var fs = require('fs');
var path = require('path');
var store = require('./config-store');

function healthPath() {
  return path.join(store.stateDir(), 'health.json');
}

function save(health) {
  var directory = store.stateDir();
  var target = healthPath();
  var temporary = target + '.tmp-' + process.pid;
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, 448); // 0700
  fs.writeFileSync(temporary, JSON.stringify(health, null, 2) + '\n', {mode: 384}); // 0600
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 384); } catch (error) { /* Best effort on webOS. */ }
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(healthPath(), 'utf8'));
  } catch (error) {
    return null;
  }
}

function clear() {
  try { fs.unlinkSync(healthPath()); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  clear: clear,
  healthPath: healthPath,
  load: load,
  save: save
};
