#!/usr/bin/env node
'use strict';

var childProcess = require('child_process');
var readline = require('readline');
var range = require('./lib/range');
var store = require('./lib/config-store');
var webhook = require('./lib/webhook');
var appInfo = require('../appinfo.json');

var config = store.load();
var sources = {};
var lastDelivered = null;
var pending = null;
var debounceTimer = null;
var retryTimer = null;
var sending = false;
var stopping = false;
var children = [];

function log(message) {
  process.stdout.write(new Date().toISOString() + ' ' + message + '\n');
}

function selectNewestCandidate() {
  var selected = null;
  Object.keys(sources).forEach(function (key) {
    if (!selected || sources[key].updated_at_ms > selected.updated_at_ms) selected = sources[key];
  });
  return selected;
}

function scheduleDelivery() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () {
    var selected = selectNewestCandidate();
    if (!selected) return;
    if (lastDelivered && lastDelivered.dynamic_range === selected.dynamic_range) {
      pending = null;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      return;
    }
    pending = selected;
    deliverPending();
  }, config.debounce_ms);
}

function retryDelivery() {
  if (retryTimer || stopping) return;
  retryTimer = setTimeout(function () {
    retryTimer = null;
    deliverPending();
  }, 5000);
}

function deliverPending() {
  var candidate;
  var payload;
  if (sending || !pending || stopping) return;
  candidate = pending;
  payload = {
    event: 'dynamic_range_changed',
    dynamic_range: candidate.dynamic_range,
    previous_dynamic_range: lastDelivered ? lastDelivered.dynamic_range : null,
    source: candidate.source,
    raw_value: candidate.raw_value,
    observed_at: candidate.observed_at,
    device_id: config.device_id,
    device_name: config.device_name,
    bridge_version: appInfo.version
  };
  sending = true;
  webhook.postJson(config.callback_url, payload, function (error, response) {
    var newest;
    sending = false;
    if (error) {
      log('Webhook delivery failed: ' + error.message);
      retryDelivery();
      return;
    }
    if (pending === candidate) pending = null;
    lastDelivered = candidate;
    log('Delivered ' + candidate.dynamic_range + ' from ' + candidate.source +
      ' (HTTP ' + response.statusCode + ')');
    newest = selectNewestCandidate();
    if (!pending && newest && newest.dynamic_range !== lastDelivered.dynamic_range) pending = newest;
    if (pending) deliverPending();
  });
}

function handlePayload(source, payload) {
  var extracted = range.extract(source, payload);
  if (!extracted) return;
  extracted.observed_at = new Date().toISOString();
  extracted.updated_at_ms = Date.now();
  sources[source] = extracted;
  log('Observed ' + extracted.dynamic_range + ' from ' + source + ' (' + extracted.raw_value + ')');
  scheduleDelivery();
}

function subscribe(source, uri, payload) {
  var restartDelay = 1000;

  function start() {
    var child;
    var lines;
    if (stopping) return;
    child = childProcess.spawn('luna-send', ['-i', uri, JSON.stringify(payload)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    children.push(child);
    lines = readline.createInterface({input: child.stdout});
    lines.on('line', function (line) {
      var parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        log('Ignored invalid ' + source + ' response');
        return;
      }
      handlePayload(source, parsed);
    });
    child.stderr.on('data', function (data) {
      var message = String(data).trim();
      if (message) log(source + ' subscription: ' + message);
    });
    child.on('error', function (error) {
      log(source + ' subscription could not start: ' + error.message);
    });
    child.on('close', function (code) {
      var index = children.indexOf(child);
      if (index !== -1) children.splice(index, 1);
      if (stopping) return;
      log(source + ' subscription closed (' + code + '); retrying');
      setTimeout(start, restartDelay);
      restartDelay = Math.min(restartDelay * 2, 30000);
    });
    child.stdout.on('data', function () { restartDelay = 1000; });
  }

  start();
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  log('Stopping after ' + signal);
  if (debounceTimer) clearTimeout(debounceTimer);
  if (retryTimer) clearTimeout(retryTimer);
  children.forEach(function (child) {
    try { child.kill('SIGTERM'); } catch (error) { /* Child already exited. */ }
  });
  setTimeout(function () { process.exit(0); }, 250);
}

process.on('SIGTERM', function () { stop('SIGTERM'); });
process.on('SIGINT', function () { stop('SIGINT'); });
process.on('uncaughtException', function (error) {
  log('Fatal error: ' + error.stack);
  process.exit(1);
});

log('Starting LG Picture Bridge ' + appInfo.version + ' for ' + config.device_id);
subscribe('videooutput', 'luna://com.webos.service.videooutput/getStatus', {subscribe: true});
subscribe('picture', 'luna://com.webos.settingsservice/getSystemSettings', {
  category: 'picture',
  subscribe: true
});
