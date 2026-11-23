/* Mura GIS Plugin API: атрибуттар көмекшілері (Attributes API-дің рұқсат талап етпейтін бөлігі, mura.attributes.*).
   Сыртқы жүйенің өрістер схемасы бойынша жазба құру (map) және тексеру (validate). Схема — плагиннің өз конфигурациясы:
   { "fields": [ { "name", "type": "string|number|integer|boolean|date", "required", "maxLength", "min", "max", "enum",
                   "pattern", "source": "mark.name" | ["mark.name", "zone.name"], "value": тұрақты мән, "default" } ] }
   source — дереккөздер нысанындағы нүктелі жол; тізім болса — бірінші бос еместігі алынады. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MuraAttrs = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TYPES = ['string', 'number', 'integer', 'boolean', 'date'];
  var empty = function (v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); };

  function get(src, path) {
    var cur = src;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, parts[i])) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function coerce(v, t) {
    if (empty(v)) return null;
    if (t === 'number' || t === 'integer') {
      var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s+/g, ''));
      if (!isFinite(n)) return v;
      return t === 'integer' && Number.isInteger(n) ? n : n;
    }
    if (t === 'boolean') { if (typeof v === 'boolean') return v; var s = String(v).toLowerCase(); return s === 'true' || s === '1' || s === 'иә' || s === 'да' ? true : s === 'false' || s === '0' || s === 'жоқ' || s === 'нет' ? false : v; }
    if (t === 'date') { var d = new Date(v); return isNaN(d) ? v : d.toISOString().slice(0, 10); }
    return typeof v === 'string' ? v.trim() : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  /** Схемаңың өзін тексеру: { ok, errors }. */
  function checkSchema(schema) {
    var errs = [];
    if (!schema || typeof schema !== 'object' || !Array.isArray(schema.fields) || !schema.fields.length) return { ok: false, errors: ['Схемада fields тізімі жоқ.'] };
    var seen = {};
    schema.fields.forEach(function (f, i) {
      if (!f || typeof f.name !== 'string' || !f.name) errs.push('fields[' + i + ']: name жоқ.');
      else if (seen[f.name]) errs.push('fields[' + i + ']: «' + f.name + '» қайталанады.');
      else seen[f.name] = 1;
      if (f && f.type && TYPES.indexOf(f.type) < 0) errs.push('fields[' + i + ']: type — ' + TYPES.join(' | ') + '.');
      if (f && f.pattern) { try { new RegExp(f.pattern); } catch (e) { errs.push('fields[' + i + ']: pattern дұрыс емес.'); } }
    });
    return { ok: !errs.length, errors: errs };
  }
  /** Дереккөздерден (мыс. { mark, zone, computed }) схема бойынша жаңа жазба құру. Бастапқы нысандар өзгермейді. */
  function map(sources, schema) {
    var out = {};
    (schema && schema.fields || []).forEach(function (f) {
      var v;
      if (Object.prototype.hasOwnProperty.call(f, 'value')) v = f.value;
      else {
        var list = Array.isArray(f.source) ? f.source : f.source ? [f.source] : [];
        for (var i = 0; i < list.length && empty(v); i++) v = get(sources, list[i]);
      }
      if (empty(v) && f.default !== undefined) v = f.default;
      out[f.name] = coerce(v, f.type || 'string');
    });
    return out;
  }
  /** Жазбаны схемамен тексеру: { ok, errors: [{ field, message }] }. Схемада жоқ өрістер — қате (strict: false болса — жоқ). */
  function validate(rec, schema, opts) {
    var errs = [];
    var add = function (f, m) { errs.push({ field: f, message: m }); };
    if (!rec || typeof rec !== 'object') return { ok: false, errors: [{ field: '', message: 'Жазба нысан емес.' }] };
    var fields = schema && schema.fields || [];
    var names = {};
    fields.forEach(function (f) {
      names[f.name] = 1;
      var v = rec[f.name], t = f.type || 'string';
      if (empty(v)) { if (f.required) add(f.name, 'міндетті өріс толтырылмаған'); return; }
      if (t === 'string' && typeof v !== 'string') add(f.name, 'жол (string) болуы керек');
      if ((t === 'number' || t === 'integer') && (typeof v !== 'number' || !isFinite(v))) add(f.name, 'сан болуы керек');
      if (t === 'integer' && typeof v === 'number' && !Number.isInteger(v)) add(f.name, 'бүтін сан болуы керек');
      if (t === 'boolean' && typeof v !== 'boolean') add(f.name, 'true / false болуы керек');
      if (t === 'date' && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v))) add(f.name, 'күн ЖЖЖЖ-АА-КК пішімінде болуы керек');
      if (typeof v === 'string' && f.maxLength && [].concat(Array.from(v)).length > f.maxLength) add(f.name, 'ұзындығы ' + f.maxLength + ' таңбадан аспауы керек');
      if (typeof v === 'number' && f.min != null && v < f.min) add(f.name, f.min + '-ден кем болмауы керек');
      if (typeof v === 'number' && f.max != null && v > f.max) add(f.name, f.max + '-ден аспауы керек');
      if (f.enum && f.enum.indexOf(v) < 0) add(f.name, 'рұқсат етілген мәндердің бірі болуы керек: ' + f.enum.join(', '));
      if (f.pattern && typeof v === 'string' && !new RegExp(f.pattern).test(v)) add(f.name, 'пішімі сәйкес емес');
    });
    if (!opts || opts.strict !== false) Object.keys(rec).forEach(function (k) { if (!names[k]) add(k, 'схемада жоқ өріс'); });
    return { ok: !errs.length, errors: errs };
  }
  return { map: map, validate: validate, checkSchema: checkSchema, get: get };
});
