const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mura', {
  version: ipcRenderer.sendSync('mura:version'),
  platform: process.platform,
  /** Интерфейс тілі: 'kk' не 'ru' («Баптаулар» → «Тіл / Язык»); setLang — сақтайды, бетті шақырушы қайта жүктейді. */
  lang: ipcRenderer.sendSync('mura:lang'),
  setLang: v => ipcRenderer.invoke('mura:set-lang', v),
  /** Бет жүктелгендегі күй: ашық жоба ({ path, name, oblast, district, key, counts… } не null), соңғы жобалар, ескі деректер.
      Жоба ауысқанда бет қайта жүктеледі — сондықтан бұл сурет әрдайым өзекті. */
  project: ipcRenderer.sendSync('mura:project-info'),
  projectNew: (meta, opts) => ipcRenderer.invoke('mura:project-new', meta, opts),
  projectOpen: file => ipcRenderer.invoke('mura:project-open', file || ''),
  projectSettings: meta => ipcRenderer.invoke('mura:project-settings', meta),
  projectClose: () => ipcRenderer.invoke('mura:project-close'),
  projectForget: file => ipcRenderer.invoke('mura:project-forget', file),
  projectReveal: () => ipcRenderer.invoke('mura:project-reveal'),
  /** Жобаны сақтау («Сақтау» батырмасы, Ctrl+S); авто сақтау — баптау («Баптаулар → Жоба»). */
  projectSave: () => ipcRenderer.invoke('mura:project-save'),
  prefs: ipcRenderer.sendSync('mura:prefs'),
  setAutosave: v => ipcRenderer.invoke('mura:set-autosave', !!v),
  /** Сақталмаған өзгерістер күйі өзгергенде (авто сақтау өшік кезде). */
  onDirty: cb => { ipcRenderer.on('mura:dirty', (_e, v) => cb(!!v)); },
  /** Бөтен GeoPackage-ті оқу (импорт үшін): file берілмесе — таңдау терезесі. */
  gpkgInspect: file => ipcRenderer.invoke('mura:gpkg-inspect', file || ''),
  /** Мәзір пәрмендері (Жаңа жоба, Баптаулар, Бастапқы терезе). */
  onUi: cb => { ipcRenderer.on('mura:ui', (_e, cmd) => cb(String(cmd))); },
  /** HTML → PDF (Uint8Array). opts.exact — өрістері мен колонтитулы жоқ, масштабы 1:1 («Жоспар» сызбалары). */
  pdf: (html, opts) => ipcRenderer.invoke('mura:pdf', html, opts && opts.exact ? { exact: true } : undefined),
  /** Синхрондау («Баптаулар → Синхрондау»; main/sync/): күй, Google арқылы кіру, жобаларды қосу, қайшылықтарды шешу. */
  sync: {
    status: () => ipcRenderer.invoke('mura:sync-status'),
    connect: () => ipcRenderer.invoke('mura:sync-connect'),
    cancel: () => ipcRenderer.invoke('mura:sync-cancel'),
    disconnect: () => ipcRenderer.invoke('mura:sync-disconnect'),
    now: () => ipcRenderer.invoke('mura:sync-now'),
    link: () => ipcRenderer.invoke('mura:sync-link'),
    unlink: id => ipcRenderer.invoke('mura:sync-unlink', id),
    download: id => ipcRenderer.invoke('mura:sync-download', id),
    open: id => ipcRenderer.invoke('mura:sync-open', id),
    relink: id => ipcRenderer.invoke('mura:sync-relink', id),
    resolve: (id, key, choice) => ipcRenderer.invoke('mura:sync-resolve', id, key, choice),
    onStatus: cb => { ipcRenderer.on('mura:sync', (_e, st) => cb(st)); },
    /** Басқа құрылғының өзгерістері ашық жобаға жазылды — тізімдерді қайта оқу керек. */
    onApplied: cb => { ipcRenderer.on('mura:sync-applied', () => cb()); },
  },
  /** Алмасу буфері: картаның оң жақ мәзірі үшін. */
  clipRead: () => ipcRenderer.invoke('mura:clip-read'),
  clipWrite: text => ipcRenderer.invoke('mura:clip-write', text),
});
