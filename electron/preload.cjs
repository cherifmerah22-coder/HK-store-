'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hkSecureCrypto', Object.freeze({
 randomSalt: () => ipcRenderer.invoke('hk:password-random-salt'),
 derivePassword: (password, saltHex, iterations) => ipcRenderer.invoke('hk:password-derive', { password, saltHex, iterations })
}));
