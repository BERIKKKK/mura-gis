package io.github.berikkkk.muragis.core.sync

import io.github.berikkkk.muragis.core.model.Ids
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.security.MessageDigest

/*
 * Синхрондаудың ортақ қозғалтқышы — бұлт қызметіне тәуелсіз. Жұмыс үстеліндегі main/sync/engine.js-тің дәл көшірмесі:
 * файл пішімі (mura-sync/1), нұсқа векторлары, біріктіру, өшіруді тарату және қайшылық ережелері бірдей
 * (тест сценарийлері: scripts/test-sync.mjs ↔ SyncEngineTest.kt, пішім кросс-тексеруі — SyncEngineTest.desktopReadsAndroidFile).
 *
 * Бұлттағы файлдар: mura.<жоба>.<құрылғы>.json — құрылғының жобадағы күйі (әр файлды тек өз құрылғысы жазады);
 * mura.index.<құрылғы>.json — құрылғының жобалар тізімі. Жазба нұсқасы — нұсқа векторы { құрылғы: санауыш }.
 */

/** Бұлттағы файл (сақтау қызметі береді): [rev] өзгерсе — файл өзгерген. */
data class CloudFile(val name: String, val rev: String, val id: String = "", val size: Long = 0)

/** Сақтау қызметінің бірыңғай қатесі: offline, auth, quota, rate, server, http, config. */
class SyncException(val code: String, message: String = code) : Exception(message)

/** Сақтау қызметі (Google Drive; кейін OneDrive, Dropbox): тек қолданбаның жеке аумағындағы файлдар. */
interface CloudStore {
    fun list(): List<CloudFile>
    fun read(f: CloudFile): String
    fun write(name: String, text: String): CloudFile
}

/** Жазба түрлері: mark — ескерткіш, route — маршрут. */
data class LocalRecord(val t: String, val id: String, val d: JsonObject)
data class ProjectMeta(val name: String = "", val oblast: String = "", val district: String = "")
data class RecordRef(val t: String, val id: String)

/** Құрылғыдағы бір жоба (Android: LocalStore-дағы project_id жазбалары; жұмыс үстелі: .gpkg). */
interface SyncLocal {
    fun snapshot(): List<LocalRecord>
    fun apply(puts: List<LocalRecord>, dels: List<RecordRef>)
    fun meta(): ProjectMeta
    fun setMeta(m: ProjectMeta)
    /** Бұлтта бар id-лі, бірақ әлі ешбір жобаға кірмеген жергілікті жазбаларды осы жобаға алу. */
    fun adopt(refs: List<RecordRef>) {}
}

data class DeviceInfo(val id: String, val name: String = "", val platform: String = "", val app: String = "")

/** Бір жазбаның нұсқасы. */
data class Version(val vv: Map<String, Long>, val h: String = "", val del: Boolean = false, val at: String = "")

/** Қайшылықтағы бір нұсқа; [dev] — құрылғы id-і, [dn] — оның атауы (интерфейсте көрсетіледі). */
data class Side(val vv: Map<String, Long>, val del: Boolean, val d: JsonObject?, val at: String = "", val dev: String = "", val dn: String = "")
data class Conflict(val t: String, val id: String, val since: String, val local: Side, val remote: Side)
data class MetaStamp(val h: String, val updatedAt: String)

/** Бір жобаның (бір сақтау қызметі мен аккаунттағы) синхрондау күйі — құрылғыда сақталады. Пішімі жұмыс үстеліндегімен бірдей. */
class SyncState(val project: String, val device: String) {
    val base = LinkedHashMap<String, Version>()
    val unpub = LinkedHashSet<String>()
    val seen = LinkedHashMap<String, String>()
    val conflicts = LinkedHashMap<String, Conflict>()
    val skipped = LinkedHashMap<String, Map<String, Long>>()
    var meta: MetaStamp? = null
    var republish = false
    var lastSync = ""

