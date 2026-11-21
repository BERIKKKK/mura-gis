package io.github.berikkkk.muragis.mobile.ui

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.annotation.StringRes
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import io.github.berikkkk.muragis.core.db.DownloadJob
import io.github.berikkkk.muragis.core.db.JobState
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.gpkg.MuraProject
import io.github.berikkkk.muragis.core.io.FormatException
import io.github.berikkkk.muragis.core.io.ImportedMonument
import io.github.berikkkk.muragis.core.io.ImportedRoute
import io.github.berikkkk.muragis.core.io.MonumentGeoJson
import io.github.berikkkk.muragis.core.io.PointFiles
import io.github.berikkkk.muragis.core.io.PointRecord
import io.github.berikkkk.muragis.core.io.RouteFormats
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Regions
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.core.packages.Catalog
import io.github.berikkkk.muragis.core.packages.CatalogPackage
import io.github.berikkkk.muragis.core.packages.MapCategory
import io.github.berikkkk.muragis.core.packages.MapPackage
import io.github.berikkkk.muragis.core.routing.RouteNetwork
import io.github.berikkkk.muragis.core.model.Sorting
import io.github.berikkkk.muragis.core.model.Status
import io.github.berikkkk.muragis.core.model.ValidationException
import io.github.berikkkk.muragis.core.sources.SourcePolicy
import io.github.berikkkk.muragis.core.tiles.TileMath
import io.github.berikkkk.muragis.core.update.AppUpdate
import io.github.berikkkk.muragis.mobile.BuildConfig
import io.github.berikkkk.muragis.mobile.MuraApp
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.data.AndroidSqlDb
import io.github.berikkkk.muragis.mobile.data.Prefs
import io.github.berikkkk.muragis.mobile.data.TrackRec
import io.github.berikkkk.muragis.mobile.map.RasterSpec
import io.github.berikkkk.muragis.mobile.map.StyleBuilder
import io.github.berikkkk.muragis.mobile.util.Connectivity
import io.github.berikkkk.muragis.mobile.util.HeadingSensor
import io.github.berikkkk.muragis.mobile.util.LocationTracker
import io.github.berikkkk.muragis.mobile.work.DownloadWorker
import io.github.berikkkk.muragis.mobile.work.ImportMapWorker
import io.github.berikkkk.muragis.mobile.work.PackageDownloadWorker
import io.github.berikkkk.muragis.mobile.work.TrackService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Толық экранды мәзірдің беттері. */
enum class MenuPage {
    ROOT, MONUMENTS, ROUTES, COORDS, SETTINGS, ABOUT;

    /** «Артқа» апаратын бет. */
    val parent get() = if (this == ABOUT) SETTINGS else ROOT
}

/** Жаңартуды тексеру күйі. */
sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data object Error : UpdateState
    data class Available(val release: AppUpdate.Release) : UpdateState
}

/** Картаның үстіндегі төменгі парақтар (бір мезгілде біреуі). */
sealed interface Sheet {
    data class Copy(val lat: Double, val lon: Double, val title: String) : Sheet
    data object Layers : Sheet
    data object Plan : Sheet
    data object TrackStop : Sheet
    data object Pin : Sheet
}

/** Картаның ортасындағы нысана арқылы нүкте таңдау: жаңа ескерткіш не маршруттың А/Б нүктесі. */
enum class Pick { MONUMENT, PLAN_A, PLAN_B, EDITOR }

/** Маршрут құрудың басы/соңы. [markId] — ескерткіш болса (желіде ескерткіш түйіні ретінде ізделеді). */
data class PlanPoint(val lat: Double, val lon: Double, val label: String, val markId: String? = null, val gps: Boolean = false)

/** Алдын ала есептелетін маршрут (А → Б). Жолды жазудан бөлек: ол нақты қозғалысты тіркейді. */
data class RoutePlan(
    val a: PlanPoint? = null,
    val b: PlanPoint? = null,
    val vehicle: Vehicle = Vehicle.OFFROAD,
    val wet: Boolean = false,
    /** true — OSM жол графы бойынша (жүктелген пакеттен), false — сақталған маршруттар мен тректер желісі бойынша. */
    val roads: Boolean = true,
    val result: RouteNetwork.Result? = null,
    val busy: Boolean = false,
)

/** Қолмен енгізілген (не іздеуден табылған) нүкте. */
data class InputPin(val lat: Double, val lon: Double)

/** Хабарлама: жол ресурсы + аргументтер (интерфейс тілінде көрсетіледі). */
data class UiMessage(@StringRes val res: Int, val args: List<Any> = emptyList(), val error: Boolean = false)

data class MonumentFilter(
    val query: String = "",
    val types: Set<MonumentType> = emptySet(),
    val categories: Set<Category> = emptySet(),
    val statuses: Set<Status> = emptySet(),
) {
    val active get() = query.isNotBlank() || types.isNotEmpty() || categories.isNotEmpty() || statuses.isNotEmpty()
    fun matches(m: Monument): Boolean =
        (query.isBlank() || m.name.matches(query) || m.period.matches(query) || m.place.matches(query) || m.district.matches(query) || m.oblast.matches(query) || m.note.matches(query)) &&
            (types.isEmpty() || m.type in types) && (categories.isEmpty() || m.category in categories) && (statuses.isEmpty() || m.status in statuses)
}

/** Өңделіп жатқан маршрут (жоба): тарих — «болдырмау» үшін. */
data class RouteEdit(val base: Route, val points: List<RoutePoint>, val selected: Int = -1, val history: List<List<RoutePoint>> = emptyList()) {
    val lengthMeters: Double get() = io.github.berikkkk.muragis.core.geo.Geo.length(points.map { io.github.berikkkk.muragis.core.geo.LatLon(it.lat, it.lon) })
}

/** Импорт алдында тексерілетін бөтен нүктелер (KML, KMZ, GPX, бөтен GeoJSON). */
data class PendingPoints(val file: String, val points: List<PointRecord>)

/** Импортталған карта нәтижесі (тексеру есебі). */
data class MapImportReport(val layer: MapLayer?, val error: String?, val detail: String = "")

