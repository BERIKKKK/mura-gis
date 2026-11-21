# Lucide иконкалары

Mura GIS интерфейсіндегі иконкалар (құралдар жолағы, мәзірлер, панельдер, «Өзге нысандар» белгілері) —
**Lucide** жинағынан алынған.

- Дереккөз: <https://lucide.dev> · <https://github.com/lucide-icons/lucide>
- Нұсқасы: `lucide-static` 1.77.0 (npm)
- Лицензиясы: **ISC** (Feather-ден шыққан бөлігі — MIT), мәтіні — осы қалтадағы `LICENSE`.

SVG-нің ішкі сызбалары (`<path>`, `<circle>`, `<rect>`) кодқа өзгеріссіз енгізілген. Тек ортақ сыртқы
`<svg>` тегі жобаның стилінде: `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="1.8"`
(«Өзге нысандар» белгісінде — `2.4`), дөңгелек ұштар. Сыртқы тәуелділік жоқ — бәрі офлайн.

**Бұл жинаққа кірмейді (ауыстырылмаған):** ескерткіштің 5 шартты белгісі (`src/marks/symbols/*.svg`),
қорғау аймағының солтүстік көрсеткіші (`src/qorgau/app.js`, HUD), бағдарлама белгісі (`src/img/icon.svg`).

## Қолданылған иконкалар

| Lucide атауы | Қайда |
|---|---|
| arrow-down, arrow-up | project.js — тізімде жылжыту |
| arrow-down-up | routes-dom.js — басы/соңын ауыстыру |
| chevron-down | index.html — координата панелін жасыру |
| chevrons-left-right | wayback.js — салыстыру сырғытпасы |
| circle-check | desktop.js, routes-dom.js — аяқтау |
| clipboard-paste | index.html, context-menu.js — қою |
| copy | context-menu.js, marks.js, places.js — координатаны көшіру |
| download | index.html, services.js, zone-dialog.js, routes-dom.js — экспорт / импорт |
| drafting-compass | index.html — циркуль |
| ellipsis | index.html — қосымша құралдар |
| eraser | index.html — өлшемдерді жабу |
| file-check | index.html, project.js — үлгі / жоба файлы |
| file-text | zone-dialog.js — Word құжаты |
| flag | services.js, marks-dom.js, marks.js, context-menu.js — «Белгі қою» |
| folder | project.js — қалта |
| folder-check | index.html — сақталған аймақтар |
| fullscreen | index.html — сыйғызу |
| hexagon | services.js, context-menu.js — қорғау аймағы |
| image | zone-dialog.js — PNG сызба |
| info | index.html — мәліметтер панелі |
| landmark | marks-dom.js — ескерткіштер тізімі |
| layers | basemaps.js — карта қабаттары |
| list | index.html, routes-dom.js — тізім, шекара нүктелері |
| locate | index.html, routes-dom.js — координата енгізу, картадан таңдау |
| map | context-menu.js — Google Maps |
| map-pin-plus | index.html, context-menu.js — нүкте қою |
| map-pinned | marks-dom.js, marks.js — «Өзге нысандар» |
| maximize, minimize | index.html, qorgau/ui.js — толық экран |
| navigation | context-menu.js, places.js, routes-dom.js — жол табу |
| pencil | context-menu.js, places.js, routes.js — өңдеу |
| plus | index.html, project.js — қосу |
| rectangle-horizontal | index.html — дәл өлшемді тіктөртбұрыш |
| refresh-ccw-dot | index.html — нүктелерді ретке келтіру |
| route | services.js, routes-dom.js — маршруттар |
| ruler | index.html — сызғыш |
| satellite | context-menu.js — Google спутнигі |
| save, save-all | index.html, project.js — сақтау, жаңа аймақ ретінде сақтау |
| search, zoom-in | index.html, marks-dom.js, routes-dom.js — іздеу, картадан көрсету |
| settings | project.js — баптаулар |
| sliders-horizontal | index.html — бұрыш пен өлшеу баптаулары |
| square-x | qorgau/app.js — жабу |
| trash-2 | index.html, desktop.js, marks.js, places.js, qorgau/app.js, routes.js — өшіру |
| undo-2 | index.html, routes-dom.js — болдырмау |
| upload | index.html — GeoJSON ашу |
| x | index.html, gpkg-import.js, project.js, marks-dom.js, routes-dom.js — жабу |

### «Өзге нысандар» белгілері (`src/marks/places.js`, `KINDS[].i`)

| Түрі | Lucide атауы |
|---|---|
| Елді мекен | house |
| Қыстау | snowflake |
| Жайлау | sun |
| Күзеу | leaf |
| Көктеу | sprout |
| Тұрақ | tent |
| Құдық | circle-dot |
| Бұлақ | droplet |
| Басқа | circle-small |
