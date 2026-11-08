'use strict';

var fs = require('fs');
var path = require('path');
var configStore = require('./config-store');

// Turns LG's CEC device list (cec-inventory) into one power state per source.
//
// LG's CEC stack keeps that list current itself: a waking device announces
// itself and reports transitionToOn, then On; a device in standby reports Off;
// a device that stops answering LG's polls is dropped (a Nintendo Switch 2
// leaves the list 13–33 s after it sleeps). So a known device that is missing
// is off. Devices are remembered by OSD name in the state directory, so a
// sleeping Switch 2 keeps its entity across restarts. A waking device can
// appear unnamed for a few seconds; it is matched by logical and physical
// address. Nothing here polls or sends CEC.
var AWAKE = {on: true, turning_on: true}, ASLEEP = {standby: true, turning_off: true};
var LIMIT = 16;

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
function fileStore(file) {
  file = file || path.join(configStore.stateDir(), 'cec-devices.json');
  return {
    load: function () {
      try { var value = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(value.devices) ? value.devices : []; }
      catch (error) { return []; }
    },
    save: function (devices) {
      var temporary = file + '.tmp-' + process.pid;
      if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), 448);
      fs.writeFileSync(temporary, JSON.stringify({devices: devices}, null, 2) + '\n', {mode: 384});
      fs.renameSync(temporary, file);
    }
  };
}
function valid(entry) {
  return entry && typeof entry.key === 'string' && /^[a-z0-9_]{1,40}$/.test(entry.key) && typeof entry.name === 'string';
}
function create(options) {
  options = options || {};
  var store = options.store || fileStore();
  var clock = options.now || Date.now;
  var known = [];
  try { known = store.load().filter(valid).slice(0, LIMIT); } catch (error) { known = []; }
  var states = {};
  function remember(device) {
    var key = slug(device.osd_name);
    if (!key) return null;
    var entry = known.filter(function (item) { return item.key === key; })[0];
    var fields = {name: device.osd_name, vendor_id: device.vendor_id || null, input: device.input,
      logical_address: device.logical_address, physical_address: device.physical_address};
    if (!entry) {
      if (known.length >= LIMIT) return null;
      entry = {key: key};
      known.push(entry);
    } else if (Object.keys(fields).every(function (k) { return entry[k] === fields[k] || (k === 'vendor_id' && !fields[k]); })) {
      return entry;
    }
    Object.keys(fields).forEach(function (k) { if (k !== 'vendor_id' || fields[k]) entry[k] = fields[k]; });
    try { store.save(known); } catch (error) { /* The entity still works until the next restart. */ }
    return entry;
  }
  function matching(device) {
    // An unnamed record is the same device only at the same logical and physical address.
    return known.filter(function (item) {
      return item.logical_address === device.logical_address && item.physical_address === device.physical_address &&
        item.input === device.input;
    })[0] || null;
  }
  // Returns {changed, added}. added lists keys seen for the first time (they need discovery).
  function observe(inventory) {
    var before = known.map(function (item) { return item.key; });
    var seen = {};
    var available = inventory && inventory.state === 'observed';
    if (available) {
      (inventory.devices || []).forEach(function (device) {
        var entry = device.osd_name ? remember(device) : matching(device);
        if (entry && !seen[entry.key]) seen[entry.key] = device;
      });
    }
    var changed = false;
    known.forEach(function (entry) {
      var previous = states[entry.key] || {awake: null};
      var device = seen[entry.key];
      var next;
      if (!available) next = {awake: null, present: null, power: null};
      else if (!device) next = {awake: false, present: false, power: 'absent'};
      else next = {awake: AWAKE[device.power] ? true : ASLEEP[device.power] ? false : (previous.awake === null ? null : previous.awake),
        present: true, power: device.power};
      if (next.awake !== previous.awake || next.present !== previous.present || next.power !== previous.power) {
        changed = true;
        next.changed_at = next.awake !== previous.awake || !previous.changed_at ? new Date(clock()).toISOString() : previous.changed_at;
        states[entry.key] = next;
      }
    });
    var added = known.map(function (item) { return item.key; }).filter(function (key) { return before.indexOf(key) < 0; });
    return {changed: changed || added.length > 0, added: added};
  }
  function snapshot() {
    var devices = {};
    known.forEach(function (entry) {
      var state = states[entry.key] || {awake: null, present: null, power: null, changed_at: null};
      devices[entry.key] = {name: entry.name, awake: state.awake, present: state.present, power: state.power,
        changed_at: state.changed_at || null, input: entry.input, logical_address: entry.logical_address,
        physical_address: entry.physical_address, vendor_id: entry.vendor_id || null};
    });
    return {devices: devices};
  }
  return {observe: observe, snapshot: snapshot, known: function () { return JSON.parse(JSON.stringify(known)); }};
}
module.exports = {create: create, fileStore: fileStore, slug: slug};
