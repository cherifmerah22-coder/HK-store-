'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const nodeCrypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('../server/lan-server.cjs');
let aiProcess=null;
ipcMain.handle('hk:password-random-salt',()=>nodeCrypto.randomBytes(16).toString('hex'));
ipcMain.handle('hk:password-derive',(_event,{password,saltHex,iterations})=>{
 if(typeof password!=='string'||typeof saltHex!=='string'||!/^(?:[a-f0-9]{2})+$/i.test(saltHex))throw new Error('invalid_password_parameters');
 const rounds=Math.max(100000,Math.min(1000000,Number(iterations)||310000));
 return nodeCrypto.pbkdf2Sync(password,Buffer.from(saltHex,'hex'),rounds,32,'sha256').toString('hex');
});
function aiAsset(...parts){
 const root=app.isPackaged?path.join(process.resourcesPath,'ai'):path.join(__dirname,'..','resources','ai');
 return path.join(root,...parts);
}
function startBundledAI(){
 if(process.platform!=='win32')return false;
 const executable=aiAsset('bin','llama-server.exe');
 const model=aiAsset('models','qwen2.5-1.5b-instruct-q4_k_m.gguf');
 if(!fs.existsSync(executable)||!fs.existsSync(model)){
  console.error('Bundled AI assets are missing; AI remains unavailable without external installation.');
  return false;
 }
 aiProcess=spawn(executable,['--model',model,'--host','127.0.0.1','--port','11435','--ctx-size','4096','--n-gpu-layers','0'],{windowsHide:true,stdio:'ignore'});
 aiProcess.on('error',error=>console.error('Bundled AI runtime failed to start:',error));
 aiProcess.on('exit',(code)=>{console.error('Bundled AI runtime exited:',code);aiProcess=null;});
 return true;
}
async function waitForBundledAI(){
 for(let attempt=0;attempt<90;attempt++){
  if(!aiProcess||aiProcess.killed)return false;
  try{
   const response=await fetch('http://127.0.0.1:11435/health',{signal:AbortSignal.timeout(2500)});
   if(response.ok){console.log('Bundled HK STORE AI is ready.');return true;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 console.error('Bundled AI did not become ready within 180 seconds.');
 return false;
}
function createWindow(){
 const win=new BrowserWindow({width:1280,height:850,minWidth:900,minHeight:650,backgroundColor:'#0d151d',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.loadFile(path.join(__dirname,'..','www','index.html'));
}
app.whenReady().then(()=>{
 const aiStarted=startBundledAI();
 if(aiStarted)waitForBundledAI();
 createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('before-quit',()=>{if(aiProcess&&!aiProcess.killed)aiProcess.kill();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
