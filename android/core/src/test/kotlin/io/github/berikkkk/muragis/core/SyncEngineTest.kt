package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.sync.CloudFile
import io.github.berikkkk.muragis.core.sync.CloudStore
import io.github.berikkkk.muragis.core.sync.DeviceInfo
import io.github.berikkkk.muragis.core.sync.LocalRecord
import io.github.berikkkk.muragis.core.sync.ProjectMeta
import io.github.berikkkk.muragis.core.sync.RecordRef
import io.github.berikkkk.muragis.core.sync.StoreSyncLocal
import io.github.berikkkk.muragis.core.sync.SyncEngine
import io.github.berikkkk.muragis.core.sync.SyncException
import io.github.berikkkk.muragis.core.sync.SyncLocal
import io.github.berikkkk.muragis.core.sync.SyncRecords
import io.github.berikkkk.muragis.core.sync.SyncState
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.security.MessageDigest
import java.time.Instant

/**
 * Синхрондау ережелері — жұмыс үстеліндегі scripts/test-sync.mjs сценарийлерімен бірдей (екі платформада бір ереже),
 * Android дерекқорымен (LocalStore) жұмыс және жұмыс үстелінің өз қозғалтқышымен (Node) бір «бұлт» арқылы алмасу.
 */
class SyncEngineTest {
    private val pid = "aaaaaaaaaaaaaaaa"
    private val aId = "1111111111111111"; private val bId = "2222222222222222"; private val cId = "3333333333333333"
    private val x = "aaaaaaaaaaaa0001"; private val y = "aaaaaaaaaaaa0002"; private val z = "aaaaaaaaaaaa0003"
    private var clock = 0L
    private val now = { Instant.ofEpochSecond(1_767_225_600 + (++clock)).toString().replace("Z", ".000Z") }

    class MemCloud : CloudStore {
        val files = LinkedHashMap<String, Pair<String, String>>(); var rev = 0; var writes = 0; var offline = false
        private fun net() { if (offline) throw SyncException("offline") }
        override fun list(): List<CloudFile> { net(); return files.map { CloudFile(it.key, it.value.second) } }
        override fun read(f: CloudFile): String { net(); return files.getValue(f.name).first }
        override fun write(name: String, text: String): CloudFile { net(); writes++; val r = (++rev).toString(); files[name] = text to r; return CloudFile(name, r) }
    }

    inner class Dev(val id: String, val cloud: CloudStore) : SyncLocal {
        val recs = LinkedHashMap<String, LocalRecord>(); var pm = ProjectMeta("Жоба"); var st = SyncState(pid, id)
        override fun snapshot() = recs.values.toList()
        override fun apply(puts: List<LocalRecord>, dels: List<RecordRef>) { puts.forEach { recs[it.t + ":" + it.id] = it }; dels.forEach { recs.remove(it.t + ":" + it.id) } }
        override fun meta() = pm
        override fun setMeta(m: ProjectMeta) { pm = m }
        fun put(t: String, id: String, name: String, extra: Map<String, Any> = emptyMap()) {
            recs["$t:$id"] = LocalRecord(t, id, JsonObject(mapOf("id" to JsonPrimitive(id), "name" to JsonPrimitive(name), "lat" to JsonPrimitive(50.1), "lon" to JsonPrimitive(57.2),
                "updated_at" to JsonPrimitive(now())) + extra.mapValues { JsonPrimitive(it.value.toString()) }))
        }
        fun del(t: String, id: String) { recs.remove("$t:$id") }
        fun name(t: String, id: String) = recs["$t:$id"]?.d?.get("name")?.jsonPrimitive?.content
        fun sync() = SyncEngine.syncProject(cloud, cloud.list(), this, st, DeviceInfo(id, id), now = now)
        fun pending() = SyncEngine.pendingCount(snapshot(), st)
    }

