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
    save: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3"/><rect x="7.5" y="13" width="9" height="6" rx="1"/>',
  };
  var fmtDate = function (iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  var I18N = window.MuraI18n || { ru: false, tx: function (a) { return a; } };
  var tx = I18N.tx;
  var LANG = I18N.ru ? 'ru' : 'kk';
  var show = function (n, r) { return REG && REG.show ? REG.show(n, r) : n; };
  var where = function (o) { return [o.oblast ? show(o.oblast) : tx('Бүкіл Қазақстан', 'Весь Казахстан'), o.district ? show(o.district, o.oblast) : ''].filter(Boolean).join(' · '); };
  /** Интерфейс тілін ауыстыру: сақталады (main/lang.js), бет қайта жүктеледі. */
  function switchLang(v) {
    if (v === LANG || !M.setLang) return;
    M.setLang(v).then(function (r) { if (r && r.ok) location.reload(); });
  }
  /** Тіл таңдау батырмалары (бастапқы терезе мен баптаулар үшін) — тіл атаулары өз тілінде. */
  function langButtons(cls) {
    return '<div class="mura-langsw ' + (cls || '') + '" role="group" aria-label="Тіл / Язык">' +
      [['kk', 'Қазақша'], ['ru', 'Русский']].map(function (x) {
        return '<button type="button" class="mura-langb" data-lang="' + x[0] + '" aria-pressed="' + (x[0] === LANG) + '">' + x[1] + '</button>';
      }).join('') + '</div>';
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-lang]'); if (b && b.classList.contains('mura-langb')) switchLang(b.dataset.lang); });

  /* ======================= Облыс / аудан тізімдері (жоба баптаулары үшін — шектеусіз) ======================= */
  function oblastOptions(sel) {
    var o = '<option value="">— Бүкіл Қазақстан (облыс таңдалмайды) —</option>', a = '<optgroup label="Облыстар">', c = '<optgroup label="Республикалық маңызы бар қалалар">';
    (REG ? REG.list : []).forEach(function (r) {
      var h = '<option value="' + esc(r.name) + '"' + (r.name === sel ? ' selected' : '') + '>' + esc(show(r.name)) + '</option>';
      if (r.city) c += h; else a += h;
    });
    return o + a + '</optgroup>' + c + '</optgroup>';
  }
  function districtOptions(oblast, sel) {
    var r = REG && REG.find(oblast);
    if (!r) return '<option value="">— облысты алдымен таңдаңыз —</option>';
    return '<option value="">— Барлық аудандар (аудан таңдалмайды) —</option>' + r.units.map(function (u) {
      return '<option value="' + esc(u.v) + '"' + (u.v === sel ? ' selected' : '') + '>' + esc(show(u.v, oblast) + (u.note ? ' (' + (I18N.ru && REG && REG.ru ? REG.ru(u.note.replace(/ қ\.$/, ' қаласы')) : u.note) + ')' : '')) + '</option>';
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
    var legacyTxt = legacy ? [legacy.marks ? legacy.marks + tx(' ескерткіш', ' памятн.') : '', legacy.zones ? legacy.zones + tx(' қорғау аймағы', ' охр. зон') : '',
      legacy.routes ? legacy.routes + tx(' маршрут', ' маршр.') : '', legacy.imports ? legacy.imports + tx(' импортталған нүкте', ' импорт. точек') : ''].filter(Boolean).join(', ') : '';
    var firstRun = !(info.recent || []).length;

    start = document.createElement('div');
    start.className = 'mura-start';
    start.id = 'muraStart';
    start.setAttribute('role', 'dialog'); start.setAttribute('aria-modal', 'true'); start.setAttribute('aria-labelledby', 'muraStartT');
    start.innerHTML =
      '<div class="mura-start-card">' +
        '<header class="mura-start-head">' +
          '<img src="img/icon.svg" alt="" width="44" height="44">' +
          '<div><h1 id="muraStartT">Mura GIS</h1><p>' + tx('Тарихи-мәдени мұра объектілеріне арналған ГАЖ', 'ГИС для объектов историко-культурного наследия') + (M.version ? tx(' · нұсқа ', ' · версия ') + esc(M.version) : '') + '</p></div>' +
          langButtons('mura-start-lang') +
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
      if (!m.name) { err('muraNewErr', tx('Жоба атауын енгізіңіз.', 'Введите название проекта.')); form.elements.name.focus(); return; }
      err('muraNewErr', '');
      if (!M.projectNew) { err('muraNewErr', tx('Жоба тек Mura GIS бағдарламасында құрылады.', 'Проект создаётся только в программе Mura GIS.')); return; }
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
          ? '<button type="button" class="mura-rc-main" data-open="' + esc(r.path) + '" title="' + tx('Ашу: ', 'Открыть: ') + esc(r.path) + '"><b>' + title + '</b><span>' + esc(where(r)) + (r.opened_at ? ' · ' + esc(fmtDate(r.opened_at)) : '') + '</span><small><bdi dir="ltr">' + esc(r.path) + '</bdi></small></button>'
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
    if (!cur && tab !== 'lang') tab = 'toolbar';
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
          '<button type="button" role="tab" data-tab="lang">Тіл / Язык</button>' +
        '</div>' +
        '<div class="mura-pane" data-pane="lang">' +
          '<h4 class="mura-set-h">' + tx('Интерфейс тілі', 'Язык интерфейса') + '</h4>' +
          langButtons() +
          '<p class="mura-hint">' + tx('Мәзірлер, батырмалар мен хабарламалар тілі. Таңдағанда бағдарлама беті қайта жүктеледі. Алғашқы тіл орнатқышта таңдалады.',
            'Язык меню, кнопок и сообщений. При выборе страница программы перезагружается. Первоначальный язык выбирается в установщике.') + '</p>' +
          '<h4 class="mura-set-h">' + tx('Құжаттардың тілі', 'Язык документов') + '</h4>' +
          (I18N.docLangSelect ? I18N.docLangSelect('muraSetDocLang') : '') +
          '<p class="mura-hint">' + tx('Ескерткіштер тізімі (DOCX, PDF) мен қорғау аймағының құжаттары (DOCX, GeoJSON) интерфейс тілінен тәуелсіз қазақша не орысша шығады. Ескерткіш атауы, мерзімі, орналасқан жері, сипаттамасы екі тілде енгізіледі (ҚАЗ / РУС); құжат тілінде бос өріс болса, екінші тілдегісі алынады.',
            'Список памятников (DOCX, PDF) и документы охранной зоны (DOCX, GeoJSON) выводятся на казахском или русском независимо от языка интерфейса. Наименование, датировка, местонахождение и описание памятника вводятся на двух языках (ҚАЗ / РУС); если поле на языке документа пусто, берётся значение на другом языке.') + '</p>' +
          '<div class="mura-dlg-btns"><span class="mura-sp"></span><button type="button" class="btn btn--primary btn--sm" data-x>' + tx('Дайын', 'Готово') + '</button></div>' +
        '</div>' +
        (cur ? '<form class="mura-pane" data-pane="project" id="muraSetForm" novalidate>' +
          metaFields('muraSet', cur) +
          '<h4 class="mura-set-h">' + tx('Сақтау', 'Сохранение') + '</h4>' +
          '<div class="mura-tb-opts"><label class="mura-cb"><input type="checkbox" id="muraAutosave"' + (autosave ? ' checked' : '') + '><span>' +
            tx('Авто сақтау — әр өзгеріс жоба файлына бірден жазылады', 'Автосохранение — каждое изменение сразу записывается в файл проекта') + '</span></label></div>' +
          '<p class="mura-hint">' + tx('Өшірілсе, өзгерістер жолақтағы «Сақтау» батырмасын не Ctrl+S басқанда ғана жазылады; жоба не бағдарлама жабылғанда сақталмаған өзгерістер туралы сұралады. Қосқыш бірден қолданылады.',
            'Если выключено, изменения записываются только по кнопке «Сохранить» на панели или Ctrl+S; при закрытии проекта или программы спрашивается о несохранённых изменениях. Переключатель применяется сразу.') + '</p>' +
          '<div class="mura-set-file"><span>Жоба файлы:</span> <code>' + esc(cur.path) + '</code> <button type="button" class="lnk" id="muraReveal">Қалтасын ашу</button></div>' +
          '<div class="mura-set-file"><span>Бөтен GeoPackage деректері:</span> <button type="button" class="lnk" id="muraImpGpkg">GeoPackage-тен импорттау… (Ctrl+I)</button></div>' +
          '<p class="mura-hint">' + tx('Деректер: ', 'Данные: ') + esc(cur.counts ? [cur.counts.marks + tx(' ескерткіш', ' памятн.'), cur.counts.zones + tx(' қорғау аймағы', ' охр. зон'), cur.counts.routes + tx(' маршрут', ' маршр.')].join(', ') : '') + '. ' +
            tx('Облыс не аудан өзгерсе, бұрын сақталған жазбалар өзгермейді — тек жаңа жазбалардың әдепкі мәні.', 'Изменение области или района не меняет уже сохранённые записи — только значение по умолчанию для новых.') + '</p>' +
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
      $('muraAutosave').addEventListener('change', function (e) { setAutosave(e.target.checked); });
      $('muraImpGpkg').addEventListener('click', function () { closeSettings(); if (window.MuraGpkgImport) window.MuraGpkgImport.start(''); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var m = readMeta(f), er = $('muraSetErr');
        if (!m.name) { er.textContent = tx('Жоба атауын енгізіңіз.', 'Введите название проекта.'); er.hidden = false; return; }
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
    if (!cur && tab !== 'lang') tab = 'toolbar';
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
            '<button type="button" class="mura-mv" data-g="' + g.key + '" data-id="' + esc(b.id) + '" data-mv="-1"' + (i ? '' : ' disabled') + ' aria-label="' + tx('Жоғары: ', 'Выше: ') + esc(labelOf(b)) + '" title="' + tx('Жоғары (солға)', 'Выше (левее)') + '">' + svg(IC.up, 14) + '</button>' +
            '<button type="button" class="mura-mv" data-g="' + g.key + '" data-id="' + esc(b.id) + '" data-mv="1"' + (i < g.btns.length - 1 ? '' : ' disabled') + ' aria-label="' + tx('Төмен: ', 'Ниже: ') + esc(labelOf(b)) + '" title="' + tx('Төмен (оңға)', 'Ниже (правее)') + '">' + svg(IC.down, 14) + '</button></li>';
        });
        h += '</ul>';
      });
      h += '</section>';
    });
    $('muraTbList').innerHTML = h;
  }
  function closeSettings() { if (setDlg) { setDlg.remove(); setDlg = null; } }

  /* ======================= Жобаны сақтау ======================= */
  // Авто сақтау қосулы — әр өзгеріс файлға бірден жазылады («Сақтау» тек растайды). Өшік — main/gpkg.js өзгерістерді жадта
  // жинайды, «Сақтау» (Ctrl+S) бәрін бір рет жазады. Баптау: «Баптаулар → Жоба → Сақтау».
  var autosave = !(M.prefs && M.prefs.autosave === false);
  var dirty = !!(cur && cur.dirty);
  var saveBtn = null, unsavedCell = null;
  function toast(msg, err) {
    var t = $('qaToast');
    if (!t) return;
    t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2600);
  }
  function paintSave() {
    if (saveBtn) {
      saveBtn.classList.toggle('is-dirty', dirty);
      saveBtn.setAttribute('data-tip', autosave
        ? tx('Жобаны сақтау (Ctrl+S). Авто сақтау қосулы — өзгерістер файлға бірден жазылады', 'Сохранить проект (Ctrl+S). Автосохранение включено — изменения сразу записываются в файл')
        : dirty ? tx('Жобаны сақтау (Ctrl+S): сақталмаған өзгерістер бар', 'Сохранить проект (Ctrl+S): есть несохранённые изменения')
          : tx('Жобаны сақтау (Ctrl+S): барлық өзгеріс сақталған', 'Сохранить проект (Ctrl+S): все изменения сохранены'));
    }
    if (unsavedCell) unsavedCell.hidden = !dirty;
  }
  function saveProject() {
    if (!cur || !M.projectSave) return;
    M.projectSave().then(function (r) {
      if (!r || !r.ok) { toast(tx('Жоба сақталмады: ', 'Проект не сохранён: ') + (r && r.error || ''), true); return; }
      dirty = false; paintSave();
      toast(r.saved ? tx('Жоба сақталды.', 'Проект сохранён.')
        : r.autosave ? tx('Жоба сақтаулы (авто сақтау қосулы).', 'Проект сохранён (автосохранение включено).') : tx('Сақталмаған өзгеріс жоқ.', 'Несохранённых изменений нет.'));
    });
  }
  function setAutosave(on) {
    if (!M.setAutosave) return;
    M.setAutosave(on).then(function (r) {
      if (!r || !r.ok) return;
      autosave = r.autosave;
      if (autosave) dirty = false;
      paintSave();
      toast(autosave ? tx('Авто сақтау қосылды: өзгерістер файлға бірден жазылады.', 'Автосохранение включено: изменения сразу записываются в файл.')
        : tx('Авто сақтау өшірілді: өзгерістерді «Сақтау» (Ctrl+S) арқылы сақтаңыз.', 'Автосохранение выключено: сохраняйте изменения кнопкой «Сохранить» (Ctrl+S).'));
    });
  }
  if (M.onDirty) M.onDirty(function (v) { dirty = v; paintSave(); });

  /* ======================= Жолақ, күй жолағы, мәзір ======================= */
  var right = bar && bar.querySelector('.qa-tright');
  if (right && cur) {
    saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'qa-tbtn mura-psave'; saveBtn.id = 'muraSaveBtn';
    saveBtn.setAttribute('aria-label', tx('Жобаны сақтау', 'Сохранить проект'));
    saveBtn.innerHTML = svg(IC.save) + '<span class="qa-tl">' + tx('Сақтау', 'Сохранить') + '</span>';
    saveBtn.addEventListener('click', saveProject);
    right.insertBefore(saveBtn, right.firstChild);
  }
  if (right) {
    var gb = document.createElement('button');
    gb.type = 'button'; gb.className = 'qa-tbtn'; gb.id = 'muraSetBtn';
    gb.setAttribute('aria-label', 'Баптаулар'); gb.setAttribute('data-tip', 'Баптаулар: жоба, құралдар панелі (Ctrl+,)');
    gb.innerHTML = svg(IC.gear);
    gb.addEventListener('click', function () { openSettings(); });
    right.insertBefore(gb, right.firstChild);
    if (saveBtn) right.insertBefore(saveBtn, gb);            // «Сақтау» — баптаулардың алдында
  }
  // Күй жолағы (desktop.js): ашық жоба — басқанда «Баптаулар → Жоба»
  var ver = document.querySelector('.mura-status .mura-st-ver');
  if (ver && cur) {
    var pc = document.createElement('button');
    pc.type = 'button'; pc.className = 'mura-st-cell mura-st-proj'; pc.id = 'muraProj';
    pc.title = tx('Жоба: ', 'Проект: ') + cur.path + tx('\nБасыңыз — жоба баптаулары', '\nЩёлкните — настройки проекта');
    pc.innerHTML = svg(IC.file, 13) + '<b>' + esc(cur.name) + '</b>' + (cur.oblast ? '<span>' + esc(where(cur)) + '</span>' : '');
    pc.addEventListener('click', function () { openSettings('project'); });
    ver.parentNode.insertBefore(pc, ver);
    unsavedCell = document.createElement('button');
    unsavedCell.type = 'button'; unsavedCell.className = 'mura-st-cell mura-st-unsaved'; unsavedCell.id = 'muraUnsaved';
    unsavedCell.title = tx('Басыңыз — жобаны сақтау (Ctrl+S)', 'Щёлкните — сохранить проект (Ctrl+S)');
    unsavedCell.textContent = tx('● Сақталмаған өзгерістер', '● Несохранённые изменения');
    unsavedCell.addEventListener('click', saveProject);
    pc.parentNode.insertBefore(unsavedCell, pc);
  }
  paintSave();
  if (M.onUi) M.onUi(function (cmd) {
    if (cmd === 'new') openStart(true);
    else if (cmd === 'start') openStart(false);
    else if (cmd === 'settings') openSettings('project');
    else if (cmd === 'toolbar') openSettings('toolbar');
    else if (cmd === 'save') saveProject();
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

  window.MuraProject = { current: cur, openStart: openStart, openSettings: openSettings, applyToolbar: applyToolbar,
    save: saveProject, setAutosave: setAutosave, get dirty() { return dirty; }, get autosave() { return autosave; } };
})();
