/* Mura GIS Plugin API: манифест келісімшарты (manifest.json) және үйлесімділік тексерісі.
   Бір файл — екі жерде: бағдарлама (main/plugins/) және SDK құралдары (tools/validate.mjs, tools/pack.mjs).
   Сыртқы тәуелділік жоқ, Node.js 18+ не Electron. Mura GIS бастапқы кодынсыз жұмыс істейді.

   API нұсқалау тәртібі: apiVersion — бүтін сан жолы ("1"). Бір нұсқаның ішінде тек ҚОСЫМША өзгеріс енгізіледі
   (жаңа әдіс, жаңа міндетті емес өріс). Бар әдістің мағынасы не пішімі өзгерсе — жаңа нұсқа ("2"), ал бағдарлама
   бұрынғы нұсқаларды SUPPORTED_API тізімінде мүмкіндігінше ұстайды. */
'use strict';

const API_VERSION = '1';
const SUPPORTED_API = ['1'];
const PLATFORMS = ['desktop', 'tablet', 'mobile', 'web'];

/** Рұқсаттар. risk: low | medium | high; available: false — бұл API нұсқасында әдісі жоқ (сұрауға болады, бірақ берілмейді). */
const PERMISSIONS = {
  'geometry.read': { risk: 'low', available: true, kk: 'Геометрияны оқу (нүкте, сызық, полигон)', ru: 'Чтение геометрии (точки, линии, полигоны)' },
  'geometry.write': { risk: 'high', available: false, kk: 'Геометрияны өзгертуге сұрау', ru: 'Запрос на изменение геометрии' },
  'attributes.read': { risk: 'medium', available: true, kk: 'Нысандардың атрибуттарын оқу (атауы, мерзімі, орны, сипаттамасы…)', ru: 'Чтение атрибутов объектов (наименование, датировка, местонахождение, описание…)' },
  'attributes.write': { risk: 'high', available: false, kk: 'Атрибуттарды өзгертуге сұрау', ru: 'Запрос на изменение атрибутов' },
  'map.layers': { risk: 'low', available: true, kk: 'Картаға өз қабаттары мен уақытша геометрияны қосу, картадан нүкте таңдату', ru: 'Добавление своих слоёв и временной геометрии на карту, выбор точки на карте' },
  'files.export': { risk: 'medium', available: true, kk: 'Файл экспорттау (орнын әр жолы өзіңіз таңдайсыз)', ru: 'Экспорт файлов (место каждый раз выбираете вы)' },
  'network.access': { risk: 'high', available: true, kk: 'Сыртқы серверлерге сұрау жіберу (тек HTTPS) — деректерді интернетке жіберуі мүмкін', ru: 'Запросы к внешним серверам (только HTTPS) — может передавать данные в интернет' },
  'project.metadata': { risk: 'low', available: true, kk: 'Жоба туралы метадеректерді оқу (атауы, облыс, аудан, жазбалар саны)', ru: 'Чтение метаданных проекта (название, область, район, число записей)' },
  // 2.4.2-ден (тек қосымша): пайдаланушы өзі таңдаған файлды оқу — плагин файлдың жолын білмейді
  'files.import': { risk: 'medium', available: true, kk: 'Сіз таңдаған файлдарды оқу (файлды әр жолы өзіңіз таңдайсыз)', ru: 'Чтение выбранных вами файлов (файл каждый раз выбираете вы)' },
};

/** Кеңейту нүктелері: плагин өз элементін тек осы жерлерге қоя алады (жаңасы — тек соңына). */
const EXTENSION_POINTS = {
  'zone.export': { kk: 'Қорғау аймағы → Нәтиже және экспорт; «Қорғау аймақтары» тізімі', ru: 'Охранная зона → Результат и экспорт; список «Охранные зоны»' },
  'tools.menu': { kk: 'Қосымша құралдар (⋯ мәзірі)', ru: 'Дополнительные инструменты (меню ⋯)' },
  // 2.4.2-ден: белгі терезесі ашылғанда не атау жазылғанда плагиннен ұсыныс сұралады (көрінетін батырма жоқ)
  'mark.suggest': { kk: 'Ескерткіш белгісі → ұсыныстар (белгі терезесінде)', ru: 'Метка памятника → предложения (в окне метки)' },
};

