#!/usr/bin/env node
'use strict';

// SSH-only, time-limited proof of concept. Never called by the bridge or at boot.
var fs = require('fs');
var cp = require('child_process');
var crypto = require('crypto');
var guard = require('./guard');
var ROOT = '/tmp/lgpb-cec-trial';
var STATE = ROOT + '/state.json';
var OVERLAY = ROOT + '/Simplink.qml';

function privateDirectory() {
    if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, 448);
    var stat = fs.lstatSync(ROOT);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 63)) {
        throw new Error('Trial directory must be a root-owned private directory, not a symlink');
    }
}

function mountLines() {
    return fs.readFileSync('/proc/mounts', 'utf8').split('\n').filter(function (line) {
        return line.split(' ')[1] === guard.TARGET;
    });
}

function readState() {
    if (!fs.existsSync(STATE)) return null;
    var stat = fs.lstatSync(STATE);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0) throw new Error('Unsafe trial state');
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function ownedOverlay(state) {
    if (!state || !/^[a-f0-9]{32}$/.test(state.id) || !fs.existsSync(OVERLAY)) return false;
    var source = fs.lstatSync(OVERLAY);
    var target = fs.statSync(guard.TARGET);
    return source.isFile() && !source.isSymbolicLink() && source.uid === 0 &&
        source.dev === target.dev && source.ino === target.ino &&
        guard.digest(fs.readFileSync(OVERLAY)) === state.patched_sha256;
}

function restore(expectedId) {
    privateDirectory();
    var state = readState();
    if (expectedId && (!state || expectedId !== state.id)) return;
    var mounts = mountLines();
    if (mounts.length) {
        if (mounts.length !== 1 || !ownedOverlay(state)) {
            throw new Error('Unrecognized overlay; refusing to unmount another modification');
        }
        cp.execFileSync('/bin/umount', [guard.TARGET]);
    }
    guard.checkOriginal(fs.readFileSync(guard.TARGET));
    if (state) {
        state.restored = true;
        fs.writeFileSync(STATE, JSON.stringify(state), {mode: 384});
    }
    return {restored: true, original_sha256: guard.ORIGINAL_SHA256,
        note: 'Cached QML needs HDMI-app restart for immediate rollback; its guard also expires automatically.'};
}

function inspect() {
    var source = fs.readFileSync(guard.TARGET);
    var result = {target: guard.TARGET, sha256: guard.digest(source), mounted: mountLines().length > 0};
    result.supported_original = result.sha256 === guard.ORIGINAL_SHA256;
    if (fs.existsSync(ROOT)) {
        privateDirectory();
        var state = readState();
        if (state) {
            result.expires_at = new Date(state.expires).toISOString();
            result.owned_overlay = ownedOverlay(state);
            result.restored = state.restored === true;
        }
    }
    return result;
}

function apply(seconds) {
    if (process.getuid() !== 0) throw new Error('Root is required');
    if (!/^[0-9]+$/.test(seconds) || Number(seconds) < 30 || Number(seconds) > 600) {
        throw new Error('Specify trial duration in seconds, 30..600');
    }
    privateDirectory();
    if (mountLines().length) throw new Error('Target already has an overlay; refusing to stack mounts');
    var source = fs.readFileSync(guard.TARGET);
    guard.checkOriginal(source);
    var started = Date.now();
    var expires = started + Number(seconds) * 1000;
    var patched = guard.build(source, started, expires);
    [OVERLAY, STATE].forEach(function (file) {
        if (fs.existsSync(file)) {
            var stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0) throw new Error('Unsafe trial file');
        }
    });
    var state = {id: crypto.randomBytes(16).toString('hex'), started: started, expires: expires,
        patched_sha256: guard.digest(patched), restored: false};
    fs.writeFileSync(OVERLAY, patched, {mode: 384});
    fs.writeFileSync(STATE, JSON.stringify(state), {mode: 384});
    try {
        cp.execFileSync('/bin/mount', ['--bind', OVERLAY, guard.TARGET]);
        if (!ownedOverlay(state)) throw new Error('Mounted overlay verification failed');
        var child = cp.spawn(process.execPath, [__filename, 'watchdog', state.id],
            {detached: true, stdio: 'ignore'});
        child.on('error', function (error) {
            try { restore(state.id); } catch (rollbackError) { process.stderr.write(rollbackError.message + '\n'); }
            process.stderr.write(error.message + '\n');
            process.exitCode = 1;
        });
        if (!child.pid) throw new Error('Could not start rollback watchdog');
        child.unref();
    } catch (error) {
        if (ownedOverlay(state)) restore(state.id);
        throw error;
    }
    return {mounted: true, expires_at: new Date(expires).toISOString(), watchdog_pid: child.pid,
        note: 'HDMI app must reload QML. No app restart, power, input, or CEC settings command was sent.'};
}

function watchdog(id) {
    privateDirectory();
    var state = readState();
    if (!state || state.id !== id || state.restored) return;
    var remaining = Math.max(0, Math.min(600000, state.expires - Date.now()));
    setTimeout(function () {
        try { restore(id); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
    }, remaining);
}

try {
    var action = process.argv[2];
    var result;
    if (action === 'inspect') result = inspect();
    else if (action === 'apply') result = apply(process.argv[3] || '600');
    else if (action === 'restore') result = restore();
    else if (action === 'watchdog') watchdog(process.argv[3]);
    else throw new Error('Usage: trial.js inspect | apply [30..600 seconds] | restore');
    if (result) process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
}
