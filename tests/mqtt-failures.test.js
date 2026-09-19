'use strict';
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var mqtt = require('../app/bridge/lib/mqtt-client');

module.exports = function () {
  function setup() {
    var socket = new EventEmitter();
    var statuses = [];
    var sent = [];
    socket.destroyed = false;
    socket.write = function (data) { sent.push(data); };
    socket.destroy = function () { if (!socket.destroyed) { socket.destroyed = true; socket.emit('close'); } };
    socket.end = function () { socket.destroy(); };
    var client = mqtt.create({host:'test', port:1883, client_id:'test', availability_topic:'test/status'},
      {net: {connect: function () { return socket; }}});
    client.on('status', function (status) { statuses.push(status); });
    client.start(); socket.emit('connect');
    return {client:client, socket:socket, statuses:statuses, sent:sent};
  }
  function rejected(bytes, ready) {
    var test = setup();
    if (ready) test.socket.emit('data', Buffer.from([32, 2, 0, 0]));
    test.socket.emit('data', Buffer.from(bytes));
    assert.strictEqual(test.socket.destroyed, true);
    assert.ok(test.statuses.some(function (s) { return s.state === 'error'; }));
    test.client.stop();
  }
  rejected([32, 2, 0, 5], false); // refused authorization
  rejected([32, 128, 128, 128, 128], false); // malformed length
  rejected([48, 255, 255, 127], true); // oversized packet
  rejected([48, 3, 0, 10, 1], true); // topic outside body
  rejected([54, 2, 0, 0], true); // invalid QoS
  rejected([144, 3, 0, 1, 128], true); // rejected subscription
  var test = setup();
  test.socket.emit('data', Buffer.from([32, 2, 0, 0]));
  test.socket.bufferSize = 300000;
  assert.strictEqual(test.client.publish('test/state', 'value', false), false);
  assert.strictEqual(test.socket.destroyed, true);
  test.client.stop();
};
