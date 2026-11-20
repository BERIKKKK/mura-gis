package io.github.berikkkk.muragis.core.io

import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Validation
import io.github.berikkkk.muragis.core.model.Vehicle
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

data class ImportedRoute(val route: Route, val langs: Set<Lang>, val hasId: Boolean)

/** Маршрут ұзындығы, метр. */
fun Route.lengthMeters(): Double = Geo.length(points.map { LatLon(it.lat, it.lon) })

/**
 * Маршруттарды оқу/жазу — жұмыс үстеліндегі src/routes/tracks.js-пен үйлесімді.
 * Оқу: GPX (trk/trkseg, rte), KML/KMZ (LineString, gx:Track), GeoJSON (LineString, MultiLineString; Mura экспорты болса — қасиеттерімен).
 * Тректер Дуглас–Пекер бойынша 3 м дәлдікпен жеңілдетіледі (жұмыс үстеліндегідей).
 * Жазу: GPX 1.1, GeoJSON (жұмыс үстелі оқитын қасиеттер + екі тілдің мәндері), KML.
 */
object RouteFormats {
    private fun ok(lat: Double, lon: Double) = Validation.validCoord(lat, lon)

    private fun clean(pts: List<LatLon>): List<LatLon> {
        val out = ArrayList<LatLon>()
        for (p in pts) if (ok(p.lat, p.lon) && !(out.isNotEmpty() && out.last() == p)) out.add(p)
        return if (out.size >= 2) Geo.simplify(out, 3.0) else emptyList()
    }

    private fun route(name: String, note: String, pts: List<LatLon>, lang: Lang) = ImportedRoute(
        Route(name = Localized.of(lang, name), note = Localized.of(lang, note), points = pts.map { RoutePoint(it.lat, it.lon) }),
        setOf(lang), false,
    )

    fun parseGpx(str: String, lang: Lang): List<ImportedRoute> {
        val doc = Xml.parse(str, "GPX")
        val out = ArrayList<ImportedRoute>()
        fun ptsOf(el: org.w3c.dom.Element, tag: String) = Xml.elements(el, tag).map {
            LatLon(it.getAttribute("lat").toDoubleOrNull() ?: Double.NaN, it.getAttribute("lon").toDoubleOrNull() ?: Double.NaN)
        }
        for (trk in Xml.elements(doc, "trk")) {
            val name = Xml.text(Xml.child(trk, "name"))
            val note = listOf(Xml.text(Xml.child(trk, "desc")), Xml.text(Xml.child(trk, "cmt"))).filter { it.isNotEmpty() }.joinToString("\n")
            val segs = Xml.elements(trk, "trkseg").map { clean(ptsOf(it, "trkpt")) }.filter { it.isNotEmpty() }
            segs.forEachIndexed { i, pts -> out += route(name.ifEmpty { "Track" } + if (segs.size > 1) " (${i + 1})" else "", note, pts, lang) }
        }
        for (rte in Xml.elements(doc, "rte")) {
            val pts = clean(ptsOf(rte, "rtept"))
            if (pts.isNotEmpty()) out += route(Xml.text(Xml.child(rte, "name")).ifEmpty { "Route" }, Xml.text(Xml.child(rte, "desc")), pts, lang)
        }
        return out
    }

    fun parseKml(str: String, lang: Lang): List<ImportedRoute> {
        val doc = Xml.parse(str, "KML")
        val out = ArrayList<ImportedRoute>()
        fun coords(s: String) = s.trim().split(Regex("\\s+")).mapNotNull { t ->
            val a = t.split(',').map { it.toDoubleOrNull() }
            if (a.size >= 2 && a[0] != null && a[1] != null) LatLon(a[1]!!, a[0]!!) else null
        }
        for (pm in Xml.elements(doc, "Placemark")) {
            val name = Xml.text(Xml.child(pm, "name"))
            val note = Xml.stripHtml(Xml.text(Xml.child(pm, "description"))).replace(Regex("\\s+"), " ").trim()
            val lines = ArrayList<List<LatLon>>()
            for (l in Xml.elements(pm, "LineString")) lines += clean(coords(Xml.text(Xml.child(l, "coordinates"))))
            for (tr in Xml.elements(pm, "Track")) {
                lines += clean(Xml.elements(tr, "coord").mapNotNull { c ->
                    val a = c.textContent.trim().split(Regex("\\s+")).map { it.toDoubleOrNull() }
                    if (a.size >= 2 && a[0] != null && a[1] != null) LatLon(a[1]!!, a[0]!!) else null
                })
            }
            val ls = lines.filter { it.isNotEmpty() }
            ls.forEachIndexed { i, pts -> out += route(name.ifEmpty { "Line" } + if (ls.size > 1) " (${i + 1})" else "", note, pts, lang) }
        }
        return out
    }

