'use strict';
var assert = require('assert');
var mqtt = require('../app/bridge/lib/mqtt-settings');
module.exports = function () {
  var changed, sent = [];
  var state = {context_id:'a'.repeat(24),observed_at:Date.now(),context:{input:'hdmi3'},controls:{
    picture_backlight:{id:'picture_backlight',category:'picture',key:'backlight',name:'OLED light',component:'number',
      min:0,max:100,step:1,value:3,available:true,dimension:{input:'hdmi3',pictureMode:'filmMaker'}}}};
  var controller = mqtt.create({config:{device_name:'Test',mqtt:{topic_prefix:'lg',discovery_prefix:'homeassistant'}},id:'test',
    context:function(){return state.context;},
    publish:function(topic,payload,retain){sent.push({topic:topic,payload:payload,retain:retain});return true;},
    createMonitor:function(unused,options){changed=options.changed;return {
      contextChanged:function(){changed(state);},start:function(){changed(state);},stop:function(){},
      refresh:function(){changed(state);},write:function(unused,done){done(null,{});}};}});
  function observations() { return sent.filter(function(s){return s.topic==='lg/test/settings/picture_backlight';}); }
  controller.connect(); controller.start(); controller.subscribed();
  var count=observations().length;
  state.observed_at+=10000; changed(state); controller.publish();
  assert.strictEqual(observations().length,count,'Polling unchanged values must not churn HA recorder attributes');
  state.controls.picture_backlight.value=4; changed(state);
  assert.strictEqual(observations().length,count+1);
  assert.strictEqual(JSON.parse(observations().at(-1).payload).value,4);
  controller.refresh();
  assert.strictEqual(observations().length,count+2,'HA birth must replay non-retained values');
  controller.disconnect();state.controls.picture_backlight.value=5;changed(state);
  assert.strictEqual(observations().length,count+2);
  controller.connect();controller.subscribed();
  assert.strictEqual(JSON.parse(observations().at(-1).payload).value,5,'Broker reconnect must refresh actual state');
  assert.ok(sent.some(function(s){return s.topic.endsWith('_setting_option_pointerSize/config')&&s.payload==='';}));
  ['soundMode','clearVoice','aiSound','aigamesound','soundOptimizer','eArcSupport','lgSoundSync',
    'soundModeSync','virtualSurround','supportATMOS'].forEach(function (key) {
    ['number','select'].forEach(function (kind) {
      assert.ok(sent.some(function(s) { return s.topic==='homeassistant/'+kind+'/test_setting_sound_'+key+'/config' &&
        s.payload==='' && s.retain; }), 'Upgrade removes retained discovery for '+key);
    });
  });
  ['picture_eyeComfortMode','picture_screenShift','other_blueLight'].forEach(function (id) {
    ['number','select'].forEach(function (kind) {
      assert.ok(sent.some(function(s) { return s.topic==='homeassistant/'+kind+'/test_setting_'+id+'/config' &&
        s.payload==='' && s.retain; }), 'Upgrade removes retained discovery for '+id);
    });
  });
  state.controls={};changed(state);
  assert.strictEqual(JSON.parse(observations().at(-1).payload).available,false,'A setting omitted by the next mode must become unavailable');
  controller.stop();
};
