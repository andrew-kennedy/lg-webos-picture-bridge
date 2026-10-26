'use strict';

module.exports = function () {
  var now = 100000, next = 0, timers = new Map();
  function add(callback, delay, interval) {
    var id = ++next; timers.set(id, {callback:callback, at:now + delay, interval:interval}); return id;
  }
  return {
    now:function () { return now; },
    setTimeout:function (callback, delay) { return add(callback, delay, 0); },
    clearTimeout:function (id) { timers.delete(id); },
    setInterval:function (callback, delay) { return add(callback, delay, delay); },
    clearInterval:function (id) { timers.delete(id); },
    size:function () { return timers.size; },
    tick:function (duration) {
      var end = now + duration, remaining = 10000;
      while (remaining--) {
        var entries = Array.from(timers.entries()).filter(function (entry) { return entry[1].at <= end; })
          .sort(function (a, b) { return a[1].at - b[1].at || a[0] - b[0]; });
        if (!entries.length) { now = end; return; }
        var id = entries[0][0], timer = entries[0][1]; now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        timer.callback();
      }
      throw new Error('Unbounded timer loop');
    }
  };
};
