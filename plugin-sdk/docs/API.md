# Mura GIS Plugin API 1

Плагин коды оқшауланған ортада орындалады. Жалғыз жаһандық нысан — `mura` (типтері: `types/mura-plugin.d.ts`).
Барлық асинхронды әдіс `Promise` қайтарады; рұқсат жоқ болса — `code: 'permission'` қатесі. Аргументтер мен
нәтижелер JSON арқылы беріледі (функция, DOM-нысан берілмейді). Бір хабардың шегі — 48 МБ.

## Нұсқалау

* `apiVersion` — бүтін сан жолы, қазір `"1"`. Бір нұсқаның ішінде тек **қосымша** өзгеріс болады: жаңа әдіс, жаңа міндетті емес өріс,
  жаңа кеңейту нүктесі. Бар әдістің мағынасы не пішімі өзгерсе — жаңа нұсқа (`"2"`); бағдарлама бұрынғы нұсқаларды
  мүмкіндігінше қатар қолдайды (`SUPPORTED_API`).
* `minAppVersion` (міндетті) / `maxAppVersion` (міндетті емес) — Mura GIS нұсқасы. Сәйкес келмесе — плагин орнатылмайды
  не іске қосылмайды, себебі «Баптаулар → Плагиндер» бөлімінде көрсетіледі. Бағдарлама жаңартылғанда тексеріс қайталанады.
* `platforms` — `desktop` | `tablet` | `mobile` | `web` (әдепкі `["desktop"]`). Қолдау көрсетілмейтін платформада плагин іске қосылмайды.
  Қазір Plugin API тек Desktop нұсқасында бар.

## Манифест (`manifest.json`)

| Өріс | Міндетті | Сипаттама |
|---|---|---|
| `id` | иә | Бірегей, кері домен түрінде: `kz.example.nipd-exporter` (кіші латын, сан, `-`, кемінде бір нүкте) |
| `name` | иә | Жол не `{ "kk": "…", "ru": "…" }` |
| `version` | иә | `x.y.z` (semver) |
| `apiVersion` | иә | `"1"` |
| `minAppVersion` | иә | Mura GIS-тің ең төменгі нұсқасы |
| `maxAppVersion` | жоқ | Ең жоғарғы нұсқа |
| `author` | иә | Жол не `{ name, url (https), email }` |
| `description`, `license`, `homepage`, `repository` | жоқ | |
| `entry` | иә | Архив ішіндегі `.js` файлы |
| `icon` | жоқ | `.svg` не `.png` (≤ 256 КБ) |
| `platforms` | жоқ | Жоғарыдағы тізім |
| `permissions` | жоқ | Төмендегі рұқсаттар |
| `contributes` | жоқ | `{ "zone.export" \| "tools.menu" \| "mark.suggest" \| "zone.suggest": [{ command, title, tooltip? }] }` (әр нүктеге ≤ 10) |
| `settings` | жоқ | `[{ key, type: string\|text\|number\|boolean\|select, title, description?, options?, default? }]` — «Баптаулар → Плагиндер» бөлімінде салынады |

`permissions.json` (міндетті емес): `{ "geometry.read": "не үшін керек" }` — орнату терезесінде рұқсаттың жанында көрсетіледі.

## Рұқсаттар

| Рұқсат | Не береді | Тәуекел |
|---|---|---|
| `geometry.read` | `mura.geometry.selection/list/get` | төмен |
| `attributes.read` | `mura.attributes.selection/list/get` | орташа |
| `map.layers` | `mura.map.*` | төмен |
| `files.export` | `mura.export.saveFile` | орташа |
| `network.access` | плагиннің `fetch` / `WebSocket` — **тек HTTPS / WSS** | жоғары (әдепкі бойынша берілмейді) |
| `project.metadata` | `mura.project.info` | төмен |
| `files.import` | `mura.files.open` — пайдаланушы таңдаған файлдарды оқу (Mura GIS 2.4.2+) | орташа |
| `geometry.write`, `attributes.write` | API 1-де **әдісі жоқ**: сұрауға болады, бірақ берілмейді | — |

Пайдаланушы рұқсатты кез келген уақытта қайтара алады («Баптаулар → Плагиндер → Рұқсаттар»), сондықтан
`mura.hasPermission(p)` арқылы тексеріп, рұқсат жоқ кезде түсінікті хабар көрсетіңіз.

## Команда және контекст

```js
mura.commands.register('export', async (ctx) => { … return нәтиже; });
```

`ctx`: `{ point, lang, docLang, zone?, service? }`. `lang` — интерфейс тілі, `docLang` — құжат (экспорт) тілі,
интерфейс тілінен тәуелсіз. `zone.export` үшін `zone: { id, markId, saved }` және `scope`: `'current'` («Нәтиже және экспорт» бөлімінен) не `'all'` («Қорғау аймақтары» тізімінен).

