'use strict';
var commands = require('./mqtt-commands');
var banks = require('./profile-banks');
function create(options) {
  var channel = commands.create({topic:options.base + '/profiles/command', resultLimit:2,
    normalize:banks.normalize, summarizeResult:function (value) { return value; },
    publish:function (status) { return options.publish(options.base + '/profiles/status', JSON.stringify(status), false); },
    applyPolicy:function (command, callback, guard) {
      var run = function (done) { banks.run(options.service, command, guard, options.context).then(function (value) { done(null,value); },done); };
      if (options.enqueue) options.enqueue(run,callback); else run(callback);
    }});
  return {connect:channel.connect, subscribed:channel.subscribed, disconnect:channel.disconnect, receive:channel.receive,
    publish:function () {
      var status = channel.status();
      // Large snapshots are replies, not recurring diagnostic entity attributes.
      if (!status.ready) return false;
      return options.publish(options.base + '/profiles/status', JSON.stringify({protocol:1, api_version:1,
        session_id:status.session_id, ready:status.ready, command_topic:status.command_topic}),false);
    }};
}
module.exports = {create:create};
