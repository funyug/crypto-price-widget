const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload-symbol-input.js] Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  sendSymbolValue: (symbol) => ipcRenderer.send('symbol-input-value', symbol),
  sendCancel: () => ipcRenderer.send('symbol-input-cancel'),
  onSymbolInputError: (callback) => ipcRenderer.on('symbol-input-error', (event, msg) => callback(msg))
});