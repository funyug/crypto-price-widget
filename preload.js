const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPriceUpdate: (callback) => ipcRenderer.on('price-update', callback),
  sendRefreshPrice: () => ipcRenderer.send('refresh-price'),
  sendRendererError: (msg) => ipcRenderer.send('renderer-error', msg)
});
