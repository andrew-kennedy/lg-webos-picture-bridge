(function () {
  'use strict';

  var APP_ID = 'io.github.andrewkennedy.lgpicturebridge';
  var APP_ROOT = '/media/developer/apps/usr/palm/applications/' + APP_ID;
  var SETUP_SCRIPT = APP_ROOT + '/scripts/setup.sh';
  var EXEC_URI = 'luna://org.webosbrew.hbchannel.service/exec';
  var SERVICE_URI = 'luna://' + APP_ID + '.service/';
  var statusTitle = document.getElementById('status-title');
  var statusDot = document.getElementById('status-dot');
  var callbackDisplay = document.getElementById('callback-display');
  var processDisplay = document.getElementById('process-display');
  var lunaDisplay = document.getElementById('luna-display');
  var commandDisplay = document.getElementById('command-display');
  var signalDisplay = document.getElementById('signal-display');
  var deliveryDisplay = document.getElementById('delivery-display');
  var operationDisplay = document.getElementById('operation-display');
  var details = document.getElementById('details');
  var bridges = [];

  function setOperation(message) {
    operationDisplay.textContent = message;
  }

  function showError(message) {
    statusDot.className = 'status-dot error';
    statusTitle.textContent = 'Setup needs attention';
    details.textContent = message;
    details.className = 'details visible';
    setOperation('Failed');
  }

  function clearError() {
    details.textContent = '';
    details.className = 'details';
  }

  function lunaCall(uri, payload, callback) {
    if (typeof PalmServiceBridge === 'undefined') {
      callback(new Error('PalmServiceBridge is unavailable. Run this app on an LG webOS TV.'));
      return;
    }

    var bridge = new PalmServiceBridge();
    bridges.push(bridge);
    bridge.onservicecallback = function (rawResponse) {
      var response;
      var index = bridges.indexOf(bridge);
      if (index !== -1) bridges.splice(index, 1);
      try {
        response = JSON.parse(rawResponse);
      } catch (error) {
        callback(new Error('Invalid response from Homebrew Channel: ' + rawResponse));
        return;
      }
      if (response.returnValue === false || response.errorText || response.error) {
        callback(new Error(response.errorText || response.error || response.stderrString || 'Command failed'));
        return;
      }
      callback(null, response);
    };
    bridge.call(uri, JSON.stringify(payload || {}));
  }

  function exec(command, callback) {
    lunaCall(EXEC_URI, {command: command}, callback);
  }

  function normalizeLaunchParams(detail) {
    var candidate = detail || {};
    if (candidate.params && typeof candidate.params === 'object') candidate = candidate.params;
    if (candidate.setup && typeof candidate.setup === 'object') candidate = candidate.setup;

    var callbackUrl = candidate.callback_url;
    if (!callbackUrl && candidate.home_assistant_url && candidate.webhook_id) {
      callbackUrl = String(candidate.home_assistant_url).replace(/\/$/, '') +
        '/api/webhook/' + String(candidate.webhook_id);
    }
    if (!callbackUrl) return null;
    if (!/^https?:\/\/[^\s]+$/i.test(callbackUrl)) {
      throw new Error('The supplied callback_url must be an HTTP or HTTPS URL.');
    }

    return {
      callback_url: callbackUrl,
      device_id: candidate.device_id || 'lg-webos-tv',
      device_name: candidate.device_name || 'LG webOS TV',
      debounce_ms: candidate.debounce_ms || 500,
      command_token: candidate.command_token || null,
      command_port: candidate.command_port || 49191
    };
  }

  function renderStatus(status) {
    var subscriptionStates = status.subscription_states || {};
    var subscriptionSummary = Object.keys(subscriptionStates).map(function (name) {
      return name + ': ' + subscriptionStates[name].state;
    }).join(' · ');
    clearError();
    callbackDisplay.textContent = status.callback_display || 'Not paired';
    processDisplay.textContent = status.running ? 'Running' : (status.paired ? 'Stopped' : 'Not configured');
    lunaDisplay.textContent = subscriptionSummary || status.monitor_state || 'Not started';
    commandDisplay.textContent = status.command_api_enabled ?
      ((status.command_api && status.command_api.state) || 'starting') +
        ' on port ' + status.command_api_port :
      'Disabled — re-pair with a command token';
    signalDisplay.textContent = status.last_dynamic_range ?
      status.last_dynamic_range + ' via ' + (status.last_source || 'unknown') : 'None yet';
    deliveryDisplay.textContent = status.last_delivery_at ?
      (status.last_delivery_status || 'delivered') + ' at ' + status.last_delivery_at : 'None yet';

    if (status.paired && status.running && status.monitor_healthy) {
      statusDot.className = 'status-dot ok';
      statusTitle.textContent = 'Paired and monitoring';
    } else if (status.paired && status.running && status.monitor_state === 'starting') {
      statusDot.className = 'status-dot pending';
      statusTitle.textContent = 'Starting registered Luna service…';
    } else if (status.paired && status.running) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Running, but Luna needs attention';
    } else if (status.paired) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Paired, but monitor is stopped';
    } else {
      statusDot.className = 'status-dot pending';
      statusTitle.textContent = 'Not paired';
    }
    if (status.last_error) {
      details.textContent = status.last_error;
      details.className = 'details visible';
    }
  }

  function refreshStatus() {
    setOperation('Refreshing…');
    lunaCall(SERVICE_URI + 'uiStatus', {}, function (error, response) {
      if (error) {
        showError(error.message);
        return;
      }
      if (!response.status) {
        showError('The bridge service returned no status.');
        return;
      }
      renderStatus(response.status);
      setOperation('Status refreshed');
    });
  }

  function pair(params) {
    setOperation('Saving pairing…');
    statusTitle.textContent = 'Pairing with Home Assistant…';
    lunaCall(SERVICE_URI + 'configure', params, function (error, response) {
      if (error) {
        showError(error.message);
        return;
      }
      if (response.status) renderStatus(response.status);
      else refreshStatus();
      setOperation('Pairing saved and test event sent');
    });
  }

  function handleLaunch(event) {
    var params;
    try {
      params = normalizeLaunchParams(event && event.detail ? event.detail : event);
    } catch (error) {
      showError(error.message);
      return;
    }
    if (params) pair(params);
    else refreshStatus();
    if (event && event.type === 'webOSRelaunch' &&
        typeof PalmSystem !== 'undefined' && PalmSystem.activate) {
      PalmSystem.activate();
    }
  }

  document.getElementById('refresh-button').addEventListener('click', refreshStatus);
  document.getElementById('restart-button').addEventListener('click', function () {
    setOperation('Restarting monitor…');
    exec(SETUP_SCRIPT + ' restart', function (error) {
      if (error) showError(error.message);
      else refreshStatus();
    });
  });
  document.getElementById('test-button').addEventListener('click', function () {
    setOperation('Sending test…');
    lunaCall(SERVICE_URI + 'testWebhook', {}, function (error, response) {
      if (error) showError(error.message);
      else {
        if (response.status) renderStatus(response.status);
        setOperation('Test event sent');
      }
    });
  });
  document.getElementById('clear-button').addEventListener('click', function () {
    setOperation('Clearing pairing…');
    exec(SETUP_SCRIPT + ' clear', function (error) {
      if (error) showError(error.message);
      else refreshStatus();
    });
  });

  document.addEventListener('webOSLaunch', handleLaunch, true);
  document.addEventListener('webOSRelaunch', handleLaunch, true);

  window.setTimeout(function () {
    if (statusTitle.textContent === 'Checking configuration…') refreshStatus();
  }, 1200);
}());
