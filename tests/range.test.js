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
    raw_value: 'DolbyVision',
    source: 'videooutput'
  });

  assert.deepStrictEqual(range.extract('picture', {
    settings: {dimension: {dynamicRange: 'hdr10'}}
  }), {
    dynamic_range: 'hdr10',
    raw_value: 'hdr10',
    source: 'picture'
  });
};
