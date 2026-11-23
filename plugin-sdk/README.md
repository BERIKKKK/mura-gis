# Mura GIS Plugin SDK

Mura GIS-ке **бастапқы кодын өзгертпей және жүктемей** плагин жазуға арналған жинақ. Плагин міндетті емес:
Mura GIS олардың ешқайсысынсыз толық жұмыс істейді, плагин өшірілсе не жойылса — бағдарлама жұмысын жалғастырады.

| Қалта | Мазмұны |
|---|---|
| `docs/API.md` | Plugin API 1 сипаттамасы: әдістер, рұқсаттар, кеңейту нүктелері, нұсқалау |
| `docs/SECURITY.md` | Қауіпсіздік моделі және плагин авторына талаптар |
| `types/mura-plugin.d.ts` | TypeScript типтері (`/// <reference path="…/mura-plugin.d.ts" />`) |
| `schema/manifest.schema.json` | `manifest.json` үшін JSON Schema (редактордағы көмек) |
| `template/` | Жаңа плагиннің шаблоны («⋯ Қосымша құралдар» мәзіріндегі әрекет) |
| `examples/nipd-exporter/` | Үлгі: NIPD GeoJSON Exporter («Қорғау аймағы → Экспорт»): НИПД үлгісі бойынша ескерткіш аумақтары, ортақ өрістер бір рет енгізіледі |
| `examples/decree-matcher/` | Үлгі: Атау сәйкестендіргіш (Mura GIS 2.4.4+, `files.import`, `mark.suggest`, `zone.suggest`): қаулыны (DOCX/PDF) талдап, белгі мен қорғау аймағының терезесінде ресми тізімнен ұсыныс береді; плагин өз файлдарын `<script src="lib/…">` арқылы қосады |
| `tools/validate.mjs` | Манифест валидаторы (Mura GIS орнату кезіндегі тексерістің өзі) |
| `tools/pack.mjs` | `.muraplug` архив жинақтаушы |
| `tools/run.mjs` | Жергілікті тестілеу: плагинді Mura GIS-сіз, жалған деректермен іске қосу |
| `lib/` | Валидатор, ZIP, геометрия, атрибуттар — бағдарлама да осыны қолданады |

Тек Node.js 18+ керек; сыртқы тәуелділік жоқ. SDK-ны бағдарламаның өзінен де алуға болады:
**Баптаулар → Плагиндер → Әзірлеушілерге → Plugin SDK-ны қалтаға сақтау…**

## 5 минутта плагин

```sh
cp -r template my-plugin            # 1. шаблон
# 2. my-plugin/manifest.json: id (бірегей, кері домен — kz.менің-атым.плагин), name, author, permissions
# 3. my-plugin/main.js: mura.commands.register('hello', async ctx => { … })
node tools/validate.mjs my-plugin --app 2.2.0     # 4. тексеру
node tools/run.mjs my-plugin hello                # 5. жергілікті іске қосу (tools/fixture.json деректерімен)
node tools/pack.mjs my-plugin                     # 6. my-plugin/dist/<id>-<нұсқа>.muraplug
```

Mura GIS-те: **Баптаулар → Плагиндер → Плагин орнату → Файлдан орнату → Құрылғыдан файл таңдау…** — тексеру нәтижесі, рұқсаттар,
жауапкершілік ескертуі көрсетіледі; растағаннан кейін плагин орнатылады және өз әрекетін мәзірге қосады.

## Плагин қалай жұмыс істейді

```
my-plugin.muraplug  (ZIP)
├── manifest.json      міндетті: id, name, version, apiVersion, minAppVersion, author, entry
├── main.js            entry — классикалық скрипт (ES2022), жалғыз жаһандық нысан: mura
├── permissions.json   міндетті емес: { "рұқсат": "не үшін керек" } — орнату терезесінде көрсетіледі
├── assets/icon.svg    міндетті емес (manifest.icon)
├── locales/kk.json    міндетті емес: mura.i18n.t('кілт')
├── locales/ru.json
├── config/…           кез келген өз деректеріңіз: fetch('config/schema.json')
└── README.md
```

* Интерфейс элементтері **манифесттен** алынады (`contributes`): плагин коды бағдарлама іске қосылғанда орындалмайды,
  тек пайдаланушы оның әрекетін таңдағанда жеке оқшауланған процесте іске қосылады.
* Плагин тек **кеңейту нүктелеріне** әрекет қоса алады: `zone.export` (Қорғау аймағы → Нәтиже және экспорт),
  `tools.menu` (⋯ Қосымша құралдар). Басты навигацияны, атауларды, негізгі құралдарды өзгерту мүмкін емес.
* Деректерге қатынау — тек `mura.*` API арқылы және тек пайдаланушы берген рұқсаттармен. API 1-де жоба деректері **тек оқылады**.
* Экспорт — `mura.export.saveFile()`: файлдың орнын әр жолы пайдаланушы «Сақтау» терезесінде таңдайды.
* Интерфейс — сипаттама (JSON) арқылы: `mura.ui.dialog()`, `mura.ui.panel.open()`. Плагин бағдарлама бетіне HTML қоя алмайды.

## Мысал: экспорт әрекеті

```js
// manifest.json → "permissions": ["geometry.read", "attributes.read", "files.export"],
//                 "contributes": { "zone.export": [{ "command": "export", "title": "Менің форматым" }] }
mura.commands.register('export', async (ctx) => {
  const sel = await mura.geometry.selection();          // ескерткіш аумағының полигоны (қорғау аймақтарынсыз)
  const at = await mura.attributes.selection();          // аймақ атрибуттары + mark_id
  const mark = at.attributes.mark_id ? await mura.attributes.get('marks', at.attributes.mark_id) : null;
  const check = mura.geometry.validate(sel.geometry);
  if (!check.ok) return mura.ui.dialog({ title: 'Қате', body: [{ type: 'list', items: check.errors }] });
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: sel.geometry,
    properties: { name: mark ? mark.attributes.name : at.attributes.name, area_ha: mura.geometry.area(sel.geometry) / 1e4 } }] };
  return mura.export.saveFile({ suggestedName: 'export.geojson', data: JSON.stringify(fc), filters: [{ name: 'GeoJSON', extensions: ['geojson'] }] });
});
```

## Мәртебе

Файлдан орнатылған плагин «Тәуелсіз әзірлеуші» мәртебесімен көрсетіледі. «Mura GIS әзірлеушісі» мәртебесі — тек бағдарламамен
бірге келетін ұсынылған плагиндерде (қазір: NIPD GeoJSON Exporter, Атау сәйкестендіргіш); оны манифест арқылы алу мүмкін емес.

## Жариялау және лицензия

Плагинді өз GitHub репозиторийіңізде жариялай аласыз (`.muraplug` — релиздің файлы). Mura GIS плагиндердің авторлық
құқығын иеленбейді: лицензияны (`manifest.license`) әр әзірлеуші өзі белгілейді. Плагиннің функционалдығы мен
есептеулерінің дұрыстығына — әсіресе нормативтік есептеулерге (мыс. су қорғау аймақтары) — плагин авторы жауап береді.

Онлайн дүкен, автоматты жаңарту, ақылы плагиндер, плагиндер арасындағы тәуелділіктер — кейінгі кезеңдерде.
