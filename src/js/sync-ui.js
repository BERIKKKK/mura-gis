/* Mura GIS: «Баптаулар → Синхрондау» бөлімі және күй жолағындағы синхрондау белгісі.
   Аккаунт міндетті емес: қосылмаса, бағдарлама бұрынғыдай толық жергілікті жұмыс істейді. Қосылса — ескерткіштер мен
   маршруттар пайдаланушының өз Google Drive-ындағы Mura GIS-тің жасырын аумағына (appDataFolder) жазылады және Android
   нұсқасымен екі бағытта синхрондалады (main/sync/). Әр жоба синхрондауға тек пайдаланушы келісімімен қосылады.
   Бұл кәдімгі скрипт project.js-тен КЕЙІН жүктеледі: MuraSyncUI.mount(pane) — баптаулар терезесі ашылғанда. */
(function () {
  'use strict';
  var M = window.mura || {};
  var S = M.sync;
  if (!S) return;
  var I18N = window.MuraI18n || { tx: function (a) { return a; } };
  var tx = I18N.tx;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var svg = function (p, s) { return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + (s || 16) + '" height="' + (s || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    off: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    sync: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  };
  var fmt = function (iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  var st = null, pane = null, askConnect = false, askLink = false, busy = false, err = '';

  /* ---------- Күйдің мәтіні ---------- */
  function stateText(s) {
    if (!s.account) return tx('Аккаунт қосылмаған — деректер тек осы компьютерде', 'Аккаунт не подключён — данные только на этом компьютере');
    if (s.syncing || s.state === 'syncing') return tx('Синхрондалуда…', 'Синхронизация…');
    if (s.state === 'offline') return tx('Интернет жоқ — өзгерістер осы компьютерде сақталып, кезекте тұр. Байланыс қалпына келгенде өздігінен жіберіледі.',
      'Нет интернета — изменения сохранены на этом компьютере и ждут отправки. Отправятся сами, когда связь восстановится.');
    if (s.state === 'auth') return tx('Google рұқсаты қайтарылған не мерзімі өткен. Аккаунтты ажыратып, қайта кіріңіз — кезектегі өзгерістер сақталады.',
      'Доступ Google отозван или истёк. Отключите аккаунт и войдите снова — изменения в очереди сохранятся.');
    if (s.state === 'quota') return tx('Google Drive-та бос орын жетпейді. Орын босатыңыз (не тарифті кеңейтіңіз) — кейін синхрондау кезектен жалғасады.',
      'В Google Drive недостаточно места. Освободите место (или расширьте тариф) — синхронизация продолжится из очереди.');
    if (s.state === 'error') return (s.code === 'rate' ? tx('Google сұраныстарды уақытша шектеді — біраздан кейін қайталанады.', 'Google временно ограничил запросы — повтор через некоторое время.')
      : s.code === 'server' ? tx('Google Drive уақытша жауап бермейді — кейін қайталанады.', 'Google Drive временно не отвечает — повтор позже.')
        : tx('Синхрондау қатесі: ', 'Ошибка синхронизации: ') + (s.detail || s.code)) + '';
    if (s.conflicts) return tx('Шешуді қажет ететін қайшылықтар бар (төменде).', 'Есть конфликты, требующие решения (ниже).');
    return tx('Синхрондалды', 'Синхронизировано');
  }
  var projErr = function (e) {
    return { missing: tx('жоба файлы табылмады', 'файл проекта не найден'), unsaved: tx('сақталмаған өзгерістер бар — жобаны сақтағанда синхрондалады', 'есть несохранённые изменения — синхронизируется после сохранения проекта'),
      mismatch: tx('файл басқа жобаға ауысқан', 'файл заменён другим проектом') }[e] || (e ? tx('қате: ', 'ошибка: ') + e : '');
  };
  var kindName = function (t) { return t === 'route' ? tx('Маршрут', 'Маршрут') : tx('Ескерткіш', 'Памятник'); };
  function verHtml(v, who) {
    if (!v) return '';
    if (v.del) return '<b>' + esc(who) + '</b>: <span class="mura-sy-del">' + tx('өшірілген', 'удалено') + '</span>' + (v.at ? ' · ' + esc(fmt(v.at)) : '');
    var bits = [esc(v.name || tx('(атаусыз)', '(без названия)'))];
    if (v.pts != null) bits.push(v.pts + tx(' нүкте', ' точ.'));
    else if (v.lat != null) bits.push(Number(v.lat).toFixed(6) + ', ' + Number(v.lon).toFixed(6));
    if (v.period) bits.push(esc(v.period));
    return '<b>' + esc(who) + '</b>: ' + bits.join(' · ') + (v.at ? ' · ' + esc(fmt(v.at)) : '') + (v.note ? '<br><small>' + esc(v.note) + '</small>' : '');
  }

  /* ---------- Бөлім ---------- */
  function render() {
    if (!pane || !st) return;
    var s = st, h = '';
    h += '<h4 class="mura-set-h">' + tx('Сақтау қызметі', 'Служба хранения') + '</h4><div class="mura-sy-prov">';
    s.providers.forEach(function (p) {
      h += '<label class="mura-cb' + (p.available ? '' : ' is-off') + '"><input type="radio" name="muraSyProv" value="' + esc(p.id) + '"' + (p.id === s.provider ? ' checked' : '') + (p.available ? '' : ' disabled') + '><span>' +
        esc(p.name) + (p.available ? '' : ' <small>' + tx('(кейін қосылады)', '(появится позже)') + '</small>') + '</span></label>';
    });
    h += '</div>';
    if (!s.configured) {
      h += '<p class="mura-err">' + tx('Бұл жинақта Google OAuth клиенті бапталмаған (main/sync/google-oauth.json, docs/SYNC.md). Синхрондау қолжетімсіз, қалған функциялар толық жұмыс істейді.',
        'В этой сборке не настроен OAuth-клиент Google (main/sync/google-oauth.json, docs/SYNC.md). Синхронизация недоступна, остальные функции работают полностью.') + '</p>';
    } else if (!s.account) {
      h += '<p class="mura-hint">' + tx('Аккаунт міндетті емес: оны қоспай-ақ карта, офлайн карталар, белгі қою, маршрут құру және жергілікті сақтау толық қолжетімді. Аккаунт телефон мен компьютер арасында деректерді синхрондау үшін ғана керек. Mura GIS үшін бөлек тіркелудің қажеті жоқ — бар Google аккаунтыңыз жеткілікті.',
        'Аккаунт не обязателен: без него полностью доступны карта, офлайн-карты, метки, маршруты и локальное сохранение. Аккаунт нужен только для синхронизации между телефоном и компьютером. Отдельная регистрация в Mura GIS не нужна — достаточно вашего аккаунта Google.') + '</p>';
      if (askConnect) {
        h += '<div class="mura-sy-consent"><p>' + tx('<b>Деректер қайда сақталады.</b> Синхрондалатын жобалардың ескерткіш нүктелері мен маршруттары <b>сіздің өз Google Drive-ыңызда</b> — Mura GIS-тің жасырын қалтасында (appDataFolder) сақталады. Mura GIS басқа файлдарыңызды көрмейді, ал деректеріңіз, координаталарыңыз бен кіру токендеріңіз Mura GIS серверіне жіберілмейді (ондай сервер жоқ). Офлайн карталар, фотосуреттер мен құжаттар компьютерде қалады.',
          '<b>Где хранятся данные.</b> Точки памятников и маршруты синхронизируемых проектов хранятся <b>в вашем собственном Google Drive</b> — в скрытой папке Mura GIS (appDataFolder). Mura GIS не видит другие ваши файлы, а данные, координаты и токены входа не отправляются на сервер Mura GIS (такого сервера нет). Офлайн-карты, фотографии и документы остаются на компьютере.') + '</p>' +
          '<p class="mura-hint">' + tx('Браузерде Google кіру беті ашылады: аккаунтты таңдап, «Mura GIS қолданбасының деректерін Google Drive-та көру және басқару» рұқсатын беріңіз. Кейін әр жобаны синхрондауға өзіңіз қосасыз.',
            'В браузере откроется страница входа Google: выберите аккаунт и разрешите «просмотр и управление данными приложения Mura GIS в Google Drive». Каждый проект вы затем подключите к синхронизации сами.') + '</p>' +
          '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-sy="ask-no">' + tx('Бас тарту', 'Отмена') + '</button><button type="button" class="btn btn--primary btn--sm" data-sy="connect"' + (busy ? ' disabled' : '') + '>' +
            (busy ? tx('Браузерде кіруді күтуде…', 'Ожидание входа в браузере…') : tx('Келісемін, Google арқылы кіру', 'Согласен, войти через Google')) + '</button></div>' +
          (busy ? '<p class="mura-hint"><button type="button" class="lnk" data-sy="cancel">' + tx('Кіруді тоқтату', 'Прервать вход') + '</button></p>' : '') + '</div>';
      } else {
        h += '<div class="mura-dlg-btns mura-sy-left"><button type="button" class="btn btn--primary btn--sm" data-sy="ask">' + svg(IC.cloud) + tx('Google арқылы кіру', 'Войти через Google') + '</button></div>';
      }
      if (!s.secure) h += '<p class="mura-err">' + tx('Бұл жүйеде қорғалған қойма (шифрлау) қолжетімсіз — токенді қауіпсіз сақтау мүмкін емес.', 'В этой системе недоступно защищённое хранилище — токен нельзя сохранить безопасно.') + '</p>';
    } else {
      h += '<div class="mura-sy-acc">' + svg(IC.cloud, 18) + '<div><b>' + esc(s.account.name || s.account.email) + '</b><span>' + esc(s.account.email) + ' · Google Drive</span></div></div>';
      h += '<dl class="mura-sy-dl">' +
        '<dt>' + tx('Күйі', 'Состояние') + '</dt><dd class="mura-sy-st is-' + esc(s.syncing ? 'syncing' : s.state) + '">' + esc(stateText(s)) + '</dd>' +
        '<dt>' + tx('Соңғы сәтті синхрондау', 'Последняя успешная синхронизация') + '</dt><dd>' + (s.last_sync ? esc(fmt(s.last_sync)) : tx('әлі болмаған', 'ещё не было')) + '</dd>' +
        '<dt>' + tx('Жіберілуі күтілетін өзгерістер', 'Изменений ждут отправки') + '</dt><dd>' + s.pending + '</dd>' +
        '<dt>' + tx('Қайшылықтар', 'Конфликты') + '</dt><dd>' + s.conflicts + '</dd></dl>';
      h += '<div class="mura-dlg-btns mura-sy-left"><button type="button" class="btn btn--primary btn--sm" data-sy="now"' + (s.syncing ? ' disabled' : '') + '>' + svg(IC.sync) + tx('Қазір синхрондау', 'Синхронизировать сейчас') + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-sy="disconnect">' + tx('Аккаунтты ажырату', 'Отключить аккаунт') + '</button></div>';

      // Ашық жоба
      if (s.current) {
        h += '<h4 class="mura-set-h">' + tx('Ашық жоба', 'Открытый проект') + '</h4>';
        if (s.current.linked) {
          h += '<p class="mura-hint">«' + esc(s.current.name) + '» ' + tx('синхрондалады: ескерткіштер мен маршруттар басқа құрылғыларда да осы жобада көрінеді.', 'синхронизируется: памятники и маршруты видны в этом же проекте на других устройствах.') +
            ' <button type="button" class="lnk" data-sy="unlink" data-id="' + esc(s.current.id) + '">' + tx('Синхрондауды тоқтату', 'Остановить синхронизацию') + '</button></p>';
        } else if (askLink) {
          h += '<div class="mura-sy-consent"><p>' + tx('«' + esc(s.current.name) + '» жобасының ескерткіштері, маршруттары және жоба мәліметтері (атауы, облысы, ауданы) <b>' + esc(s.account.email) + '</b> аккаунтының Google Drive-ына жүктеледі. Қорғау аймақтары, жоспар, фотосуреттер мен құжаттар жүктелмейді. Бұлтта бұрыннан бар жазбалар id бойынша біріктіріледі.',
            'Памятники, маршруты и сведения проекта «' + esc(s.current.name) + '» (название, область, район) будут загружены в Google Drive аккаунта <b>' + esc(s.account.email) + '</b>. Охранные зоны, планы, фотографии и документы не загружаются. Записи, уже имеющиеся в облаке, объединяются по id.') + '</p>' +
            '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-sy="link-no">' + tx('Бас тарту', 'Отмена') + '</button><button type="button" class="btn btn--primary btn--sm" data-sy="link">' + tx('Келісемін, жүктеу', 'Согласен, загрузить') + '</button></div></div>';
        } else {
          h += '<p class="mura-hint">' + tx('Бұл жоба синхрондалмайды — деректері тек осы компьютерде.', 'Этот проект не синхронизируется — его данные только на этом компьютере.') + '</p>' +
            '<div class="mura-dlg-btns mura-sy-left"><button type="button" class="btn btn--ghost btn--sm" data-sy="ask-link">' + tx('Осы жобаны синхрондау…', 'Синхронизировать этот проект…') + '</button></div>';
        }
      }
      // Синхрондалатын жобалар және олардағы қайшылықтар
      if (s.projects.length) {
        h += '<h4 class="mura-set-h">' + tx('Синхрондалатын жобалар', 'Синхронизируемые проекты') + '</h4><ul class="mura-sy-list">';
        s.projects.forEach(function (p) {
          h += '<li><div class="mura-sy-pm"><b>' + esc(p.name || tx('(атаусыз)', '(без названия)')) + '</b>' + (p.current ? ' <span class="mura-rc-tag">' + tx('ашық', 'открыт') + '</span>' : '') +
            '<small><bdi dir="ltr">' + esc(p.path) + '</bdi></small><small>' + (p.last_sync ? tx('синхрондалды: ', 'синхронизирован: ') + esc(fmt(p.last_sync)) : tx('әлі синхрондалмаған', 'ещё не синхронизирован')) +
            (p.pending ? ' · ' + tx('күтуде: ', 'ожидают: ') + p.pending : '') + (p.error ? ' · <span class="mura-sy-perr">' + esc(projErr(p.error)) + '</span>' : '') + '</small></div>' +
            (!p.current && p.exists ? '<button type="button" class="lnk" data-sy="open" data-id="' + esc(p.id) + '">' + tx('Ашу', 'Открыть') + '</button>' : '') +
            (!p.exists && !p.current ? '<button type="button" class="lnk" data-sy="relink" data-id="' + esc(p.id) + '">' + tx('Файлды көрсету…', 'Указать файл…') + '</button>' : '') +
            (!p.current ? '<button type="button" class="lnk" data-sy="unlink" data-id="' + esc(p.id) + '">' + tx('Тоқтату', 'Остановить') + '</button>' : '') + '</li>';
          p.conflicts.forEach(function (c) {
            var dev = c.remote && c.remote.dev ? c.remote.dev : tx('басқа құрылғы', 'другое устройство');
            h += '<li class="mura-sy-cf"><div class="mura-sy-pm">' + svg(IC.warn, 14) + ' <b>' + esc(kindName(c.t)) + tx(' екі құрылғыда қатар өзгерген', ' изменён(о) на двух устройствах одновременно') + '</b>' +
              '<small>' + verHtml(c.local, tx('Осы компьютерде', 'На этом компьютере')) + '</small><small>' + verHtml(c.remote, dev) + '</small></div>' +
              '<div class="mura-sy-cfb">' + (p.current || p.exists ? '<button type="button" class="btn btn--ghost btn--sm" data-sy="keep-local" data-id="' + esc(p.id) + '" data-key="' + esc(c.key) + '">' + tx('Осыны қалдыру', 'Оставить эту') + '</button>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-sy="keep-remote" data-id="' + esc(p.id) + '" data-key="' + esc(c.key) + '">' + tx('Басқа құрылғыныкін', 'С другого устройства') + '</button>' : '') + '</div></li>';
          });
        });
        h += '</ul>';
      }
      if (s.cloud.length) {
        h += '<h4 class="mura-set-h">' + tx('Бұлттағы басқа жобалар', 'Другие проекты в облаке') + '</h4><p class="mura-hint">' +
          tx('Басқа құрылғыда (мыс. телефонда) синхрондалатын, бірақ бұл компьютерде әлі жоқ жобалар.', 'Проекты, синхронизируемые на другом устройстве (например, телефоне), но ещё отсутствующие на этом компьютере.') + '</p><ul class="mura-sy-list">';
        s.cloud.forEach(function (c) {
          h += '<li><div class="mura-sy-pm"><b>' + esc(c.name || tx('(атаусыз)', '(без названия)')) + '</b><small>' + esc([c.oblast, c.district].filter(Boolean).join(' · ')) +
            (c.devices && c.devices.length ? (c.oblast ? ' · ' : '') + esc(c.devices.filter(Boolean).join(', ')) : '') + '</small></div>' +
            '<button type="button" class="lnk" data-sy="download" data-id="' + esc(c.id) + '">' + tx('Компьютерге алу…', 'Загрузить на компьютер…') + '</button></li>';
        });
        h += '</ul>';
      }
      h += '<p class="mura-hint">' + tx('Синхрондалады: ескерткіш нүктелері мен маршруттар (барлық атрибуттарымен) және жоба мәліметтері. Әр өзгеріс алдымен жоба файлына сақталады; интернет жоқ кезде кезекке жиналып, бағдарлама ашық тұрғанда байланыс қалпына келісімен жіберіледі. Аккаунт ажыратылса, жобалар мен деректер осы компьютерде қалады.',
        'Синхронизируются точки памятников и маршруты (со всеми атрибутами) и сведения проекта. Каждое изменение сначала сохраняется в файл проекта; без интернета изменения копятся в очереди и отправляются, как только связь восстановится (пока программа открыта). При отключении аккаунта проекты и данные остаются на этом компьютере.') + '</p>';
    }
    if (err) h += '<p class="mura-err" role="alert">' + esc(err) + '</p>';
    h += '<div class="mura-dlg-btns"><span class="mura-sp"></span><button type="button" class="btn btn--primary btn--sm" data-x>' + tx('Дайын', 'Готово') + '</button></div>';
    pane.innerHTML = h;
  }

  function apply(r) {
    if (r && r.status) st = r.status;
    err = r && !r.ok && !r.canceled ? (r.code === 'denied' ? tx('Google рұқсаты берілмеді.', 'Доступ Google не предоставлен.') : r.code === 'canceled' ? '' : (r.error || '')) : '';
    render(); paintCell();
  }
  function act(e) {
    var b = e.target.closest('[data-sy]');
    if (!b) return;
    var a = b.dataset.sy, id = b.dataset.id, key = b.dataset.key;
    if (a === 'ask') { askConnect = true; err = ''; render(); return; }
    if (a === 'ask-no') { askConnect = false; render(); return; }
    if (a === 'ask-link') { askLink = true; render(); return; }
    if (a === 'link-no') { askLink = false; render(); return; }
    if (a === 'cancel') { S.cancel(); return; }
    if (a === 'connect') {
      busy = true; render();
      S.connect().then(function (r) { busy = false; if (r.ok) askConnect = false; apply(r); });
      return;
    }
    if (a === 'disconnect') {
      if (!window.confirm(tx('Аккаунт ажыратылсын ба? Синхрондау тоқтайды; жобалар мен деректер осы компьютерде қалады, бұлттағы көшірме өшірілмейді.',
        'Отключить аккаунт? Синхронизация остановится; проекты и данные останутся на этом компьютере, копия в облаке не удаляется.'))) return;
      S.disconnect().then(apply); return;
    }
    if (a === 'now') { S.now().then(apply); return; }
    if (a === 'link') { askLink = false; S.link().then(apply); return; }
    if (a === 'unlink') {
      if (!window.confirm(tx('Бұл жобаның синхрондауы тоқтатылсын ба? Жоба файлы мен бұлттағы көшірме өзгермейді.', 'Остановить синхронизацию этого проекта? Файл проекта и копия в облаке не изменятся.'))) return;
      S.unlink(id).then(apply); return;
    }
    if (a === 'download') { S.download(id).then(apply); return; }
    if (a === 'open') { S.open(id).then(apply); return; }
    if (a === 'relink') { S.relink(id).then(apply); return; }
    if (a === 'keep-local' || a === 'keep-remote') { S.resolve(id, key, a === 'keep-remote' ? 'remote' : 'local').then(apply); }
  }

  /* ---------- Күй жолағы ---------- */
  var cell = null;
  function paintCell() {
    if (!st) return;
    var ver = document.querySelector('.mura-status .mura-st-ver');
    if (!st.account) { if (cell) cell.hidden = true; return; }
    if (!cell && ver) {
      cell = document.createElement('button');
      cell.type = 'button'; cell.className = 'mura-st-cell mura-st-sync'; cell.id = 'muraSyncCell';
      cell.addEventListener('click', function () { if (window.MuraProject) window.MuraProject.openSettings('sync'); });
      ver.parentNode.insertBefore(cell, ver);
    }
    if (!cell) return;
    cell.hidden = false;
    var bad = st.state === 'auth' || st.state === 'quota' || st.state === 'error' || st.conflicts;
    var t = st.syncing ? tx('Синхрондалуда…', 'Синхронизация…')
      : st.state === 'offline' ? tx('Желі жоқ', 'Нет сети') + (st.pending ? ' · ' + st.pending : '')
        : st.conflicts ? tx('Қайшылық: ', 'Конфликты: ') + st.conflicts
          : bad ? tx('Синхрондау қатесі', 'Ошибка синхронизации')
            : st.pending ? tx('Күтуде: ', 'Ожидают: ') + st.pending : tx('Синхрондалды', 'Синхронизировано');
    cell.innerHTML = svg(st.state === 'offline' ? IC.off : bad ? IC.warn : IC.cloud, 13) + '<span>' + esc(t) + '</span>';
    cell.classList.toggle('is-bad', !!bad);
    cell.title = stateText(st) + (st.last_sync ? '\n' + tx('Соңғы синхрондау: ', 'Последняя синхронизация: ') + fmt(st.last_sync) : '') + '\n' + tx('Басыңыз — «Баптаулар → Синхрондау»', 'Щёлкните — «Настройки → Синхронизация»');
  }

  S.onStatus(function (s) { st = s; render(); paintCell(); });
  // Басқа құрылғының өзгерістері ашық жобаға жазылды — тізімдер мен картаны жаңарту
  if (S.onApplied) S.onApplied(function () {
    try { if (globalThis.__marks && globalThis.__marks.api) globalThis.__marks.api('list'); } catch (e) { /* модуль жүктелмеген */ }
    try { if (globalThis.MuraRoutes && globalThis.MuraRoutes.api) globalThis.MuraRoutes.api('list'); } catch (e) { /* модуль жүктелмеген */ }
  });
  S.status().then(function (r) { if (r && r.status) { st = r.status; paintCell(); render(); } });

  window.MuraSyncUI = {
    mount: function (el) {
      pane = el; askConnect = false; askLink = false; err = '';
      if (!pane.dataset.bound) { pane.addEventListener('click', act); pane.dataset.bound = '1'; }
      if (st) render(); else pane.innerHTML = '<p class="mura-hint">' + tx('Жүктелуде…', 'Загрузка…') + '</p>';
      S.status().then(function (r) { if (r && r.status) { st = r.status; render(); paintCell(); } });
    },
    unmount: function () { pane = null; },
  };
})();
