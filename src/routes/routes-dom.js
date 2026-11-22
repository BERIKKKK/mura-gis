/* Mura GIS: «Маршруттар» қызметінің интерфейс бөліктері — құралдар жолағының тобы және оң жақ панель.
   Логикасы — routes/routes.js. Бұл файл services.js пен qorgau/ui.js-тен БҰРЫН орындалады
   (ui.js құралдар жолағының батырмаларын жүктелу кезінде санайды). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tmain = $('qaTmain'), stage = $('qaStage');
  if (!tmain || !stage) return;
  var svg = function (p, s) { s = s || 18; return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    draw: '<path d="M9 5h8.5a1 1 0 010 7h-11a1 1 0 000 7H15"/><circle cx="18" cy="19" r="3"/><circle cx="6" cy="5" r="3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    finish: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
    list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
    find: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    imp: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    pick: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/>',
    swap: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  };
  window.MuraRoutesIcon = IC;

  /* ---------- Құралдар жолағы (төменгі қатар, data-svc="routes") ---------- */
  function group(label, html) {
    var g = document.createElement('div');
    g.className = 'qa-tgroup rt-group'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    g.dataset.svc = 'routes';
    g.innerHTML = html;
    tmain.appendChild(g);
  }
  group('Маршрут сызу',
    '<button type="button" class="qa-tbtn" id="rtDraw" data-prio="0" aria-pressed="false" aria-label="Маршрут сызу" data-tip="Маршрут сызу: картаны басып жолдың нүктелерін қойыңыз">' + svg(IC.draw) + '<span class="qa-tl">Маршрут сызу</span></button>' +
    '<button type="button" class="qa-tbtn" id="rtUndo" data-prio="1" aria-label="Соңғы нүктені өшіру" data-tip="Соңғы нүктені өшіру (Backspace)" disabled>' + svg(IC.undo) + '<span class="qa-tl">Болдырмау</span></button>' +
    '<button type="button" class="qa-tbtn mura-finish" id="rtFinish" data-prio="0" aria-label="Аяқтау" data-tip="Аяқтау: маршрутты сақтау (Enter не екі рет басу)" disabled>' + svg(IC.finish) + '<span class="qa-tl">Аяқтау</span></button>');
  group('Маршруттар тізімі және жол табу',
    '<button type="button" class="qa-tbtn" id="rtListBtn" data-prio="2" aria-controls="rtPanel" aria-expanded="false" aria-label="Маршруттар" data-tip="Маршруттар: тізім, экспорт (GPX, GeoJSON)">' + svg(IC.list) + '<span class="qa-tl">Маршруттар</span><span class="qa-total" id="rtCount">0</span></button>' +
    '<button type="button" class="qa-tbtn" id="rtFindBtn" data-prio="1" aria-controls="rtPanel" aria-expanded="false" aria-label="Жол табу" data-tip="Жол табу: маршруттар желісі бойынша А нүктесінен Б нүктесіне">' + svg(IC.find) + '<span class="qa-tl">Жол табу</span></button>');
  group('Маршруттар импорты',
    '<button type="button" class="qa-tbtn" id="rtImportBtn" data-prio="3" aria-label="Импорт" data-tip="Импорттау: GPX, KML, KMZ, GeoJSON тректері">' + svg(IC.imp) + '<span class="qa-tl">Импорт</span></button>');

  /* ---------- Панель (оң жақ) ---------- */
  var d = document.createElement('aside');
  d.className = 'qa-drawer qa-glass mk-drawer rt-drawer';
  d.id = 'rtPanel';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'rtPanelT');
  d.hidden = true;
  d.innerHTML =
    '<header class="qa-dh"><h2 id="rtPanelT">' + svg(IC.draw) + 'Маршруттар</h2><button type="button" class="qa-ib" data-rtclose aria-label="Жабу" title="Жабу">' + svg(IC.close) + '</button></header>' +
    '<div class="mk-tabs" role="tablist">' +
      '<button type="button" role="tab" id="rtTabListB" data-rttab="list" aria-selected="true">Маршруттар <span class="mk-tabn" id="rtTabN">0</span></button>' +
      '<button type="button" role="tab" id="rtTabFindB" data-rttab="find" aria-selected="false">Жол табу</button>' +
    '</div>' +
    '<div class="qa-db" id="rtTabList">' +
      '<div class="qa-sfilter"><label class="qa-search">' + svg(IC.search, 16) + '<input type="search" id="rtQ" placeholder="Іздеу: атауы, нүктелері…" aria-label="Маршруттардан іздеу" autocomplete="off"></label>' +
        '<select id="rtFVeh" aria-label="Көлік бойынша сүзу"><option value="">Барлық көлік</option></select></div>' +
      '<div class="rt-legend" id="rtLegend"></div>' +
      '<div class="qa-selbar"><label class="qa-check"><input type="checkbox" id="rtShow"> Барлығын көрсету</label>' +
        '<label class="qa-check"><input type="checkbox" id="rtNodes"> Тораптар</label><span id="rtInfo"></span></div>' +
      '<div class="qa-slist" id="rtList"><div class="qa-empty">Жүктелуде…</div></div>' +
    '</div>' +
    '<div class="qa-db" id="rtTabFind" hidden>' +
      '<p class="qa-hint">' + tx('Жол сақталған маршруттардың желісі бойынша ізделеді: маршруттардың ұштары, қиылыстары және жанынан өтетін ескерткіштер — тораптар. ' +
        'Басы не соңы желіден алыс болса, оған дейінгі түзу қашықтық бөлек көрсетіледі.',
        'Путь ищется по сети сохранённых маршрутов: узлы — концы и пересечения маршрутов, а также памятники, мимо которых они проходят. ' +
        'Если начало или конец далеко от сети, расстояние до него по прямой показывается отдельно.') + '</p>' +
      '<div class="qa-f"><label for="rtFrom">Қайдан</label><div class="rt-pick"><select id="rtFrom"></select>' +
        '<button type="button" class="qa-tbtn" id="rtFromPick" aria-pressed="false" aria-label="Картадан таңдау" title="Картадан таңдау: картаны басыңыз">' + svg(IC.pick) + '</button></div></div>' +
      '<div class="rt-swaprow"><button type="button" class="lnk" id="rtSwap" title="Басы мен соңын ауыстыру">' + svg(IC.swap, 15) + ' Ауыстыру</button></div>' +
      '<div class="qa-f"><label for="rtTo">Қайда</label><div class="rt-pick"><select id="rtTo"></select>' +
        '<button type="button" class="qa-tbtn" id="rtToPick" aria-pressed="false" aria-label="Картадан таңдау" title="Картадан таңдау: картаны басыңыз">' + svg(IC.pick) + '</button></div></div>' +
      '<div class="qa-f"><label for="rtVeh">Көлік</label><select id="rtVeh"></select>' +
        '<label class="qa-check rt-wet" title="Тек құрғақ маусымда өтетін жолдар есепке алынбайды"><input type="checkbox" id="rtWet"> Жаңбырлы маусым: тек құрғақта өтетін жолдарсыз</label></div>' +
      '<div class="qa-actions"><button type="button" class="btn btn--primary btn--sm" id="rtGo">Маршрут құру</button>' +
        '<button type="button" class="lnk" id="rtClear" hidden>Тазалау</button></div>' +
      '<div id="rtResult" class="rt-result" aria-live="polite"></div>' +
    '</div>' +
    '<footer class="qa-df">' +
      '<button type="button" class="btn btn--steppe btn--sm" id="rtGpx" disabled title="GPX — навигаторға, телефонға">GPX</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="rtGeo" disabled title="GeoJSON — QGIS-ке не басқа компьютерге (қасиеттерімен)">GeoJSON</button>' +
      '<input type="file" id="rtFile" accept=".gpx,.kml,.kmz,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json,application/json" multiple hidden>' +
      '<button type="button" class="lnk qa-grow" id="rtImport" title="Тректерді импорттау: GPX, KML, KMZ, GeoJSON">Импорттау (GPX, KML, KMZ, GeoJSON)</button>' +
      '<span class="qa-cinfo" id="rtBusy" role="status"></span>' +
    '</footer>';
  stage.appendChild(d);
})();
