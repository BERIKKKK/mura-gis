const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mura', {
  version: ipcRenderer.sendSync('mura:version'),
  platform: process.platform,
  /** Ескерткіштер тізімінің HTML-і → PDF (Uint8Array). */
  pdf: html => ipcRenderer.invoke('mura:pdf', html),
  /** Алмасу буфері: картаның оң жақ мәзірі үшін. */
  clipRead: () => ipcRenderer.invoke('mura:clip-read'),
  clipWrite: text => ipcRenderer.invoke('mura:clip-write', text),
});
