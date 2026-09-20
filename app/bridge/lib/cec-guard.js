'use strict';

var patch = require('./cec-patch');
var APP_ROOT = '/media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge';
var STATE_DIR = '/var/lib/io.github.andrewkennedy.lgpicturebridge';
var CONFIG = STATE_DIR + '/cec-guard.json';
var ROOT = '/tmp/lgpb-apple-tv-cec';
var STATE = ROOT + '/mount.json';
var OVERLAY = ROOT + '/Simplink.qml';
var LEASE = ROOT + '/lease.json';

function create(deps) {
  deps = deps || {};
  var fs = deps.fs || require('fs');
  var cp = deps.cp || require('child_process');
  var crypto = deps.crypto || require('crypto');
  var proc = deps.process || process;
  var now = deps.now || Date.now;
  var schedule = deps.setInterval || setInterval;
  var cancel = deps.clearInterval || clearInterval;
  var model = deps.patch || patch;
  var timer = null;
  var lastError = null;
  var reloadStatus = null;
  var forcedOff = false;

  function rootOnly() { if (proc.getuid() !== 0) throw new Error('CEC filter requires root'); }
  function directory(path, mode) {
    if (!fs.existsSync(path)) fs.mkdirSync(path, mode);
    var stat = fs.lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 18)) {
      throw new Error('Unsafe CEC filter directory: ' + path);
    }
  }
  function fileSafe(path) {
    var stat;
    try { stat = fs.lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 18) || stat.nlink > 1) {
      throw new Error('Unsafe CEC filter file: ' + path);
    }
  }
  function read(path) {
    fileSafe(path);
    return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
  }
  function write(path, value, mode) {
    fileSafe(path);
    var temporary = path + '.tmp-' + proc.pid;
    fileSafe(temporary);
    fs.writeFileSync(temporary, JSON.stringify(value), {mode: mode});
    fs.renameSync(temporary, path);
  }
  function config() {
    if (!fs.existsSync(STATE_DIR)) return {enabled: false};
    directory(STATE_DIR, 448);
    var value = read(CONFIG);
    if (!value) return {enabled: false};
    if (value.schema !== 1 || typeof value.enabled !== 'boolean') throw new Error('Invalid saved CEC filter configuration');
    return value;
  }
  function mounts() {
    return fs.readFileSync('/proc/mounts', 'utf8').split('\n').filter(function (line) {
      return line.split(' ')[1] === model.TARGET;
    });
  }
  function mountState() {
    if (!fs.existsSync(ROOT)) return null;
    directory(ROOT, 493);
    return read(STATE);
  }
  function owned(state) {
    if (!state || !/^[a-f0-9]{32}$/.test(state.id) || !fs.existsSync(OVERLAY)) return false;
    fileSafe(OVERLAY);
    var source = fs.statSync(OVERLAY), target = fs.statSync(model.TARGET);
    return source.dev === target.dev && source.ino === target.ino &&
      model.digest(fs.readFileSync(OVERLAY)) === state.patched_sha256;
  }
  function revoke() {
    if (!fs.existsSync(ROOT)) return;
    directory(ROOT, 493);
    write(LEASE, {schema: 1, enabled: false, issued_at: now(), expires_at: now()}, 420);
  }
  function restore(expectedId) {
    rootOnly();
    var state = mountState();
    if (expectedId && (!state || state.id !== expectedId)) return;
    var list = mounts();
    // Never remove somebody else's mount, or use it as the source of a new patch.
    if (list.length && (list.length !== 1 || !owned(state))) throw new Error('Unrecognized QML overlay; refusing to unmount it');
    var revokeError = null;
    try { revoke(); } catch (error) { revokeError = error; }
    if (list.length) cp.execFileSync('/bin/umount', [model.TARGET]);
    if (state) {
      state.active = false;
      write(STATE, state, 384);
    }
    if (list.length) model.checkOriginal(fs.readFileSync(model.TARGET));
    if (revokeError) throw revokeError;
  }
  function renew(id) {
    var issued = now();
    write(LEASE, {schema: 1, owner: id, enabled: true, issued_at: issued, expires_at: issued + 90000}, 420);
  }
  function reloadHdmi() {
    // Fixed target only. Do not launch/select an input, change power, or send CEC settings.
    try {
      var output = cp.execFileSync('/usr/bin/luna-send', ['-n', '1', '-w', '5000',
        'luna://com.webos.applicationManager/closeByAppId', '{"id":"com.webos.app.hdmi3"}'],
        {encoding: 'utf8', timeout: 6500});
      var result = JSON.parse(output);
      reloadStatus = result.returnValue ? 'requested' : 'next_launch';
    } catch (error) { reloadStatus = 'next_launch'; }
  }
  function ensure() {
    rootOnly();
    if (!fs.existsSync(APP_ROOT + '/appinfo.json') || !fs.existsSync(STATE_DIR + '/config.json')) {
      throw new Error('Configure the installed bridge before enabling the CEC filter');
    }
    directory(ROOT, 493); // QML can read the non-secret lease; only root may write it.
    var state = mountState(), list = mounts();
    fileSafe(LEASE);
    if (list.length) {
      if (list.length !== 1 || !owned(state)) throw new Error('Another QML overlay is installed; CEC filter not applied');
      if (state.revision === model.REVISION && state.active) {
        renew(state.id);
        return;
      }
      restore();
    }
    var original = fs.readFileSync(model.TARGET);
    model.checkOriginal(original);
    var generated = model.build(original);
    fileSafe(OVERLAY);
    fs.writeFileSync(OVERLAY, generated, {mode: 420});
    state = {id: crypto.randomBytes(16).toString('hex'), revision: model.REVISION,
      patched_sha256: model.digest(generated), active: true};
    write(STATE, state, 384);
    try {
      cp.execFileSync('/bin/mount', ['--bind', OVERLAY, model.TARGET]);
      if (!owned(state)) throw new Error('CEC overlay verification failed');
      var child = cp.spawn(proc.execPath, [APP_ROOT + '/bridge/cec-guard-cli.js', 'watchdog', state.id],
        {detached: true, stdio: 'ignore'});
      child.on('error', function (error) {
        lastError = error.message;
        try { restore(state.id); } catch (rollbackError) { lastError += '; ' + rollbackError.message; }
      });
      if (!child.pid) throw new Error('CEC rollback watchdog failed to start');
      child.unref();
      renew(state.id);
      reloadHdmi();
    } catch (error) {
      if (owned(state)) restore(state.id);
      throw error;
    }
  }
  function snapshot() {
    var result = {enabled: false, supported: false, mounted: false, lease_active: false,
      reload_status: reloadStatus, last_error: lastError};
    try {
      result.enabled = config().enabled;
      var list = mounts(), state = mountState();
      result.mounted = list.length === 1 && owned(state);
      result.supported = result.mounted || (!list.length &&
        model.digest(fs.readFileSync(model.TARGET)) === model.ORIGINAL_SHA256);
      var lease = fs.existsSync(ROOT) ? read(LEASE) : null;
      result.lease_active = result.mounted && model.validLease(lease, now());
    } catch (error) { result.last_error = error.message; }
    return result;
  }
  function tick() {
    try {
      if (config().enabled && !forcedOff) ensure();
      else if (fs.existsSync(ROOT)) restore();
      lastError = null;
    } catch (error) {
      lastError = error.message;
      try { restore(); } catch (rollbackError) { lastError += '; ' + rollbackError.message; }
    }
  }
  function start() {
    tick();
    if (!timer) timer = schedule(tick, 30000);
    if (timer && timer.unref) timer.unref();
  }
  function setEnabled(enabled) {
    rootOnly();
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    directory(STATE_DIR, 448);
    config(); // Validate existing opt-in metadata before any mount or HDMI restart.
    if (enabled) {
      try {
        ensure();
        write(CONFIG, {schema: 1, enabled: true}, 384);
        forcedOff = false;
        lastError = null;
      } catch (error) {
        try { restore(); } catch (rollbackError) { error.message += '; ' + rollbackError.message; }
        lastError = error.message;
        throw error;
      }
    } else {
      forcedOff = true;
      restore();
      write(CONFIG, {schema: 1, enabled: false}, 384);
      lastError = null;
    }
    start();
    return snapshot();
  }
  function remove() {
    setEnabled(false);
    if (timer) { cancel(timer); timer = null; }
    fileSafe(CONFIG);
    if (fs.existsSync(CONFIG)) fs.unlinkSync(CONFIG);
    if (fs.existsSync(ROOT)) {
      directory(ROOT, 493);
      [LEASE, STATE, OVERLAY].forEach(function (path) {
        fileSafe(path);
        if (fs.existsSync(path)) fs.unlinkSync(path);
      });
      fs.rmdirSync(ROOT);
    }
  }
  function watchdog(id) {
    rootOnly();
    var watchdogTimer = schedule(function () {
      try {
        var state = mountState();
        if (!state || state.id !== id || !state.active) { cancel(watchdogTimer); return; }
        var lease = read(LEASE);
        if (!model.validLease(lease, now()) || !fs.existsSync(APP_ROOT + '/appinfo.json') ||
            !fs.existsSync(STATE_DIR + '/config.json')) {
          restore(id);
          cancel(watchdogTimer);
        }
      } catch (error) {
        // QML also independently checks the lease, so stale policy cannot block forever.
        try { restore(id); } catch (rollbackError) { error.message += '; ' + rollbackError.message; }
        proc.stderr.write('CEC watchdog: ' + error.message + '\n');
        cancel(watchdogTimer);
      }
    }, 15000);
  }
  return {start: start, tick: tick, snapshot: snapshot, setEnabled: setEnabled,
    suspend: restore, remove: remove, watchdog: watchdog};
}

module.exports = {create: create, APP_ROOT: APP_ROOT, STATE_DIR: STATE_DIR, CONFIG: CONFIG,
  ROOT: ROOT, STATE: STATE, OVERLAY: OVERLAY, LEASE: LEASE};
