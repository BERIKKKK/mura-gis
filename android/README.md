# Mura GIS Android

Тарихи-мәдени мұра объектілеріне арналған мобильді ГАЖ — жұмыс үстеліндегі [Mura GIS](../README.md) жобасының
ықшамдалған, **дербес** Android нұсқасы. Екі модуль: **Ескерткіштер** (оның ішінде **өзге нысандар**: елді мекен, қыстау, құдық т.б.)
және **Маршруттар**. Интернетсіз толық жұмыс істейді.

> Ағымдағы нұсқа: `2.0.0-alpha.1` (альфа). Өзгерістер — [CHANGELOG.md](CHANGELOG.md), архитектура — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
> тестілеу нәтижелері — [docs/TESTING.md](docs/TESTING.md).

Қорғау аймағы, ескерткіш жоспарын сызу, паспортизация және басқа мамандандырылған құралдар Android нұсқасына **кірмейді**.

## Жүктеу

Android жинақтары [Releases](https://github.com/BERIKKKK/mura-gis/releases) бетінде `android/v…` тегтерімен жарияланады
(альфа/бета — «Pre-release»). Жұмыс үстеліндегі нұсқаның «latest» релизіне әсер етпейді.
Әр коммиттің debug APK-сы — Actions → **Android** → артефакт `MuraGIS-Android-…-debug`.

Талаптар: Android 8.0 (API 26) және одан жоғары.

## Нұсқалау

| | Жұмыс үстелі | Android |
|---|---|---|
| Нұсқа көзі | `package.json` | `android/version.properties` (`versionName`, `versionCode`) |
| Тег | `v1.3.1` | `android/v1.0.0-alpha.1` |
| CI | `.github/workflows/release.yml` | `.github/workflows/android.yml` |
| Changelog | `build/release-notes.md` | `android/CHANGELOG.md` |

Негізгі жобадағы өзгерістер Android-қа автоматты көшірілмейді: ортақ анықтамалықтар мен белгілер (`app/src/main/assets/symbols`)
көшірме ретінде сақталған, жаңартуды әзірлеуші қолмен шешеді. Android жұмыс үстеліндегі файлдарды өзгертпейді.

### Жаңа нұсқа шығару
1. `android/version.properties` → `versionName` және `versionCode` (`MAJOR*10000+MINOR*100+PATCH`; альфа/бета — одан кіші).
2. `android/CHANGELOG.md` — жаңа бөлім `## [X.Y.Z…]`.
3. Құрылғыда тексеру (`docs/TESTING.md` тізімі).
4. `git tag android/vX.Y.Z && git push origin android/vX.Y.Z` — workflow қолтаңбалы APK жинап, релиз жариялайды.
   Релизді қолмен жасасаңыз — **міндетті түрде** `--prerelease --latest=false`:
   `gh release create android/vX.Y.Z MuraGIS-Android-X.Y.Z.apk --prerelease --latest=false …`.
   «Latest» белгісі әрқашан жұмыс үстелі релизінде (`v*`) тұруы керек: жұмыс үстеліндегі бағдарлама жаңартуды сол
   релиздің `latest.yml` файлынан іздейді; Android релизі «Latest» болса — «Жаңартуды тексеру мүмкін болмады» (404).
   Android қолданбасы өз жаңартуын `android/v*` тегтерінен табады, «Latest» белгісі оған қажет емес.

Қолтаңба құпиялары (бір рет): `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Жергілікті жинау үшін — `android/keystore.properties` (git-ке қосылмайды):
`storeFile=…`, `storePassword=…`, `keyAlias=…`, `keyPassword=…`.

## Әзірлеушілерге

```bash
cd android
./gradlew :core:test            # платформаға тәуелсіз логика (жұмыс үстелі кодымен кросс-тексеру — Node 22 керек)
./gradlew :core:largeFileTest   # үлкен карта файлдары (JVM жады 128 МБ)
./gradlew :app:assembleDebug    # APK (Android SDK керек)
./gradlew -PcoreOnly=true :core:test   # Android SDK жоқ ортада
```

## Офлайн карталар

«Карта қабаттары» панелі (төменгі панельдегі «Қабаттар»): **Аумақты жүктеу** — дайын аумақтың тегін карта пакеттері
(альфада: Ақтөбе облысы, Қобда ауданы — негізгі карта, топокарта, Sentinel‑2 спутниктік түсірілімі), **Картаны импорттау** —
MBTiles, ZIP, GeoPackage тайлдары. Карталар санаттарға бөлінген: негізгі, топо, спутник, тарихи, қолданушы карталары.
Пакеттер Android-тан тыс дайындалады — [tools/packager](tools/packager/README.md), каталогы — `app/src/main/assets/maps/catalog.json`,
файлдары — GitHub релизі `maps-kobda-2026-11-20`. Жүктеу үзілсе жалғасады; файл SHA‑256 және ашылуы бойынша тексеріледі.

## Деректер үйлесімділігі

- **Mura GIS жобасы (.gpkg)** — Android экспорттаған файлды жұмыс үстелі ашады және керісінше (тест: `DesktopCompatTest`).
- **GeoJSON** — жұмыс үстелі оқитын өрістер (`name`, `type_kk`, …) экспорт тілінде, ал екі тілдің мәндері — `name_kk`, `name_ru` …
- Жұмыс үстеліндегі жазбада бір ғана атау бар: импортта ол таңдалған тілдің өрісіне жазылады, екінші тілдің мәні өзгермейді.

## Лицензиялар

MapLibre Native — BSD-2-Clause; AndroidX, Kotlin, kotlinx — Apache 2.0. Ескерткіш белгілері — жұмыс үстеліндегі `src/marks/symbols`.
Карта деректерінің атрибуциясы картада көрсетіледі. Офлайн пакеттер: OpenStreetMap (ODbL 1.0, Geofabrik), Copernicus DEM GLO‑30,
Copernicus Sentinel‑2 (еркін лицензия), Noto Sans қаріптері (SIL OFL 1.1).
