'use strict';

var fs = require('fs');
var path = require('path');
var runtime = require('./runtime-store');

function healthPath() {
  return path.join(runtime.runtimeDir(), 'health.json');
}

function save(health) {
  runtime.ensureDirectory();
  runtime.trimLog();
  var target = healthPath();
  var temporary = target + '.tmp-' + process.pid;
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

// Keep live health in memory; persist the newest snapshot once per burst. A
// fixed deadline (not a resettable debounce) also bounds latency during noise.
function createWriter(write, snapshot, dependencies) {
  var deps = dependencies || {};
  var later = deps.setTimeout || setTimeout, cancel = deps.clearTimeout || clearTimeout;
  var pending = null, dirty = false, stopped = false;
  function flush() {
    if (pending !== null) cancel(pending);
    pending = null;
    if (!dirty) return;
    dirty = false;
    try { write(snapshot()); } catch (error) { if (deps.onError) deps.onError(error); }
  }
  return {
    request: function () {
      if (stopped) return;
      dirty = true;
      if (pending === null) pending = later(flush, 1000);
    },
    flush: flush,
    stop: function () { stopped = true; flush(); }
  };
}

module.exports = {
  clear: clear,
  createWriter: createWriter,
  healthPath: healthPath,
  load: load,
  save: save
};
