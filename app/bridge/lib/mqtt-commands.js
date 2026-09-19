'use strict';

// MQTT authenticates through broker credentials/ACLs, not the optional HTTP token.
// This opt-in endpoint accepts ONLY the existing bounded picture-policy schema.
var crypto = require('crypto');
var picturePolicy = require('./picture-policy');

function error(code, message) { var result = new Error(message); result.code = code; return result; }
function create(options) {
  var clock = options.now || Date.now;
  var session = null;
  var ready = false;
  var cache = Object.create(null);
  var results = Object.create(null);
  var resultOrder = [];
  var state = 'idle';
  var lastId = null;

  function status() {
    return {protocol: 1, session_id: session, ready: ready, state: state,
      command_topic: options.topic, request_id: lastId, results: results};
  }
  function publish() { return ready ? options.publish(status()) : false; }
  function remember(id, result) {
    results[id] = result;
    resultOrder = resultOrder.filter(function (key) { return key !== id; });
    resultOrder.push(id);
    if (resultOrder.length > 16) delete results[resultOrder.shift()];
    state = result.state; lastId = id;
  }
  function finish(id, failure, value) {
    var result = {request_id: id, ok: !failure, state: failure ? 'failed' : 'completed',
      completed_at: new Date(clock()).toISOString()};
    if (failure) {
      result.error = failure.code || 'command_failed';
      result.message = String(failure.message || 'Command failed').slice(0, 512);
      if (failure.operation_index !== undefined) result.operation_index = failure.operation_index;
    } else {
      result.dry_run = value.dry_run;
      result.input = value.input; result.scope = value.scope;
      result.operation_count = value.operation_count;
    }
    remember(id, result);
    publish();
    return result;
  }
  function receive(message, metadata) {
    var envelope, id, digest, entry, policy, context, currentSession = session;
    // Ignore retained deliveries, malformed envelopes and oversized data without reflecting it.
    if (!ready || !metadata || metadata.retain || Buffer.byteLength(message, 'utf8') > 49152) return;
    try { envelope = JSON.parse(message); } catch (ignored) { return; }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return;
    id = envelope.request_id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id) ||
        id === 'constructor' || id === 'prototype' || id === '__proto__') return;
    if (envelope.protocol !== 1 || envelope.session_id !== session) {
      finish(id, error('stale_session', 'Obtain the current MQTT command session before publishing')); return;
    }
    digest = crypto.createHash('sha256').update(message).digest('hex');
    entry = cache[id];
    if (entry) {
      if (entry.digest !== digest) { finish(id, error('request_id_conflict', 'Use a new request_id for a different command')); return; }
      if (entry.result) {
        remember(id, entry.result);
      }
      publish(); // Retry of the exact envelope never repeats writes, even after its expiry.
      return;
    }
    if (typeof envelope.expires_at !== 'number' || !isFinite(envelope.expires_at) ||
        envelope.expires_at * 1000 <= clock() || envelope.expires_at * 1000 > clock() + 60000) {
      finish(id, error('expired_command', 'expires_at must be a Unix timestamp within the next 60 seconds')); return;
    }
    Object.keys(cache).forEach(function (key) {
      if (cache[key].result && cache[key].forgetAt < clock()) delete cache[key];
    });
    if (Object.keys(cache).length >= 64) {
      finish(id, error('command_rate_limit', 'Too many recent commands; wait before retrying')); return;
    }
    try {
      policy = picturePolicy.normalize(envelope.policy);
      policy.request_id = id;
    } catch (failure) { finish(id, failure); return; }
    context = options.context();
    function guard() {
      if (!ready || session !== currentSession) throw error('stale_session', 'MQTT connection changed before completion');
      if (envelope.expires_at * 1000 <= clock()) throw error('expired_command', 'Command expired before completion');
      if (options.context() !== context) throw error('stale_context', 'TV signal, input or dynamic range changed before completion');
      if (policy.scope === 'active' && !options.pictureReady()) throw error('signal_unavailable', 'No confirmed active HDMI picture');
    }
    entry = cache[id] = {digest: digest, result: null, forgetAt: clock() + 120000};
    state = 'running'; lastId = id; publish();
    try {
      guard();
      options.applyPolicy(policy, function (failure, value) {
        // An old connection's completion cannot satisfy requests in the new session.
        if (session !== currentSession) return;
        entry.result = finish(id, failure, value);
      }, guard);
    } catch (failure) { entry.result = finish(id, failure); }
  }
  return {
    connect: function () {
      session = crypto.randomBytes(16).toString('hex'); ready = false;
      cache = Object.create(null); results = Object.create(null); resultOrder = [];
      state = 'idle'; lastId = null;
    },
    subscribed: function () { ready = true; publish(); },
    disconnect: function () { ready = false; session = null; },
    receive: receive, publish: publish, status: status
  };
}
module.exports = {create: create};
