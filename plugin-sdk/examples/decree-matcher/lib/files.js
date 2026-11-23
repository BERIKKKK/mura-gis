/* Атау сәйкестендіргіш: DOCX (ZIP) және PDF файлдарын оқу. Сыртқы кітапхана жоқ: ZIP пен PDF құрылымы осы жерде
   талданады, қысылған деректер браузердің (не Node 18+) DecompressionStream-імен ашылады.
   Нәтиже бір пішімде: { kind: 'docx'|'pdf', paras: [мәтін жолдары], tables: [[ [ { span, paras: [..] } ] ]] }.
   PDF-те кесте жоқ — оның жолдары координаттарымен беріледі (pages), кестені decree.js қалпына келтіреді.
   Плагин терезесінде (globalThis.DMFiles) және Node тестінде (module.exports) бірдей жұмыс істейді. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.DMFiles = m;
})(globalThis, function () {
  'use strict';

  const MAX_OUT = 300 * 1024 * 1024;          // бір ашылған бөліктің шегі (zip-бомбадан қорғау)
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  let lastYield = now();
  /** Ұзақ есептеуде бағдарламаның «жүрек соғысы» хабарына жауап беру үшін оқтын-оқтын тоқтап тұру. */
  async function breathe() {
    if (now() - lastYield < 40) return;
    await new Promise(r => setTimeout(r, 0));
    lastYield = now();
  }

  async function inflate(u8, fmt) {
    const ds = new DecompressionStream(fmt);
    const w = ds.writable.getWriter();
    w.write(u8).catch(() => {});
    w.close().catch(() => {});
    const r = ds.readable.getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      let x;
      try { x = await r.read(); } catch (e) { if (n) break; throw e; }    // соңындағы артық байт — бар бөлігі алынады
      if (x.done) break;
      n += x.value.length;
      if (n > MAX_OUT) throw new Error('Файлдың ішкі бөлігі тым үлкен.');
      parts.push(x.value);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const utf8 = u8 => new TextDecoder('utf-8').decode(u8);

  /* ======================= ZIP ======================= */
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  function zipEntries(b) {
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('ZIP құрылымы табылмады (файл DOCX емес не бүлінген).');
    const count = u16(b, e + 10);
    let p = u32(b, e + 16);
    const out = new Map();
    for (let k = 0; k < count && p + 46 <= b.length; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      const method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
      const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lho = u32(b, p + 42);
      const name = utf8(b.subarray(p + 46, p + 46 + nl));
      out.set(name, { method, csize, usize, lho });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function zipRead(b, entries, name) {
    const en = entries.get(name);
    if (!en) return null;
    if (en.usize > MAX_OUT) throw new Error('ZIP ішіндегі файл тым үлкен: ' + name);
    const p = en.lho;
    if (u32(b, p) !== 0x04034b50) throw new Error('ZIP жазбасы бүлінген: ' + name);
    const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
    const data = b.subarray(start, start + en.csize);
    if (en.method === 0) return data;
    if (en.method === 8) return inflate(data, 'deflate-raw');
    throw new Error('ZIP қысу әдісі қолдау көрсетілмейді: ' + en.method);
  }

  /* ======================= DOCX ======================= */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unxml = s => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, k) => (k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : +k.slice(1)) : ENT[k.toLowerCase()]));
  const clean = s => s.replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ').trim();

  /** word/document.xml → { paras (кестеден тыс абзацтар), tables }. Кірістірілген кестелер ескеріледі; өшірілген (w:del,
      w:moveFrom) мәтін алынбайды. Кестедегі жол: [ { span, paras } ]. */
  function docxXml(x) {
    const paras = [], tables = [];
    const stack = [];                         // { tbl: rows } кесте стегі
    let row = null, cell = null, para = null, inT = false, skip = 0;
    const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr|gridSpan|del|moveFrom|delText)\b([^>]*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(x))) {
      if (m[5] != null) { if (inT && !skip && para) para.push(unxml(m[5])); continue; }
      const close = m[1] === '/', tag = m[2], self = m[4] === '/';
      switch (tag) {
        case 'del': case 'moveFrom': if (!self) skip += close ? -1 : 1; break;
        case 'tbl': if (!close) stack.push({ rows: [], row: null, cell: null }); else { const t = stack.pop(); if (t) tables.push(t.rows); } break;
        case 'tr': { const t = stack[stack.length - 1]; if (!t) break; if (!close) { t.row = []; } else if (t.row) { t.rows.push(t.row); t.row = null; } break; }
        case 'tc': { const t = stack[stack.length - 1]; if (!t || !t.row) break; if (!close) t.cell = { span: 1, paras: [] }; else if (t.cell) { t.row.push(t.cell); t.cell = null; } break; }
        case 'gridSpan': { const t = stack[stack.length - 1]; const v = /w:val="(\d+)"/.exec(m[3]); if (t && t.cell && v) t.cell.span = Math.max(1, +v[1]); break; }
        case 'p':
          if (!close && !self) para = [];
          else if (close && para) {
            const s = clean(para.join(''));
            const t = stack[stack.length - 1];
            if (t && t.cell) { if (s) t.cell.paras.push(s); } else if (s) paras.push(s);
            para = null;
          }
          break;
        case 't': inT = !close && !self; break;
        case 'tab': if (para && !skip) para.push(' '); break;
        case 'br': case 'cr': if (para && !skip) para.push('\n'); break;
      }
    }
    // абзац ішіндегі жол үзілісі — бөлек абзац ретінде (атау / мерзім бөлінуі үшін)
    const split = a => a.flatMap(s => s.split('\n').map(clean).filter(Boolean));
    return { paras: split(paras), tables: tables.map(rows => rows.map(r => r.map(c => ({ span: c.span, paras: split(c.paras) })))) };
  }
  async function docx(bytes) {
    const ent = zipEntries(bytes);
    const doc = await zipRead(bytes, ent, 'word/document.xml');
    if (!doc) throw new Error('Бұл DOCX файлы емес: word/document.xml жоқ.');
    return { kind: 'docx', ...docxXml(utf8(doc)) };
  }

  /* ======================= PDF ======================= */
  // Таңбаның түрі: 0 — қарапайым, 1 — бос орын, 2 — бөлгіш
  const CT = new Uint8Array(256);
  for (const c of [0, 9, 10, 12, 13, 32]) CT[c] = 1;
  for (const c of '()<>[]{}/%') CT[c.charCodeAt(0)] = 2;

  class Lexer {
    constructor(b, p) { this.b = b; this.p = p || 0; }
    ws() { const b = this.b; for (;;) { while (this.p < b.length && CT[b[this.p]] === 1) this.p++; if (b[this.p] === 37) { while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++; } else return; } }
    /** Келесі нысан: number | { n: name } | string(Uint8Array → {s}) | array | dict | { op } | { ref } . */
    next() {
      this.ws();
      const b = this.b;
      if (this.p >= b.length) return undefined;
      const c = b[this.p];
      if (c === 47) {                                   // /Name
        let s = ''; this.p++;
        while (this.p < b.length && !CT[b[this.p]]) {
          if (b[this.p] === 35 && this.p + 2 < b.length) { s += String.fromCharCode(parseInt(String.fromCharCode(b[this.p + 1], b[this.p + 2]), 16)); this.p += 3; }
          else s += String.fromCharCode(b[this.p++]);
        }
        return { n: s };
      }
      if (c === 40) return { s: this.lit() };
      if (c === 60) {
        if (b[this.p + 1] === 60) { this.p += 2; return this.dict(); }
        return { s: this.hex() };
      }
      if (c === 91) { this.p++; const a = []; for (;;) { this.ws(); if (b[this.p] === 93) { this.p++; return a; } const v = this.next(); if (v === undefined) return a; a.push(v); } }
      if (c === 93 || c === 62 || c === 41 || c === 123 || c === 125) { this.p++; return { op: String.fromCharCode(c) }; }
      let s = '';
      while (this.p < b.length && !CT[b[this.p]]) s += String.fromCharCode(b[this.p++]);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
        // «N G R» — сілтеме
        const save = this.p;
        if (/^\d+$/.test(s)) {
          this.ws(); let g = ''; while (this.p < b.length && b[this.p] >= 48 && b[this.p] <= 57) g += String.fromCharCode(b[this.p++]);
          if (g) { this.ws(); if (b[this.p] === 82 && (this.p + 1 >= b.length || CT[b[this.p + 1]])) { this.p++; return { ref: +s }; } }
          this.p = save;
        }
        return +s;
      }
      if (s === 'true') return true;
      if (s === 'false') return false;
      if (s === 'null') return null;
      return { op: s || String.fromCharCode(b[this.p++]) };
    }
    dict() {
      const d = {};
      for (;;) {
        this.ws();
        if (this.b[this.p] === 62 && this.b[this.p + 1] === 62) { this.p += 2; return d; }
        const k = this.next();
        if (k === undefined) return d;
        if (!k || k.n == null) continue;
        d[k.n] = this.next();
      }
    }
    lit() {
      const b = this.b, out = [];
      let depth = 1; this.p++;
      while (this.p < b.length) {
        let c = b[this.p++];
        if (c === 92) {
          c = b[this.p++];
          const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
          if (map[c] != null) out.push(map[c]);
          else if (c >= 48 && c <= 55) { let v = c - 48; for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k++) v = v * 8 + b[this.p++] - 48; out.push(v & 255); }
          else if (c === 13) { if (b[this.p] === 10) this.p++; }
          else if (c !== 10) out.push(c);
          continue;
        }
        if (c === 40) depth++;
        else if (c === 41 && --depth === 0) break;
        out.push(c);
      }
      return Uint8Array.from(out);
    }
    hex() {
      const b = this.b; let s = ''; this.p++;
      while (this.p < b.length && b[this.p] !== 62) { const c = b[this.p++]; if (CT[c] !== 1) s += String.fromCharCode(c); }
      this.p++;
      if (s.length % 2) s += '0';
      const out = new Uint8Array(s.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
      return out;
    }
  }

  class Pdf {
    constructor(b) { this.b = b; this.off = new Map(); this.cache = new Map(); }
    index() {
      const b = this.b;
      const tail = new TextDecoder('latin1').decode(b.subarray(Math.max(0, b.length - 2048)));
      const sx = /startxref\s+(\d+)/.exec(tail);
      let ok = false;
      if (sx) ok = this.readXref(+sx[1]);
      if (!ok || !this.off.size) this.scan();
      if (!this.trailer) this.scanTrailer();
      if (this.trailer && this.trailer.Encrypt) throw new Error('PDF шифрланған — оқу мүмкін емес.');
    }
    readXref(pos) {
      const seen = new Set();
      while (pos != null && !seen.has(pos)) {
        seen.add(pos);
        const lx = new Lexer(this.b, pos);
        const kw = lx.next();
        if (!kw || kw.op !== 'xref') return false;      // xref ағыны (PDF 1.5) — scan() арқылы
        for (;;) {
          const a = lx.next();
          if (a && a.op === 'trailer') break;
          const cnt = lx.next();
          if (typeof a !== 'number' || typeof cnt !== 'number') return false;
          for (let i = 0; i < cnt; i++) {
            const o = lx.next(), g = lx.next(), t = lx.next();
            if (t && t.op === 'n' && !this.off.has(a + i)) this.off.set(a + i, o);
          }
        }
        const tr = lx.next();
        if (!this.trailer) this.trailer = tr;
        pos = tr && typeof tr.Prev === 'number' ? tr.Prev : null;
      }
      return true;
    }
    scan() {
      const s = new TextDecoder('latin1').decode(this.b);
      const re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g;
      let m;
      while ((m = re.exec(s))) this.off.set(+m[1], m.index + m[0].indexOf(m[1]));
    }
    scanTrailer() {
      const s = new TextDecoder('latin1').decode(this.b.subarray(Math.max(0, this.b.length - 65536)));
      const i = s.lastIndexOf('trailer');
      if (i >= 0) { const lx = new Lexer(this.b, this.b.length - (s.length - i) + 7); this.trailer = lx.next(); }
      if (!this.trailer || !this.trailer.Root) {       // каталогты іздеу
        for (const [n] of this.off) { const o = this.obj(n); if (o && o.Type && o.Type.n === 'Catalog') { this.trailer = { Root: { ref: n } }; break; } }
      }
    }
    obj(n) {
      if (this.cache.has(n)) return this.cache.get(n);
      const p = this.off.get(n);
      if (p == null) return null;
      const lx = new Lexer(this.b, p);
      lx.next(); lx.next(); const kw = lx.next();
      if (!kw || kw.op !== 'obj') return null;
      let v = lx.next();
      lx.ws();
      if (v && typeof v === 'object' && !Array.isArray(v) && this.b[lx.p] === 115 && new TextDecoder('latin1').decode(this.b.subarray(lx.p, lx.p + 6)) === 'stream') {
        let s = lx.p + 6;
        if (this.b[s] === 13) s++;
        if (this.b[s] === 10) s++;
        let len = this.get(v.Length);
        if (typeof len !== 'number' || s + len > this.b.length) {
          const t = new TextDecoder('latin1').decode(this.b.subarray(s, Math.min(this.b.length, s + 64 * 1024 * 1024)));
          len = t.indexOf('endstream'); if (len < 0) len = 0;
        }
        v = { dict: v, raw: this.b.subarray(s, s + len) };
      }
      this.cache.set(n, v);
      return v;
    }
    get(v) { let k = 0; while (v && typeof v === 'object' && v.ref != null && k++ < 20) v = this.obj(v.ref); return v; }
    async data(st) {
      st = this.get(st);
      if (!st || !st.raw) return new Uint8Array(0);
      let f = this.get(st.dict.Filter);
      f = Array.isArray(f) ? f.map(x => this.get(x)) : f ? [f] : [];
      let d = st.raw;
      for (const x of f) {
        const nm = x && x.n;
        if (nm === 'FlateDecode' || nm === 'Fl') d = await inflate(d, 'deflate');
        else throw new Error('unsupported-filter:' + nm);
      }
      return d;
    }
    pages() {
      const out = [];
      const walk = (node, inh, depth) => {
        node = this.get(node);
        if (!node || depth > 50) return;
        const res = node.Resources ? node.Resources : inh;
        if (node.Type && node.Type.n === 'Pages' || Array.isArray(this.get(node.Kids))) { for (const k of this.get(node.Kids) || []) walk(k, res, depth + 1); }
        else out.push({ node, res: this.get(res) });
      };
      const root = this.get(this.trailer && this.trailer.Root);
      walk(root && root.Pages, null, 0);
      return out;
    }
  }

  /** ToUnicode CMap: { bytes (код ұзындығы), map: Map(code → мәтін) }. */
  function parseCMap(u8) {
    const lx = new Lexer(u8, 0);
    const map = new Map();
    let bytes = 2, mode = '', buf = [];
    const str = a => { let s = ''; for (let i = 0; i + 1 < a.length; i += 2) s += String.fromCharCode((a[i] << 8) | a[i + 1]); if (a.length % 2) s += String.fromCharCode(a[a.length - 1]); return s; };
    const num = a => { let v = 0; for (const x of a) v = v * 256 + x; return v; };
    for (let tok = lx.next(); tok !== undefined; tok = lx.next()) {
      if (tok && tok.op) {
        const op = tok.op;
        if (op === 'begincodespacerange' || op === 'beginbfchar' || op === 'beginbfrange') { mode = op; buf = []; continue; }
        if (op === 'endcodespacerange') { if (buf[0] && buf[0].s) bytes = buf[0].s.length; mode = ''; continue; }
        if (op === 'endbfchar') { for (let i = 0; i + 1 < buf.length; i += 2) if (buf[i].s && buf[i + 1].s) map.set(num(buf[i].s), str(buf[i + 1].s)); mode = ''; continue; }
        if (op === 'endbfrange') {
          for (let i = 0; i + 2 < buf.length; i += 3) {
            const lo = num(buf[i].s), hi = num(buf[i + 1].s), d = buf[i + 2];
            if (Array.isArray(d)) d.forEach((x, k) => { if (x && x.s) map.set(lo + k, str(x.s)); });
            else if (d && d.s) {
              const base = str(d.s);
              for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)));
            }
          }
          mode = ''; continue;
        }
      }
      if (mode) buf.push(tok);
    }
    return { bytes, map };
  }
  // WinAnsi (қарапайым қаріптер үшін, ToUnicode жоқ болса)
  const WIN = {}; [[128, 0x20ac], [130, 0x201a], [132, 0x201e], [133, 0x2026], [145, 0x2018], [146, 0x2019], [147, 0x201c], [148, 0x201d], [150, 0x2013], [151, 0x2014]].forEach(([a, b]) => { WIN[a] = b; });
  // Windows-1251 (кирилл) — кейбір ескі PDF-тердегі қарапайым қаріп
  const CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

  async function fontOf(pdf, ref, cache) {
    const key = ref && ref.ref != null ? ref.ref : null;
    if (key != null && cache.has(key)) return cache.get(key);
    const f = pdf.get(ref) || {};
    let cm = null;
    if (f.ToUnicode) { try { cm = parseCMap(await pdf.data(f.ToUnicode)); } catch (e) { cm = null; } }
    const type0 = f.Subtype && f.Subtype.n === 'Type0';
    const enc = pdf.get(f.Encoding);
    const cyr = !cm && !type0 && /1251|cyr/i.test(JSON.stringify(f.BaseFont || '') + JSON.stringify(enc || ''));
    const font = { cm, bytes: cm ? cm.bytes : type0 ? 2 : 1, cyr };
    if (key != null) cache.set(key, font);
    return font;
  }
  function decodeStr(font, s) {
    if (!font) return '';
    let out = '';
    const n = font.bytes;
    for (let i = 0; i + n - 1 < s.length; i += n) {
      let code = 0; for (let k = 0; k < n; k++) code = code * 256 + s[i + k];
      if (font.cm && font.cm.map.has(code)) out += font.cm.map.get(code);
      else if (n === 1) out += font.cyr && code >= 128 ? CP1251[code - 128] : String.fromCharCode(WIN[code] || code);
    }
    return out;
  }
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

  /** Беттің мәтін бөліктері: [{ x, y, s, size }] (y — беттің жоғарысынан төмен қарай өседі). */
  async function pageItems(pdf, pg, fonts) {
    const node = pg.node, res = pg.res || {};
    let cont = pdf.get(node.Contents);
    const streams = Array.isArray(cont) ? cont : cont ? [node.Contents] : [];
    const chunks = [];
    for (const s of streams) chunks.push(await pdf.data(s));
    let total = 0; for (const c of chunks) total += c.length + 1;
    const all = new Uint8Array(total); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; all[o++] = 10; }
    const box = pdf.get(node.MediaBox) || pdf.get(pdf.get(node.Parent) && pdf.get(node.Parent).MediaBox) || [0, 0, 595, 842];
    const H = +box[3] || 842;
    const fontDict = pdf.get(res.Font) || {};
    const items = [];
    const lx = new Lexer(all, 0);
    let ctm = [1, 0, 0, 1, 0, 0], tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
    let font = null, size = 12, lead = 0;
    const gs = [];
    const ops = [];
    const show = s => {
      const t = decodeStr(font, s);
      if (!t) return;
      const m = mul(tm, ctm);
      const sz = Math.abs(size * Math.hypot(m[0], m[1])) || size;
      items.push({ x: m[4], y: H - m[5], s: t, size: sz });
      tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + t.length * size * 0.5 * tm[0], tm[5] + t.length * size * 0.5 * tm[1]];   // жуық ілгерілеу
    };
    for (let tok = lx.next(); tok !== undefined; tok = lx.next()) {
      if (!tok || tok.op == null || tok.op === ']' || tok.op === '>' || tok.op === ')') { ops.push(tok); continue; }
      const op = tok.op, a = ops;
      switch (op) {
        case 'q': gs.push(ctm.slice()); break;
        case 'Q': ctm = gs.pop() || [1, 0, 0, 1, 0, 0]; break;
        case 'cm': if (a.length >= 6) ctm = mul(a.slice(-6).map(Number), ctm); break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
        case 'Tf': { const nm = a[a.length - 2]; size = +a[a.length - 1] || size; font = nm && nm.n ? await fontOf(pdf, fontDict[nm.n], fonts) : null; break; }
        case 'TL': lead = +a[a.length - 1] || 0; break;
        case 'Tm': if (a.length >= 6) { tm = a.slice(-6).map(Number); tlm = tm.slice(); } break;
        case 'Td': case 'TD': { const tx = +a[a.length - 2] || 0, ty = +a[a.length - 1] || 0; if (op === 'TD') lead = -ty; tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); break; }
        case 'T*': tlm = mul([1, 0, 0, 1, 0, -lead], tlm); tm = tlm.slice(); break;
        case 'Tj': { const s = a[a.length - 1]; if (s && s.s) show(s.s); break; }
        case "'": case '"': { tlm = mul([1, 0, 0, 1, 0, -lead], tlm); tm = tlm.slice(); const s = a[a.length - 1]; if (s && s.s) show(s.s); break; }
        case 'TJ': {
          const arr = a[a.length - 1];
          if (Array.isArray(arr)) {
            let txt = [];
            for (const x of arr) {
              if (x && x.s) txt.push(decodeStr(font, x.s));
              else if (typeof x === 'number' && x < -200) txt.push(' ');       // үлкен аралық — бос орын
            }
            const t = txt.join('');
            if (t.trim()) { const m = mul(tm, ctm); items.push({ x: m[4], y: H - m[5], s: t, size: Math.abs(size * Math.hypot(m[0], m[1])) || size }); }
          }
          break;
        }
        case 'BI': { // кірістірілген сурет — EI-ге дейін өткізіп жібереміз
          const b = all; let p = lx.p;
          while (p + 2 < b.length && !(b[p] === 69 && b[p + 1] === 73 && CT[b[p + 2]] === 1 && CT[b[p - 1]] === 1)) p++;
          lx.p = p + 2; break;
        }
      }
      ops.length = 0;
    }
    return items;
  }

  async function pdf(bytes) {
    const P = new Pdf(bytes);
    P.index();
    const pages = [], fonts = new Map();
    const list = P.pages();
    if (!list.length) throw new Error('PDF беттері табылмады.');
    let chars = 0;
    for (let i = 0; i < list.length; i++) {
      let items = [];
      try { items = await pageItems(P, list[i], fonts); } catch (e) { if (/unsupported-filter/.test(e.message)) items = []; else throw e; }
      for (const it of items) chars += it.s.length;
      pages.push(items);
      P.cache.clear();                       // үлкен файлда жадты ұстамау үшін (қаріптер өз кэшінде)
      await breathe();
    }
    if (chars < 50) throw new Error('PDF-те мәтін жоқ (сканерленген сурет болуы мүмкін) — оқу мүмкін емес. DOCX не мәтіні бар PDF жүктеңіз.');
    return { kind: 'pdf', pages };
  }

  /** Файл түрін мазмұнынан анықтап оқу. */
  async function read(name, bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return docx(u8);
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 1024));
    if (head.includes('%PDF-')) return pdf(u8);
    throw new Error('Файл түрі танылмады (DOCX не PDF керек): ' + name);
  }

  return { read, docx, pdf, docxXml, zipEntries, zipRead, parseCMap, breathe };
});
