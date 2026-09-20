'use strict';
var assert = require('assert');
var guard = require('../app/bridge/lib/cec-guard');
var patch = require('../app/bridge/lib/cec-patch');
function configuredPolicy() { return {version: 1, enabled: true,
  rules: [{id: 'test_player', match: {input: 'hdmi3', vendor_id: 12345}, block: ['automatic_selection']}]}; }

function environment(options) {
  options = options || {};
  var files = {}, sequence = 0, mounted = options.foreign ? 'foreign' : false, clock = 10000;
  var commands = [], writes = [], intervals = [];
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
    spawn: function () { return {pid: options.spawnFailure ? undefined : 22, on: function () {}, unref: function () {}}; }
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
    writes: writes, commands: commands, intervals: intervals, options: options,
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
  expiry.manager.watchdog(id); expiry.advance(90001);
  expiry.intervals[expiry.intervals.length - 1].callback();
  assert(!expiry.mounted(), 'Independent watchdog restores after missed heartbeat');
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
