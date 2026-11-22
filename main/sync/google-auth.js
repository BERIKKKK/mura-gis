/* Google аккаунтымен кіру (Desktop): OAuth 2.0 «орнатылған қолданба» ағыны — жүйенің браузері, 127.0.0.1-дегі
   уақытша қайтару адресі, PKCE. Рұқсат — тек drive.appdata (қолданбаның Drive-тағы жасырын аумағы).
   Токендер Google-дан тікелей алынады және тек осы компьютерде сақталады: жаңарту токені Electron safeStorage
   арқылы шифрланады (Windows — DPAPI, macOS — Keychain, Linux — Secret Service); Mura GIS серверіне ештеңе жіберілмейді.
   Клиент баптауы — main/sync/google-oauth.json (Google Cloud жобасындағы «Desktop app» OAuth клиенті; docs/SYNC.md). */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { fail } = require('./gdrive');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const b64u = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class GoogleAuth {
  /**
   * clientId, clientSecret — «Desktop app» клиенті (Google ережесі бойынша орнатылған қолданбада құпия саналмайды);
   * vault — { load() → мәтін|null, save(мәтін), clear() } (async) (шифрланған қойма); openExternal(url) — жүйенің браузері.
   */
  constructor({ clientId, clientSecret, vault, openExternal, fetch, page }) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
    this.vault = vault;
    this.openExternal = openExternal;
    this.fetch = fetch || globalThis.fetch;
    this.page = page || (ok => (ok ? 'OK' : 'Error'));
    this.access = null;                    // { token, exp }
    this.pending = null;                   // кіру терезесі ашық
  }

  configured() { return !!this.clientId; }

  async post(url, params) {
    let r;
    try { r = await this.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }); }
    catch (e) { throw fail('offline', e && e.message); }
    let j = {};
    try { j = JSON.parse(await r.text()); } catch (e) { j = {}; }
    if (!r.ok) {
      if (j.error === 'invalid_grant' || j.error === 'invalid_client' || j.error === 'unauthorized_client') throw fail('auth', j.error_description || j.error);
      if (r.status >= 500) throw fail('server', 'HTTP ' + r.status);
      throw fail('http', j.error_description || j.error || ('HTTP ' + r.status));
    }
    return j;
  }

  /** Браузерде кіру; сәтті болса — жаңарту токені шифрланып сақталады. */
  async signIn({ timeoutMs = 5 * 60 * 1000 } = {}) {
    if (!this.configured()) throw fail('config', 'OAuth client is not configured');
    if (this.pending) this.pending.cancel();
    const verifier = b64u(crypto.randomBytes(32));
    const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
    const state = b64u(crypto.randomBytes(16));
    const server = http.createServer();
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const redirect = 'http://127.0.0.1:' + server.address().port;
    let timer = null;
    const code = await new Promise((resolve, reject) => {
      const done = (e, c) => { clearTimeout(timer); this.pending = null; setTimeout(() => server.close(), 200); if (e) reject(e); else resolve(c); };
      this.pending = { cancel: () => done(fail('canceled', 'canceled')) };
      timer = setTimeout(() => done(fail('canceled', 'timeout')), timeoutMs);
      server.on('request', (req, res) => {
        const u = new URL(req.url, redirect);
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const okState = u.searchParams.get('state') === state;
        const c = u.searchParams.get('code');
        const good = okState && !!c;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(this.page(good));
        if (!okState) return;                                  // бөтен сұраныс — күтуді жалғастырамыз
        if (good) done(null, c); else done(fail(u.searchParams.get('error') === 'access_denied' ? 'denied' : 'auth', u.searchParams.get('error') || 'no code'));
      });
      const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
        code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent select_account' });
      Promise.resolve(this.openExternal(AUTH + '?' + q)).catch(e => done(e));
    });
    const j = await this.post(TOKEN, { client_id: this.clientId, client_secret: this.clientSecret, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect });
    if (!j.refresh_token) throw fail('auth', 'no refresh token');
    await this.vault.save(j.refresh_token);
    this.access = { token: j.access_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 - 60000 };
    return true;
  }

  cancel() { if (this.pending) this.pending.cancel(); }

  /** Жарамды кіру токені (мерзімі өтсе не force болса — жаңарту токенімен жаңартылады). */
  async token(force) {
    if (!force && this.access && this.access.exp > Date.now()) return this.access.token;
    let rt = null;
    try { rt = await this.vault.load(); } catch (e) { rt = null; }
    if (!rt) throw fail('auth', 'not signed in');
    try {
      const j = await this.post(TOKEN, { client_id: this.clientId, client_secret: this.clientSecret, refresh_token: rt, grant_type: 'refresh_token' });
      this.access = { token: j.access_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 - 60000 };
      return this.access.token;
    } catch (e) {
      if (e.code === 'auth') { this.access = null; }       // рұқсат қайтарылған: токен сақталады, бірақ қайта кіру керек
      throw e;
    }
  }

  /** Шығу: Google-дағы рұқсатты қайтару (желі болса) және токенді өшіру. Құрылғыдағы деректерге тимейді. */
  async signOut() {
    let rt = null;
    try { rt = await this.vault.load(); } catch (e) { rt = null; }
    this.access = null;
    try { await this.vault.clear(); } catch (e) { /* бос */ }
    if (rt) { try { await this.post(REVOKE, { token: rt }); } catch (e) { /* желі жоқ — токен бәрібір өшірілді */ } }
  }
}

module.exports = { GoogleAuth, SCOPE };
