'use strict';

var observer = require('./settings-observer');
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
  return {cancel:function () {
    done = true; clearTimeout(timer);
    if (request && request.cancel) { try { request.cancel(); } catch (ignored) { /* Already closed. */ } }
  }};
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
  var monitor = observer.create(service, Object.assign({}, options, {describe:describe, call:call}));
  var writing = false;
  function write(command, callback, guard) {
    if (writing) { callback(failure('settings_busy', 'A setting change is already in progress')); return; }
    var control, description, value, epoch = monitor.generation(), captured = signature(options.context());
    function check() {
      if (guard) guard();
      if (!monitor.current() || command.context_id !== monitor.snapshot().context_id ||
          epoch !== monitor.generation() || captured !== signature(options.context())) {
        throw failure('stale_context', 'TV settings changed context; wait for refreshed controls');
      }
    }
    function done(error, result) { writing = false; callback(error, result); }
    try {
      command = normalize(command); check(); control = monitor.snapshot().controls[command.setting];
      if (!control || !control.available) throw failure('setting_unavailable', 'This setting is unavailable in the current TV context');
      encode(control, command.value);
    } catch (error) { callback(error); return; }
    writing = true;
    // A silent subscription is normal. Revalidate just the requested setting's
    // live permissions/range and binding before writing, instead of polling to
    // keep a 30-second cache-age deadline alive.
    call(service, 'getSystemSettingDesc', {category:control.category, keys:[control.key]}, function (error, response) {
      if (error) { done(error); return; }
      try {
        check();
        var patch = (observer.descriptions(response) || []).find(function (d) { return d.key === control.key; });
        if (!patch) throw failure('setting_unavailable', 'The TV no longer describes this setting');
        description = observer.mergeDescription(monitor.description(control), patch);
      } catch (invalid) { done(invalid); return; }
      var readParams = {category:control.category, keys:[control.key]};
      if (control.current_app) readParams.current_app = true;
      call(service, 'getSystemSettings', readParams, function (readError, current) {
        if (readError) { done(readError); return; }
        try {
          check();
          if (current.returnValue !== true) throw failure('setting_unavailable', 'The TV did not confirm the current setting');
          var fresh = observer.makeControl(control, description, {value:(current.settings || {})[control.key],
            dimension:current.dimension, app_id:current.app_id}, options.context(), describe);
          if (!fresh || !fresh.available) throw failure('setting_unavailable', 'This setting is unavailable in the current TV context');
          if (signature(fresh.dimension) !== signature(control.dimension) || fresh.app_id !== control.app_id ||
              fresh.current_app !== control.current_app) throw failure('stale_context', 'TV setting scope changed before the write');
          value = encode(fresh, command.value);
          monitor.update(control, description, current);
          control = fresh;
          check();
        } catch (invalid) { done(invalid); return; }
        var params = {category:control.category, settings:{}, store:true, notify:true};
        params.settings[control.key] = value;
        if (control.dimensions.length) params.dimension = control.dimension;
        if (control.current_app) params.app_id = control.app_id;
        executor.executeOne(service, {kind:'user_setting', params:params}, function (writeError) {
          var verify = {category:control.category, keys:[control.key]};
          if (control.dimensions.length) verify.dimension = control.dimension;
          if (control.current_app) verify.app_id = control.app_id;
          call(service, 'getSystemSettings', verify, function (verifyError, actual) {
            var actualValue = actual && actual.settings && actual.settings[control.key];
            if (!verifyError && (!actual || actual.returnValue !== true || String(actualValue) !== String(value) ||
                control.dimensions.some(function (key) { return !actual.dimension || actual.dimension[key] !== control.dimension[key]; }))) {
              verifyError = failure('readback_failed', 'TV did not retain the requested setting');
            }
            // Picture-mode writes can legitimately change context before the
            // scoped readback. Never apply that readback to a newer cache.
            if (epoch === monitor.generation() && monitor.current() && actual && actual.returnValue === true) {
              monitor.update(control, description, actual);
            }
            done(writeError || verifyError, {setting:control.id, value:actualValue, backend:'root_luna'});
          });
        });
      });
    });
  }
  return {snapshot:monitor.snapshot, write:write, refresh:monitor.refresh,
    contextChanged:monitor.contextChanged, start:monitor.start, stop:monitor.stop};
}

module.exports = {create: create, describe: describe, normalize: normalize, encode: encode, call: call};
