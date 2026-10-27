'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const store=require('../app/bridge/lib/profile-store');
module.exports=function(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lg-profile-store-'));
  try{
    const disk=store.create(directory);
    assert.equal(disk.read('profiles'),null);
    disk.write('profiles',{revision:1,document:{name:'test'}});
    disk.write('profiles',{revision:2,document:{name:'new'}});
    assert.deepEqual(disk.read('profiles'),{revision:2,document:{name:'new'}});
    assert.deepEqual(fs.readdirSync(directory),['profiles.json']);
    assert.equal(fs.statSync(path.join(directory,'profiles.json')).mode&0o777,0o600);
    fs.writeFileSync(path.join(directory,'profile-session.json'),'corrupt');
    assert.throws(()=>disk.read('profile-session'),SyntaxError,'Corruption cannot look like a fresh install');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
};
