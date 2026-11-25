'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
require('../server/lan-server.cjs');

function findOllama() {
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe')
  ].filter(Boolean);
  return candidates.find(file => fs.existsSync(file)) || null;
}
async function needsAISetup() {
  const ollama = findOllama();
  if (!ollama) return true;
  try {
    const { stdout } = await execFileAsync(ollama, ['list'], { timeout: 8000, windowsHide: true });
    return !stdout.split(/\r?\n/).some(line => /^qwen2\.5:3b(?:\s|$)/i.test(line.trim()));
  } catch { return true; }
}
async function offerAISetup() {
  if (process.platform !== 'win32' || !(await needsAISetup())) return;
  const answer = await dialog.showMessageBox({
    type: 'question', buttons: ['تثبيت الآن', 'لاحقاً'], defaultId: 0, cancelId: 1,
    title: 'إعداد ذكاء HK STORE',
    message: 'مكوّن الذكاء الاصطناعي المحلي غير جاهز.',
    detail: 'سيتم تثبيت Ollama الرسمي ثم تنزيل النموذج qwen2.5:3b. يحتاج ذلك إلى اتصال بالإنترنت ومساحة تخزين إضافية وقد يستغرق وقتاً. يمكنك اختيار لاحقاً ومتابعة استعمال بقية التطبيق.'
  });
  if (answer.response !== 0) return;
  const script = app.isPackaged ? path.join(process.resourcesPath, 'setup-local-ai.ps1') : path.join(__dirname, '..', 'scripts', 'setup-local-ai.ps1');
  if (!fs.existsSync(script)) { await dialog.showMessageBox({ type: 'error', title: 'ملف الإعداد غير موجود', message: 'تعذر العثور على أداة إعداد الذكاء الاصطناعي.' }); return; }
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: false, stdio: 'ignore' });
  child.once('error', async () => { await dialog.showMessageBox({ type: 'error', title: 'تعذر بدء الإعداد', message: 'لم نتمكن من تشغيل PowerShell لإعداد الذكاء الاصطناعي.' }); });
  child.once('close', async code => {
    if (code === 0) await dialog.showMessageBox({ type: 'info', title: 'اكتمل إعداد الذكاء الاصطناعي', message: 'تم تجهيز Ollama والنموذج المحلي. أعد تشغيل HK STORE ثم اختبر حالة الذكاء الاصطناعي.' });
    else await dialog.showMessageBox({ type: 'warning', title: 'لم يكتمل الإعداد', message: 'لم يكتمل تثبيت الذكاء الاصطناعي. راجع نافذة PowerShell ثم أعد المحاولة عند توفر الإنترنت والمساحة.' });
  });
}
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 850, minWidth: 900, minHeight: 650, backgroundColor: '#0d151d', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}
app.whenReady().then(() => {
  createWindow();
  setTimeout(() => { offerAISetup().catch(error => console.error('AI setup prompt failed:', error)); }, 1800);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
