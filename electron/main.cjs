'use strict';
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('../server/lan-server.cjs');
let aiProcess=null;
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
function createWindow(){
 const win=new BrowserWindow({width:1280,height:850,minWidth:900,minHeight:650,backgroundColor:'#0d151d',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.loadFile(path.join(__dirname,'..','www','index.html'));
}
app.whenReady().then(()=>{
 startBundledAI();
 createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('before-quit',()=>{if(aiProcess&&!aiProcess.killed)aiProcess.kill();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
