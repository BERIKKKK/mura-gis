package io.github.berikkkk.muragis.mobile.map

import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.sources.TileSource
import org.json.JSONArray
import org.json.JSONObject

/** Картаға берілетін растр қабаты: онлайн дереккөз не жергілікті сервердегі офлайн файл. */
data class RasterSpec(val layer: MapLayer, val tiles: List<String>, val tms: Boolean, val minZoom: Int, val maxZoom: Int, val attribution: String, val opacity: Double)

/**
 * MapLibre стилі (JSON). Карта негізі (растр) мен деректер қабаттары (ескерткіштер, маршруттар, GPS) бір-бірінен тәуелсіз:
 * негізгі картаны ауыстырғанда деректер қабаттары сол күйі қалады. Растр негізде шрифт (glyphs) қажет емес — жазулар суретте;
 * векторлық офлайн пакетте қаріптер мен белгішелер пакеттің өзінен (жергілікті серверден) оқылады.
 */
object StyleBuilder {
    const val SRC_MON = "monuments"
    const val SRC_SEL = "selected"
    const val SRC_ROUTES = "routes"
    const val SRC_EDIT = "edit"
    const val SRC_EDIT_PTS = "edit-pts"
    const val SRC_LOC = "location"
    const val SRC_PLAN = "plan"
    const val SRC_PLAN_PTS = "plan-pts"
    const val SRC_TRACK = "track"
    const val SRC_PIN = "pin"
    const val LYR_PIN = "pin-dot"
    const val LYR_CLUSTER = "mon-cluster"
    const val LYR_MON = "mon-point"
    const val LYR_ROUTES = "routes-line"
    const val LYR_EDIT_PTS = "edit-vertex"

    private val EMPTY = JSONObject().put("type", "FeatureCollection").put("features", JSONArray())

    private fun geo(cluster: Boolean = false) = JSONObject().put("type", "geojson").put("data", EMPTY).apply {
        if (cluster) put("cluster", true).put("clusterRadius", 48).put("clusterMaxZoom", 13)
    }

    private fun raster(r: RasterSpec) = JSONObject().put("type", "raster").put("tileSize", 256)
        .put("tiles", JSONArray(r.tiles)).put("minzoom", r.minZoom).put("maxzoom", r.maxZoom)
        .put("attribution", r.attribution).apply {
            if (r.tms) put("scheme", "tms")
            r.layer.bounds?.let { b -> if (r.layer.isOffline) put("bounds", JSONArray(listOf(b.west, b.south, b.east, b.north))) }
        }

    private fun arr(vararg v: Any): JSONArray = JSONArray(v.toList())