const SETTING_TYPES = ['string', 'text', 'number', 'boolean', 'select'];

const ID_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
const SEMVER_RE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-([0-9A-Za-z.-]{1,40}))?$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]{0,199}$/;
const LANGS_RE = /^[a-z]{2}$/;
const KNOWN_KEYS = new Set(['$schema', 'id', 'name', 'version', 'apiVersion', 'minAppVersion', 'maxAppVersion', 'author', 'description', 'license',
  'homepage', 'repository', 'entry', 'icon', 'platforms', 'permissions', 'contributes', 'settings']);

function parseSemver(v) {
  const m = SEMVER_RE.exec(String(v || ''));
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' } : null;
}
/** a < b → -1, a = b → 0, a > b → 1 (pre-release нұсқасы релизден төмен). */
function compareVersions(a, b) {
  const x = parseSemver(a), y = parseSemver(b);
  if (!x || !y) return NaN;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** Көптілді мән: жол не { kk, ru, en… } → таза нысан. */
function cleanText(v, max) {
  const cut = s => [...String(s).trim()].slice(0, max).join('');
  if (typeof v === 'string') return cut(v) || null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = {};
  for (const [k, s] of Object.entries(v)) if (LANGS_RE.test(k) && typeof s === 'string' && s.trim()) o[k] = cut(s);
  return Object.keys(o).length ? o : null;
}
/** Көптілді мәннің берілген тілдегі нұсқасы (жоқ болса — kk → ru → en → біріншісі). */
function localize(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] || v.kk || v.ru || v.en || Object.values(v)[0] || '';
}

function safePath(p) {
  const s = String(p || '');
  return PATH_RE.test(s) && !s.split('/').some(x => !x || x === '.' || x === '..') && !s.endsWith('/');
}

/**
 * Манифестті тексеру және қалыпқа келтіру.
 * opts: { files?: Set<string> — архивтегі файлдар (entry, icon бар-жоғын тексеру үшін) }.
 * Қайтарады: { ok, errors: [kk], warnings: [kk], manifest } — manifest тек ok болса.
 */