    @Test fun versionVectors() {
        assertEquals("eq", SyncEngine.vvCmp(mapOf("a" to 1L), mapOf("a" to 1L)))
        assertEquals("gt", SyncEngine.vvCmp(mapOf("a" to 2L), mapOf("a" to 1L)))
        assertEquals("lt", SyncEngine.vvCmp(mapOf("a" to 1L), mapOf("a" to 1L, "b" to 1L)))
        assertEquals("cc", SyncEngine.vvCmp(mapOf("a" to 2L), mapOf("a" to 1L, "b" to 1L)))
        val a = JsonObject(mapOf("id" to JsonPrimitive("x"), "name" to JsonPrimitive("A"), "updated_at" to JsonPrimitive("1"), "oblast_ru" to JsonPrimitive("")))
        val b = JsonObject(mapOf("name" to JsonPrimitive("A"), "updated_at" to JsonPrimitive("2")))
        assertTrue("уақыт белгісі мен бос өрістер ескерілмейді", SyncEngine.sameContent(a, b))
        assertEquals(pid, SyncEngine.parseName("mura.$pid.$aId.json")!!.project)
        assertEquals("index", SyncEngine.parseName("mura.index.$aId.json")!!.kind)
        assertNull(SyncEngine.parseName("other.json"))
    }

    @Test fun addEditDeletePropagateWithoutDuplicatesOrResurrection() {
        val cloud = MemCloud(); val a = Dev(aId, cloud); val b = Dev(bId, cloud)
        a.put("mark", x, "Қорған"); a.put("route", y, "Маршрут")
        assertEquals(2, a.pending())
        a.sync(); assertEquals(0, a.pending())
        b.sync()
        assertEquals("Қорған", b.name("mark", x))
        val w = cloud.writes
        repeat(2) { a.sync(); b.sync() }
        assertEquals(2, b.recs.size); assertEquals(w, cloud.writes)
        b.put("route", y, "Өзгерген маршрут"); b.sync(); a.sync()
        assertEquals("Өзгерген маршрут", a.name("route", y))
        val c = Dev(cId, cloud); c.sync()
        a.del("mark", x); a.sync(); c.sync()
        assertNull("өшіру офлайн құрылғыға таралды", c.name("mark", x))
        c.sync(); a.sync(); b.sync(); a.sync()
        assertNull(a.name("mark", x)); assertNull(b.name("mark", x)); assertNull(c.name("mark", x))
    }

    @Test fun concurrentEditsBecomeConflictsAndResolutionPropagates() {
        val cloud = MemCloud(); val a = Dev(aId, cloud); val b = Dev(bId, cloud)
        a.put("mark", x, "Бастапқы"); a.put("mark", z, "Басқа"); a.sync(); b.sync()
        a.put("mark", x, "Компьютерде"); b.put("mark", x, "Телефонда"); b.put("mark", z, "Басқа — телефонда")
        a.sync(); b.sync(); a.sync()
        assertEquals(1, a.st.conflicts.size); assertEquals(1, b.st.conflicts.size)
        assertEquals("Компьютерде", a.name("mark", x)); assertEquals("Телефонда", b.name("mark", x))
        assertEquals("Басқа — телефонда", a.name("mark", z))
        SyncEngine.resolveConflict(a, a.st, "mark:$x", remote = true)
        assertEquals("Телефонда", a.name("mark", x))
        a.sync(); b.sync(); a.sync()
        assertTrue(b.st.conflicts.isEmpty() && a.st.conflicts.isEmpty())

        // Бірі өшірді, екіншісі офлайн өңдеді
        b.put("mark", y, "Y"); b.sync(); a.sync()
        a.del("mark", y); b.put("mark", y, "Y — өңделді")
        a.sync(); b.sync(); a.sync()
        val cb = b.st.conflicts["mark:$y"]!!
        assertTrue(cb.remote.del && !cb.local.del)
        SyncEngine.resolveConflict(b, b.st, "mark:$y", remote = false)
        b.sync(); a.sync()
        assertEquals("Y — өңделді", a.name("mark", y)); assertTrue(a.st.conflicts.isEmpty())

        // Бірдей өзгеріс — қайшылық емес; тек уақыт белгісі — өзгеріс емес
        a.put("mark", z, "Бірдей"); b.put("mark", z, "Бірдей"); a.sync(); b.sync(); a.sync()
        assertTrue(a.st.conflicts.isEmpty() && b.st.conflicts.isEmpty())
        a.put("mark", z, "Бірдей"); assertEquals(0, a.pending())
    }

