'use strict';

var SETTINGS_URI = 'luna://com.webos.settingsservice/setSystemSettings';

function payloadFromMessage(message) {
  return message && message.payload ? message.payload : message;
}

function executeOne(service, operation, callback) {
  var finished = false;
  var request;
  var timer = setTimeout(function () {
    var error;
    if (finished) return;
    finished = true;
    if (request && typeof request.cancel === 'function') {
      try { request.cancel(); } catch (cancelError) { /* Best effort. */ }
    }
    error = new Error('Timed out writing ' + operation.kind + ' for ' + operation.params.category);
    error.code = 'luna_timeout';
    error.statusCode = 504;
    callback(error);
  }, 5000);

  try {
    request = service.call(SETTINGS_URI, operation.params, function (message) {
      var payload;
      var error;
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      payload = payloadFromMessage(message) || {};
      if (payload.returnValue === false || payload.errorText || payload.errorCode) {
        error = new Error(payload.errorText || String(payload.errorCode) || 'Luna write failed');
        error.code = 'luna_write_failed';
        error.statusCode = 502;
        error.luna_payload = payload;
        callback(error);
        return;
      }
      callback(null, payload);
    });
  } catch (error) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    error.code = error.code || 'luna_call_failed';
    error.statusCode = error.statusCode || 502;
    callback(error);
  }
}

function execute(service, operations, onOperation, callback) {
  var responses = [];
  function next(index) {
    if (index >= operations.length) {
      callback(null, responses);
      return;
    }
    executeOne(service, operations[index], function (error, response) {
      if (error) {
        error.operation_index = index;
        error.operation = operations[index];
        callback(error, responses);
        return;
      }
      responses.push(response);
      if (onOperation) onOperation(operations[index], index, operations.length);
      next(index + 1);
    });
  }
  next(0);
}

module.exports = {execute: execute, executeOne: executeOne, SETTINGS_URI: SETTINGS_URI};
