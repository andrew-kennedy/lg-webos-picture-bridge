'use strict';
var assert=require('assert'), fs=require('fs'), os=require('os'), path=require('path');
var runtime=require('../app/bridge/lib/runtime-store');
module.exports=function () {
  var temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lgpb-runtime-'));
  process.env.LG_PICTURE_BRIDGE_RUNTIME_DIR=path.join(temporary,'runtime');
  try {
    var directory=runtime.ensureDirectory(), log=path.join(directory,'bridge.log');
    assert.strictEqual(fs.statSync(directory).mode & 511,448);
    var content=Buffer.concat([Buffer.alloc(80000,65),Buffer.from('last diagnostic\n')]);
    fs.writeFileSync(log,content,{mode:384});
    var inode=fs.statSync(log).ino;
    runtime.trimLog();
    assert.strictEqual(fs.statSync(log).ino,inode,'Open append descriptors continue to use the bounded log');
    assert.strictEqual(fs.statSync(log).size,32768);
    assert.deepStrictEqual(fs.readFileSync(log),content.subarray(content.length-32768));
    fs.unlinkSync(log);fs.rmdirSync(directory);fs.symlinkSync(temporary,directory);
    assert.throws(runtime.ensureDirectory,/owned directory/,'Shared /tmp must not allow a redirected root write');
  } finally {delete process.env.LG_PICTURE_BRIDGE_RUNTIME_DIR;fs.rmSync(temporary,{recursive:true,force:true});}
  assert.strictEqual(runtime.runtimeDir(),'/tmp/io.github.andrewkennedy.lgpicturebridge');
};
