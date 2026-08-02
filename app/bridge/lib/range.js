'use strict';

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\s_-]+/g, '').toLowerCase();
}

function classify(value) {
  var normalized = normalizeText(value);
  if (!normalized) return null;

  if (normalized.indexOf('dolbyvision') !== -1 ||
      normalized.indexOf('dolbyhdr') !== -1 ||
      normalized === 'dv') {
    return 'dolby_vision';
  }
  if (normalized.indexOf('hlg') !== -1) return 'hlg';
  if (normalized.indexOf('hdr') !== -1) return 'hdr10';
  if (normalized === 'sdr' || normalized === 'none' ||
      normalized === 'off' || normalized === 'false') {
    return 'sdr';
  }
  return null;
}

function extractVideoOutput(payload) {
  var video;
  var videoInfo;
  if (!payload || !Array.isArray(payload.video) || payload.video.length === 0) return null;
  video = payload.video[0] || {};
  videoInfo = video.videoInfo || video.info || {};
  return videoInfo.hdrType !== undefined ? videoInfo.hdrType : video.hdrType;
}

function extractPictureSettings(payload) {
  var settings;
  var dimension;
  if (!payload) return null;
  settings = payload.settings || payload;
  dimension = payload.dimension || payload.dimensionInfo ||
    settings.dimension || settings.dimensionInfo || {};
  if (dimension.dynamicRange !== undefined) return dimension.dynamicRange;
  if (settings.dynamicRange !== undefined) return settings.dynamicRange;
  return null;
}

function extractPictureContext(payload, fallback) {
  var settings;
  var dimension;
  var rawDynamicRange;
  var dynamicRange;
  if (!payload) return null;
  settings = payload.settings || payload;
  dimension = payload.dimension || payload.dimensionInfo ||
    settings.dimension || settings.dimensionInfo || {};
  rawDynamicRange = dimension.dynamicRange !== undefined ? dimension.dynamicRange :
    (settings.dynamicRange !== undefined ? settings.dynamicRange :
      (fallback ? fallback.raw_dynamic_range : undefined));
  dynamicRange = classify(rawDynamicRange);
  if (!dynamicRange) return null;
  return {
    input: dimension.input === undefined ?
      (fallback ? fallback.input : null) : String(dimension.input),
    picture_mode: settings.pictureMode === undefined ?
      (dimension.pictureMode === undefined ?
        (fallback ? fallback.picture_mode : null) : String(dimension.pictureMode)) :
      String(settings.pictureMode),
    dynamic_range: dynamicRange,
    raw_dynamic_range: String(rawDynamicRange),
    three_d_status: dimension._3dStatus === undefined ?
      (fallback ? fallback.three_d_status : null) : String(dimension._3dStatus)
  };
}

function extract(source, payload) {
  var raw = source === 'videooutput' ? extractVideoOutput(payload) : extractPictureSettings(payload);
  var dynamicRange = classify(raw);
  var pictureContext = source === 'picture' ? extractPictureContext(payload) : null;
  if (!dynamicRange) return null;
  return {
    dynamic_range: dynamicRange,
    raw_value: String(raw),
    source: source,
    input: pictureContext ? pictureContext.input : null,
    picture_mode: pictureContext ? pictureContext.picture_mode : null,
    raw_dynamic_range: pictureContext ? pictureContext.raw_dynamic_range : String(raw)
  };
}

module.exports = {
  classify: classify,
  extract: extract,
  extractPictureContext: extractPictureContext,
  extractPictureSettings: extractPictureSettings,
  extractVideoOutput: extractVideoOutput,
  normalizeText: normalizeText
};
