/* Google Drive — синхрондаудың бірінші сақтау модулі (Drive API v3, тікелей HTTPS, Mura GIS серверінсіз).
   Тек қолданбаның жасырын аумағы (appDataFolder, рұқсаты — drive.appdata): пайдаланушының басқа файлдарын көрмейді.
   Ортақ қозғалтқышқа (engine.js) берілетін интерфейс — кез келген сақтау қызметіне ортақ:
     list() → [{ name, rev, id, size }], read(file) → мәтін, write(name, мәтін) → { name, rev }, remove(name), account() → { id, email, name, quota }.
   Қателер бірыңғай кодпен: offline (желі жоқ), auth (рұқсат қайтарылды / мерзімі өтті), quota (Drive-та орын жоқ),
   rate (сұраныс тым жиі), server (қызмет уақытша істемейді). OneDrive/Dropbox модульдері де осы кодтарды береді. */
'use strict';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const fail = (code, message, extra) => Object.assign(new Error(message || code), { code }, extra || {});

class GoogleDrive {
  /** token(force) — жарамды кіру токені (force: ескісі қабылданбады, жаңасын алу). */
  constructor({ fetch, token }) {
    this.fetch = fetch || globalThis.fetch;
    this.token = token;
    this.ids = new Map();                 // файл атауы → Drive id (соңғы тізімнен)
  }

  async req(url, o = {}, retry = true) {
    let r;
    try {
      const tok = await this.token(false);
      r = await this.fetch(url, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + tok } });
    } catch (e) {
      if (e && e.code) throw e;
      throw fail('offline', e && e.message);
    }
    if (r.status === 401 && retry) { await this.token(true); return this.req(url, o, false); }
    if (r.ok) return r;
    let body = null;
    try { body = JSON.parse(await r.text()); } catch (e) { body = null; }
    const reasons = ((body && body.error && body.error.errors) || []).map(x => x && x.reason);
    const msg = body && body.error && body.error.message || ('HTTP ' + r.status);
    if (r.status === 401) throw fail('auth', msg);
    if (r.status === 403 && reasons.some(x => /storageQuotaExceeded|quotaExceeded/.test(x || ''))) throw fail('quota', msg);
    if (r.status === 429 || (r.status === 403 && reasons.some(x => /rateLimitExceeded|userRateLimitExceeded/.test(x || '')))) throw fail('rate', msg);
    if (r.status === 403) throw fail('auth', msg);
    if (r.status >= 500) throw fail('server', msg);
    throw fail('http', msg, { status: r.status });
  }

  async list() {
    const out = [];
    let page = '';
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: 'nextPageToken,files(id,name,version,modifiedTime,size)', orderBy: 'modifiedTime desc' });
      if (page) q.set('pageToken', page);
      const j = await (await this.req(API + '/files?' + q)).json();
      for (const f of j.files || []) out.push({ id: f.id, name: f.name, rev: String(f.version || f.modifiedTime || ''), size: +f.size || 0 });
      page = j.nextPageToken || '';
    } while (page);
    // Бір атаулы бірнеше файл болса (жасау кезінде желі үзілген) — ең соңғысы алынады
    const seen = new Set(), uniq = [];
    for (const f of out) if (!seen.has(f.name)) { seen.add(f.name); uniq.push(f); }
    this.ids = new Map(uniq.map(f => [f.name, f.id]));
    this.dups = out.filter(f => !uniq.includes(f));
    return uniq;
  }

  async read(f) {
    const id = f.id || this.ids.get(f.name);
    if (!id) throw fail('http', 'not found');
    return (await this.req(API + '/files/' + encodeURIComponent(id) + '?alt=media')).text();
  }

  async write(name, text) {
    const id = this.ids.get(name);
    let j;
    if (id) {
      j = await (await this.req(UPLOAD + '/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id,name,version', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: text })).json();
    } else {
      const b = 'mura' + Math.random().toString(16).slice(2);
      const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' }) +
        '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + b + '--';
      j = await (await this.req(UPLOAD + '/files?uploadType=multipart&fields=id,name,version', {
        method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body })).json();
      this.ids.set(name, j.id);
    }
    // Артық көшірмелер (бұрынғы үзілген жасаудан) — өшіріледі
    for (const d of (this.dups || []).filter(x => x.name === name)) { try { await this.req(API + '/files/' + encodeURIComponent(d.id), { method: 'DELETE' }); } catch (e) { /* келесі жолы */ } }
    return { name, rev: String(j.version || '') };
  }

  async remove(name) {
    const id = this.ids.get(name);
    if (!id) return;
    await this.req(API + '/files/' + encodeURIComponent(id), { method: 'DELETE' });
    this.ids.delete(name);
  }

  /** Аккаунт: тұрақты id (permissionId), e-mail, аты, бос орын (байт; шексіз болса — null). */
  async account() {
    const j = await (await this.req(API + '/about?fields=' + encodeURIComponent('user(displayName,emailAddress,permissionId),storageQuota(limit,usage)'))).json();
    const u = j.user || {}, q = j.storageQuota || {};
    return { id: String(u.permissionId || u.emailAddress || ''), email: String(u.emailAddress || ''), name: String(u.displayName || ''),
      free: q.limit ? Math.max(0, +q.limit - (+q.usage || 0)) : null };
  }
}

module.exports = { GoogleDrive, fail };
