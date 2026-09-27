'use strict';
var assert = require('assert');
var guard = require('../app/bridge/lib/cec-guard');
var patch = require('../app/bridge/lib/cec-patch');
function configuredPolicy() { return {version: 1, enabled: true,
  rules: [{id: 'test_player', match: {input: 'hdmi3', vendor_id: 12345}, block: ['automatic_selection']}]}; }

function environment(options) {
  options = options || {};
  var files = {}, sequence = 0, mounted = options.foreign ? 'foreign' : false, clock = 10000;
  var commands = [], writes = [], intervals = [], spawns = [];
  function entry(value, mode) { return {value: value, mode: mode || (value === null ? 493 : 420),
    uid: 0, ino: ++sequence, nlink: 1, link: false}; }
  files[guard.APP_ROOT + '/appinfo.json'] = entry('{}');
  files[guard.STATE_DIR] = entry(null, 448);
  files[guard.STATE_DIR + '/config.json'] = entry('existing broker configuration', 384);
  files[patch.TARGET] = entry(options.unsupported ? 'unknown' : 'original');
  var fs = {
    existsSync: function (p) { return Object.prototype.hasOwnProperty.call(files, p); },
    mkdirSync: function (p, mode) { files[p] = entry(null, mode); },
    lstatSync: function (p) {
      var e = files[p]; if (!e) { var error = Error('missing'); error.code = 'ENOENT'; throw error; }
      return {uid: e.uid, mode: e.mode, ino: e.ino, dev: 1, nlink: e.nlink,
        isSymbolicLink: function () { return e.link; }, isFile: function () { return e.value !== null; },
        isDirectory: function () { return e.value === null; }};
    },
    statSync: function (p) { return fs.lstatSync(p === patch.TARGET && mounted === true ? guard.OVERLAY : p); },
    readFileSync: function (p) {
      if (p === '/proc/mounts') return mounted ? 'tmp ' + patch.TARGET + ' tmpfs rw 0 0\n' : '';
      return files[p === patch.TARGET && mounted === true ? guard.OVERLAY : p].value;
    },
    writeFileSync: function (p, value, opts) { writes.push(p); files[p] = entry(value, opts.mode); },
    renameSync: function (a, b) { if (options.saveFailure && b === guard.CONFIG) throw Error('save failure'); files[b] = files[a]; delete files[a]; },
    unlinkSync: function (p) { delete files[p]; },
    rmdirSync: function (p) { delete files[p]; }
  };
  var cp = {
    execFileSync: function (bin, args) {
      commands.push([bin].concat(args));
      if (bin === '/bin/mount') mounted = true;
      else if (bin === '/bin/umount') mounted = false;
      else if (bin === '/usr/bin/luna-send') return '{"returnValue":true}';
      else throw Error('Unexpected command ' + bin);
    },
    spawn: function (bin, args) {
      spawns.push([bin].concat(args));
      return {pid: options.spawnFailure ? undefined : 22, on: function () {}, unref: function () {}};
    }
  };
  var deps = {fs: fs, cp: cp, now: function () { return clock; },
    process: {pid: 10, execPath: '/usr/bin/node', getuid: function () { return options.nonroot ? 1000 : 0; },
      stderr: {write: function () {}}},
    patch: {TARGET: patch.TARGET, REVISION: 2, ORIGINAL_SHA256: 'original',
      digest: function (value) { return value; }, validLease: patch.validLease,
      checkOriginal: function (value) { if (value !== 'original') throw Error('Unsupported'); },
      build: function () { return 'patched'; }},
    setInterval: function (callback, ms) { var timer = {callback: callback, ms: ms, canceled: false}; intervals.push(timer); return timer; },
    clearInterval: function (timer) { timer.canceled = true; }};
  return {manager: guard.create(deps), newManager: function () { return guard.create(deps); }, files: files,
    writes: writes, commands: commands, intervals: intervals, spawns: spawns, options: options,
    advance: function (ms) { clock += ms; }, mounted: function () { return mounted; },
    addUnsafe: function (p, kind) { files[p] = entry(p === guard.ROOT ? null : 'unsafe'); files[p][kind] = kind === 'uid' ? 1000 : true; }};
}