    @Test fun offlineQueueAndCorruptFiles() {
        val cloud = MemCloud(); val a = Dev(aId, cloud); val b = Dev(bId, cloud)
        a.put("mark", x, "X"); a.sync()
        cloud.files[SyncEngine.dataName(pid, cId)] = "{бүлінген" to "99"
        b.sync(); assertNotNull(b.name("mark", x))
        cloud.offline = true
        b.put("mark", y, "офлайн")
        val e = runCatching { b.sync() }.exceptionOrNull()
        assertEquals("offline", (e as SyncException).code); assertEquals(1, b.pending())
        cloud.offline = false
        b.sync(); a.sync()
        assertEquals("офлайн", a.name("mark", y)); assertEquals(0, b.pending())
        a.pm = ProjectMeta("Жаңа атау", "Ақтөбе облысы"); a.sync(); b.sync()
        assertEquals("Жаңа атау", b.pm.name)
        cloud.write(SyncEngine.indexName(aId), SyncEngine.indexDoc(DeviceInfo(aId, "PC"), listOf(io.github.berikkkk.muragis.core.sync.CloudProject(pid, "Жаңа атау", "", "", now(), emptyList()))))
        assertEquals("Жаңа атау", SyncEngine.cloudProjects(cloud, cloud.list()).single().name)
    }

    @Test fun stateSurvivesSerialization() {
        val cloud = MemCloud(); val a = Dev(aId, cloud); val b = Dev(bId, cloud)
        a.put("mark", x, "X"); a.sync(); b.sync()
        a.put("mark", x, "A"); b.put("mark", x, "B"); a.sync(); b.sync()
        val text = b.st.toJson()
        val back = SyncState.parse(text, pid, bId)
        assertEquals(b.st.base.keys, back.base.keys); assertEquals(1, back.conflicts.size)
        assertEquals("B", back.conflicts.values.single().local.d!!["name"]!!.jsonPrimitive.content)
        assertTrue("басқа құрылғының күйі қабылданбайды", SyncState.parse(text, pid, aId).base.isEmpty())
    }

    /* ---------------- Android дерекқоры ---------------- */

    private fun store(name: String): LocalStore = LocalStore(JdbcSqlDb(TestUtil.tmp(name).path), "android:test")

