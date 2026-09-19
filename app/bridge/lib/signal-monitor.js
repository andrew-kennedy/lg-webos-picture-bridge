'use strict';

var FOREGROUND = 'luna://com.webos.service.acb/getForegroundAppInfo';
var SIGNAL = 'luna://com.webos.service.tv.externaldevice/input/getSignalState';

function create(service, onChange, onHealth) {
  var foreground = null;
  var signal = null;
  var retry = null;
  var stopped = false;
  var generation = 0;
  var foregroundGeneration = 0;
  var current = {input: null, pipeline_id: null, signal_present: null, signal_state: null, screensaver_type: null};

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
  }
  function recover() {
    if (stopped || retry) return;
    retry = setTimeout(function () { retry = null; watchForeground(); }, 5000);
  }
  function watchSignal() {
    var epoch = generation;
    var pipeline = current.pipeline_id;
    try {
      signal = service.subscribe(SIGNAL, {externalInputId: pipeline, subscribe: true});
      signal.on('response', function (message) {
        var payload = message.payload || message;
        var state;
        if (stopped || epoch !== generation) return;
        if (payload.returnValue === false || payload.subscribed === false) { failed(); return; }
        if (payload.externalInputId && payload.externalInputId !== pipeline) return;
        state = payload.signalState || {};
        current.signal_state = typeof state.videoSignalState === 'string' ? state.videoSignalState : null;
        current.screensaver_type = typeof state.screensaverType === 'string' ? state.screensaverType : null;
        current.signal_present = state.videoSignalState === 'good' ? true :
          (state.videoSignalState === 'bad' ? false : null);
        health('subscribed');
        publish();
      });
      signal.on('error', failed);
      signal.on('cancel', failed);
    } catch (error) { failed(); }
    function failed() {
      if (stopped || epoch !== generation) return;
      invalidate();
      health('error', 'HDMI signal subscription lost');
      publish();
      recover();
    }
  }
  function watchForeground() {
    var epoch = ++foregroundGeneration;
    cancel(foreground); foreground = null;
    invalidate();
    current.input = null; current.pipeline_id = null;
    publish();
    health('subscribing');
    try {
      foreground = service.subscribe(FOREGROUND, {subscribe: true});
      foreground.on('response', function (message) {
        var payload = message.payload || message;
        var match;
        var candidate;
        var pipeline;
        var input;
        if (stopped || epoch !== foregroundGeneration) return;
        if (payload.returnValue === false || payload.subscribed === false) { failed(); return; }
        match = /^com\.webos\.app\.hdmi([1-4])$/.exec(payload.appId || '');
        input = match ? 'hdmi' + match[1] : null;
        candidate = (Array.isArray(payload.acbs) ? payload.acbs : []).filter(function (item) {
          return item.playerType === 'external input' && typeof item.pipelineId === 'string';
        });
        // Ambiguous/missing sessions are unknown, never guessed to be no signal.
        pipeline = input && candidate.length === 1 ? candidate[0].pipelineId : null;
        if (input === current.input && pipeline === current.pipeline_id && signal) return;
        invalidate();
        current.input = input; current.pipeline_id = pipeline;
        publish();
        if (pipeline) watchSignal();
        else {
          health(input ? 'waiting_for_pipeline' : 'not_hdmi');
          if (input) recover();
        }
      });
      foreground.on('error', failed);
      foreground.on('cancel', failed);
    } catch (error) { failed(); }
    function failed() {
      if (stopped || epoch !== foregroundGeneration) return;
      foregroundGeneration += 1;
      cancel(foreground); foreground = null;
      invalidate();
      current.input = null; current.pipeline_id = null;
      health('error', 'Foreground subscription lost');
      publish(); recover();
    }
  }
  return {
    start: watchForeground,
    stop: function () {
      stopped = true; foregroundGeneration += 1; generation += 1;
      clearTimeout(retry); cancel(foreground); cancel(signal);
    }
  };
}

module.exports = {create: create};
