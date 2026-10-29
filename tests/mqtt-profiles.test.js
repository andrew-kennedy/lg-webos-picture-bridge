'use strict';
const assert = require('node:assert/strict');
const profile = require('../app/bridge/lib/mqtt-profiles');
module.exports = async function () {
  const messages = [], calls = [], acknowledgements = [], environments = [];
  let changed, backed, removed = 0;
  const engine = {status:() => ({configured:true,instance_id:'instance'}),ownsProfiles:() => true,
    command:async input => {calls.push(input);return {applied:true};},
    onChange:fn => {changed=fn;return ()=>removed++;},onBackup:fn=>{backed=fn;return ()=>removed++;},
    republishBackup:()=>backed({complete:true}),acknowledge:v=>acknowledgements.push(v),environment:v=>environments.push(v)};
  const channel=profile.create({base:'lg/test',engine,publish:(topic,payload,retain)=>{messages.push({topic,value:JSON.parse(payload),retain});return true;}});
  channel.connect();channel.subscribed();
  const initial=messages.find(m=>m.topic.endsWith('/status')).value;
  assert.equal(initial.api_version,2);
  assert(messages.some(m=>m.topic.endsWith('/backup')&&m.retain));
  const envelope={protocol:1,session_id:initial.session_id,request_id:'test-init',expires_at:Date.now()/1000+40,policy:{action:'get'}};
  channel.receive(JSON.stringify(envelope),{retain:true});
  assert.equal(calls.length,0);
  channel.receive(JSON.stringify(envelope),{retain:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  channel.receive(JSON.stringify(envelope),{retain:false});
  assert.equal(calls.length,1,'MQTT retries never repeat manager mutations');
  const batch={...envelope,request_id:'batch',policy:{action:'edit_many',revision:4,edits:[{bank_id:'movie',variant:'standard',settings:{color:50}}],preferences:{}}};
  channel.receive(JSON.stringify(batch),{retain:false});await new Promise(resolve=>setImmediate(resolve));
  channel.receive(JSON.stringify(batch),{retain:false});
  assert.deepEqual(calls[1],batch.policy,'The complete reviewed batch reaches the TV manager exactly once');
  assert.equal(calls.length,2);
  channel.receive(JSON.stringify({...envelope,request_id:'legacy',policy:{action:'apply',banks:[{id:'mapping',target:{category:'picture',dimension:{input:'hdmi3',dynamicRange:'sdr'}},settings:{pictureMode:'game'},expected:{pictureMode:'filmMaker'}}]}}),{retain:false});
  const rejected=messages.findLast(m=>m.topic.endsWith('/status')).value.results.legacy;
  assert.equal(rejected.ok,false);
  assert.match(rejected.message,/TV owns/);
  channel.message('lg/test/profiles/backup/ack','{"sequence":1}',{retain:true});
  channel.message('lg/test/profiles/backup/ack','{"sequence":1}',{retain:false});
  channel.message('lg/test/profiles/environment','{"protocol":1,"room":"dark"}',{retain:true});
  assert.equal(acknowledgements.length,1);
  assert.equal(environments.length,1,'Retained room context is state, never a retained write command');
  changed();
  assert.equal(messages.at(-1).value.results,undefined,'Routine status does not resend complete documents');
  channel.stop();assert.equal(removed,2);
};