### `mark.suggest` (Mura GIS 2.4.2+)

Көрінетін батырмасы жоқ нүкте: белгі терезесі ашылғанда, атауы не координатасы өзгергенде бағдарлама команданы өзі
шақырады. Ашық тұрған белгі — `mura.attributes.selection()` (`layer: 'marks'`: атауы, мерзімі, облыс, аудан, орны, түрі…;
`attributes.read` керек) және `mura.geometry.selection()` (Point; `geometry.read` керек). Команда
`{ items: [{ title, detail?, fields }] }` қайтарады (≤ 10): бағдарлама оларды «Плагин ұсынысы» тізімінде көрсетеді,
пайдаланушы таңдаса — `fields` бойынша белгі терезесінің өрістерін **өзі** толтырады (мәтін өрістері: name, name_ru,
period, period_ru, place, place_ru, district, oblast, note, note_ru; тізімдер: type, category, status — тек рұқсат етілген
мәндер). Жоба деректерін плагин өзгертпейді: сақтауды пайдаланушы басады. Қате не ұзақ жауап үнсіз еленеді.
2.4.4-тен: ұсыныс жоқ болса, `{ items: [], hint }` қайтаруға болады — `hint` (≤ 200 таңба) өрістің астында кеңес болып шығады
(мыс. «Атауын жаза бастаңыз…»). Мысал — `examples/decree-matcher`.

### `zone.suggest` (Mura GIS 2.4.4+)

`mark.suggest`-пен бірдей, бірақ қорғау аймағының мәліметтер терезесінде (шекара белгіленіп, «Аяқтау» басылғанда; атауы
жазылғанда, ауданы өзгергенде қайта сұралады). `mura.attributes.selection()` — `layer: 'zones'` (атауы, мерзімі, облыс,
аудан, орны, түрі), `mura.geometry.selection()` — шекараның Polygon-ы. `fields` бойынша аймақтың өрістері толтырылады:
name, name_ru, period, period_ru, place, place_ru, district, oblast, note → сипаттамасы (бос болса), type → ескерткіш түрі
(аймақ өлшемдері соған сай есептеледі).

## Деректер қабаттары

`marks` (ескерткіш белгілері, Point), `zones` (ескерткіш аумағы, Polygon — қорғау, құрылыс салуды реттеу, ландшафт
аймақтары сақталмайды, есептеледі), `routes` (LineString), `places` (өзге нысандар, Point), `plan_objects` («Жоспар», Polygon не Point).
Геометрия — GeoJSON, EPSG:4326, `[бойлық, ендік]`, полигонның сыртқы шекарасы CCW (RFC 7946).
Атрибуттар — жобада сақталған өрістердің көшірмесі; `*_ru` — орысша нұсқасы. Ескерткішке сілтеме — `mark_id` (16 hex).

## Geometry API

| Әдіс | Рұқсат | |
|---|---|---|
| `selection()` | geometry.read | `{ layer: 'zones', id, saved, geometry }` — ағымдағы ескерткіш аумағы (сақталмаған болса `id: null`) |
| `list(layer, { bbox?, limit?, offset? })` | geometry.read | `[{ id, geometry }]`, `limit` ≤ 10 000 |
| `get(layer, id)` | geometry.read | `{ id, geometry }` не `null` |
| `type(g)`, `bbox(g)`, `area(g)` (м²), `orient(ring, ccw)` | — | синхронды, есептеу |
| `validate(g, { crs? })` | — | `{ ok, errors }`: тұйықтық, ≥ 4 позиция, өзін-өзі қиып өту, координаттар шегі, нөл аудан |
| `transform(g, from, to, { precision? })` | — | EPSG:4326, EPSG:3857, EPSG:326NN / 327NN (WGS 84 / UTM) |
| `supported(crs)`, `utmFor(lon, lat)` | — | |

## Attributes API

| Әдіс | Рұқсат | |
|---|---|---|
| `selection()` | attributes.read | `{ layer, id, saved, attributes }` (+ `mark_id`) |
| `list(layer, { limit?, offset? })`, `get(layer, id)` | attributes.read | |
| `map(sources, schema)` | — | Сыртқы жүйенің схемасы бойынша жаңа жазба: `source: 'mark.name'` не `['mark.name', 'zone.name']`, `value`, `default`, `valueMap` (код → мән, мыс. `local` → «Местного значения») |
| `validate(record, schema, { strict? })` | — | Түрі (string, number, integer, boolean, date, datetime — `2020-08-18T00:00:00Z`), `required`, `maxLength`, `min`/`max`, `enum`, `pattern`; схемада жоқ өріс — қате |
| `checkSchema(schema)` | — | Схеманың өзін тексеру |

