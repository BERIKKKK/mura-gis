/* Mura GIS: Қазақстанның әкімшілік-аумақтық бірліктері (2025–2026 жж. жағдайы бойынша).
   Бірінші деңгей: 17 облыс және 3 республикалық маңызы бар қала (Астана, Алматы, Шымкент).
   Екінші деңгей: облыстық маңызы бар қалалар, аудандар; республикалық маңызы бар қалаларда — қала аудандары;
   Ақтөбе мен Қарағандыда — қала аудандары да (бұрынғы жазбалармен үйлесімі үшін Ақтөбенікі бұрынғы кілттерімен).
   Бұл кәдімгі скрипт qorgau/app.js-тен БҰРЫН орындалады:
     • «Мәліметтер» панеліндегі «Облыс» өрісін тізімге айналдырады, «Аудан / қала» тізімін таңдалған облысқа сай толтырады;
     • соңғы таңдалған облыс / республикалық қала есте сақталады (mura.region) — жаңа жазба мен жаңа белгіге әдепкі мән болады.
   window.MuraRegions — белгілер модулі (marks/marks.js) де осыны пайдаланады.
   Жоба (.gpkg) облысқа байланған болса, «Облыс» өрісі сол облыспен автоматты толады және өзгермейді, «Аудан» тізімінде
   тек сол облыстың аудандары тұрады; жоба ауданға байланса — аудан да автоматты қойылады. Өзгерту — «Баптаулар → Жоба». */
