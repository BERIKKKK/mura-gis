#!/usr/bin/env bash
# Қобда ауданының (Ақтөбе облысы) үш офлайн карта пакетін Android қолданбасынан тыс дайындау.
# Талаптар: JDK 21 (Planetiler үшін), Node.js 18+, curl. Жұмыс қалтасы: $WORK (әдепкі C:/mgis-build).
# Нәтиже: $WORK/dist/*.mbtiles және каталогқа жазылатын көлем/SHA-256 (соңында басылады).
set -euo pipefail

WORK=${WORK:-/c/mgis-build}
HERE=$(cd "$(dirname "$0")" && pwd)
JAVA=${JAVA:-java}
BOUNDS=54.364,49.426,56.301,51.041          # Қобда ауданы (OSM relation 3397458) шекарасының тіктөртбұрышы
OSM_DATE=2026-11-20                         # Geofabrik үзіндісінің күні (Last-Modified)
BASE_ID=kobda-base-2026-11-21                # негізгі пакет (жол графымен); граф өзгерсе — жаңа id
PKG="$HERE/build/install/packager/bin/packager"

mkdir -p "$WORK"/{src/dem,src/glyphs,out,dist,tmp}
cd "$WORK"

# 1. Дереккөздер ---------------------------------------------------------------------------------
# OpenStreetMap — Geofabrik (ODbL 1.0)
[ -f src/kazakhstan-latest.osm.pbf ] || curl -fL -o src/kazakhstan-latest.osm.pbf https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf
# Planetiler (Apache-2.0) — OSM → векторлық MBTiles
[ -f src/planetiler.jar ] || curl -fL -o src/planetiler.jar https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
# Copernicus DEM GLO-30 (AWS Open Data, тіркеусіз)
for la in 49 50 51; do for lo in 054 055 056; do
  n=Copernicus_DSM_COG_10_N${la}_00_E${lo}_00_DEM
  [ -f src/dem/$n.tif ] || curl -fL -o src/dem/$n.tif https://copernicus-dem-30m.s3.amazonaws.com/$n/$n.tif
done; done
# Noto Sans қаріптері (SIL OFL 1.1) — MapLibre glyph PBF
if [ ! -d "src/glyphs/Noto Sans Regular" ]; then
  curl -fL -o src/noto-sans.zip https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip
  (cd src/glyphs && unzip -q ../noto-sans.zip "Noto Sans Regular/*" "Noto Sans Bold/*" "Noto Sans Italic/*")
fi
# Sentinel-2 L2A сахналары (Element 84 Earth Search STAC, AWS Open Data): басымдық ретімен, 2025-07-10…20, бұлттылығы < 2 %.
# Файлдар толық жүктелмейді — құрал COG блоктарын HTTP Range арқылы оқиды (s2-cache қалтасында сақталады).
[ -f s2scenes.txt ] || cp "$HERE/maps/kobda-s2scenes.txt" s2scenes.txt

# 2. Құрал ---------------------------------------------------------------------------------------
(cd "$HERE/../.." && ./gradlew -q -PcoreOnly=true :packager:installDist)

# 3. Биіктік: горизонтальдар (10 м, әр 50 м — қалың) және жер бедерінің көлеңкесі (z6–12) ---------
"$PKG" dem --dem src/dem --bounds $BOUNDS --contours out/kobda-contours.geojson --hillshade out/kobda-hillshade.mbtiles \
  --interval 10 --index 50 --minzoom 6 --maxzoom 12

# 4. Векторлық тайлдар (Planetiler, schema.yml) ----------------------------------------------------
echo '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"ele":0,"idx":"0"},"geometry":{"type":"LineString","coordinates":[[0,0],[0.001,0.001]]}}]}' > out/empty.geojson
cp "$HERE/maps/schema.yml" schema.yml
for kind in base topo; do
  contours=out/empty.geojson; [ $kind = topo ] && contours=out/kobda-contours.geojson
  "$JAVA" -Xmx4g -jar src/planetiler.jar generate-custom --schema=schema.yml --osm_path=src/kazakhstan-latest.osm.pbf \
    --contours_path=$contours --bounds=$BOUNDS --output=out/kobda-$kind-vt.mbtiles --force --tmpdir=tmp
done

# 5. Sentinel-2 мозаикасы (z8–14, JPEG; шеттері — мөлдір PNG) -------------------------------------
"$PKG" s2 --scenes s2scenes.txt --cache s2-cache --bounds $BOUNDS --out out/kobda-s2.mbtiles --minzoom 8 --maxzoom 14 --gain 1.1 --quality 0.8 --threads 48

# 5а. Офлайн маршрутқа арналған жол графы (OSM highway=*) — негізгі пакетке қосылады ----------------
"$PKG" roads --pbf src/kazakhstan-latest.osm.pbf --bounds $BOUNDS --out out/kobda-roads.bin

# 6. Стильдер және пакеттер -----------------------------------------------------------------------
node "$HERE/maps/styles.mjs" out
"$PKG" assemble --in out/kobda-base-vt.mbtiles --out dist/mura-$BASE_ID.mbtiles --id $BASE_ID \
  --style out/style-base.json --glyphs src/glyphs --sprite --roads out/kobda-roads.bin \
  --meta "name=Қобда ауданы — негізгі карта" --meta "attribution=© OpenStreetMap contributors" \
  --meta "description=OpenStreetMap (Geofabrik, $OSM_DATE), ODbL 1.0; офлайн маршрутқа арналған жол графы"
"$PKG" assemble --in out/kobda-topo-vt.mbtiles --out dist/mura-kobda-topo-$OSM_DATE.mbtiles --id kobda-topo-$OSM_DATE \
  --style out/style-topo.json --glyphs src/glyphs --sprite --hillshade out/kobda-hillshade.mbtiles \
  --meta "name=Қобда ауданы — топокарта" --meta "attribution=© OpenStreetMap contributors · Copernicus DEM GLO-30" \
  --meta "description=OpenStreetMap (Geofabrik, $OSM_DATE) + Copernicus DEM GLO-30: горизонтальдар 10 м, жер бедерінің көлеңкесі"
"$PKG" assemble --in out/kobda-s2.mbtiles --out dist/mura-kobda-sentinel2-2025-07.mbtiles --id kobda-sentinel2-2025-07 \
  --meta "name=Қобда ауданы — Sentinel-2" --meta "attribution=Contains modified Copernicus Sentinel data 2025" \
  --meta "description=Sentinel-2 L2A табиғи түс (TCI), 10 м, 2025-07-10…2025-07-20" --meta "type=baselayer"

echo "Каталогқа (app/src/main/assets/maps/catalog.json) көлем мен SHA-256:"
for f in dist/*.mbtiles; do echo "$(basename "$f") $(stat -c %s "$f") $("$PKG" sha256 "$f" | head -1)"; done
