'use strict';

// Small publisher-only MQTT 3.1.1 client for webOS 4's Node 0.12 runtime.
// QoS 0 snapshots are periodically refreshed; no command topics or offline queue.
var net = require('net');
var tls = require('tls');
var EventEmitter = require('events').EventEmitter;
var MAX_PACKET = 65536;

function buffer(value) { return new Buffer(value); }
function word(value) { return buffer([value >> 8, value & 255]); }
function string(value) {
  var bytes = buffer(String(value));
  if (bytes.length > 65535 || String(value).indexOf('\u0000') !== -1) throw new Error('Invalid MQTT string');
  return Buffer.concat([word(bytes.length), bytes]);
}
function packet(header, body) {
  var length = body.length;
  var encoded = [];
  var digit;
  if (length > MAX_PACKET) throw new Error('MQTT packet too large');
  do {
    digit = length % 128;
    length = Math.floor(length / 128);
    encoded.push(digit | (length ? 128 : 0));
  } while (length);
  return Buffer.concat([buffer([header].concat(encoded)), body]);
}
function connectPacket(options) {
  var flags = 2 | 4 | 32; // clean session, retained QoS 0 will
  var fields = [string(options.client_id), string(options.availability_topic), string('offline')];
  if (options.username) { flags |= 128; fields.push(string(options.username)); }
  if (options.password) { flags |= 64; fields.push(string(options.password)); }
  return packet(16, Buffer.concat([string('MQTT'), buffer([4, flags]), word(30)].concat(fields)));
}

function create(options, dependencies) {
  var deps = dependencies || {};
  var client = new EventEmitter();
  var socket = null;
  var received = buffer([]);
  var stopped = false;
  var connected = false;
  var reconnectTimer = null;
  var connectTimer = null;
  var heartbeat = null;
  var pingAt = 0;
  var retryMs = 1000;
  var nextId = 0;
  var pendingSubscriptions = {};

  function status(state, error) { client.emit('status', {state: state, error: error || null}); }
  function fail(message) {
    status('error', message);
    if (socket) socket.destroy();
  }
  function write(bytes) {
    if (!socket || socket.destroyed) return false;
    if (socket.bufferSize > 262144) { fail('MQTT send buffer full'); return false; }
    socket.write(bytes);
    return true;
  }
  function handle(header, body) {
    var kind = header >> 4;
    var length;
    var id;
    var qos;
    var offset;
    if (kind === 2 && header === 32 && body.length === 2 && !connected) {
      if (body[0] !== 0 || body[1] !== 0) { fail('MQTT connection rejected (code ' + body[1] + ')'); return; }
      connected = true;
      retryMs = 1000;
      clearTimeout(connectTimer);
      status('connected');
      client.emit('connect');
    } else if (!connected) {
      fail('MQTT expected CONNACK');
    } else if (kind === 13 && header === 208 && body.length === 0) {
      pingAt = 0;
    } else if (kind === 9 && header === 144 && body.length === 3) {
      id = body.readUInt16BE(0);
      if (!pendingSubscriptions[id] || body[2] !== 0) { fail('MQTT subscription rejected'); return; }
      delete pendingSubscriptions[id];
    } else if (kind === 3) {
      qos = (header >> 1) & 3;
      if (body.length < 2 || qos > 1) { fail('Invalid MQTT PUBLISH'); return; }
      length = body.readUInt16BE(0);
      offset = 2 + length;
      if (!length || offset + (qos ? 2 : 0) > body.length) { fail('Invalid MQTT topic length'); return; }
      if (qos) {
        id = body.readUInt16BE(offset);
        if (!id) { fail('Invalid MQTT packet identifier'); return; }
        write(packet(64, word(id)));
      }
      client.emit('message', body.slice(2, offset).toString('utf8'),
        body.slice(offset + (qos ? 2 : 0)).toString('utf8'));
    } else {
      fail('Unexpected MQTT packet');
    }
  }
  function onData(chunk) {
    var offset;
    var length;
    var multiplier;
    var digit;
    var done;
    if (received.length + chunk.length > MAX_PACKET + 5) { fail('MQTT receive buffer limit exceeded'); return; }
    received = Buffer.concat([received, chunk]);
    while (received.length >= 2) {
      offset = 1; length = 0; multiplier = 1; done = false;
      while (offset < received.length && offset <= 4) {
        digit = received[offset++];
        length += (digit & 127) * multiplier;
        if (length > MAX_PACKET) { fail('MQTT packet length exceeded'); return; }
        if (!(digit & 128)) { done = true; break; }
        multiplier *= 128;
      }
      if (!done) {
        if (offset > 4) fail('Malformed MQTT remaining length');
        return;
      }
      if (received.length < offset + length) return;
      var header = received[0];
      var body = received.slice(offset, offset + length);
      received = received.slice(offset + length);
      handle(header, body);
      if (!socket || socket.destroyed) return;
    }
  }
  function connect() {
    if (stopped) return;
    var connection;
    var transport = options.tls ? (deps.tls || tls) : (deps.net || net);
    var socketOptions = {host: options.host, port: options.port};
    if (options.tls) {
      socketOptions.rejectUnauthorized = true;
      if (net.isIP(options.host) === 0) socketOptions.servername = options.host;
      if (options.ca) socketOptions.ca = options.ca;
    }
    status('connecting');
    received = buffer([]);
    pendingSubscriptions = {};
    pingAt = 0;
    connection = transport.connect(socketOptions);
    socket = connection;
    connectTimer = setTimeout(function () { if (socket === connection) fail('MQTT connection timed out'); }, 10000);
    connection.on(options.tls ? 'secureConnect' : 'connect', function () {
      if (socket !== connection || stopped) return;
      write(connectPacket(options));
    });
    connection.on('data', function (chunk) { if (socket === connection) onData(chunk); });
    connection.on('error', function (error) {
      if (socket === connection) status('error', 'MQTT transport error: ' + (error.code || 'connection failed'));
    });
    connection.on('close', function () {
      if (socket !== connection) return;
      socket = null; connected = false;
      clearTimeout(connectTimer);
      status(stopped ? 'stopped' : 'disconnected');
      client.emit('disconnect');
      if (!stopped) {
        reconnectTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(30000, retryMs * 2);
      }
    });
  }
  client.publish = function (topic, payload, retain) {
    if (!connected) return false;
    return write(packet(retain ? 49 : 48, Buffer.concat([string(topic), buffer(payload)])));
  };
  client.subscribe = function (topic) {
    if (!connected) return;
    nextId = nextId % 65535 + 1;
    pendingSubscriptions[nextId] = true;
    write(packet(130, Buffer.concat([word(nextId), string(topic), buffer([0])])));
  };
  client.start = function () {
    heartbeat = setInterval(function () {
      if (!connected) return;
      if (pingAt) { fail('MQTT keepalive timed out'); return; }
      pingAt = Date.now();
      write(packet(192, buffer([])));
    }, 15000);
    connect();
  };
  client.stop = function (callback) {
    if (stopped) { if (callback) callback(); return; }
    stopped = true;
    clearTimeout(reconnectTimer); clearTimeout(connectTimer); clearInterval(heartbeat);
    if (socket) {
      var closing = socket;
      var deadline = setTimeout(function () { closing.destroy(); }, 2000);
      closing.once('close', function () { clearTimeout(deadline); if (callback) callback(); });
      if (connected) {
        client.publish(options.availability_topic, 'offline', true);
        socket.end(packet(224, buffer([])));
      } else socket.destroy();
    } else if (callback) callback();
  };
  return client;
}

module.exports = {create: create, packet: packet, string: string, connectPacket: connectPacket};