(function () {
  'use strict';
  var C = function (n) { return n + ' қаласы'; };
  var A = function (n) { return n + ' ауданы'; };
  var list = [
    { name: 'Абай облысы', units: [C('Семей'), C('Курчатов'), A('Абай'), A('Ақсуат'), A('Аягөз'), A('Бесқарағай'), A('Бородулиха'), A('Жаңасемей'), A('Жарма'), A('Көкпекті'), A('Мақаншы'), A('Үржар')] },
    { name: 'Ақмола облысы', units: [C('Көкшетау'), C('Қосшы'), C('Степногор'), A('Ақкөл'), A('Аршалы'), A('Астрахан'), A('Атбасар'), A('Біржан сал'), A('Бұланды'), A('Бурабай'), A('Егіндікөл'), A('Ерейментау'), A('Есіл'), A('Жақсы'), A('Жарқайың'), A('Зеренді'), A('Қорғалжын'), A('Сандықтау'), A('Целиноград'), A('Шортанды')] },
    { name: 'Ақтөбе облысы', units: [
      { v: 'Ақтөбе қаласы', key: 'aktobe' }, { v: 'Алматы ауданы', key: 'aktobe_almaty', note: 'Ақтөбе қ.' }, { v: 'Астана ауданы', key: 'aktobe_astana', note: 'Ақтөбе қ.' },
      { v: 'Алға ауданы', key: 'alga' }, { v: 'Әйтеке би ауданы', key: 'aiteke' }, { v: 'Байғанин ауданы', key: 'baiganin' }, { v: 'Қарғалы ауданы', key: 'qargaly' },
      { v: 'Қобда ауданы', key: 'kobda' }, { v: 'Мәртөк ауданы', key: 'martok' }, { v: 'Мұғалжар ауданы', key: 'mugalzhar' }, { v: 'Ойыл ауданы', key: 'oiyl' },
      { v: 'Темір ауданы', key: 'temir' }, { v: 'Хромтау ауданы', key: 'khromtau' }, { v: 'Шалқар ауданы', key: 'shalkar' }, { v: 'Ырғыз ауданы', key: 'yrgyz' }] },
    { name: 'Алматы облысы', units: [C('Қонаев'), C('Алатау'), A('Балқаш'), A('Еңбекшіқазақ'), A('Жамбыл'), A('Іле'), A('Қарасай'), A('Кеген'), A('Райымбек'), A('Талғар'), A('Ұйғыр')] },
    { name: 'Атырау облысы', units: [C('Атырау'), A('Жылыой'), A('Индер'), A('Исатай'), A('Қызылқоға'), A('Құрманғазы'), A('Мақат'), A('Махамбет')] },
    { name: 'Батыс Қазақстан облысы', units: [C('Орал'), A('Ақжайық'), A('Бәйтерек'), A('Бөкей ордасы'), A('Бөрлі'), A('Жаңақала'), A('Жәнібек'), A('Қазталов'), A('Қаратөбе'), A('Сырым'), A('Тасқала'), A('Теректі'), A('Шыңғырлау')] },
    { name: 'Жамбыл облысы', units: [C('Тараз'), A('Байзақ'), A('Жамбыл'), A('Жуалы'), A('Қордай'), A('Меркі'), A('Мойынқұм'), A('Сарысу'), A('Т. Рысқұлов'), A('Талас'), A('Шу')] },
    { name: 'Жетісу облысы', units: [C('Талдықорған'), C('Текелі'), A('Ақсу'), A('Алакөл'), A('Ескелді'), A('Қаратал'), A('Кербұлақ'), A('Көксу'), A('Панфилов'), A('Сарқан')] },
    { name: 'Қарағанды облысы', units: [C('Қарағанды'), { v: 'Әлихан Бөкейхан ауданы', note: 'Қарағанды қ.' }, { v: 'Қазыбек би ауданы', note: 'Қарағанды қ.' },
      C('Балқаш'), C('Приозер'), C('Саран'), C('Теміртау'), C('Шахтинск'), A('Абай'), A('Ақтоғай'), A('Бұқар жырау'), A('Қарқаралы'), A('Нұра'), A('Осакаров'), A('Шет')] },
    { name: 'Қостанай облысы', units: [C('Қостанай'), C('Арқалық'), C('Лисаков'), C('Рудный'), A('Алтынсарин'), A('Амангелді'), A('Әулиекөл'), A('Бейімбет Майлин'), A('Денисов'), A('Жангелді'), A('Жітіқара'), A('Қамысты'), A('Қарабалық'), A('Қарасу'), A('Қостанай'), A('Меңдіқара'), A('Наурызым'), A('Сарыкөл'), A('Ұзынкөл'), A('Федоров')] },
    { name: 'Қызылорда облысы', units: [C('Қызылорда'), C('Байқоңыр'), A('Арал'), A('Жалағаш'), A('Жаңақорған'), A('Қазалы'), A('Қармақшы'), A('Сырдария'), A('Шиелі')] },
    { name: 'Маңғыстау облысы', units: [C('Ақтау'), C('Жаңаөзен'), A('Бейнеу'), A('Қарақия'), A('Маңғыстау'), A('Мұнайлы'), A('Түпқараған')] },
    { name: 'Павлодар облысы', units: [C('Павлодар'), C('Ақсу'), C('Екібастұз'), A('Аққулы'), A('Ақтоғай'), A('Баянауыл'), A('Ертіс'), A('Железин'), A('Май'), A('Павлодар'), A('Теренкөл'), A('Успен'), A('Шарбақты')] },
    { name: 'Солтүстік Қазақстан облысы', units: [C('Петропавл'), A('Айыртау'), A('Ақжар'), A('Аққайың'), 'Ғабит Мүсірепов атындағы аудан', A('Есіл'), A('Жамбыл'), A('Қызылжар'), A('Мағжан Жұмабаев'), A('Мамлют'), A('Тайынша'), A('Тимирязев'), A('Уәлиханов'), A('Шал ақын')] },
    { name: 'Түркістан облысы', units: [C('Түркістан'), C('Арыс'), C('Кентау'), A('Бәйдібек'), A('Жетісай'), A('Қазығұрт'), A('Келес'), A('Мақтаарал'), A('Ордабасы'), A('Отырар'), A('Сайрам'), A('Сарыағаш'), A('Сауран'), A('Созақ'), A('Төле би'), A('Түлкібас'), A('Шардара')] },
    { name: 'Ұлытау облысы', units: [C('Жезқазған'), C('Қаражал'), C('Сәтбаев'), A('Жаңаарқа'), A('Ұлытау')] },
    { name: 'Шығыс Қазақстан облысы', units: [C('Өскемен'), C('Риддер'), A('Алтай'), A('Глубокое'), A('Зайсан'), A('Катонқарағай'), A('Күршім'), A('Марқакөл'), A('Самар'), A('Тарбағатай'), A('Ұлан'), A('Үлкен Нарын'), A('Шемонаиха')] },
    { name: 'Астана қаласы', city: true, units: [A('Алматы'), A('Байқоңыр'), A('Есіл'), A('Нұра'), A('Сарайшық'), A('Сарыарқа')] },
    { name: 'Алматы қаласы', city: true, units: [A('Алатау'), A('Алмалы'), A('Әуезов'), A('Бостандық'), A('Жетісу'), A('Медеу'), A('Наурызбай'), A('Түрксіб')] },
    { name: 'Шымкент қаласы', city: true, units: [A('Абай'), A('Әл-Фараби'), A('Еңбекші'), A('Қаратау'), A('Тұран')] },
  ];
  list.forEach(function (r) { r.units = r.units.map(function (u) { return typeof u === 'string' ? { v: u } : u; }); });

  var KEY = 'mura.region', DEF = 'Ақтөбе облысы';
  function find(name) { name = String(name || '').trim(); for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i]; return null; }
  // Ашық жобаның облысы мен ауданы (жоба баптауларынан; бос болса — шектеу жоқ)
  var P = (window.mura && window.mura.project && window.mura.project.current) || null;
  var PO = P && find(P.oblast) ? P.oblast : '';
  var PD = PO && P.district && find(PO).units.some(function (u) { return u.v === P.district; }) ? P.district : '';
  var project = { oblast: PO, district: PD };
  function remembered() { if (PO) return PO; var v = null; try { v = localStorage.getItem(KEY); } catch (e) { /* жеке режим */ } return find(v) ? v : DEF; }
  function remember(name) { if (!PO && find(name)) try { localStorage.setItem(KEY, name); } catch (e) { /* елемейміз */ } }
  var LOCK_TIP = 'Жобаның баптауынан алынады (Файл → Баптаулар → Жоба)';
  /** Тізімде бір ғана мән қалса (жобаның облысы / ауданы) — өріс бекітіледі. */
  function lock(sel) {
    if (!sel) return;
    var one = sel.options.length === 1 && !!sel.options[0].value && (sel.options[0].value === PO || sel.options[0].value === PD);
    sel.disabled = one;
    if (one) sel.title = LOCK_TIP; else if (sel.title === LOCK_TIP) sel.title = '';
  }
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  /** <option> тізімдері: облыстар (республикалық қалалар бөлек топта) және таңдалған облыстың аудандары. */
  function regionOptions(sel) {
    if (PO) {                                          // жоба облысқа байланған: тек сол облыс (ескі жазбаның басқа мәні — сақталады)
      return '<option' + (sel && sel !== PO ? '' : ' selected') + '>' + esc(PO) + '</option>' +
        (sel && sel !== PO ? '<option selected>' + esc(sel) + '</option>' : '');
    }
    var o = '<optgroup label="Облыстар">', c = '<optgroup label="Республикалық маңызы бар қалалар">';
    list.forEach(function (r) { var h = '<option' + (r.name === sel ? ' selected' : '') + '>' + esc(r.name) + '</option>'; if (r.city) c += h; else o += h; });
    var extra = sel && !find(sel) ? '<option selected>' + esc(sel) + '</option>' : '';
    return extra + o + '</optgroup>' + c + '</optgroup>';
  }
  function unitOptions(region, sel) {
    var r = find(region), units = r ? r.units : [];
    var fixed = PD && region === PO;                   // жоба ауданға байланған: тек сол аудан
    if (fixed) { units = units.filter(function (u) { return u.v === PD; }); if (!sel) sel = PD; }
    var h = fixed ? '' : '<option value="">—</option>', has = false;
    units.forEach(function (u) {
      if (u.v === sel) has = true;
      h += '<option value="' + esc(u.v) + '"' + (u.key ? ' data-key="' + esc(u.key) + '"' : '') + (u.v === sel ? ' selected' : '') + '>' + esc(u.v + (u.note ? ' (' + u.note + ')' : '')) + '</option>';
    });
    if (sel && !has) h += '<option value="' + esc(sel) + '" selected>' + esc(sel) + '</option>';   // ескі не қолмен жазылған мән
    return h;
  }
  /** Жаңа жазбаның әдепкі ауданы: жобаның ауданы (бар болса). */
  function defaultDistrict(region) { return PD && (!region || region === PO) ? PD : ''; }
  window.MuraRegions = { list: list, find: find, remembered: remembered, remember: remember, regionOptions: regionOptions, unitOptions: unitOptions,
    project: project, lock: lock, defaultDistrict: defaultDistrict };

  /* ---------- «Мәліметтер» панелі: Облыс → тізім, Аудан → таңдалған облысқа сай ---------- */
  var ob = document.getElementById('qaOblast'), di = document.getElementById('qaDistrict');
  if (!ob || !di) return;
  var sel = document.createElement('select');
  sel.id = 'qaOblast';
  sel.title = 'Облыс не республикалық маңызы бар қала (соңғы таңдауыңыз есте сақталады)';
  ob.parentNode.replaceChild(sel, ob);
  var D = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  function fillUnits(keep) {
    var r = find(D.get.call(sel)), cur = keep ? D.get.call(di) : '';
    if (cur && !(r && r.units.some(function (u) { return u.v === cur; }))) cur = '';   // басқа облыстың ауданы қалып қоймасын
    di.innerHTML = unitOptions(D.get.call(sel), cur);
    lock(sel); lock(di);
  }
  // app.js өрістерді бағдарламалық түрде толтырады (сақталған жазбаны ашқанда т.б.): облыс берілгенде аудандар тізімі
  // соған сай қайта құрылады, тізімде жоқ мән (ескі жазба) болса — қосылады
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get: function () { return D.get.call(sel); },
    set: function (v) { sel.innerHTML = regionOptions(String(v || '').trim() || remembered()); fillUnits(true); },
  });
  Object.defineProperty(di, 'value', {
    configurable: true,
    get: function () { return D.get.call(di); },
    set: function (v) {
      v = String(v || '') || defaultDistrict(D.get.call(sel));
      if (v && ![].some.call(di.options, function (o) { return o.value === v; })) di.innerHTML = unitOptions(D.get.call(sel), v);
      D.set.call(di, v);
      lock(di);
    },
  });
  sel.value = remembered();
  sel.addEventListener('change', function () { remember(D.get.call(sel)); fillUnits(false); di.dispatchEvent(new Event('change', { bubbles: true })); });
})();
