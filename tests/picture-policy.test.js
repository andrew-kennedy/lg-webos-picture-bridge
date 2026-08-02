'use strict';

var assert = require('assert');
var picturePolicy = require('../app/bridge/lib/picture-policy');

function samplePolicy(scope) {
  return picturePolicy.normalize({
    request_id: 'test-policy',
    input: 'hdmi3',
    scope: scope,
    modes: {
      sdr: 'expert1',
      sdrALLM: 'expert1',
      hdr: 'hdrCinema',
      dolbyHdr: 'dolbyHdrCinema'
    },
    presets: {
      expert1: {
        settings: {backlight: 80, dynamicContrast: 'off'},
        current_app_settings: {truMotionMode: 'off'}
      },
      hdrCinema: {settings: {backlight: 100}},
      dolbyHdrCinema: {settings: {backlight: 100}}
    }
  });
}

module.exports = function () {
  var full = picturePolicy.buildOperations(samplePolicy('all'), null);
  var active = picturePolicy.buildOperations(samplePolicy('active'), {
    input: 'hdmi3',
    dynamic_range: 'dolby_vision',
    raw_dynamic_range: 'dolbyHdr',
    picture_mode: 'dolbyHdrStandard',
    three_d_status: '2d'
  });
  var fullWhileActive = picturePolicy.buildOperations(samplePolicy('all'), {
    input: 'hdmi3',
    dynamic_range: 'sdr',
    raw_dynamic_range: 'sdr',
    picture_mode: 'expert2',
    three_d_status: '2d'
  });

  assert.deepStrictEqual(full.map(function (operation) { return operation.params.category; }), [
    'picture$hdmi3.dolbyHdrCinema.2d.x',
    'picture$hdmi3.expert1.2d.x',
    'picture$hdmi3.expert1.2d.x',
    'picture$hdmi3.hdrCinema.2d.x',
    'picture$hdmi3.x.2d.sdr',
    'picture$hdmi3.x.2d.sdrALLM',
    'picture$hdmi3.x.2d.hdr',
    'picture$hdmi3.x.2d.dolbyHdr'
  ]);
  assert.strictEqual(full[2].params.current_app, true);
  assert.deepStrictEqual(active.map(function (operation) { return operation.params.category; }), [
    'picture$hdmi3.dolbyHdrCinema.2d.x',
    'picture$hdmi3.x.2d.dolbyHdr',
    'picture'
  ]);
  assert.strictEqual(active[1].params.settings.pictureMode, 'dolbyHdrCinema');
  assert.deepStrictEqual(active[2], {
    kind: 'activate_picture_profile',
    context: 'dolbyHdr',
    picture_mode: 'dolbyHdrCinema',
    params: {
      category: 'picture',
      dimension: {
        input: 'hdmi3',
        dynamicRange: 'dolbyHdr',
        _3dStatus: '2d'
      },
      settings: {pictureMode: 'dolbyHdrCinema'},
      store: false,
      notify: true
    }
  });
  assert.strictEqual(fullWhileActive.length, full.length + 1);
  assert.strictEqual(fullWhileActive[fullWhileActive.length - 1].kind, 'activate_picture_profile');
  assert.strictEqual(fullWhileActive[fullWhileActive.length - 1].picture_mode, 'expert1');

  assert.strictEqual(picturePolicy.buildOperations(samplePolicy('all'), {
    input: 'hdmi4', dynamic_range: 'sdr', raw_dynamic_range: 'sdr'
  }).length, full.length);

  assert.throws(function () {
    picturePolicy.buildOperations(samplePolicy('active'), {
      input: 'hdmi4', dynamic_range: 'sdr', raw_dynamic_range: 'sdr'
    });
  }, /active TV input is hdmi4/);
  assert.throws(function () {
    picturePolicy.normalize({input: 'hdmi3', modes: {bogus: 'expert1'}, presets: {}});
  }, /Unsupported dynamic-range context/);
};