    @Test fun storeLocalRoundTripAndProjectIsolation() {
        val s = store("sync-store.db")
        s.defaultProject = pid
        val m = s.saveMonument(Monument(lat = 50.12345678, lon = 57.1, name = Localized("Ақжар", "Акжар"), oblast = Localized("Ақтөбе облысы", "Актюбинская область")))
        val r = s.saveRoute(Route(name = Localized("Жол", "Дорога"), points = listOf(RoutePoint(50.0, 57.0), RoutePoint(50.1, 57.1, m.id))))
        s.defaultProject = ""
        s.saveMonument(Monument(lat = 1.0, lon = 1.0, name = Localized("Жобасыз", "")))
        val local = StoreSyncLocal(s, pid)
        val snap = local.snapshot()
        assertEquals(2, snap.size)
        val md = snap.first { it.t == "mark" }.d
        assertEquals("Ақжар", md["name"]!!.jsonPrimitive.content); assertEquals("Акжар", md["name_ru"]!!.jsonPrimitive.content)
        assertEquals("Актюбинская область", md["oblast_ru"]!!.jsonPrimitive.content)
        val rd = snap.first { it.t == "route" }.d
        assertEquals(m.id, rd["pt_marks"]!!.jsonArray[0].jsonArray[1].jsonPrimitive.content)
        // Қайта оқу мазмұнды өзгертпейді (әйтпесе «жергілікті өзгеріс» болып көрінер еді)
        local.apply(snap, emptyList())
        assertEquals(snap.map { SyncEngine.hashContent(it.d) }.toSet(), local.snapshot().map { SyncEngine.hashContent(it.d) }.toSet())
        assertEquals(1, s.unassignedCount())
        // Басқа жобадағы id-лі жазба қабылданбайды
        val other = StoreSyncLocal(s, "bbbbbbbbbbbbbbbb")
        other.apply(listOf(LocalRecord("mark", m.id, md)), emptyList())
        assertTrue(other.snapshot().isEmpty()); assertEquals(pid, s.monument(m.id)!!.projectId)
        // Өшіру — тек осы жобада
        local.apply(emptyList(), listOf(RecordRef("route", r.id)))
        assertNull(s.route(r.id)); assertEquals(1, local.snapshot().size)
        // Бұлтта бар id-лі жобасыз жазба жобаға алынады
        val loose = s.monuments().first { it.projectId.isEmpty() }
        local.adopt(listOf(RecordRef("mark", loose.id)))
        assertEquals(pid, s.monument(loose.id)!!.projectId)
        // Белгісіз өрістер жоғалмайды
        val ext = JsonObject(md + mapOf("qgis_field" to JsonPrimitive("сақталсын"), "id" to JsonPrimitive("cccccccccccccccc")))
        local.apply(listOf(LocalRecord("mark", "cccccccccccccccc", ext)), emptyList())
        assertEquals("сақталсын", local.snapshot().first { it.id == "cccccccccccccccc" }.d["qgis_field"]!!.jsonPrimitive.content)
    }

    @Test fun schemaV2DatabaseGetsProjectColumn() {
        val f = TestUtil.tmp("v2.db")
        JdbcSqlDb(f.path).use { db ->
            LocalStore(db)                                         // қазіргі схема
            db.exec("DROP INDEX monuments_project"); db.exec("DROP INDEX routes_project")
            db.exec("ALTER TABLE monuments DROP COLUMN project_id"); db.exec("ALTER TABLE routes DROP COLUMN project_id")
            db.exec("DROP TABLE sync_projects"); db.exec("PRAGMA user_version = 2")
            db.exec("INSERT INTO monuments (id, lat, lon, name_kk, type, category, status) VALUES ('dddddddddddddddd', 50, 57, 'Ескі', 'archeo', '', 'state')")
        }
        JdbcSqlDb(f.path).use { db ->
            val s = LocalStore(db)
            assertEquals("Ескі", s.monument("dddddddddddddddd")!!.name.kk)
            assertEquals("", s.monument("dddddddddddddddd")!!.projectId)
            assertEquals(1, s.unassignedCount())
        }
    }

    @Test fun localChangesNotifyButSyncWritesDoNot() {
        val s = store("notify.db"); var n = 0
        s.onChange = { n++ }
        s.defaultProject = pid
        val m = s.saveMonument(Monument(lat = 1.0, lon = 1.0, name = Localized("A", "")))
        assertEquals(1, n)
        StoreSyncLocal(s, pid).apply(listOf(LocalRecord("mark", m.id, SyncRecords.markToJson(m.copy(name = Localized("B", ""))))), emptyList())
        assertEquals(1, n)
        s.deleteMonuments(listOf(m.id)); assertEquals(2, n)
    }

    /* ---------------- Жұмыс үстелімен бір бұлт ---------------- */

