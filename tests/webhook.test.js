'use strict';

var assert = require('assert');
var http = require('http');
var webhook = require('../app/bridge/lib/webhook');

module.exports = function () {
  return new Promise(function (resolve, reject) {
    var expected = {event: 'pairing_test', device_id: 'test-tv'};
    var server = http.createServer(function (request, response) {
      var body = '';
      request.on('data', function (chunk) { body += chunk; });
      request.on('end', function () {
        try {
          assert.strictEqual(request.method, 'POST');
          assert.strictEqual(request.headers['content-type'], 'application/json');
          assert.deepStrictEqual(JSON.parse(body), expected);
          response.writeHead(200);
          response.end('ok');
        } catch (error) {
          response.writeHead(500);
          response.end('failed');
          reject(error);
        }
      });
    });

    server.listen(0, '127.0.0.1', function () {
      var address = server.address();
      webhook.postJson('http://127.0.0.1:' + address.port + '/hook', expected, function (error, result) {
        server.close();
        if (error) reject(error);
        else {
          try {
            assert.strictEqual(result.statusCode, 200);
            resolve();
          } catch (assertionError) {
            reject(assertionError);
          }
        }
      });
    });
  });
};
