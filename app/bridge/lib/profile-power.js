'use strict';

// Screen saver / screen-off is not a power cycle. Only native standby states
// close a session; a broken subscription or unavailable HA entity never does.
function classify(value) {
  const state = value && (value.state || value.powerState);
  if (['Active','Screen Saver','Screen Off'].includes(state)) return 'on';
  if (['Suspend','Active Standby','Power Off'].includes(state)) return 'off';
  return null;
}
function create(service, changed, dependencies = {}) {
  const later = dependencies.setTimeout || setTimeout, cancel = dependencies.clearTimeout || clearTimeout;
  let subscription, retry, stopped = false, generation = 0;
  function start() {
    const epoch = ++generation;
    function failed() {
      if (stopped || epoch !== generation) return;
      generation++;
      if (subscription) { try { subscription.cancel(); } catch (_) { /* already closed */ } }
      retry = later(start,10000);
    }
    try {
      subscription = service.subscribe('luna://com.webos.service.tvpower/power/getPowerState',{subscribe:true});
      subscription.on('response', message => {
        if (stopped || epoch !== generation) return;
        const value = message.payload || message;
        if (value.returnValue === false || value.subscribed === false) { failed(); return; }
        const power = classify(value);
        if (power) changed(power);
      });
      subscription.on('error',failed); subscription.on('cancel',failed);
    } catch (_) { failed(); }
  }
  return {start,stop() { stopped = true; generation++; cancel(retry); if (subscription) subscription.cancel(); }};
}
module.exports = {create,classify};
