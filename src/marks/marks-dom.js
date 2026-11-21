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
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
    // «Белгілер» панелі — «Қорғау аймақтары» панелімен (қалта + белгі) бір үлгіде: екеуі де жазбалар жинағы
    list: '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    // «Өзге нысандар» (Lucide: map-pinned)
    place: '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 01-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0112 0"/><path d="M4.474 15h-.197a1 1 0 00-.969.753l-1.097 4.35a1.5 1.5 0 001.444 1.898L20.344 22a1.5 1.5 0 001.446-1.897l-1.098-4.35a1 1 0 00-.969-.753h-.197"/><circle cx="12" cy="8" r="2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  };
  window.MuraMarks.icon = ic;
  window.MuraMarks.IC = IC;

  /* ---------- Құралдар жолағы: ең басында — «Белгілер» тобы, одан кейін қорғау аймағының құралдары ---------- */
  var grp = document.createElement('div');
  grp.className = 'qa-tgroup mk-group';
  grp.setAttribute('role', 'group');
  grp.setAttribute('aria-label', 'Ескерткіш белгілері');
  grp.innerHTML =
    '<button type="button" class="qa-tbtn" id="mkMode" data-prio="0" aria-pressed="false" aria-label="Белгі қою" data-tip="Белгі қою: картаны басып ескерткішті белгілеңіз">' + ic(IC.flag) + '<span class="qa-tl">Белгі қою</span></button>' +
    '<button type="button" class="qa-tbtn" id="mkListBtn" data-prio="2" aria-controls="mkPanel" aria-expanded="false" aria-label="Ескерткіштер" data-tip="Ескерткіштер: тізім, экспорт (GeoJSON, DOCX, PDF)">' + ic(IC.list) + '<span class="qa-tl">Ескерткіштер</span><span class="qa-total mk-total" id="mkCount">0</span></button>' +
    '<button type="button" class="qa-tbtn" id="plListBtn" data-prio="2" aria-controls="mkPanel" aria-expanded="false" aria-label="Өзге нысандар" data-tip="Өзге нысандар: елді мекен, қыстау, құдық т.б. — тізім, сүзгі, экспорт">' + ic(IC.place) + '<span class="qa-tl">Өзге нысандар</span><span class="qa-total mk-total" id="plCount">0</span></button>';
  tmain.insertBefore(grp, tmain.firstChild);

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
    s.title = 'Ескерткіштер, түсі — санаты: халықаралық, республикалық, жергілікті маңызы бар, анықталмаған';
    s.innerHTML = '<i class="mk-leg-pin" style="background:#8E3FC4;box-shadow:0 0 0 1px #3E1460"></i><i class="mk-leg-pin" style="background:#E0202E;box-shadow:0 0 0 1px #6B0710"></i>' +
      '<i class="mk-leg-pin" style="background:#F28C00;box-shadow:0 0 0 1px #7A4100"></i><i class="mk-leg-pin" style="background:#8E8A80;box-shadow:0 0 0 1px #45413A"></i>Ескерткіштер';
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
    // «Өзге нысандар» — қойынды емес: құралдар жолағындағы өз батырмасымен ашылады (тақырып пен белгі ауысады, қойындылар жасырылады)
    '<header class="qa-dh"><h2 id="mkPanelT"><span id="mkPanelIc">' + ic(IC.flag) + '</span><span id="mkPanelTT">Ескерткіштер</span></h2><button type="button" class="qa-ib" data-mkclose aria-label="Жабу" title="Жабу">' + ic(IC.close) + '</button></header>' +
    '<div class="mk-tabs" role="tablist">' +
      '<button type="button" role="tab" id="mkTabMarksB" data-mktab="marks" aria-selected="true">Ескерткіштер <span class="mk-tabn" id="mkTabN">0</span></button>' +
      '<button type="button" role="tab" id="mkTabImpB" data-mktab="imp" aria-selected="false" title="KML, KMZ, GPX файлдарынан импортталған, әлі сәйкестендірілмеген нүктелер">Импортталғандар <span class="mk-tabn" id="mkTabI">0</span></button>' +
    '</div>' +
    '<div class="qa-db" id="mkTabMarks">' +
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
        '<label class="qa-check"><input type="checkbox" id="mkLabels"> Атаулары</label>' +
        '<label class="qa-check" title="Сүзгі қойылса, картада тек соған сай ескерткіштер көрінеді"><input type="checkbox" id="mkMapF" checked> Картада тек сүзгідегілер</label>' +
        '<button type="button" class="lnk" id="mkFReset" hidden>Сүзгіні тазарту</button><span id="mkInfo"></span></div>' +
      '<div class="mk-selbar" id="mkSelBar"><label class="qa-check"><input type="checkbox" id="mkSelAll"> Барлығын таңдау</label>' +
        '<span id="mkSelInfo"></span><button type="button" class="btn btn--sm mk-seldel" id="mkSelDel" hidden>Таңдалғандарды өшіру</button></div>' +
      '<div class="qa-slist" id="mkList"><div class="qa-empty">Жүктелуде…</div></div>' +
      '<section class="qa-sec mk-exp" aria-labelledby="mkExpT">' +
        '<h3 id="mkExpT">Ескерткіштер тізімін экспорттау</h3>' +
        // Құжат тілі интерфейс тілінен тәуелсіз: кесте қазақша не орысша шығады
        '<div class="qa-f">' + (window.MuraI18n ? window.MuraI18n.docLangSelect('mkDocLang') : '') + '</div>' +
        '<div class="qa-f"><label for="mkTitle">Тізім атауы</label><textarea id="mkTitle" rows="2" maxlength="400"></textarea>' +
          '<p class="qa-hint">' + tx('Тізімге сүзгіден өткен белгілер кіреді. Әр санат (халықаралық, республикалық, жергілікті маңызы бар) — бөлек кесте; ішінде облыс, аудан, содан кейін атау бойынша сұрыпталады (рим цифрлары санмен салыстырылады: «Қабантау-ІV» → «Қабантау-V»). ',
            'В список входят метки, прошедшие фильтр. Каждая категория (международного, республиканского, местного значения) — отдельная таблица; внутри сортировка по области, району, затем по наименованию (римские цифры сравниваются как числа: «Кабантау-IV» → «Кабантау-V»). ') +
          '<button type="button" class="lnk" id="mkTitleAuto" style="font-size:12px">Атауды қайта құрастыру</button></p>' +
          '<p class="qa-hint mk-multi" id="mkTitleMulti" hidden></p></div>' +
      '</section>' +
    '</div>' +
    '<div class="qa-db" id="mkTabPlaces" hidden>' +
      '<p class="qa-hint mk-imphint">' + tx('Ескерткіш емес нысандар: елді мекен, қыстау, жайлау, күзеу, көктеу, тұрақ, құдық, бұлақ т.б. Қосу — «Белгі қою» → картаны басу → «Өзге нысандар».',
        'Объекты, не являющиеся памятниками: населённые пункты, зимовки, пастбища, стоянки, колодцы, родники и др. Добавление — «Поставить метку» → щелчок по карте → «Прочие объекты».') + '</p>' +
      '<div class="qa-sfilter"><label class="qa-search">' + ic(IC.search, 16) + '<input type="search" id="plQ" placeholder="Іздеу: атауы, түрі…" aria-label="Өзге нысандардан іздеу" autocomplete="off"></label>' +
        '<select id="plFKind" aria-label="Түрі бойынша сүзу"><option value="">Барлық түрі</option></select></div>' +
      '<div class="qa-selbar"><label class="qa-check"><input type="checkbox" id="plShow" checked> Картада көрсету</label>' +
        '<label class="qa-check"><input type="checkbox" id="plLabels"> Атаулары</label>' +
        '<label class="qa-check" title="Сүзгі қойылса, картада тек соған сай нысандар көрінеді"><input type="checkbox" id="plMapF" checked> Картада тек сүзгідегілер</label>' +
        '<button type="button" class="lnk" id="plFReset" hidden>Сүзгіні тазарту</button><span id="plInfo"></span>' +
        '<button type="button" class="btn btn--sm" id="plAdd" title="Картадан орнын басып, жаңа өзге нысан қосу">+ Нысан қосу</button></div>' +
      '<div class="qa-slist" id="plList"></div>' +
    '</div>' +
    '<div class="qa-db" id="mkTabImp" hidden>' +
      '<p class="qa-hint mk-imphint">' + tx('KML, KMZ, GPX файлдарынан алынған нүктелер. Олар әзірге белгі емес: картадан қарауға болады, ал <b>«Сәйкестендіру»</b> басып, ' +
        'ескерткіштің мәліметтерін (атауы, түрі, санаты, мәртебесі…) толтырып сақтағанда ғана белгілер тізіміне өтеді.',
        'Точки из файлов KML, KMZ, GPX. Пока это не метки: их можно просматривать на карте, а в список меток они попадают только после того, как вы нажмёте <b>«Сопоставить»</b>, ' +
        'заполните сведения о памятнике (наименование, вид, категорию, статус…) и сохраните.') + '</p>' +
      '<div class="qa-sfilter"><label class="qa-search">' + ic(IC.search, 16) + '<input type="search" id="mkIQ" placeholder="Іздеу: атауы, файлы…" aria-label="Импортталғандардан іздеу" autocomplete="off"></label>' +
        '<select id="mkIFile" aria-label="Файл бойынша сүзу"><option value="">Барлық файл</option></select></div>' +
      '<div class="qa-selbar"><label class="qa-check"><input type="checkbox" id="mkImpShow" checked> Картада көрсету</label>' +
        '<label class="qa-check"><input type="checkbox" id="mkImpLabels"> Атаулары</label><span id="mkIInfo"></span></div>' +
      '<div class="qa-slist" id="mkImpList"></div>' +
    '</div>' +
    '<footer class="qa-df">' +
      '<button type="button" class="btn btn--steppe btn--sm" id="mkGeo" disabled title="Белгілердің нүктелері (WGS 84) — GeoJSON">GeoJSON</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="mkDocx" disabled title="Ескерткіштер тізімі — Word кестесі">Word (DOCX)</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="mkPdf" disabled title="Ескерткіштер тізімі — PDF кестесі">PDF</button>' +
      '<button type="button" class="btn btn--steppe btn--sm" id="plGeo" hidden disabled title="Өзге нысандардың нүктелері (WGS 84) — GeoJSON">GeoJSON</button>' +
      '<button type="button" class="btn btn--ghost btn--sm mk-imponly" id="mkIDelAll" hidden title="Барлық импортталған нүктелерді тізімнен өшіру (белгілерге әсер етпейді)">Барлығын өшіру</button>' +
      '<input type="file" id="mkGeoFile" accept=".geojson,.json,.kml,.kmz,.gpx,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml" multiple hidden>' +
      // Импорт батырмасы — тек құралдар жолағында («Ескерткіштер → Импорт», js/services.js); мұндағы жасырын элемент соның әрекетін орындайды
      '<button type="button" id="mkImport" hidden>Импорттау</button><span class="qa-grow"></span>' +
      '<span class="qa-cinfo" id="mkBusy" role="status"></span>' +
    '</footer>';
  stage.appendChild(d);
})();