function validateManifest(raw, opts = {}) {
  const errors = [], warnings = [];
  const err = s => errors.push(s), warn = s => warnings.push(s);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['manifest.json — JSON нысаны болуы керек.'], warnings };
  const m = {};
  for (const k of Object.keys(raw)) if (!KNOWN_KEYS.has(k)) warn('Белгісіз өріс еленбейді: ' + k);

  if (typeof raw.id !== 'string' || raw.id.length < 3 || raw.id.length > 100 || !ID_RE.test(raw.id)) err('id — бірегей кері домен түріндегі атау болуы керек (мыс. kz.example.nipd-exporter): кіші латын әріптері, сандар, «-», кемінде бір нүкте.');
  else m.id = raw.id;
  m.name = cleanText(raw.name, 80);
  if (!m.name) err('name — плагин атауы міндетті.');
  if (!parseSemver(raw.version)) err('version — x.y.z пішіміндегі нұсқа болуы керек (мыс. 1.0.0).');
  else m.version = raw.version;
  if (typeof raw.apiVersion !== 'string' || !/^[1-9]\d{0,2}$/.test(raw.apiVersion)) err('apiVersion — Plugin API нұсқасы, жол түрінде (мыс. "1").');
  else m.apiVersion = raw.apiVersion;
  if (!parseSemver(raw.minAppVersion)) err('minAppVersion — Mura GIS-тің ең төменгі нұсқасы, x.y.z пішімінде.');
  else m.minAppVersion = raw.minAppVersion;
  if (raw.maxAppVersion != null) {
    if (!parseSemver(raw.maxAppVersion)) err('maxAppVersion — x.y.z пішімінде болуы керек.');
    else if (m.minAppVersion && compareVersions(raw.maxAppVersion, m.minAppVersion) < 0) err('maxAppVersion minAppVersion-нан кіші.');
    else m.maxAppVersion = raw.maxAppVersion;
  }
  const author = typeof raw.author === 'string' ? { name: raw.author } : raw.author;
  if (!author || typeof author !== 'object' || typeof author.name !== 'string' || !author.name.trim()) err('author — әзірлеуші (жол не { name, url, email }) міндетті.');
  else {
    m.author = { name: [...author.name.trim()].slice(0, 120).join('') };
    if (typeof author.url === 'string' && /^https:\/\/[^\s]{3,300}$/.test(author.url)) m.author.url = author.url;
    if (typeof author.email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(author.email)) m.author.email = author.email;
  }
  if (raw.description != null) { m.description = cleanText(raw.description, 500); if (!m.description) warn('description бос не дұрыс емес — еленбейді.'); }
  if (raw.license != null) { if (typeof raw.license === 'string' && raw.license.trim()) m.license = raw.license.trim().slice(0, 60); else warn('license дұрыс емес — еленбейді.'); }
  for (const k of ['homepage', 'repository']) {
    if (raw[k] == null) continue;
    if (typeof raw[k] === 'string' && /^https:\/\/[^\s]{3,300}$/.test(raw[k])) m[k] = raw[k]; else warn(k + ' — https:// сілтемесі болуы керек, еленбейді.');
  }

  if (typeof raw.entry !== 'string' || !safePath(raw.entry) || !/\.js$/.test(raw.entry)) err('entry — архив ішіндегі .js файлының салыстырмалы жолы (мыс. main.js).');
  else if (opts.files && !opts.files.has(raw.entry)) err('entry файлы архивте жоқ: ' + raw.entry);
  else m.entry = raw.entry;
  if (raw.icon != null) {
    if (typeof raw.icon !== 'string' || !safePath(raw.icon) || !/\.(svg|png)$/i.test(raw.icon)) warn('icon — .svg не .png файлының жолы болуы керек, еленбейді.');
    else if (opts.files && !opts.files.has(raw.icon)) warn('icon файлы архивте жоқ: ' + raw.icon);
    else m.icon = raw.icon;
  }

  const plats = raw.platforms == null ? ['desktop'] : raw.platforms;
  if (!Array.isArray(plats) || !plats.length || plats.some(p => !PLATFORMS.includes(p))) err('platforms — мына мәндердің тізімі: ' + PLATFORMS.join(', ') + '.');
  else m.platforms = [...new Set(plats)];

  const perms = raw.permissions == null ? [] : raw.permissions;
  if (!Array.isArray(perms) || perms.some(p => typeof p !== 'string')) err('permissions — рұқсат атауларының тізімі.');
  else {
    const unknown = perms.filter(p => !PERMISSIONS[p]);
    if (unknown.length) err('Белгісіз рұқсат: ' + unknown.join(', ') + '. Бар рұқсаттар: ' + Object.keys(PERMISSIONS).join(', ') + '.');
    const na = perms.filter(p => PERMISSIONS[p] && !PERMISSIONS[p].available);
    if (na.length) warn('Plugin API ' + API_VERSION + '-де бұл рұқсаттардың әдісі жоқ, олар берілмейді: ' + na.join(', ') + '.');
    m.permissions = [...new Set(perms.filter(p => PERMISSIONS[p]))];
  }

  m.contributes = {};
  const contrib = raw.contributes == null ? {} : raw.contributes;
  if (!contrib || typeof contrib !== 'object' || Array.isArray(contrib)) err('contributes — нысан болуы керек.');
  else {
    for (const [point, list] of Object.entries(contrib)) {
      if (!EXTENSION_POINTS[point]) { err('Белгісіз кеңейту нүктесі: ' + point + '. Бар нүктелер: ' + Object.keys(EXTENSION_POINTS).join(', ') + '.'); continue; }
      if (!Array.isArray(list) || list.length > 10) { err('contributes["' + point + '"] — 10-нан аспайтын тізім.'); continue; }
      m.contributes[point] = [];
      list.forEach((c, i) => {
        const title = c && cleanText(c.title, 60);
        if (!c || typeof c.command !== 'string' || !KEY_RE.test(c.command) || !title) { err('contributes["' + point + '"][' + i + '] — { command, title } керек.'); return; }
        const it = { command: c.command, title };
        const tip = cleanText(c.tooltip, 200);
        if (tip) it.tooltip = tip;
        m.contributes[point].push(it);
      });
    }
  }

  m.settings = [];
  const sets = raw.settings == null ? [] : raw.settings;
  if (!Array.isArray(sets) || sets.length > 40) err('settings — 40-тан аспайтын тізім.');
  else {
    const seen = new Set();
    sets.forEach((s, i) => {
      const where = 'settings[' + i + ']';
      if (!s || typeof s !== 'object' || typeof s.key !== 'string' || !KEY_RE.test(s.key) || seen.has(s.key)) { err(where + ': key — бірегей атау керек.'); return; }
      if (!SETTING_TYPES.includes(s.type)) { err(where + ': type — ' + SETTING_TYPES.join(' | ') + '.'); return; }
      const title = cleanText(s.title, 120);
      if (!title) { err(where + ': title міндетті.'); return; }
      seen.add(s.key);
      const it = { key: s.key, type: s.type, title };
      const d = cleanText(s.description, 500);
      if (d) it.description = d;
      if (s.type === 'select') {
        if (!Array.isArray(s.options) || !s.options.length || s.options.length > 50) { err(where + ': options — тізім керек.'); return; }
        it.options = [];
        for (const o of s.options) {
          const v = o && typeof o === 'object' ? o.value : o;
          if (typeof v !== 'string' || v.length > 100) { err(where + ': options мәндері — жол.'); return; }
          it.options.push({ value: v, title: (o && typeof o === 'object' && cleanText(o.title, 120)) || v });
        }
      }
      it.default = settingValue(it, s.default);
      m.settings.push(it);
    });
  }

  return errors.length ? { ok: false, errors, warnings } : { ok: true, errors, warnings, manifest: m };
}

