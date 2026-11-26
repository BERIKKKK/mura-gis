/* Mura GIS: WMS сервистеріне мәтіндік сұраулар (GetCapabilities, GetFeatureInfo, қатені анықтау) — негізгі процесте.
   Неге мұнда: көп WMS сервері CORS тақырыптарын бермейді, ал бет (mura://app) бөтен серверден XML-ды тікелей оқи алмайды.
   Сұрау Chromium-ның желі стегі арқылы (electron net.fetch) орындалады: HTTPS сертификаты әдеттегідей ТЕКСЕРІЛЕДІ
   (тексеруді өшіретін ешбір баптау жоқ). Карта суреттерін (GetMap) бет өзі <img> арқылы жүктейді — олар мұнда өтпейді.
   Ештеңе дискіге жазылмайды (тұрақты офлайн кэш жоқ). */
const { net } = require('electron');

const MAX_BYTES = 64 * 1024 * 1024;   // GetCapabilities үлкен болуы мүмкін (НИПД ≈ 13 МБ)
const pending = new Map();            // id → AbortController

function register(ipcMain, fromApp, UA) {
  ipcMain.handle('mura:wms-get', async (e, url, opts) => {
    if (!fromApp(e)) return { ok: false, error: 'forbidden' };
    opts = opts || {};
    let u;
    try { u = new URL(String(url || '')); } catch (err) { return { ok: false, error: 'bad-url' }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'bad-url' };
    const id = typeof opts.id === 'string' ? opts.id : '';
    const ctl = new AbortController();
    if (id) { if (pending.has(id)) pending.get(id).abort(); pending.set(id, ctl); }
    const ms = Math.min(180000, Math.max(3000, +opts.timeout || 30000));
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await net.fetch(u.href, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: opts.accept || '*/*' }, redirect: 'follow', cache: 'no-store' });
      const type = r.headers.get('content-type') || '';
      const reader = r.body ? r.body.getReader() : null;
      const chunks = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BYTES) { ctl.abort(); return { ok: false, error: 'too-large', status: r.status }; }
          chunks.push(Buffer.from(value));
        }
      }
      return { ok: r.ok, status: r.status, type, text: Buffer.concat(chunks).toString('utf8') };
    } catch (err) {
      if (ctl.signal.aborted) return { ok: false, error: id && pending.get(id) !== ctl ? 'aborted' : 'timeout' };
      return { ok: false, error: 'network', detail: String(err && err.message || err) };
    } finally {
      clearTimeout(timer);
      if (id && pending.get(id) === ctl) pending.delete(id);
    }
  });
  ipcMain.handle('mura:wms-abort', (e, id) => {
    const c = pending.get(String(id || ''));
    if (c) { pending.delete(String(id)); c.abort(); }
  });
}

module.exports = { register };
