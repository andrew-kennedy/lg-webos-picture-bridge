'use strict';

var CONTEXTS = [
  'sdr',
  'sdrALLM',
  'hdr',
  'hdrALLM',
  'hlg',
  'hlgALLM',
  'dolbyHdr',
  'dolbyHdrALLM',
  'technicolorHdr',
  'technicolorHdrALLM'
];
var CONTEXT_LOOKUP = {};
CONTEXTS.forEach(function (name) { CONTEXT_LOOKUP[name] = true; });

function policyError(message, code, statusCode) {
  var error = new Error(message);
  error.code = code || 'invalid_policy';
  error.statusCode = statusCode || 400;
  return error;
}

function validateName(value, label) {
  var text = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(text)) {
    throw policyError(label + ' contains unsupported characters');
  }
  return text;
}

function cloneValue(value, depth) {
  var result;
  if (depth > 4) throw policyError('Picture setting values may not exceed four levels');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 2048) throw policyError('Picture setting strings must be shorter than 2048 characters');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) throw policyError('Picture setting arrays may not exceed 256 values');
    return value.map(function (item) { return cloneValue(item, depth + 1); });
  }
  if (value && typeof value === 'object') {
    result = {};
    Object.keys(value).sort().forEach(function (key) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
        throw policyError('Picture setting object key contains unsupported characters: ' + key);
      }
      result[key] = cloneValue(value[key], depth + 1);
    });
    return result;
  }
  throw policyError('Picture setting values must be JSON values');
}

function normalizeSettings(input, label) {
  var source = input || {};
  var result = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw policyError(label + ' must be an object');
  }
  if (Object.keys(source).length > 128) {
    throw policyError(label + ' may not contain more than 128 settings');
  }
  Object.keys(source).sort().forEach(function (key) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
      throw policyError('Unsupported picture setting key: ' + key);
    }
    result[key] = cloneValue(source[key], 0);
  });
  return result;
}

function normalize(input) {
  var source = input || {};
  var modes = {};
  var presets = {};
  var scope = source.scope || 'all';
  var requestId = source.request_id === undefined ? null : String(source.request_id);
  var inputName;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw policyError('Picture policy must be a JSON object');
  }
  if (scope !== 'all' && scope !== 'active') {
    throw policyError('scope must be all or active');
  }
  inputName = validateName(source.input, 'input');
  if (!/^hdmi[1-4](?:_pc)?$/.test(inputName)) {
    throw policyError('input must be hdmi1 through hdmi4, optionally with _pc');
  }
  if (!source.modes || typeof source.modes !== 'object' || Array.isArray(source.modes)) {
    throw policyError('modes must be an object');
  }
  CONTEXTS.forEach(function (context) {
    if (source.modes[context] !== undefined && source.modes[context] !== null &&
        String(source.modes[context]).length > 0) {
      modes[context] = validateName(source.modes[context], 'picture mode');
    }
  });
  Object.keys(source.modes).forEach(function (context) {
    if (!CONTEXT_LOOKUP[context]) throw policyError('Unsupported dynamic-range context: ' + context);
  });
  if (Object.keys(modes).length === 0) throw policyError('modes must contain at least one mapping');

  if (!source.presets || typeof source.presets !== 'object' || Array.isArray(source.presets)) {
    throw policyError('presets must be an object');
  }
  Object.keys(source.presets).sort().forEach(function (mode) {
    var preset = source.presets[mode] || {};
    var normalizedMode = validateName(mode, 'preset name');
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
      throw policyError('Preset ' + normalizedMode + ' must be an object');
    }
    presets[normalizedMode] = {
      settings: normalizeSettings(preset.settings, 'Preset ' + normalizedMode + ' settings'),
      current_app_settings: normalizeSettings(
        preset.current_app_settings,
        'Preset ' + normalizedMode + ' current_app_settings'
      )
    };
  });
  Object.keys(modes).forEach(function (context) {
    if (!presets[modes[context]]) {
      throw policyError('Missing preset definition for picture mode ' + modes[context]);
    }
  });
  if (requestId && requestId.length > 128) throw policyError('request_id must be shorter than 128 characters');

  return {
    request_id: requestId,
    input: inputName,
    scope: scope,
    modes: modes,
    presets: presets,
    dry_run: source.dry_run === true
  };
}

function baseInput(value) {
  return String(value || '').replace(/_pc$/, '');
}

