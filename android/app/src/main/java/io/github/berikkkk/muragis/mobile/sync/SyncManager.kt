package io.github.berikkkk.muragis.mobile.sync

import android.content.Context
import android.content.Intent
import android.os.Build
import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.sync.CloudProject
import io.github.berikkkk.muragis.core.sync.DeviceInfo
import io.github.berikkkk.muragis.core.sync.Side
import io.github.berikkkk.muragis.core.sync.StoreSyncLocal
import io.github.berikkkk.muragis.core.sync.SyncEngine
import io.github.berikkkk.muragis.core.sync.SyncException
import io.github.berikkkk.muragis.core.sync.SyncState
import io.github.berikkkk.muragis.mobile.util.Connectivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * Синхрондау (Android): аккаунт, синхрондалатын жобалар, кезек және кесте. Ортақ ережелер — core/sync/SyncEngine
 * (жұмыс үстеліндегі main/sync/engine.js-пен бірдей), сақтау қызметі — [GoogleDrive] + [GoogleAuth].
 *
 * Күй сақтау қызметі мен аккаунтқа тиесілі: filesDir/sync/<аккаунт кілті>/registry.json (осы аккаунтта синхрондалатын жобалар)
 * және state-<жоба>.json. Бұлттағы жобалар телефонға өздігінен алынады; телефондағы жоба басқа аккаунтқа тек пайдаланушы
 * «Осы аккаунтқа жүктеу» басқанда жүктеледі. Синхрондау тек қолданба процесі тірі кезде жүреді (фондық қызмет жоқ):
 * өзгерістен кейін, байланыс қалпына келгенде, 5 минут сайын және «Қазір синхрондау» батырмасымен.
 */
