'use strict';

// Reviewed user controls only. TV descriptions supply live ranges/choices and
// applicability; they are not an authorization list (they include factory data).
var groups = {
  picture: ('pictureMode backlight contrast brightness color tint sharpness colorTemperature ' +
    'colorGamut gamma gammaLevel peakBrightness hdrDynamicToneMapping expressionEnhancer ' +
    'dynamicContrast dynamicColor superResolution noiseReduction mpegNoiseReduction smoothGradation ' +
    'realCinema truMotionMode truMotionJudder truMotionBlur motionPro motionEyeCare ' +
    'aiPicture aiHdrRemastering filmmakerAmbientLight filmMakerMode nearBlackDetail ' +
    'skinColor grassColor skyColor aspectRatio justScan energySaving energySavingAutoMin ' +
    'logoLuminanceAdjust').split(' '),
  sound: ('autoVolume soundOutputDigital inputAudioFormatHDMI1 inputAudioFormatHDMI2 ' +
    'inputAudioFormatHDMI3 inputAudioFormatHDMI4 volumeControl').split(' '),
  other: ('enableALLM gameOptimization freesync qmsVrr uhdDeepColor gameGenre ' +
    'blackStabilizer whiteStabilizer gameAdjustContrast gameBlackLevel gameColorDepth gameSharpness ' +
    'darkMode inputOptimization preventInputDelay enable144HzBooster enableMotionBooster ' +
    'enableQFT enableDolbyVisionPC crosshair fpsCounter gameUIColor gameScreenRatio gameScreenSize gameScreenPosition ' +
    'simplinkEnable simplinkAutoPowerOn').split(' ')
};
var names = {
  backlight: 'OLED pixel brightness', brightness: 'Black level', color: 'Color depth',
  hdrDynamicToneMapping: 'HDR tone mapping', gameOptimization: 'VRR and G-Sync',
  enableALLM: 'Auto low latency', uhdDeepColor: 'HDMI Deep Color', qmsVrr: 'Quick Media Switching',
  soundOutputDigital: 'Digital sound output',
  truMotionJudder: 'TruMotion de-judder', truMotionBlur: 'TruMotion de-blur'
};
function label(key) {
  return names[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/HDMI(\d)/g, 'HDMI $1')
    .replace(/^./, function (s) { return s.toUpperCase(); });
}
var entries = [];
Object.keys(groups).forEach(function (category) {
  groups[category].forEach(function (key) {
    entries.push({id: category + '_' + key, category: category, key: key,
      name: (category === 'other' ? 'Gaming / HDMI' : label(category)) + ': ' + label(key)});
  });
});
// Remove retained discovery for controls retired from earlier versions.
var retired = {
  picture: 'eyeComfortMode screenShift',
  general: 'homeAutoLaunch homePromotion powerOnScreen noSignalScreenSaver screenSaverAd screenSaverEnabled personalRecommend aiSettingsNudge aiNudge sportsAlarm remotePointer',
  option: 'audioGuidance audioGuidanceSpeed audioGuidancePitch audioGuidanceVolume highContrast greyscale colorInversion focusEmphasis focusedItemEnlarged menuTransparency helpOnSettings pointerSize pointerSpeed pointerAlignment standByLight powerOnLight quickStartMode hddEcoMode enableToastPopup longPressInterval repeatInterval remoteSlowInput subtitleMode closedCaption signLanguageGuidance signLanguageGuidanceSize signLanguageGuidanceSpeed screenSaverTimer',
  sound: 'volumeStep audioDescription audioDescriptionVolume tvPowerSound tvSetupConfiguration audioBalance avSync avSyncBypass avSyncBypassInput avSyncSpdif avSyncSpeaker avSyncBtSoundbar avSyncBtSurround avSyncWisa soundMode clearVoice aiSound aigamesound soundOptimizer eArcSupport lgSoundSync soundModeSync virtualSurround supportATMOS',
  other: 'contentRecommendation screenRemoteAutoShow blueLight'
};
var retiredIds = [];
Object.keys(retired).forEach(function (category) {
  retired[category].split(' ').forEach(function (key) { retiredIds.push(category + '_' + key); });
});
module.exports = {entries: entries, groups: groups, retiredIds: retiredIds};