function contextFallbacks(context) {
  var raw = String(context.raw_dynamic_range || '');
  var normalized = String(context.dynamic_range || '');
  var allm = /ALLM$/i.test(raw);
  var candidates = [raw];
  if (normalized === 'sdr') candidates.push(allm ? 'sdrALLM' : 'sdr', 'sdr');
  else if (normalized === 'dolby_vision') {
    candidates.push(allm ? 'dolbyHdrALLM' : 'dolbyHdr', 'dolbyHdr');
  } else if (normalized === 'hlg') {
    candidates.push(allm ? 'hlgALLM' : 'hlg', allm ? 'hdrALLM' : 'hdr', 'hdr');
  } else if (normalized === 'hdr10') {
    candidates.push(allm ? 'hdrALLM' : 'hdr', 'hdr');
  }
  return candidates.filter(function (candidate, index) {
    return candidate && candidates.indexOf(candidate) === index;
  });
}

function activeMapping(policy, currentContext) {
  var selected = null;
  if (!currentContext || !currentContext.input || !currentContext.raw_dynamic_range) {
    throw policyError('The TV has not reported an active picture context yet', 'context_unavailable', 409);
  }
  if (baseInput(policy.input) !== baseInput(currentContext.input)) {
    throw policyError(
      'Requested ' + policy.input + ' while the active TV input is ' + currentContext.input,
      'stale_input',
      409
    );
  }
  contextFallbacks(currentContext).some(function (candidate) {
    if (policy.modes[candidate]) {
      selected = {context: candidate, target_context: currentContext.raw_dynamic_range, mode: policy.modes[candidate]};
      return true;
    }
    return false;
  });
  if (!selected) {
    throw policyError(
      'The policy has no mode for active dynamic range ' + currentContext.raw_dynamic_range,
      'context_not_configured',
      409
    );
  }
  return selected;
}

function settingsOperation(inputName, mode, settings, currentApp) {
  var params = {
    category: 'picture$' + inputName + '.' + mode + '.2d.x',
    settings: settings
  };
  if (currentApp) params.current_app = true;
  return {
    kind: currentApp ? 'preset_current_app_settings' : 'preset_settings',
    context: null,
    picture_mode: mode,
    params: params
  };
}

function mappingOperation(inputName, context, mode) {
  return {
    kind: 'picture_mode_mapping',
    context: context,
    picture_mode: mode,
    params: {
      category: 'picture$' + inputName + '.x.2d.' + context,
      settings: {pictureMode: mode}
    }
  };
}

function activationOperation(inputName, active, currentContext) {
  return {
    kind: 'activate_picture_profile',
    context: active.target_context,
    picture_mode: active.mode,
    params: {
      category: 'picture',
      dimension: {
        input: inputName,
        dynamicRange: active.target_context,
        _3dStatus: String(currentContext.three_d_status || '2d')
      },
      settings: {pictureMode: active.mode},
      store: false,
      notify: true
    }
  };
}

function optionalActiveMapping(policy, currentContext) {
  if (!currentContext || !currentContext.input || !currentContext.raw_dynamic_range) return null;
  if (baseInput(policy.input) !== baseInput(currentContext.input)) return null;
  try {
    return activeMapping(policy, currentContext);
  } catch (error) {
    if (error.code === 'context_not_configured') return null;
    throw error;
  }
}

function buildOperations(policy, currentContext) {
  var operations = [];
  var selectedModes = {};
  var mappings = [];
  var active;

  if (policy.scope === 'active') {
    active = activeMapping(policy, currentContext);
    selectedModes[active.mode] = true;
    mappings.push({context: active.target_context, mode: active.mode});
  } else {
    Object.keys(policy.presets).forEach(function (mode) { selectedModes[mode] = true; });
    CONTEXTS.forEach(function (context) {
      if (!policy.modes[context]) return;
      selectedModes[policy.modes[context]] = true;
      mappings.push({context: context, mode: policy.modes[context]});
    });
    active = optionalActiveMapping(policy, currentContext);
  }

  Object.keys(selectedModes).sort().forEach(function (mode) {
    var preset = policy.presets[mode];
    if (Object.keys(preset.settings).length > 0) {
      operations.push(settingsOperation(policy.input, mode, preset.settings, false));
    }
    if (Object.keys(preset.current_app_settings).length > 0) {
      operations.push(settingsOperation(policy.input, mode, preset.current_app_settings, true));
    }
  });
  mappings.forEach(function (mapping) {
    operations.push(mappingOperation(policy.input, mapping.context, mapping.mode));
  });
  if (active) {
    operations.push(activationOperation(policy.input, active, currentContext));
  }
  return operations;
}

module.exports = {
  CONTEXTS: CONTEXTS,
  activeMapping: activeMapping,
  baseInput: baseInput,
  buildOperations: buildOperations,
  normalize: normalize,
  policyError: policyError
};
