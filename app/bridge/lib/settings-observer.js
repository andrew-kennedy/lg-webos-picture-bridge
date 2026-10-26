'use strict';

var crypto = require('crypto');
var catalog = require('./settings-catalog');
var URI = 'luna://com.webos.settingsservice/';
var RECOVERY_MS = 300000;
function signature(value) { return JSON.stringify(value || null); }
function cancel(request) {
  if (request && request.cancel) { try { request.cancel(); } catch (ignored) { /* Already closed. */ } }
}
function descriptions(payload) {
  return Array.isArray(payload.results) ? payload.results : payload.key ? [payload] : null;
}
function mergeDescription(previous, patch) {
  var result = Object.assign({}, previous || {}, patch);
  ['ui', 'values'].forEach(function (key) {
    if (patch[key]) result[key] = Object.assign({}, (previous || {})[key] || {}, patch[key]);
  });
  if (patch.values && patch.values.range) {
    result.values.range = Object.assign({}, previous && previous.values && previous.values.range || {}, patch.values.range);
  }
  return result;
}
function makeControl(entry, description, record, context, describe) {
  if (!record) return null;
  var control = describe(entry, description, record.value);
  if (!control) return null;
  control.dimension = {};
  control.observed_at = record.observed_at;
  var dimension = record.dimension || {}, physical = context && String(context.input || '').replace(/_pc$/, '');
  var expected = {input: context && context.input, pictureMode: context && context.mode,
    dynamicRange: context && context.range, gameInput: physical, audioInput: physical};
  control.dimensions.forEach(function (key) {
    if (dimension[key] === undefined) control.available = false;
    else {
      control.dimension[key] = dimension[key];
      if (expected[key] && dimension[key] !== expected[key]) control.available = false;
    }
  });
  if (control.current_app) {
    control.app_id = record.app_id;
    if (!record.app_id || record.app_id !== 'com.webos.app.' + physical) control.available = false;
  }
  if (entry.category === 'picture' || control.dimensions.length || control.current_app) {
    if (!context || !context.ready || !/^hdmi[1-4](?:_pc)?$/.test(context.input || '')) control.available = false;
  }
  return control;
}

