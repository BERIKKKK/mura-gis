/* Mura GIS: жобалар және баптаулар.
   • Бастапқы терезе — бағдарлама ашылғанда (жоба әлі ашылмаған): «Жаңа жоба» (атауы, облыс, аудан), соңғы жобалар,
     «Басқа жобаны ашу…» (файл таңдау терезесі). Жоба — бір GeoPackage (.gpkg) файлы (main/gpkg.js).
   • «Баптаулар» терезесі (Файл → Баптаулар, Ctrl+,; жолақтағы тісті доңғалақ):
       Жоба — атауы, облысы, ауданы (облыс таңдалса, жаңа жазбалардағы «Облыс» өрісі соған бекітіледі, тек оның аудандары
       таңдалады; аудан таңдалса — аудан да автоматты қойылады: js/regions.js);
       Құралдар панелі — батырмаларды көрсету/жасыру, ретін өзгерту, тек иконкалар (күйі осы компьютерде сақталады).
   Бұл кәдімгі скрипт regions.js пен services.js-тен КЕЙІН, qorgau/ui.js-тен БҰРЫН орындалады: құралдар жолағы
   services.js-те екі қатарға бөлінген, ал ui.js батырмаларды енді ғана санайды. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var M = window.mura || {};
  var info = M.project || { current: null, recent: [], legacy: null };
  var cur = info.current;
  var REG = window.MuraRegions;
  var app = $('qaApp'), bar = $('qaToolbar'), tmain = $('qaTmain');
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var svg = function (p, s) { return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14.5l2 2 4-4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  };
  var fmtDate = function (iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  var where = function (o) { return [o.oblast || 'Бүкіл Қазақстан', o.district].filter(Boolean).join(' · '); };

  /* ======================= Облыс / аудан тізімдері (жоба баптаулары үшін — шектеусіз) ======================= */
  function oblastOptions(sel) {
    var o = '<option value="">— Бүкіл Қазақстан (облыс таңдалмайды) —</option>', a = '<optgroup label="Облыстар">', c = '<optgroup label="Республикалық маңызы бар қалалар">';
    (REG ? REG.list : []).forEach(function (r) {
      var h = '<option' + (r.name === sel ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      if (r.city) c += h; else a += h;
    });
    return o + a + '</optgroup>' + c + '</optgroup>';
  }
  function districtOptions(oblast, sel) {
    var r = REG && REG.find(oblast);
    if (!r) return '<option value="">— облысты алдымен таңдаңыз —</option>';
    return '<option value="">— Барлық аудандар (аудан таңдалмайды) —</option>' + r.units.map(function (u) {
      return '<option value="' + esc(u.v) + '"' + (u.v === sel ? ' selected' : '') + '>' + esc(u.v + (u.note ? ' (' + u.note + ')' : '')) + '</option>';
    }).join('');
  }
  /** Жоба формасының ортақ өрістері: атауы, облыс, аудан. */
  function metaFields(pfx, v) {
    return '<label>Жоба атауы<input type="text" name="name" maxlength="120" required value="' + esc(v.name) + '" placeholder="Мысалы: Қарғалы ауданының ескерткіштері 2026" autocomplete="off"></label>' +
      '<label>Облыс / республикалық маңызы бар қала<select name="oblast" id="' + pfx + 'Oblast">' + oblastOptions(v.oblast) + '</select></label>' +
      '<label>Аудан / қала<select name="district" id="' + pfx + 'District">' + districtOptions(v.oblast, v.district) + '</select></label>' +
      '<p class="mura-hint">Облыс таңдалса, жобадағы жаңа ескерткіштер мен қорғау аймақтарында облыс өзі қойылады, тек оның аудандары таңдалады. ' +
      'Аудан да таңдалса — ол да автоматты толады. Кейін «Баптаулар → Жоба» арқылы өзгертуге болады.</p>';
  }
  function bindMeta(form) {
    var ob = form.elements.oblast, di = form.elements.district;
    ob.addEventListener('change', function () { di.innerHTML = districtOptions(ob.value, ''); di.disabled = !ob.value; });
    di.disabled = !ob.value;
  }
  var readMeta = function (form) { return { name: form.elements.name.value.trim(), oblast: form.elements.oblast.value, district: form.elements.district.value }; };

  /* ======================= Бастапқы терезе ======================= */
  var start = null;
  function openStart(focusNew) {
    closeSettings();
    if (start) { if (focusNew) start.querySelector('[name="name"]').focus(); return; }
    var legacy = info.legacy;
    var recent = (info.recent || []).filter(function (r) { return !cur || r.path !== cur.path; });
    var legacyTxt = legacy ? [legacy.marks ? legacy.marks + ' ескерткіш' : '', legacy.zones ? legacy.zones + ' қорғау аймағы' : '',
      legacy.routes ? legacy.routes + ' маршрут' : '', legacy.imports ? legacy.imports + ' импортталған нүкте' : ''].filter(Boolean).join(', ') : '';
    var firstRun = !(info.recent || []).length;

    start = document.createElement('div');
    start.className = 'mura-start';
    start.id = 'muraStart';
    start.setAttribute('role', 'dialog'); start.setAttribute('aria-modal', 'true'); start.setAttribute('aria-labelledby', 'muraStartT');
    start.innerHTML =
      '<div class="mura-start-card">' +
        '<header class="mura-start-head">' +
          '<img src="img/icon.svg" alt="" width="44" height="44">' +
          '<div><h1 id="muraStartT">Mura GIS</h1><p>Тарихи-мәдени мұра объектілеріне арналған ГАЖ' + (M.version ? ' · нұсқа ' + esc(M.version) : '') + '</p></div>' +
          (cur ? '<button type="button" class="mura-start-x" id="muraStartX" aria-label="Жабу" title="Жабу (Esc)">' + svg(IC.close) + '</button>' : '') +
        '</header>' +
        '<div class="mura-start-body">' +
          '<form class="mura-start-new mura-dlg-in" id="muraNewForm" novalidate>' +
            '<h2>' + svg(IC.plus) + 'Жаңа жоба</h2>' +
            metaFields('muraNew', { name: '', oblast: '', district: '' }) +
            (legacy ? '<label class="mura-cb"><input type="checkbox" name="legacy"' + (firstRun ? ' checked' : '') + '><span>Бұрынғы нұсқадағы деректерді жобаға көшіру <small>(' + esc(legacyTxt) + ')</small></span></label>' : '') +
            '<p class="mura-err" id="muraNewErr" role="alert" hidden></p>' +
            '<div class="mura-dlg-btns"><button type="submit" class="btn btn--primary btn--sm">Жоба құру…</button></div>' +
            '<p class="mura-hint mura-start-note">Жоба бір <b>GeoPackage (.gpkg)</b> файлында сақталады: ескерткіштер, қорғау аймақтары, маршруттар — бөлек қабаттар. ' +
              'Файлды QGIS-те де ашуға, басқа компьютерге көшіруге болады. «Жоба құру» басылғанда файлдың орнын таңдайсыз.</p>' +
          '</form>' +
          '<section class="mura-start-recent" aria-labelledby="muraRecentT">' +
            '<h2 id="muraRecentT">' + svg(IC.file) + 'Соңғы жобалар</h2>' +
            (cur ? '<div class="mura-rc is-current"><div class="mura-rc-main"><b>' + esc(cur.name) + '</b><span>' + esc(where(cur)) + '</span><small><bdi dir="ltr">' + esc(cur.path) + '</bdi></small></div><span class="mura-rc-tag">ашық</span></div>' : '') +
            '<ul class="mura-rcl" id="muraRecent">' + recentHtml(recent) + '</ul>' +
            (!recent.length && !cur ? '<p class="mura-hint mura-rc-empty">Әзірге жоба жоқ. Сол жақта жаңа жоба құрыңыз не бар .gpkg файлын ашыңыз.</p>' : '') +
            '<p class="mura-err" id="muraOpenErr" role="alert" hidden></p>' +
            '<div class="mura-dlg-btns mura-start-open"><button type="button" class="btn btn--ghost btn--sm" id="muraOpenBtn">' + svg(IC.folder, 16) + 'Басқа жобаны ашу…</button></div>' +
          '</section>' +
        '</div>' +
      '</div>';
    document.body.appendChild(start);
    document.documentElement.classList.add('mura-starting');

    var form = $('muraNewForm');
    bindMeta(form);
    var err = function (id, t) { var e = $(id); e.textContent = t || ''; e.hidden = !t; };
    var busy = function (on) { [].forEach.call(start.querySelectorAll('button, input, select'), function (b) { if (on) { b.dataset.wasDis = b.disabled ? '1' : ''; b.disabled = true; } else { b.disabled = b.dataset.wasDis === '1'; } }); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var m = readMeta(form);
      if (!m.name) { err('muraNewErr', 'Жоба атауын енгізіңіз.'); form.elements.name.focus(); return; }
      err('muraNewErr', '');
      if (!M.projectNew) { err('muraNewErr', 'Жоба тек Mura GIS бағдарламасында құрылады.'); return; }
      busy(true);
      M.projectNew(m, { importLegacy: !!(form.elements.legacy && form.elements.legacy.checked) }).then(function (r) {
        busy(false);
        if (!r.ok) err('muraNewErr', r.error);                        // сәтті болса — бет өзі қайта жүктеледі
      }, function (e2) { busy(false); err('muraNewErr', e2.message || String(e2)); });
    });
    function openFile(p) {
      err('muraOpenErr', '');
      if (!M.projectOpen) return;
      busy(true);
      M.projectOpen(p).then(function (r) {
        busy(false);
        if (!r.ok) err('muraOpenErr', r.error);
        else if (r.same) closeStart();
      }, function (e2) { busy(false); err('muraOpenErr', e2.message || String(e2)); });
    }
    $('muraOpenBtn').addEventListener('click', function () { openFile(''); });
    $('muraRecent').addEventListener('click', function (e) {
      var x = e.target.closest('[data-forget]');
      if (x) {
        M.projectForget(x.dataset.forget).then(function (r) {
          if (r.ok) { info.recent = r.recent; $('muraRecent').innerHTML = recentHtml(r.recent.filter(function (q) { return !cur || q.path !== cur.path; })); }
        });
        return;
      }
      var b = e.target.closest('[data-open]');
      if (b) openFile(b.dataset.open);
    });
    var x = $('muraStartX');
    if (x) x.addEventListener('click', closeStart);
    setTimeout(function () { (firstRun || focusNew ? form.elements.name : start.querySelector('[data-open]') || form.elements.name).focus(); }, 30);
  }
  function recentHtml(list) {
    return list.map(function (r) {
      var title = esc(r.name || r.path.split(/[\\/]/).pop());
      return '<li class="mura-rc' + (r.exists ? '' : ' is-missing') + '">' +
        (r.exists
          ? '<button type="button" class="mura-rc-main" data-open="' + esc(r.path) + '" title="Ашу: ' + esc(r.path) + '"><b>' + title + '</b><span>' + esc(where(r)) + (r.opened_at ? ' · ' + esc(fmtDate(r.opened_at)) : '') + '</span><small><bdi dir="ltr">' + esc(r.path) + '</bdi></small></button>'
          : '<div class="mura-rc-main"><b>' + title + '</b><span>Файл табылмады (жылжытылған не өшірілген)</span><small><bdi dir="ltr">' + esc(r.path) + '</bdi></small></div>') +
        '<button type="button" class="mura-rc-x" data-forget="' + esc(r.path) + '" aria-label="Тізімнен алып тастау" title="Тізімнен алып тастау (файл өшірілмейді)">' + svg(IC.close, 14) + '</button>' +
      '</li>';
    }).join('');
  }
  function closeStart() {
    if (!start || !cur) return;                       // жоба ашылмай тұрып бастапқы терезе жабылмайды
    start.remove(); start = null;
    document.documentElement.classList.remove('mura-starting');
  }

  /* ======================= Құралдар панелін баптау ======================= */
  var TB_KEY = 'mura.toolbar.v1';
  var tbStore = {
    get: function () { try { var o = JSON.parse(localStorage.getItem(TB_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } },
    set: function (o) { try { localStorage.setItem(TB_KEY, JSON.stringify(o)); } catch (e) { /* жеке режим */ } },
  };
  var SECTIONS = [
    { id: 'marks', label: 'Ескерткіштер' }, { id: 'routes', label: 'Маршруттар' }, { id: 'zone', label: 'Қорғау аймағы' }, { id: 'common', label: 'Ортақ құралдар (жоғарғы қатар)' },
  ];
  // Жолақтағы батырмалар (services.js қайта топтаған соң): бөлім → топ → батырмалар. «Аяқтау» мен жасырын қызметтік
  // батырмалар тізімге кірмейді — олар әрдайым өз орнында.
  var skip = function (b) { return !b.id || b.classList.contains('mura-gone') || b.classList.contains('mura-finish') || b.id === 'qaMoreBtn' || b.id === 'qaSave' || b.id === 'muraSetBtn'; };
  var inv = [];
  function scan() {
    inv = [];
    if (!bar || !tmain) return;
    var seen = {};
    var add = function (sec, g, k) {
      var btns = [].filter.call(g.children, function (b) { return b.classList && b.classList.contains('qa-tbtn') && !skip(b); });
      if (!btns.length) return;
      var key = sec + ':' + (seen[sec] = (seen[sec] || 0) + 1);
      inv.push({ sec: sec, key: key, el: g, label: g.getAttribute('aria-label') || '', slots: btns.slice(), btns: btns });
    };
    [].forEach.call(tmain.querySelectorAll(':scope > .qa-tgroup'), function (g) { add(g.dataset.svc || 'zone', g); });
    [].forEach.call(bar.querySelectorAll('.mura-common > .qa-tgroup'), function (g) { add('common', g); });
  }
  function labelOf(b) {
    var t = b.querySelector('.qa-tl');
    return (b.getAttribute('aria-label') || (t && t.textContent) || b.id).trim();
  }
  /** Баптауларды жолаққа қолдану: рет (әр топтың ішінде), жасырылғандар, тек иконкалар. */
  function applyToolbar() {
    var cfg = tbStore.get(), hid = cfg.hidden || {}, order = cfg.order || {};
    inv.forEach(function (g) {
      var ids = order[g.key];
      var sorted = g.slots.slice();
      if (Array.isArray(ids)) sorted.sort(function (a, b) { var i = ids.indexOf(a.id), j = ids.indexOf(b.id); return (i < 0 ? 1e3 + g.slots.indexOf(a) : i) - (j < 0 ? 1e3 + g.slots.indexOf(b) : j); });
      // Батырмалар бастапқы орындарына (слоттарға) ретімен қойылады — топтағы басқа элементтер («Аяқтау» т.б.) қозғалмайды
      var marks = g.btns.map(function (b) { var c = document.createComment('slot'); b.parentNode.replaceChild(c, b); return c; });
      marks.forEach(function (c, i) { c.parentNode.replaceChild(sorted[i], c); });
      g.btns = sorted;
      sorted.forEach(function (b) { b.classList.toggle('mura-uhide', !!hid[b.id]); });
    });
    if (bar) bar.classList.toggle('mura-icons', cfg.labels === 'icons');
    window.dispatchEvent(new CustomEvent('mura:toolbar'));
  }
  function setCfg(fn) { var c = tbStore.get(); fn(c); tbStore.set(c); applyToolbar(); }

  /* ======================= «Баптаулар» терезесі ======================= */
  var setDlg = null, setTab = 'project';
  function openSettings(tab) {
    if (start && !cur) return;
    if (start) closeStart();
    closeSettings();
    if (!cur) tab = 'toolbar';
    setTab = tab || setTab || 'project';
    if (globalThis.QAUI && globalThis.QAUI.closePop) globalThis.QAUI.closePop();
    setDlg = document.createElement('div');
    setDlg.className = 'mura-dlg-back mura-set-back';
    setDlg.innerHTML =
      '<div class="mura-dlg mura-set" role="dialog" aria-modal="true" aria-labelledby="muraSetT">' +
        '<div class="mura-set-head"><h3 id="muraSetT">' + svg(IC.gear) + 'Баптаулар</h3><button type="button" class="mura-start-x" data-x aria-label="Жабу" title="Жабу (Esc)">' + svg(IC.close) + '</button></div>' +
        '<div class="mura-tabs" role="tablist">' +
          (cur ? '<button type="button" role="tab" data-tab="project">Жоба</button>' : '') +
          '<button type="button" role="tab" data-tab="toolbar">Құралдар панелі</button>' +
        '</div>' +
        (cur ? '<form class="mura-pane" data-pane="project" id="muraSetForm" novalidate>' +
          metaFields('muraSet', cur) +
          '<div class="mura-set-file"><span>Жоба файлы:</span> <code>' + esc(cur.path) + '</code> <button type="button" class="lnk" id="muraReveal">Қалтасын ашу</button></div>' +
          '<div class="mura-set-file"><span>Бөтен GeoPackage деректері:</span> <button type="button" class="lnk" id="muraImpGpkg">GeoPackage-тен импорттау… (Ctrl+I)</button></div>' +
          '<p class="mura-hint">Деректер: ' + esc(cur.counts ? [cur.counts.marks + ' ескерткіш', cur.counts.zones + ' қорғау аймағы', cur.counts.routes + ' маршрут'].join(', ') : '') + '. ' +
            'Облыс не аудан өзгерсе, бұрын сақталған жазбалар өзгермейді — тек жаңа жазбалардың әдепкі мәні.</p>' +
          '<p class="mura-err" id="muraSetErr" role="alert" hidden></p>' +
          '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-x>Бас тарту</button><button type="submit" class="btn btn--primary btn--sm">Сақтау</button></div>' +
        '</form>' : '') +
        '<div class="mura-pane" data-pane="toolbar">' +
          '<p class="mura-hint">Белгі алынған батырмалар құралдар жолағында көрсетілмейді; ↑ ↓ — топтың ішіндегі реті. Өзгерістер бірден қолданылады және осы компьютерде сақталады.</p>' +
          '<div class="mura-tb-opts"><label class="mura-cb"><input type="checkbox" id="muraTbIcons"><span>Тек иконкалар (жазуларсыз)</span></label></div>' +
          '<div id="muraTbList"></div>' +
          '<div class="mura-dlg-btns"><button type="button" class="lnk" id="muraTbReset">Әдепкі күйге қайтару</button><span class="mura-sp"></span><button type="button" class="btn btn--primary btn--sm" data-x>Дайын</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(setDlg);
    setDlg.addEventListener('click', function (e) {
      if (e.target === setDlg || e.target.closest('[data-x]')) { closeSettings(); return; }
      var t = e.target.closest('[data-tab]');
      if (t) paintTab(t.dataset.tab);
    });
    if (cur) {
      var f = $('muraSetForm');
      bindMeta(f);
      $('muraReveal').addEventListener('click', function () { if (M.projectReveal) M.projectReveal(); });
      $('muraImpGpkg').addEventListener('click', function () { closeSettings(); if (window.MuraGpkgImport) window.MuraGpkgImport.start(''); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var m = readMeta(f), er = $('muraSetErr');
        if (!m.name) { er.textContent = 'Жоба атауын енгізіңіз.'; er.hidden = false; return; }
        if (m.name === cur.name && m.oblast === cur.oblast && m.district === cur.district) { closeSettings(); return; }
        M.projectSettings(m).then(function (r) { if (!r.ok) { er.textContent = r.error; er.hidden = false; } });   // сәтті болса — бет қайта жүктеледі
      });
    }
    $('muraTbIcons').checked = tbStore.get().labels === 'icons';
    $('muraTbIcons').addEventListener('change', function (e) { setCfg(function (c) { c.labels = e.target.checked ? 'icons' : 'auto'; }); });
    $('muraTbReset').addEventListener('click', function () { tbStore.set({}); inv.forEach(function (g) { g.btns = g.slots.slice(); }); applyToolbar(); paintTb(); $('muraTbIcons').checked = false; });
    $('muraTbList').addEventListener('change', function (e) {
      var c = e.target.closest('[data-show]');
      if (c) setCfg(function (o) { o.hidden = o.hidden || {}; if (c.checked) delete o.hidden[c.dataset.show]; else o.hidden[c.dataset.show] = true; });
    });
    $('muraTbList').addEventListener('click', function (e) {
      var m = e.target.closest('[data-mv]');
      if (!m) return;
      var g = inv.filter(function (x) { return x.key === m.dataset.g; })[0];
      if (!g) return;
      var ids = g.btns.map(function (b) { return b.id; }), i = ids.indexOf(m.dataset.id), j = i + (+m.dataset.mv);
      if (i < 0 || j < 0 || j >= ids.length) return;
      ids.splice(j, 0, ids.splice(i, 1)[0]);
      setCfg(function (o) { o.order = o.order || {}; o.order[g.key] = ids; });
      paintTb();
      var again = $('muraTbList').querySelector('[data-mv="' + m.dataset.mv + '"][data-id="' + m.dataset.id + '"]');
      if (again && !again.disabled) again.focus();
    });
    paintTab(setTab);
  }
  function paintTab(tab) {
    if (!setDlg) return;
    if (!cur) tab = 'toolbar';
    setTab = tab;
    [].forEach.call(setDlg.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); });
    [].forEach.call(setDlg.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'toolbar') paintTb();
    var first = setDlg.querySelector('[data-pane="' + tab + '"] input, [data-pane="' + tab + '"] select');
    if (first && tab === 'project') first.focus();
  }
  function paintTb() {
    var hid = tbStore.get().hidden || {};
    var h = '';
    SECTIONS.forEach(function (s) {
      var gs = inv.filter(function (g) { return g.sec === s.id; });
      if (!gs.length) return;
      h += '<section class="mura-tb-sec"><h4>' + esc(s.label) + '</h4>';
      gs.forEach(function (g) {
        h += '<ul class="mura-tb-list" aria-label="' + esc(g.label) + '">';
        g.btns.forEach(function (b, i) {
          var ic = b.querySelector('svg');
          h += '<li><label class="mura-cb"><input type="checkbox" data-show="' + esc(b.id) + '"' + (hid[b.id] ? '' : ' checked') + '>' +
            '<span class="mura-tb-ic">' + (ic ? ic.outerHTML : '') + '</span><span>' + esc(labelOf(b)) + '</span></label>' +
            '<button type="button" class="mura-mv" data-g="' + g.key + '" data-id="' + esc(b.id) + '" data-mv="-1"' + (i ? '' : ' disabled') + ' aria-label="Жоғары: ' + esc(labelOf(b)) + '" title="Жоғары (солға)">' + svg(IC.up, 14) + '</button>' +
            '<button type="button" class="mura-mv" data-g="' + g.key + '" data-id="' + esc(b.id) + '" data-mv="1"' + (i < g.btns.length - 1 ? '' : ' disabled') + ' aria-label="Төмен: ' + esc(labelOf(b)) + '" title="Төмен (оңға)">' + svg(IC.down, 14) + '</button></li>';
        });
        h += '</ul>';
      });
      h += '</section>';
    });
    $('muraTbList').innerHTML = h;
  }
  function closeSettings() { if (setDlg) { setDlg.remove(); setDlg = null; } }

  /* ======================= Жолақ, күй жолағы, мәзір ======================= */
  var right = bar && bar.querySelector('.qa-tright');
  if (right) {
    var gb = document.createElement('button');
    gb.type = 'button'; gb.className = 'qa-tbtn'; gb.id = 'muraSetBtn';
    gb.setAttribute('aria-label', 'Баптаулар'); gb.setAttribute('data-tip', 'Баптаулар: жоба, құралдар панелі (Ctrl+,)');
    gb.innerHTML = svg(IC.gear);
    gb.addEventListener('click', function () { openSettings(); });
    right.insertBefore(gb, right.firstChild);
  }
  // Күй жолағы (desktop.js): ашық жоба — басқанда «Баптаулар → Жоба»
  var ver = document.querySelector('.mura-status .mura-st-ver');
  if (ver && cur) {
    var pc = document.createElement('button');
    pc.type = 'button'; pc.className = 'mura-st-cell mura-st-proj'; pc.id = 'muraProj';
    pc.title = 'Жоба: ' + cur.path + '\nБасыңыз — жоба баптаулары';
    pc.innerHTML = svg(IC.file, 13) + '<b>' + esc(cur.name) + '</b>' + (cur.oblast ? '<span>' + esc(where(cur)) + '</span>' : '');
    pc.addEventListener('click', function () { openSettings('project'); });
    ver.parentNode.insertBefore(pc, ver);
  }
  if (M.onUi) M.onUi(function (cmd) {
    if (cmd === 'new') openStart(true);
    else if (cmd === 'start') openStart(false);
    else if (cmd === 'settings') openSettings('project');
    else if (cmd === 'toolbar') openSettings('toolbar');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (setDlg) { e.preventDefault(); e.stopPropagation(); closeSettings(); }
      else if (start && cur) { e.preventDefault(); e.stopPropagation(); closeStart(); }
    }
  }, true);

  scan();
  applyToolbar();
  if (!cur) openStart(false);

  window.MuraProject = { current: cur, openStart: openStart, openSettings: openSettings, applyToolbar: applyToolbar };
})();
