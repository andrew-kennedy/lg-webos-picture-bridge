'use strict';

// EIM reports cached discovery, NOT the selected route of an external HDMI switch.
function extract(payload) {
  if (!payload || payload.returnValue !== true || !Array.isArray(payload.devices)) throw new Error('Invalid CEC inventory response');
  var result = [];
  payload.devices.slice(0, 16).forEach(function (port) {
    var match = /^HDMI_([1-4])$/.exec(port.id || '');
    if (!match || !Array.isArray(port.subList)) return;
    port.subList.slice(0, 32).forEach(function (device) {
      if (!device || device.id !== 'SIMPLINK' || Number(device.portId) !== Number(match[1])) return;
      function number(value, max) {
        var n = Number(value);
        return value !== null && value !== undefined && value !== '' && isFinite(n) && Math.floor(n) === n && n >= 0 && n <= max ? n : null;
      }
      result.push({input: 'hdmi' + match[1], vendor_id: number(device.vendorId, 16777215),
        osd_name: typeof device.osdName === 'string' ? device.osdName.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64) : null,
        device_type: number(device.cecpDevType, 7), physical_address: number(device.physicalAddress, 65535),
        logical_address: number(device.uniqueId, 15)});
    });
  });
  return result;
}
function create(service, changed, deps) {
  deps = deps || {};
  var schedule = deps.setInterval || setInterval, cancel = deps.clearInterval || clearInterval;
  var later = deps.setTimeout || setTimeout, cancelLater = deps.clearTimeout || clearTimeout;
  var stopped = false, timer = null, pending = false, request = null, timeout = null, generation = 0;
  var state = {devices: [], state: 'starting', observed_at: null,
    interpretation: 'cached_cec_discovery_not_hdmi_switch_route', last_error: null};
  function poll() {
    if (stopped || pending) return;
    pending = true;
    var epoch = ++generation;
    function finish(error, payload) {
      if (stopped || epoch !== generation) return;
      generation++; pending = false; cancelLater(timeout); timeout = null;
      if (!error) { try { state.devices = extract(payload); } catch (e) { error = e; } }
      state.state = error ? 'unavailable' : 'observed';
      state.last_error = error ? String(error.message).slice(0, 256) : null;
      if (error) state.devices = []; else state.observed_at = new Date().toISOString();
      changed(JSON.parse(JSON.stringify(state)));
    }
    timeout = later(function () {
      if (request && request.cancel) { try { request.cancel(); } catch (ignored) {} }
      finish(new Error('CEC inventory request timed out'));
    }, 5000);
    try {
      request = service.call('luna://com.webos.service.eim/getAllInputStatus', {}, function (message) {
        finish(null, message.payload || message);
      });
    } catch (error) { finish(error); }
  }
  return {start: function () { poll(); timer = schedule(poll, 30000); },
    stop: function () { stopped = true; generation++; cancel(timer); cancelLater(timeout);
      if (request && request.cancel) { try { request.cancel(); } catch (ignored) {} } }};
}
module.exports = {extract: extract, create: create};
