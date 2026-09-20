'use strict';

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var realGuard = require('../experiments/apple-tv-cec/guard');
var program = fs.readFileSync(require('path').join(__dirname,
    '../experiments/apple-tv-cec/trial.js'), 'utf8');

module.exports = function () {
    var root = '/tmp/lgpb-cec-trial';
    var overlay = root + '/Simplink.qml';
    var stateFile = root + '/state.json';
    function environment(options) {
        options = options || {};
        var files = {};
        var mounted = options.unrelatedMount ? 'foreign' : false;
        var commands = [];
        var writes = [];
        var timers = [];
        var out = '';
        var errors = '';
        var process = {argv: [], execPath: '/usr/bin/node', exitCode: 0,
            getuid: function () { return options.nonroot ? 1000 : 0; },
            stdout: {write: function (value) { out += value; }},
            stderr: {write: function (value) { errors += value; }}};
        var mockFs = {
            existsSync: function (file) { return Object.prototype.hasOwnProperty.call(files, file); },
            mkdirSync: function (file) { files[file] = null; },
            lstatSync: function (file) {
                return {uid: options.unsafeDirectory && file === root ? 1000 : 0, mode: 448,
                    dev: 1, ino: file === overlay ? 2 : 3,
                    isDirectory: function () { return file === root; },
                    isFile: function () { return file !== root; },
                    isSymbolicLink: function () { return false; }};
            },
            statSync: function () { return {dev: 1, ino: mounted === true ? 2 : 1}; },
            readFileSync: function (file) {
                if (file === '/proc/mounts') return mounted ? 'tmp ' + realGuard.TARGET + ' tmpfs rw 0 0\n' : '';
                if (file === realGuard.TARGET) return mounted === true ? files[overlay] :
                    (options.unsupported ? 'unsupported' : 'original');
                if (!mockFs.existsSync(file)) throw new Error('ENOENT ' + file);
                return files[file];
            },
            writeFileSync: function (file, value) { writes.push(file); files[file] = value; }
        };
        var fakeGuard = {
            TARGET: realGuard.TARGET, ORIGINAL_SHA256: 'original',
            digest: function (value) { return value; },
            checkOriginal: function (value) { if (value !== 'original') throw new Error('Unsupported firmware'); },
            build: function () { return 'patched'; }
        };
        var mockCp = {
            execFileSync: function (bin, args) {
                commands.push([bin].concat(args));
                if (bin === '/bin/mount') mounted = true;
                else if (bin === '/bin/umount') mounted = false;
                else throw new Error('Unexpected command');
            },
            spawn: function () {
                if (options.spawnFailure) return {on: function () {}, unref: function () {}};
                return {pid: 123, on: function () {}, unref: function () {}};
            }
        };
        function run(action, arg) {
            process.argv = ['/usr/bin/node', '/tools/trial.js', action, arg];
            process.exitCode = 0; out = ''; errors = '';
            vm.runInNewContext(program, {process: process, __filename: '/tools/trial.js',
                setTimeout: function (callback, delay) { timers.push({callback: callback, delay: delay}); },
                require: function (name) {
                    if (name === 'fs') return mockFs;
                    if (name === 'child_process') return mockCp;
                    if (name === './guard') return fakeGuard;
                    if (name === 'crypto') return {randomBytes: function () {
                        return {toString: function () { return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; }};
                    }};
                    throw new Error('Unexpected dependency ' + name);
                }});
            return {code: process.exitCode, output: out, error: errors};
        }
        return {run: run, files: files, commands: commands, writes: writes, timers: timers,
            isMounted: function () { return mounted; }};
    }
    var env = environment();
    assert.strictEqual(env.run('inspect').code, 0);
    assert.strictEqual(env.writes.length, 0, 'Inspect is read only');
    assert.strictEqual(env.run('apply', '600').code, 0);
    assert(env.isMounted());
    assert(env.commands[0][0] === '/bin/mount');
    assert(env.writes.every(function (file) { return file.indexOf(root + '/') === 0; }), 'Never write firmware');
    assert.strictEqual(env.run('apply', '600').code, 1, 'Cannot stack overlays');
    assert.strictEqual(env.run('restore').code, 0);
    assert.strictEqual(env.isMounted(), false);
    assert.strictEqual(JSON.parse(env.files[stateFile]).restored, true);
    assert.strictEqual(env.run('restore').code, 0, 'Restore is idempotent');

    ['nonroot', 'unsafeDirectory', 'unsupported', 'unrelatedMount'].forEach(function (flag) {
        var options = {}; options[flag] = true;
        var rejected = environment(options);
        assert.strictEqual(rejected.run('apply', '600').code, 1, flag);
        assert.strictEqual(rejected.commands.length, 0, flag + ' must not mount/unmount');
    });
    var foreign = environment({unrelatedMount: true});
    assert.strictEqual(foreign.run('restore').code, 1);
    assert.strictEqual(foreign.commands.length, 0, 'Never unmount another modification');
    ['0', '29', '601', '-1', '1;reboot'].forEach(function (seconds) {
        var rejected = environment();
        assert.strictEqual(rejected.run('apply', seconds).code, 1);
        assert.strictEqual(rejected.commands.length, 0);
    });
    var failedWatchdog = environment({spawnFailure: true});
    assert.strictEqual(failedWatchdog.run('apply', '600').code, 1);
    assert.strictEqual(failedWatchdog.isMounted(), false, 'Failed watchdog launch rolls back');
    var timed = environment();
    timed.run('apply', '30');
    var id = JSON.parse(timed.files[stateFile]).id;
    timed.run('watchdog', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.strictEqual(timed.timers.length, 0, 'Old watchdog does not affect new trial');
    timed.run('watchdog', id);
    assert.strictEqual(timed.timers.length, 1);
    assert(timed.timers[0].delay <= 30000);
    timed.timers[0].callback();
    assert.strictEqual(timed.isMounted(), false, 'Timer restores original');
};