function create(service, options) {
  var later = options.setTimeout || setTimeout, clearLater = options.clearTimeout || clearTimeout;
  var every = options.setInterval || setInterval, clearEvery = options.clearInterval || clearInterval;
  var clock = options.now || Date.now;
  var groups = {}, streams = [], reads = [], controls = {}, generation = 0, observedAt = 0;
  var contextId = null, captured = null, started = false, stopped = false;
  var restart = null, recovery = null, checking = false, waiting = [], lastError = null, backoff = 5000;
  function snapshot() {
    return {context_id: contextId, observed_at: observedAt, context: options.context(), controls: controls,
      capture: {mode:'subscriptions', subscribed:streams.filter(function (s) { return s.ready; }).length,
        expected:streams.length, recovery_interval_seconds:RECOVERY_MS / 1000, last_error:lastError}};
  }
  function emit() { if (!stopped) options.changed(snapshot()); }
  function valid(stream) {
    return !stopped && !stream.closed && stream.generation === generation && captured === signature(options.context());
  }
  function finishWaiting(error) { var list = waiting; waiting = []; list.forEach(function (done) { done(error); }); }
  function rebuild() {
    var next = {};
    catalog.entries.forEach(function (entry) {
      var group = groups[entry.category];
      if (!group) return;
      var control = makeControl(entry, group.descriptions[entry.key], group.values[entry.key], options.context(), options.describe);
      if (control) next[entry.id] = control;
    });
    controls = next; emit();
    if (streams.length && streams.every(function (stream) { return stream.ready; })) {
      backoff = 5000; lastError = null; finishWaiting();
    }
  }
  function closeStream(stream) {
    stream.closed = true;
    clearLater(stream.deadline); cancel(stream.request);
  }
  function invalidate(error) {
    generation += 1;
    streams.forEach(closeStream); streams = [];
    reads.forEach(function (r) { cancel(r.request); }); reads = []; checking = false;
    clearLater(restart); restart = null;
    captured = signature(options.context()); contextId = crypto.randomBytes(12).toString('hex'); observedAt = 0;
    Object.keys(controls).forEach(function (id) { controls[id].available = false; });
    finishWaiting(error || new Error('Settings context changed'));
    emit();
  }
  function failed(error) {
    lastError = String(error.message || error);
    invalidate(error);
    if (!stopped) {
      restart = later(function () { restart = null; begin(); }, backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
  function read(stream, callback) {
    var revision = stream.revision, record = {}, epoch = generation;
    reads.push(record);
    record.request = options.call(service, stream.method, stream.params, function (error, payload) {
      var index = reads.indexOf(record); if (index !== -1) reads.splice(index, 1);
      if (epoch !== generation || stopped) return;
      if (!valid(stream)) { if (callback) callback(); return; }
      if (error) { failed(error); return; }
      // A notification received during this request is newer than its response.
      if (revision === stream.revision) receive(stream, payload, true);
      if (callback && valid(stream)) callback();
    });
  }
  function syncValues(group) {
    var epoch = generation;
    [false, true].forEach(function (appSpecific) {
      if (epoch !== generation || stopped) return;
      var name = appSpecific ? 'app' : 'global';
      var keys = catalog.groups[group.category].filter(function (key) {
        var d = group.descriptions[key]; return d && (d.dbtype === 'M') === appSpecific;
      });
      var previous = group.streams[name];
      if (previous && signature(previous.params.keys) === signature(keys)) return;
      if (previous) { closeStream(previous); streams.splice(streams.indexOf(previous), 1); }
      group.streams[name] = null;
      if (!keys.length) return;
      var params = {category:group.category, keys:keys};
      if (appSpecific) params.current_app = true;
      group.streams[name] = watch(group, 'getSystemSettings', params);
    });
  }
  function receive(stream, payload, full) {
    if (!valid(stream)) return;
    var group = stream.group, list = stream.method === 'getSystemSettingDesc' ? descriptions(payload) : null;
    if ((stream.method === 'getSystemSettingDesc' && !list) ||
        (stream.method === 'getSystemSettings' && (!payload.settings || typeof payload.settings !== 'object'))) {
      // Subscription acknowledgements are not settings observations.
      if (payload.returnValue === false || full) failed(new Error(payload.errorText || 'No settings data received'));
      return;
    }
    stream.revision += 1;
    stream.ready = true; clearLater(stream.deadline);
    observedAt = clock();
    if (list) {
      if (full) group.descriptions = {};
      list.forEach(function (patch) {
        if (catalog.groups[group.category].indexOf(patch.key) !== -1) {
          group.descriptions[patch.key] = mergeDescription(group.descriptions[patch.key], patch);
        }
      });
      syncValues(group);
    } else {
      // Delta notifications can omit dimensions unrelated to the changed key.
      var dimension = Object.assign({}, stream.dimension || {}, payload.dimension || {});
      // Global notifications add app_id:"" even when the initial response omits
      // it. Only M-type/current_app streams have an application binding.
      var appId = stream.params.current_app ? (payload.app_id === undefined ? stream.app_id : payload.app_id) : undefined;
      var scopeChanged = stream.dimension && (signature(stream.dimension) !== signature(dimension) || stream.app_id !== appId);
      if (full || scopeChanged) stream.params.keys.forEach(function (key) { delete group.values[key]; });
      stream.dimension = dimension; stream.app_id = appId;
      Object.keys(payload.settings).forEach(function (key) {
        if (stream.params.keys.indexOf(key) !== -1) group.values[key] = {value:payload.settings[key],
          dimension:dimension, app_id:appId, observed_at:observedAt};
      });
      // A changed game genre/app can change the scope without changing HDMI mode.
      if (scopeChanged && !full) read(stream);
    }
    if (valid(stream)) rebuild();
  }
  function watch(group, method, params) {
    var stream = {group:group, method:method, params:params, generation:generation,
      ready:false, revision:0, closed:false, request:null};
    streams.push(stream);
    stream.deadline = later(function () {
      if (valid(stream) && !stream.ready) failed(new Error('Settings subscription timed out'));
    }, 5000);
    try {
      stream.request = service.subscribe(URI + method, Object.assign({}, params, {subscribe:true}));
      stream.request.on('response', function (message) {
        if (!valid(stream)) return;
        var payload = (message && message.payload) || message || {};
        if (payload.subscribed === false) { failed(new Error('TV declined a settings subscription')); return; }
        receive(stream, payload, !stream.ready);
      });
      function lost(error) { if (valid(stream)) failed(error instanceof Error ? error : new Error('Settings subscription lost')); }
      stream.request.on('error', lost); stream.request.on('cancel', lost);
    } catch (error) { if (valid(stream)) failed(error); }
    return stream;
  }
  function checkRecovery() {
    if (stopped || checking || !streams.length || !streams.every(function (s) { return s.ready; })) return;
    checking = true;
    var pending = streams.slice(), epoch = generation;
    function next() {
      if (stopped || epoch !== generation) return;
      var stream = pending.shift();
      if (!stream) { checking = false; return; }
      if (!valid(stream)) { next(); return; }
      read(stream, next);
    }
    next();
  }
  function begin(callback) {
    if (stopped) { if (callback) callback(new Error('Settings monitor stopped')); return; }
    started = true; invalidate(); groups = {}; lastError = null;
    if (callback) waiting.push(callback);
    if (recovery === null) recovery = every(checkRecovery, RECOVERY_MS);
    var epoch = generation;
    Object.keys(catalog.groups).forEach(function (category) {
      if (epoch !== generation || stopped) return;
      var group = {category:category, descriptions:{}, values:{}, streams:{}};
      groups[category] = group;
      watch(group, 'getSystemSettingDesc', {category:category, keys:catalog.groups[category]});
    });
  }
  return {
    snapshot:snapshot, refresh:begin,
    contextChanged:function () {
      if (captured === signature(options.context()) || stopped) return;
      invalidate();
      if (started) restart = later(function () { restart = null; begin(); }, 350);
    },
    start:function () { if (!started) begin(); },
    stop:function () { stopped = true; invalidate(new Error('Settings monitor stopped')); clearEvery(recovery); recovery = null; },
    description:function (control) { return groups[control.category] && groups[control.category].descriptions[control.key]; },
    generation:function () { return generation; },
    current:function () { return !stopped && captured === signature(options.context()); },
    update:function (control, description, response) {
      var group = groups[control.category];
      if (!group) return;
      streams.filter(function (stream) { return stream.group === group && stream.params.keys.indexOf(control.key) !== -1; })
        .forEach(function (stream) { stream.revision += 1; });
      group.descriptions[control.key] = description;
      observedAt = clock();
      group.values[control.key] = {value:response.settings[control.key], dimension:response.dimension || {},
        app_id:response.app_id, observed_at:observedAt};
      rebuild();
    }
  };
}
module.exports = {create:create, makeControl:makeControl, descriptions:descriptions, mergeDescription:mergeDescription};
