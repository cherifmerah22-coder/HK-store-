'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto,randomBytes,pbkdf2Sync}=require('node:crypto');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(match,'inline app script exists');
const helpers=match[1].match(/const PASSWORD_ITERATIONS[\s\S]*?(?=function save\()/);
assert.ok(helpers,'password helper block exists');
assert.match(html,/<input id="loginUsername"[^>]*value="manager"/,'login screen exposes an editable username field');
assert.match(match[1],/function resolveLoginUsername\(value\)/,'username resolver exists');
assert.match(match[1],/resolveLoginUsername\(\$\('loginUsername'\)\.value\)/,'login uses the editable username field');
const context={crypto:webcrypto,TextEncoder,Uint8Array,Array,String,Number,Error,window:{}};
vm.runInNewContext(helpers[0],context,{filename:'password-helpers'});
(async()=>{
 const userA={name:'Test A',pin:'legacy123'};
 const userB={name:'Test B'};
 await context.setUserPassword(userA,'CorrectHorseBattery9!');
 await context.setUserPassword(userB,'AnotherStrongPassword8!');
 assert.equal(userA.passwordHash.length,64);
 assert.equal(userA.passwordSalt.length,32);
 assert.notEqual(userA.passwordSalt,userB.passwordSalt,'each account gets a unique salt');
 assert.equal(Object.hasOwn(userA,'pin'),false,'legacy plaintext pin is removed');
 assert.equal(await context.verifyPassword('CorrectHorseBattery9!',userA),true);
 assert.equal(await context.verifyPassword('wrong-password',userA),false);
 assert.equal(await context.verifyPassword('AnotherStrongPassword8!',userA),false);
 assert.equal(userA.passwordIterations,310000);

 // Exercise the Electron IPC bridge path used by the packaged Windows app.
 const electronContext={
  crypto:webcrypto,TextEncoder,Uint8Array,Array,String,Number,Error,
  window:{hkSecureCrypto:{
   randomSalt:()=>randomBytes(16).toString('hex'),
   derivePassword:(password,saltHex,iterations)=>pbkdf2Sync(String(password),Buffer.from(saltHex,'hex'),iterations,32,'sha256').toString('hex')
  }}
 };
 vm.runInNewContext(helpers[0],electronContext,{filename:'electron-password-helpers'});
 const electronUser={name:'Electron test'};
 await electronContext.setUserPassword(electronUser,'ElectronBridgePassword9!');
 assert.equal(electronUser.passwordSalt.length,32,'Electron bridge generates a 16-byte salt');
 assert.equal(await electronContext.verifyPassword('ElectronBridgePassword9!',electronUser),true,'Electron bridge verifies the correct password');
 assert.equal(await electronContext.verifyPassword('wrong-password',electronUser),false,'Electron bridge rejects an incorrect password');
 assert.match(match[1],/Object\.prototype\.hasOwnProperty\.call\(u,'pin'\)/,'legacy login migration path remains present');
 assert.match(match[1],/u\.mustChangePassword=true/,'default manager password is forced to change');
 console.log('HK STORE password security tests passed: PBKDF2-SHA256, per-user salt, plaintext removal, valid/invalid password checks, legacy migration, default-manager change, and Electron native crypto bridge.');
})().catch(error=>{console.error(error);process.exitCode=1});
