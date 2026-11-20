package io.github.berikkkk.muragis.core.io

import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Sorting
import io.github.berikkkk.muragis.core.model.Status
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

/** Импортталған ескерткіш: файлда қай тілдегі мәтіндер болғаны ([langs]) — тек солар жергілікті жазбаға жазылады. */
data class ImportedMonument(val monument: Monument, val langs: Set<Lang>, val hasId: Boolean)

/** Сыртқы файлдан (KML, KMZ, GPX, бөтен GeoJSON) алынған нүкте — ескерткішке айналдыру үшін алдын ала қарау. */
data class PointRecord(val name: String, val desc: String, val lat: Double, val lon: Double, val folder: String = "", val file: String = "")

/** Ескерткіштердің локализацияланатын мәтіндік өрістері (GeoJSON/GPKG кілттері жұмыс үстеліндегідей). */
internal val MONUMENT_TEXT_FIELDS: List<Pair<String, (Monument) -> Localized>> = listOf(
    "name" to { m -> m.name }, "period" to { m -> m.period }, "oblast" to { m -> m.oblast },
    "district" to { m -> m.district }, "place" to { m -> m.place }, "note" to { m -> m.note },
)

/**
 * Ескерткіштердің GeoJSON экспорты/импорты — жұмыс үстеліндегі src/marks/export.js (geojson, fromGeojson) пішімімен үйлесімді.
 * Экспортта name, period… — таңдалған тілде (жұмыс үстелі оқитын өрістер), ал name_kk / name_ru… — екі тілдің мәні бөлек
 * (Android-қа қайта импорттағанда екі тіл де қалпына келеді).
 */
object MonumentGeoJson {
    fun export(list: List<Monument>, lang: Lang, title: String = "eskertkishter"): String {
        val fc = buildJsonObject {
            put("type", "FeatureCollection")
            put("name", title)
            put("features", buildJsonArray {
                for (m in Sorting.sortMonuments(list, lang)) add(feature(m, lang))
            })
        }
        return JSON_PRETTY.encodeToString(JsonElement.serializer(), fc)
    }

    private fun r8(v: Double) = Math.round(v * 1e8) / 1e8

    private fun feature(m: Monument, lang: Lang): JsonObject = buildJsonObject {
        put("type", "Feature")
        put("id", m.id)
        put("geometry", buildJsonObject {
            put("type", "Point")
            put("coordinates", buildJsonArray { add(JsonPrimitive(r8(m.lon))); add(JsonPrimitive(r8(m.lat))) })
        })
        put("properties", properties(m, lang))
    }

    /** Жұмыс үстелі күтетін қасиеттер + екі тілдің бөлек мәндері. */
    fun properties(m: Monument, lang: Lang): JsonObject = buildJsonObject {
        val extra = runCatching { parseJson(m.extra).obj() }.getOrNull()
        extra?.forEach { (k, v) -> put(k, v) }
        put("id", m.id)
        for ((k, f) in MONUMENT_TEXT_FIELDS) put(k, f(m).display(lang))
        put("type", m.type.code); put("type_kk", m.type.kk); put("type_ru", m.type.ru)
        put("category", m.category.code); put("category_kk", m.category.kk); put("category_ru", m.category.ru)
        put("status", m.status.code); put("status_kk", m.status.kk); put("status_ru", m.status.ru)
        put("lat", m.lat); put("lon", m.lon)
        put("lat_dms", Coords.dmsLat(m.lat)); put("lon_dms", Coords.dmsLon(m.lon))
        put("created_at", m.createdAt); put("updated_at", m.updatedAt)
        for ((k, f) in MONUMENT_TEXT_FIELDS) { put(k + "_kk", f(m).kk); put(k + "_ru", f(m).ru) }
        put("data_lang", lang.code)
    }

    /** Mura GIS-тің өз экспорты ма (әр нүктеде 16 таңбалы id, type_kk, status_kk) — жұмыс үстеліндегі isMuraMarks. */
    fun isMura(root: JsonElement): Boolean {
        val feats = root.obj()?.takeIf { it.str("type") == "FeatureCollection" }?.get("features").arr() ?: return false
        return feats.isNotEmpty() && feats.all {
            val p = it.obj()?.get("properties").obj()
            Ids.isValid(p.str("id")) && p?.containsKey("type_kk") == true && p.containsKey("status_kk")
        }
    }