    fun toJson(): String = SyncEngine.JSON.encodeToString(JsonElement.serializer(), buildJsonObject {
        put("v", 1); put("project", project); put("device", device)
        put("base", JsonObject(base.mapValues { (_, v) -> buildJsonObject { put("vv", vvJson(v.vv)); put("h", v.h); put("del", v.del); if (v.at.isNotEmpty()) put("at", v.at) } }))
        put("unpub", JsonObject(unpub.associateWith { JsonPrimitive(1) }))
        put("seen", JsonObject(seen.mapValues { JsonPrimitive(it.value) }))
        put("conflicts", JsonObject(conflicts.mapValues { (_, c) -> buildJsonObject {
            put("t", c.t); put("id", c.id); put("since", c.since); put("local", sideJson(c.local)); put("remote", sideJson(c.remote))
        } }))
        put("skipped", JsonObject(skipped.mapValues { vvJson(it.value) }))
        meta?.let { m -> put("meta", buildJsonObject { put("h", m.h); put("updated_at", m.updatedAt) }) } ?: put("meta", JsonNull)
        put("republish", republish); put("last_sync", lastSync)
    })

    companion object {
        internal fun vvJson(vv: Map<String, Long>) = JsonObject(vv.mapValues { JsonPrimitive(it.value) })
        internal fun sideJson(s: Side) = buildJsonObject {
            put("vv", vvJson(s.vv)); put("del", s.del); put("d", s.d ?: JsonNull); put("at", s.at); if (s.dev.isNotEmpty()) put("dev", s.dev); if (s.dn.isNotEmpty()) put("dn", s.dn)
        }
        internal fun vvOf(e: JsonElement?): Map<String, Long> = (e as? JsonObject)?.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.let { p -> (p.longOrNull ?: p.doubleOrNull?.toLong())?.let { k to it } } }?.toMap() ?: emptyMap()
        private fun s(o: JsonObject?, k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""
        private fun b(o: JsonObject?, k: String) = (o?.get(k) as? JsonPrimitive)?.booleanOrNull ?: false
        private fun side(o: JsonObject?) = Side(vvOf(o?.get("vv")), b(o, "del"), o?.get("d") as? JsonObject, s(o, "at"), s(o, "dev"), s(o, "dn"))

        /** Сақталған күй; басқа жобаның не басқа құрылғының күйі болса (не бүлінсе) — жаңа бос күй. */
        fun parse(text: String?, project: String, device: String): SyncState {
            val st = SyncState(project, device)
            val o = runCatching { SyncEngine.JSON.parseToJsonElement(text ?: "").jsonObject }.getOrNull() ?: return st
            if (s(o, "project") != project || s(o, "device") != device) return st
            (o["base"] as? JsonObject)?.forEach { (k, v) -> val x = v as? JsonObject ?: return@forEach; st.base[k] = Version(vvOf(x["vv"]), s(x, "h"), b(x, "del"), s(x, "at")) }
            (o["unpub"] as? JsonObject)?.keys?.let { st.unpub.addAll(it) }
            (o["seen"] as? JsonObject)?.forEach { (k, v) -> st.seen[k] = (v as? JsonPrimitive)?.content ?: "" }
            (o["conflicts"] as? JsonObject)?.forEach { (k, v) -> val x = v as? JsonObject ?: return@forEach
                st.conflicts[k] = Conflict(s(x, "t"), s(x, "id"), s(x, "since"), side(x["local"] as? JsonObject), side(x["remote"] as? JsonObject)) }
            (o["skipped"] as? JsonObject)?.forEach { (k, v) -> st.skipped[k] = vvOf(v) }
            (o["meta"] as? JsonObject)?.let { st.meta = MetaStamp(s(it, "h"), s(it, "updated_at")) }
            st.republish = b(o, "republish"); st.lastSync = s(o, "last_sync")
            return st
        }
    }
}

data class SyncReport(var pulled: Int = 0, var applied: Int = 0, var deleted: Int = 0, var conflicts: Int = 0, var pushed: Boolean = false, var skipped: Int = 0)
data class CloudProject(val id: String, val name: String, val oblast: String, val district: String, val updatedAt: String, val devices: List<String>)

