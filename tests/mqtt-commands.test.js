'use strict';
var assert = require('assert');
var commands = require('../app/bridge/lib/mqtt-commands');

module.exports = function () {
  var time = 1000000, context = 'hdmi3|sdr|true', ready = true, sent = [], applications = [];
  var handler = commands.create({now: function () { return time; }, topic: 'tv/command',
    context: function () { return context; }, pictureReady: function () { return ready; },
    publish: function (status) { sent.push(JSON.parse(JSON.stringify(status))); },
    applyPolicy: function (policy, callback, guard) { applications.push({policy:policy, callback:callback, guard:guard}); }
  });
  function request(id) { return {protocol:1, request_id:id, session_id:handler.status().session_id,
    expires_at:time/1000+30, policy:{input:'hdmi3',scope:'active',modes:{sdr:'expert1'},presets:{expert1:{settings:{backlight:80}}}}}; }
  function send(data, retain) { handler.receive(typeof data === 'string' ? data : JSON.stringify(data), {retain:!!retain}); }
  function result(id) { return sent[sent.length-1].results[id]; }
  function complete(index) { applications[index].callback(null,{input:'hdmi3',scope:'active',dry_run:false,operation_count:3}); }
  handler.connect();
  send(request('before-suback')); assert.strictEqual(applications.length,0);
  handler.subscribed();
  send(request('retained'),true); send('{'); send('x'.repeat(49153)); send(request('__proto__'));
  assert.strictEqual(applications.length,0);
  var first=request('first'); send(first); assert.strictEqual(applications.length,1);
  assert.strictEqual(applications[0].policy.request_id,'first'); applications[0].guard();
  send(first); assert.strictEqual(applications.length,1,'in-flight duplicate must not write');
  complete(0); assert.strictEqual(result('first').ok,true);
  time+=31000; send(first); assert.strictEqual(applications.length,1,'completed retry returns original result after expiry');
  assert.strictEqual(result('first').ok,true);
  first.policy.presets.expert1.settings.backlight=1; send(first);
  assert.strictEqual(result('first').error,'request_id_conflict');
  var expired=request('expired');expired.expires_at=1;send(expired);assert.strictEqual(result('expired').error,'expired_command');
  expired=request('far-future');expired.expires_at+=100;send(expired);assert.strictEqual(result('far-future').error,'expired_command');
  var invalid=request('invalid');invalid.policy.input='shell';send(invalid);assert.strictEqual(result('invalid').error,'invalid_policy');
  var stale=request('stale');stale.session_id='previous-session';send(stale);assert.strictEqual(result('stale').error,'stale_session');
  ready=false;send(request('no-signal'));assert.strictEqual(result('no-signal').error,'signal_unavailable');ready=true;
  send(request('context-change'));assert.strictEqual(applications.length,2);
  context='hdmi1|hdr|true';assert.throws(applications[1].guard,/context|signal|range/i);
  applications[1].callback(Object.assign(new Error('Input changed'),{code:'stale_context',operation_index:1}));
  assert.strictEqual(result('context-change').operation_index,1);
  send(request('connection-change')); var old=request('old-session');handler.disconnect();
  assert.throws(applications[2].guard,/connection/i);handler.connect();handler.subscribed();
  complete(2);assert.strictEqual(handler.status().results['connection-change'],undefined);
  send(old);assert.strictEqual(result('old-session').error,'stale_session');
  send(request('timeout'));time+=31000;assert.throws(applications[3].guard,/expired/i);
  applications[3].callback(Object.assign(new Error('expired'),{code:'expired_command'}));
  for(var i=0;i<70;i++){send(request('rate-'+i));if(applications[applications.length-1].policy.request_id==='rate-'+i)complete(applications.length-1);}
  assert.strictEqual(result('rate-69').error,'command_rate_limit');
  assert.ok(Object.keys(handler.status().results).length<=16);
  handler.disconnect();
};
