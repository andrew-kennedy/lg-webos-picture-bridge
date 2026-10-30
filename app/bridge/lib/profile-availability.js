'use strict';

// Applicability is separate from storage validation. A successful saved-bank
// write says nothing about whether LG uses that control in the selected mode.
// This module never changes a TV setting. See docs/setting-availability.md.
const fs = require('fs');
const crypto = require('crypto');
const controls = require('./settings-controls');
const clone = value => JSON.parse(JSON.stringify(value));
const game = mode => /game$/i.test(mode || '');
const format = d => d.dynamicRange ? d.dynamicRange.replace(/ALLM$/, '') :
  (d.pictureMode || '').startsWith('dolbyHdr') ? 'dolbyHdr' : (d.pictureMode || '').startsWith('hdr') ? 'hdr' : 'sdr';
const physical = input => (input || '').replace(/_pc$/, '');
const unavailable = reason => ({state:'unavailable',editable:false,reason});
const unknown = reason => ({state:'unverified',editable:false,reason});
const groups = {
  brightnessActive:new Set(['backlight','contrast','brightness','gamma','gammaLevel','peakBrightness','hdrDynamicToneMapping','expressionEnhancer','dynamicContrast','nearBlackDetail']),
  colorActive:new Set(['color','tint','colorTemperature','colorGamut','dynamicColor']),
  clarityActive:new Set(['sharpness','superResolution','noiseReduction','mpegNoiseReduction','smoothGradation','realCinema','truMotionMode','truMotionJudder','truMotionBlur','motionProOLED','dolbyPrecisionDetail'])
};

// These policies were traced in this controller, not inferred from a firmware
// marketing version or from the existence of a database key.
const reviewedHash = '21f216519afd0db4dc7a57e0a086217634835afc3a74e094a4cc392a07709589';
let platform;
const capabilityRequests=new WeakMap();
function loadCapabilities(service) {
  if (capabilityRequests.has(service)) return capabilityRequests.get(service);
  const pending = new Promise(resolve => {
    let complete=false, request;
    const finish = payload => {
      if (complete) return;
      complete=true; clearTimeout(timer);
      const value=payload && payload.returnValue === true && payload.configs ? payload.configs['tv.model.dolbyVisionPrecisionDetail'] : undefined;
      resolve(typeof value === 'boolean' ? {dolbyPrecisionDetail:value} : {});
    };
    const timer=setTimeout(()=>{finish(null);if(request && request.cancel){try{request.cancel();}catch(_){}}},5000);
    try {
      request=service.call('luna://com.webos.service.config/getConfigs',
        {configNames:['tv.model.dolbyVisionPrecisionDetail']},message=>finish(message && message.payload || message));
    } catch (_) {finish(null);}
  });
  capabilityRequests.set(service,pending);
  return pending;
}
function reviewedPlatform() {
  if (platform !== undefined) return platform;
  try {
    const env = JSON.parse(fs.readFileSync('/var/luna/preferences/environmentCondition','utf8'));
    const hash = crypto.createHash('sha256').update(fs.readFileSync('/usr/lib/libpqc-ux-plugin.so.1.0.0')).digest('hex');
    platform = {reviewed:hash === reviewedHash && env.panelType === 'OLED' && env.initialPlatformVersion === '11' &&
      /O26/.test(String(env.boardTypeStr || '')),environment:env};
  } catch (_) { platform = {reviewed:false,environment:{}}; }
  return platform;
}

function matchesActive(target, context, current) {
  if (!context || !context.ready || !current || !current.dimension) return false;
  const d = target.dimension;
  if (physical(d.input || d.gameInput) !== physical(context.input)) return false;
  if (d.input && d.input !== context.input) return false;
  if (d.pictureMode && d.pictureMode !== context.mode) return false;
  if (d.dynamicRange && d.dynamicRange !== context.range) return false;
  if (target.app_id && target.app_id !== current.app_id) return false;
  return Object.entries(d).every(([k,v]) => current.dimension[k] === v);
}

