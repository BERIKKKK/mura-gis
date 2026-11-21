package io.github.berikkkk.muragis.core.io

import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Place
import io.github.berikkkk.muragis.core.model.PlaceKind
import io.github.berikkkk.muragis.core.model.Sorting
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

/** Импортталған өзге нысан: файлда қай тілдегі атау болғаны ([langs]) — тек сол тіл жергілікті жазбаға жазылады. */
data class ImportedPlace(val place: Place, val langs: Set<Lang>, val hasId: Boolean)

/**
 * Өзге нысандардың GeoJSON экспорты/импорты — жұмыс үстеліндегі src/marks/places.js пішімімен бірдей:
 * properties: id, name (қазақша), name_ru, kind, kind_kk, kind_ru, lat, lon, created_*, updated_*, mura_layer = "places".
 * Android қосымша name_kk береді (екі тіл бөлек — қайта импорттағанда екеуі де қалпына келеді).
 */
object PlaceGeoJson {
    const val LAYER = "places"

    fun export(list: List<Place>, lang: Lang, title: String = "ozge-nysandar"): String {
        val fc = buildJsonObject {
            put("type", "FeatureCollection")
            put("name", title)
            put("features", buildJsonArray {
                for (p in Sorting.sortPlaces(list, lang)) add(buildJsonObject {
                    put("type", "Feature")
                    put("id", p.id)
                    put("geometry", buildJsonObject {
                        put("type", "Point")
                        put("coordinates", buildJsonArray { add(JsonPrimitive(r8(p.lon))); add(JsonPrimitive(r8(p.lat))) })
                    })
                    put("properties", properties(p))
                })
            })
        }
        return JSON_PRETTY.encodeToString(JsonElement.serializer(), fc)
    }

    private fun r8(v: Double) = Math.round(v * 1e8) / 1e8

    /** Жұмыс үстеліндегі жазба өрістері + name_kk (GeoJSON және GPKG props үшін бірдей). */
    fun properties(p: Place): JsonObject = buildJsonObject {
        val extra = runCatching { parseJson(p.extra).obj() }.getOrNull()
        extra?.forEach { (k, v) -> put(k, v) }
        put("id", p.id)
        put("name", p.name.kk); put("name_kk", p.name.kk); put("name_ru", p.name.ru)
        put("kind", p.kind.code); put("kind_kk", p.kind.kk); put("kind_ru", p.kind.ru)
        put("lat", p.lat); put("lon", p.lon)
        put("lat_dms", Coords.dmsLat(p.lat)); put("lon_dms", Coords.dmsLon(p.lon))
        put("created_at", p.createdAt); put("created_by", p.createdBy)
        put("updated_at", p.updatedAt); put("updated_by", p.updatedBy)
        put("mura_layer", LAYER)
    }

    /** Mura GIS-тің өзге нысандар файлы ма (әр нүктеде 16 таңбалы id және kind_kk). */
    fun isMura(root: JsonElement): Boolean {
        val feats = root.obj()?.takeIf { it.str("type") == "FeatureCollection" }?.get("features").arr() ?: return false
        return feats.isNotEmpty() && feats.all {
            val p = it.obj()?.get("properties").obj()
            Ids.isValid(p.str("id")) && p?.containsKey("kind_kk") == true
        }
    }

    fun parse(text: String, importLang: Lang): List<ImportedPlace> = parse(parseJson(text), importLang)

    fun parse(root: JsonElement, importLang: Lang): List<ImportedPlace> {
        val o = root.obj()
        val feats = when (o?.str("type")) {
            "FeatureCollection" -> o["features"].arr()?.toList() ?: emptyList()
            "Feature" -> listOf(o)
            else -> throw FormatException("geojson")
        }
        val out = ArrayList<ImportedPlace>()
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

    private val KNOWN = setOf("id", "name", "name_kk", "name_ru", "kind", "kind_kk", "kind_ru", "lat", "lon", "lat_dms", "lon_dms",
        "created_at", "created_by", "updated_at", "updated_by", "mura_layer")

    /** Бір жазбаның қасиеттері (GeoJSON properties не GPKG props) → өзге нысан. */
    fun fromProperties(p: JsonObject, lat: Double, lon: Double, importLang: Lang, featureId: String? = null): ImportedPlace {
        val hasKk = p.containsKey("name_kk")
        val hasRu = p.containsKey("name_ru")
        // Android: name_kk + name_ru; жұмыс үстелі: name — қазақша, name_ru — орысша; бөтен файл: name — [importLang] тілінде
        val name = when {
            hasKk -> Localized(p.str("name_kk")?.trim() ?: "", p.str("name_ru")?.trim() ?: "")
            hasRu -> Localized(p.pick("name").trim(), p.str("name_ru")?.trim() ?: "")
            else -> Localized.of(importLang, p.pick("name", "Name", "NAME", "атауы", "title"))
        }
        val langs = when {
            hasKk || hasRu -> buildSet { add(Lang.KK); if (!p.str("name_ru").isNullOrBlank() || hasKk) add(Lang.RU) }
            else -> setOf(importLang)
        }
        val id = p.pick("id").ifEmpty { featureId ?: "" }
        val extra = JsonObject(p.filterKeys { it !in KNOWN })
        val kind = PlaceKind.entries.firstOrNull { it.code == p.str("kind") } ?: PlaceKind.byLabel(p.str("kind_kk")) ?: PlaceKind.OTHER
        val place = Place(
            id = if (Ids.isValid(id)) id else Ids.newId(),
            lat = lat, lon = lon, name = name, kind = kind,
            createdAt = p.pick("created_at"), createdBy = p.pick("created_by"),
            updatedAt = p.pick("updated_at"), updatedBy = p.pick("updated_by"),
            extra = if (extra.isEmpty()) "" else JSON.encodeToString(JsonElement.serializer(), extra),
        )
        return ImportedPlace(place, langs, Ids.isValid(id))
    }

    /** KML (Google Earth т.б.) — тек көрсету/алмасу үшін. */
    fun exportKml(list: List<Place>, lang: Lang, title: String): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>")
            .append(Xml.esc(title)).append("</name>\n")
        for (p in Sorting.sortPlaces(list, lang)) {
            sb.append("<Placemark><name>").append(Xml.esc(p.title(lang))).append("</name>")
            sb.append("<description>").append(Xml.esc(p.kind.label(lang))).append("</description>")
            sb.append("<ExtendedData><Data name=\"mura_id\"><value>").append(p.id).append("</value></Data>")
            sb.append("<Data name=\"kind\"><value>").append(p.kind.code).append("</value></Data></ExtendedData>")
            sb.append("<Point><coordinates>").append(String.format(Locale.ROOT, "%.8f,%.8f", p.lon, p.lat)).append("</coordinates></Point></Placemark>\n")
        }
        sb.append("</Document></kml>\n")
        return sb.toString()
    }
}
