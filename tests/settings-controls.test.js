'use strict';
var assert = require('assert');
var controls = require('../app/bridge/lib/settings-controls');
var catalog = require('../app/bridge/lib/settings-catalog');
var mqtt = require('../app/bridge/lib/mqtt-settings');
var EventEmitter = require('events').EventEmitter;
module.exports = async function () {
  var boostEntry = catalog.entries.find(e => e.key === 'enable144HzBooster');
  var boostDesc = {dataType:'string',vtype:'ArrayExt',dimension:['gameInput'],
    ui:{visible:true,active:true},values:{arrayExt:[{value:'off',visible:true,active:true},{value:'on',visible:true,active:true}]}};
  ['165','144',undefined].forEach(function (rate) {
    var control = controls.describe(boostEntry,Object.assign({},boostDesc,{condition:{panelOutputFrameRate:rate}}),'off');
    var label = rate ? rate+' Hz boost' : 'Refresh rate boost';
    assert.strictEqual(control.label,label);
    var discovery = mqtt.discovery({device_name:'TV',mqtt:{topic_prefix:'lg',discovery_prefix:'homeassistant'}},'test','session',
      {context_id:'a'.repeat(24),controls:{[control.id]:control}})[0].payload;
    assert.strictEqual(discovery.name,'Gaming / HDMI: '+label);
    assert.strictEqual(discovery.unique_id,'test_setting_other_enable144HzBooster','Rate labels must not rename entity identities');
  });
  var context = {input: 'hdmi3', mode: 'filmMaker', range: 'sdr', ready: true};
  var value = '3', writes = [], failWrite = false, ignoreWrite = false, delayed = null, reportedInput = null;
  var desc = {key: 'backlight', category: 'picture', dataType: 'string', vtype: 'Range', dbtype: 'G',
    ui: {visible: true, active: true}, values: {range: {min: 0, max: 100, interval: 1}}, dimension: ['input', 'pictureMode']};
  var motionValue = 'off';
  var judder = {key: 'truMotionJudder', category: 'picture', dataType: 'string', vtype: 'Range', dbtype: 'G',
    ui: {visible: true, active: true}, values: {range: {min: 0, max: 10, interval: 1}}, dimension: ['input', 'pictureMode']};
  var motion = {key: 'truMotionMode', category: 'picture', dataType: '', vtype: 'ArrayExt', dbtype: 'M',
    ui: {visible: true, active: true}, values: {arrayExt: [{value:'off',visible:true,active:true},{value:'user',visible:true,active:true},
      {value:'hidden',visible:false,active:true}]}, dimension: ['input', 'pictureMode']};
  function responseFor(uri, params) {
    var response = {returnValue: true};
    if (uri.endsWith('getSystemSettingDesc')) response = {returnValue: false, results: params.category === 'picture' ? [desc, motion, judder] : []};
    else if (uri.endsWith('setSystemSettings')) {
      writes.push(params);
      if (failWrite) response = {returnValue: false, errorText: 'denied'};
      else if (!ignoreWrite && params.settings.backlight !== undefined) value = params.settings.backlight;
    } else if (params.category === 'picture') {
      response = {returnValue: true, dimension: {input: reportedInput || context.input, pictureMode: context.mode}, settings: {}};
      if (params.current_app || params.app_id) { response.app_id = 'com.webos.app.hdmi3'; response.settings.truMotionMode = motionValue; }
      else { response.settings.backlight = value; response.settings.truMotionJudder = '0'; }
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
  // HA sends back the dimension it last showed for the control (this.attributes.dimension).
  function shown() { return monitor.snapshot().controls.picture_backlight.dimension; }
  function write(v, target) { return new Promise(function(resolve,reject) {
    monitor.write({setting:'picture_backlight',value:v,target:target||shown()}, function(e,r) {if(e)reject(e);else resolve(r);}, function(){});
  }); }
  try {
    await refresh();
    assert.strictEqual(monitor.snapshot().controls.picture_backlight.value,3);
    assert.deepStrictEqual(monitor.snapshot().controls.picture_truMotionMode.options,['off','user']);
    assert.strictEqual(monitor.snapshot().controls.picture_truMotionJudder.available,false,'De-judder needs TruMotion User Selection');
    motionValue = 'user'; monitor.contextChanged(); await refresh();
    assert.strictEqual(monitor.snapshot().controls.picture_truMotionJudder.available,true);
    motionValue = 'off'; monitor.contextChanged(); await refresh();
    assert.strictEqual(monitor.snapshot().controls.picture_truMotionJudder.available,false);
    var changed = await write(4);
    assert.strictEqual(changed.value,'4');
    assert.strictEqual(changed.previous_value,'3');
    assert.strictEqual(changed.kind,'user_setting');
    assert.deepStrictEqual(changed.target,{category:'picture',dimension:{input:'hdmi3',pictureMode:'filmMaker'}});
    assert.strictEqual(writes[0].settings.backlight,'4','Preserve the TV string type');
    assert.deepStrictEqual(writes[0].dimension,{input:'hdmi3',pictureMode:'filmMaker'});
    assert.strictEqual((await write(5,{pictureMode:'filmMaker',input:'hdmi3'})).value,'5','Attribute key order does not matter');
    var before = writes.length;
    await assert.rejects(write(6,{input:'hdmi4',pictureMode:'filmMaker'}),/context/,'A write for a scope HA no longer shows is stale');
    assert.strictEqual(writes.length,before,'A stale scope never reaches the TV');
    [undefined,null,[],'hdmi3',{input:3},{input:{nested:'x'}},{input:'a b'},{a:'1',b:'2',c:'3',d:'4',e:'5',f:'6',g:'7'}].forEach(function (target) {
      assert.throws(function(){controls.normalize({setting:'picture_backlight',value:'4',target:target});},/discovered TV setting/,JSON.stringify(target));
    });
    assert.throws(function(){controls.normalize({setting:'picture_backlight',value:'4',target:{},context_id:'a'.repeat(24)});},/discovered TV setting/,'Old context-id commands are refused');
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
    assert.throws(function(){controls.normalize({setting:'option_password_ipcontrol',value:'x',target:{}});});
    var old = shown();
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
    assert.strictEqual(discovered.length,3);
    assert.strictEqual(discovered[0].payload.optimistic,false);
    assert.strictEqual(discovered[0].payload.retain,false);
    assert.ok(!discovered[0].payload.command_template.includes(monitor.snapshot().context_id),'Discovery carries no context id');
    assert.ok(discovered[0].payload.command_template.includes("'target': (this.attributes.dimension if this.attributes.dimension is mapping else {})"));
    monitor.contextChanged(); await refresh();
    assert.deepStrictEqual(mqtt.discovery(config,'test','session',monitor.snapshot()),discovered,'A context change does not republish discovery');
    assert.ok(discovered[0].payload.availability.length === 2);
    assert.ok(!catalog.entries.some(function(e) {return /whiteBalance|colorManagement|Reset|password|update|factory/i.test(e.key);}));
    assert.ok(!catalog.entries.some(function(e) {return ['option','general'].includes(e.category);}));
    assert.ok(mqtt.tombstones(config,'test').includes('homeassistant/select/test_setting_option_pointerSize/config'));
    catalog.retiredIds.forEach(function (id) {
      assert.throws(function () { controls.normalize({setting:id,value:'on',target:{}}); },
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