class SyncManager(private val ctx: Context, private val storeOf: () -> LocalStore) {
    private val sp = ctx.getSharedPreferences("mura_sync", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    val auth = GoogleAuth(ctx)
    private val drive = GoogleDrive { force -> auth.token(force) }
    private val connectivity = Connectivity(ctx)

    data class Account(val provider: String, val id: String, val email: String, val name: String)
    data class ProjectUi(val id: String, val name: String, val oblast: String, val district: String, val lastSync: String, val pending: Int, val error: String)
    data class ConflictUi(val project: String, val projectName: String, val key: String, val t: String, val local: Side, val remote: Side)
    data class Ui(
        val account: Account? = null, val state: String = "off", val code: String = "", val detail: String = "", val syncing: Boolean = false,
        val lastSync: String = "", val pending: Int = 0, val projects: List<ProjectUi> = emptyList(), val localOnly: List<ProjectUi> = emptyList(),
        val conflicts: List<ConflictUi> = emptyList(), val active: String = "", val unassigned: Int = 0,
    )

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui
    /** Басқа құрылғының өзгерістері жазылды — тізімдер мен картаны қайта оқу керек. */
    private val _applied = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val applied: SharedFlow<Unit> = _applied

    private var state = "off"; private var code = ""; private var detail = ""; private var syncing = false
    private var soon: Job? = null
    @Volatile private var again = false

    /* ---------- Аккаунт, құрылғы ---------- */
    var account: Account?
        get() = sp.getString("account", null)?.let { runCatching { JSONObject(it) }.getOrNull() }?.let {
            Account(it.optString("provider", "gdrive"), it.optString("id"), it.optString("email"), it.optString("name")) }?.takeIf { it.id.isNotEmpty() }
        private set(v) {
            sp.edit().apply { if (v == null) remove("account") else putString("account", JSONObject().put("provider", v.provider).put("id", v.id).put("email", v.email).put("name", v.name).toString()) }.apply()
        }

    val device: DeviceInfo get() {
        var id = sp.getString("device", "") ?: ""
        if (!Ids.isValid(id)) { id = Ids.newId(); sp.edit().putString("device", id).apply() }
        val ver = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: ""
        return DeviceInfo(id, (Build.MANUFACTURER ?: "").replaceFirstChar { it.uppercase() } + " " + (Build.MODEL ?: ""), "android", "Mura GIS Android $ver")
    }

    /** Жаңа ескерткіш пен маршрут жазылатын жоба (бос — жобасыз). */
    var active: String
        get() = sp.getString("active", "") ?: ""
        set(v) { sp.edit().putString("active", v).apply(); storeOf().defaultProject = v; publish() }

    private fun akey(a: Account) = a.provider + "-" + MessageDigest.getInstance("SHA-1").digest(a.id.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)
    private fun adir(a: Account) = File(ctx.filesDir, "sync/" + akey(a)).apply { mkdirs() }

    /* ---------- Файлдар: .tmp → rename, алдыңғы күй .bak ---------- */
    private fun readText(f: File): String? = runCatching { f.readText() }.getOrNull() ?: runCatching { File(f.path + ".bak").readText() }.getOrNull()
    private fun writeText(f: File, s: String) {
        f.parentFile?.mkdirs()
        val tmp = File(f.path + ".tmp"); tmp.writeText(s)
        if (f.exists()) runCatching { f.copyTo(File(f.path + ".bak"), overwrite = true) }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
    }
    private fun registry(a: Account): JSONObject = readText(File(adir(a), "registry.json"))?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject().put("projects", JSONObject())
    private fun saveRegistry(a: Account, r: JSONObject) = writeText(File(adir(a), "registry.json"), r.toString())
    private fun stateFile(a: Account, pid: String) = File(adir(a), "state-$pid.json")
    private fun loadState(a: Account, pid: String) = SyncState.parse(readText(stateFile(a, pid)), pid, device.id)

    /* ---------- Интерфейске ---------- */
    /** Күйді интерфейске жіберу (дерекқор сұраулары — фон ағынында). */
    fun publish() { scope.launch { runCatching { publishNow() } } }

    private fun publishNow() {
        val a = account
        val store = storeOf()
        val all = store.syncProjects()
        if (a == null) { _ui.value = Ui(state = "off", active = active, unassigned = store.unassignedCount(), localOnly = all.map { ProjectUi(it.id, it.name, it.oblast, it.district, "", 0, "") }); return }
        val reg = registry(a).optJSONObject("projects") ?: JSONObject()
        val linked = ArrayList<ProjectUi>(); val conflicts = ArrayList<ConflictUi>()
        for (p in all) {
            val x = reg.optJSONObject(p.id) ?: continue
            val st = loadState(a, p.id)
            val pend = runCatching { SyncEngine.pendingCount(StoreSyncLocal(store, p.id).snapshot(), st) }.getOrDefault(0)
            linked += ProjectUi(p.id, p.name, p.oblast, p.district, st.lastSync, pend, x.optString("error"))
            for ((k, c) in st.conflicts) conflicts += ConflictUi(p.id, p.name, k, c.t, c.local, c.remote)
        }
        _ui.value = Ui(a, state, code, detail, syncing, linked.map { it.lastSync }.filter { it.isNotEmpty() }.maxOrNull() ?: "",
            linked.sumOf { it.pending }, linked, all.filter { reg.optJSONObject(it.id) == null }.map { ProjectUi(it.id, it.name, it.oblast, it.district, "", 0, "") },
            conflicts, active, store.unassignedCount())
    }
    private fun set(s: String, c: String = "", d: String = "") { state = s; code = c; detail = d; publish() }

    /* ---------- Қосу / ажырату ---------- */
    /** Кіру: терезе керек болса — [GoogleAuth.Step.NeedsUser] (MainActivity оны көрсетіп, [finishConnect]-ке қайтарады). */
    suspend fun connect(): GoogleAuth.Step = withContext(Dispatchers.IO) { auth.authorize().also { if (it is GoogleAuth.Step.Granted) completeConnect() } }

    suspend fun finishConnect(data: Intent?) = withContext(Dispatchers.IO) {
        when (auth.fromIntent(data)) { is GoogleAuth.Step.Granted -> completeConnect(); is GoogleAuth.Step.NeedsUser -> throw SyncException("denied") }
    }

    private suspend fun completeConnect() {
        val acc = drive.account()
        account = Account("gdrive", acc.id, acc.email, acc.name)
        set("idle")
        syncNow()
    }

    /** Ажырату: синхрондау тоқтайды, рұқсат қайтарылады; құрылғыдағы жобалар мен деректер сақталады. */
    suspend fun disconnect() = withContext(Dispatchers.IO) {
        mutex.withLock {
            runCatching { auth.signOut() }
            account = null
            set("off")
        }
    }

    /** Жаңа жоба (телефонда құрылады; аккаунт қосулы болса — бірден синхрондалады). */
    fun createProject(name: String): String {
        val id = Ids.newId()
        storeOf().saveSyncProject(LocalStore.SyncProject(id, name.trim()))
        account?.let { a -> val r = registry(a); r.getJSONObject("projects").put(id, JSONObject()); saveRegistry(a, r) }
        active = id
        requestSoon()
        return id
    }

    /** Телефондағы жобаны осы аккаунтқа жүктеу (пайдаланушы келісімімен). */
    fun linkProject(id: String) {
        val a = account ?: return
        val r = registry(a); r.getJSONObject("projects").put(id, JSONObject()); saveRegistry(a, r)
        publish(); requestSoon()
    }

    /** Жобасыз жазбаларды белсенді жобаға қосу (пайдаланушы келісімімен). */
    fun assignUnassigned(): Int {
        val p = active.ifEmpty { return 0 }
        val n = storeOf().assignToProject(p)
        publish(); requestSoon()
        return n
    }

    suspend fun resolve(project: String, key: String, remote: Boolean) = withContext(Dispatchers.IO) {
        val a = account ?: return@withContext
        mutex.withLock {
            val st = loadState(a, project)
            SyncEngine.resolveConflict(StoreSyncLocal(storeOf(), project), st, key, remote) { writeText(stateFile(a, project), it.toJson()) }
        }
        if (remote) _applied.tryEmit(Unit)
        publish(); syncNow()
    }

    /**
     * Сақтық көшірмеден қалпына келтірілді: синхрондау күйі (соңғы синхрондалған нұсқалар) енді дерекқорға сай емес.
     * Күй тасталады — келесі синхрондау алғашқы қосылудағыдай id бойынша біріктіреді: көшірмеде жоқ жазбалар басқа
     * құрылғыларда «өшірілді» болып таралмайды, бұлттағы жазбалар қайта келеді, айырмашылық — қайшылық ретінде көрсетіледі.
     */
    fun afterRestore() {
        File(ctx.filesDir, "sync").listFiles()?.forEach { d -> d.listFiles()?.filter { it.name.startsWith("state-") }?.forEach { it.delete() } }
        requestSoon()
    }

    /* ---------- Кесте ---------- */
    fun start() {
        storeOf().defaultProject = active
        scope.launch { delay(5_000); syncNow() }
        scope.launch { while (true) { delay(5 * 60_000L); syncNow() } }
        scope.launch {
            var was = connectivity.online.value
            connectivity.online.collect { on ->
                if (on && !was) syncNow() else if (!on && account != null && !syncing) set("offline", "offline")
                was = on
            }
        }
        publish()
    }

    /** Жергілікті өзгерістен кейін (LocalStore.onChange): біраздан кейін синхрондау. */
    fun requestSoon() {
        soon?.cancel()
        soon = scope.launch { publish(); delay(4_000); syncNow() }
    }

    suspend fun syncNow(): Unit = withContext(Dispatchers.IO) {
        val a = account ?: return@withContext
        if (!mutex.tryLock()) { again = true; return@withContext }
        try {
            if (!connectivity.online.value) { set("offline", "offline"); return@withContext }
            syncing = true; set("syncing")
            val dev = device
            val store = storeOf()
            store.defaultProject = active
            var applied = false
            var first: SyncException? = null
            try {
                val files = drive.list()
                val reg = registry(a)
                val projects = reg.getJSONObject("projects")
                // Бұлттағы жобалар телефонға алынады
                val cloud = SyncEngine.cloudProjects(drive, files)
                for (c in cloud) {
                    if (store.syncProject(c.id) == null) store.saveSyncProject(LocalStore.SyncProject(c.id, c.name, c.oblast, c.district))
                    if (!projects.has(c.id)) projects.put(c.id, JSONObject())
                }
                for (pid in projects.keys().asSequence().toList()) {
                    val x = projects.getJSONObject(pid)
                    x.put("error", "")
                    if (store.syncProject(pid) == null) continue
                    try {
                        val st = loadState(a, pid)
                        val rep = SyncEngine.syncProject(drive, files, StoreSyncLocal(store, pid), st, dev, persist = { writeText(stateFile(a, pid), it.toJson()) })
                        if (rep.applied + rep.deleted > 0) applied = true
                    } catch (e: SyncException) {
                        x.put("error", e.code); if (first == null) first = e
                        if (e.code in setOf("offline", "auth", "quota", "rate", "server")) break
                    }
                }
                saveRegistry(a, reg)
                if (first == null) {
                    val list = store.syncProjects().filter { projects.has(it.id) }.map { CloudProject(it.id, it.name, it.oblast, it.district, it.updatedAt, emptyList()) }
                    val h = SyncEngine.canon(kotlinx.serialization.json.JsonArray(list.map { kotlinx.serialization.json.JsonPrimitive(it.id + "|" + it.name + "|" + it.oblast + "|" + it.district) }))
                    val mine = SyncEngine.indexName(dev.id)
                    if (reg.optString("index") != h || files.none { it.name == mine }) {
                        drive.write(mine, SyncEngine.indexDoc(dev, list))
                        reg.put("index", h); saveRegistry(a, reg)
                    }
                }
            } catch (e: SyncException) { first = first ?: e } catch (e: Exception) { first = first ?: SyncException("error", e.message ?: e.toString()) }
            syncing = false
            if (applied) _applied.tryEmit(Unit)
            val f = first
            if (f == null) set("idle") else set(when (f.code) { "offline" -> "offline"; "auth" -> "auth"; "quota" -> "quota"; else -> "error" }, f.code, f.message ?: "")
        } finally { syncing = false; mutex.unlock() }
        if (again) { again = false; syncNow() }
    }
}
