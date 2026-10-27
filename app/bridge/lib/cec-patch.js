'use strict';

var crypto = require('crypto');
var policy = require('./cec-policy');
var TARGET = '/usr/palm/applications/com.webos.app.inputcommon/qml/Interfaces/ExternalDeviceControlInterfaces/SimplinkController.qml';
// Inspected OLED77G6WUA originals. Unknown firmware still fails open.
var ORIGINAL_SHA256S = [
  'bca78199aadfb7e216123246d04cc6be46e2cc895a6b620633a64dd83e462340', // 43.11.73
  'fd83da3f644de97d634620f8f7d1dda1c66ed756297c90df6a0902760cbb7b66' // 43.21.69
];
var POLICY_URL = 'file:///tmp/lgpb-apple-tv-cec/lease.json';
var CALL = '        setCECUniqueId(cecUniqueId, portId);';
var CLEAR_SELECTION = '        deeplinkHandler.launchUniqueId = "";';

// This function also runs inside the TV's native QML engine.
function validLease(lease, now) {
  return !!lease && lease.schema === 2 && lease.enabled === true &&
    typeof lease.issued_at === 'number' && isFinite(lease.issued_at) &&
    typeof lease.expires_at === 'number' && isFinite(lease.expires_at) &&
    typeof now === 'number' && isFinite(now) && now >= lease.issued_at && now < lease.expires_at &&
    lease.expires_at > lease.issued_at && lease.expires_at - lease.issued_at <= 90000;
}

function digest(source) { return crypto.createHash('sha256').update(source).digest('hex'); }
function checkOriginal(source) {
  if (ORIGINAL_SHA256S.indexOf(digest(source)) === -1) throw new Error('Unsupported or modified SimplinkController.qml; CEC filter not applied');
}

function inject(source) {
  var text = source.toString('utf8');
  var anchor = '    function _setCecUniqueId () {';
  if (text.split(CALL).length !== 2 || text.split(anchor).length !== 2 ||
      text.split(CLEAR_SELECTION).length !== 2 || text.indexOf('_lgpbCec') !== -1) {
    throw new Error('Unexpected QML layout; CEC filter not applied');
  }
  var helpers = [
    '    ' + policy.matchingRule.toString().replace('function matchingRule', 'function _lgpbCecMatchingRule'),
    '    ' + validLease.toString().replace('function validLease', 'function _lgpbCecValidLease'),
    '    function _lgpbCecPolicy() {',
    '        try {',
    '            var request = new XMLHttpRequest();',
    '            request.open("GET", "' + POLICY_URL + '", false);',
    '            request.send();',
    '            if (request.status !== 0 && request.status !== 200) return null;',
    '            var lease = JSON.parse(request.responseText);',
    '            return _lgpbCecValidLease(lease, Date.now()) ? lease.policy : null;',
    '        } catch (error) { return null; }',
    '    }',
    ''
  ].join('\n');
  var condition = [
    '            // Optional LG Picture Bridge filter. Missing/expired policy keeps LG behavior.',
    '            try {',
    '                var lgpbRule = _lgpbCecMatchingRule(_lgpbCecPolicy(), "automatic_selection",',
    '                    "com.webos.app.hdmi" + portId, launchUniqueId, cecUniqueId, subList);',
    '                if (lgpbRule) {',
    '                    console.log("LGPB_CEC_GUARD blocked automatic_selection rule=" + lgpbRule + " device=" + cecUniqueId);',
    '                    return;',
    '                }',
    '            } catch (lgpbError) { console.log("LGPB_CEC_GUARD failed open: " + lgpbError); }',
    CALL
  ].join('\n');
  // LG's explicit-selection handler assigns this property, replacing its QML
  // binding to deeplinkHandler. Clearing only the latter leaves a stale device
  // ID across standby and incorrectly bypasses the automatic-selection filter.
  // Restore the binding when HDMI is minimized; fresh explicit selections still
  // take the normal LG path on the next launch.
  var clearSelection = CLEAR_SELECTION + '\n' +
    '        launchUniqueId = Qt.binding(function () { return deeplinkHandler.launchUniqueId; });';
  return text.replace(CALL, condition).replace(CLEAR_SELECTION, clearSelection)
    .replace(anchor, helpers + '\n' + anchor);
}

module.exports = {TARGET: TARGET, ORIGINAL_SHA256S: ORIGINAL_SHA256S, POLICY_URL: POLICY_URL,
  REVISION: 5, digest: digest, checkOriginal: checkOriginal,
  validLease: validLease, injectForTest: inject,
  build: function (source) { checkOriginal(source); return inject(source); }};
