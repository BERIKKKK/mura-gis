package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.io.MonumentGeoJson
import io.github.berikkkk.muragis.core.io.PointFiles
import io.github.berikkkk.muragis.core.io.RouteFormats
import io.github.berikkkk.muragis.core.io.lengthMeters
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.ValidationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreAndFormatsTest {
    private fun store(file: java.io.File = TestUtil.tmp("local.db")) = LocalStore(JdbcSqlDb(file.path), "tester")

    private val sample = Monument(
        lat = 42.6512345, lon = 68.1234567,
        name = Localized("Сүткент қалашығы", "Городище Сюткент"), period = Localized("IX–XV ғғ.", "IX–XV вв."),
        type = MonumentType.ARCHEO, category = Category.REP,
    )

    @Test fun languagesAreStoredSeparatelyAndSurviveReopen() {
        val f = TestUtil.tmp("persist.db")
        val s = store(f)
        val saved = s.saveMonument(sample)
        // Тек орысша атауын өзгерту — қазақшасы өзгермейді
        s.saveMonument(saved.copy(name = saved.name.with(Lang.RU, "Сюткент")))
        s.db.close()
        val s2 = store(f)                               // қосымшаны қайта ашу
        val m = s2.monument(saved.id)!!
        assertEquals("Сүткент қалашығы", m.name.kk)
        assertEquals("Сюткент", m.name.ru)
        assertEquals("tester", m.createdBy)
        assertTrue(m.updatedAt >= m.createdAt)
        assertEquals(1L, s2.monumentCount())
        s2.deleteMonuments(listOf(m.id))
        assertNull(s2.monument(m.id))
        assertEquals(0, s2.monuments().size)
    }

    @Test(expected = ValidationException::class)
    fun nameRequired() { store().saveMonument(sample.copy(name = Localized.EMPTY)) }

    @Test fun geojsonRoundTripKeepsBothLanguages() {
        val s = store()
        val m = s.saveMonument(sample)
        val text = MonumentGeoJson.export(listOf(m), Lang.RU)
        assertTrue(text.contains("\"name\": \"Городище Сюткент\""))      // жұмыс үстелі оқитын өріс — экспорт тілінде
        assertTrue(text.contains("\"type_kk\": \"Археология ескерткіштері\""))
        val back = MonumentGeoJson.parse(text, Lang.KK).single()
        assertEquals(setOf(Lang.KK, Lang.RU), back.langs)
        assertEquals(m.name, back.monument.name)
        assertEquals(m.id, back.monument.id)
        assertTrue(MonumentGeoJson.isMura(io.github.berikkkk.muragis.core.io.parseJson(text)))
    }

    @Test fun importOfSingleLanguageFileDoesNotOverwriteOtherLanguage() {
        val s = store()
        val m = s.saveMonument(sample)
        // Жұмыс үстелінен келген (тек бір тілдегі) жаңарақ жазба — орысша деп импортталады
        val desktopJson = """{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[68.2,42.7]},
            "properties":{"id":"${m.id}","name":"Сюткент (уточн.)","type":"arch","type_kk":"x","status":"state","status_kk":"x","updated_at":"2999-01-01T00:00:00.000Z"}}]}"""
        val r = s.importMonuments(MonumentGeoJson.parse(desktopJson, Lang.RU))
        assertEquals(1, r.updated)
        val after = s.monument(m.id)!!
        assertEquals("Сүткент қалашығы", after.name.kk)            // қазақшасы сақталды
        assertEquals("Сюткент (уточн.)", after.name.ru)
        assertEquals("IX–XV ғғ.", after.period.kk)
        assertEquals(MonumentType.ARCH, after.type)
        assertEquals(42.7, after.lat, 1e-9)
        // Ескі жазба (updated_at кіші) — өткізіліп жіберіледі
        val old = desktopJson.replace("2999-01-01", "2000-01-01").replace("Сюткент (уточн.)", "ескі")
        assertEquals(1, s.importMonuments(MonumentGeoJson.parse(old, Lang.RU)).skipped)
        assertEquals("Сюткент (уточн.)", s.monument(m.id)!!.name.ru)
    }

    @Test fun desktopGeojsonExportIsImported() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val json = TestUtil.desktop("marks-geojson")
        val root = io.github.berikkkk.muragis.core.io.parseJson(json)
        assertTrue(MonumentGeoJson.isMura(root))
        val list = MonumentGeoJson.parse(root, Lang.KK)
        assertEquals(2, list.size)
        val a = list.first { it.monument.id == "0123456789abcdef" }
        assertEquals("Сүткент қалашығы", a.monument.name.kk)
        assertEquals("", a.monument.name.ru)
        assertEquals(Category.REP, a.monument.category)
        assertEquals(setOf(Lang.KK), a.langs)
        val b = list.first { it.monument.id == "fedcba9876543210" }
        assertEquals(Category.NONE, b.monument.category)
        assertEquals(MonumentType.SACRED, b.monument.type)
        assertEquals(io.github.berikkkk.muragis.core.model.Status.PRELIM, b.monument.status)
    }

    @Test fun routesRoundTripAndDesktopFormats() {
        val s = store()
        val r = s.saveRoute(Route(name = Localized("Маршрут", "Маршрут РУ"), points = listOf(
            RoutePoint(42.3, 69.6), RoutePoint(42.5, 68.9, monumentId = "0123456789abcdef"), RoutePoint(42.6, 68.1))))
        assertEquals(3, s.route(r.id)!!.points.size)
        assertEquals("0123456789abcdef", s.route(r.id)!!.points[1].monumentId)
        val gj = RouteFormats.toGeoJson(listOf(r), Lang.KK, "t")
        val back = RouteFormats.parseGeoJson(gj, Lang.RU).single()
        assertEquals(r.id, back.route.id)
        assertEquals(r.name, back.route.name)
        assertEquals("0123456789abcdef", back.route.points[1].monumentId)
        val gpx = RouteFormats.toGpx(listOf(r), Lang.KK, "t", mapOf("0123456789abcdef" to sample.copy(id = "0123456789abcdef")))
        val g = RouteFormats.parseGpx(gpx, Lang.KK).single()
        assertEquals(3, g.route.points.size)
        assertEquals(r.lengthMeters(), g.route.lengthMeters(), 1.0)
        assertEquals(1, PointFiles.parseGpx(gpx).size)            // ескерткіш — wpt
        assertFalse(RouteFormats.toKml(listOf(r), Lang.RU, "t").isEmpty())

        if (!TestUtil.nodeAvailable) return
        val o = io.github.berikkkk.muragis.core.io.parseJson(TestUtil.desktop("routes-export")) as kotlinx.serialization.json.JsonObject
        val dgj = o["geojson"].toString()
        val dr = RouteFormats.parseGeoJson(dgj, Lang.KK).single()
        assertEquals("aaaaaaaaaaaaaaaa", dr.route.id)
        assertEquals("Шымкент — Сүткент", dr.route.name.kk)
        assertEquals("Шымкент", dr.route.aName.kk)
        assertEquals(io.github.berikkkk.muragis.core.model.Vehicle.CAR, dr.route.vehicle)
        val dgpx = (o["gpx"] as kotlinx.serialization.json.JsonPrimitive).content
        assertEquals(1, RouteFormats.parseGpx(dgpx, Lang.KK).size)
        val imp = s.importRoutes(listOf(dr))
        assertEquals(1, imp.added)
    }

    @Test fun kmlKmzPoints() {
        val kml = """<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Doc</name><Folder><name>F1</name>
            <Placemark><name>A</name><description><![CDATA[<b>bold</b> text]]></description><ExtendedData><Data name="k"><value>v</value></Data></ExtendedData>
            <Point><coordinates>68.1,42.6,0</coordinates></Point></Placemark>
            <Placemark><name>Poly</name><Polygon><outerBoundaryIs><LinearRing><coordinates>68,42 69,42 69,43 68,43</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
            </Folder></Document></kml>"""
        val pts = PointFiles.parseKml(kml)
        assertEquals(2, pts.size)
        assertEquals("F1", pts[0].folder)
        assertTrue(pts[0].desc.contains("bold text") && pts[0].desc.contains("k: v"))
        assertEquals(42.5, pts[1].lat, 1e-9)
        val bos = java.io.ByteArrayOutputStream()
        java.util.zip.ZipOutputStream(bos).use { z -> z.putNextEntry(java.util.zip.ZipEntry("doc.kml")); z.write(kml.toByteArray()); z.closeEntry() }
        assertEquals(2, PointFiles.parseKmz(bos.toByteArray()).size)
    }
}
