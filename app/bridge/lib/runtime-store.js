'use strict';

var fs = require('fs');
var path = require('path');

// /tmp is tmpfs on the supported G6. Credentials and user preferences belong
// in config-store's persistent directory; disposable diagnostics do not.
function runtimeDir() {
  return process.env.LG_PICTURE_BRIDGE_RUNTIME_DIR || '/tmp/io.github.andrewkennedy.lgpicturebridge';
}
function ensureDirectory() {
  var directory = runtimeDir();
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, 448);
  var info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) {
    throw new Error('Runtime directory must be an owned directory');
  }
  if ((info.mode & 511) !== 448) fs.chmodSync(directory, 448);
  return directory;
}
function trimLog() {
  var file = path.join(ensureDirectory(), 'bridge.log');
  if (!fs.existsSync(file)) return;
  var info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid runtime log');
  if (info.size <= 65536) return;
  var descriptor = fs.openSync(file, 'r+');
  try {
    var tail = Buffer.alloc(32768);
    var count = fs.readSync(descriptor, tail, 0, tail.length, Math.max(0, info.size - tail.length));
    // Preserve the inode: the supervisor and service hold O_APPEND descriptors.
    fs.ftruncateSync(descriptor, 0);
    fs.writeSync(descriptor, tail, 0, count, 0);
  } finally { fs.closeSync(descriptor); }
}
module.exports = {runtimeDir: runtimeDir, ensureDirectory: ensureDirectory, trimLog: trimLog};
