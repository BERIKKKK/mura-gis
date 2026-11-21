# Офлайн карта пакеттерін дайындау (`:packager`)

Android қолданбасынан тыс жұмыс істейтін JVM құралы. Қолданба ішінен тегін жүктелетін карта пакеттерін дайындайды.
Толық реті — [`build-kobda.sh`](build-kobda.sh) (Қобда ауданы, Ақтөбе облысы).

## Пакет пішімі

Бір файл — стандартты **MBTiles** (SQLite), карта қозғалтқышы (MapLibre Native) оны құрылғыдағы жергілікті сервер
(`core/server/LocalTileServer`) арқылы интернетсіз оқиды. Қосымша кестелер (басқа MBTiles оқырмандары оларды елемейді):

| Кесте | Мазмұны |
|---|---|
| `tiles` | Негізгі тайлдар: векторлық (pbf, gzip) не растр (JPEG; шеттегі тайлдар — мөлдір PNG) |
| `mura_resources(name, data)` | `style.json`, қаріптер `glyphs/<fontstack>/<range>.pbf`, белгішелер `sprite.json/png`, `sprite@2x.json/png` |
| `mura_tiles(tileset, z, x, y, data)` | Қосымша растр жиындары (топокартада — `hillshade`, жер бедерінің көлеңкесі) |
| `metadata` | MBTiles өрістері + `mura:package` (пакет id) |

Стильдегі сілтемелер `mura://tiles/…`, `mura://set/<жиын>/…`, `mura://glyphs/…`, `mura://sprite` құрылғыда жергілікті
сервер мекенжайына ауыстырылады (`core/packages/MapPackage.resolveStyle`). Жазулар `name_kk` / `name_ru` өрістерінен —
интерфейс тіліне қарай.

Неге векторлық MBTiles: MapLibre Native векторлық тайл, стиль, қаріп пен белгішені өзі салады, ал MBTiles-ті қолданба
бұрыннан оқиды (импорт, жүктеу) — бір файл жүктеледі, SHA‑256 тексеріледі, бөлшектеп ашудың қажеті жоқ.

## Пакеттер және дереккөздер

| Пакет | Дереккөз | Лицензия / шарттар |
|---|---|---|
| Негізгі карта (вектор, z4–14) | OpenStreetMap — [Geofabrik](https://download.geofabrik.de/asia/kazakhstan.html) үзіндісі | ODbL 1.0, «© OpenStreetMap contributors» |
| Топокарта (вектор + көлеңке) | OSM (Geofabrik) + [Copernicus DEM GLO‑30](https://registry.opendata.aws/copernicus-dem/) — горизонтальдар 10 м, көлеңке z6–12 | ODbL 1.0; Copernicus DEM — еркін лицензия, авторлық белгі: © DLR e.V. 2010–2014, © Airbus DS 2014–2018, ESA/EU |
| Спутник (растр, z8–14, 10 м/пикс.) | Copernicus Sentinel‑2 L2A, TCI (табиғи түс) — [Earth Search](https://earth-search.aws.element84.com/v1) | Copernicus Sentinel деректерінің еркін лицензиясы, «Contains modified Copernicus Sentinel data 2025» |

Қаріптер: Noto Sans ([openmaptiles/fonts](https://github.com/openmaptiles/fonts), SIL OFL 1.1). Белгішелерді құрал өзі
салады (`Sprite.kt`). Онлайн тайл серверлерінен (tile.openstreetmap.org, Esri, OpenTopoMap т.б.) жаппай жүктеу
**қолданылмайды** — олардың шарттары тыйым салады; OSM картасы тек Geofabrik деректерінен құрастырылады.

## Командалар

```
packager dem       --dem <қалта> --bounds w,s,e,n --contours out.geojson --hillshade out.mbtiles [--interval 10 --index 50]
packager s2        --scenes <тізім> --bounds w,s,e,n --out out.mbtiles [--cache s2-cache --minzoom 8 --maxzoom 14 --gain 1.1]
packager assemble  --in tiles.mbtiles --out пакет.mbtiles --id <id> [--style style.json --glyphs <қалта> --sprite --hillshade hs.mbtiles --meta k=v]
packager sha256    <файл>
```

* `dem` — Copernicus DEM тайлдарынан тор, горизонтальдар (marching squares, Дуглас–Пекер), Horn көлеңкесі.
* `s2` — Sentinel‑2 COG файлдарын HTTP Range арқылы блоктап оқиды (бүкіл сахна жүктелмейді), UTM → Web Mercator,
  басымдық ретімен мозаика; төменгі масштабтар 2×2 орташалаумен.
* Векторлық тайлдар — [Planetiler](https://github.com/onthegomap/planetiler) v0.10.2, схемасы [`maps/schema.yml`](maps/schema.yml);
  стильдер — [`maps/styles.mjs`](maps/styles.mjs).

Жаңа пакеттен кейін `app/src/main/assets/maps/catalog.json` ішіндегі `size` пен `sha256` жаңартылады; файлдар
GitHub релизіне (`maps-<аумақ>-<күн>`) жүктеледі.
