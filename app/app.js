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
  var testButton = document.getElementById('test-button');
  var reportingHelp = document.getElementById('reporting-help');
  var content = document.getElementById('content');
  var cecButton = document.getElementById('cec-button');
  var cecDisplay = document.getElementById('cec-display');
  var cecEnabled = false;
  var actionButtons = ['refresh-button', 'restart-button', 'test-button', 'cec-button', 'clear-button'].map(function (id) {
    return document.getElementById(id);
  });
  var bridges = [];
  var busy = false;
  var configurationGeneration = 0;

  function setOperation(message) {
    operationDisplay.textContent = message;
  }

  function showError(message) {
    statusDot.className = 'status-dot error';
    statusTitle.textContent = 'Setup needs attention';
    details.textContent = message;
    details.className = 'details visible';
    setOperation('Failed: ' + message);
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
        callback(new Error('Invalid response from the requested TV service.'));
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
    if (!callbackUrl && !candidate.mqtt) return null;
    if (callbackUrl && !/^https?:\/\/[^\s]+$/i.test(callbackUrl)) {
      throw new Error('The supplied callback_url must be an HTTP or HTTPS URL.');
    }

    return {
      callback_url: callbackUrl,
      mqtt: candidate.mqtt || null,
      transport: candidate.transport || (candidate.mqtt ? (callbackUrl ? 'both' : 'mqtt') : 'webhook'),
      device_id: candidate.device_id || 'lg-webos-tv',
      device_name: candidate.device_name || 'LG webOS TV',
      debounce_ms: candidate.debounce_ms || 500,
      command_token: candidate.command_token || null,
      command_port: candidate.command_port || 49191
    };
  }

  function renderStatus(status) {
    var configured = status.configured === undefined ? status.paired : status.configured;
    var usesMqtt = status.transport === 'mqtt' || status.transport === 'both';
    var usesWebhook = status.transport === 'webhook' || status.transport === 'both';
    var cec = status.cec_guard || {};
    cecEnabled = cec.enabled === true;
    cecButton.disabled = !cecEnabled && (!configured || !cec.supported);
    cecButton.textContent = 'CEC filtering: ' + (cecEnabled ? 'On' : 'Off');
    cecDisplay.textContent = cec.last_error ? 'Needs attention: ' + cec.last_error :
      (cec.migration_required ? 'Needs a policy from Home Assistant (legacy setting is not a rule)' :
      !cec.supported ? 'Unavailable on this firmware' : cecEnabled ?
        (cec.lease_active ? 'On · ' + ((cec.policy && cec.policy.rules.length) || 0) + ' HA-configured rules; SIMPLINK unchanged' : 'On, but no active filter · configure rules in HA') :
        'Off · LG default behavior');
    var mqttState = !status.running ? 'stopped' : (status.mqtt && status.mqtt.state) || 'starting';
    var mqttCommands = status.mqtt_commands_enabled === undefined ?
      status.mqtt && status.mqtt.commands_enabled : status.mqtt_commands_enabled;
    var subscriptionStates = status.subscription_states || {};
    var subscriptionSummary = Object.keys(subscriptionStates).map(function (name) {
      return name + ': ' + subscriptionStates[name].state;
    }).join(' · ');
    clearError();
    callbackDisplay.textContent = usesMqtt ?
      'MQTT discovery' + (usesWebhook ? ' + legacy webhook' : '') :
      (status.callback_display ? 'Legacy webhook: ' + status.callback_display : 'Not configured');
    processDisplay.textContent = status.running ? 'Running' : (configured ? 'Stopped' : 'Not configured');
    lunaDisplay.textContent = status.running ?
      subscriptionSummary || status.monitor_state || 'Starting' : 'Not running';
    var commandStates = [];
    if (usesMqtt) {
      commandStates.push(!mqttCommands ? 'MQTT disabled (mqtt.commands_enabled is false)' :
        (status.running && mqttState === 'connected' && status.mqtt.commands_ready ?
          'MQTT listener ready' : mqttState === 'connected' ?
            'MQTT waiting for command subscription' : 'MQTT not ready (' + mqttState + ')'));
    }
    if (status.command_api_enabled) {
      commandStates.push('HTTP ' + (!status.running ? 'stopped' :
        (status.command_api && status.command_api.state) || 'starting') + ' on port ' + status.command_api_port);
    }
    commandDisplay.textContent = commandStates.join(' · ') || 'Disabled';
    testButton.textContent = usesMqtt || !configured ? (usesWebhook ? 'Republish + test webhook' : 'Republish discovery') :
      'Send webhook test';
    testButton.disabled = !configured;
    reportingHelp.textContent = 'Status refreshes every 5 seconds while visible. ' + (usesMqtt ?
      'Republish discovery resends discovery, current state and availability; it does not change picture settings ' +
      'or confirm Home Assistant received them.' + (usesWebhook ? ' It also sends a legacy webhook test.' : '') :
      'A webhook HTTP response does not confirm an automation ran.');
    signalDisplay.textContent = status.last_dynamic_range ?
      status.last_dynamic_range + ' via ' + (status.last_source || 'unknown') : 'None yet';
    deliveryDisplay.textContent = status.last_delivery_at ?
      (status.last_delivery_status || 'HTTP response') + ' at ' + status.last_delivery_at : 'None yet';
    if (usesMqtt) {
      deliveryDisplay.textContent = 'Broker: ' + mqttState +
        (status.mqtt && status.mqtt.last_published_at ? ' · last publish submitted: ' + status.mqtt.last_published_at : '') +
        (usesWebhook ? ' · Webhook: ' + (status.last_delivery_status || 'no response yet') : '');
    }
    if (status.hdmi_signal) {
      signalDisplay.textContent += ' · HDMI signal: ' +
        (status.hdmi_signal.signal_present === true ? 'present' :
          (status.hdmi_signal.signal_present === false ? 'no signal' : 'unknown'));
    }

    if (configured && status.running && usesMqtt && mqttState !== 'connected') {
      statusDot.className = 'status-dot pending';
      statusTitle.textContent = 'Configured · broker ' + mqttState;
    } else if (configured && status.running && status.monitor_healthy) {
      statusDot.className = 'status-dot ok';
      statusTitle.textContent = usesMqtt ? 'Monitoring · broker connected' : 'Monitoring · legacy webhook configured';
    } else if (configured && status.running && status.monitor_state === 'starting') {
      statusDot.className = 'status-dot pending';
      statusTitle.textContent = 'Starting registered Luna service…';
    } else if (configured && status.running) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Running, but Luna needs attention';
    } else if (configured) {
      statusDot.className = 'status-dot error';
      statusTitle.textContent = 'Configured, but monitor is stopped';
    } else {
      statusDot.className = 'status-dot pending';
      statusTitle.textContent = 'Not configured';
    }
    if (status.last_error || (status.mqtt && status.mqtt.last_error)) {
      details.textContent = status.last_error || status.mqtt.last_error;
      details.className = 'details visible';
    }
  }

  function refreshStatus(quiet) {
    if (busy) return;
    busy = true;
    var generation = configurationGeneration;
    if (!quiet) setOperation('Refreshing…');
    lunaCall(SERVICE_URI + 'uiStatus', {}, function (error, response) {
      if (generation !== configurationGeneration) return;
      busy = false;
      if (error) {
        showError(error.message);
        return;
      }
      if (!response.status) {
        showError('The bridge service returned no status.');
        return;
      }
      renderStatus(response.status);
      if (!quiet) setOperation('Status refreshed');
    });
  }

  function configure(params) {
    configurationGeneration += 1;
    var generation = configurationGeneration;
    busy = true;
    setOperation('Saving configuration…');
    statusTitle.textContent = 'Configuring bridge…';
    lunaCall(SERVICE_URI + 'configure', params, function (error, response) {
      if (generation !== configurationGeneration) return;
      busy = false;
      if (error) {
        showError(error.message);
        return;
      }
      if (response.status) renderStatus(response.status);
      else refreshStatus();
      setOperation('Configuration saved · check connection status above');
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
    if (params) configure(params);
    else refreshStatus();
    if (event && event.type === 'webOSRelaunch' &&
        typeof PalmSystem !== 'undefined' && PalmSystem.activate) {
      PalmSystem.activate();
    }
  }

  document.getElementById('refresh-button').addEventListener('click', function () { refreshStatus(false); });
  document.getElementById('restart-button').addEventListener('click', function () {
    if (busy) return;
    busy = true;
    setOperation('Restarting monitor…');
    exec(SETUP_SCRIPT + ' restart', function (error) {
      busy = false;
      if (error) showError(error.message);
      else refreshStatus();
    });
  });
  testButton.addEventListener('click', function () {
    if (busy || testButton.disabled) return;
    busy = true;
    setOperation('Refreshing reporting…');
    lunaCall(SERVICE_URI + 'refreshReporting', {}, function (error, response) {
      busy = false;
      if (error) showError(error.message);
      else {
        if (response.status) renderStatus(response.status);
        var results = [];
        if (response.mqtt_submitted) results.push('MQTT republish submitted (HA receipt not confirmed)');
        if (response.webhook_status) results.push('Webhook HTTP ' + response.webhook_status + ' (automation not verified)');
        setOperation(results.join(' · ') || 'No reporting result returned');
      }
    });
  });
  document.getElementById('clear-button').addEventListener('click', function () {
    if (busy || !window.confirm('Remove saved broker/webhook configuration and stop monitoring? ' +
        'Home Assistant entities are not deleted. You will need to configure the bridge again.')) return;
    busy = true;
    setOperation('Removing configuration…');
    exec(SETUP_SCRIPT + ' clear', function (error) {
      busy = false;
      if (error) showError(error.message);
      else {
        // Clearing also removes Luna permissions; do not call the now-disabled service.
        renderStatus({configured: false, running: false});
        setOperation('Configuration removed · monitoring stopped');
      }
    });
  });

  cecButton.addEventListener('click', function () {
    if (busy || cecButton.disabled) return;
    if (!window.confirm(cecEnabled ?
      'Turn off CEC filtering and restore LG’s normal behavior? Your HA-configured rules will be kept.' :
      'Enable the rules configured by Home Assistant? Installing the removable firmware-specific overlay ' +
      'may briefly restart HDMI apps. No devices are blocked unless a rule matches. SIMPLINK stays enabled.')) return;
    busy = true;
    setOperation(cecEnabled ? 'Restoring LG CEC behavior…' : 'Enabling configured CEC rules…');
    lunaCall(SERVICE_URI + 'setCecGuard', {enabled: !cecEnabled}, function (error, response) {
      busy = false;
      if (error) showError(error.message);
      else {
        if (response.status) renderStatus(response.status);
        setOperation(cecEnabled ? 'CEC filtering enabled · rules managed in Home Assistant' :
          'CEC filtering off · LG default behavior restored');
      }
    });
  });

  document.addEventListener('webOSLaunch', handleLaunch, true);
  document.addEventListener('webOSRelaunch', handleLaunch, true);

  // The remote can scroll long status/errors without moving the always-visible actions.
  // Leave OK/Enter, Back, and pointer clicks to their native behavior.
  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var key = event.keyCode || event.which;
    if (key === 38 || key === 40) {
      content.scrollTop += (key === 38 ? -1 : 1) * Math.max(120, content.clientHeight * 0.6);
      event.preventDefault();
    } else if (key === 37 || key === 39) {
      var enabled = actionButtons.filter(function (button) { return !button.disabled; });
      var index = enabled.indexOf(document.activeElement);
      if (!enabled.length) return;
      index = index === -1 ? 0 : (index + (key === 37 ? -1 : 1) + enabled.length) % enabled.length;
      enabled[index].focus();
      event.preventDefault();
    }
  });

  window.setTimeout(function () {
    if (statusTitle.textContent === 'Checking configuration…') refreshStatus();
  }, 1200);
  window.setInterval(function () {
    if (!document.hidden && statusTitle.textContent !== 'Not configured') refreshStatus(true);
  }, 5000);
}());