    /**
     * [vectorBase] — офлайн векторлық пакеттің дайын стилі (сілтемелері жергілікті серверге ауыстырылған): оның көздері мен
     * қабаттары «pk-» белгісімен ең астына қойылады, қаріптер (glyphs) мен белгішелер (sprite) пакеттен оқылады.
     */
    fun build(base: RasterSpec?, overlays: List<RasterSpec>, cluster: Boolean, vectorBase: String? = null): String {
        val sources = JSONObject()
        val layers = JSONArray()
        val root = JSONObject().put("version", 8).put("name", "Mura GIS")
        val vb = vectorBase?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (vb != null) {
            vb.optString("glyphs").takeIf { it.isNotBlank() }?.let { root.put("glyphs", it) }
            vb.optString("sprite").takeIf { it.isNotBlank() }?.let { root.put("sprite", it) }
            val src = vb.optJSONObject("sources") ?: JSONObject()
            for (k in src.keys()) sources.put("pk-$k", src.getJSONObject(k))
            val ls = vb.optJSONArray("layers") ?: JSONArray()
            for (i in 0 until ls.length()) {
                val l = JSONObject(ls.getJSONObject(i).toString())
                l.put("id", "pk-" + l.getString("id"))
                l.optString("source").takeIf { it.isNotBlank() }?.let { l.put("source", "pk-$it") }
                layers.put(l)
            }
        } else layers.put(JSONObject().put("id", "bg").put("type", "background").put("paint", JSONObject().put("background-color", "#EFEBE3")))
        fun addRaster(id: String, r: RasterSpec) {
            sources.put(id, raster(r))
            layers.put(JSONObject().put("id", id).put("type", "raster").put("source", id)
                .put("paint", JSONObject().put("raster-opacity", r.opacity).put("raster-fade-duration", if (r.layer.isOffline) 0 else 150)))
        }
        if (vb == null) base?.let { addRaster("base", it) }
        overlays.forEach { addRaster("ov-" + it.layer.id, it) }

        sources.put(SRC_ROUTES, geo()).put(SRC_EDIT, geo()).put(SRC_EDIT_PTS, geo()).put(SRC_MON, geo(cluster)).put(SRC_SEL, geo()).put(SRC_LOC, geo())
            .put(SRC_PLAN, geo()).put(SRC_PLAN_PTS, geo()).put(SRC_TRACK, geo()).put(SRC_PIN, geo())

        // Маршруттар: түсі — көлік түрі бойынша; таңдалғаны қалыңырақ
        layers.put(JSONObject().put("id", "routes-casing").put("type", "line").put("source", SRC_ROUTES)
            .put("layout", JSONObject().put("line-join", "round").put("line-cap", "round"))
            .put("paint", JSONObject().put("line-color", "#FFFFFF").put("line-width", arr("case", arr("==", arr("get", "sel"), 1), 9, 6))))
        layers.put(JSONObject().put("id", LYR_ROUTES).put("type", "line").put("source", SRC_ROUTES)
            .put("layout", JSONObject().put("line-join", "round").put("line-cap", "round"))
            .put("paint", JSONObject()
                .put("line-color", arr("match", arr("get", "v"), "car", "#1E6FD9", "foot", "#2E8B3E", "#C2410C"))
                .put("line-width", arr("case", arr("==", arr("get", "sel"), 1), 6, 3.5))))
        // Өңделіп жатқан маршрут
        layers.put(JSONObject().put("id", "edit-line").put("type", "line").put("source", SRC_EDIT)
            .put("layout", JSONObject().put("line-join", "round").put("line-cap", "round"))
            .put("paint", JSONObject().put("line-color", "#D9480F").put("line-width", 4).put("line-dasharray", arr(2, 1))))
        layers.put(JSONObject().put("id", LYR_EDIT_PTS).put("type", "symbol").put("source", SRC_EDIT_PTS)
            .put("layout", JSONObject().put("icon-image", arr("get", "icon")).put("icon-allow-overlap", true).put("icon-ignore-placement", true)))

        // Есептелген маршрут (А → Б): желі бойынша — тұтас, желіден тыс бөліктер (off = 1) — үзік сызық
        val round = JSONObject().put("line-join", "round").put("line-cap", "round")
        layers.put(JSONObject().put("id", "plan-casing").put("type", "line").put("source", SRC_PLAN).put("layout", round)
            .put("paint", JSONObject().put("line-color", "#FFFFFF").put("line-width", 10)))
        layers.put(JSONObject().put("id", "plan-line").put("type", "line").put("source", SRC_PLAN).put("filter", arr("==", arr("get", "off"), 0)).put("layout", round)
            .put("paint", JSONObject().put("line-color", "#2251C9").put("line-width", 6)))
        layers.put(JSONObject().put("id", "plan-off").put("type", "line").put("source", SRC_PLAN).put("filter", arr("==", arr("get", "off"), 1))
            .put("paint", JSONObject().put("line-color", "#2251C9").put("line-width", 4).put("line-dasharray", arr(1.5, 1.2))))
        // Жазылып жатқан трек (нақты жүрілген жол)
        layers.put(JSONObject().put("id", "track-casing").put("type", "line").put("source", SRC_TRACK).put("layout", round)
            .put("paint", JSONObject().put("line-color", "#FFFFFF").put("line-width", 8)))
        layers.put(JSONObject().put("id", "track-line").put("type", "line").put("source", SRC_TRACK).put("layout", round)
            .put("paint", JSONObject().put("line-color", "#E2553B").put("line-width", 4.5)))

        // Ескерткіштер: кластерлер және жеке белгілер
        layers.put(JSONObject().put("id", LYR_CLUSTER).put("type", "symbol").put("source", SRC_MON).put("filter", arr("has", "point_count"))
            .put("layout", JSONObject().put("icon-allow-overlap", true).put("icon-ignore-placement", true)
                .put("icon-image", arr("case",
                    arr(">=", arr("get", "point_count"), 1000), "cl-1k",
                    arr(">=", arr("get", "point_count"), 100), "cl-100",
                    arr("concat", "cl-", arr("to-string", arr("get", "point_count")))))))
        layers.put(JSONObject().put("id", "mon-sel-halo").put("type", "circle").put("source", SRC_SEL)
            .put("paint", JSONObject().put("circle-radius", 22).put("circle-color", "#FFD43B").put("circle-opacity", 0.55)
                .put("circle-translate", arr(0, -18))))
        layers.put(JSONObject().put("id", LYR_MON).put("type", "symbol").put("source", SRC_MON).put("filter", arr("!", arr("has", "point_count")))
            .put("layout", JSONObject().put("icon-image", arr("get", "icon")).put("icon-anchor", "bottom")
                .put("icon-allow-overlap", true).put("icon-ignore-placement", true))
            .put("paint", JSONObject().put("icon-opacity", arr("case", arr("==", arr("get", "x"), 1), 0.55, 1.0))))

        // Қолмен енгізілген нүкте және маршруттың А/Б нүктелері
        layers.put(JSONObject().put("id", "pin-halo").put("type", "circle").put("source", SRC_PIN)
            .put("paint", JSONObject().put("circle-radius", 18).put("circle-color", "#D2AD74").put("circle-opacity", 0.35)))
        layers.put(JSONObject().put("id", LYR_PIN).put("type", "circle").put("source", SRC_PIN)
            .put("paint", JSONObject().put("circle-radius", 8).put("circle-color", "#23241F").put("circle-stroke-color", "#D2AD74").put("circle-stroke-width", 3.5)))
        layers.put(JSONObject().put("id", "plan-ends").put("type", "symbol").put("source", SRC_PLAN_PTS)
            .put("layout", JSONObject().put("icon-image", arr("get", "icon")).put("icon-allow-overlap", true).put("icon-ignore-placement", true)))

        // GPS: дәлдік шеңбері (метр → пиксель масштабқа қарай) және нүкте
        layers.put(JSONObject().put("id", "loc-acc").put("type", "circle").put("source", SRC_LOC)
            .put("paint", JSONObject()
                .put("circle-radius", arr("interpolate", arr("exponential", 2), arr("zoom"), 0, arr("*", arr("get", "r0"), 1), 24, arr("*", arr("get", "r0"), 16777216)))
                .put("circle-color", "#1E6FD9").put("circle-opacity", 0.15).put("circle-stroke-color", "#1E6FD9").put("circle-stroke-width", 1).put("circle-stroke-opacity", 0.4)))
        // Бағыт белгісіз — нүкте; белгілі болса (қозғалыс бағыты не компас) — бағытқа бұрылған үшбұрыш
        layers.put(JSONObject().put("id", "loc-dot").put("type", "circle").put("source", SRC_LOC).put("filter", arr("!", arr("has", "brg")))
            .put("paint", JSONObject().put("circle-radius", 7).put("circle-color", "#1E6FD9").put("circle-stroke-color", "#FFFFFF").put("circle-stroke-width", 2.5)))
        layers.put(JSONObject().put("id", "loc-arrow").put("type", "symbol").put("source", SRC_LOC).put("filter", arr("has", "brg"))
            .put("layout", JSONObject().put("icon-image", "loc-arrow").put("icon-rotate", arr("get", "brg")).put("icon-rotation-alignment", "map")
                .put("icon-allow-overlap", true).put("icon-ignore-placement", true)))

        return root.put("sources", sources).put("layers", layers).toString()
    }

    fun onlineSpec(layer: MapLayer, src: TileSource) = RasterSpec(layer, src.templates(), src.isTmsTemplate, src.minZoom, src.maxZoom, src.attribution, layer.opacity)

    fun offlineSpec(layer: MapLayer, template: String) = RasterSpec(layer, listOf(template), false, layer.minZoom, layer.maxZoom, layer.attribution, layer.opacity)
}
