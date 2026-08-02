'use strict';

var crypto = require('crypto');
var http = require('http');

var MAX_BODY_BYTES = 131072;

function tokenDigest(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function authorized(request, token) {
  var expected = tokenDigest('Bearer ' + token);
  var received = tokenDigest(request.headers.authorization || '');
  var difference = 0;
  var index;
  for (index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

function send(response, statusCode, body) {
  var serialized = JSON.stringify(body) + '\n';
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(serialized, 'utf8'),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(serialized);
}

function start(options) {
  var server;
  if (!options.token) return null;
  server = http.createServer(function (request, response) {
    var body = '';
    var bodyBytes = 0;
    var completed = false;

    function fail(statusCode, code, message) {
      if (completed) return;
      completed = true;
      send(response, statusCode, {ok: false, error: code, message: message});
    }

    if (!authorized(request, options.token)) {
      fail(401, 'unauthorized', 'A valid bearer token is required');
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/status') {
      completed = true;
      send(response, 200, {ok: true, status: options.status()});
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/picture/policy') {
      fail(404, 'not_found', 'Unknown command endpoint');
      return;
    }

    request.setEncoding('utf8');
    request.on('data', function (chunk) {
      if (completed) return;
      bodyBytes += Buffer.byteLength(chunk, 'utf8');
      if (bodyBytes > MAX_BODY_BYTES) {
        fail(413, 'body_too_large', 'Request body exceeds 128 KiB');
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('error', function (error) {
      fail(400, 'request_error', error.message);
    });
    request.on('end', function () {
      var payload;
      if (completed) return;
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        fail(400, 'invalid_json', 'Request body must be valid JSON');
        return;
      }
      options.applyPolicy(payload, function (error, result) {
        if (completed) return;
        completed = true;
        if (error) {
          send(response, error.statusCode || 500, {
            ok: false,
            error: error.code || 'command_failed',
            message: error.message,
            operation_index: error.operation_index === undefined ? null : error.operation_index,
            operation: error.operation ? {
              kind: error.operation.kind,
              category: error.operation.params.category
            } : null,
            luna: error.luna_payload || null
          });
          return;
        }
        send(response, 200, result);
      });
    });
  });
  server.on('error', options.onError);
  server.listen(options.port, '0.0.0.0', options.onListening);
  return server;
}

module.exports = {authorized: authorized, start: start, tokenDigest: tokenDigest};