function mappedMode(bank, document, values) {
  const d = bank.target.dimension;
  if (d.pictureMode) return d.pictureMode;
  if (!d.dynamicRange || !document) return null;
  const mappings = document.banks.filter(b => b.target.category === 'picture' &&
    physical(b.target.dimension.input) === physical(d.gameInput) && b.target.dimension.dynamicRange === d.dynamicRange);
  if (mappings.length !== 1) return null;
  return values(mappings[0]).pictureMode;
}

function restrictions(key, bank, options) {
  const d = bank.target.dimension, mode = mappedMode(bank,options.document,options.values);
  const range = format(d);
  if (bank.target.category === 'picture' && !d.dynamicRange) {
    if (game(mode) && ['contrast','brightness','color','sharpness'].includes(key))
      return unavailable('Game Optimizer uses its separate '+({brightness:'Black Level',color:'Color Depth'}[key] || key)+' control.');
    if (['gamma','gammaLevel'].includes(key) && range !== 'sdr') return unavailable('Gamma adjustments apply to SDR; this format uses its own transfer curve.');
    if (key === 'gammaLevel' && options.values(bank).gamma !== 'mediumHavingLevel')
      return unavailable('Requires the adjustable 2.2 Gamma option.');
    if (key === 'peakBrightness' && mode === 'game') return unavailable('LG locks Peak Brightness in SDR Game Optimizer.');
    if (key === 'realCinema' && game(mode)) return unavailable('LG disables Real Cinema in Game Optimizer.');
    if (key === 'hdrDynamicToneMapping' && range !== 'hdr') return unavailable('HDR tone mapping applies to HDR10/HLG, not SDR or Dolby Vision.');
    if (key === 'filmmakerAmbientLight' && !['filmMaker','hdrFilmMaker','dolbyHdrCinema'].includes(mode))
      return unavailable('Ambient Light Compensation is a Filmmaker preset control.');
    if (key === 'dolbyPrecisionDetail' && range !== 'dolbyHdr') return unavailable('Precision Detail requires Dolby Vision.');
    if (key === 'expressionEnhancer' && range === 'sdr') return unavailable('Expression Enhancer requires an HDR signal.');
    if (['truMotionJudder','truMotionBlur'].includes(key)) {
      if (game(mode)) return unavailable('LG disables motion interpolation adjustments in Game Optimizer.');
      const motion = options.document && options.document.banks.find(b => b.target.app_id &&
        b.target.dimension.input === d.input && b.target.dimension.pictureMode === mode);
      if (!motion || options.values(motion).truMotionMode !== 'user') return unavailable('Requires TruMotion User Selection in this preset.');
    }
  }
  if (d.gameGenre && !mode) return unknown('The picture preset mapping for this game bank has not been verified.');
  if (d.gameGenre && !game(mode)) return unavailable('This signal is mapped to a movie preset; Game Optimizer controls are not used.');
  if (key === 'lowLevelAdjustment') {
    const port = options.document && options.document.banks.find(b=>b.target.category==='other' &&
      b.target.dimension.gameInput===d.gameInput && !b.target.dimension.dynamicRange);
    const values = port && options.values(port);
    if (!values || values.gameOptimization === undefined || values.freesync === undefined)
      return unknown('VRR settings for this port have not been verified.');
    if (values.gameOptimization === 'off' && values.freesync === 'off')
      return unavailable('Fine Tune Dark Areas requires VRR & G-Sync or FreeSync.');
  }
  return null;
}

