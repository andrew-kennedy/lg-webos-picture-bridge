'use strict';
var commands = require('./mqtt-commands');
var banks = require('./profile-banks');
function create(options) {
  var engine = options.engine, online = false;
  function publish(status) {
    if (engine) { status.api_version = 2; status.manager = engine.status(); }
    return online && options.publish(options.base + '/profiles/status', JSON.stringify(status), false);
  }
  var channel = commands.create({topic:options.base + '/profiles/command', resultLimit:1,maxBytes:950000,
    normalize:function (command) {
      if (command && ['read','apply'].includes(command.action)) return banks.normalize(command);
      if (!engine || !command || !['get','backup','initialize','restore_backup','inspect','set_environment','set_enabled',
        'set_brightness','set_brightness_links','include_motion_controls','restore_scope','import','edit','edit_many','restore','save','reconcile',
        'upgrade_profiles','create_profile','rename_profile','delete_profile','reset_profile','set_automatic','apply_profile'].includes(command.action)) throw new Error('Unknown profile command');
      return command;
    }, summarizeResult:function (value) { return value; },
    publish:publish,
    applyPolicy:function (command, callback, guard) {
      if (engine && !['read','apply'].includes(command.action)) {
        engine.command(command,guard).then(v => callback(null,v),callback); return;
      }
      if (engine && engine.ownsProfiles() && command.action === 'apply') {
        callback(new Error('The TV owns these profiles; use its profile editor or temporary setting controls')); return;
      }
      var run = function (done) { banks.run(options.service, command, guard, options.context).then(function (value) { done(null,value); },done); };
      if (options.enqueue) options.enqueue(run,callback); else run(callback);
    }});
  function compact() {
      var status = channel.status();
      // Large snapshots are replies, not recurring diagnostic entity attributes.
      if (!status.ready) return false;
      return publish({protocol:1, api_version:engine ? 2 : 1,
        session_id:status.session_id, ready:status.ready, command_topic:status.command_topic});
  }
  var removeChange = engine && engine.onChange(compact);
  var removeBackup = engine && engine.onBackup(value => {
    if (online) options.publish(options.base + '/profiles/backup',JSON.stringify(value),true);
  });
  return {connect:function () { online = true; channel.connect(); },
    subscribed:function () { channel.subscribed(); if (engine) engine.republishBackup(); },
    disconnect:function () { online = false; channel.disconnect(); },receive:channel.receive,publish:compact,
    refresh:function () { compact(); if (engine) engine.republishBackup(); },
    message:function (topic,payload,metadata) {
      if (!engine || payload.length > 2048) return;
      try {
        if (topic === options.base + '/profiles/environment') engine.environment(JSON.parse(payload));
        if (topic === options.base + '/profiles/backup/ack' && !metadata.retain) engine.acknowledge(JSON.parse(payload));
      } catch (_) { /* Invalid context/ack cannot change profiles. */ }
    },
    stop:function () { online = false; channel.disconnect(); if (removeChange) removeChange(); if (removeBackup) removeBackup(); }};
}
module.exports = {create:create};
