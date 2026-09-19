'use strict';
var assert = require('assert');
var executor = require('../app/bridge/lib/luna-executor');

module.exports = async function () {
  var operation = {kind:'preset_settings',params:{category:'picture$hdmi3.expert1.2d.x',settings:{backlight:80}}};
  for (var response of [{}, {returnValue:false}, {errorText:'unsupported key'}, null]) {
    await new Promise(function (resolve, reject) {
      executor.executeOne({call:function (uri, params, callback) {
        callback({payload:response}); return {cancel:function () {}};
      }}, operation, function (error) {
        try { assert.ok(error); assert.strictEqual(error.code,'luna_write_failed'); resolve(); }
        catch (failure) { reject(failure); }
      });
    });
  }
};
