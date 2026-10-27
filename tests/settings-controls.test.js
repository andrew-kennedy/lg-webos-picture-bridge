'use strict';
var assert = require('assert');
var controls = require('../app/bridge/lib/settings-controls');
var catalog = require('../app/bridge/lib/settings-catalog');
var mqtt = require('../app/bridge/lib/mqtt-settings');
var EventEmitter = require('events').EventEmitter;
module.exports = async function () {
  var context = {input: 'hdmi3', mode: 'filmMaker', range: 'sdr', ready: true};
  var value = '3', writes = [], failWrite = false, ignoreWrite = false, delayed = null, reportedInput = null;
  var desc = {key: 'backlight', category: 'picture', dataType: 'string', vtype: 'Range', dbtype: 'G',
    ui: {visible: true, active: true}, values: {range: {min: 0, max: 100, interval: 1}}, dimension: ['input', 'pictureMode']};
  var motion = {key: 'truMotionMode', category: 'picture', dataType: '', vtype: 'ArrayExt', dbtype: 'M',
    ui: {visible: true, active: true}, values: {arrayExt: [{value:'off',visible:true,active:true},{value:'user',visible:true,active:true},
      {value:'hidden',visible:false,active:true}]}, dimension: ['input', 'pictureMode']};
  function responseFor(uri, params) {
    var response = {returnValue: true};
    if (uri.endsWith('getSystemSettingDesc')) response = {returnValue: false, results: params.category === 'picture' ? [desc, motion] : []};
    else if (uri.endsWith('setSystemSettings')) {
      writes.push(params);
      if (failWrite) response = {returnValue: false, errorText: 'denied'};
      else if (!ignoreWrite && params.settings.backlight !== undefined) value = params.settings.backlight;
    } else if (params.category === 'picture') {
      response = {returnValue: true, dimension: {input: reportedInput || context.input, pictureMode: context.mode}, settings: {}};
      if (params.current_app || params.app_id) { response.app_id = 'com.webos.app.hdmi3'; response.settings.truMotionMode = 'off'; }
      else response.settings.backlight = value;
    }
    return response;
  }
  var service = {call: function (uri, params, callback) {
    var response = responseFor(uri, params);
    var respond = function () { callback({payload: response}); };
    if (delayed) delayed.push(respond); else respond();
    return {cancel: function () {}};
  }, subscribe:function (uri, params) {
    var sub = new EventEmitter(), response = responseFor(uri, params);
    sub.cancel = function () { sub.emit('cancel'); };
    response.subscribed = true;
    var respond = function () { sub.emit('response', {payload:response}); };
    if (delayed) delayed.push(respond); else process.nextTick(respond);
    return sub;
  }};
  var monitor = controls.create(service, {context: function () { return context; }, changed: function () {}});
  function refresh() { return new Promise(function (resolve,reject) { monitor.refresh(function(e) { if(e)reject(e);else resolve(); }); }); }
  function write(v, id) { return new Promise(function(resolve,reject) {
    monitor.write({setting:'picture_backlight',value:v,context_id:id||monitor.snapshot().context_id}, function(e,r) {if(e)reject(e);else resolve(r);}, function(){});
  }); }
  try {
    await refresh();
    assert.strictEqual(monitor.snapshot().controls.picture_backlight.value,3);
    assert.deepStrictEqual(monitor.snapshot().controls.picture_truMotionMode.options,['off','user']);
    var changed = await write(4);
    assert.strictEqual(changed.value,'4');
    assert.strictEqual(changed.previous_value,'3');
    assert.strictEqual(changed.kind,'user_setting');
    assert.deepStrictEqual(changed.target,{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}});
    assert.strictEqual(writes[0].settings.backlight,'4','Preserve the TV string type');
    assert.deepStrictEqual(writes[0].dimension,{input:'hdmi3',pictureMode:'filmMaker'});
    await assert.rejects(write(101),/outside/);
    await assert.rejects(write(3.5),/outside/);
    await assert.rejects(write(true),/number/);
    desc.ui.active = false;
    await assert.rejects(write(4), /unavailable/, 'Preflight must recheck current TV applicability');
    desc.ui.active = true;
    var written = writes.length;
    reportedInput = 'hdmi4';
    await assert.rejects(write(4),/unavailable|scope changed/, 'A missed input notification cannot authorize a write to the cached input');
    reportedInput = null;
    assert.strictEqual(writes.length,written);
    desc.values.range.max = 10;
    await assert.rejects(write(20),/outside/, 'Preflight must enforce a changed native range');
    desc.values.range.max = 100;
    assert.throws(function(){controls.normalize({setting:'option_password_ipcontrol',value:'x',context_id:'a'.repeat(24)});});
    var old = monitor.snapshot().context_id;
    context = {input:'hdmi1_pc',mode:'game',range:'sdrALLM',ready:true};
    await assert.rejects(write(20,old),/context/,'Route changes must reject commands before the next refresh');
    monitor.contextChanged(); await refresh();
    await assert.rejects(write(20,old),/context/);
    failWrite = true; await assert.rejects(write(20),/denied/); failWrite = false;
    ignoreWrite = true; await assert.rejects(write(20),/retain/); ignoreWrite = false;
    context.ready = false; monitor.contextChanged(); await refresh();
    await assert.rejects(write(20),/unavailable/);
    context.ready = true; monitor.contextChanged(); await refresh();
    var config = {device_name:'G6',mqtt:{topic_prefix:'lg',discovery_prefix:'homeassistant'}};
    var discovered = mqtt.discovery(config,'test','session',monitor.snapshot());
    assert.strictEqual(discovered.length,2);
    assert.strictEqual(discovered[0].payload.optimistic,false);
    assert.strictEqual(discovered[0].payload.retain,false);
    assert.ok(discovered[0].payload.command_template.includes(monitor.snapshot().context_id));
    assert.ok(discovered[0].payload.availability.length === 2);
    assert.ok(!catalog.entries.some(function(e) {return /whiteBalance|colorManagement|Reset|password|update|factory/i.test(e.key);}));
    assert.ok(!catalog.entries.some(function(e) {return ['option','general'].includes(e.category);}));
    assert.ok(mqtt.tombstones(config,'test').includes('homeassistant/select/test_setting_option_pointerSize/config'));
    catalog.retiredIds.forEach(function (id) {
      assert.throws(function () { controls.normalize({setting:id,value:'on',context_id:monitor.snapshot().context_id}); },
        /discovered TV setting/, 'A removed control cannot be changed by an old MQTT command: ' + id);
    });
    // A response from a previous input must not become the new control snapshot.
    delayed = []; var poll = refresh().catch(function(e){return e;});
    context.input = 'hdmi4'; monitor.contextChanged();
    while(delayed.length) delayed.shift()();
    assert.ok((await poll) instanceof Error);
    assert.strictEqual(monitor.snapshot().observed_at,0);
  } finally {monitor.stop();}
};
