#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var project = require('./project');

var app = project.appInfo();
var tag = process.env.RELEASE_TAG || 'v' + app.version;
var manifestPath = path.join(project.ROOT, 'dist', app.id + '.manifest.json');
var manifest = project.readJson(manifestPath);
var pagesBase = 'https://andrew-kennedy.github.io/lg-webos-picture-bridge';
var repository = 'https://github.com/andrew-kennedy/lg-webos-picture-bridge';
var site = path.join(project.ROOT, 'site');

var feed = {
  paging: {page: 1, count: 1, maxPage: 1, itemsTotal: 1},
  packages: [{
    id: app.id,
    title: app.title,
    iconUri: pagesBase + '/icon160.png',
    manifestUrl: repository + '/releases/download/' + tag + '/' + app.id + '.manifest.json',
    manifest: manifest,
    pool: 'main',
    requirements: {webosRelease: '>=4.0'},
    shortDescription: app.appDescription,
    fullDescriptionUrl: pagesBase + '/full_description.html'
  }]
};

fs.mkdirSync(site, {recursive: true});
fs.copyFileSync(path.join(project.ROOT, 'app', 'assets', 'icon160.png'), path.join(site, 'icon160.png'));
fs.writeFileSync(path.join(site, 'apps.json'), JSON.stringify(feed, null, 2) + '\n');
process.stdout.write(path.join(site, 'apps.json') + '\n');
