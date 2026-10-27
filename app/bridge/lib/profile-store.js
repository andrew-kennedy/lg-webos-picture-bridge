'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config-store');

function create(directory = config.stateDir()) {
  function read(name) {
    const file = path.join(directory, name + '.json');
    try {
      if (fs.statSync(file).size > 750000) throw new Error('Profile file exceeds its size limit');
      return JSON.parse(fs.readFileSync(file,'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function write(name, value) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const file = path.join(directory,name + '.json'), tmp = file + '.tmp';
    const fd = fs.openSync(tmp,'w',0o600);
    try { fs.writeFileSync(fd,JSON.stringify(value) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp,file);
    // Persist the rename before acknowledging an edit or an HA migration.
    const dir = fs.openSync(directory,'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  return {read,write};
}
module.exports = {create};
