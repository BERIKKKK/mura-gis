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
    draw: '<circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7.3 17.2C11 15 9 10.5 12.5 9.5S16 7.5 16.9 7"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    finish: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.4"/>',
    list: '<path d="M4 6h3M4 12h3M4 18h3"/><path d="M10 6h10M10 12h10M10 18h10"/>',
    find: '<circle cx="6" cy="18" r="2.2"/><path d="M18 3.5a3.5 3.5 0 0 1 3.5 3.5c0 2.6-3.5 6-3.5 6s-3.5-3.4-3.5-6A3.5 3.5 0 0 1 18 3.5z"/><path d="M8 17.5c4.5-.5 2-5.5 6.5-6"/>',
    imp: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    pick: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5"/>',
    swap: '<path d="M7 4v16M3.5 7.5L7 4l3.5 3.5"/><path d="M17 20V4M13.5 16.5L17 20l3.5-3.5"/>',
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
      '<div class="qa-selbar"><label class="qa-check"><input type="checkbox" id="rtShow" checked> Картада көрсету</label>' +
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