«Жаңа өрістер ұсыну» — схемада Mura GIS-те жоқ өрісті сипаттап, оның мәнін `value`/`default` не плагин есептеген
дереккөзден (`computed.*`) беру. Схемаға плагиннің өз кілттерін қосуға болады (`map`/`validate` оларды елемейді) — мыс. NIPD үлгісіндегі `common: true` (бір рет енгізілетін ортақ өріс), `editable: true` (тексеру терезесінде түзетілетін өріс). Жоба жазбаларына жаңа өріс жазу API 1-де жоқ.

## Map API (`map.layers`)

`addLayer(id, geojson, style)`, `removeLayer(id)`, `clearLayers()`, `showTemporary(geojson, style, { fit })`, `clearTemporary()`,
`registerSymbol(name, { shape: circle|square|triangle|diamond, color, fill, size })`, `pick({ message })` → `{ lat, lon, markId }` не `null`.
`style`: `color`, `weight`, `opacity`, `fillColor`, `fillOpacity`, `dashArray`, `radius`, `label` (атрибут атауы → қалқымалы жазба), `symbol`.
Шектер: ≤ 20 қабат, бір қабатта ≤ 20 000 нысан. Плагин тоқтағанда не өшірілгенде оның қабаттары алынады.

## Export API (`files.export`)

`saveFile({ suggestedName, data, filters?, title? })` → `{ saved, name, size }`. `data` — жол, `ArrayBuffer`, `Uint8Array` не нысан (JSON).
Орнын пайдаланушы таңдайды, плагин толық жолды білмейді. Шегі 100 МБ. Орындалатын және жүйелік түрлер (`.exe`, `.bat`, `.js`, `.lnk`, `.ps1`, …)
сақталмайды (`code: 'blocked'`). «Экспорт форматын тіркеу» — манифесттегі `contributes["zone.export"]`; «экспортқа дейін тексеру» —
`geometry.validate` + `attributes.validate` (NIPD үлгісін қараңыз).

## Files API (`files.import`, Mura GIS 2.4.2+)

`files.open({ multiple?, filters?, title? })` → `[{ name, size, data: Uint8Array }]` (бас тартса — `[]`). Файлды әр жолы
пайдаланушы «Ашу» терезесінде таңдайды; плагинге тек атауы мен мазмұны беріледі, толық жолы берілмейді.
Шектер: ≤ 10 файл, әрқайсысы ≤ 100 МБ, барлығы ≤ 200 МБ. SDK тестілеу құралында (`tools/run.mjs`) файлдар
fixture-дегі `files: ["жол", …]` тізімінен алынады; плагин өз файлдарын `<script src="lib/…">` арқылы қоса алады.

## UI Extension API

* `ui.notify(text, { type: 'info'|'error' })`, `ui.confirm(text) → boolean`.
* `ui.dialog({ title, width: 'normal'|'wide', body: [блоктар], buttons: [{ id, title, primary }] })` → `{ button, values }` (жабылса `button: null`).
* `ui.panel.open(spec)` → `panel` (`update(spec)`, `close()`, `onAction(fn)`, `onClose(fn)`) — бір плагинге ≤ 3 панель.
* Блоктар: `heading`, `text` (`tone`: info|warn|error|muted|ok), `list`, `table` (`columns`, `rows`), `code`,
  `field` (`key`, `kind`: string|text|number|boolean|select, `label`, `value`, `options`, `required`, `description`).
* Плагин баптаулары — манифесттегі `settings`; мәндері: `await mura.settings.get()`.
* Мәтіннің бәрі мәтін ретінде көрсетіледі (HTML емес); әр терезеде «Плагин: <атауы>» белгісі тұрады.

## Басқалары

* `mura.storage.get/set/remove/keys` — плагиннің жеке деректері (жоба файлынан бөлек, ≤ 5 МБ, рұқсат керек емес).
* `mura.i18n.t(key, vars, lang?)`, `mura.i18n.load(lang)`, `mura.i18n.ready()` — `locales/<тіл>.json`.
* `mura.log.info/warn/error` — «Баптаулар → Плагиндер → Журнал».
* `fetch('config/x.json')` — плагиннің өз файлдары (тек архивтегі, орнату кезінде хеші тіркелгендер).

## Шектеулер мен уақыт

* Плагин 15 с ішінде жүктелуі керек; іске қосылғаннан кейін «жүрек соғысы» 15 с жауапсыз қалса (шексіз цикл), процесі тоқтатылады.
* Бір команда ≤ 30 мин; бір уақытта ≤ 64 API шақыруы. Бір сеанста 3 рет құлаған плагин келесі іске қосылғанға дейін тоқтатылады.
* `alert`, `confirm`, `prompt`, `eval`, `new Function`, `window.open`, iframe, форма жіберу — жұмыс істемейді.
