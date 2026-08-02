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

function extract(source, payload) {
  var raw = source === 'videooutput' ? extractVideoOutput(payload) : extractPictureSettings(payload);
  var dynamicRange = classify(raw);
  if (!dynamicRange) return null;
  return {
    dynamic_range: dynamicRange,
    raw_value: String(raw),
    source: source
  };
}

module.exports = {
  classify: classify,
  extract: extract,
  extractPictureSettings: extractPictureSettings,
  extractVideoOutput: extractVideoOutput,
  normalizeText: normalizeText
};
