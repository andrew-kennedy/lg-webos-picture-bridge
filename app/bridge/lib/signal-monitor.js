'use strict';

var range = require('./range');

var FOREGROUND = 'luna://com.webos.applicationManager/getForegroundAppInfo';
var VIDEO = 'luna://com.webos.service.videooutput/getStatus';
var SIGNAL = 'luna://com.webos.service.extinputs.hdmi/getSignalState';

// G6 HDMI sessions are owned by extinputs.hdmi. The videooutput MAIN client ID
// is its pipelineId, including while HDMI has no signal. connected is NOT a
// signal indicator: it remains true on an empty HDMI port.
function pipelineFor(appId, payload) {
  if (!/^com\.webos\.app\.hdmi[1-4]$/.test(appId || '')) return null;
  var clients = payload && Array.isArray(payload.clients) ? payload.clients : [];
  var candidates = clients.filter(function (client) {
    return client.appId === appId && client.activation === true &&
      client.sinkName === 'MAIN' && client.sourceName === 'HDMI' &&
      typeof client.clientId === 'string' && client.clientId && client.clientId !== 'unknown';
  });
  return candidates.length === 1 ? candidates[0].clientId : null;
}

function create(service, onChange, onHealth) {
  var subscriptions = [];
  var signal = null;
  var retry = null;
  var stopped = false;
  var generation = 0;
  var discoveryGeneration = 0;
  var appId = null;
  var video = null;
  var current = {input: null, pipeline_id: null, signal_present: null, signal_state: null, screensaver_type: null, dynamic_range: null};

  function cancel(subscription) {
    if (subscription && typeof subscription.cancel === 'function') {
      try { subscription.cancel(); } catch (error) { /* Already closed. */ }
    }
  }
  function publish() { onChange(JSON.parse(JSON.stringify(current))); }
  function health(state, error) { onHealth({state: state, last_error: error || null}); }
  function invalidate() {
    generation += 1;
    cancel(signal); signal = null;
    current.signal_present = null;
    current.signal_state = null;
    current.screensaver_type = null;
    current.dynamic_range = null;
  }
  function recover() {
    if (stopped || retry) return;
    retry = setTimeout(function () { retry = null; watchDiscovery(); }, 5000);
  }
  function watchSignal() {
    var epoch = generation;
    var pipeline = current.pipeline_id;
    try {
      signal = service.subscribe(SIGNAL, {pipelineId: pipeline, subscribe: true});
      signal.on('response', function (message) {
        var payload = message.payload || message;
        if (stopped || epoch !== generation) return;
        if (payload.returnValue === false || payload.subscribed === false) { failed(); return; }
        if (payload.pipelineId && payload.pipelineId !== pipeline) return;
        // Ignore subscription acknowledgements, which carry no observation.
        if (!payload.signalState) return;
        var state = payload.signalState;
        current.signal_state = typeof state.videoSignalState === 'string' ? state.videoSignalState : null;
        current.screensaver_type = typeof state.screensaverType === 'string' ? state.screensaverType : null;
        current.signal_present = state.videoSignalState === 'good' ? true :
          (state.videoSignalState === 'bad' ? false : null);
        clearTimeout(retry); retry = null;
        health('subscribed'); publish();
      });
      signal.on('error', failed);
      signal.on('cancel', failed);
    } catch (error) { failed(); }
    function failed() {
      if (stopped || epoch !== generation) return;
      invalidate();
      health('error', 'HDMI signal subscription lost'); publish(); recover();
    }
  }
  function reconcile() {
    var match = /^com\.webos\.app\.hdmi([1-4])$/.exec(appId || '');
    var input = match ? 'hdmi' + match[1] : null;
    var pipeline = pipelineFor(appId, video);
    var outputs = video && Array.isArray(video.video) ? video.video.filter(function (output) {
      return pipeline && output.context === pipeline && output.sink === 'MAIN' && output.connected === true;
    }) : [];
    var dynamicRange = outputs.length === 1 ? range.classify((outputs[0].videoInfo || {}).hdrType) : null;
    if (input === current.input && pipeline === current.pipeline_id && signal) {
      if (current.dynamic_range !== dynamicRange) { current.dynamic_range = dynamicRange; publish(); }
      return;
    }
    invalidate();
    current.input = input; current.pipeline_id = pipeline;
    current.dynamic_range = dynamicRange;
    publish();
    if (pipeline) watchSignal();
    else {
      health(input ? 'waiting_for_pipeline' : 'not_hdmi');
      if (input) recover();
      else { clearTimeout(retry); retry = null; }
    }
  }
  function watchDiscovery() {
    if (stopped) return;
    var epoch = ++discoveryGeneration;
    subscriptions.forEach(cancel); subscriptions = [];
    invalidate(); appId = null; video = null;
    current.input = null; current.pipeline_id = null;
    publish(); health('subscribing');
    function failed() {
      if (stopped || epoch !== discoveryGeneration) return;
      discoveryGeneration += 1;
      subscriptions.forEach(cancel); subscriptions = [];
      invalidate(); appId = null; video = null;
      current.input = null; current.pipeline_id = null;
      health('error', 'HDMI session discovery subscription lost'); publish(); recover();
    }
    function watch(uri, receive) {
      try {
        var subscription = service.subscribe(uri, {subscribe: true});
        subscriptions.push(subscription);
        subscription.on('response', function (message) {
          if (stopped || epoch !== discoveryGeneration) return;
          var payload = message.payload || message;
          if (payload.returnValue === false || payload.subscribed === false) { failed(); return; }
          receive(payload);
        });
        subscription.on('error', failed);
        subscription.on('cancel', failed);
      } catch (error) { failed(); }
    }
    watch(FOREGROUND, function (payload) {
      if (typeof payload.appId !== 'string') return;
      appId = payload.appId; reconcile();
    });
    if (epoch === discoveryGeneration) watch(VIDEO, function (payload) {
      if (!Array.isArray(payload.clients)) return;
      video = payload; reconcile();
    });
  }
  return {
    start: watchDiscovery,
    stop: function () {
      stopped = true; discoveryGeneration += 1; generation += 1;
      clearTimeout(retry); subscriptions.forEach(cancel); cancel(signal);
    }
  };
}

module.exports = {create: create, pipelineFor: pipelineFor};
