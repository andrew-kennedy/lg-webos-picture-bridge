'use strict';

var assert = require('assert');
var lunaExecutor = require('../app/bridge/lib/luna-executor');

module.exports = function () {
  return new Promise(function (resolve, reject) {
    var calls = [];
    var service = {
      call: function (uri, params, callback) {
        calls.push({uri: uri, params: params});
        process.nextTick(function () { callback({payload: {returnValue: true}}); });
        return {cancel: function () {}};
      }
    };
    var operations = [
      {kind: 'preset_settings', params: {category: 'picture$hdmi3.expert1.2d.x', settings: {backlight: 80}}},
      {kind: 'picture_mode_mapping', params: {category: 'picture$hdmi3.x.2d.sdr', settings: {pictureMode: 'expert1'}}}
    ];
    lunaExecutor.execute(service, operations, null, function (error, responses) {
      try {
        if (error) throw error;
        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0].uri, lunaExecutor.SETTINGS_URI);
        assert.strictEqual(responses.length, 2);
        var guardedCalls = 0;
        lunaExecutor.execute(service, operations, null, function (guardError, completed) {
          try {
            assert.strictEqual(guardError.code, 'stale_context');
            assert.strictEqual(guardError.operation_index, 1);
            assert.strictEqual(completed.length, 1);
            assert.strictEqual(calls.length, 3, 'Guard stops the next write, not only queue entry');
            resolve();
          } catch (failure) { reject(failure); }
        }, function () {
          if (++guardedCalls === 2) {
            var failure = new Error('Input changed'); failure.code = 'stale_context'; throw failure;
          }
        });
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
};
