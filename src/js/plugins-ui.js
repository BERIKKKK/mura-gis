/* Mura GIS: плагиндер — бағдарлама терезесіндегі бөлігі.
     • «Баптаулар → Плагиндер»: Орнатылған (қосу/өшіру, баптаулар, рұқсаттар, журнал, жою), Орнату (.muraplug таңдау,
       тексеру нәтижесі, рұқсаттар, жауапкершілік ескертуі, растау), Әзірлеушілерге (API, манифест, SDK);
     • кеңейту нүктелері: «Қорғау аймағы → Нәтиже және экспорт» (zone.export) және «⋯ Қосымша құралдар» (tools.menu) —
       элементтер манифесттен алынады, плагин өшірілсе — жасырылады;
     • плагиннің сұраныстары (хабар, диалог, панель, карта қабаттары, картадан нүкте таңдау) — тек осы файлда, тек
       textContent арқылы салынады (плагиннен келген HTML/скрипт бетке ешқашан қойылмайды), әр терезеде плагин атауы көрсетіледі.
   Плагин коды бұл бетте ОРЫНДАЛМАЙДЫ: ол бөлек оқшауланған процесте (main/plugins/host.js). Бұл кәдімгі скрипт
   project.js-тен кейін жүктеледі; MuraPluginsUI.mount(pane) — баптаулар терезесі ашылғанда. */
