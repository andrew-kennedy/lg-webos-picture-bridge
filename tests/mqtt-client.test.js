'use strict';
var assert = require('assert');
var net = require('net');
var mqtt = require('../app/bridge/lib/mqtt-client');

module.exports = async function () {
  var sockets = [];
  var packets = [];
  var server = net.createServer(function (socket) {
    sockets.push(socket);
    var pending = Buffer.alloc(0);
    socket.on('data', function (chunk) {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        var length = 0, factor = 1, offset = 1, byte;
        do {
          if (offset >= pending.length) return;
          byte = pending[offset++]; length += (byte & 127) * factor; factor *= 128;
        } while (byte & 128);
        if (pending.length < offset + length) return;
        var header = pending[0], body = pending.subarray(offset, offset + length);
        pending = pending.subarray(offset + length);
        packets.push({header: header, body: body});
        if (header === 16) {
          // Fragment CONNACK across reads to exercise the incremental parser.
          socket.write(Buffer.from([32]));
          setTimeout(function () { if (!socket.destroyed) socket.write(Buffer.from([2, 0, 0])); }, 10);
        }
        if (header === 130) {
          socket.write(Buffer.from([144, 3, body[0], body[1], 0]));
          socket.write(mqtt.packet(48, Buffer.concat([mqtt.string('homeassistant/status'), Buffer.from('online')])));
        }
      }
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var client = mqtt.create({host:'127.0.0.1', port:server.address().port,
    username:'testuser', password:'testpass', client_id:'test-client', availability_topic:'test/availability'});
  try {
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('MQTT test timeout')); }, 3000);
      client.on('connect', function () {
        client.publish('test/state', '{"signal_present":true}', false);
        client.subscribe('homeassistant/status');
      });
      client.on('message', function (topic, payload) {
        try { assert.strictEqual(topic, 'homeassistant/status'); assert.strictEqual(payload, 'online'); }
        catch (error) { clearTimeout(timer); reject(error); return; }
        clearTimeout(timer); resolve();
      });
      client.start();
    });
    assert.strictEqual(packets[0].body[7], 230, 'CONNECT: clean session, will, retain, username/password');
    assert.ok(packets[0].body.includes(Buffer.from('offline')));
    assert.ok(packets.some(function (p) { return p.header === 48 && p.body.includes(Buffer.from('signal_present')); }));
    assert.throws(function () { mqtt.packet(48, Buffer.alloc(65537)); });
    assert.throws(function () { mqtt.string('bad\0string'); });
    client.stop();
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.ok(packets.some(function (p) { return p.header === 49 && p.body.includes(Buffer.from('offline')); }));
    assert.ok(packets.some(function (p) { return p.header === 224; }));
  } finally {
    client.stop();
    sockets.forEach(function (socket) { socket.destroy(); });
    await new Promise(function (resolve) { server.close(resolve); });
  }
};
