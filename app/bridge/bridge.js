'use strict';

var range = require('./lib/range');
var store = require('./lib/config-store');
var healthStore = require('./lib/health-store');
var webhook = require('./lib/webhook');
var appInfo = require('../appinfo.json');

function now() {
  return new Date().toISOString();
}

function summarizePayload(payload) {
  var serialized;
  try { serialized = JSON.stringify(payload); } catch (error) { serialized = String(payload); }
  return serialized.length > 2048 ? serialized.slice(0, 2048) + '…' : serialized;
}

function start(service, dependencies) {
  var injected = dependencies || {};
  var config = injected.config || store.load();
  var webhookClient = injected.webhook || webhook;
  var healthClient = injected.healthStore || healthStore;
  var sources = {};
  var subscriptions = [];
  var lastDelivered = null;
  var pending = null;
  var debounceTimer = null;
  var retryTimer = null;
  var sending = false;
  var stopping = false;
  var health = {
    bridge_version: appInfo.version,
    service_registered: true,
    started_at: now(),
    heartbeat_at: now(),
    subscriptions: {
      videooutput: {
        state: 'starting',
        last_response_at: null,
        last_error: null,
        last_payload: null
      },
      picture: {
        state: 'starting',
        last_response_at: null,
        last_error: null,
        last_payload: null
      }
    },
    last_dynamic_range: null,
    last_source: null,
    last_raw_value: null,
    last_observed_at: null,
    last_delivery_at: null,
    last_delivery_status: null,
    last_error: null
  };

  function log(message) {
    process.stdout.write(now() + ' ' + message + '\n');
  }

  function saveHealth() {
    health.heartbeat_at = now();
    try { healthClient.save(health); } catch (error) {
      log('Health state write failed: ' + error.message);
    }
  }

  function selectNewestCandidate() {
    var selected = null;
    Object.keys(sources).forEach(function (key) {
      if (!selected || sources[key].updated_at_ms > selected.updated_at_ms) {
        selected = sources[key];
      }
    });
    return selected;
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
    webhookClient.postJson(config.callback_url, payload, function (error, response) {
      var newest;
      sending = false;
      if (error) {
        health.last_delivery_status = 'failed';
        health.last_error = 'Webhook delivery failed: ' + error.message;
        saveHealth();
        log(health.last_error);
        retryDelivery();
        return;
      }
      if (pending === candidate) pending = null;
      lastDelivered = candidate;
      health.last_delivery_at = now();
      health.last_delivery_status = 'http_' + response.statusCode;
      health.last_error = null;
      saveHealth();
      log('Delivered ' + candidate.dynamic_range + ' from ' + candidate.source +
        ' (HTTP ' + response.statusCode + ')');
      newest = selectNewestCandidate();
      if (!pending && newest && newest.dynamic_range !== lastDelivered.dynamic_range) {
        pending = newest;
      }
      if (pending) deliverPending();
    });
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

  function handlePayload(source, payload) {
    var extracted = range.extract(source, payload);
    var sourceHealth = health.subscriptions[source];
    var payloadSummary = summarizePayload(payload);
    sourceHealth.last_response_at = now();
    sourceHealth.last_payload = payloadSummary;
    sourceHealth.last_error = null;

    if (payload && payload.returnValue === false) {
      sourceHealth.last_error = payload.errorText || payload.errorCode || 'Luna request failed';
      if (/service does not exist/i.test(String(sourceHealth.last_error))) {
        sourceHealth.state = 'unavailable';
        saveHealth();
        log(source + ' subscription unavailable: ' + sourceHealth.last_error);
        return;
      }
      sourceHealth.state = 'error';
      health.last_error = source + ' subscription failed: ' + sourceHealth.last_error;
      saveHealth();
      log(health.last_error + ' (' + payloadSummary + ')');
      return;
    }
    if (payload && payload.subscribed === false) {
      sourceHealth.state = 'error';
      sourceHealth.last_error = 'Luna service declined the subscription';
      health.last_error = source + ' subscription failed: ' + sourceHealth.last_error;
      saveHealth();
      log(health.last_error + ' (' + payloadSummary + ')');
      return;
    }

    sourceHealth.state = payload && payload.subscribed === true ? 'subscribed' : 'responding';
    if (!extracted) {
      if (sourceHealth.last_unrecognized_payload !== payloadSummary) {
        sourceHealth.last_unrecognized_payload = payloadSummary;
        log('Unrecognized ' + source + ' payload: ' + payloadSummary);
      }
      saveHealth();
      return;
    }

    extracted.observed_at = now();
    extracted.updated_at_ms = Date.now();
    sources[source] = extracted;
    health.last_dynamic_range = extracted.dynamic_range;
    health.last_source = source;
    health.last_raw_value = extracted.raw_value;
    health.last_observed_at = extracted.observed_at;
    health.last_error = null;
    saveHealth();
    log('Observed ' + extracted.dynamic_range + ' from ' + source +
      ' (' + extracted.raw_value + ')');
    scheduleDelivery();
  }

  function markSubscriptionError(source, error) {
    var message = error && error.message ? error.message : String(error || 'unknown error');
    health.subscriptions[source].state = 'error';
    health.subscriptions[source].last_error = message;
    health.last_error = source + ' subscription error: ' + message;
    saveHealth();
    log(health.last_error);
  }

  function subscribe(source, uri, payload) {
    var subscription;
    health.subscriptions[source].state = 'subscribing';
    saveHealth();
    try {
      subscription = service.subscribe(uri, payload);
      subscriptions.push(subscription);
      subscription.on('response', function (message) {
        handlePayload(source, message && message.payload ? message.payload : message);
      });
      subscription.on('error', function (error) {
        markSubscriptionError(source, error);
      });
      subscription.on('cancel', function () {
        markSubscriptionError(source, new Error('subscription cancelled'));
      });
    } catch (error) {
      markSubscriptionError(source, error);
    }
  }

  function stop(signal) {
    if (stopping) return;
    stopping = true;
    log('Stopping after ' + signal);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (retryTimer) clearTimeout(retryTimer);
    subscriptions.forEach(function (subscription) {
      try {
        if (subscription && typeof subscription.cancel === 'function') subscription.cancel();
      } catch (error) { /* Subscription is already closed. */ }
    });
    process.exit(0);
  }

  service.register('status', function (message) {
    message.respond({returnValue: true, health: health});
  });
  process.on('SIGTERM', function () { stop('SIGTERM'); });
  process.on('SIGINT', function () { stop('SIGINT'); });
  process.on('uncaughtException', function (error) {
    health.last_error = 'Fatal error: ' + (error.stack || error.message);
    saveHealth();
    log(health.last_error);
    process.exit(1);
  });

  log('Starting registered LG Picture Bridge ' + appInfo.version + ' for ' + config.device_id);
  saveHealth();
  subscribe('videooutput', 'luna://com.webos.service.videooutput/getStatus', {subscribe: true});
  subscribe('picture', 'luna://com.webos.settingsservice/getSystemSettings', {
    category: 'picture',
    subscribe: true
  });
  setInterval(saveHealth, 30000);
  return {health: health, handlePayload: handlePayload, stop: stop};
}

module.exports = {start: start, summarizePayload: summarizePayload};
