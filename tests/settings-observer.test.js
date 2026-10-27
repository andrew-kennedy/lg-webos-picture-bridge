'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var observer = require('../app/bridge/lib/settings-observer');
var controls = require('../app/bridge/lib/settings-controls');
var fakeClock = require('./fake-clock');
var banks = require('../app/bridge/lib/profile-banks');

module.exports = function () {
  var clock = fakeClock(), subscriptions = [], reads = [], deferred = false, pending = [], failSubscribe = false;
  var context = {input:'hdmi3', mode:'filmMaker', range:'sdr', ready:true};
  var values = {backlight:'3',contrast:'95',truMotionMode:'off',autoVolume:'off',blackStabilizer:10};
  values.blackLevel = {ntsc:'auto',pal:'auto'};
  function desc(category, key, app) {
    var numeric = ['backlight','contrast','blackStabilizer'].includes(key);
    return {category:category,key:key,dbtype:app?'M':'G',dataType:numeric?'int':'string',
      dimension:category==='picture'?['input','pictureMode']:key==='blackStabilizer'?['gameInput','gameGenre']:[],
      ui:{active:true,visible:true},vtype:numeric?'Range':'ArrayExt',
      values:numeric?{range:{min:0,max:100,interval:1}}:
        {arrayExt:[{value:'off',active:true,visible:true},{value:'on',active:true,visible:true}]}};
  }
  var descriptions = {picture:[desc('picture','backlight'),desc('picture','contrast'),desc('picture','truMotionMode',true)],
    sound:[desc('sound','autoVolume')],other:[desc('other','blackStabilizer')]};
  descriptions.picture.push(desc('picture','blackLevel'));
  function response(method, params) {
    if (method.endsWith('getSystemSettingDesc')) return {returnValue:false,subscribed:true,results:descriptions[params.category]};
    var r = {returnValue:true,subscribed:true,settings:{},dimension:params.category==='picture'?
      {input:context.input,pictureMode:context.mode}:params.category==='other'?{gameInput:context.input,gameGenre:'Standard'}:{}};
    if (params.current_app) r.app_id='com.webos.app.'+context.input;
    params.keys.forEach(function (key) { if (values[key]!==undefined) r.settings[key]=values[key]; });
    return r;
  }
  var service = {subscribe:function (method, params) {
    if (failSubscribe && method.endsWith('getSystemSettings')) { failSubscribe=false;throw new Error('Subscription connection failed'); }
    var sub = new EventEmitter(), record = {method:method,params:params,sub:sub,cancelled:false};
    subscriptions.push(record);
    sub.cancel = function () { record.cancelled=true; sub.emit('cancel'); };
    clock.setTimeout(function () { sub.emit('response',{payload:response(method,params)}); },0);
    return sub;
  }};
  var monitor = observer.create(service,Object.assign({},clock,{context:function () { return context; },
    observationKeys:banks.observationKeys,observation:banks.observation,
    changed:function () {},describe:controls.describe,call:function (unused,method,params,done) {
      var r={method:method,params:params,reply:response(method,params),cancelled:false}; reads.push(r);
      if (deferred) pending.push(function () { done(null,r.reply); }); else done(null,r.reply);
      return {cancel:function () { r.cancelled=true; }};
    }}));
  function active(method,category,app) { return subscriptions.filter(function (s) {
    return !s.cancelled && s.method.endsWith(method) && s.params.category===category && Boolean(s.params.current_app)===Boolean(app);
  }).at(-1); }
  function notify(stream,payload) { stream.sub.emit('response',{payload:payload}); }
  function backlight() { return monitor.snapshot().controls.picture_backlight; }
  try {
    monitor.start();clock.tick(0);
    assert.strictEqual(subscriptions.length,7);
    assert.strictEqual(monitor.snapshot().capture.subscribed,7);
    assert.strictEqual(backlight().value,3,'Useful partial batches are accepted even with returnValue:false');
    assert.ok(!monitor.snapshot().controls.picture_blackLevel,'Observation-only settings add no UI entities');
    assert.deepStrictEqual(monitor.snapshot().observations.find(function(v){return v.key==='blackLevel';}).value,values.blackLevel);
    assert.strictEqual(monitor.snapshot().observations.find(function(v){return v.key==='truMotionMode';}).target.app_id,'com.webos.app.hdmi3');
    clock.tick(299999);
    assert.strictEqual(reads.length,0,'Quiet streams need no ten-second polling');
    assert.strictEqual(subscriptions.length,7,'Quiet streams do not repeatedly resubscribe');
    var picture=active('getSystemSettings','picture');
    notify(picture,{settings:{backlight:'4'},dimension:{input:'hdmi3'},app_id:''});
    assert.strictEqual(backlight().value,4);
    assert.strictEqual(monitor.snapshot().controls.picture_contrast.value,95,'Partial updates retain unchanged keys');
    assert.deepStrictEqual(backlight().dimension,{input:'hdmi3',pictureMode:'filmMaker'});
    assert.strictEqual(reads.length,0,'Omitted delta dimensions do not cause an unnecessary recovery read');
    var metadata=active('getSystemSettingDesc','picture');
    notify(metadata,{key:'backlight',ui:{active:false}});
    assert.strictEqual(backlight().available,false,'A single-key description patch immediately changes availability');
    assert.strictEqual(backlight().max,100,'Description patches preserve cached range/type metadata');
    notify(metadata,{key:'backlight',ui:{active:true}});
    assert.strictEqual(backlight().available,true);
    notify(metadata,{key:'backlight',values:{range:{max:90}}});
    assert.strictEqual(backlight().max,90);
    assert.strictEqual(backlight().step,1,'Partial range metadata retains the established native step');
    clock.tick(1);
    assert.strictEqual(reads.length,7,'Recovery reads each existing stream only once every five minutes');
    assert.strictEqual(subscriptions.length,7);
    // An older recovery response cannot overwrite a newer live notification.
    deferred=true;clock.tick(300000);
    while (pending.length && (!reads.at(-1).params.keys.includes('backlight') ||
        reads.at(-1).method==='getSystemSettingDesc')) pending.shift()();
    assert.strictEqual(reads.at(-1).method,'getSystemSettings');
    notify(picture,{settings:{backlight:'9'}});
    pending.shift()();
    while(pending.length)pending.shift()();
    deferred=false;
    assert.strictEqual(backlight().value,9);
    var previousId=monitor.snapshot().context_id;
    context={input:'hdmi4',mode:'game',range:'sdr',ready:true};monitor.contextChanged();
    assert.strictEqual(backlight().available,false);
    assert.deepStrictEqual(monitor.snapshot().observations,[],'No old observations during an input transition');
    notify(picture,{settings:{backlight:'99'}});
    assert.strictEqual(backlight().value,9,'Cancelled input callbacks must not leak into the next context');
    clock.tick(350);
    assert.notStrictEqual(monitor.snapshot().context_id,previousId);
    assert.deepStrictEqual(backlight().dimension,{input:'hdmi4',pictureMode:'game'});
    assert.ok(monitor.snapshot().observations.every(function(v){return v.target.dimension.input==='hdmi4';}));
    assert.strictEqual(monitor.snapshot().controls.picture_truMotionMode.app_id,'com.webos.app.hdmi4');
    assert.strictEqual(backlight().available,true);
    var lost=active('getSystemSettings','picture');
    lost.sub.emit('error',new Error('service restarted'));
    assert.strictEqual(backlight().available,false);
    assert.strictEqual(monitor.snapshot().observed_at,0);
    assert.strictEqual(subscriptions.filter(function(s){return !s.cancelled;}).length,0);
    clock.tick(5000);
    assert.strictEqual(monitor.snapshot().capture.subscribed,7,'A lost stream restores the whole coherent context');
    notify(lost,{settings:{backlight:'98'}});
    assert.strictEqual(backlight().value,3);
    var old=active('getSystemSettings','picture');
    monitor.refresh();clock.tick(0);
    assert.strictEqual(old.cancelled,true,'Explicit refresh/reconnect replaces stale streams');
    assert.strictEqual(monitor.snapshot().capture.subscribed,7);
    failSubscribe=true;monitor.refresh();clock.tick(0);
    assert.strictEqual(monitor.snapshot().capture.subscribed,0);
    assert.strictEqual(backlight().available,false,'Synchronous subscribe failure cannot re-enable a partial stale cache');
    clock.tick(5000);
    assert.strictEqual(monitor.snapshot().capture.subscribed,7);
    monitor.stop();clock.tick(0);
    assert.strictEqual(clock.size(),0,'Shutdown cancels retries, subscription deadlines, and recovery timer');
    assert.strictEqual(subscriptions.filter(function(s){return !s.cancelled;}).length,0);
  } finally { monitor.stop(); }
};
