'use strict';

var crypto = require('crypto');
var catalog = require('./settings-catalog');
var executor = require('./luna-executor');
var URI = 'luna://com.webos.settingsservice/';
function failure(code, message) { var e = new Error(message); e.code = code; return e; }
function signature(context) { return JSON.stringify(context || null); }
function call(service, method, params, callback) {
  var done = false, request;
  var timer = setTimeout(function () {
    if (done) return; done = true;
    if (request && request.cancel) { try { request.cancel(); } catch (ignored) { /* Best effort. */ } }
    callback(failure('settings_timeout', 'TV settings request timed out'));
  }, 5000);
  try {
    request = service.call(URI + method, params, function (message) {
      if (done) return; done = true; clearTimeout(timer);
      callback(null, (message && message.payload) || message || {});
    });
  } catch (error) { if (!done) { done = true; clearTimeout(timer); callback(error); } }
}
function describe(entry, description, value) {
  if (!description || value === undefined || value === null || typeof value === 'object') return null;
  var d = description, values = d.values || {}, result = Object.assign({}, entry);
  if (['', 'string', 'int', 'boolean'].indexOf(d.dataType) === -1) return null;
  result.dimensions = d.dimension || [];
  result.current_app = d.dbtype === 'M';
  result.available = Boolean(d.ui && d.ui.visible === true && d.ui.active === true);
  result.data_type = d.dataType;
  if (d.vtype === 'Range' && values.range && !Array.isArray(values.range)) {
    var r = values.range;
    if (![r.min, r.max, r.interval].every(function (n) { return typeof n === 'number' && isFinite(n); }) ||
        r.min >= r.max || r.interval <= 0 || !isFinite(Number(value))) return null;
    result.component = 'number'; result.min = r.min; result.max = r.max; result.step = r.interval;
    result.value = Number(value);
    if (result.value < r.min || result.value > r.max) result.available = false;
  } else if (d.vtype === 'ArrayExt' && Array.isArray(values.arrayExt)) {
    result.choices = values.arrayExt.filter(function (v) {
      return v.visible === true && v.active === true && ['string', 'boolean', 'number'].indexOf(typeof v.value) !== -1;
    }).map(function (v) { return v.value; });
    if (!result.choices.length) return null;
    result.component = 'select'; result.options = result.choices.map(String); result.value = String(value);
    if (result.options.indexOf(result.value) === -1) result.available = false;
  } else return null;
  result.raw_value = value;
  return result;
}
function normalize(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) ||
      Object.keys(command).some(function (key) { return ['setting', 'value', 'context_id'].indexOf(key) === -1; }) ||
      !catalog.entries.some(function (e) { return e.id === command.setting; }) ||
      typeof command.context_id !== 'string' || !/^[a-f0-9]{24}$/.test(command.context_id) ||
      ['string', 'number', 'boolean'].indexOf(typeof command.value) === -1 || String(command.value).length > 100) {
    throw failure('invalid_setting', 'Select a discovered TV setting and its current context');
  }
  return {setting: command.setting, value: command.value, context_id: command.context_id};
}
function encode(control, value) {
  if (control.component === 'number') {
    if (typeof value === 'boolean' || String(value).trim() === '') throw failure('invalid_value', 'A number is required');
    var n = Number(value), steps = (n - control.min) / control.step;
    if (!isFinite(n) || n < control.min || n > control.max || Math.abs(steps - Math.round(steps)) > 0.00001) {
      throw failure('invalid_value', 'Value is outside the TV setting range');
    }
    return control.data_type === 'int' || typeof control.raw_value === 'number' ? n : String(n);
  }
  var i = control.options.indexOf(String(value));
  if (i === -1) throw failure('invalid_value', 'This option is unavailable in the current TV context');
  return control.choices[i];
}
function create(service, options) {
  var controls = {}, contextId = null, currentSignature = null, observedAt = 0;
  var stopped = false, polling = false, pending = false, timer = null, interval = null;
  var writing = false, generation = 0, requestedSignature = null;
  function snapshot() { return {context_id: contextId, observed_at: observedAt,
    context: options.context(), controls: controls}; }
  function emit() { if (!stopped) options.changed(snapshot()); }
  function invalidate() {
    contextId = crypto.randomBytes(12).toString('hex'); observedAt = 0; generation += 1;
    Object.keys(controls).forEach(function (id) { controls[id].available = false; }); emit();
  }
  function refresh(callback) {
    if (stopped) { if (callback) callback(failure('stopped', 'Settings monitor stopped')); return; }
    if (polling) { pending = true; if (callback) callback(failure('settings_busy', 'Settings are refreshing; retry shortly')); return; }
    polling = true;
    var captured = signature(options.context()), epoch = generation, next = {}, categories = Object.keys(catalog.groups);
    function finish(error) {
      polling = false;
      if (!stopped && epoch === generation && captured === signature(options.context())) {
        controls = next; observedAt = error ? 0 : Date.now();
        if (!contextId || currentSignature !== captured) contextId = crypto.randomBytes(12).toString('hex');
        currentSignature = captured; emit();
      }
      if (callback) callback(error);
      if (pending) { pending = false; schedule(); }
    }
    function category(index) {
      if (stopped || epoch !== generation || captured !== signature(options.context())) { finish(failure('stale_context', 'TV context changed')); return; }
      if (index >= categories.length) { finish(); return; }
      var cat = categories[index], keys = catalog.groups[cat];
      call(service, 'getSystemSettingDesc', {category: cat, keys: keys}, function (error, response) {
        if (error) { finish(error); return; }
        var descriptions = {};
        // A mixed request can return partial results with returnValue:false.
        (response.results || []).forEach(function (d) { if (keys.indexOf(d.key) !== -1) descriptions[d.key] = d; });
        function read(appSpecific) {
          var selected = keys.filter(function (key) { return descriptions[key] && (descriptions[key].dbtype === 'M') === appSpecific; });
          if (!selected.length) { if (!appSpecific) read(true); else category(index + 1); return; }
          var params = {category: cat, keys: selected};
          if (appSpecific) params.current_app = true;
          call(service, 'getSystemSettings', params, function (readError, values) {
            if (readError) { finish(readError); return; }
            catalog.entries.filter(function (e) { return e.category === cat; }).forEach(function (entry) {
              if (selected.indexOf(entry.key) === -1) return;
              var control = describe(entry, descriptions[entry.key], (values.settings || {})[entry.key]);
              if (!control) return;
              control.dimension = {};
              if (appSpecific) { control.app_id = values.app_id; if (!control.app_id) control.available = false; }
              control.dimensions.forEach(function (key) {
                if (values.dimension && values.dimension[key] !== undefined) control.dimension[key] = values.dimension[key];
                else control.available = false;
              });
              var ctx = options.context();
              if (cat === 'picture' || control.dimensions.length || appSpecific) {
                if (!ctx || !ctx.ready || !ctx.input || !/^hdmi[1-4](?:_pc)?$/.test(ctx.input)) control.available = false;
              }
              next[entry.id] = control;
            });
            if (!appSpecific) read(true); else category(index + 1);
          });
        }
        read(false);
      });
    }
    category(0);
  }
  function schedule() { clearTimeout(timer); if (!stopped) timer = setTimeout(refresh, 350); }
  function write(command, callback, guard) {
    if (writing) { callback(failure('settings_busy', 'A setting change is already in progress')); return; }
    var control, value, captured = signature(options.context()), epoch = generation;
    function check() {
      if (guard) guard();
      if (stopped || command.context_id !== contextId || epoch !== generation ||
          captured !== currentSignature || captured !== signature(options.context()) || Date.now() - observedAt > 30000) {
        throw failure('stale_context', 'TV settings changed context; wait for refreshed controls');
      }
    }
    try {
      command = normalize(command); check(); control = controls[command.setting];
      if (!control || !control.available) throw failure('setting_unavailable', 'This setting is unavailable in the current TV context');
      value = encode(control, command.value);
    } catch (error) { callback(error); return; }
    writing = true;
    var params = {category: control.category, settings: {}, store: true, notify: true};
    params.settings[control.key] = value;
    if (control.dimensions.length) params.dimension = control.dimension;
    if (control.current_app) params.app_id = control.app_id;
    try { check(); } catch (error) { writing = false; callback(error); return; }
    executor.executeOne(service, {kind: 'user_setting', params: params}, function (error) {
      if (error) { writing = false; callback(error); schedule(); return; }
      var readParams = {category: control.category, keys: [control.key]};
      if (control.dimensions.length) readParams.dimension = control.dimension;
      if (control.current_app) readParams.app_id = control.app_id;
      call(service, 'getSystemSettings', readParams, function (readError, response) {
        writing = false;
        var actual = response && response.settings && response.settings[control.key];
        if (!readError && (!response || response.returnValue !== true || String(actual) !== String(value))) {
          readError = failure('readback_failed', 'TV did not retain the requested setting');
        }
        // A mode change legitimately invalidates this snapshot. The readback is
        // explicitly scoped to the original target, never the next input.
        callback(readError, {setting: control.id, value: actual, backend: 'root_luna'});
        schedule();
      });
    });
  }
  return {snapshot: snapshot, write: write, refresh: refresh,
    contextChanged: function () {
      var next = signature(options.context());
      if (next !== requestedSignature) { requestedSignature = next; invalidate(); schedule(); }
    },
    start: function () { stopped = false; requestedSignature = signature(options.context()); invalidate(); refresh(); interval = setInterval(refresh, 10000); },
    stop: function () { stopped = true; generation += 1; clearTimeout(timer); clearInterval(interval); }};
}
module.exports = {create: create, describe: describe, normalize: normalize, encode: encode, call: call};