(function () {
  'use strict';
  var M = window.mura || {};
  var P = M.plugins;
  if (!P) return;
  var I18N = window.MuraI18n || { tx: function (a) { return a; }, lang: 'kk' };
  var tx = I18N.tx, LANG = I18N.lang === 'ru' ? 'ru' : 'kk';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var loc = function (v) { if (v == null) return ''; if (typeof v === 'string') return v; return v[LANG] || v.kk || v.ru || v.en || Object.keys(v).map(function (k) { return v[k]; })[0] || ''; };
  var svg = function (p, s) { return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + (s || 16) + '" height="' + (s || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    plug: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  function toast(msg, err) {
    var t = $('qaToast');
    if (!t) return;
    t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, err ? 6000 : 3200);
  }
  var fmt = function (iso) { var d = new Date(iso); if (!iso || isNaN(d)) return ''; var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  var INFO = null;
  function info() { return INFO ? Promise.resolve(INFO) : P.info().then(function (r) { INFO = r && r.ok ? r : { permissions: {}, points: {} }; return INFO; }); }
  var permText = function (p) { var d = INFO && INFO.permissions[p]; return d ? (LANG === 'ru' ? d.ru : d.kk) : p; };
  var riskText = function (r) { return r === 'high' ? tx('жоғары тәуекел', 'высокий риск') : r === 'medium' ? tx('орташа', 'средний') : tx('төмен', 'низкий'); };

  /* ======================= Кеңейту нүктелері ======================= */
  var contrib = [];
  function loadContrib() {
    return P.contributions().then(function (r) { contrib = r && r.ok ? r.items : []; paintPoints(); }, function () { contrib = []; paintPoints(); });
  }
  function zoneSelection() {
    var qa = globalThis.__qa;
    if (!qa || !qa.snapshot) return null;
    var s = qa.snapshot();
    return { layer: 'zones', id: s.id, saved: !!s.id, markId: s.markId, fields: s.fields, pts: s.pts };
  }
  function run(c, ctx, sel) {
    var name = loc(c.pluginName);
    toast(tx('Плагин «' + name + '» орындалуда…', 'Плагин «' + name + '» выполняется…'));
    return P.invoke(c.plugin, c.command, ctx, sel).then(function (r) {
      if (!r || !r.ok) toast(tx('Плагин «' + name + '»: ', 'Плагин «' + name + '»: ') + (r && r.error || tx('қате', 'ошибка')), true);
      else { var t = $('qaToast'); if (t && /орындалуда|выполняется/.test(t.textContent)) t.hidden = true; }
      return r;
    });
  }
  function itemBtn(c, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    b.dataset.plugin = c.plugin; b.dataset.command = c.command;
    b.title = (loc(c.tooltip) || loc(c.title)) + ' — ' + tx('плагин: ', 'плагин: ') + loc(c.pluginName);
    b.innerHTML = svg(IC.plug, 15);
    b.appendChild(el('span', '', loc(c.title)));
    return b;
  }
  function paintPoints() {
    // Қорғау аймағы → Нәтиже және экспорт
    var acts = document.querySelector('#qaResSec .qa-actions');
    var box = $('muraPlZoneExp');
    var list = contrib.filter(function (c) { return c.point === 'zone.export'; });
    if (acts && !box && list.length) {
      box = el('div', 'mura-pl-pt'); box.id = 'muraPlZoneExp';
      acts.parentNode.insertBefore(box, acts.nextSibling);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-plugin]');
        if (!b) return;
        var c = contrib.filter(function (x) { return x.plugin === b.dataset.plugin && x.command === b.dataset.command && x.point === 'zone.export'; })[0];
        if (!c) return;
        var sel = zoneSelection();
        if (!sel || !sel.pts || sel.pts.length < 4) { toast(tx('Алдымен ескерткіш аумағының шекарасын белгілеңіз (кемінде 4 нүкте).', 'Сначала обозначьте границу территории памятника (не менее 4 точек).'), true); return; }
        run(c, { point: 'zone.export', docLang: I18N.docLang ? I18N.docLang() : LANG, zone: { id: sel.id, markId: sel.markId, saved: sel.saved } }, sel);
      });
    }
    if (box) {
      box.hidden = !list.length;
      box.innerHTML = '';
      if (list.length) {
        box.appendChild(el('span', 'mura-pl-lbl', tx('Плагиндер:', 'Плагины:')));
        list.forEach(function (c) { box.appendChild(itemBtn(c, 'btn btn--ghost btn--sm mura-pl-btn')); });
      }
      mirrorZone();
    }
    // ⋯ Қосымша құралдар
    var menu = $('qaMoreMenu');
    var grp = $('muraPlMenu');
    var tl = contrib.filter(function (c) { return c.point === 'tools.menu'; });
    if (menu && !grp && tl.length) {
      grp = el('div', 'mura-pl-menu'); grp.id = 'muraPlMenu';
      var anchor = $('qaReset') ? $('qaReset').previousElementSibling : null;
      menu.insertBefore(grp, anchor && anchor.classList.contains('qa-msep') ? anchor : null);
      grp.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-plugin]');
        if (!b) return;
        if (globalThis.QAUI && globalThis.QAUI.closePop) globalThis.QAUI.closePop();
        var c = contrib.filter(function (x) { return x.plugin === b.dataset.plugin && x.command === b.dataset.command && x.point === 'tools.menu'; })[0];
        if (!c) return;
        var sel = zoneSelection();
        run(c, { point: 'tools.menu', docLang: I18N.docLang ? I18N.docLang() : LANG, service: globalThis.MuraSvc ? globalThis.MuraSvc.get() : '' }, sel && sel.pts && sel.pts.length >= 3 ? sel : null);
      });
    }
    if (grp) {
      grp.hidden = !tl.length;
      grp.innerHTML = '';
      if (tl.length) {
        grp.appendChild(el('div', 'qa-msep'));
        grp.appendChild(el('div', 'mura-pl-mh', tx('Плагиндер', 'Плагины')));
        tl.forEach(function (c) { var b = itemBtn(c, 'qa-mi'); b.setAttribute('role', 'menuitem'); grp.appendChild(b); });
      }
    }
  }
  // Экспорт батырмалары GeoJSON батырмасымен бірге қосылады/сөнеді (аймақ есептелмесе — экспорт жоқ)
  function mirrorZone() {
    var g = $('qaGeo'), box = $('muraPlZoneExp');
    if (!g || !box) return;
    [].forEach.call(box.querySelectorAll('button'), function (b) { b.disabled = g.disabled; });
  }
  if ($('qaGeo')) new MutationObserver(mirrorZone).observe($('qaGeo'), { attributes: true, attributeFilter: ['disabled'] });
  if (P.onChanged) P.onChanged(function () { loadContrib(); if (pane) paint(); });
  loadContrib();

  /* ======================= Плагин сұраныстары (диалог, панель, карта) ======================= */
  var owned = {};     // pluginId → { dialogs: [], panels: {}, layers: {}, temp: L.Layer, symbols: {}, pick }
  var own = function (id) { return owned[id] || (owned[id] = { dialogs: [], panels: {}, layers: {}, temp: null, symbols: {}, pick: null, pseq: 0 }); };

  /** Сипаттамадан (spec) элементтер: тек мәтін, плагиннен HTML қабылданбайды. */
  function renderBody(box, body, values) {
    box.innerHTML = '';
    (Array.isArray(body) ? body : []).slice(0, 200).forEach(function (b) {
      if (!b || typeof b !== 'object') return;
      var t = b.type;
      if (t === 'heading') box.appendChild(el('h4', 'mura-pl-h', String(b.text || '')));
      else if (t === 'text') box.appendChild(el('p', 'mura-pl-t' + (/^(info|warn|error|muted|ok)$/.test(b.tone) ? ' is-' + b.tone : ''), String(b.text || '')));
      else if (t === 'code') box.appendChild(el('pre', 'mura-pl-code', String(b.text || '').slice(0, 200000)));
      else if (t === 'list') { var ul = el('ul', 'mura-pl-ul'); (b.items || []).slice(0, 500).forEach(function (x) { ul.appendChild(el('li', '', String(x))); }); box.appendChild(ul); }
      else if (t === 'table') {
        var wrap = el('div', 'mura-pl-tw'), tb = el('table', 'tbl mura-pl-tbl');
        if (Array.isArray(b.columns)) { var tr = el('tr'); b.columns.slice(0, 20).forEach(function (c) { tr.appendChild(el('th', '', String(c))); }); var th = el('thead'); th.appendChild(tr); tb.appendChild(th); }
        var bd = el('tbody');
        (b.rows || []).slice(0, 2000).forEach(function (r) { var tr2 = el('tr'); (Array.isArray(r) ? r : [r]).slice(0, 20).forEach(function (c) { tr2.appendChild(el('td', '', c == null ? '' : String(c))); }); bd.appendChild(tr2); });
        tb.appendChild(bd); wrap.appendChild(tb); box.appendChild(wrap);
      } else if (t === 'field' && typeof b.key === 'string') {
        var lab = el('label', 'mura-pl-f'), kind = b.kind || 'string', v = values && b.key in values ? values[b.key] : b.value, inp;
        if (kind === 'boolean') {
          lab.className = 'mura-cb mura-pl-f';
          inp = el('input'); inp.type = 'checkbox'; inp.checked = !!v;
          lab.appendChild(inp); lab.appendChild(el('span', '', String(b.label || b.key)));
        } else {
          lab.appendChild(el('span', '', String(b.label || b.key) + (b.required ? ' *' : '')));
          if (kind === 'select') { inp = el('select'); (b.options || []).slice(0, 200).forEach(function (o) { var op = el('option', '', String(o && o.title != null ? loc(o.title) : (o && o.value != null ? o.value : o))); op.value = String(o && o.value != null ? o.value : o); inp.appendChild(op); }); inp.value = v == null ? '' : String(v); }
          else if (kind === 'text') { inp = el('textarea'); inp.rows = Math.max(2, Math.min(16, +b.rows || 5)); inp.value = v == null ? '' : String(v); }
          else { inp = el('input'); inp.type = kind === 'number' ? 'number' : 'text'; inp.value = v == null ? '' : String(v); }
          lab.appendChild(inp);
        }
        inp.dataset.key = b.key; inp.dataset.kind = kind;
        if (b.description) lab.appendChild(el('small', '', String(b.description)));
        box.appendChild(lab);
      }
    });
  }
  function readValues(box) {
    var o = {};
    [].forEach.call(box.querySelectorAll('[data-key]'), function (i) {
      var k = i.dataset.kind;
      o[i.dataset.key] = k === 'boolean' ? i.checked : k === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value;
    });
    return o;
  }
  function frame(req, cls, title) {
    var d = el('div', cls);
    var head = el('div', 'mura-pl-dh');
    var badge = el('span', 'mura-pl-badge'); badge.innerHTML = svg(IC.plug, 13); badge.appendChild(el('span', '', tx('Плагин: ', 'Плагин: ') + (req.name || req.plugin)));
    badge.title = tx('Бұл терезені үшінші тарап плагині ашты: ', 'Это окно открыл сторонний плагин: ') + req.plugin;
    head.appendChild(badge);
    head.appendChild(el('h3', '', String(title || '')));
    var x = el('button', 'mura-start-x'); x.type = 'button'; x.setAttribute('aria-label', tx('Жабу', 'Закрыть')); x.innerHTML = svg(IC.close, 16); x.dataset.x = '1';
    head.appendChild(x);
    d.appendChild(head);
    var body = el('div', 'mura-pl-db'); d.appendChild(body);
    var btns = el('div', 'mura-dlg-btns'); d.appendChild(btns);
    return { root: d, body: body, btns: btns };
  }
  function addButtons(btns, list, def) {
    btns.innerHTML = '';
    var arr = Array.isArray(list) && list.length ? list.slice(0, 6) : def;
    arr.forEach(function (b) {
      var x = el('button', 'btn btn--sm ' + (b.primary ? 'btn--primary' : 'btn--ghost'), loc(b.title) || String(b.id));
      x.type = 'button'; x.dataset.btn = String(b.id == null ? '' : b.id);
      btns.appendChild(x);
    });
  }
  function openDialog(req, spec, confirmMode) {
    spec = spec && typeof spec === 'object' ? spec : {};
    var tt = $('qaToast');
    if (tt && !tt.classList.contains('is-err')) tt.hidden = true;           // «орындалуда…» — диалог ашылды
    return new Promise(function (resolve) {
      var back = el('div', 'mura-dlg-back mura-pl-back');
      var f = frame(req, 'mura-dlg mura-pl-dlg' + (spec.width === 'wide' ? ' is-wide' : ''), loc(spec.title) || tx('Плагин', 'Плагин'));
      back.appendChild(f.root);
      if (confirmMode) renderBody(f.body, [{ type: 'text', text: spec.text }]); else renderBody(f.body, spec.body);
      addButtons(f.btns, confirmMode ? null : spec.buttons, confirmMode
        ? [{ id: 'no', title: tx('Бас тарту', 'Отмена') }, { id: 'yes', title: tx('Иә', 'Да'), primary: true }]
        : [{ id: 'ok', title: tx('Жабу', 'Закрыть'), primary: true }]);
      var o = own(req.plugin);
      var done = function (btn) {
        back.remove(); document.removeEventListener('keydown', key, true);
        o.dialogs = o.dialogs.filter(function (x) { return x !== rec; });
        resolve(confirmMode ? btn === 'yes' : { button: btn, values: readValues(f.body) });
      };
      var key = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
      var rec = { close: function () { done(null); } };
      o.dialogs.push(rec);
      back.addEventListener('click', function (e) {
        if (e.target.closest('[data-x]')) { done(null); return; }
        var b = e.target.closest('[data-btn]');
        if (b) done(b.dataset.btn);
      });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      var first = f.root.querySelector('input, select, textarea, .btn--primary');
      if (first) first.focus();
    });
  }
  function openPanel(req, spec) {
    var o = own(req.plugin);
    if (Object.keys(o.panels).length >= 3) throw new Error(tx('Плагин 3-тен артық панель аша алмайды.', 'Плагин не может открыть больше 3 панелей.'));
    var pid = 'p' + (++o.pseq);
    var f = frame(req, 'mura-pl-panel qa-glass', loc(spec && spec.title));
    var host = $('qaApp') || document.body;
    host.appendChild(f.root);
    var rec = { f: f, spec: spec || {} };
    o.panels[pid] = rec;
    var paintP = function () { renderBody(f.body, rec.spec.body); addButtons(f.btns, rec.spec.buttons, []); f.root.querySelector('h3').textContent = loc(rec.spec.title); };
    rec.paint = paintP;
    paintP();
    f.root.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) { closePanelRec(req.plugin, pid, true); return; }
      var b = e.target.closest('[data-btn]');
      if (b) P.panelEvent(req.plugin, pid, 'action', b.dataset.btn, readValues(f.body));
    });
    return { id: pid };
  }
  function closePanelRec(plugin, pid, notify) {
    var o = own(plugin), rec = o.panels[pid];
    if (!rec) return;
    rec.f.root.remove();
    delete o.panels[pid];
    if (notify) P.panelEvent(plugin, pid, 'closed');
  }

  /* ---------- Карта ---------- */
  var COLOR = /^#[0-9a-fA-F]{3,8}$/;
  var num = function (v, a, b, d) { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  function cleanStyle(s) {
    s = s && typeof s === 'object' ? s : {};
    return { color: COLOR.test(s.color) ? s.color : '#1d6fb8', weight: num(s.weight, 0, 12, 2.5), opacity: num(s.opacity, 0, 1, 1),
      fillColor: COLOR.test(s.fillColor) ? s.fillColor : (COLOR.test(s.color) ? s.color : '#1d6fb8'), fillOpacity: num(s.fillOpacity, 0, 1, 0.15),
      dashArray: typeof s.dashArray === 'string' && /^[\d\s,.]{1,30}$/.test(s.dashArray) ? s.dashArray : null, radius: num(s.radius, 2, 30, 6),
      label: typeof s.label === 'string' ? s.label.slice(0, 60) : '', symbol: typeof s.symbol === 'string' ? s.symbol.slice(0, 40) : '' };
  }
  function symbolHtml(sp) {
    var c = sp.color, f = sp.fill, z = sp.size;
    var shape = sp.shape === 'square' ? '<rect x="3" y="3" width="18" height="18" rx="2"/>' : sp.shape === 'triangle' ? '<path d="M12 3 22 21H2z"/>' :
      sp.shape === 'diamond' ? '<path d="M12 2 22 12 12 22 2 12z"/>' : '<circle cx="12" cy="12" r="9"/>';
    return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="' + f + '" stroke="' + c + '" stroke-width="2.4">' + shape + '</svg>';
  }
  function mapOf() {
    var map = globalThis.MuraMarks && globalThis.MuraMarks.map;
    if (!map || !window.L) throw new Error(tx('Карта әлі дайын емес.', 'Карта ещё не готова.'));
    if (!map.getPane('muraPlugins')) { map.createPane('muraPlugins'); map.getPane('muraPlugins').style.zIndex = 445; }
    return map;
  }
  function countFeatures(g) { return g && g.type === 'FeatureCollection' ? (g.features || []).length : 1; }
  function makeLayer(plugin, geojson, style) {
    if (!geojson || typeof geojson !== 'object') throw new Error(tx('GeoJSON жоқ.', 'Нет GeoJSON.'));
    if (countFeatures(geojson) > 20000) throw new Error(tx('Бір қабатта 20 000-нан артық нысан болмауы керек.', 'В одном слое не более 20 000 объектов.'));
    var st = cleanStyle(style), sym = own(plugin).symbols[st.symbol];
    var L = window.L;
    var lyr = L.geoJSON(geojson, {
      pane: 'muraPlugins', interactive: !!st.label,
      style: function () { return { color: st.color, weight: st.weight, opacity: st.opacity, fillColor: st.fillColor, fillOpacity: st.fillOpacity, dashArray: st.dashArray }; },
      pointToLayer: function (_f, ll) {
        if (sym) return L.marker(ll, { pane: 'muraPlugins', interactive: !!st.label, keyboard: false, icon: L.divIcon({ className: 'mura-pl-sym', html: symbolHtml(sym), iconSize: [sym.size, sym.size], iconAnchor: [sym.size / 2, sym.size / 2] }) });
        return L.circleMarker(ll, { pane: 'muraPlugins', radius: st.radius, color: st.color, weight: st.weight, fillColor: st.fillColor, fillOpacity: Math.max(st.fillOpacity, 0.6) });
      },
      onEachFeature: function (f, l) { if (st.label && f && f.properties && f.properties[st.label] != null) l.bindTooltip(esc(String(f.properties[st.label]).slice(0, 200)), { sticky: true }); },
    });
    return lyr;
  }
  function pick(req, o) {
    var map = mapOf(), own0 = own(req.plugin);
    if (own0.pick) own0.pick.cancel();
    return new Promise(function (resolve) {
      var box = map.getContainer();
      var ov = el('div', 'mura-pl-pick');
      var msg = el('div', 'mura-pl-pickmsg');
      msg.appendChild(el('b', '', tx('Плагин «', 'Плагин «') + (req.name || req.plugin) + '»: '));
      msg.appendChild(el('span', '', (o && o.message ? String(o.message).slice(0, 200) : tx('картадан нүкте таңдаңыз', 'выберите точку на карте')) + tx(' (Esc — бас тарту)', ' (Esc — отмена)')));
      ov.appendChild(msg);
      box.appendChild(ov);
      var finish = function (v) { ov.remove(); document.removeEventListener('keydown', key, true); own0.pick = null; resolve(v); };
      var key = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
      own0.pick = { cancel: function () { finish(null); } };
      ov.addEventListener('click', function (e) {
        if (e.target.closest('.mura-pl-pickmsg')) return;
        var r = box.getBoundingClientRect(), cp = window.L.point(e.clientX - r.left, e.clientY - r.top), ll = map.containerPointToLatLng(cp);
        var best = null, bd = 14;
        var marks = globalThis.__marks && globalThis.__marks.items || [];
        for (var i = 0; i < marks.length; i++) {
          var m = marks[i];
          if (!isFinite(m.lat) || !isFinite(m.lon)) continue;
          var q = map.latLngToContainerPoint([m.lat, m.lon]), d = Math.hypot(q.x - cp.x, q.y - cp.y);
          if (d < bd) { bd = d; best = m.id; }
        }
        finish({ lat: Math.round(ll.lat * 1e8) / 1e8, lon: Math.round(ll.lng * 1e8) / 1e8, markId: best });
      });
      document.addEventListener('keydown', key, true);
    });
  }
  function cleanup(plugin) {
    var o = owned[plugin];
    if (!o) return;
    o.dialogs.slice().forEach(function (d) { d.close(); });
    Object.keys(o.panels).forEach(function (pid) { closePanelRec(plugin, pid, false); });
    Object.keys(o.layers).forEach(function (k) { o.layers[k].remove(); });
    if (o.temp) o.temp.remove();
    if (o.pick) o.pick.cancel();
    delete owned[plugin];
  }
  var OPS = {
    notify: function (req, a) { toast(tx('Плагин «', 'Плагин «') + (req.name || req.plugin) + '»: ' + String(a[0] || '').slice(0, 500), a[1] && a[1].type === 'error'); return true; },
    confirm: function (req, a) { return openDialog(req, { title: a[1] && a[1].title || tx('Растау', 'Подтверждение'), text: String(a[0] || '') }, true); },
    dialog: function (req, a) { return openDialog(req, a[0]); },
    'panel.open': function (req, a) { return openPanel(req, a[0]); },
    'panel.update': function (req, a) { var r = own(req.plugin).panels[String(a[0])]; if (!r) throw new Error(tx('Панель жабылған.', 'Панель закрыта.')); r.spec = a[1] || {}; r.paint(); return true; },
    'panel.close': function (req, a) { closePanelRec(req.plugin, String(a[0]), false); return true; },
    'map.addLayer': function (req, a) {
      var id = String(a[0] || '').slice(0, 60); if (!id) throw new Error('map.addLayer: id');
      var o = own(req.plugin);
      if (!o.layers[id] && Object.keys(o.layers).length >= 20) throw new Error(tx('Плагин 20-дан артық қабат қоса алмайды.', 'Плагин не может добавить больше 20 слоёв.'));
      var lyr = makeLayer(req.plugin, a[1], a[2]);
      if (o.layers[id]) o.layers[id].remove();
      o.layers[id] = lyr.addTo(mapOf());
      return true;
    },
    'map.removeLayer': function (req, a) { var o = own(req.plugin), id = String(a[0] || ''); if (o.layers[id]) { o.layers[id].remove(); delete o.layers[id]; } return true; },
    'map.clearLayers': function (req) { var o = own(req.plugin); Object.keys(o.layers).forEach(function (k) { o.layers[k].remove(); }); o.layers = {}; return true; },
    'map.showTemporary': function (req, a) {
      var o = own(req.plugin), map = mapOf();
      if (o.temp) o.temp.remove();
      o.temp = makeLayer(req.plugin, a[0], Object.assign({ color: '#e8178a', dashArray: '6 4', fillOpacity: 0.08 }, a[1] || {})).addTo(map);
      if (a[2] && a[2].fit) { var b = o.temp.getBounds(); if (b.isValid()) map.fitBounds(b, { maxZoom: 18, padding: [40, 40] }); }
      return true;
    },
    'map.clearTemporary': function (req) { var o = own(req.plugin); if (o.temp) { o.temp.remove(); o.temp = null; } return true; },
    'map.registerSymbol': function (req, a) {
      var name = String(a[0] || '').slice(0, 40), s = a[1] && typeof a[1] === 'object' ? a[1] : {};
      if (!name) throw new Error('map.registerSymbol: name');
      own(req.plugin).symbols[name] = { shape: /^(circle|square|triangle|diamond)$/.test(s.shape) ? s.shape : 'circle', color: COLOR.test(s.color) ? s.color : '#1d6fb8',
        fill: COLOR.test(s.fill) ? s.fill : '#ffffff', size: num(s.size, 8, 40, 18) };
      return true;
    },
    'map.pick': function (req, a) { return pick(req, a[0]); },
  };
  if (P.onUi) P.onUi(function (req) {
    if (!req || typeof req !== 'object') return;
    if (req.op === 'cleanup') { cleanup(req.plugin); return; }
    var fn = OPS[req.op];
    Promise.resolve().then(function () { if (!fn) throw new Error('UI: ' + req.op); return fn(req, Array.isArray(req.args) ? req.args : []); })
      .then(function (v) { P.uiReply(req.rid, true, v === undefined ? null : v); }, function (e) { P.uiReply(req.rid, false, e && e.message || String(e)); });
  });

  /* ======================= «Баптаулар → Плагиндер» ======================= */
  var pane = null, sub = 'installed', data = null, report = null, openItem = {}, busy = false, err = '', cat = [];
  function mount(p) { pane = p; info().then(paint); }
  function unmount() { pane = null; report = null; }
  function paint() {
    if (!pane) return;
    Promise.all([P.list(), P.catalog ? P.catalog() : null]).then(function (a) {
      data = a[0] && a[0].ok ? a[0] : { plugins: [], suspended: false };
      cat = a[1] && a[1].ok ? a[1].items : [];
      draw();
    });
  }
  function draw() {
    if (!pane) return;
    var h = '<div class="mura-pl-sub" role="tablist">' +
      ['installed', 'install', 'dev'].map(function (k) {
        var t = { installed: tx('Орнатылған', 'Установленные'), install: tx('Плагин орнату', 'Установка плагина'), dev: tx('Әзірлеушілерге', 'Разработчикам') }[k];
        return '<button type="button" role="tab" data-sub="' + k + '" aria-selected="' + (sub === k) + '">' + t + (k === 'installed' && data.plugins.length ? ' (' + data.plugins.length + ')' : '') + '</button>';
      }).join('') + '</div>';
    if (err) h += '<p class="mura-err" role="alert">' + esc(err) + '</p>';
    if (sub === 'installed') h += installedHtml();
    else if (sub === 'install') h += installHtml();
    else h += devHtml();
    pane.innerHTML = h;
    bind();
  }
  function statusOf(p) {
    if (!p.ok) return ['bad', tx('Бүлінген', 'Повреждён')];
    if (!p.compat.ok) return ['bad', tx('Үйлесімсіз', 'Несовместим')];
    if (data.safeMode) return ['off', tx('Қауіпсіз режим', 'Безопасный режим')];
    if (data.suspended) return ['off', tx('Тоқтатылған', 'Приостановлен')];
    if (!p.enabled) return ['off', tx('Өшірулі', 'Выключен')];
    if (p.status.failed) return ['bad', tx('Құлады — тоқтатылды', 'Сбой — остановлен')];
    if (p.status.running) return ['on', tx('Жұмыс істеп тұр', 'Работает')];
    return ['on', tx('Қосулы', 'Включён')];
  }
  /** Мәртебе: «Mura GIS әзірлеушісі» — тек бағдарламамен бірге келген ұсынылған плагин (каталог), қалғаны — «Тәуелсіз әзірлеуші». */
  function sourceBadge(src) {
    return src === 'official'
      ? '<span class="mura-pl-src is-official" title="' + tx('Бағдарламамен бірге келген ұсынылған плагин. Ядроға кірмейді: міндетті емес, өшіруге және жоюға болады.', 'Рекомендуемый плагин из комплекта программы. Не входит в ядро: необязателен, можно отключить и удалить.') + '">' + tx('Mura GIS әзірлеушісі', 'Разработчик Mura GIS') + '</span>'
      : '<span class="mura-pl-src" title="' + tx('Файлдан орнатылған үшінші тарап плагині', 'Сторонний плагин, установленный из файла') + '">' + tx('Тәуелсіз әзірлеуші', 'Независимый разработчик') + '</span>';
  }
  function authorHtml(a) {
    if (!a) return '';
    return esc(a.name) + (a.email ? ' &lt;' + esc(a.email) + '&gt;' : '') + (a.url ? ' · <a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.url) + '</a>' : '');
  }
  function permRows(p, list, granted, editable, name) {
    return list.map(function (x) {
      var d = INFO.permissions[x] || {}, na = d.available === false;
      return '<li class="mura-pl-perm is-' + (d.risk || 'low') + '"><label class="mura-cb"><input type="checkbox" name="' + name + '" value="' + esc(x) + '"' +
        (granted.indexOf(x) >= 0 && !na ? ' checked' : '') + (editable && !na ? '' : ' disabled') + '><span><code>' + esc(x) + '</code> — ' + esc(permText(x)) +
        ' <small class="mura-pl-risk">' + (na ? tx('API 1-де жоқ, берілмейді', 'нет в API 1, не выдаётся') : riskText(d.risk)) + '</small>' +
        (p.reasons && p.reasons[x] ? '<br><small>' + tx('Автордың түсіндірмесі: ', 'Пояснение автора: ') + esc(loc(p.reasons[x])) + '</small>' : '') + '</span></label></li>';
    }).join('');
  }
  function installedHtml() {
    var h = '<div class="mura-tb-opts"><label class="mura-cb"><input type="checkbox" id="muraPlSuspend"' + (data.suspended ? ' checked' : '') + '><span>' +
      tx('Барлық плагиндерді уақытша тоқтату (бағдарлама плагинсіз жұмыс істейді; баптаулары сақталады)', 'Временно приостановить все плагины (программа работает без них; настройки сохраняются)') + '</span></label></div>';
    if (data.safeMode) h += '<p class="mura-hint">' + tx('Бағдарлама қауіпсіз режимде іске қосылған (--no-plugins): плагиндер орындалмайды.', 'Программа запущена в безопасном режиме (--no-plugins): плагины не выполняются.') + '</p>';
    if (!data.plugins.length) return h + '<p class="mura-hint">' + tx('Плагин орнатылмаған. Плагиндер міндетті емес: Mura GIS олардың ешқайсысынсыз толық жұмыс істейді. Орнату — «Плагин орнату» бөлімінде.',
      'Плагины не установлены. Плагины не обязательны: Mura GIS полностью работает без них. Установка — в разделе «Установка плагина».') + '</p>' +
      (cat.length ? '<div class="mura-dlg-btns" style="justify-content:flex-start"><button type="button" class="btn btn--ghost btn--sm" data-sub="install">' + tx('Ұсынылған плагиндер (' + cat.length + ')', 'Рекомендуемые плагины (' + cat.length + ')') + '</button></div>' : '');
    h += '<ul class="mura-pl-list">';
    data.plugins.forEach(function (p) {
      var st = statusOf(p), op = openItem[p.id] || '';
      h += '<li class="mura-pl-it" data-id="' + esc(p.id) + '">' +
        '<div class="mura-pl-row">' + (p.icon ? '<img class="mura-pl-ic" src="' + esc(p.icon) + '" alt="">' : '<span class="mura-pl-ic">' + svg(IC.plug, 22) + '</span>') +
          '<div class="mura-pl-main"><b>' + esc(loc(p.name)) + '</b> <span class="mura-pl-ver">' + esc(p.version) + '</span> <span class="mura-pl-st is-' + st[0] + '">' + st[1] + '</span> ' + sourceBadge(p.source) +
            '<div class="mura-pl-auth">' + tx('Әзірлеуші: ', 'Разработчик: ') + authorHtml(p.author) + '</div>' +
            (p.description ? '<div class="mura-pl-desc">' + esc(loc(p.description)) + '</div>' : '') +
            (!p.compat.ok || !p.ok ? '<div class="mura-err">' + esc(!p.ok ? p.errors.join(' ') : (LANG === 'ru' ? p.compat.reason_ru : p.compat.reason)) + '</div>' : '') +
          '</div>' +
          '<label class="mura-cb mura-pl-tog" title="' + tx('Қосу / өшіру', 'Включить / выключить') + '"><input type="checkbox" data-enable' + (p.enabled ? ' checked' : '') + (p.ok ? '' : ' disabled') + '><span>' + tx('Қосулы', 'Вкл.') + '</span></label>' +
        '</div>' +
        '<div class="mura-pl-acts">' +
          (p.settingsSchema.length ? '<button type="button" class="lnk" data-open="settings">' + tx('Баптаулар', 'Настройки') + '</button>' : '') +
          '<button type="button" class="lnk" data-open="perms">' + tx('Рұқсаттар', 'Разрешения') + ' (' + p.granted.length + '/' + p.permissions.length + ')</button>' +
          '<button type="button" class="lnk" data-open="about">' + tx('Мәліметтер', 'Сведения') + '</button>' +
          '<button type="button" class="lnk" data-open="log">' + tx('Журнал', 'Журнал') + (p.status.log.some(function (l) { return l.level === 'error'; }) ? ' ⚠' : '') + '</button>' +
          (p.status.running ? '<button type="button" class="lnk" data-stop>' + tx('Процесін тоқтату', 'Остановить процесс') + '</button>' : '') +
          '<button type="button" class="lnk lnk--danger" data-open="remove">' + tx('Жою', 'Удалить') + '</button>' +
        '</div>' + (op ? '<div class="mura-pl-more">' + moreHtml(p, op) + '</div>' : '') + '</li>';
    });
    return h + '</ul>';
  }
  function moreHtml(p, op) {
    if (op === 'settings') {
      return '<form data-form="settings"><div class="mura-pl-sf"></div><div class="mura-dlg-btns"><button type="submit" class="btn btn--primary btn--sm">' + tx('Баптауларды сақтау', 'Сохранить настройки') + '</button></div></form>';
    }
    if (op === 'perms') {
      return '<p class="mura-hint">' + tx('Плагин тек сіз берген рұқсаттарды пайдалана алады; қалғандары техникалық деңгейде бұғатталады. Өзгеріс бірден қолданылады (плагин процесі қайта іске қосылады).',
        'Плагин может использовать только выданные вами разрешения; остальные заблокированы технически. Изменение применяется сразу (процесс плагина перезапускается).') + '</p>' +
        (p.permissions.length ? '<ul class="mura-pl-perms">' + permRows(p, p.permissions, p.granted, true, 'grant') + '</ul>' : '<p class="mura-hint">' + tx('Плагин ешқандай рұқсат сұрамайды.', 'Плагин не запрашивает разрешений.') + '</p>');
    }
    if (op === 'about') {
      var pts = Object.keys(p.contributes || {}).map(function (k) { return (INFO.points[k] ? (LANG === 'ru' ? INFO.points[k].ru : INFO.points[k].kk) : k) + ': ' + p.contributes[k].map(function (c) { return loc(c.title); }).join(', '); });
      return '<dl class="mura-pl-dl">' +
        '<dt>ID</dt><dd><code>' + esc(p.id) + '</code></dd>' +
        '<dt>Plugin API</dt><dd>' + esc(p.apiVersion) + ' · Mura GIS ≥ ' + esc(p.minAppVersion) + ' · ' + esc(p.platforms.join(', ')) + '</dd>' +
        (p.license ? '<dt>' + tx('Лицензия', 'Лицензия') + '</dt><dd>' + esc(p.license) + '</dd>' : '') +
        (p.homepage ? '<dt>' + tx('Сілтеме', 'Ссылка') + '</dt><dd><a href="' + esc(p.homepage) + '" target="_blank" rel="noopener">' + esc(p.homepage) + '</a></dd>' : '') +
        '<dt>' + tx('Интерфейстегі орны', 'Место в интерфейсе') + '</dt><dd>' + (pts.length ? esc(pts.join('; ')) : '—') + '</dd>' +
        '<dt>' + tx('Орнатылды', 'Установлен') + '</dt><dd>' + esc(fmt(p.installed_at)) + (p.updated_at && p.updated_at !== p.installed_at ? ' · ' + tx('жаңартылды ', 'обновлён ') + esc(fmt(p.updated_at)) : '') + '</dd>' +
        '<dt>SHA-256</dt><dd><code class="mura-pl-sha">' + esc(p.sha256) + '</code></dd></dl>';
    }
    if (op === 'log') {
      var l = p.status.log;
      return l.length ? '<pre class="mura-pl-code mura-pl-log">' + esc(l.map(function (x) { return fmt(x.at) + ' [' + x.level + '] ' + x.text; }).join('\n')) + '</pre>'
        : '<p class="mura-hint">' + tx('Бұл сеанста жазба жоқ.', 'В этом сеансе записей нет.') + '</p>';
    }
    if (op === 'remove') {
      return '<p>' + tx('Плагин файлдары жойылады. Жобаның деректері (ескерткіштер, аймақтар, маршруттар) өзгермейді.', 'Файлы плагина будут удалены. Данные проекта (памятники, зоны, маршруты) не изменятся.') + '</p>' +
        '<label class="mura-cb"><input type="checkbox" data-rmdata><span>' + tx('Плагиннің жеке деректерін де жою (оның баптаулары мен сақтағандары)', 'Удалить и собственные данные плагина (его настройки и сохранённое)') + '</span></label>' +
        '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-open="">' + tx('Бас тарту', 'Отмена') + '</button><button type="button" class="btn btn--primary btn--sm" data-remove>' + tx('Жою', 'Удалить') + '</button></div>';
    }
    return '';
  }
  function catalogHtml() {
    if (!cat.length) return '';
    return '<h4 class="mura-set-h">' + tx('Ұсынылған плагиндер', 'Рекомендуемые плагины') + '</h4>' +
      '<p class="mura-hint">' + tx('Mura GIS әзірлеушісі жасаған үлгі плагиндер. Бағдарламамен бірге келеді (интернет керек емес), бірақ ядроға кірмейді: орнату міндетті емес, кез келген уақытта өшіруге не жоюға болады.',
        'Плагины-образцы от разработчика Mura GIS. Поставляются вместе с программой (интернет не нужен), но не входят в ядро: установка необязательна, их можно в любой момент отключить или удалить.') + '</p>' +
      '<ul class="mura-pl-list">' + cat.map(function (c) {
        var inst = c.installed, btn;
        if (!c.compat.ok) btn = '<span class="mura-pl-st is-bad">' + tx('Үйлесімсіз', 'Несовместим') + '</span>';
        else if (inst && inst.source === 'official' && inst.cmp <= 0) btn = '<span class="mura-pl-st is-on">' + tx('Орнатылған', 'Установлен') + '</span>';
        else btn = '<button type="button" class="btn btn--primary btn--sm" data-cat="' + esc(c.id) + '"' + (busy ? ' disabled' : '') + '>' +
          (inst ? (inst.cmp > 0 ? tx('Жаңарту', 'Обновить') + ' (' + esc(inst.version) + ' → ' + esc(c.version) + ')' : tx('Ресми нұсқаны орнату', 'Установить официальную версию')) : tx('Орнату', 'Установить')) + '</button>';
        return '<li class="mura-pl-it mura-pl-cat"><div class="mura-pl-row">' + (c.icon ? '<img class="mura-pl-ic" src="' + esc(c.icon) + '" alt="">' : '<span class="mura-pl-ic">' + svg(IC.plug, 22) + '</span>') +
          '<div class="mura-pl-main"><b>' + esc(loc(c.name)) + '</b> <span class="mura-pl-ver">' + esc(c.version) + '</span> ' + sourceBadge('official') + ' <span class="mura-pl-tag">' + tx('үлгі', 'образец') + '</span>' +
          (c.description ? '<div class="mura-pl-desc">' + esc(loc(c.description)) + '</div>' : '') +
          '<div class="mura-pl-auth">' + tx('Рұқсаттар: ', 'Разрешения: ') + esc(c.permissions.join(', ') || tx('жоқ', 'нет')) + (c.license ? ' · ' + esc(c.license) : '') + '</div></div>' +
          '<div class="mura-pl-catb">' + btn + '</div></div></li>';
      }).join('') + '</ul>';
  }
  function installHtml() {
    var h = catalogHtml() + '<h4 class="mura-set-h">' + tx('Файлдан орнату', 'Установка из файла') + '</h4>' +
      '<p class="mura-hint">' + tx('Плагин — үшінші тарап әзірлеушісі жасаған .muraplug файлы. Орнату алдында архивтің құрылымы, тұтастығы (CRC-32, SHA-256), манифесі және бағдарлама нұсқасымен үйлесімділігі тексеріледі. Орнату кезінде ешқандай код не жүйелік команда орындалмайды.',
      'Плагин — файл .muraplug от стороннего разработчика. Перед установкой проверяются структура и целостность архива (CRC-32, SHA-256), манифест и совместимость с версией программы. При установке не выполняется никакой код или системные команды.') + '</p>' +
      '<div class="mura-dlg-btns" style="justify-content:flex-start"><button type="button" class="btn btn--primary btn--sm" data-pick' + (busy ? ' disabled' : '') + '>' + tx('Құрылғыдан файл таңдау…', 'Выбрать файл на устройстве…') + '</button></div>';
    if (!report) return h;
    var r = report, m = r.manifest;
    h += '<section class="mura-pl-rep"><h4 class="mura-set-h">' + tx('Тексеру нәтижесі', 'Результат проверки') + ': ' + esc(r.fileName) + '</h4>';
    h += '<dl class="mura-pl-dl"><dt>' + tx('Өлшемі', 'Размер') + '</dt><dd>' + Math.ceil(r.size / 1024) + ' КБ · ' + r.count + tx(' файл', ' файл.') + '</dd><dt>SHA-256</dt><dd><code class="mura-pl-sha">' + esc(r.sha256) + '</code></dd></dl>';
    if (r.errors.length) h += '<div class="mura-err">' + tx('Орнатуға болмайды:', 'Установка невозможна:') + '<ul>' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    if (r.warnings.length) h += '<div class="mura-pl-warn"><ul>' + r.warnings.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    if (!m) return h + '</section>';
    h += '<div class="mura-pl-row">' + (r.icon ? '<img class="mura-pl-ic" src="' + esc(r.icon) + '" alt="">' : '<span class="mura-pl-ic">' + svg(IC.plug, 22) + '</span>') +
      '<div class="mura-pl-main"><b>' + esc(loc(m.name)) + '</b> <span class="mura-pl-ver">' + esc(m.version) + '</span> ' + sourceBadge(r.source) +
      '<div class="mura-pl-auth">' + tx('Әзірлеуші: ', 'Разработчик: ') + authorHtml(m.author) + '</div>' +
      (m.description ? '<div class="mura-pl-desc">' + esc(loc(m.description)) + '</div>' : '') +
      '<div class="mura-pl-auth"><code>' + esc(m.id) + '</code> · Plugin API ' + esc(m.apiVersion) + ' · Mura GIS ≥ ' + esc(m.minAppVersion) + ' · ' + esc(m.platforms.join(', ')) + (m.license ? ' · ' + esc(m.license) : '') + '</div></div></div>';
    if (r.existing) h += '<p class="mura-pl-warn">' + (r.existing.cmp > 0 ? tx('Жаңарту: ', 'Обновление: ') : r.existing.cmp < 0 ? tx('Ескі нұсқаға қайту: ', 'Откат к старой версии: ') : tx('Қайта орнату: ', 'Переустановка: ')) +
      esc(r.existing.version) + ' → ' + esc(m.version) + '. ' + tx('Баптаулары мен жеке деректері сақталады.', 'Настройки и собственные данные сохранятся.') + '</p>';
    if (!r.compat.ok) return h + '<div class="mura-err">' + esc(LANG === 'ru' ? r.compat.reason_ru : r.compat.reason) + '</div></section>';
    var hi = m.permissions.filter(function (x) { return INFO.permissions[x] && INFO.permissions[x].risk === 'high' && INFO.permissions[x].available; });
    h += '<h4 class="mura-set-h">' + tx('Сұратылған рұқсаттар', 'Запрашиваемые разрешения') + '</h4>' +
      (m.permissions.length ? '<ul class="mura-pl-perms">' + permRows(r, m.permissions, r.existing ? m.permissions.filter(function (x) { return r.existing.granted.indexOf(x) >= 0 || hi.indexOf(x) < 0; }) : m.permissions.filter(function (x) { return hi.indexOf(x) < 0; }), true, 'igrant') + '</ul>'
        : '<p class="mura-hint">' + tx('Плагин ешқандай рұқсат сұрамайды.', 'Плагин не запрашивает разрешений.') + '</p>') +
      (hi.length ? '<p class="mura-pl-warn">' + svg(IC.warn, 14) + ' ' + tx('Жоғары тәуекелді рұқсат (' + hi.join(', ') + ') әдепкі бойынша берілмейді — қажет болса, белгіні өзіңіз қойыңыз. Ол плагинге деректерді интернетке жіберуге мүмкіндік береді.',
        'Разрешение с высоким риском (' + hi.join(', ') + ') по умолчанию не выдаётся — при необходимости отметьте его сами. Оно позволяет плагину передавать данные в интернет.') + '</p>' : '');
    h += '<div class="mura-pl-disc"><p><b>' + tx('Ескерту', 'Предупреждение') + '.</b> ' + (r.source === 'official'
      ? tx('Бұл — Mura GIS әзірлеушісі жасаған ұсынылған үлгі плагин. Ол бағдарламаның ядросына кірмейді: орнату міндетті емес, кәдімгі плагин сияқты оқшауланған ортада жұмыс істейді. Нәтижесін (мыс. сыртқы жүйенің талаптарына сәйкестігін) пайдаланушы тексереді. Орнату арқылы сіз оның сұратқан рұқсаттарымен танысқаныңызды растайсыз.',
        'Это рекомендуемый плагин-образец от разработчика Mura GIS. Он не входит в ядро программы: установка необязательна, он работает в изолированной среде как обычный плагин. Результат (например, соответствие требованиям внешней системы) проверяет пользователь. Устанавливая его, вы подтверждаете, что ознакомились с запрашиваемыми разрешениями.')
      : tx('Бұл плагинді тәуелсіз әзірлеуші жасаған. Оның функционалдығы мен есептеулерінің дұрыстығына плагин авторы жауап береді. Орнату арқылы сіз оның сұратқан рұқсаттарымен және ықтимал тәуекелдерімен танысқаныңызды растайсыз.',
        'Этот плагин создан независимым разработчиком. За его функциональность и правильность расчётов отвечает автор плагина. Устанавливая его, вы подтверждаете, что ознакомились с запрашиваемыми разрешениями и возможными рисками.')) + '</p>' +
      '<p>' + tx('Әзірлеуші: ', 'Разработчик: ') + authorHtml(m.author) + '. ' + tx('Сұратылған рұқсаттар: ', 'Запрашиваемые разрешения: ') + esc(m.permissions.length ? m.permissions.join(', ') : tx('жоқ', 'нет')) + '.</p>' +
      '<p class="mura-hint">' + tx('Mura GIS сыртқы плагиндердің дұрыстығына, есептеулеріне, құқықтық сәйкестігіне автоматты түрде кепілдік бермейді. Жауапкершіліктің нақты шегі қолданыстағы заңнамаға және пайдаланушы келісіміне сәйкес белгіленеді.',
        'Mura GIS автоматически не гарантирует правильность, расчёты и правовое соответствие сторонних плагинов. Точные границы ответственности определяются действующим законодательством и пользовательским соглашением.') + '</p>' +
      '<label class="mura-cb"><input type="checkbox" id="muraPlAgree"><span>' + tx('Таныстым, орнатуға келісемін', 'Ознакомлен(а), согласен(на) установить') + '</span></label></div>' +
      '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-cancel>' + tx('Бас тарту', 'Отмена') + '</button><button type="button" class="btn btn--primary btn--sm" data-install disabled>' + tx('Орнату', 'Установить') + '</button></div>';
    return h + '</section>';
  }
  function devHtml() {
    var I = INFO || {}, perms = I.permissions || {}, pts = I.points || {};
    var example = JSON.stringify({ id: 'kz.example.my-plugin', name: { kk: 'Менің плагинім', ru: 'Мой плагин' }, version: '1.0.0', apiVersion: I.apiVersion || '1', minAppVersion: I.appVersion || '2.2.0',
      author: { name: 'Independent Developer', url: 'https://github.com/example' }, description: 'GeoJSON export adapter', license: 'MIT', entry: 'main.js', icon: 'assets/icon.svg', platforms: ['desktop'],
      permissions: ['geometry.read', 'attributes.read', 'files.export'],
      contributes: { 'zone.export': [{ command: 'export', title: { kk: 'Менің форматым', ru: 'Мой формат' } }] },
      settings: [{ key: 'crs', type: 'select', title: 'CRS', options: ['EPSG:4326', 'EPSG:32642'], default: 'EPSG:4326' }] }, null, 2);
    return '<p class="mura-hint">' + tx('Плагинді кез келген адам Mura GIS бастапқы кодынсыз жаза алады: SDK-да API сипаттамасы, TypeScript типтері, шаблон, үлгі плагиндер, манифест валидаторы, архив жинақтаушы және жергілікті тестілеу құралы бар. Плагинді өз GitHub репозиторийіңізде, өз лицензияңызбен жариялай аласыз.',
      'Плагин может написать любой без исходного кода Mura GIS: в SDK — описание API, типы TypeScript, шаблон, примеры, валидатор манифеста, сборщик архива и средство локального тестирования. Плагин можно публиковать в своём репозитории GitHub под своей лицензией.') + '</p>' +
      '<div class="mura-dlg-btns" style="justify-content:flex-start;flex-wrap:wrap"><button type="button" class="btn btn--primary btn--sm" data-sdk>' + tx('Plugin SDK-ны қалтаға сақтау…', 'Сохранить Plugin SDK в папку…') + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-check>' + tx('Архивті тексеру (орнатпай)…', 'Проверить архив (без установки)…') + '</button>' +
        '<a class="btn btn--ghost btn--sm" href="https://github.com/BERIKKKK/mura-gis/tree/main/plugin-sdk" target="_blank" rel="noopener">' + tx('Құжаттама (GitHub)', 'Документация (GitHub)') + '</a></div>' +
      '<h4 class="mura-set-h">' + tx('Нұсқалар', 'Версии') + '</h4>' +
      '<p class="mura-hint">Plugin API: <b>' + esc(I.apiVersion) + '</b> (' + tx('қолдау көрсетілетіні: ', 'поддерживаются: ') + esc((I.supported || []).join(', ')) + ') · Mura GIS ' + esc(I.appVersion) + ' · ' + tx('платформа: ', 'платформа: ') + esc(I.platform) + '. ' +
        tx('API нұсқасының ішінде тек қосымша (міндетті емес) өзгерістер болады; үйлесімділікті бұзатын өзгеріс — жаңа apiVersion. minAppVersion / maxAppVersion сәйкес келмесе, плагин орнатылмайды не іске қосылмайды, себебі көрсетіледі. Бағдарлама жаңартылғанда әр плагиннің үйлесімділігі қайта тексеріледі.',
          'Внутри версии API — только дополнительные (необязательные) изменения; несовместимое изменение — новая apiVersion. Если minAppVersion / maxAppVersion не подходят, плагин не устанавливается или не запускается, причина показывается. После обновления программы совместимость каждого плагина проверяется заново.') + '</p>' +
      '<h4 class="mura-set-h">' + tx('Архив және манифест құрылымы', 'Структура архива и манифеста') + '</h4>' +
      '<pre class="mura-pl-code">my-plugin.muraplug  (ZIP)\n├── manifest.json      ' + tx('міндетті', 'обязательно') + '\n├── main.js            entry\n├── permissions.json   ' + tx('рұқсаттардың түсіндірмесі', 'пояснения к разрешениям') + '\n├── assets/icon.svg\n├── locales/kk.json, ru.json\n└── README.md</pre>' +
      '<pre class="mura-pl-code">' + esc(example) + '</pre>' +
      '<h4 class="mura-set-h">' + tx('Рұқсаттар', 'Разрешения') + '</h4><table class="tbl mura-pl-tbl"><tbody>' +
        Object.keys(perms).map(function (k) { return '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(LANG === 'ru' ? perms[k].ru : perms[k].kk) + '</td><td>' + (perms[k].available ? riskText(perms[k].risk) : tx('API 1-де жоқ', 'нет в API 1')) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h4 class="mura-set-h">' + tx('Кеңейту нүктелері (contributes)', 'Точки расширения (contributes)') + '</h4><table class="tbl mura-pl-tbl"><tbody>' +
        Object.keys(pts).map(function (k) { return '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(LANG === 'ru' ? pts[k].ru : pts[k].kk) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="mura-hint">' + tx('Плагин бағдарламаның басты навигациясын, атауларын не негізгі құралдарын өзгерте алмайды — тек осы нүктелерге өз әрекетін қосады. Деректер қабаттары: ', 'Плагин не может менять основную навигацию, названия или основные инструменты программы — только добавлять свои действия в эти точки. Слои данных: ') + esc((I.layers || []).join(', ')) + '.</p>';
  }
  function bind() {
    pane.onclick = function (e) {
      var t = e.target;
      var s = t.closest('[data-sub]');
      if (s) { sub = s.dataset.sub; err = ''; draw(); return; }
      var li = t.closest('.mura-pl-it'), id = li && li.dataset.id;
      if (t.closest('[data-open]') && id) { var v = t.closest('[data-open]').dataset.open; openItem[id] = openItem[id] === v ? '' : v; draw(); if (openItem[id] === 'settings') fillSettings(id); return; }
      if (t.closest('[data-stop]') && id) { P.stop(id).then(paint); return; }
      if (t.closest('[data-remove]') && id) {
        var rm = li.querySelector('[data-rmdata]');
        P.uninstall(id, { data: !!(rm && rm.checked) }).then(function (r) { if (!r.ok) { err = r.error; } else { delete openItem[id]; toast(tx('Плагин жойылды. Жоба деректері өзгерген жоқ.', 'Плагин удалён. Данные проекта не изменились.')); } paint(); });
        return;
      }
      if (t.closest('[data-pick]')) { pickFile(false); return; }
      if (t.closest('[data-cat]')) { pickCatalog(t.closest('[data-cat]').dataset.cat); return; }
      if (t.closest('[data-check]')) { sub = 'install'; pickFile(true); return; }
      if (t.closest('[data-cancel]')) { report = null; draw(); return; }
      if (t.closest('[data-install]')) { doInstall(); return; }
      if (t.closest('[data-sdk]')) { P.sdk().then(function (r) { if (r.ok && !r.canceled) toast(tx('SDK сақталды: ', 'SDK сохранён: ') + r.path); else if (!r.ok) toast(r.error, true); }); }
    };
    pane.onchange = function (e) {
      var t = e.target, li = t.closest('.mura-pl-it'), id = li && li.dataset.id;
      if (t.id === 'muraPlSuspend') { P.suspend(t.checked).then(paint); return; }
      if (t.id === 'muraPlAgree') { var b = pane.querySelector('[data-install]'); if (b) b.disabled = !t.checked; return; }
      if (t.hasAttribute('data-enable') && id) { P.enable(id, t.checked).then(function (r) { if (!r.ok) err = r.error; paint(); }); return; }
      if (t.name === 'grant' && id) {
        var g = [].map.call(li.querySelectorAll('input[name=grant]:checked'), function (x) { return x.value; });
        P.grants(id, g).then(function (r) { if (!r.ok) err = r.error; paint(); });
      }
    };
    pane.onsubmit = function (e) {
      var f = e.target.closest('[data-form="settings"]');
      if (!f) return;
      e.preventDefault();
      var id = f.closest('.mura-pl-it').dataset.id;
      P.settings(id, readValues(f.querySelector('.mura-pl-sf'))).then(function (r) { if (r.ok) toast(tx('Плагин баптаулары сақталды.', 'Настройки плагина сохранены.')); else toast(r.error, true); });
    };
  }
  function fillSettings(id) {
    var p = data.plugins.filter(function (x) { return x.id === id; })[0], box = pane && pane.querySelector('.mura-pl-it[data-id="' + id + '"] .mura-pl-sf');
    if (!p || !box) return;
    renderBody(box, p.settingsSchema.map(function (s) {
      return { type: 'field', key: s.key, kind: s.type === 'string' ? 'string' : s.type, label: loc(s.title), description: loc(s.description), options: s.options, rows: 8 };
    }), p.settings);
  }
  function pickCatalog(id) {
    busy = true; err = ''; draw();
    P.inspectCatalog(id).then(function (r) {
      busy = false;
      if (!r.ok) { err = r.error; report = null; } else report = r.report;
      sub = 'install'; draw();
      var rep0 = pane && pane.querySelector('.mura-pl-rep');
      if (rep0 && rep0.scrollIntoView) rep0.scrollIntoView({ block: 'start' });
    });
  }
  function pickFile(checkOnly) {
    busy = true; err = ''; draw();
    P.inspect('').then(function (r) {
      busy = false;
      if (!r.ok) { err = r.error; report = null; }
      else if (!r.canceled) { report = r.report; if (checkOnly && report) report.checkOnly = true; }
      sub = 'install'; draw();
    });
  }
  function doInstall() {
    if (!report || !report.token) return;
    var g = [].map.call(pane.querySelectorAll('input[name=igrant]:checked'), function (x) { return x.value; });
    busy = true;
    P.install(report.token, g).then(function (r) {
      busy = false;
      if (!r.ok) { err = r.error; draw(); return; }
      report = null; sub = 'installed'; openItem[r.plugin.id] = '';
      toast(tx('Плагин орнатылды: ', 'Плагин установлен: ') + loc(r.plugin.name));
      paint();
    });
  }

  window.MuraPluginsUI = { mount: mount, unmount: unmount, refresh: loadContrib, _ops: OPS, get contributions() { return contrib; } };
})();
