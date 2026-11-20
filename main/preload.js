const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mura', {
  version: ipcRenderer.sendSync('mura:version'),
  platform: process.platform,
  /** Бет жүктелгендегі күй: ашық жоба ({ path, name, oblast, district, key, counts… } не null), соңғы жобалар, ескі деректер.
      Жоба ауысқанда бет қайта жүктеледі — сондықтан бұл сурет әрдайым өзекті. */
  project: ipcRenderer.sendSync('mura:project-info'),
  projectNew: (meta, opts) => ipcRenderer.invoke('mura:project-new', meta, opts),
  projectOpen: file => ipcRenderer.invoke('mura:project-open', file || ''),
  projectSettings: meta => ipcRenderer.invoke('mura:project-settings', meta),
  projectClose: () => ipcRenderer.invoke('mura:project-close'),
  projectForget: file => ipcRenderer.invoke('mura:project-forget', file),
  projectReveal: () => ipcRenderer.invoke('mura:project-reveal'),
  /** Мәзір пәрмендері (Жаңа жоба, Баптаулар, Бастапқы терезе). */
  onUi: cb => { ipcRenderer.on('mura:ui', (_e, cmd) => cb(String(cmd))); },
  /** Ескерткіштер тізімінің HTML-і → PDF (Uint8Array). */
  pdf: html => ipcRenderer.invoke('mura:pdf', html),
  /** Алмасу буфері: картаның оң жақ мәзірі үшін. */
  clipRead: () => ipcRenderer.invoke('mura:clip-read'),
  clipWrite: text => ipcRenderer.invoke('mura:clip-write', text),
});
