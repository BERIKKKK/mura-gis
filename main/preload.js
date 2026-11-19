const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mura', {
  version: ipcRenderer.sendSync('mura:version'),
  platform: process.platform,
});
