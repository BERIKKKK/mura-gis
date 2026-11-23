/* Плагин терезесінің preload скрипті (sandbox: true, contextIsolation: true).
   Плагин кодына тек бір хабар арнасы беріледі: __muraBridge.send(хабар) және onMessage(өңдеуші) — onMessage тек
   бір рет (runtime.js) тіркеледі, сондықтан плагин жауаптарды ұстап ала алмайды. ipcRenderer, Node.js модульдері,
   басқа арналар плагинге қолжетімсіз. Әр хабарды негізгі процесс (main/plugins/host.js) тексереді. */
const { contextBridge, ipcRenderer } = require('electron');

let handler = null;
ipcRenderer.on('mura-plugin:msg', (_e, m) => { if (handler) handler(m); });
contextBridge.exposeInMainWorld('__muraBridge', {
  send: m => ipcRenderer.send('mura-plugin:msg', m),
  onMessage: fn => { if (!handler && typeof fn === 'function') handler = fn; },
});