    /** Mura GIS GeoJSON → ескерткіштер. [importLang] — тек бір тілдік мәні бар файлдағы мәтіндердің тілі. */
    fun parse(text: String, importLang: Lang): List<ImportedMonument> = parse(parseJson(text), importLang)

    fun parse(root: JsonElement, importLang: Lang): List<ImportedMonument> {
        val o = root.obj()
        val feats = when (o?.str("type")) {
            "FeatureCollection" -> o["features"].arr()?.toList() ?: emptyList()
            "Feature" -> listOf(o)
            else -> throw FormatException("geojson")
        }
        val out = ArrayList<ImportedMonument>()
        for (f in feats) {
            val g = f.obj()?.get("geometry").obj() ?: continue
            if (g.str("type") != "Point") continue
            val c = g["coordinates"].arr() ?: continue
            val lon = c.getOrNull(0).num() ?: continue
            val lat = c.getOrNull(1).num() ?: continue
            val p = f.obj()?.get("properties").obj() ?: JsonObject(emptyMap())
            out += fromProperties(p, lat, lon, importLang, f.obj()?.str("id"))
        }
        return out
    }

    /** Бір жазбаның қасиеттері (GeoJSON properties не GPKG props) → ескерткіш. */
    fun fromProperties(p: JsonObject, lat: Double, lon: Double, importLang: Lang, featureId: String? = null): ImportedMonument {
        val hasKk = MONUMENT_TEXT_FIELDS.any { p.containsKey(it.first + "_kk") }
        val hasRu = MONUMENT_TEXT_FIELDS.any { p.containsKey(it.first + "_ru") }
        // Жұмыс үстелі (1.3.2+) экспорты: name, period… — қазақша, name_ru… — орысша (_kk өрістері жоқ).
        // Орысша мәтін тек толтырылған болса ғана есептеледі — бос _ru жергілікті орысша мәтінді өшірмеуі керек.
        val desktopBi = !hasKk && hasRu
        val ruFilled = MONUMENT_TEXT_FIELDS.any { !p.str(it.first + "_ru").isNullOrBlank() }
        val langs = buildSet {
            if (desktopBi) { add(Lang.KK); if (ruFilled) add(Lang.RU) }
            else { if (hasKk) add(Lang.KK); if (hasRu) add(Lang.RU) }
            if (isEmpty()) add(importLang)
        }
        fun loc(key: String, vararg alt: String): Localized {
            if (desktopBi) return Localized(p.pick(key, *alt).trim(), p.str(key + "_ru")?.trim() ?: "")
            if (hasKk || hasRu) return Localized(p.str(key + "_kk")?.trim() ?: "", p.str(key + "_ru")?.trim() ?: "")
            return Localized.of(importLang, p.pick(key, *alt))
        }
        val id = p.pick("id").ifEmpty { featureId ?: "" }
        val known = setOf("id", "type", "type_kk", "type_ru", "category", "category_kk", "category_ru", "status", "status_kk", "status_ru",
            "lat", "lon", "lat_dms", "lon_dms", "created_at", "updated_at", "created_by", "updated_by", "data_lang") +
            MONUMENT_TEXT_FIELDS.flatMap { listOf(it.first, it.first + "_kk", it.first + "_ru") }
        val extra = JsonObject(p.filterKeys { it !in known })
        val type = MonumentType.entries.firstOrNull { it.code == p.str("type") } ?: MonumentType.byLabel(p.str("type_kk")) ?: MonumentType.ARCHEO
        val category = Category.entries.firstOrNull { it.code == (p.str("category") ?: "\u0000") } ?: Category.byLabel(p.str("category_kk")) ?: Category.NONE
        val status = Status.entries.firstOrNull { it.code == p.str("status") } ?: Status.byLabel(p.str("status_kk")) ?: Status.STATE
        val m = Monument(
            id = if (Ids.isValid(id)) id else Ids.newId(),
            lat = lat, lon = lon,
            name = loc("name", "Name", "NAME", "атауы", "title"),
            period = loc("period", "мерзімі"),
            oblast = loc("oblast", "облыс"),
            district = loc("district", "аудан"),
            place = loc("place", "орналасқан жері", "description"),
            note = loc("note"),
            type = type, category = category, status = status,
            createdAt = p.pick("created_at"), createdBy = p.pick("created_by"),
            updatedAt = p.pick("updated_at"), updatedBy = p.pick("updated_by"),
            extra = if (extra.isEmpty()) "" else JSON.encodeToString(JsonElement.serializer(), extra),
        )
        return ImportedMonument(m, langs, Ids.isValid(id))
    }

