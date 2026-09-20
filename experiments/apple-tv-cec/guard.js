'use strict';

// This experiment is deliberately outside app/: no installation or startup hook.
var crypto = require('crypto');
var TARGET = '/usr/palm/applications/com.webos.app.inputcommon/qml/Model/Simplink.qml';
var ORIGINAL_SHA256 = 'ad7752a5211385a019dd3aa80a5333fc663481c94d3912c80884c0976d55584c';
var CALL = '            externalService.setCecUniqueId(pipelineId, uniqueId);';

// ES5 only: this function is also inserted into the C9's Qt 5 QML JavaScript.
// Unknown, ambiguous, explicit, expired, or non-Apple requests keep LG behavior.
function shouldSuppress(appId, launchUniqueId, uniqueId, devices, now, started, expires) {
    if (appId !== 'com.webos.app.hdmi3' || launchUniqueId) return false;
    if (typeof now !== 'number' || !isFinite(now) || now < started || now >= expires) return false;
    if (!uniqueId || !devices || !Array.isArray(devices)) return false;
    var selected = null;
    for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        if (device && String(device.uniqueId) === String(uniqueId)) {
            if (selected) return false; // Do not guess if discovery is ambiguous.
            selected = device;
        }
    }
    return !!selected && selected.id === 'SIMPLINK' &&
        Number(selected.portId) === 3 && Number(selected.vendorId) === 4346 &&
        Number(selected.cecpDevType) === 4 &&
        typeof selected.osdName === 'string' &&
        selected.osdName.toLowerCase().replace(/\s+/g, '') === 'appletv';
}

function digest(source) {
    return crypto.createHash('sha256').update(source).digest('hex');
}

function checkOriginal(source) {
    if (digest(source) !== ORIGINAL_SHA256) {
        throw new Error('Unsupported or already modified Simplink.qml; refusing to patch');
    }
}

function inject(source, started, expires) {
    if (!isFinite(started) || !isFinite(expires) || started % 1 || expires % 1 ||
            expires - started < 30000 || expires - started > 600000) {
        throw new Error('Trial must last 30 to 600 seconds');
    }
    var text = source.toString('utf8');
    if (text.split(CALL).length !== 2 || text.indexOf('_lgpbShouldSuppress') !== -1) {
        throw new Error('Unexpected CEC call site; refusing to patch');
    }
    var predicate = shouldSuppress.toString().replace('function shouldSuppress', 'function _lgpbShouldSuppress');
    var condition = [
        '            // Temporary LG Picture Bridge trial; no global CEC settings changed.',
        '            try {',
        '                console.log("LGPB_CEC_TRIAL evaluating automatic selection: " + uniqueId);',
        '                if (_lgpbShouldSuppress(globalVars.appId,',
        '                        globalVars.launchParam.launchUniqueId, uniqueId,',
        '                        inputInfoModel ? inputInfoModel.subList : null,',
        '                        Date.now(), ' + started + ', ' + expires + ')) {',
        '                    console.log("LGPB_CEC_TRIAL suppressed Apple TV automatic selection");',
        '                    return;',
        '                }',
        '            } catch (lgpbError) {',
        '                console.log("LGPB_CEC_TRIAL failed open: " + lgpbError);',
        '            }',
        CALL
    ].join('\n');
    text = text.replace(CALL, condition);
    var anchor = '    function _setCecEnable() {';
    if (text.split(anchor).length !== 2) throw new Error('Unexpected QML function layout');
    return text.replace(anchor, '    ' + predicate + '\n\n' + anchor);
}

function build(source, started, expires) {
    checkOriginal(source);
    return inject(source, started, expires);
}

module.exports = {
    TARGET: TARGET, ORIGINAL_SHA256: ORIGINAL_SHA256, digest: digest,
    shouldSuppress: shouldSuppress, checkOriginal: checkOriginal, build: build,
    injectForTest: inject
};