    fun parseKmz(bytes: ByteArray, lang: Lang): List<ImportedRoute> = Kmz.kmlTexts(bytes).flatMap { parseKml(it, lang) }

    fun parseGeoJson(str: String, lang: Lang): List<ImportedRoute> {
        val o = parseJson(str).obj() ?: throw FormatException("geojson")
        val feats: List<JsonObject> = when (o.str("type")) {
            "FeatureCollection" -> o["features"].arr()?.mapNotNull { it.obj() } ?: emptyList()
            "Feature" -> listOf(o)
            else -> listOf(JsonObject(mapOf("geometry" to o, "properties" to JsonObject(emptyMap()))))
        }
        val out = ArrayList<ImportedRoute>()
        for (f in feats) {
            val g = f["geometry"].obj() ?: continue
            val pr = f["properties"].obj() ?: JsonObject(emptyMap())
            val lines: List<JsonElement> = when (g.str("type")) {
                "LineString" -> listOf(g["coordinates"] ?: continue)
                "MultiLineString" -> g["coordinates"].arr()?.toList() ?: emptyList()
                else -> emptyList()
            }
            lines.forEachIndexed { i, c ->
                val pts = c.arr()?.mapNotNull { a ->
                    val x = a.arr()?.getOrNull(0).num(); val y = a.arr()?.getOrNull(1).num()
                    if (x != null && y != null && ok(y, x)) LatLon(y, x) else null
                } ?: emptyList()
                if (pts.size < 2) return@forEachIndexed
                out += fromProperties(pr, pts, lang, if (lines.size > 1) " (${i + 1})" else "")
            }
        }
        return out
    }

    private val TEXT = listOf("name" to "name", "from" to "a_name", "to" to "b_name", "note" to "note")

    /** GeoJSON қасиеттері → маршрут. Жұмыс үстелінің кілттері: mura_id, name, from, to, vehicle, season, checked, note, updated_at. */
    fun fromProperties(pr: JsonObject, pts: List<LatLon>, lang: Lang, suffix: String = ""): ImportedRoute {
        val hasKk = TEXT.any { pr.containsKey(it.first + "_kk") }
        val hasRu = TEXT.any { pr.containsKey(it.first + "_ru") }
        val langs = buildSet { if (hasKk) add(Lang.KK); if (hasRu) add(Lang.RU); if (isEmpty()) add(lang) }
        fun loc(key: String, alt: String): Localized =
            if (hasKk || hasRu) Localized(pr.str(key + "_kk") ?: "", pr.str(key + "_ru") ?: "")
            else Localized.of(lang, pr.pick(key, alt))
        val name = loc("name", "name").let { n -> if (suffix.isEmpty()) n else Localized(n.kk.takeIf { it.isNotEmpty() }?.plus(suffix) ?: "", n.ru.takeIf { it.isNotEmpty() }?.plus(suffix) ?: "") }
        val id = pr.pick("mura_id")
        val links = pr["point_monuments"].arr()?.mapNotNull { e ->
            val a = e.arr() ?: return@mapNotNull null
            val idx = a.getOrNull(0).num()?.toInt() ?: return@mapNotNull null
            val mid = (a.getOrNull(1) as? JsonPrimitive)?.content ?: return@mapNotNull null
            idx to mid
        }?.toMap() ?: emptyMap()
        val r = Route(
            id = if (Ids.isValid(id) && suffix.isEmpty()) id else Ids.newId(),
            name = if (name.isBlank()) Localized.of(lang, "Line$suffix") else name,
            aName = loc("from", "a_name"), bName = loc("to", "b_name"), note = loc("note", "note"),
            vehicle = Vehicle.of(pr.str("vehicle")), season = Season.of(pr.str("season")),
            checked = pr.pick("checked"),
            points = pts.mapIndexed { i, p -> RoutePoint(p.lat, p.lon, links[i]) },
            createdAt = pr.pick("created_at"), updatedAt = pr.pick("updated_at"),
        )
        return ImportedRoute(r, langs, Ids.isValid(id) && suffix.isEmpty())
    }