    /** KML (Google Earth т.б.) — тек көрсету/алмасу үшін. */
    fun exportKml(list: List<Monument>, lang: Lang, title: String): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>")
            .append(Xml.esc(title)).append("</name>\n")
        for (m in Sorting.sortMonuments(list, lang)) {
            sb.append("<Placemark><name>").append(Xml.esc(m.name.display(lang))).append("</name>")
            val desc = listOf(m.period.display(lang), m.type.label(lang), m.category.label(lang), m.place.display(lang), m.note.display(lang)).filter { it.isNotBlank() }
            if (desc.isNotEmpty()) sb.append("<description>").append(Xml.esc(desc.joinToString("\n"))).append("</description>")
            sb.append("<ExtendedData><Data name=\"mura_id\"><value>").append(m.id).append("</value></Data></ExtendedData>")
            sb.append("<Point><coordinates>").append(String.format(Locale.ROOT, "%.8f,%.8f", m.lon, m.lat)).append("</coordinates></Point></Placemark>\n")
        }
        sb.append("</Document></kml>\n")
        return sb.toString()
    }
}

/** KML, KMZ, GPX, бөтен GeoJSON → нүктелер (жұмыс үстеліндегі src/marks/geofiles.js). */
object PointFiles {
    private fun coords(s: String): List<Pair<Double, Double>> = s.trim().split(Regex("\\s+")).mapNotNull { t ->
        val a = t.split(',').map { it.toDoubleOrNull() }
        if (a.size >= 2 && a[0] != null && a[1] != null) a[1]!! to a[0]!! else null
    }

    private fun centroid(p: List<Pair<Double, Double>>) = p.sumOf { it.first } / p.size to p.sumOf { it.second } / p.size

    fun parseKml(str: String, file: String = ""): List<PointRecord> {
        val doc = Xml.parse(str, "KML")
        val out = ArrayList<PointRecord>()
        for (pm in Xml.elements(doc, "Placemark")) {
            var folder = ""
            var p = pm.parentNode
            while (p != null && p is org.w3c.dom.Element) {
                val ln = Xml.local(p)
                if (ln == "Folder" || ln == "Document") { val n = Xml.text(Xml.child(p, "name")); if (n.isNotEmpty()) { folder = n; break } }
                p = p.parentNode
            }
            val name = Xml.text(Xml.child(pm, "name"))
            var desc = Xml.stripHtml(Xml.text(Xml.child(pm, "description")))
            val ext = Xml.elements(pm, "Data").mapNotNull { d ->
                val v = Xml.text(Xml.child(d, "value")); val n = d.getAttribute("name") ?: ""
                if (v.isNotEmpty()) (if (n.isNotEmpty()) "$n: " else "") + v else null
            } + Xml.elements(pm, "SimpleData").mapNotNull { d ->
                val v = d.textContent.trim(); if (v.isNotEmpty()) (d.getAttribute("name") ?: "") + ": " + v else null
            }
            if (ext.isNotEmpty()) desc = (if (desc.isNotEmpty()) desc + "\n" else "") + ext.joinToString("\n")
            val points = Xml.elements(pm, "Point").mapNotNull { coords(Xml.text(Xml.child(it, "coordinates"))).firstOrNull() }
            if (points.isNotEmpty()) {
                points.forEachIndexed { i, q -> out += PointRecord(name + if (points.size > 1) " (${i + 1})" else "", desc, q.first, q.second, folder, file) }
                continue
            }
            val shape = Xml.elements(pm, "coordinates").map { coords(it.textContent) }.firstOrNull { it.isNotEmpty() }
            if (shape != null) {
                val c = centroid(shape)
                out += PointRecord(name, desc, c.first, c.second, folder, file)
            }
        }
        return out
    }

    fun parseKmz(bytes: ByteArray, file: String = ""): List<PointRecord> = Kmz.kmlTexts(bytes).flatMap { parseKml(it, file) }

