'use strict';

var crypto = require('crypto');
var policy = require('./cec-policy');
var TARGET = '/usr/palm/applications/com.webos.app.inputcommon/qml/Model/Simplink.qml';
var ORIGINAL_SHA256 = 'ad7752a5211385a019dd3aa80a5333fc663481c94d3912c80884c0976d55584c';
var POLICY_URL = 'file:///tmp/lgpb-apple-tv-cec/lease.json';
var CALL = '            externalService.setCecUniqueId(pipelineId, uniqueId);';

// ES5: this function also runs inside the C9's QML engine, not its web browser.
function validLease(lease, now) {
  return !!lease && lease.schema === 2 && lease.enabled === true &&
    typeof lease.issued_at === 'number' && isFinite(lease.issued_at) &&
    typeof lease.expires_at === 'number' && isFinite(lease.expires_at) &&
    typeof now === 'number' && isFinite(now) && now >= lease.issued_at && now < lease.expires_at &&
    lease.expires_at > lease.issued_at && lease.expires_at - lease.issued_at <= 90000;
}

function digest(source) { return crypto.createHash('sha256').update(source).digest('hex'); }
function checkOriginal(source) {
  if (digest(source) !== ORIGINAL_SHA256) throw new Error('Unsupported or modified Simplink.qml; CEC filter not applied');
}

function inject(source) {
  var text = source.toString('utf8');
  var anchor = '    function _setCecEnable() {';
  if (text.split(CALL).length !== 2 || text.split(anchor).length !== 2 || text.indexOf('_lgpbCec') !== -1) {
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
    '                    globalVars.appId, globalVars.launchParam.launchUniqueId, uniqueId,',
    '                    inputInfoModel ? inputInfoModel.subList : null);',
    '                if (lgpbRule) {',
    '                    console.log("LGPB_CEC_GUARD blocked automatic_selection rule=" + lgpbRule);',
    '                    return;',
    '                }',
    '            } catch (lgpbError) { console.log("LGPB_CEC_GUARD failed open: " + lgpbError); }',
    CALL
  ].join('\n');
  return text.replace(CALL, condition).replace(anchor, helpers + '\n' + anchor);
}

module.exports = {TARGET: TARGET, ORIGINAL_SHA256: ORIGINAL_SHA256, POLICY_URL: POLICY_URL,
  REVISION: 2, digest: digest, checkOriginal: checkOriginal,
  validLease: validLease, injectForTest: inject,
  build: function (source) { checkOriginal(source); return inject(source); }};
