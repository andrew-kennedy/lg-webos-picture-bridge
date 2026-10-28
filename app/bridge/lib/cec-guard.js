'use strict';

var patch = require('./cec-patch');
var policies = require('./cec-policy');
var APP_ROOT = '/media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge';
var STATE_DIR = '/var/lib/io.github.andrewkennedy.lgpicturebridge';
var CONFIG = STATE_DIR + '/cec-guard.json';
// Keep the 0.6 runtime path so cached QML and an owned old overlay can be revoked
// during upgrade. There are no built-in device identities or default block rules.
var ROOT = '/tmp/lgpb-apple-tv-cec';
var STATE = ROOT + '/mount.json';
var OVERLAY = ROOT + '/Simplink.qml';
var LEASE = ROOT + '/lease.json';
var WATCHDOG_REVISION = 1;
var WATCHDOG_INTERVAL = 15000;
// A late watchdog tick can be the first callback after Quick Start standby.
// Let the 30-second renewal loop run, but never extend the QML permission lease.
var RESUME_GRACE = 45000;

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
    if (!fs.existsSync(STATE_DIR)) return {schema: 2, policy: policies.empty()};
    directory(STATE_DIR, 448);
    var value = read(CONFIG);
    if (!value) return {schema: 2, policy: policies.empty()};
    if (value.schema === 1 && typeof value.enabled === 'boolean') {
      return {schema: 2, policy: policies.empty(), migration_required: value.enabled};
    }
    if (value.schema !== 2) throw new Error('Invalid saved CEC filter configuration');
    return {schema: 2, policy: policies.normalize(value.policy)};
  }
  function mounts() {
    return fs.readFileSync('/proc/mounts', 'utf8').split('\n').filter(function (line) {
      return line.split(' ')[1] === model.TARGET;
    });
  }
  function supportsOriginal(source) {
    try { model.checkOriginal(source); return true; } catch (error) { return false; }
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
    write(LEASE, {schema: 2, enabled: false, issued_at: now(), expires_at: now()}, 420);
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
  function renew(id, policy) {
    var issued = now();
    write(LEASE, {schema: 2, owner: id, enabled: true, issued_at: issued, expires_at: issued + 90000, policy: policy}, 420);
  }
  function startWatchdog(state) {
    var child = cp.spawn(proc.execPath, [APP_ROOT + '/bridge/cec-guard-cli.js', 'watchdog', state.id],
      {detached: true, stdio: 'ignore'});
    child.on('error', function (error) {
      lastError = error.message;
      try { restore(state.id); } catch (rollbackError) { lastError += '; ' + rollbackError.message; }
    });
    if (!child.pid) throw new Error('CEC rollback watchdog failed to start');
    child.unref();
  }
  function reloadHdmi() {
    // Reload cached copies once when INSTALLING the generic shared overlay, not
    // when changing rules. Targets are a fixed allowlist, never an MQTT URI/app ID.
    function call(method, params) {
      var output = cp.execFileSync('/usr/bin/luna-send', ['-n', '1', '-w', '3000',
        'luna://' + method, JSON.stringify(params)], {encoding: 'utf8', timeout: 4500});
      var result = JSON.parse(output);
      if (result.returnValue !== true) throw new Error(result.errorText || 'TV request failed');
      return result;
    }
    function foreground() {
      var result = call('com.webos.applicationManager/getForegroundApps', {});
      if (!Array.isArray(result.foregroundApps) || result.foregroundApps.some(function (app) {
        return !app || typeof app.appId !== 'string';
      })) throw new Error('Unknown foreground apps');
      return result.foregroundApps.map(function (app) { return app.appId; });
    }
    function screenActive() {
      return call('com.webos.service.tvpower/power/getPowerState', {}).state === 'Active';
    }
    reloadStatus = {};
    policies.capabilities().inputs.forEach(function (input) {
      var appId = 'com.webos.app.' + input;
      reloadStatus[input] = 'next_launch';
      try {
        var before = foreground();
        if (!before.length) return;
        var visible = before.indexOf(appId) !== -1;
        // Leave PiP/multiview layouts and a sleeping or screen-off TV alone.
        // Failed foreground/power reads also defer instead of closing blindly.
        if (visible && (before.length !== 1 || !screenActive())) return;
        call('com.webos.applicationManager/closeByAppId', {id: appId});
        reloadStatus[input] = 'requested';
        if (!visible) return;
        // A close normally falls back to Home. Reopen only our just-closed
        // full-screen input, once; never override another app/input or wake TV.
        // No CEC device/deep-link parameters are replayed. The mounted overlay
        // and fresh permission lease are already in place before this launch.
        reloadStatus[input] = 'reopen_skipped';
        if (!screenActive()) return;
        var after = foreground();
        if (after.some(function (id) { return id !== appId && id !== 'com.webos.app.home'; })) return;
        reloadStatus[input] = 'reopen_failed';
        call('com.webos.applicationManager/launch', {id: appId});
        reloadStatus[input] = 'reopened';
      } catch (error) { /* Retain which phase failed; the filter itself remains active. */ }
    });
  }
  function ensure(policy) {
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
        if (state.watchdog_revision !== WATCHDOG_REVISION) {
          // Retire a pre-fix detached watchdog by generation. Its next tick sees
          // a different owner and exits; QML and the owned mount stay unchanged.
          state.id = crypto.randomBytes(16).toString('hex');
          state.watchdog_revision = WATCHDOG_REVISION;
          write(STATE, state, 384);
          startWatchdog(state);
        }
        renew(state.id, policy);
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
      patched_sha256: model.digest(generated), active: true, watchdog_revision: WATCHDOG_REVISION};
    write(STATE, state, 384);
    try {
      cp.execFileSync('/bin/mount', ['--bind', OVERLAY, model.TARGET]);
      if (!owned(state)) throw new Error('CEC overlay verification failed');
      startWatchdog(state);
      renew(state.id, policy);
      reloadHdmi();
    } catch (error) {
      if (owned(state)) restore(state.id);
      throw error;
    }
  }
  function snapshot() {
    var result = {enabled: false, supported: false, mounted: false, lease_active: false,
      policy: policies.empty(), policy_hash: null, migration_required: false,
      capabilities: policies.capabilities(), reload_status: reloadStatus, last_error: lastError};
    try {
      var saved = config();
      result.policy = saved.policy;
      result.enabled = saved.policy.enabled;
      result.migration_required = Boolean(saved.migration_required);
      result.policy_hash = model.digest(JSON.stringify(saved.policy));
      var list = mounts(), state = mountState();
      result.mounted = list.length === 1 && owned(state);
      result.supported = result.mounted || (!list.length &&
        supportsOriginal(fs.readFileSync(model.TARGET)));
      var lease = fs.existsSync(ROOT) ? read(LEASE) : null;
      result.lease_active = result.mounted && model.validLease(lease, now());
    } catch (error) { result.last_error = error.message; }
    if (!result.supported) result.capabilities.supported_actions = [];
    result.filter_state = result.last_error ? 'error' : result.migration_required ? 'needs_policy' :
      !result.enabled ? 'off' : !result.policy.rules.length ? 'no_rules' : result.lease_active ? 'active' : 'inactive';
    return result;
  }
  function tick() {
    try {
      var policy = config().policy;
      if (policy.enabled && policy.rules.length && !forcedOff) ensure(policy);
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
  function setPolicy(value) {
    rootOnly();
    var policy = policies.normalize(value);
    directory(STATE_DIR, 448);
    config(); // Validate existing opt-in metadata before any mount or HDMI restart.
    if (policy.enabled && policy.rules.length) {
      try {
        ensure(policy);
        write(CONFIG, {schema: 2, policy: policy}, 384);
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
      write(CONFIG, {schema: 2, policy: policy}, 384);
      lastError = null;
    }
    start();
    return snapshot();
  }
  function setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    var next = config().policy;
    next.enabled = enabled;
    return setPolicy(next);
  }
  function applyCommand(value) {
    var command = policies.normalizeCommand(value);
    return command.version === 1 ? setPolicy(command) : setEnabled(command.enabled);
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
    var lastCheck = now(), resumeGraceUntil = null;
    var watchdogTimer = schedule(function () {
      try {
        var checkedAt = now(), previousCheck = lastCheck;
        lastCheck = checkedAt;
        var state = mountState();
        if (!state || state.id !== id || !state.active) { cancel(watchdogTimer); return; }
        var lease = read(LEASE);
        if (!fs.existsSync(APP_ROOT + '/appinfo.json') || !fs.existsSync(STATE_DIR + '/config.json')) {
          restore(id);
          cancel(watchdogTimer);
          return;
        }
        if (model.validLease(lease, checkedAt)) {
          resumeGraceUntil = null;
          return;
        }
        // Grace applies only to genuine time expiry after missed watchdog ticks,
        // not revoked/malformed leases, backwards clocks, or a missing install.
        // A renewal since the previous watchdog tick may have a newer issued_at.
        var expired = lease && model.validLease(lease, lease.issued_at) && checkedAt >= lease.expires_at;
        if (resumeGraceUntil === null && expired && lease.expires_at > previousCheck &&
            checkedAt - previousCheck > WATCHDOG_INTERVAL * 2) {
          resumeGraceUntil = checkedAt + RESUME_GRACE;
        }
        if (expired && resumeGraceUntil !== null && checkedAt >= previousCheck && checkedAt < resumeGraceUntil) return;
        restore(id);
        cancel(watchdogTimer);
      } catch (error) {
        // QML also independently checks the lease, so stale policy cannot block forever.
        try { restore(id); } catch (rollbackError) { error.message += '; ' + rollbackError.message; }
        proc.stderr.write('CEC watchdog: ' + error.message + '\n');
        cancel(watchdogTimer);
      }
    }, WATCHDOG_INTERVAL);
  }
  return {start: start, tick: tick, snapshot: snapshot, setEnabled: setEnabled, setPolicy: setPolicy, applyCommand: applyCommand,
    suspend: restore, remove: remove, watchdog: watchdog};
}

module.exports = {create: create, APP_ROOT: APP_ROOT, STATE_DIR: STATE_DIR, CONFIG: CONFIG,
  ROOT: ROOT, STATE: STATE, OVERLAY: OVERLAY, LEASE: LEASE};