    /** Қалтадағы «бұлт»: нұсқа — мазмұн хеші (desktop-compat.mjs sync командасындағыдай). */
    class DirCloud(val dir: File) : CloudStore {
        private fun rev(b: ByteArray) = MessageDigest.getInstance("SHA-1").digest(b).joinToString("") { "%02x".format(it) }
        override fun list() = (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".json") }.map { CloudFile(it.name, rev(it.readBytes())) }
        override fun read(f: CloudFile) = File(dir, f.name).readText()
        override fun write(name: String, text: String): CloudFile { File(dir, name).writeText(text); return CloudFile(name, rev(text.toByteArray())) }
    }

    @Test fun desktopAndAndroidShareOneCloud() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        val dir = TestUtil.tmp("cloud").apply { mkdirs() }
        val cloud = DirCloud(dir)
        val s = store("phone.db")
        s.saveSyncProject(LocalStore.SyncProject(pid, "Қобда жобасы", "Ақтөбе облысы"))
        s.defaultProject = pid
        val m = s.saveMonument(Monument(lat = 50.12345678, lon = 57.1, name = Localized("Ақжар қорымы", "Могильник Акжар"), oblast = Localized("Ақтөбе облысы", "Актюбинская область")))
        val r = s.saveRoute(Route(name = Localized("Жол", "Дорога"), points = listOf(RoutePoint(50.0, 57.0), RoutePoint(50.12345678, 57.1, m.id)), extra = "{\"mura_kind\":\"track\"}"))
        val phone = DeviceInfo(aId, "Phone", "android")
        var st = SyncState(pid, aId)
        fun sync() = SyncEngine.syncProject(cloud, cloud.list(), StoreSyncLocal(s, pid), st, phone, now = now)
        sync()

        val gpkg = TestUtil.tmp("desktop.gpkg")
        val edit = TestUtil.tmp("edit.json")
        edit.writeText("""{"project":"$pid","device":"$bId","marks":[{"id":"${m.id}","note":"компьютерде"},{"name":"Компьютерде қосылған","type":"archeo","lat":50.2,"lon":57.3}]}""")
        val o1 = Json.parseToJsonElement(TestUtil.desktop("sync", dir.path, gpkg.path, edit.path)).jsonObject
        val dm = o1["marks"]!!.jsonArray.map { it.jsonObject }
        val dmark = dm.first { it["id"]!!.jsonPrimitive.content == m.id }
        assertEquals("телефондағы нүкте компьютерде пайда болды", "Ақжар қорымы", dmark["name"]!!.jsonPrimitive.content)
        assertEquals("Могильник Акжар", dmark["name_ru"]!!.jsonPrimitive.content)
        assertEquals("Android өрісі (oblast_ru) компьютерде өңдегенде сақталды", "Актюбинская область", dmark["oblast_ru"]!!.jsonPrimitive.content)
        assertEquals("Қобда жобасы", o1["meta"]!!.jsonObject["name"]!!.jsonPrimitive.content)
        assertEquals(2, o1["routes"]!!.jsonArray[0].jsonObject["pts"]!!.jsonArray.size)
        assertTrue(o1["conflicts"]!!.jsonArray.isEmpty())

        sync()
        assertEquals("компьютерде өзгертілген жазба телефонда жаңарды", "компьютерде", s.monument(m.id)!!.note.kk)
        assertEquals("Могильник Акжар", s.monument(m.id)!!.name.ru)
        // Жұмыс үстелі жаңа белгіге өз id-ін береді
        val newId = s.monuments().single { it.name.kk == "Компьютерде қосылған" }.id
        assertEquals(pid, s.monument(newId)!!.projectId)
        assertEquals(m.id, s.route(r.id)!!.points[1].monumentId)
        assertTrue(s.route(r.id)!!.extra.contains("track"))
        assertEquals(0, SyncEngine.pendingCount(StoreSyncLocal(s, pid).snapshot(), st))

        // Телефонда өшіру → компьютерде өшіріледі; күйді сақтап-оқу
        s.deleteMonuments(listOf(newId))
        sync()
        st = SyncState.parse(st.toJson(), pid, aId)
        edit.writeText("""{"project":"$pid","device":"$bId"}""")
        val o2 = Json.parseToJsonElement(TestUtil.desktop("sync", dir.path, gpkg.path, edit.path)).jsonObject
        assertFalse("өшіру компьютерге таралды", o2["marks"]!!.jsonArray.any { it.jsonObject["id"]!!.jsonPrimitive.content == newId })
        sync()
        assertNull("өшірілген жазба қайта пайда болмады", s.monument(newId))
        assertTrue(st.conflicts.isEmpty())
    }
}
