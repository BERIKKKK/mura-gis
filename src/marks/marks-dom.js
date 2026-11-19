/* Mura GIS: «Белгі қою» функциясының интерфейс бөліктері (ескерткіш белгілері — қорғау аймағынан бөлек негізгі функция).
   Бұл кәдімгі скрипт qorgau/ui.js пен app.js модульдерінен БҰРЫН орындалады: батырмалар құралдар жолағына алдын ала
   қосылғандықтан, ui.js оларды да ескереді (орын жетпесе «⋯» мәзіріне көшіреді). Логикасы — marks/marks.js. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var L = window.L;
  window.MuraMarks = window.MuraMarks || {};
  // Құралдың картасы (app.js жасайды) — белгілер сол картаға қосылады
  if (L && L.Map) L.Map.addInitHook(function () { if (!window.MuraMarks.map) window.MuraMarks.map = this; });

  var tmain = $('qaTmain');
  if (!tmain) return;
  var ic = function (paths, s) {
    return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  };
  var IC = {
    flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.8L17 12H6"/><circle cx="6" cy="21" r=".6"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h3v3H4zM4 10.5h3v3H4zM4 16.5h3v3H4z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  };
  window.MuraMarks.icon = ic;

  /* ---------- Құралдар жолағы: «Шекара» тобынан кейін — «Белгілер» тобы ---------- */
  var grp = document.createElement('div');
  grp.className = 'qa-tgroup mk-group';
  grp.setAttribute('role', 'group');
  grp.setAttribute('aria-label', 'Ескерткіш белгілері');
  grp.innerHTML =
    '<button type="button" class="qa-tbtn" id="mkMode" data-prio="0" aria-pressed="false" aria-label="Белгі қою" data-tip="Белгі қою: картаны басып ескерткішті белгілеңіз">' + ic(IC.flag) + '<span class="qa-tl">Белгі қою</span></button>' +
    '<button type="button" class="qa-tbtn" id="mkListBtn" data-prio="2" aria-controls="mkPanel" aria-expanded="false" aria-label="Белгілер тізімі" data-tip="Ескерткіш белгілері: тізім, экспорт (GeoJSON, DOCX, PDF)">' + ic(IC.list) + '<span class="qa-tl">Белгілер</span><span class="qa-total mk-total" id="mkCount">0</span></button>';
  var first = tmain.querySelector('.qa-tgroup');
  tmain.insertBefore(grp, first ? first.nextSibling : null);

  /* ---------- Координата панелі: енгізілген координатаны белгі ретінде қосу ---------- */
  var clr = $('qaInClear');
  if (clr) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'qa-tbtn'; b.id = 'mkFromCoord';
    b.setAttribute('aria-label', 'Ескерткіш белгісі ретінде қосу');
    b.title = 'Енгізілген координатаны ескерткіш белгісі ретінде қосу';
    b.innerHTML = ic(IC.flag) + '<span class="qa-tl">Белгі</span>';
    clr.parentNode.insertBefore(b, clr);
  }

  /* ---------- Шартты белгілер ---------- */
  var cnt = $('qaCount');
  if (cnt) {
    var s = document.createElement('span');
    s.className = 'mk-leg';
    s.title = 'Ескерткіш белгілері, түсі — санаты: халықаралық, республикалық, жергілікті маңызы бар, анықталмаған';
    s.innerHTML = '<i class="mk-leg-pin" style="background:#C99A1E;box-shadow:0 0 0 1px #5C4304"></i><i class="mk-leg-pin" style="background:#C0392B;box-shadow:0 0 0 1px #5E1610"></i>' +
      '<i class="mk-leg-pin" style="background:#A9683F;box-shadow:0 0 0 1px #542A17"></i><i class="mk-leg-pin" style="background:#8E8A80;box-shadow:0 0 0 1px #45413A"></i>Белгілер';
    cnt.parentNode.insertBefore(s, cnt);
  }

  /* ---------- Белгілер панелі (оң жақ) ---------- */
  var stage = $('qaStage');
  var d = document.createElement('aside');
  d.className = 'qa-drawer qa-glass mk-drawer';
  d.id = 'mkPanel';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'mkPanelT');
  d.hidden = true;
  d.innerHTML =
    '<header class="qa-dh"><h2 id="mkPanelT">' + ic(IC.flag) + 'Ескерткіш белгілері</h2><button type="button" class="qa-ib" data-mkclose aria-label="Жабу" title="Жабу">' + ic(IC.close) + '</button></header>' +
    '<div class="qa-db">' +
      '<div class="qa-sfilter"><label class="qa-search">' + ic(IC.search, 16) + '<input type="search" id="mkQ" placeholder="Іздеу: атауы, жері…" aria-label="Белгілерден іздеу" autocomplete="off"></label></div>' +
      '<div class="mk-legend" id="mkLegend" aria-label="Белгі түстері — санаты бойынша"></div>' +
      '<div class="mk-filters" id="mkFilters">' +
        '<select id="mkFCat" aria-label="Санаты бойынша сүзу"><option value="">Барлық санат</option></select>' +
        '<select id="mkFOblast" aria-label="Облыс бойынша сүзу" hidden><option value="">Барлық облыс</option></select>' +
        '<select id="mkFDistrict" aria-label="Аудан бойынша сүзу"><option value="">Барлық аудан</option></select>' +
        '<select id="mkFType" aria-label="Түрі бойынша сүзу"><option value="">Барлық түрі</option></select>' +
        '<select id="mkFStatus" aria-label="Мәртебесі бойынша сүзу"><option value="">Барлық мәртебе</option></select>' +
      '</div>' +
      '<div class="qa-selbar"><label class="qa-check"><input type="checkbox" id="mkShow" checked> Картада көрсету</label>' +
        '<label class="qa-check"><input type="checkbox" id="mkLabels"> Атаулары</label><span id="mkInfo"></span></div>' +
      '<div class="qa-slist" id="mkList"><div class="qa-empty">Жүктелуде…</div></div>' +
      '<section class="qa-sec mk-exp" aria-labelledby="mkExpT">' +
        '<h3 id="mkExpT">Ескерткіштер тізімін экспорттау</h3>' +
        '<div class="qa-f"><label for="mkTitle">Тізім атауы</label><textarea id="mkTitle" rows="2" maxlength="400"></textarea>' +
          '<p class="qa-hint">Тізімге сүзгіден өткен белгілер кіреді. Әр санат (халықаралық, республикалық, жергілікті маңызы бар) — бөлек кесте; ішінде облыс, аудан, содан кейін атау бойынша сұрыпталады (рим цифрлары санмен салыстырылады: «Қабантау-ІV» → «Қабантау-V»). ' +
          '<button type="button" class="lnk" id="mkTitleAuto" style="font-size:12px">Атауды қайта құрастыру</button></p>' +
          '<p class="qa-hint mk-multi" id="mkTitleMulti" hidden></p></div>' +
      '</section>' +
    '</div>' +
    '<footer class="qa-df">' +
      '<button type="button" class="btn btn--steppe btn--sm" id="mkGeo" disabled title="Белгілердің нүктелері (WGS 84) — GeoJSON">GeoJSON</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="mkDocx" disabled title="Ескерткіштер тізімі — Word кестесі">Word (DOCX)</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="mkPdf" disabled title="Ескерткіштер тізімі — PDF кестесі">PDF</button>' +
      '<input type="file" id="mkGeoFile" accept=".geojson,.json,application/geo+json,application/json" hidden>' +
      '<button type="button" class="lnk qa-grow" id="mkImport" title="GeoJSON файлынан нүктелерді белгі ретінде қосу">GeoJSON-нан қосу</button>' +
      '<span class="qa-cinfo" id="mkBusy" role="status"></span>' +
    '</footer>';
  stage.appendChild(d);
})();
