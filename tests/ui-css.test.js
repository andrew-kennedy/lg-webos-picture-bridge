'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

module.exports = function () {
  var css = fs.readFileSync(path.join(__dirname, '../app/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  var html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  assert.ok(!/display\s*:\s*(inline-)?grid\b/.test(css), 'webOS 4.x/Chromium 53 has no CSS Grid');
  assert.ok(!/(?:^|[;{])\s*(?:row-|column-)?gap\s*:/m.test(css), 'Old webOS needs margins, not flex gap');
  assert.ok(!/overflow-wrap\s*:\s*anywhere/.test(css), 'Use the legacy break-word fallback');
  assert.ok(/\.content\s*\{[^}]*min-height:\s*0/.test(css), 'Flex scroller must be allowed to shrink');
  assert.ok(/footer\s*\{[^}]*flex:\s*0 0 auto/.test(css), 'Do not shrink actions off-screen');
  assert.ok(html.indexOf('id="details"') < html.indexOf('<footer>'), 'Long errors belong inside the scroll area');
};