    fun parseGpx(str: String, file: String = ""): List<PointRecord> {
        val doc = Xml.parse(str, "GPX")
        var pts = Xml.elements(doc, "wpt")
        if (pts.isEmpty()) pts = Xml.elements(doc, "rtept")
        val md = Xml.elements(doc, "metadata").firstOrNull()
        val folder = Xml.text(Xml.child(md, "name"))
        return pts.mapIndexedNotNull { i, p ->
            val lat = p.getAttribute("lat").toDoubleOrNull(); val lon = p.getAttribute("lon").toDoubleOrNull()
            if (lat == null || lon == null) return@mapIndexedNotNull null
            val desc = listOf(Xml.text(Xml.child(p, "desc")), Xml.text(Xml.child(p, "cmt"))).filter { it.isNotEmpty() }.distinct().joinToString("\n") { Xml.stripHtml(it) }
            PointRecord(Xml.text(Xml.child(p, "name")).ifEmpty { "#${i + 1}" }, desc, lat, lon, folder, file)
        }
    }

    private val NAME_KEYS = listOf("name", "Name", "NAME", "атауы", "Атауы", "атау", "название", "Название", "наименование", "Наименование", "title", "Title", "label")

    fun parseGeoJson(root: JsonElement, file: String = ""): List<PointRecord> {
        val o = root.obj()
        val feats = when (o?.str("type")) {
            "FeatureCollection" -> o["features"].arr()?.toList() ?: emptyList()
            "Feature" -> listOf(o)
            else -> emptyList()
        }
        val out = ArrayList<PointRecord>()
        feats.forEachIndexed { i, f ->
            val g = f.obj()?.get("geometry").obj() ?: return@forEachIndexed
            val p = f.obj()?.get("properties").obj() ?: JsonObject(emptyMap())
            val nk = NAME_KEYS.firstOrNull { !p.str(it).isNullOrBlank() }
            val name = nk?.let { p.str(it)!!.trim() } ?: "#${i + 1}"
            val rest = p.entries.filter { it.key != nk && it.value is JsonPrimitive && !p.str(it.key).isNullOrBlank() }.map { it.key + ": " + p.str(it.key)!!.trim() }
            fun ll(e: JsonElement?): Pair<Double, Double>? { val a = e.arr() ?: return null; val x = a.getOrNull(0).num(); val y = a.getOrNull(1).num(); return if (x != null && y != null) y to x else null }
            val c = g["coordinates"]
            val pts: List<Pair<Double, Double>> = when (g.str("type")) {
                "Point" -> listOfNotNull(ll(c))
                "MultiPoint" -> c.arr()?.mapNotNull { ll(it) } ?: emptyList()
                "LineString" -> c.arr()?.mapNotNull { ll(it) }?.takeIf { it.isNotEmpty() }?.let { listOf(centroid(it)) } ?: emptyList()
                "Polygon" -> c.arr()?.getOrNull(0).arr()?.mapNotNull { ll(it) }?.takeIf { it.isNotEmpty() }?.let { listOf(centroid(it)) } ?: emptyList()
                "MultiPolygon" -> c.arr()?.getOrNull(0).arr()?.getOrNull(0).arr()?.mapNotNull { ll(it) }?.takeIf { it.isNotEmpty() }?.let { listOf(centroid(it)) } ?: emptyList()
                else -> emptyList()
            }
            for (q in pts) out += PointRecord(name, rest.joinToString("\n"), q.first, q.second, o?.str("name") ?: "", file)
        }
        return out
    }
}

internal object Kmz {
    /** KMZ (ZIP) ішіндегі .kml файлдарының мәтіндері (doc.kml — бірінші). Бүкіл архив жадқа оқылмайды — тек KML жазбалары. */
    fun kmlTexts(bytes: ByteArray): List<String> = kmlTexts(bytes.inputStream())

    fun kmlTexts(input: java.io.InputStream): List<String> {
        val out = ArrayList<Pair<String, String>>()
        try {
            java.util.zip.ZipInputStream(input).use { z ->
                while (true) {
                    val e = z.nextEntry ?: break
                    if (!e.isDirectory && e.name.endsWith(".kml", ignoreCase = true)) out += e.name to z.readBytes().toString(Charsets.UTF_8)
                }
            }
        } catch (e: Exception) {
            throw FormatException("kmz", "KMZ is not a ZIP archive")
        }
        if (out.isEmpty()) throw FormatException("kmz_no_kml", "No KML inside KMZ")
        return out.sortedByDescending { Regex("(^|/)doc\\.kml$", RegexOption.IGNORE_CASE).containsMatchIn(it.first) }.map { it.second }
    }
}