    private fun f7(v: Double) = String.format(Locale.ROOT, "%.7f", v)

    /** GPX 1.1: әр маршрут — trk; ескерткішке байланған нүктелер — wpt ретінде де. */
    fun toGpx(routes: List<Route>, lang: Lang, title: String, monuments: Map<String, Monument> = emptyMap()): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
            .append("<gpx version=\"1.1\" creator=\"Mura GIS Android\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n")
            .append("  <metadata><name>").append(Xml.esc(title)).append("</name><time>").append(Ids.now()).append("</time></metadata>\n")
        val seen = HashSet<String>()
        for (r in routes) for (p in r.points) {
            val m = p.monumentId?.let { monuments[it] } ?: continue
            if (!seen.add(m.id)) continue
            sb.append("  <wpt lat=\"").append(f7(m.lat)).append("\" lon=\"").append(f7(m.lon)).append("\"><name>")
                .append(Xml.esc(m.name.display(lang))).append("</name></wpt>\n")
        }
        for (r in routes) {
            sb.append("  <trk><name>").append(Xml.esc(r.name.display(lang))).append("</name>")
            val d = r.note.display(lang)
            if (d.isNotEmpty()) sb.append("<desc>").append(Xml.esc(d)).append("</desc>")
            sb.append("\n    <trkseg>\n")
            for (p in r.points) sb.append("      <trkpt lat=\"").append(f7(p.lat)).append("\" lon=\"").append(f7(p.lon)).append("\"/>\n")
            sb.append("    </trkseg>\n  </trk>\n")
        }
        sb.append("</gpx>\n")
        return sb.toString()
    }

    fun properties(r: Route, lang: Lang): JsonObject = buildJsonObject {
        runCatching { parseJson(r.extra).obj() }.getOrNull()?.forEach { (k, v) -> put(k, v) }
        put("mura_id", r.id)
        put("name", r.name.display(lang)); put("from", r.aName.display(lang)); put("to", r.bName.display(lang))
        put("vehicle", r.vehicle.code); put("season", r.season.code); put("checked", r.checked)
        put("note", r.note.display(lang))
        put("length_km", Math.round(r.lengthMeters() / 10) / 100.0)
        put("created_at", r.createdAt); put("updated_at", r.updatedAt)
        put("name_kk", r.name.kk); put("name_ru", r.name.ru)
        put("from_kk", r.aName.kk); put("from_ru", r.aName.ru)
        put("to_kk", r.bName.kk); put("to_ru", r.bName.ru)
        put("note_kk", r.note.kk); put("note_ru", r.note.ru)
        put("point_monuments", buildJsonArray {
            r.points.forEachIndexed { i, p -> if (p.monumentId != null) add(buildJsonArray { add(JsonPrimitive(i)); add(JsonPrimitive(p.monumentId)) }) }
        })
        put("data_lang", lang.code)
    }

    fun toGeoJson(routes: List<Route>, lang: Lang, title: String): String {
        val fc = buildJsonObject {
            put("type", "FeatureCollection"); put("name", title)
            put("features", buildJsonArray {
                for (r in routes) add(buildJsonObject {
                    put("type", "Feature")
                    put("properties", properties(r, lang))
                    put("geometry", buildJsonObject {
                        put("type", "LineString")
                        put("coordinates", buildJsonArray { for (p in r.points) add(buildJsonArray { add(JsonPrimitive(p.lon)); add(JsonPrimitive(p.lat)) }) })
                    })
                })
            })
        }
        return JSON_PRETTY.encodeToString(JsonElement.serializer(), fc)
    }

    fun toKml(routes: List<Route>, lang: Lang, title: String): String {
        val sb = StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>")
        sb.append(Xml.esc(title)).append("</name>\n")
        for (r in routes) {
            sb.append("<Placemark><name>").append(Xml.esc(r.name.display(lang))).append("</name>")
            val d = r.note.display(lang)
            if (d.isNotEmpty()) sb.append("<description>").append(Xml.esc(d)).append("</description>")
            sb.append("<LineString><tessellate>1</tessellate><coordinates>")
            sb.append(r.points.joinToString(" ") { String.format(Locale.ROOT, "%.7f,%.7f", it.lon, it.lat) })
            sb.append("</coordinates></LineString></Placemark>\n")
        }
        sb.append("</Document></kml>\n")
        return sb.toString()
    }
}
