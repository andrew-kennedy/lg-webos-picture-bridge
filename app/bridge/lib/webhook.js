'use strict';

var http = require('http');
var https = require('https');
var url = require('url');

function postJson(callbackUrl, payload, callback) {
  var parsed = url.parse(callbackUrl);
  var body = JSON.stringify(payload);
  var client = parsed.protocol === 'https:' ? https : http;
  var completed = false;
  var request;

  function finish(error, result) {
    if (completed) return;
    completed = true;
    callback(error, result);
  }

  request = client.request({
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'lg-webos-picture-bridge/0.1'
    }
  }, function (response) {
    var responseBody = '';
    response.setEncoding('utf8');
    response.on('data', function (chunk) {
      if (responseBody.length < 4096) responseBody += chunk;
    });
    response.on('end', function () {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        finish(null, {statusCode: response.statusCode, body: responseBody});
      } else {
        finish(new Error('Webhook returned HTTP ' + response.statusCode));
      }
    });
  });

  request.setTimeout(10000, function () {
    request.abort();
    finish(new Error('Webhook request timed out'));
  });
  request.on('error', function (error) { finish(error); });
  request.write(body);
  request.end();
}

module.exports = {postJson: postJson};