enum class ImportTarget { MONUMENTS, ROUTES }

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val g = (app as MuraApp).graph
    val connectivity = Connectivity(app)
    val location = LocationTracker(app)
    val heading = HeadingSensor(app)
    val prefs: StateFlow<Prefs> = g.settings.prefs
    val online: StateFlow<Boolean> = connectivity.online

    private val _menu = MutableStateFlow<MenuPage?>(null); val menu: StateFlow<MenuPage?> = _menu
    private val _sheet = MutableStateFlow<Sheet?>(null); val sheet: StateFlow<Sheet?> = _sheet
    private val _plan = MutableStateFlow<RoutePlan?>(null); val plan: StateFlow<RoutePlan?> = _plan
    private val _pin = MutableStateFlow<InputPin?>(null); val pin: StateFlow<InputPin?> = _pin
    /** «Дәлдеу»: камера GPS нүктесіне ереді; картаны саусақпен жылжытқанда өшеді. */
    private val _follow = MutableStateFlow(false); val follow: StateFlow<Boolean> = _follow
    /** Еру соңғы рет саусақпен өшірілген сәт (elapsedRealtime) — трек жазу кезінде біраз уақыттан кейін ерудің қайта қосылуы үшін. */
    private val _followOffAt = MutableStateFlow(0L); val followOffAt: StateFlow<Long> = _followOffAt
    /** Навигация режимі (компас батырмасы): карта қозғалыс бағытымен бұрылады (әйтпесе солтүстік жоғарыда). */
    private val _headingUp = MutableStateFlow(false); val headingUp: StateFlow<Boolean> = _headingUp
    val track: StateFlow<TrackRec?> = g.recorder.state
    private val _monuments = MutableStateFlow<List<Monument>>(emptyList()); val monuments: StateFlow<List<Monument>> = _monuments
    private val _routes = MutableStateFlow<List<Route>>(emptyList()); val routes: StateFlow<List<Route>> = _routes
    private val _layers = MutableStateFlow<List<MapLayer>>(emptyList()); val layers: StateFlow<List<MapLayer>> = _layers
    private val _jobs = MutableStateFlow<List<DownloadJob>>(emptyList()); val jobs: StateFlow<List<DownloadJob>> = _jobs
    private val _filter = MutableStateFlow(MonumentFilter()); val filter: StateFlow<MonumentFilter> = _filter
    private val _selected = MutableStateFlow<String?>(null); val selected: StateFlow<String?> = _selected
    private val _selectedRoute = MutableStateFlow<String?>(null); val selectedRoute: StateFlow<String?> = _selectedRoute
    private val _edit = MutableStateFlow<RouteEdit?>(null); val edit: StateFlow<RouteEdit?> = _edit
    /** Ескерткіш өңдеу терезесі: жаңа (id жоқ) не бар жазба. */
    private val _editor = MutableStateFlow<Monument?>(null); val editor: StateFlow<Monument?> = _editor
    private val _pending = MutableStateFlow<PendingPoints?>(null); val pending: StateFlow<PendingPoints?> = _pending
    private val _mapImport = MutableStateFlow<MapImportReport?>(null); val mapImport: StateFlow<MapImportReport?> = _mapImport
    private val _busy = MutableStateFlow(false); val busy: StateFlow<Boolean> = _busy
    /** Нүкте таңдау режимі: картаның ортасындағы нысана арқылы дәл орналастыру. */
    private val _pick = MutableStateFlow<Pick?>(null); val pick: StateFlow<Pick?> = _pick
    private val _messages = MutableSharedFlow<UiMessage>(extraBufferCapacity = 8); val messages = _messages.asSharedFlow()
    private val _backups = MutableStateFlow<List<File>>(emptyList()); val backups: StateFlow<List<File>> = _backups

    val filteredMonuments: StateFlow<List<Monument>> = combine(_monuments, _filter, prefs) { list, f, p ->
        Sorting.sortMonuments(list.filter { f.matches(it) }, p.dataLang)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Жүктелген пакеттердің ішінде офлайн жол графы бар ма («Маршрут құру» әдепкі режимі). */
    val hasRoads: StateFlow<Boolean> = _layers.map { ls -> g.roadGraphs(ls).isNotEmpty() }.flowOn(Dispatchers.IO)
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    /** Интернет жоқ кезде офлайн қабатқа автоматты ауысу ескерілген нақты негізгі карта. */
    val effectiveBase: StateFlow<MapLayer?> = combine(_layers, online, prefs) { ls, on, p -> pickBase(ls, on, p) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Интерфейс тілі орысша ма (векторлық карталардағы жазулар тілі осыған қарай). */
    private val _uiRu = MutableStateFlow(false)
    fun setUiLang(ru: Boolean) { _uiRu.value = ru }

    val styleJson: StateFlow<String> = combine(effectiveBase, _layers, online, prefs, _uiRu) { base, ls, on, p, ru -> buildStyle(base, ls, on, p, ru) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, "")

    /** Тегін офлайн карта пакеттерінің каталогы. */
    val catalog: Catalog get() = g.catalog

    /**
     * Карта ортасы көрсетіліп тұрған офлайн картаның (жүктелген пакет не импортталған файл) қамту аумағынан тыс па —
     * «Бұл аумақтың картасы жүктелмеген» хабары үшін.
     */
    val outsideOffline: StateFlow<Boolean> = combine(effectiveBase, prefs) { base, p ->
        val b = base?.takeIf { it.isOffline }?.bounds
        b != null && !b.contains(p.lastLat, p.lastLon)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val store: LocalStore get() = g.store

    init {
        reloadAll()
        restoreDraft()
        observeImports()
        viewModelScope.launch {
            // Жүктеу күйін жаңартып тұру (WorkManager прогресі дерекқорға жазылады)
            WorkManager.getInstance(app).getWorkInfosByTagFlow("download").collect { refreshJobs() }
        }
    }

    private fun msg(@StringRes r: Int, vararg a: Any, error: Boolean = false) { _messages.tryEmit(UiMessage(r, a.toList(), error)) }
    fun toast(@StringRes r: Int, vararg a: Any) = msg(r, *a)
    private fun str(@StringRes r: Int, vararg a: Any): String = getApplication<Application>().getString(r, *a)

    private fun io(block: suspend () -> Unit) = viewModelScope.launch(Dispatchers.IO) {
        try { block() } catch (e: Exception) { msg(R.string.msg_error, e.message ?: e.javaClass.simpleName, error = true) }
    }

    fun reloadAll() = io {
        _monuments.value = store.monuments()
        _routes.value = store.routes()
        _layers.value = g.layers.layers()
        _jobs.value = g.layers.jobs()
        _backups.value = g.backups.list()
    }

    private fun refreshJobs() = io { _jobs.value = g.layers.jobs(); _layers.value = g.layers.layers() }

    /* ======================= Жаңарту (GitHub релиздері) ======================= */
    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle); val update: StateFlow<UpdateState> = _update

    fun checkUpdate() {
        if (_update.value == UpdateState.Checking) return
        _update.value = UpdateState.Checking
        viewModelScope.launch(Dispatchers.IO) {
            _update.value = try {
                val c = URL(AppUpdate.RELEASES_API).openConnection() as HttpURLConnection
                try {
                    c.connectTimeout = 15_000; c.readTimeout = 20_000
                    c.setRequestProperty("User-Agent", "MuraGIS-Android/${BuildConfig.VERSION_NAME}")
                    c.setRequestProperty("Accept", "application/vnd.github+json")
                    if (c.responseCode != 200) UpdateState.Error
                    else AppUpdate.newer(c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }, BuildConfig.VERSION_CODE)
                        ?.let { UpdateState.Available(it) } ?: UpdateState.UpToDate
                } finally { c.disconnect() }
            } catch (e: Exception) { UpdateState.Error }
        }
    }

    /* ======================= Навигация: мәзір және парақтар ======================= */
    fun openMenu(p: MenuPage = MenuPage.ROOT) { _menu.value = p; _sheet.value = null }
    fun closeMenu() { _menu.value = null }
    fun openSheet(s: Sheet?) { _sheet.value = s }
    fun setFollow(on: Boolean) {
        if (!on && _follow.value) _followOffAt.value = android.os.SystemClock.elapsedRealtime()
        _follow.value = on
    }

    /** Компас батырмасы: солтүстік жоғарыда ↔ навигация режимі (карта қозғалыс бағытымен бұрылады, орынға ереді). */
    fun toggleHeadingUp(): Boolean {
        if (_headingUp.value) { _headingUp.value = false; heading.setActive(false); msg(R.string.msg_north_up); return false }
        if (!heading.available) { msg(R.string.err_no_compass); return false }
        _headingUp.value = true
        heading.setActive(true)
        msg(R.string.msg_heading_up)
        return true
    }

    /* ======================= Ескерткіштер ======================= */
    fun setFilter(f: MonumentFilter) { _filter.value = f }
    fun select(id: String?) { _selected.value = id }
    fun monument(id: String?): Monument? = id?.let { i -> _monuments.value.firstOrNull { it.id == i } }

    fun openEditor(m: Monument?) { _editor.value = m; _pick.value = null }
    /** Жаңа ескерткіш: облыс — соңғы таңдалғаны (жұмыс үстеліндегідей, әдепкі — Ақтөбе облысы). */
    fun newMonumentAt(lat: Double, lon: Double) {
        val r = Regions.find(prefs.value.lastOblast) ?: Regions.find(Regions.DEFAULT)
        openEditor(Monument(id = "", lat = lat, lon = lon, oblast = r?.name ?: Localized.EMPTY))
    }

    fun rememberOblast(kk: String) { if (Regions.find(kk) != null && prefs.value.lastOblast != kk) g.settings.update { it.copy(lastOblast = kk) } }

    /** Өңдеу терезесінен «Картада белгілеу»: терезе уақытша жабылады, енгізілген мәліметтер сақталады. */
    private var parkedEditor: Monument? = null
    fun repickInEditor(current: Monument) { parkedEditor = current; _editor.value = null; _menu.value = null; _sheet.value = null; _pick.value = Pick.EDITOR }
    fun editorPicked(lat: Double, lon: Double) { val m = parkedEditor ?: return; parkedEditor = null; _pick.value = null; _editor.value = m.copy(lat = lat, lon = lon) }
    fun cancelEditorPick() { val m = parkedEditor; parkedEditor = null; _pick.value = null; _editor.value = m }
    fun closeEditor() { _editor.value = null }
    fun setPick(p: Pick?) { _pick.value = p; if (p != null) { _sheet.value = null; _menu.value = null } }

    fun saveMonument(m: Monument, done: (Boolean) -> Unit) = io {
        try {
            val saved = store.saveMonument(if (m.id.isEmpty()) m.copy(id = Ids.newId()) else m)
            _monuments.value = store.monuments()
            _selected.value = saved.id
            withContext(Dispatchers.Main) { done(true); _editor.value = null }
            msg(R.string.msg_saved)
        } catch (e: ValidationException) {
            msg(if (e.code == "name") R.string.err_name_required else R.string.err_coords, error = true)
            withContext(Dispatchers.Main) { done(false) }
        }
    }

    fun deleteMonuments(ids: Collection<String>) = io {
        val n = store.deleteMonuments(ids)
        _monuments.value = store.monuments()
        if (_selected.value in ids) _selected.value = null
        msg(R.string.msg_deleted_n, n)
    }

    /** Құрылғының ағымдағы координатасы бойынша жаңа ескерткіш. */
    fun newMonumentAtGps() {
        msg(R.string.msg_gps_wait)
        location.requestFix { loc ->
            if (loc == null) msg(R.string.err_no_gps, error = true)
            else newMonumentAt(loc.latitude, loc.longitude)
        }
    }

    /* ======================= Маршруттар ======================= */
    fun selectRoute(id: String?) { _selectedRoute.value = id }

    fun startNewRoute() { _edit.value = RouteEdit(Route(id = ""), emptyList()); _selectedRoute.value = null; _menu.value = null; _sheet.value = null; saveDraft() }
    fun editRoute(id: String) { _routes.value.firstOrNull { it.id == id }?.let { _edit.value = RouteEdit(it, it.points); _menu.value = null; _sheet.value = null; saveDraft() } }

    private fun change(f: (RouteEdit) -> RouteEdit) {
        val e = _edit.value ?: return
        val n = f(e)
        _edit.value = if (n.points != e.points) n.copy(history = (e.history + listOf(e.points)).takeLast(100)) else n
        saveDraft()
    }

    /** Нүкте қосу: таңдалған нүктеден кейін, әйтпесе соңына. */
    fun addPoint(lat: Double, lon: Double, monumentId: String? = null) = change { e ->
        val p = RoutePoint(lat, lon, monumentId)
        val i = if (e.selected in e.points.indices) e.selected + 1 else e.points.size
        e.copy(points = e.points.toMutableList().apply { add(i, p) }, selected = if (e.selected >= 0) i else -1)
    }

    fun addMonumentToRoute(id: String) {
        val m = monument(id) ?: return
        if (_edit.value == null) startNewRoute()
        addPoint(m.lat, m.lon, m.id)
        msg(R.string.msg_added_to_route, m.name.display(prefs.value.dataLang))
    }

    fun selectVertex(i: Int) = change { it.copy(selected = if (it.selected == i) -1 else i) }
    fun moveVertex(i: Int, lat: Double, lon: Double) = change { e ->
        e.copy(points = e.points.toMutableList().apply { if (i in indices) this[i] = RoutePoint(lat, lon, null) }, selected = i)
    }
    fun deleteVertex(i: Int) = change { e -> e.copy(points = e.points.filterIndexed { k, _ -> k != i }, selected = -1) }
    fun moveVertexOrder(i: Int, delta: Int) = change { e ->
        val j = i + delta
        if (i !in e.points.indices || j !in e.points.indices) e
        else e.copy(points = e.points.toMutableList().apply { val t = this[i]; this[i] = this[j]; this[j] = t }, selected = j)
    }
    fun reverseRoute() = change { e -> e.copy(points = e.points.reversed(), selected = -1) }
    fun undo() {
        val e = _edit.value ?: return
        if (e.history.isEmpty()) return
        _edit.value = e.copy(points = e.history.last(), history = e.history.dropLast(1), selected = -1)
        saveDraft()
    }
    fun cancelEdit() { _edit.value = null; g.settings.routeDraft = null }

    fun saveRoute(meta: Route, done: (Boolean) -> Unit) = io {
        val e = _edit.value ?: return@io
        try {
            val r = store.saveRoute(meta.copy(id = e.base.id.ifEmpty { Ids.newId() }, points = e.points))
            _routes.value = store.routes()
            _edit.value = null
            g.settings.routeDraft = null
            _selectedRoute.value = r.id
            withContext(Dispatchers.Main) { done(true) }
            msg(R.string.msg_saved)
        } catch (ex: ValidationException) {
            msg(R.string.err_route_points, error = true)
            withContext(Dispatchers.Main) { done(false) }
        }
    }

    fun deleteRoute(id: String) = io {
        store.deleteRoute(id)
        _routes.value = store.routes()
        if (_selectedRoute.value == id) _selectedRoute.value = null
        msg(R.string.msg_deleted_n, 1)
    }

    /** Жоба автоматты сақталады (қосымша кенет жабылса, келесі ашылғанда қалпына келеді). */
    private fun saveDraft() {
        val e = _edit.value ?: return
        val o = JSONObject().put("id", e.base.id).put("pts", org.json.JSONArray(e.points.map { p ->
            org.json.JSONArray(listOf(p.lat, p.lon, p.monumentId ?: ""))
        }))
        g.settings.routeDraft = o.toString()
    }

    private fun restoreDraft() = io {
        val s = g.settings.routeDraft ?: return@io
        runCatching {
            val o = JSONObject(s)
            val id = o.optString("id")
            val base = if (id.isNotEmpty()) store.route(id) ?: Route(id = "") else Route(id = "")
            val a = o.getJSONArray("pts")
            val pts = (0 until a.length()).map { i -> a.getJSONArray(i).let { RoutePoint(it.getDouble(0), it.getDouble(1), it.optString(2).ifEmpty { null }) } }
            _edit.value = RouteEdit(base, pts)
            msg(R.string.msg_draft_restored)
        }
    }

    /* ======================= Маршрут құру (А → Б, сақталған маршруттар желісі бойынша) ======================= */
    private var netCache: Triple<List<Route>, List<Monument>, RouteNetwork>? = null
    private fun network(): RouteNetwork {
        val rs = _routes.value; val ms = _monuments.value
        netCache?.let { (r, m, n) -> if (r === rs && m === ms) return n }
        return RouteNetwork.build(rs, ms).also { netCache = Triple(rs, ms, it) }
    }

    fun gpsPoint(): PlanPoint? = location.location.value?.let { PlanPoint(it.latitude, it.longitude, str(R.string.my_location), gps = true) }
    fun monumentPoint(id: String): PlanPoint? = monument(id)?.let { PlanPoint(it.lat, it.lon, it.name.display(prefs.value.dataLang), markId = it.id) }
    fun pinPoint(): PlanPoint? = _pin.value?.let { PlanPoint(it.lat, it.lon, str(R.string.input_point)) }

    /** Маршрут құру парағын ашу. [to] берілсе — Б нүктесі (мыс. ескерткіш карточкасынан «Осы жерге маршрут»). */
    fun openPlan(to: PlanPoint? = null) {
        val cur = _plan.value
        val roads = cur?.roads ?: hasRoads.value
        _plan.value = if (to != null) RoutePlan(a = cur?.a ?: gpsPoint(), b = to, vehicle = cur?.vehicle ?: Vehicle.OFFROAD, wet = cur?.wet ?: false, roads = roads)
        else cur ?: RoutePlan(a = gpsPoint(), roads = roads)
        _selectedRoute.value = null
        _menu.value = null
        _sheet.value = Sheet.Plan
    }

    fun setPlanPoint(isA: Boolean, p: PlanPoint?) { _plan.value = (_plan.value ?: RoutePlan()).let { if (isA) it.copy(a = p, result = null) else it.copy(b = p, result = null) } }
    fun swapPlan() { _plan.value = _plan.value?.let { it.copy(a = it.b, b = it.a, result = null) } }
    fun setPlanOptions(vehicle: Vehicle, wet: Boolean) {
        val p = _plan.value ?: return
        _plan.value = p.copy(vehicle = vehicle, wet = wet, result = null)
        if (p.result != null) buildPlan()
    }

    /** Есептеу желісі: OSM жол графы не сақталған маршруттар. */
    fun setPlanRoads(roads: Boolean) {
        val p = _plan.value ?: return
        if (p.roads == roads) return
        _plan.value = p.copy(roads = roads, result = null)
        if (p.result != null) buildPlan()
    }

    /** Картадағы нысана арқылы таңдалған А/Б нүктесі. */
    fun pickPlanAt(lat: Double, lon: Double) {
        val isA = _pick.value == Pick.PLAN_A
        _pick.value = null
        setPlanPoint(isA, PlanPoint(lat, lon, str(R.string.map_point_label, Coords.decimal(lat, 5), Coords.decimal(lon, 5))))
        _sheet.value = Sheet.Plan
    }

    fun buildPlan() {
        val p = _plan.value ?: return
        val a = p.a ?: return; val b = p.b ?: return
        _plan.value = p.copy(busy = true, result = null)
        io {
            val r = runCatching {
                val from = RouteNetwork.End(a.lat, a.lon, a.markId); val to = RouteNetwork.End(b.lat, b.lon, b.markId)
                val opts = RouteNetwork.Options(p.vehicle, p.wet)
                if (p.roads) g.roadGraphs().firstOrNull { it.covers(a.lat, a.lon) && it.covers(b.lat, b.lon) }?.findPath(from, to, opts)
                    ?: RouteNetwork.Result.Failed(RouteNetwork.Result.Error.NO_GRAPH)
                else network().findPath(from, to, opts)
            }
            _plan.value = _plan.value?.copy(result = r.getOrNull(), busy = false)
            r.exceptionOrNull()?.let { throw it }
        }
    }

    fun clearPlan() { _plan.value = null; _sheet.value = null }

    /** Есептелген маршрутты сақтау: қалыпты маршрут ретінде (кейін өңдеуге болады). */
    fun savePlan() = io {
        val p = _plan.value ?: return@io
        val r = p.result as? RouteNetwork.Result.Ok ?: return@io
        val lang = prefs.value.dataLang
        val pts = Geo.simplify(r.fullCoords, 2.0)
        val route = Route(
            name = Localized.EMPTY.with(lang, (p.a?.label ?: "") + " → " + (p.b?.label ?: "")),
            aName = Localized.EMPTY.with(lang, p.a?.label ?: ""), bName = Localized.EMPTY.with(lang, p.b?.label ?: ""),
            vehicle = p.vehicle,
            points = pts.mapIndexed { i, q -> RoutePoint(q.lat, q.lon, if (i == 0) p.a?.markId else if (i == pts.size - 1) p.b?.markId else null) },
        )
        val saved = store.saveRoute(route)
        _routes.value = store.routes()
        _plan.value = null
        _sheet.value = null
        _selectedRoute.value = saved.id
        msg(R.string.msg_saved)
    }

    /* ======================= Жолды жазу (трек) ======================= */
    fun startTrack() {
        g.recorder.start()
        TrackService.start(getApplication())
        _follow.value = true
        msg(R.string.msg_rec_started)
    }

    /** «Тоқтату»: жазу кідіртіледі, шешім парағы ашылады (сақтау / жалғастыру / жою). */
    fun askStopTrack() {
        g.recorder.pause()
        TrackService.stop(getApplication())
        _sheet.value = Sheet.TrackStop
    }

    fun resumeTrack() {
        g.recorder.resume()
        TrackService.start(getApplication())
        _sheet.value = null
    }

    fun discardTrack() {
        TrackService.stop(getApplication())
        g.recorder.clear()
        _sheet.value = null
        msg(R.string.msg_track_deleted)
    }

    /** Трек маршрут ретінде сақталады (жұмыс үстелімен үйлесімді); extra-дағы «mura_kind: track» — тек тізімде бөлек көрсету үшін. */
    fun saveTrack() = io {
        val t = g.recorder.state.value ?: return@io
        if (t.points.size < 2) { msg(R.string.err_track_short, error = true); return@io }
        val lang = prefs.value.dataLang
        val started = java.time.Instant.ofEpochMilli(t.startedAt).atZone(java.time.ZoneId.systemDefault())
        val title = str(R.string.track_name, started.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
        val extra = JSONObject().put(TRACK_KIND_KEY, TRACK_KIND).put("recorded_at", java.time.Instant.ofEpochMilli(t.startedAt).toString())
            .put("duration_s", t.elapsedMs() / 1000).toString()
        val saved = store.saveRoute(Route(name = Localized.EMPTY.with(lang, title), points = Geo.simplify(t.points, 3.0).map { RoutePoint(it.lat, it.lon) }, extra = extra))
        withContext(Dispatchers.Main) {
            TrackService.stop(getApplication())
            g.recorder.clear()
            _sheet.value = null
        }
        _routes.value = store.routes()
        _selectedRoute.value = saved.id
        msg(R.string.msg_track_saved)
    }

    /* ======================= Координата енгізу, енгізілген нүкте ======================= */
    fun showPin(lat: Double, lon: Double) { _pin.value = InputPin(lat, lon); _menu.value = null; _sheet.value = null; _follow.value = false }
    fun clearPin() { _pin.value = null; _sheet.value = null }

    /* ======================= Карта қабаттары ======================= */
    private fun pickBase(ls: List<MapLayer>, on: Boolean, p: Prefs): MapLayer? {
        val chosen = ls.firstOrNull { it.role == LayerRole.BASE && it.visible }
        if (on || chosen == null || chosen.isOffline) return chosen
        // Интернет жоқ: бұрын таңдалған офлайн карта, әйтпесе көрінетін аумақты қамтитын бірінші офлайн карта
        val offline = ls.filter { it.isOffline && it.role == LayerRole.BASE && File(it.path).isFile }
        return offline.firstOrNull { it.id == p.offlineBaseId }
            ?: offline.firstOrNull { it.bounds?.contains(p.lastLat, p.lastLon) == true }
            ?: offline.firstOrNull()
            ?: chosen
    }

    fun isAvailable(l: MapLayer, on: Boolean = online.value) = if (l.isOffline) File(l.path).isFile else on

    private fun spec(l: MapLayer): RasterSpec? =
        if (l.isOffline) StyleBuilder.offlineSpec(l, g.server.template(l.id))
        else g.sourceOf(l)?.let { StyleBuilder.onlineSpec(l, it) }

    private fun buildStyle(base: MapLayer?, ls: List<MapLayer>, on: Boolean, p: Prefs, ru: Boolean): String {
        val overlays = ls.filter { it.role == LayerRole.OVERLAY && it.visible && isAvailable(it, on) }.sortedBy { it.sort }.mapNotNull { spec(it) }
        // Векторлық офлайн пакет: стилі, қаріптері мен белгішелері пакеттің өзінен (жергілікті сервер арқылы)
        val vector = base?.takeIf { it.isOffline && it.format == LayerFormat.MBTILES && File(it.path).isFile }
            ?.let { b -> packageStyle(b.id)?.let { MapPackage.resolveStyle(it, g.server.baseUrl, b.id, ru) } }
        return StyleBuilder.build(base?.let { spec(it) }, overlays, p.cluster, vector)
    }

    private val styleCache = HashMap<String, String?>()
    private fun packageStyle(id: String): String? = synchronized(styleCache) { styleCache.getOrPut(id) { g.tiles.packageStyle(id) } }

    /** Қабаттың санаты («Карта қабаттары» панеліндегі топ). */
    fun categoryOf(l: MapLayer): MapCategory = MapCategory.of(l, g.catalog)

    /** Жүктелген пакеттің каталогтағы жазбасы (атауы екі тілде, дереккөзі, лицензиясы). */
    fun packageOf(l: MapLayer): CatalogPackage? = Catalog.packageIdOf(l.sourceId)?.let { g.catalog.pkg(it) }

    /** Құрылғыдағы бос орын (карта файлдары сақталатын жерде). */
    fun freeSpace(): Long = runCatching { android.os.StatFs(g.mapsDir.path).availableBytes }.getOrDefault(0L)

    /** Пакет жүктелген не жүктеліп жатыр ма. */
    fun packageState(p: CatalogPackage): Pair<MapLayer?, DownloadJob?> {
        val sid = Catalog.sourceIdOf(p)
        return _layers.value.firstOrNull { it.sourceId == sid && File(it.path).isFile } to
            _jobs.value.firstOrNull { it.sourceId == sid && it.state != JobState.COMPLETED && it.state != JobState.CANCELLED }
    }

    /** Каталогтағы пакетті жүктеуді бастау (алдын ала бос орын тексеріледі). */
    fun startPackageDownload(p: CatalogPackage, lang: Lang) = io {
        val (layer, job) = packageState(p)
        if (layer != null || job != null) return@io
        if (p.size > 0 && freeSpace() < p.size + 32L * 1024 * 1024) { msg(R.string.err_no_space, error = true); return@io }
        val j = DownloadJob(sourceId = Catalog.sourceIdOf(p), layerId = Ids.newId(), title = p.title.of(lang), bounds = p.bounds,
            minZoom = p.minZoom, maxZoom = p.maxZoom, total = p.size)
        g.layers.saveJob(j)
        PackageDownloadWorker.enqueue(getApplication(), j.id)
        _jobs.value = g.layers.jobs()
        msg(R.string.msg_download_started)
    }

    private fun isPackageJob(j: DownloadJob) = Catalog.packageIdOf(j.sourceId) != null
    private fun stopWorker(j: DownloadJob) = if (isPackageJob(j)) PackageDownloadWorker.stop(getApplication(), j.id) else DownloadWorker.stop(getApplication(), j.id)
    private fun startWorker(j: DownloadJob) = if (isPackageJob(j)) PackageDownloadWorker.enqueue(getApplication(), j.id) else DownloadWorker.enqueue(getApplication(), j.id)

    fun setBase(id: String) = io {
        for (l in g.layers.layers()) if (l.role == LayerRole.BASE && (l.visible != (l.id == id))) g.layers.save(l.copy(visible = l.id == id))
        val l = g.layers.layer(id)
        if (l?.isOffline == true) g.settings.update { it.copy(offlineBaseId = id) }
        _layers.value = g.layers.layers()
    }

    fun toggleOverlay(id: String, on: Boolean) = io {
        g.layers.layer(id)?.let { g.layers.save(it.copy(visible = on)) }
        _layers.value = g.layers.layers()
    }

    /** Мөлдірлік: дерекқорға жазылады (стиль қайта құрылмайды — оны MapController тікелей өзгертеді). */
    fun setOpacity(id: String, v: Double) = io {
        g.layers.layer(id)?.let { g.layers.save(it.copy(opacity = v)) }
    }

    fun commitOpacity() = io { _layers.value = g.layers.layers() }

    fun setRole(id: String, role: LayerRole) = io {
        g.layers.layer(id)?.let { g.layers.save(it.copy(role = role, visible = false)) }
        _layers.value = g.layers.layers()
    }

    fun toggleInvertY(id: String) = io {
        g.layers.layer(id)?.let { g.layers.save(it.copy(tms = !it.tms)); g.tiles.invalidate(id) }
        _layers.value = g.layers.layers()
        bumpStyle()
    }

    fun setPreferredOffline(id: String) = g.settings.update { it.copy(offlineBaseId = id) }

    /** Тайлдар өзгергенде стильді қайта жүктеу үшін (URL-ге белгі қосылмайды, бірақ MapLibre кэшін тазалау қажет емес — no-store). */
    private fun bumpStyle() { _layers.value = _layers.value.toList() }

    fun deleteLayer(id: String) = io {
        val l = g.layers.layer(id) ?: return@io
        if (l.kind == LayerKind.ONLINE && !l.id.startsWith("b-")) { g.layers.delete(id) }
        else if (l.isOffline) {
            g.layers.jobs().filter { it.layerId == id }.forEach { stopWorker(it); g.layers.deleteJob(it.id) }
            synchronized(styleCache) { styleCache.remove(id) }
            if (g.settings.prefs.value.offlineBaseId == id) g.settings.update { it.copy(offlineBaseId = "") }
            // Өшірілген негізгі карта таңдаулы болса — кіріктірілген онлайн картаға қайту
            if (l.visible && l.role == LayerRole.BASE) g.layers.layer("b-osm")?.let { g.layers.save(it.copy(visible = true)) }
            g.tiles.invalidate(id)
            File(l.path).delete()
            g.layers.delete(id)
        }
        _layers.value = g.layers.layers(); _jobs.value = g.layers.jobs()
        msg(R.string.msg_layer_deleted)
    }

    fun addCustomSource(title: String, url: String, attribution: String, license: String, maxZoom: Int, overlay: Boolean, offlineRight: Boolean) = io {
        val u = url.trim()
        val bad = !(u.startsWith("https://") || u.startsWith("http://")) || !u.contains("{z}") || !u.contains("{x}") || !(u.contains("{y}") || u.contains("{-y}"))
        if (bad) { msg(R.string.err_bad_url, error = true); return@io }
        g.layers.save(MapLayer(kind = LayerKind.ONLINE, format = LayerFormat.XYZ_URL, title = title.ifBlank { SourcePolicy.host(u) ?: "XYZ" }, url = u,
            attribution = attribution.trim(), license = license.trim(), maxZoom = maxZoom.coerceIn(1, 22),
            role = if (overlay) LayerRole.OVERLAY else LayerRole.BASE, offlineRight = offlineRight, sort = 500))
        _layers.value = g.layers.layers()
        val p = SourcePolicy.forCustom(u, offlineRight, maxZoom)
        if (offlineRight && !p.allowed) msg(R.string.msg_source_download_blocked, error = true) else msg(R.string.msg_saved)
    }

    fun policyOf(l: MapLayer) = g.policyOf(l)

    /** Жүктелетін тайлдар саны және шамамен көлемі (орташа растр тайлы ~ 20 КБ). */
    fun estimate(b: Bounds, minZ: Int, maxZ: Int): Pair<Long, Long> {
        val n = TileMath.count(b, minZ, maxZ)
        return n to n * 20_000L
    }

    fun startDownload(source: MapLayer, b: Bounds, minZ: Int, maxZ: Int, title: String) = io {
        val src = g.sourceOf(source)
        if (src == null || !src.policy.allowed) { msg(R.string.err_download_not_allowed, error = true); return@io }
        SourcePolicy.checkJob(src, b, minZ, maxZ)?.let { code ->
            msg(if (code == "too_many_tiles") R.string.err_too_many_tiles else R.string.err_bad_zoom, error = true); return@io
        }
        val layerId = Ids.newId()
        val file = File(g.mapsDir, "$layerId.mbtiles")
        g.layers.save(MapLayer(id = layerId, kind = LayerKind.DOWNLOADED, format = LayerFormat.MBTILES, title = title.ifBlank { src.title },
            path = file.path, sourceId = source.id, minZoom = minZ, maxZoom = maxZ, bounds = b, attribution = src.attribution,
            license = src.terms, role = source.role, sort = 900))
        val job = DownloadJob(sourceId = source.id, layerId = layerId, title = title.ifBlank { src.title }, bounds = b, minZoom = minZ, maxZoom = maxZ,
            total = TileMath.count(b, minZ, maxZ))
        g.layers.saveJob(job)
        DownloadWorker.enqueue(getApplication(), job.id)
        _layers.value = g.layers.layers(); _jobs.value = g.layers.jobs()
        msg(R.string.msg_download_started)
    }

    fun pauseDownload(id: String) = io {
        val j = g.layers.job(id) ?: return@io
        g.layers.saveJob(j.copy(state = JobState.PAUSED))
        stopWorker(j)
        _jobs.value = g.layers.jobs()
    }

    fun resumeDownload(id: String) = io {
        val j = g.layers.job(id) ?: return@io
        g.layers.saveJob(j.copy(state = JobState.QUEUED, error = ""))
        startWorker(j)
        _jobs.value = g.layers.jobs()
    }

    /** Болдырмау: жұмыс тоқтатылады, жартылай жүктелген файл мен қабат өшіріледі. */
    fun cancelDownload(id: String) = io {
        val j = g.layers.job(id) ?: return@io
        g.layers.saveJob(j.copy(state = JobState.CANCELLED))
        stopWorker(j)
        kotlinx.coroutines.delay(500)
        if (isPackageJob(j)) PackageDownloadWorker.partFile(g.mapsDir, j).delete()
        g.layers.layer(j.layerId)?.let { l -> g.tiles.invalidate(l.id); File(l.path).delete(); g.layers.delete(l.id) }
        g.layers.deleteJob(id)
        _jobs.value = g.layers.jobs(); _layers.value = g.layers.layers()
    }

    fun removeJobRecord(id: String) = io { g.layers.deleteJob(id); _jobs.value = g.layers.jobs() }

    fun importMap(uri: Uri, tree: Boolean, tms: Boolean, projection: String, role: LayerRole) {
        ImportMapWorker.enqueue(getApplication(), uri, tree, tms, projection, role)
        _busy.value = true
        msg(R.string.msg_import_started)
    }

    private val seenImports = HashSet<java.util.UUID>()
    private fun observeImports() = viewModelScope.launch {
        var first = true
        WorkManager.getInstance(getApplication()).getWorkInfosByTagFlow(ImportMapWorker.TAG).collect { infos ->
            _busy.value = infos.any { !it.state.isFinished }
            // Бұрынғы сессиялардан қалған (аяқталған) нәтижелер қайта көрсетілмейді
            if (first) { infos.filter { it.state.isFinished }.forEach { seenImports += it.id }; first = false }
            for (w in infos) {
                if (!w.state.isFinished || !seenImports.add(w.id)) continue
                if (w.state == WorkInfo.State.SUCCEEDED) {
                    val id = w.outputData.getString("layerId")
                    val l = withContext(Dispatchers.IO) { id?.let { g.layers.layer(it) } }
                    _layers.value = withContext(Dispatchers.IO) { g.layers.layers() }
                    if (l != null) _mapImport.value = MapImportReport(l, null)
                } else if (w.state == WorkInfo.State.FAILED) {
                    _mapImport.value = MapImportReport(null, w.outputData.getString("error") ?: "io", w.outputData.getString("detail") ?: "")
                }
            }
        }
    }

    fun dismissMapImport() { _mapImport.value = null }

    /* ======================= Импорт / экспорт ======================= */
    private fun displayName(uri: Uri): String = runCatching {
        getApplication<Application>().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: (uri.lastPathSegment ?: "file")

    private fun readBytes(uri: Uri): ByteArray =
        getApplication<Application>().contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw FormatException("io")

    private fun copyToCache(uri: Uri, ext: String): File {
        val f = File(g.exportsDir, "in-" + System.nanoTime() + "." + ext)
        getApplication<Application>().contentResolver.openInputStream(uri)?.use { i -> f.outputStream().use { o -> i.copyTo(o) } } ?: throw FormatException("io")
        return f
    }

    private fun formatError(e: FormatException) = msg(when (e.code) {
        "xml" -> R.string.err_xml; "json", "geojson" -> R.string.err_json; "kmz", "kmz_no_kml" -> R.string.err_kmz
        "gpkg_not", "gpkg_no_layers" -> R.string.err_not_project; else -> R.string.err_unknown_format
    }, error = true)

    /**
     * Ескерткіштер/маршруттар файлын импорттау. [lang] — файлдағы бір тілді мәтіндердің тілі
     * (екі тілдік өрістері бар Mura файлдарында екі тіл де өз орнына түседі).
     */
    fun importData(uri: Uri, target: ImportTarget, lang: Lang) = io {
        _busy.value = true
        try {
            val name = displayName(uri)
            val ext = name.substringAfterLast('.', "").lowercase()
            when (ext) {
                "gpkg" -> {
                    val f = copyToCache(uri, "gpkg")
                    try {
                        AndroidSqlDb.openReadOnly(f).use { db ->
                            MuraProject.requireProject(db)
                            val a = store.importMonuments(MuraProject.readMarks(db, lang))
                            val b = store.importRoutes(MuraProject.readRoutes(db, lang))
                            msg(R.string.msg_import_project, a.added, a.updated, b.added, b.updated)
                        }
                    } finally { f.delete() }
                }
                "geojson", "json" -> {
                    val text = readBytes(uri).toString(Charsets.UTF_8)
                    if (target == ImportTarget.ROUTES) reportRoutes(RouteFormats.parseGeoJson(text, lang))
                    else {
                        val root = kotlinx.serialization.json.Json.parseToJsonElement(text)
                        if (MonumentGeoJson.isMura(root)) reportMonuments(MonumentGeoJson.parse(root, lang))
                        else _pending.value = PendingPoints(name, PointFiles.parseGeoJson(root, name))
                    }
                }
                "kml" -> {
                    val t = readBytes(uri).toString(Charsets.UTF_8)
                    if (target == ImportTarget.ROUTES) reportRoutes(RouteFormats.parseKml(t, lang)) else _pending.value = PendingPoints(name, PointFiles.parseKml(t, name))
                }
                "kmz" -> {
                    val b = readBytes(uri)
                    if (target == ImportTarget.ROUTES) reportRoutes(RouteFormats.parseKmz(b, lang)) else _pending.value = PendingPoints(name, PointFiles.parseKmz(b, name))
                }
                "gpx" -> {
                    val t = readBytes(uri).toString(Charsets.UTF_8)
                    if (target == ImportTarget.ROUTES) reportRoutes(RouteFormats.parseGpx(t, lang)) else _pending.value = PendingPoints(name, PointFiles.parseGpx(t, name))
                }
                else -> msg(R.string.err_unknown_format, error = true)
            }
            if (_pending.value?.points?.isEmpty() == true) { _pending.value = null; msg(R.string.msg_nothing_found, error = true) }
        } catch (e: FormatException) {
            formatError(e)
        } catch (e: kotlinx.serialization.SerializationException) {
            msg(R.string.err_json, error = true)
        } finally {
            _monuments.value = store.monuments(); _routes.value = store.routes()
            _busy.value = false
        }
    }

    private fun reportMonuments(list: List<ImportedMonument>) {
        val r = store.importMonuments(list)
        msg(R.string.msg_import_result, r.added, r.updated, r.skipped)
    }

    private fun reportRoutes(list: List<ImportedRoute>) {
        if (list.isEmpty()) { msg(R.string.msg_nothing_found, error = true); return }
        val r = store.importRoutes(list)
        msg(R.string.msg_import_result, r.added, r.updated, r.skipped)
    }

    /** Бөтен нүктелерді ескерткішке айналдыру: атауы — [lang] тіліндегі өріске, сипаттамасы — ескертпеге. */
    fun importPending(indices: Set<Int>, lang: Lang, type: MonumentType, category: Category, status: Status) = io {
        val p = _pending.value ?: return@io
        val list = p.points.filterIndexed { i, _ -> i in indices }.map {
            ImportedMonument(Monument(lat = it.lat, lon = it.lon, name = Localized.of(lang, it.name.ifBlank { p.file }),
                note = Localized.of(lang, it.desc), type = type, category = category, status = status), setOf(lang), false)
        }
        _pending.value = null
        reportMonuments(list)
        _monuments.value = store.monuments()
    }

    fun dismissPending() { _pending.value = null }

    enum class ExportFormat(val ext: String, val mime: String) {
        GEOJSON("geojson", "application/geo+json"), KML("kml", "application/vnd.google-earth.kml+xml"),
        GPX("gpx", "application/gpx+xml"), GPKG("gpkg", "application/geopackage+sqlite3")
    }

    /** Экспорт: ескерткіштер (сүзгі бойынша не барлығы) / маршруттар → Storage Access Framework арқылы таңдалған файлға. */
    fun export(uri: Uri, target: ImportTarget, format: ExportFormat, lang: Lang, onlyFiltered: Boolean, routeId: String? = null) = io {
        _busy.value = true
        try {
            val cr = getApplication<Application>().contentResolver
            val mons = if (onlyFiltered) filteredMonuments.value else store.monuments()
            val rts = store.routes().filter { routeId == null || it.id == routeId }
            val title = if (target == ImportTarget.MONUMENTS) "Mura GIS" else "Mura GIS routes"
            if (format == ExportFormat.GPKG) {
                val f = File(g.exportsDir, "export-" + System.nanoTime() + ".gpkg")
                AndroidSqlDb.create(f).use { db ->
                    MuraProject.export(db, if (target == ImportTarget.MONUMENTS) mons else store.monuments(), if (target == ImportTarget.ROUTES) rts else rts, lang, "Mura GIS Android")
                }
                cr.openOutputStream(uri, "wt")?.use { o -> f.inputStream().use { it.copyTo(o) } }
                f.delete()
            } else {
                val text = when (target) {
                    ImportTarget.MONUMENTS -> when (format) {
                        ExportFormat.KML -> MonumentGeoJson.exportKml(mons, lang, title)
                        else -> MonumentGeoJson.export(mons, lang, title)
                    }
                    ImportTarget.ROUTES -> when (format) {
                        ExportFormat.GPX -> RouteFormats.toGpx(rts, lang, title, store.monuments().associateBy { it.id })
                        ExportFormat.KML -> RouteFormats.toKml(rts, lang, title)
                        else -> RouteFormats.toGeoJson(rts, lang, title)
                    }
                }
                cr.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
            }
            msg(R.string.msg_exported)
        } finally { _busy.value = false }
    }

    /* ======================= Баптаулар ======================= */
    fun updatePrefs(f: (Prefs) -> Prefs) = g.settings.update(f)

    fun createBackup() = io { g.backups.create(g.db); g.settings.lastBackup = System.currentTimeMillis(); _backups.value = g.backups.list(); msg(R.string.msg_backup_done) }

    fun restoreBackup(f: File) = io {
        g.restoreBackup(f)
        reloadAll()
        msg(R.string.msg_backup_restored)
    }

    companion object {
        const val TRACK_KIND_KEY = "mura_kind"
        const val TRACK_KIND = "track"
        fun isTrack(r: Route): Boolean = r.extra.contains(TRACK_KIND) && runCatching { JSONObject(r.extra).optString(TRACK_KIND_KEY) == TRACK_KIND }.getOrDefault(false)
    }

    fun rememberCamera(lat: Double, lon: Double, zoom: Double) = g.settings.update { it.copy(lastLat = lat, lastLon = lon, lastZoom = zoom) }

    override fun onCleared() {
        location.setTracking(false)
        heading.setActive(false)
        super.onCleared()
    }
}