object SyncEngine {
    const val FORMAT = "mura-sync/1"
    val TYPES = setOf("mark", "route")
    private val META = setOf("id", "created_at", "created_by", "updated_at", "updated_by")
    private val ID = Regex("^[0-9a-f]{16}$")
    private val NAME = Regex("^mura\\.([0-9a-f]{16}|index)\\.([0-9a-f]{16})\\.json$")
    internal val JSON = Json { prettyPrint = false; encodeDefaults = true }

    /* ======================= Нұсқа векторы ======================= */
    fun vvCmp(a: Map<String, Long>, b: Map<String, Long>): String {
        var gt = false; var lt = false
        for (k in a.keys + b.keys) { val x = a[k] ?: 0L; val y = b[k] ?: 0L; if (x > y) gt = true else if (x < y) lt = true }
        return if (gt && lt) "cc" else if (gt) "gt" else if (lt) "lt" else "eq"
    }
    fun vvMerge(a: Map<String, Long>, b: Map<String, Long>): Map<String, Long> {
        val o = LinkedHashMap(a); for ((k, v) in b) o[k] = maxOf(o[k] ?: 0L, v); return o
    }
    fun vvBump(vv: Map<String, Long>, dev: String): Map<String, Long> { val o = LinkedHashMap(vv); o[dev] = (o[dev] ?: 0L) + 1; return o }

    /* ======================= Мазмұн ======================= */
    private fun isEmpty(e: JsonElement?) = e == null || e is JsonNull || (e is JsonPrimitive && e.isString && e.content.isEmpty()) || (e is JsonArray && e.isEmpty())

