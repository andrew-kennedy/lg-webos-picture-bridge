'use strict';

var fs = require('fs');
var path = require('path');

var testDirectory = __dirname;
var files = fs.readdirSync(testDirectory).filter(function (name) {
  return /\.test\.js$/.test(name);
}).sort();
var failures = 0;

function run(index) {
  var test;
  if (index >= files.length) {
    if (failures) process.exit(1);
    process.stdout.write('All ' + files.length + ' test files passed.\n');
    return;
  }
  test = require(path.join(testDirectory, files[index]));
  Promise.resolve().then(test).then(function () {
    process.stdout.write('PASS ' + files[index] + '\n');
  }).catch(function (error) {
    failures += 1;
    process.stderr.write('FAIL ' + files[index] + '\n' + error.stack + '\n');
  }).then(function () { run(index + 1); });
}

run(0);
