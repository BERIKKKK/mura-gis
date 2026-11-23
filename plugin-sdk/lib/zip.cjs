/* .muraplug архиві — кәдімгі ZIP (тек «stored» не «deflate», шифрсыз, ZIP64-сіз).
   readPlugin — сенімсіз архивті ҚАТАҢ оқу: жолдар, өлшемдер, сығу коэффициенті, CRC-32, файл түрлері тексеріледі,
   ештеңе орындалмайды және дискіге жазылмайды (нәтиже — жадтағы файлдар). writeZip — SDK жинақтаушысы үшін.
   Сыртқы тәуелділік жоқ (node:zlib). */
'use strict';
const zlib = require('node:zlib');

const LIMITS = {
  archive: 20 * 1024 * 1024,      // архив
  entries: 500,                   // файл саны
  file: 25 * 1024 * 1024,         // бір файл (ашылған)
  total: 60 * 1024 * 1024,        // барлығы (ашылған)
  ratio: 120,                     // сығу коэффициенті (ZIP-бомбаға қарсы), 64 КБ-тан үлкен файлдарға
};
/** Рұқсат етілген файл түрлері: плагинде орындалатын бинарлы файл, HTML бет, скрипттің басқа түрі болмайды. */
const ALLOWED_EXT = new Set(['js', 'json', 'md', 'txt', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'css', 'geojson', 'csv', 'xml', 'qml']);
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const META_FILE = '.mura-integrity.json';     // бағдарламаның өз файлы (орнатылған қалтада) — архивте болмауы керек

let TABLE = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class ZipError extends Error {}
const fail = m => { throw new ZipError(m); };

/** Архивтегі жолды тексеру: тек «a/b/c.ext», «..», абсолют жол, диск әрпі, басқару таңбалары, Windows-тың тыйым атаулары жоқ. */
function checkName(name) {
  if (!name || name.length > 200) fail('Файл атауы тым ұзын не бос.');
  if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(name)) fail('Файл атауында рұқсат етілмеген таңба бар: ' + JSON.stringify(name));
  if (name.startsWith('/')) fail('Абсолют жол рұқсат етілмейді: ' + name);
  const parts = name.split('/');
  for (const p of parts) {
    if (!p || p === '.' || p === '..') fail('Жол дұрыс емес (бос не «..» бөлігі): ' + name);
    if (RESERVED.test(p) || /[. ]$/.test(p)) fail('Windows-та рұқсат етілмеген атау: ' + name);
  }
}

/**
 * Сенімсіз .muraplug архивін оқу. Қайтарады: { files: Map<жол, Buffer> }.
 * Қате болса — ZipError (пайдаланушыға көрсетуге болатын қазақша мәтін).
 */
function readPlugin(buf, limits = LIMITS) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length > limits.archive) fail('Архив тым үлкен (' + Math.round(buf.length / 1048576) + ' МБ; шегі ' + Math.round(limits.archive / 1048576) + ' МБ).');
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) fail('Файл ZIP (.muraplug) архиві емес.');
  // Орталық каталогтың соңы (EOCD): соңғы 64 КБ ішінен іздейміз
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) fail('ZIP архивінің мазмұны (орталық каталог) табылмады — файл бүлінген.');
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) fail('Бірнеше бөлікке бөлінген архив қолдау көрсетілмейді.');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xFFFF || cdOff === 0xFFFFFFFF) fail('ZIP64 архиві қолдау көрсетілмейді.');
  if (count > limits.entries) fail('Архивте файл тым көп (' + count + '; шегі ' + limits.entries + ').');
  if (cdOff + cdSize > eocd) fail('ZIP архивінің мазмұны бүлінген.');

  const files = new Map(), lower = new Set();
  let total = 0, p = cdOff;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== 0x02014b50) fail('ZIP мазмұнының жазбасы бүлінген.');
    const made = buf.readUInt16LE(p + 4) >> 8, flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const ext = buf.readUInt32LE(p + 38), loff = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (flags & 0x1) fail('Шифрланған архив рұқсат етілмейді.');
    const unixMode = made === 3 ? ext >>> 16 : 0;
    if ((unixMode & 0o170000) === 0o120000) fail('Архивте символдық сілтеме бар — рұқсат етілмейді: ' + name);
    if (name.endsWith('/')) { if (usize) fail('Қалта жазбасы дұрыс емес: ' + name); continue; }
    checkName(name);
    if (name === META_FILE) fail(META_FILE + ' — бағдарламаның қызметтік атауы, архивте болмауы керек.');
    const e = (name.split('/').pop().match(/\.([A-Za-z0-9]+)$/) || [])[1];
    if (!e || !ALLOWED_EXT.has(e.toLowerCase())) fail('Бұл түрдегі файл плагинде рұқсат етілмейді: ' + name + ' (рұқсат етілгені: ' + [...ALLOWED_EXT].join(', ') + ').');
    if (lower.has(name.toLowerCase())) fail('Архивте аттас файлдар бар: ' + name);
    lower.add(name.toLowerCase());
    if (method !== 0 && method !== 8) fail('Сығу әдісі қолдау көрсетілмейді (' + method + '): ' + name);
    if (usize > limits.file) fail('Файл тым үлкен: ' + name);
    total += usize;
    if (total > limits.total) fail('Архивтің ашылған көлемі тым үлкен.');
    if (usize > 65536 && csize > 0 && usize / csize > limits.ratio) fail('Сығу коэффициенті күдікті (ZIP-бомба болуы мүмкін): ' + name);
    // Жергілікті тақырып
    if (loff + 30 > cdOff || buf.readUInt32LE(loff) !== 0x04034b50) fail('Файлдың жергілікті тақырыбы бүлінген: ' + name);
    const start = loff + 30 + buf.readUInt16LE(loff + 26) + buf.readUInt16LE(loff + 28);
    if (start + csize > cdOff) fail('Файл деректері архив шегінен шығады: ' + name);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) { if (csize !== usize) fail('Файл өлшемі сәйкес емес: ' + name); data = Buffer.from(raw); }
    else {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: usize + 1 }); } catch (e2) { fail('Файл ашылмады (бүлінген): ' + name); }
      if (data.length !== usize) fail('Файл өлшемі сәйкес емес: ' + name);
    }
    if (crc32(data) !== crc) fail('Бақылау сомасы (CRC-32) сәйкес емес — архив бүлінген: ' + name);
    files.set(name, data);
  }
  return { files };
}

/** ZIP жазу (SDK: tools/pack.mjs). files: [[жол, Buffer]…] — UTF-8 атаулар, deflate. opts.date — файлдардың уақыты (әдепкі: қазір). */
function writeZip(files, opts = {}) {
  const locals = [], centrals = [];
  let off = 0;
  const now = opts.date instanceof Date ? opts.date : new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data0] of files) {
    checkName(name);
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(data0);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const nm = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nm, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    centrals.push(ch, nm);
    off += 30 + nm.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

module.exports = { readPlugin, writeZip, crc32, checkName, ZipError, LIMITS, ALLOWED_EXT, META_FILE };