module.exports = function () {
  var e = environment();
  assert.strictEqual(e.manager.snapshot().enabled, false);
  assert.strictEqual(e.writes.length, 0, 'Status is read-only');
  e.manager.start(); assert.strictEqual(e.commands.length, 0, 'Default is off');
  var enabled = e.manager.setPolicy(configuredPolicy());
  assert(enabled.enabled && enabled.supported && enabled.mounted && enabled.lease_active);
  assert.strictEqual(e.files[guard.STATE_DIR + '/config.json'].value, 'existing broker configuration');
  assert(e.writes.every(function (p) { return p.indexOf(guard.ROOT + '/') === 0 || p.indexOf(guard.CONFIG) === 0; }), 'Never write firmware');
  assert.strictEqual(e.commands.filter(function (c) { return c[0] === '/usr/bin/luna-send'; }).length, 4);
  var before = e.commands.length; e.advance(30000); e.manager.tick();
  assert.strictEqual(e.commands.length, before, 'Lease refresh must not restart HDMI again');
  e.newManager().start(); assert.strictEqual(e.commands.length, before, 'Service restart adopts owned overlay');
  var off = e.manager.setEnabled(false);
  assert(!off.enabled && !off.mounted && !off.lease_active);
  assert.strictEqual(JSON.parse(e.files[guard.LEASE].value).enabled, false);
  e.manager.tick(); assert.strictEqual(e.mounted(), false);
  e.manager.setEnabled(true); e.manager.suspend();
  assert.strictEqual(JSON.parse(e.files[guard.CONFIG].value).policy.enabled, true, 'Monitor suspension preserves opt-in');
  e.newManager().start(); assert.strictEqual(e.mounted(), true, 'Saved opt-in restores after restart');
  e.manager.remove(); assert(!e.files[guard.CONFIG] && !e.mounted());
  assert(!e.files[guard.ROOT], 'Removing the option also cleans its runtime files');

  ['nonroot', 'unsupported', 'foreign', 'spawnFailure'].forEach(function (flag) {
    var options = {}; options[flag] = true;
    var rejected = environment(options);
    assert.throws(function () { rejected.manager.setPolicy(configuredPolicy()); }, undefined, flag);
    if (flag === 'foreign') assert(!rejected.commands.some(function (c) { return c[0] === '/bin/umount'; }));
    else assert.strictEqual(rejected.mounted(), false);
  });
  [guard.ROOT, guard.OVERLAY, guard.LEASE, guard.STATE, guard.CONFIG].forEach(function (p) {
    var unsafe = environment(); unsafe.addUnsafe(p, 'link');
    assert.throws(function () { unsafe.manager.setPolicy(configuredPolicy()); }, /Unsafe/);
    assert(!unsafe.mounted(), 'Unsafe local files cannot leave an overlay installed');
  });
  var hardLink = environment(); hardLink.addUnsafe(guard.OVERLAY, 'nlink'); hardLink.files[guard.OVERLAY].nlink = 2;
  assert.throws(function () { hardLink.manager.setPolicy(configuredPolicy()); }, /Unsafe/);

  var expiry = environment(); expiry.manager.setPolicy(configuredPolicy());
  var id = JSON.parse(expiry.files[guard.STATE].value).id;
  expiry.manager.watchdog(id);
  for (var tick = 0; tick < 6; tick++) {
    expiry.advance(15000); expiry.intervals[expiry.intervals.length - 1].callback();
  }
  assert(!expiry.mounted(), 'Regular watchdog restores at 90 seconds after a dead manager; no grace');

  function paused() {
    var env = environment(); env.manager.setPolicy(configuredPolicy());
    env.manager.watchdog(JSON.parse(env.files[guard.STATE].value).id);
    env.watchdogTimer = env.intervals[env.intervals.length - 1];
    env.beforePauseCommands = env.commands.length;
    return env;
  }
  ['watchdog-first', 'renewal-first'].forEach(function (order) {
    var resumed = paused();
    resumed.advance(22 * 60 * 60 * 1000);
    assert(!resumed.manager.snapshot().lease_active, 'Expired QML policy fails open on wake');
    if (order === 'watchdog-first') {
      resumed.watchdogTimer.callback();
      assert(resumed.mounted() && !resumed.manager.snapshot().lease_active, 'Grace never renews permission');
      resumed.advance(30000);
      resumed.manager.tick();
    } else {
      resumed.manager.tick();
    }
    resumed.watchdogTimer.callback();
    assert(resumed.manager.snapshot().lease_active, 'Manager restored a fresh lease: ' + order);
    assert.strictEqual(resumed.commands.length, resumed.beforePauseCommands,
      'No unmount, remount or HDMI close on long standby resume: ' + order);
    // Repeated sleep cycles are allowed after a healthy renewal was observed.
    resumed.advance(120000); resumed.watchdogTimer.callback(); resumed.manager.tick();
    resumed.watchdogTimer.callback();
    assert.strictEqual(resumed.commands.length, resumed.beforePauseCommands, 'Repeated resume remains silent');
  });
  var newerLease = paused();
  newerLease.advance(5000); newerLease.manager.tick();
  newerLease.advance(120000); newerLease.watchdogTimer.callback(); newerLease.manager.tick();
  assert.strictEqual(newerLease.commands.length, newerLease.beforePauseCommands,
    'A lease issued after the previous watchdog check also gets resume grace');
  var deadAfterSleep = paused();
  deadAfterSleep.advance(120000); deadAfterSleep.watchdogTimer.callback();
  deadAfterSleep.advance(15000); deadAfterSleep.watchdogTimer.callback();
  deadAfterSleep.advance(29999); deadAfterSleep.watchdogTimer.callback();
  assert(deadAfterSleep.mounted() && !deadAfterSleep.manager.snapshot().lease_active);
  deadAfterSleep.advance(1); deadAfterSleep.watchdogTimer.callback();
  assert(!deadAfterSleep.mounted() && deadAfterSleep.watchdogTimer.canceled,
    'Dead bridge after sleep is removed at the fixed 45-second grace deadline');
  var delayedAgain = paused();
  delayedAgain.advance(120000); delayedAgain.watchdogTimer.callback();
  delayedAgain.advance(120000); delayedAgain.watchdogTimer.callback();
  assert(!delayedAgain.mounted(), 'Another missed tick cannot extend the same expired lease grace');
  ['revoked', 'malformed', 'app-removed', 'config-removed', 'backwards'].forEach(function (cause) {
    var invalid = paused(); invalid.advance(120000); invalid.watchdogTimer.callback();
    if (cause === 'revoked') invalid.files[guard.LEASE].value = '{"schema":2,"enabled":false}';
    if (cause === 'malformed') invalid.files[guard.LEASE].value = 'not json';
    if (cause === 'app-removed') delete invalid.files[guard.APP_ROOT + '/appinfo.json'];
    if (cause === 'config-removed') delete invalid.files[guard.STATE_DIR + '/config.json'];
    invalid.advance(cause === 'backwards' ? -1000 : 1000);
    invalid.watchdogTimer.callback();
    assert(!invalid.mounted(), 'Grace never delays safety removal: ' + cause);
  });
  var upgrade = paused();
  var preUpgrade = JSON.parse(upgrade.files[guard.STATE].value);
  delete preUpgrade.watchdog_revision;
  upgrade.files[guard.STATE].value = JSON.stringify(preUpgrade);
  upgrade.newManager().start();
  var postUpgrade = JSON.parse(upgrade.files[guard.STATE].value);
  assert.notStrictEqual(postUpgrade.id, preUpgrade.id, 'Upgrade retires the old detached watchdog generation');
  assert.strictEqual(postUpgrade.watchdog_revision, 1);
  assert.strictEqual(upgrade.spawns.length, 2, 'Exactly one replacement watchdog starts');
  assert.strictEqual(upgrade.commands.length, upgrade.beforePauseCommands, 'Watchdog upgrade does not reload HDMI');
  upgrade.advance(120000); upgrade.watchdogTimer.callback();
  assert(upgrade.mounted() && upgrade.watchdogTimer.canceled, 'Retired watchdog cannot remove the new generation');
  upgrade.newManager().start();
  assert.strictEqual(upgrade.spawns.length, 2, 'Current watchdog is adopted on ordinary service restart');
  var failedUpgrade = paused();
  var oldState = JSON.parse(failedUpgrade.files[guard.STATE].value); delete oldState.watchdog_revision;
  failedUpgrade.files[guard.STATE].value = JSON.stringify(oldState);
  failedUpgrade.options.spawnFailure = true; failedUpgrade.newManager().start();
  assert(!failedUpgrade.mounted(), 'Failed watchdog upgrade revokes and restores the owned overlay');
  var old = environment(); old.manager.setPolicy(configuredPolicy()); old.manager.watchdog('old-generation');
  old.intervals[old.intervals.length - 1].callback(); assert(old.mounted(), 'Stale watchdog cannot unmount a newer generation');
  var uninstall = environment(); uninstall.manager.setPolicy(configuredPolicy());
  delete uninstall.files[guard.APP_ROOT + '/appinfo.json']; uninstall.manager.tick();
  assert(!uninstall.mounted(), 'App removal stops the filter even if a service process remains alive');
  var cannotSave = environment(); cannotSave.manager.setPolicy(configuredPolicy()); cannotSave.options.saveFailure = true;
  assert.throws(function () { cannotSave.manager.setEnabled(false); }, /save failure/);
  cannotSave.manager.tick(); assert(!cannotSave.mounted(), 'Failed off-save must not re-enable in the current service');
  var dynamic = environment(); dynamic.manager.setPolicy(configuredPolicy());
  var oldCount = dynamic.commands.length, replacement = configuredPolicy();
  replacement.rules[0].match.input = 'hdmi1';
  dynamic.manager.applyCommand(replacement);
  assert.strictEqual(dynamic.commands.length, oldCount, 'Changing rules must not close any HDMI app or remount');
  assert.strictEqual(JSON.parse(dynamic.files[guard.LEASE].value).policy.rules[0].match.input, 'hdmi1');
  var beforeBad = dynamic.files[guard.CONFIG].value;
  replacement.rules[0].block = ['standby'];
  assert.throws(function () { dynamic.manager.applyCommand(replacement); }, /Unsupported/);
  assert.strictEqual(dynamic.files[guard.CONFIG].value, beforeBad, 'Unsupported standby must not partially replace a policy');
  dynamic.manager.applyCommand({enabled: false}); assert(!dynamic.mounted());
  assert.strictEqual(dynamic.manager.snapshot().policy.rules.length, 1, 'Master off retains HA rules');
  dynamic.manager.applyCommand({version: 1, enabled: true, rules: []});
  assert(!dynamic.mounted(), 'An empty rule set blocks nothing and needs no overlay');
  assert.strictEqual(dynamic.manager.snapshot().filter_state, 'no_rules');
  var legacy = environment(); legacy.manager.setEnabled(false);
  legacy.files[guard.CONFIG].value = '{"schema":1,"enabled":true}';
  legacy.manager.start();
  assert.strictEqual(legacy.manager.snapshot().migration_required, true);
  assert.strictEqual(legacy.manager.snapshot().enabled, false, 'No vendor-specific legacy defaults may be invented');
};