    /** Салыстыруға арналған тұрақты мәтін: кілттер сұрыпталған, бос мәндер алынған, сандар 1e-7-ге дейін (engine.js canon). */
    fun canon(e: JsonElement?): String = when {
        e == null || e is JsonNull -> "null"
        e is JsonPrimitive && e.isString -> JSON.encodeToString(JsonElement.serializer(), e)
        e is JsonPrimitive -> e.booleanOrNull?.toString() ?: e.doubleOrNull?.let { num(it) } ?: "null"
        e is JsonArray -> e.joinToString(",", "[", "]") { canon(it) }
        e is JsonObject -> e.entries.filter { !isEmpty(it.value) }.sortedBy { it.key }
            .joinToString(",", "{", "}") { JSON.encodeToString(JsonElement.serializer(), JsonPrimitive(it.key)) + ":" + canon(it.value) }
        else -> "null"
    }
    private fun num(v: Double): String {
        if (!v.isFinite()) return "null"
        val r = Math.round(v * 1e7) / 1e7
        return if (r == Math.rint(r) && Math.abs(r) < 1e15) r.toLong().toString() else r.toString()
    }
    private fun content(d: JsonObject?) = canon(JsonObject((d ?: JsonObject(emptyMap())).filterKeys { it !in META }))
    fun hashContent(d: JsonObject?): String =
        MessageDigest.getInstance("SHA-1").digest(content(d).toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    fun sameContent(a: JsonObject?, b: JsonObject?) = content(a) == content(b)
    private fun metaHash(m: ProjectMeta) = canon(buildJsonObject { put("name", m.name); put("oblast", m.oblast); put("district", m.district) })

    /* ======================= Файл атаулары ======================= */
    fun dataName(project: String, device: String) = "mura.$project.$device.json"
    fun indexName(device: String) = "mura.index.$device.json"
    data class Name(val kind: String, val project: String, val device: String)
    fun parseName(name: String): Name? {
        val m = NAME.matchEntire(name) ?: return null
        return if (m.groupValues[1] == "index") Name("index", "", m.groupValues[2]) else Name("data", m.groupValues[1], m.groupValues[2])
    }
    fun key(t: String, id: String) = "$t:$id"
    private fun split(k: String) = RecordRef(k.substringBefore(':'), k.substringAfter(':'))

    private class Detected(val cur: LinkedHashMap<String, LocalRecord>, val changed: LinkedHashMap<String, Version>)

    private fun detect(snapshot: List<LocalRecord>, st: SyncState, at: String = ""): Detected {
        val me = st.device
        val cur = LinkedHashMap<String, LocalRecord>(); val changed = LinkedHashMap<String, Version>()
        for (s in snapshot) cur[key(s.t, s.id)] = s
        for ((k, s) in cur) {
            val h = hashContent(s.d); val b = st.base[k]
            if (b == null) changed[k] = Version(vvBump(emptyMap(), me), h, false)
            else if (b.del || b.h != h) changed[k] = Version(vvBump(b.vv, me), h, false)
        }
        for ((k, b) in st.base) if (!b.del && k !in cur) changed[k] = Version(vvBump(b.vv, me), "", true, at)
        return Detected(cur, changed)
    }

    /** Жіберілуі күтіліп тұрған өзгерістер саны (желісіз де есептеледі). */
    fun pendingCount(snapshot: List<LocalRecord>, st: SyncState): Int = (detect(snapshot, st).changed.keys + st.unpub).size

    private class Remote(val vv: Map<String, Long>, val del: Boolean, val d: JsonObject?, val dev: String, val dn: String, val at: String)

    private fun str(o: JsonObject?, k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""

    /**
     * Бір жобаны синхрондау (рет engine.js-тегідей): жүктеу → жергілікті өзгерістер → біріктіру → құрылғыға жазу →
     * күйді сақтау → өз файлын жариялау → күйді сақтау. [files] — cloud.list() нәтижесі (бір циклде бір рет).
     */
    fun syncProject(cloud: CloudStore, files: List<CloudFile>, local: SyncLocal, st: SyncState, device: DeviceInfo,
                    persist: (SyncState) -> Unit = {}, now: () -> String = { Ids.now() }): SyncReport {
        val pid = st.project; val me = device.id
        val mine = dataName(pid, me)
        val rep = SyncReport()
        val seenNext = LinkedHashMap(st.seen)

        /* 1. Басқа құрылғылардың өзгерген файлдары */
        val remote = LinkedHashMap<String, MutableList<Remote>>()
        var remoteMeta: JsonObject? = null
        for (f in files) {
            val p = parseName(f.name) ?: continue
            if (p.kind != "data" || p.project != pid) continue
            if (st.seen[f.name] == f.rev) continue
            if (p.device == me && st.seen.containsKey(f.name)) continue
            val doc = runCatching { JSON.parseToJsonElement(cloud.read(f)) as? JsonObject }.getOrElse { e -> if (e is SyncException) throw e else null }
            seenNext[f.name] = f.rev
            val recs = doc?.get("records") as? JsonArray
            if (doc == null || str(doc, "format") != FORMAT || recs == null) continue
            rep.pulled++
            val dev = str(doc["device"] as? JsonObject, "id").ifEmpty { p.device }
            val dn = str(doc["device"] as? JsonObject, "name")
            val pm = doc["project"] as? JsonObject
            if (pm != null && str(pm, "updated_at").isNotEmpty() && (remoteMeta == null || str(pm, "updated_at") > str(remoteMeta, "updated_at"))) remoteMeta = pm
            for (e in recs) {
                val r = e as? JsonObject ?: continue
                val t = str(r, "t"); val id = str(r, "id")
                if (t !in TYPES || !ID.matches(id) || r["vv"] !is JsonObject) continue
                val del = (r["del"] as? JsonPrimitive)?.booleanOrNull ?: false
                val d = r["d"] as? JsonObject
                if (!del && d == null) continue
                val full = if (del) null else JsonObject(d!! + ("id" to JsonPrimitive(id)))
                remote.getOrPut(key(t, id)) { ArrayList() } += Remote(SyncState.vvOf(r["vv"]), del, full, dev, dn, if (del) str(r, "at") else str(d, "updated_at"))
            }
        }
        if (remote.isNotEmpty()) local.adopt(remote.keys.map(::split))

        /* 2. Жергілікті өзгерістер */
        var snap = local.snapshot()
        val det = detect(snap, st, now())
        val cur = det.cur
        for ((k, v) in det.changed) {
            st.base[k] = v; st.unpub += k
            st.conflicts[k]?.let { c -> st.conflicts[k] = c.copy(local = Side(v.vv, v.del, if (v.del) null else cur[k]!!.d, if (v.del) v.at else str(cur[k]!!.d, "updated_at"))) }
        }

        /* 3. Біріктіру */
        val puts = LinkedHashMap<String, LocalRecord>(); val dels = LinkedHashMap<String, RecordRef>()
        fun accept(k: String, r: Remote) {
            val ref = split(k)
            if (r.del) {
                if (k in cur) dels[k] = ref
                puts.remove(k)
                st.base[k] = Version(r.vv, "", true, r.at)
            } else { dels.remove(k); puts[k] = LocalRecord(ref.t, ref.id, r.d!!); st.base[k] = Version(r.vv, "", false) }
            st.conflicts.remove(k); st.unpub.remove(k); st.skipped.remove(k)
        }
        for ((k, list) in remote) for (r in list) {
            val l = st.base[k]
            if (l == null) { if (r.del) st.base[k] = Version(r.vv, "", true, r.at) else accept(k, r); continue }
            when (vvCmp(l.vv, r.vv)) {
                "eq", "gt" -> continue
                "lt" -> { accept(k, r); continue }
            }
            val ld = puts[k]?.d ?: cur[k]?.d
            if (l.del == r.del && (l.del || sameContent(ld, r.d))) {
                st.base[k] = l.copy(vv = vvMerge(l.vv, r.vv)); st.unpub += k; st.conflicts.remove(k); continue
            }
            val ref = split(k)
            st.conflicts[k] = Conflict(ref.t, ref.id, st.conflicts[k]?.since ?: now(),
                Side(l.vv, l.del, if (l.del) null else ld, if (l.del) l.at else str(ld, "updated_at")),
                Side(r.vv, r.del, r.d, r.at, r.dev, r.dn))
        }
        rep.conflicts = st.conflicts.size

        /* 4. Құрылғыға жазу, қайта оқып хешті сақтау */
        if (puts.isNotEmpty() || dels.isNotEmpty()) {
            local.apply(puts.values.toList(), dels.values.toList())
            rep.applied = puts.size; rep.deleted = dels.size
        }
        val rm = remoteMeta
        if (rm != null && str(rm, "updated_at") > (st.meta?.updatedAt ?: "")) {
            val incoming = ProjectMeta(str(rm, "name"), str(rm, "oblast"), str(rm, "district"))
            if (metaHash(local.meta()) != metaHash(incoming)) local.setMeta(incoming)
            st.meta = MetaStamp(metaHash(local.meta()), str(rm, "updated_at"))
        }
        if (puts.isNotEmpty() || dels.isNotEmpty()) {
            snap = local.snapshot()
            val after = LinkedHashMap<String, LocalRecord>(); for (s in snap) after[key(s.t, s.id)] = s
            for (k in puts.keys) {
                val s = after[k]
                if (s != null) st.base[k] = st.base[k]!!.copy(h = hashContent(s.d))
                else { st.skipped[k] = st.base[k]!!.vv; st.base.remove(k); rep.skipped++ }
            }
            cur.clear(); cur.putAll(after)
        }
        val m = local.meta()
        if (st.meta?.h != metaHash(m)) { st.meta = MetaStamp(metaHash(m), now()); st.republish = true }
        persist(st)

        /* 5. Өз файлын жариялау */
        if (st.unpub.isNotEmpty() || st.republish || files.none { it.name == mine }) {
            val records = buildJsonArray {
                for ((k, b) in st.base) {
                    val ref = split(k)
                    if (b.del) add(buildJsonObject { put("t", ref.t); put("id", ref.id); put("vv", SyncState.vvJson(b.vv)); put("del", true); put("at", b.at) })
                    else cur[k]?.let { s -> add(buildJsonObject { put("t", ref.t); put("id", ref.id); put("vv", SyncState.vvJson(b.vv)); put("d", s.d) }) }
                }
            }
            val doc = buildJsonObject {
                put("format", FORMAT)
                put("project", buildJsonObject { put("id", pid); put("name", m.name); put("oblast", m.oblast); put("district", m.district); put("updated_at", st.meta!!.updatedAt) })
                put("device", deviceJson(device))
                put("written_at", now()); put("records", records)
            }
            val w = cloud.write(mine, JSON.encodeToString(JsonElement.serializer(), doc))
            if (w.rev.isNotEmpty()) seenNext[mine] = w.rev
            st.unpub.clear(); st.republish = false; rep.pushed = true
        }
        st.seen.clear(); st.seen.putAll(seenNext)
        st.lastSync = now()
        persist(st)
        return rep
    }

    /** Қайшылықты шешу: [remote] = true — басқа құрылғының нұсқасы, false — осы құрылғыдағы. Жаңа нұсқа екеуін де қамтиды. */
    fun resolveConflict(local: SyncLocal, st: SyncState, key: String, remote: Boolean, persist: (SyncState) -> Unit = {}): Boolean {
        val c = st.conflicts[key] ?: return false
        val b = st.base[key] ?: Version(c.local.vv, "", c.local.del)
        val vv = vvBump(vvMerge(b.vv, c.remote.vv), st.device)
        val ref = split(key)
        if (remote) {
            if (c.remote.del) { local.apply(emptyList(), listOf(ref)); st.base[key] = Version(vv, "", true) }
            else {
                local.apply(listOf(LocalRecord(ref.t, ref.id, JsonObject(c.remote.d!! + ("id" to JsonPrimitive(ref.id))))), emptyList())
                val s = local.snapshot().firstOrNull { it.t == ref.t && it.id == ref.id }
                st.base[key] = Version(vv, if (s != null) hashContent(s.d) else "", false)
            }
        } else st.base[key] = b.copy(vv = vv)
        st.unpub += key
        st.conflicts.remove(key)
        persist(st)
        return true
    }

    private fun deviceJson(d: DeviceInfo) = buildJsonObject { put("id", d.id); put("name", d.name); put("platform", d.platform); put("app", d.app) }

    /** Құрылғының жобалар тізімі (mura.index.<құрылғы>.json). */
    fun indexDoc(device: DeviceInfo, projects: List<CloudProject>, now: () -> String = { Ids.now() }): String =
        JSON.encodeToString(JsonElement.serializer(), buildJsonObject {
            put("format", FORMAT); put("device", deviceJson(device)); put("written_at", now())
            put("projects", buildJsonArray { for (p in projects) add(buildJsonObject {
                put("id", p.id); put("name", p.name); put("oblast", p.oblast); put("district", p.district); put("updated_at", p.updatedAt) }) })
        })

    /** Бұлттағы жобалар (деректер файлы бар жобалар; атауы — құрылғылар тізімдеріндегі соңғы өзгергені). */
    fun cloudProjects(cloud: CloudStore, files: List<CloudFile>): List<CloudProject> {
        val out = LinkedHashMap<String, CloudProject>()
        for (f in files) { val p = parseName(f.name) ?: continue; if (p.kind == "data" && p.project !in out) out[p.project] = CloudProject(p.project, "", "", "", "", emptyList()) }
        for (f in files) {
            val p = parseName(f.name) ?: continue
            if (p.kind != "index") continue
            val doc = runCatching { JSON.parseToJsonElement(cloud.read(f)) as? JsonObject }.getOrElse { e -> if (e is SyncException) throw e else null } ?: continue
            val dev = str(doc["device"] as? JsonObject, "name")
            for (e in (doc["projects"] as? JsonArray) ?: continue) {
                val x = e as? JsonObject ?: continue
                val id = str(x, "id"); val o = out[id] ?: continue
                val upd = str(x, "updated_at")
                out[id] = if (upd >= o.updatedAt) CloudProject(id, str(x, "name"), str(x, "oblast"), str(x, "district"), upd, o.devices + dev) else o.copy(devices = o.devices + dev)
            }
        }
        return out.values.toList()
    }
}
