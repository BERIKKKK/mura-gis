package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.gpkg.MuraProject
import io.github.berikkkk.muragis.core.io.MonumentGeoJson
import io.github.berikkkk.muragis.core.io.PlaceGeoJson
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Place
import io.github.berikkkk.muragis.core.model.PlaceKind
import io.github.berikkkk.muragis.core.model.ValidationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlacesTest {
    private fun store(file: java.io.File = TestUtil.tmp("places.db")) = LocalStore(JdbcSqlDb(file.path), "tester")

    private val well = Place(lat = 49.1234567, lon = 57.7654321, name = Localized("Ақбұлақ құдығы", "Колодец Акбулак"), kind = PlaceKind.WELL)

    @Test fun saveReopenDelete() {
        val f = TestUtil.tmp("places-persist.db")
        val s = store(f)
        val saved = s.savePlace(well)
        s.savePlace(saved.copy(name = saved.name.with(Lang.RU, "Акбулак")))
        s.db.close()
        val s2 = store(f)
        val p = s2.place(saved.id)!!
        assertEquals("Ақбұлақ құдығы", p.name.kk)
        assertEquals("Акбулак", p.name.ru)
        assertEquals(PlaceKind.WELL, p.kind)
        assertEquals("tester", p.createdBy)
        assertEquals(1, s2.deletePlaces(listOf(p.id)))
        assertNull(s2.place(p.id))
        assertTrue(s2.places().isEmpty())
    }

    @Test fun nameIsOptionalCoordsAreNot() {
        val s = store()
        val p = s.savePlace(Place(lat = 48.0, lon = 58.0, kind = PlaceKind.QYSTAU))
        assertEquals("Қыстау", p.title(Lang.KK))
        assertEquals("Зимовка (қыстау)", p.title(Lang.RU))
        val r = runCatching { s.savePlace(Place(lat = 91.0, lon = 0.0)) }
        assertTrue(r.exceptionOrNull() is ValidationException)
    }

    /** 1-нұсқадағы дерекқор (places кестесі жоқ) ашылғанда ескерткіштер сақталып, жаңа кесте қосылады. */
    @Test fun schemaV1DatabaseIsMigrated() {
        val f = TestUtil.tmp("v1.db")
        val db = JdbcSqlDb(f.path)
        val s1 = LocalStore(db, "tester")
        val m = s1.saveMonument(Monument(lat = 42.0, lon = 68.0, name = Localized("Ескерткіш", "")))
        db.exec("DROP TABLE places")
        db.exec("PRAGMA user_version = 1")
        db.close()
        val s2 = store(f)
        assertEquals("Ескерткіш", s2.monument(m.id)!!.name.kk)
        assertTrue(s2.places().isEmpty())
        s2.savePlace(well)
        assertEquals(1, s2.places().size)
        assertEquals(2L, s2.db.scalarLong("PRAGMA user_version"))
    }

    @Test fun geojsonRoundTripAndDetection() {
        val s = store()
        val p = s.savePlace(well)
        val text = PlaceGeoJson.export(listOf(p), Lang.KK)
        assertTrue(text.contains("\"kind_kk\": \"Құдық\""))
        assertTrue(text.contains("\"mura_layer\": \"places\""))
        val root = kotlinx.serialization.json.Json.parseToJsonElement(text)
        assertTrue(PlaceGeoJson.isMura(root))
        assertFalse(MonumentGeoJson.isMura(root))                        // ескерткіш файлымен шатаспайды
        val back = PlaceGeoJson.parse(text, Lang.KK).single()
        assertEquals(p.id, back.place.id)
        assertEquals(p.name, back.place.name)
        assertEquals(PlaceKind.WELL, back.place.kind)
        assertEquals(setOf(Lang.KK, Lang.RU), back.langs)
        // Ескерткіштер файлы өзге нысандар файлы деп танылмайды
        val mons = MonumentGeoJson.export(listOf(s.saveMonument(Monument(lat = 1.0, lon = 2.0, name = Localized("А", "")))), Lang.KK)
        assertFalse(PlaceGeoJson.isMura(kotlinx.serialization.json.Json.parseToJsonElement(mons)))
    }

    /** Жұмыс үстелінің экспорты: name — қазақша, name_ru — орысша (бос болса — жергілікті орысша атау өшпейді). */
    @Test fun desktopFileKeepsLocalRussianWhenEmpty() {
        val s = store()
        val p = s.savePlace(well)
        val desktop = """{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[57.8,49.2]},
            "properties":{"id":"${p.id}","name":"Жаңа атау","name_ru":"","kind":"spring","kind_kk":"Бұлақ","updated_at":"2999-01-01T00:00:00.000Z"}}]}"""
        val r = s.importPlaces(PlaceGeoJson.parse(desktop, Lang.KK))
        assertEquals(1, r.updated)
        val q = s.place(p.id)!!
        assertEquals("Жаңа атау", q.name.kk)
        assertEquals("Колодец Акбулак", q.name.ru)
        assertEquals(PlaceKind.SPRING, q.kind)
        assertEquals(49.2, q.lat, 1e-9)
        // Сол файлды қайта импорттау — өзгеріс жоқ (updated_at бірдей)
        assertEquals(1, s.importPlaces(PlaceGeoJson.parse(desktop, Lang.KK)).skipped)
    }

    @Test fun projectRoundTrip() {
        val s = store()
        val p = s.savePlace(well)
        val m = s.saveMonument(Monument(lat = 42.0, lon = 68.0, name = Localized("Ескерткіш", "Памятник")))
        val f = TestUtil.tmp("places.gpkg")
        JdbcSqlDb(f.path).use { db -> MuraProject.export(db, listOf(m), emptyList(), Lang.KK, "test", listOf(p)) }
        JdbcSqlDb(f.path).use { db ->
            MuraProject.requireProject(db)
            val back = MuraProject.readPlaces(db, Lang.KK).single().place
            assertEquals(p.id, back.id)
            assertEquals(p.name, back.name)
            assertEquals(p.kind, back.kind)
            assertEquals(p.lat, back.lat, 1e-9)
            assertEquals(1, MuraProject.readMarks(db, Lang.KK).size)
        }
    }

    /** Android жобасын жұмыс үстелі ашады (main/gpkg.js + PlacesStore.clean) және керісінше. */
    @Test fun desktopCompatibility() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val s = store()
        val p = s.savePlace(well)
        val f = TestUtil.tmp("places-for-desktop.gpkg")
        JdbcSqlDb(f.path).use { MuraProject.export(it, emptyList(), emptyList(), Lang.KK, "Тест", listOf(p)) }
        val o = kotlinx.serialization.json.Json.parseToJsonElement(TestUtil.desktop("read-gpkg", f.path)).let { it as kotlinx.serialization.json.JsonObject }
        val d = (o["places"] as kotlinx.serialization.json.JsonArray).single() as kotlinx.serialization.json.JsonObject
        fun str(k: String) = (d[k] as kotlinx.serialization.json.JsonPrimitive).content
        assertEquals(p.id, str("id"))
        assertEquals("Ақбұлақ құдығы", str("name"))
        assertEquals("Колодец Акбулак", str("name_ru"))
        assertEquals("well", str("kind"))
        assertEquals(p.lat, str("lat").toDouble(), 1e-9)
        assertTrue((o["placesValid"] as kotlinx.serialization.json.JsonArray).all { (it as kotlinx.serialization.json.JsonPrimitive).content == "true" })

        val f2 = TestUtil.tmp("places-from-desktop.gpkg")
        TestUtil.desktop("write-gpkg", f2.path)
        JdbcSqlDb(f2.path).use { db ->
            val back = MuraProject.readPlaces(db, Lang.KK).single()
            assertEquals("bbbbbbbbbbbbbbbb", back.place.id)
            assertEquals(Localized("Ақбұлақ", "Акбулак"), back.place.name)
            assertEquals(PlaceKind.SPRING, back.place.kind)
            assertEquals(1, s.importPlaces(listOf(back)).added)
        }
    }

    /** places қабаты жоқ ескі жоба — бос тізім. */
    @Test fun oldProjectWithoutPlaces() {
        val f = TestUtil.tmp("old.gpkg")
        JdbcSqlDb(f.path).use { db ->
            MuraProject.export(db, listOf(Monument(lat = 42.0, lon = 68.0, name = Localized("Ескерткіш", ""))), emptyList(), Lang.KK, "old")
            db.exec("DROP TABLE places")
        }
        JdbcSqlDb(f.path).use { db -> assertTrue(MuraProject.readPlaces(db, Lang.KK).isEmpty()) }
    }
}
