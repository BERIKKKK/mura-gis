package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.gpkg.Geom
import io.github.berikkkk.muragis.core.gpkg.GpkgGeometry
import io.github.berikkkk.muragis.core.gpkg.MuraProject
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Android жазған .gpkg-ті жұмыс үстелінің өз коды (main/gpkg.js) ашады және керісінше. */
class DesktopCompatTest {
    private val m = Monument(lat = 42.6512345, lon = 68.1234567, name = Localized("Сүткент қалашығы", "Городище Сюткент"),
        period = Localized("IX–XV ғғ.", "IX–XV вв."), category = Category.REP, updatedAt = "2025-01-01T00:00:00.000Z")
    private val r = Route(name = Localized("Жол", "Дорога"), aName = Localized("Шымкент", "Шымкент"),
        points = listOf(RoutePoint(42.3, 69.6), RoutePoint(42.6512345, 68.1234567, m.id)))

    @Test fun geometryCodecRoundTrip() {
        val g = GpkgGeometry.decode(GpkgGeometry.encode(Geom.Line(listOf(doubleArrayOf(1.0, 2.0), doubleArrayOf(3.0, 4.0))))) as Geom.Line
        assertEquals(3.0, g.pts[1][0], 0.0)
        val p = GpkgGeometry.decode(GpkgGeometry.encode(Geom.Point(68.1, 42.6))) as Geom.Point
        assertEquals(42.6, p.y, 0.0)
    }

    @Test fun androidProjectReadBackByAndroid() {
        val f = TestUtil.tmp("android.gpkg")
        JdbcSqlDb(f.path).use { MuraProject.export(it, listOf(m), listOf(r), Lang.RU, "Тест") }
        JdbcSqlDb(f.path).use { db ->
            MuraProject.requireProject(db)
            val mk = MuraProject.readMarks(db, Lang.KK).single()
            assertEquals(m.name, mk.monument.name)                 // екі тіл де қалпына келді
            assertEquals(m.id, mk.monument.id)
            val rt = MuraProject.readRoutes(db, Lang.KK).single()
            assertEquals(r.name, rt.route.name)
            assertEquals(m.id, rt.route.points[1].monumentId)
        }
    }

    @Test fun desktopOpensAndroidProject() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val f = TestUtil.tmp("for-desktop.gpkg")
        JdbcSqlDb(f.path).use { MuraProject.export(it, listOf(m), listOf(r), Lang.KK, "Тест") }
        val o = Json.parseToJsonElement(TestUtil.desktop("read-gpkg", f.path)).jsonObject
        val marks = o["marks"]!!.jsonArray
        assertEquals(1, marks.size)
        val mk = marks[0].jsonObject
        assertEquals(m.id, mk["id"]!!.jsonPrimitive.content)
        assertEquals("Сүткент қалашығы", mk["name"]!!.jsonPrimitive.content)       // жұмыс үстелі экспорт тіліндегі атауды көреді
        assertEquals(42.6512345, mk["lat"]!!.jsonPrimitive.content.toDouble(), 1e-9)
        assertEquals("rep", mk["category"]!!.jsonPrimitive.content)
        assertTrue(o["marksValid"]!!.jsonArray.all { it.jsonPrimitive.boolean })     // MarksStore.clean қабылдайды
        val rt = o["routes"]!!.jsonArray[0].jsonObject
        assertEquals(r.id, rt["id"]!!.jsonPrimitive.content)
        assertEquals("Шымкент", rt["a_name"]!!.jsonPrimitive.content)
        assertEquals(2, rt["pts"]!!.jsonArray.size)
        assertEquals(42.3, (rt["pts"]!!.jsonArray[0] as JsonArray)[0].jsonPrimitive.content.toDouble(), 1e-9)
        assertTrue(o["routesValid"]!!.jsonArray.all { it.jsonPrimitive.boolean })
        assertEquals("Тест", (o["meta"] as JsonObject)["name"]!!.jsonPrimitive.content)
    }

    @Test fun androidOpensDesktopProject() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val f = TestUtil.tmp("from-desktop.gpkg")
        TestUtil.desktop("write-gpkg", f.path)
        val store = LocalStore(JdbcSqlDb(TestUtil.tmp("l.db").path))
        JdbcSqlDb(f.path).use { db ->
            MuraProject.requireProject(db)
            val marks = MuraProject.readMarks(db, Lang.KK)
            assertEquals(2, marks.size)
            assertEquals("Сүткент қалашығы", marks.first { it.monument.id == "0123456789abcdef" }.monument.name.kk)
            assertEquals(2, store.importMonuments(marks).added)
            val routes = MuraProject.readRoutes(db, Lang.KK)
            assertEquals("aaaaaaaaaaaaaaaa", routes.single().route.id)
            assertEquals(3, routes.single().route.points.size)
            assertEquals("Сүткент", routes.single().route.bName.kk)
            assertEquals(1, store.importRoutes(routes).added)
        }
        // Android-та өңдеп, жұмыс үстеліне қайта беру: қазақша өріс жұмыс үстеліндегі атауда, орысшасы props-та қалады
        val edited = store.monument("0123456789abcdef")!!.let { store.saveMonument(it.copy(name = it.name.with(Lang.RU, "Сюткент"))) }
        val f2 = TestUtil.tmp("back.gpkg")
        JdbcSqlDb(f2.path).use { MuraProject.export(it, store.monuments(), store.routes(), Lang.KK, "Қайта") }
        val o = Json.parseToJsonElement(TestUtil.desktop("read-gpkg", f2.path)).jsonObject
        val mk = o["marks"]!!.jsonArray.map { it.jsonObject }.first { it["id"]!!.jsonPrimitive.content == edited.id }
        assertEquals("Сүткент қалашығы", mk["name"]!!.jsonPrimitive.content)
        assertEquals("Сюткент", (mk["name_ru"] as JsonPrimitive).content)
    }
}