/** Баптау мәнін түріне келтіру (дұрыс болмаса — әдепкі мән). */
function settingValue(s, v) {
  const def = s.default;
  switch (s.type) {
    case 'boolean': return typeof v === 'boolean' ? v : (typeof def === 'boolean' ? def : false);
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? v : (typeof def === 'number' ? def : 0);
    case 'select': return s.options.some(o => o.value === v) ? v : (s.options.some(o => o.value === def) ? def : s.options[0].value);
    default: return typeof v === 'string' ? [...v].slice(0, s.type === 'text' ? 200000 : 2000).join('') : (typeof def === 'string' ? def : '');
  }
}

/** Плагин осы бағдарламада іске қосыла ала ма: { ok, reason (kk), reason_ru }. */
function compatibility(m, env) {
  const appVersion = env.appVersion, platform = env.platform || 'desktop', apis = env.apis || SUPPORTED_API;
  if (!apis.includes(m.apiVersion)) return { ok: false, reason: 'Plugin API ' + m.apiVersion + ' нұсқасы қолдау көрсетілмейді (бағдарлама: ' + apis.join(', ') + ').', reason_ru: 'Версия Plugin API ' + m.apiVersion + ' не поддерживается (программа: ' + apis.join(', ') + ').' };
  if (compareVersions(appVersion, m.minAppVersion) < 0) return { ok: false, reason: 'Mura GIS ' + m.minAppVersion + ' не жаңасы керек (қазір ' + appVersion + ').', reason_ru: 'Нужна Mura GIS ' + m.minAppVersion + ' или новее (сейчас ' + appVersion + ').' };
  if (m.maxAppVersion && compareVersions(appVersion, m.maxAppVersion) > 0) return { ok: false, reason: 'Плагин Mura GIS ' + m.maxAppVersion + ' нұсқасына дейін ғана арналған (қазір ' + appVersion + ').', reason_ru: 'Плагин рассчитан только до Mura GIS ' + m.maxAppVersion + ' (сейчас ' + appVersion + ').' };
  if (!m.platforms.includes(platform)) return { ok: false, reason: 'Плагин бұл платформаны (' + platform + ') қолдамайды: ' + m.platforms.join(', ') + '.', reason_ru: 'Плагин не поддерживает эту платформу (' + platform + '): ' + m.platforms.join(', ') + '.' };
  return { ok: true, reason: '', reason_ru: '' };
}

/** permissions.json (міндетті емес): { "рұқсат": "не үшін керек" } — тек манифестте сұралған рұқсаттар үшін. */
function cleanReasons(raw, perms) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const p of perms) {
    const t = cleanText(raw[p], 300);
    if (t) out[p] = t;
  }
  return out;
}

module.exports = {
  API_VERSION, SUPPORTED_API, PLATFORMS, PERMISSIONS, EXTENSION_POINTS, SETTING_TYPES,
  validateManifest, compatibility, compareVersions, parseSemver, settingValue, localize, cleanReasons, safePath,
};
