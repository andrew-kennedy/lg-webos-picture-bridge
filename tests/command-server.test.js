'use strict';

var assert = require('assert');
var commandServer = require('../app/bridge/lib/command-server');

module.exports = function () {
  var token = '0123456789abcdef0123456789abcdef';
  assert.strictEqual(commandServer.tokenDigest('same'), commandServer.tokenDigest('same'));
  assert.notStrictEqual(commandServer.tokenDigest('same'), commandServer.tokenDigest('different'));
  assert.strictEqual(commandServer.authorized({headers: {authorization: 'Bearer ' + token}}, token), true);
  assert.strictEqual(commandServer.authorized({headers: {authorization: 'Bearer wrong'}}, token), false);
};
