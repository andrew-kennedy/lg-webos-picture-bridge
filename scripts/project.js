'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function appInfo() {
  return readJson(path.join(ROOT, 'app', 'appinfo.json'));
}

function packageInfo() {
  return readJson(path.join(ROOT, 'package.json'));
}

function findIpk() {
  var directory = path.join(ROOT, 'dist');
  var matches = fs.existsSync(directory) ? fs.readdirSync(directory).filter(function (name) {
    return /\.ipk$/.test(name);
  }) : [];
  if (matches.length !== 1) {
    throw new Error('Expected exactly one IPK in dist/, found ' + matches.length);
  }
  return path.join(directory, matches[0]);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

module.exports = {
  ROOT: ROOT,
  appInfo: appInfo,
  findIpk: findIpk,
  packageInfo: packageInfo,
  readJson: readJson,
  sha256: sha256
};