function describe(key, bank, info, options) {
  const reviewed = options.reviewed === undefined ? reviewedPlatform().reviewed : options.reviewed;
  if (!reviewed) return unknown('This TV software has not been verified for profile applicability.');
  if (key === 'dolbyPrecisionDetail' && options.capabilities && options.capabilities.dolbyPrecisionDetail === false)
    return unavailable('LG disables Dolby Precision Detail in this TV model configuration, for every preset.');
  const restriction = reviewed && restrictions(key,bank,options);
  if (restriction) return restriction;
  const active = matchesActive(bank.target,options.context,info.current);
  if (bank.target.category === 'picture' && key !== 'pictureMode') {
    const values = info.current && info.current.settings || {}, lock = values.isfMode && values.isfMode[bank.target.dimension.pictureMode];
    if (lock && lock !== 'none') return unavailable('This picture preset is locked by LG calibration settings.');
    for (const [group,keys] of Object.entries(groups))
      if (active && keys.has(key) && Object.hasOwn(values,group) && !values[group]) return unavailable('LG has disabled this picture settings group in the current context.');
  }
  let description = active ? info.live : info.factory;
  if (!description) return unknown('LG applicability has not been verified for this profile.');
  // The G6 runtime replaces the factory Gamma choices (including whether
  // adjustable 2.2 is offered). Its dependent fine control needs the same
  // confirmation; a stored mediumHavingLevel value is not that confirmation.
  if (!active && ['gamma','gammaLevel'].includes(key))
    return unknown('LG updates Gamma choices at runtime; activate this SDR profile to verify its Gamma controls.');
  // Runtime-only controls must be confirmed in the actual target context. A
  // hidden factory baseline is not a reliable hardware-support declaration.
  if (!active && ['dolbyPrecisionDetail','expressionEnhancer','ambientLightCompensation','aiHdrRemastering','motionEyeCare','inputOptimization'].includes(key))
    return unknown('This control depends on the live signal; activate this profile to verify availability.');
  if (!active && /_pc$/.test(bank.target.dimension.input || '') && ['realCinema','truMotionJudder','truMotionBlur'].includes(key))
    return unknown('PC motion processing depends on the live signal; activate this profile to verify availability.');
  if (!description.ui || description.ui.visible !== true || description.ui.active !== true)
    return unavailable(active ? 'LG disables or hides this control for the current signal and settings.' : 'LG does not enable this control in this input and preset.');
  description = clone(description);
  if (key === 'pictureMode' && description.values && description.values.arrayExt) {
    const allowed = {sdr:['filmMaker','game'],hdr:['hdrFilmMaker','hdrGame'],dolbyHdr:['dolbyHdrCinema','dolbyHdrCinemaBright','dolbyHdrGame']}[format(bank.target.dimension)] || [];
    description.values.arrayExt = description.values.arrayExt.filter(v=>allowed.includes(v.value));
  }
  if (key === 'hdrDynamicToneMapping' && !game(bank.target.dimension.pictureMode) && description.values && description.values.arrayExt)
    description.values.arrayExt = description.values.arrayExt.filter(v => v.value !== 'HGIG');
  let control;
  if (key === 'blackLevel') {
    const choices = (description.values && description.values.arrayExt || []).filter(v => v.active === true && v.visible === true && ['auto','high','low'].includes(v.value)).map(v => v.value);
    if (choices.length) control = {component:'select',options:choices,choices,data_type:'object'};
  } else control = controls.describe({key},description,info.value);
  if (!control) return unknown('LG has not supplied a valid writable range or choice for this profile.');
  // A historical value outside the currently allowed choices must still be
  // correctable. Availability comes from the target rules; encode validates
  // the replacement against those rules before any save.
  control.available = true;
  return {state:'editable',editable:true,source:active?'live':'native_rules',control};
}

function assertEditable(key, value, bank, inspection, options) {
  const result = describe(key,bank,{live:(inspection.descriptions || []).find(d=>d.key===key),
    factory:(inspection.factory_descriptions || {})[key],current:inspection.active_values,value:inspection.settings[key]},
    {...options,capabilities:inspection.capabilities || options.capabilities});
  if (!result.editable) {
    const error = new Error(key+': '+result.reason);error.code='profile_setting_unavailable';throw error;
  }
  if (key === 'blackLevel') {
    if (!value || Object.values(value).some(v=>!result.control.options.includes(v))) throw new Error('HDMI RGB range option is not available in this profile');
    return value;
  }
  return controls.encode(result.control,value);
}

module.exports = {describe,assertEditable,restrictions,matchesActive,reviewedPlatform,loadCapabilities,format};
