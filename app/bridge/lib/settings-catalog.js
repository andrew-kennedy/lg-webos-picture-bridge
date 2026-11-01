'use strict';

var view = require('../../profile-view');

// Reviewed user controls only. TV descriptions supply live ranges/choices and
// applicability; they are not an authorization list (they include factory data).
var groups = {
  picture: ('pictureMode backlight contrast brightness color tint sharpness colorTemperature ' +
    'colorGamut gamma gammaLevel peakBrightness hdrDynamicToneMapping expressionEnhancer ' +
    'dynamicContrast dynamicColor superResolution noiseReduction mpegNoiseReduction smoothGradation ' +
    'realCinema truMotionMode truMotionJudder truMotionBlur motionPro ' +
    'aiPicture aiHdrRemastering filmmakerAmbientLight nearBlackDetail ' +
    'skinColor grassColor skyColor aspectRatio justScan ' +
    'logoLuminanceAdjust').split(' '),
  sound: ('autoVolume soundOutputDigital inputAudioFormatHDMI1 inputAudioFormatHDMI2 ' +
    'inputAudioFormatHDMI3 inputAudioFormatHDMI4 volumeControl').split(' '),
  other: ('enableALLM gameOptimization freesync qmsVrr uhdDeepColor gameGenre ' +
    'blackStabilizer whiteStabilizer gameAdjustContrast gameBlackLevel gameColorDepth gameSharpness ' +
    'darkMode inputOptimization preventInputDelay enable144HzBooster enableMotionBooster ' +
    'enableQFT enableDolbyVisionPC crosshair fpsCounter gameUIColor gameScreenRatio gameScreenSize gameScreenPosition ' +
    'simplinkEnable simplinkAutoPowerOn').split(' ')
};
// Entity names use the editor's titles (profile-view), so HA and the editor agree.
var prefixes = {picture: 'Picture', sound: 'Sound', other: 'Gaming / HDMI'};
function label(key, description) {
  // LG retains the old key on 165 Hz panels. Only advertise a rate confirmed
  // by this TV's description; the key itself does not identify the limit.
  var rate = description && description.condition && String(description.condition.panelOutputFrameRate);
  if (key === 'enable144HzBooster' && ['144', '165'].indexOf(rate) !== -1) return rate + ' Hz boost';
  return view.title(key);
}
var entries = [];
Object.keys(groups).forEach(function (category) {
  groups[category].forEach(function (key) {
    entries.push({id: category + '_' + key, category: category, key: key,
      name: prefixes[category] + ': ' + label(key)});
  });
});
// Remove retained discovery for controls retired from earlier versions.
// filmMakerMode (0.22.2): a TV-wide on/off that read on in nearly every preset,
// Game and Dolby Vision included. LG's Settings app never offers it as a control
// (it only reads its visibility; FILMMAKER MODE Auto Start is filmMakerAutoChange),
// so what writing it does is unknown.
var retired = {
  picture: 'eyeComfortMode screenShift energySaving energySavingAutoMin motionEyeCare filmMakerMode',
  general: 'homeAutoLaunch homePromotion powerOnScreen noSignalScreenSaver screenSaverAd screenSaverEnabled personalRecommend aiSettingsNudge aiNudge sportsAlarm remotePointer',
  option: 'audioGuidance audioGuidanceSpeed audioGuidancePitch audioGuidanceVolume highContrast greyscale colorInversion focusEmphasis focusedItemEnlarged menuTransparency helpOnSettings pointerSize pointerSpeed pointerAlignment standByLight powerOnLight quickStartMode hddEcoMode enableToastPopup longPressInterval repeatInterval remoteSlowInput subtitleMode closedCaption signLanguageGuidance signLanguageGuidanceSize signLanguageGuidanceSpeed screenSaverTimer',
  sound: 'volumeStep audioDescription audioDescriptionVolume tvPowerSound tvSetupConfiguration audioBalance avSync avSyncBypass avSyncBypassInput avSyncSpdif avSyncSpeaker avSyncBtSoundbar avSyncBtSurround avSyncWisa soundMode clearVoice aiSound aigamesound soundOptimizer eArcSupport lgSoundSync soundModeSync virtualSurround supportATMOS',
  other: 'contentRecommendation screenRemoteAutoShow blueLight'
};
var retiredIds = [];
Object.keys(retired).forEach(function (category) {
  retired[category].split(' ').forEach(function (key) { retiredIds.push(category + '_' + key); });
});
module.exports = {entries: entries, groups: groups, retiredIds: retiredIds, label: label};
