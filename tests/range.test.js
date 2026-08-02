'use strict';

var assert = require('assert');
var range = require('../app/bridge/lib/range');

module.exports = function () {
  assert.strictEqual(range.classify('sdr'), 'sdr');
  assert.strictEqual(range.classify('none'), 'sdr');
  assert.strictEqual(range.classify('hdr10'), 'hdr10');
  assert.strictEqual(range.classify('HDR'), 'hdr10');
  assert.strictEqual(range.classify('HLG'), 'hlg');
  assert.strictEqual(range.classify('DolbyVision'), 'dolby_vision');
  assert.strictEqual(range.classify('dolbyHdr'), 'dolby_vision');
  assert.strictEqual(range.classify('unknown'), null);

  assert.deepStrictEqual(range.extract('videooutput', {
    video: [{videoInfo: {hdrType: 'DolbyVision'}}]
  }), {
    dynamic_range: 'dolby_vision',
    input: null,
    picture_mode: null,
    raw_dynamic_range: 'DolbyVision',
    raw_value: 'DolbyVision',
    source: 'videooutput'
  });

  assert.deepStrictEqual(range.extract('picture', {
    settings: {dimension: {dynamicRange: 'hdr10'}}
  }), {
    dynamic_range: 'hdr10',
    input: null,
    picture_mode: null,
    raw_dynamic_range: 'hdr10',
    raw_value: 'hdr10',
    source: 'picture'
  });

  assert.deepStrictEqual(range.extract('picture', {
    dimension: {pictureMode: 'expert1', input: 'hdmi3', dynamicRange: 'sdr'},
    settings: {pictureMode: 'expert1'}
  }), {
    dynamic_range: 'sdr',
    input: 'hdmi3',
    picture_mode: 'expert1',
    raw_dynamic_range: 'sdr',
    raw_value: 'sdr',
    source: 'picture'
  });

  assert.deepStrictEqual(range.extractPictureContext({
    dimension: {input: 'hdmi3', _3dStatus: '2d', dynamicRange: 'dolbyHdr'},
    settings: {pictureMode: 'dolbyHdrCinema'}
  }), {
    input: 'hdmi3',
    picture_mode: 'dolbyHdrCinema',
    dynamic_range: 'dolby_vision',
    raw_dynamic_range: 'dolbyHdr',
    three_d_status: '2d'
  });
  assert.deepStrictEqual(range.extractPictureContext({
    dimension: {input: 'hdmi3', pictureMode: 'dolbyHdrStandard'}
  }, {
    input: 'hdmi3',
    picture_mode: 'dolbyHdrCinema',
    dynamic_range: 'dolby_vision',
    raw_dynamic_range: 'dolbyHdr',
    three_d_status: '2d'
  }), {
    input: 'hdmi3',
    picture_mode: 'dolbyHdrStandard',
    dynamic_range: 'dolby_vision',
    raw_dynamic_range: 'dolbyHdr',
    three_d_status: '2d'
  });
};
