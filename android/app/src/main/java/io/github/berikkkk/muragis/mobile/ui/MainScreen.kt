package io.github.berikkkk.muragis.mobile.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.LocationSearching
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.core.routing.RouteNetwork
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.data.TrackRec
import io.github.berikkkk.muragis.mobile.map.MapController
import io.github.berikkkk.muragis.mobile.map.MapEvents
import kotlinx.coroutines.delay
import org.maplibre.android.maps.MapView

/**
 * Негізгі экран — карта. Үстінде тек: zoom және «Белгі қою» батырмалары (бүйірде), координата жолағы және
 * бес батырмалы құралдар панелі (Мәзір · Дәлдеу · Жазу · Маршрут · Қабаттар). Қалғаны — мәзірде не төменгі парақта.
 */
@Composable
fun MainScreen(vm: MainViewModel, mapView: MapView, act: MainActivity) {
    val ctx = LocalContext.current
    val edit by vm.edit.collectAsState()
    val online by vm.online.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val busy by vm.busy.collectAsState()
    val base by vm.effectiveBase.collectAsState()
    val pick by vm.pick.collectAsState()
    val menu by vm.menu.collectAsState()
    val sheet by vm.sheet.collectAsState()
    val plan by vm.plan.collectAsState()
    val pin by vm.pin.collectAsState()
    val track by vm.track.collectAsState()
    val follow by vm.follow.collectAsState()
    val snack = remember { SnackbarHostState() }

    // Картаның оқиғалары → ViewModel
    val controller = remember {
        MapController(ctx, mapView, object : MapEvents {
            override fun onMapTap(lat: Double, lon: Double) {
                when {
                    vm.edit.value != null -> vm.addPoint(lat, lon)
                    else -> { vm.select(null); vm.selectRoute(null) }
                }
            }
            override fun onMapLongPress(lat: Double, lon: Double) {
                if (vm.edit.value == null && vm.pick.value == null) vm.newMonumentAt(lat, lon)
            }
            override fun onMonumentTap(id: String) {
                if (vm.edit.value != null) vm.addMonumentToRoute(id) else { vm.selectRoute(null); vm.select(id) }
            }
            override fun onRouteTap(id: String) { vm.select(null); vm.selectRoute(id) }
            override fun onVertexTap(index: Int) = vm.selectVertex(index)
            override fun onVertexMoved(index: Int, lat: Double, lon: Double) = vm.moveVertex(index, lat, lon)
            override fun onCameraIdle(lat: Double, lon: Double, zoom: Double) = vm.rememberCamera(lat, lon, zoom)
            override fun isEditingRoute() = vm.edit.value != null
            override fun onUserGesture() = vm.setFollow(false)
            override fun onPinTap() = vm.openSheet(Sheet.Pin)
        })
    }
    var mapReady by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        controller.attach {
            mapReady = true
            val p = vm.prefs.value
            controller.moveTo(p.lastLat, p.lastLon, p.lastZoom, animate = false)
        }
        onDispose { }
    }

    // Деректер → карта
    val style by vm.styleJson.collectAsState()
    val monuments by vm.filteredMonuments.collectAsState()
    val allMonuments by vm.monuments.collectAsState()
    val filter by vm.filter.collectAsState()
    val routes by vm.routes.collectAsState()
    val selected by vm.selected.collectAsState()
    val selectedRoute by vm.selectedRoute.collectAsState()
    val loc by vm.location.location.collectAsState()
    LaunchedEffect(mapReady, style) { if (mapReady && style.isNotEmpty()) controller.applyStyle(style) }
    LaunchedEffect(mapReady, monuments, filter, allMonuments) {
        if (mapReady) controller.setMonuments(if (filter.active) monuments else allMonuments)
    }
    LaunchedEffect(mapReady, selected, allMonuments) { if (mapReady) controller.setSelected(vm.monument(selected)) }
    // Ескерткіш таңдалғанда: белгі карточканың (төменгі парақтың) үстінде көрінетіндей карта жылжиды
    LaunchedEffect(mapReady, selected) {
        val m = vm.monument(selected) ?: return@LaunchedEffect
        if (!mapReady) return@LaunchedEffect
        if (controller.zoom() < 13.0) controller.moveTo(m.lat, m.lon, 15.0, animate = false)
        controller.revealAbove(m.lat, m.lon)
    }
    LaunchedEffect(mapReady, routes, selectedRoute, edit?.base?.id) { if (mapReady) controller.setRoutes(routes, selectedRoute, edit?.base?.id?.ifEmpty { null }) }
    LaunchedEffect(mapReady, edit) { if (mapReady) controller.setEditRoute(edit?.points ?: emptyList(), edit?.selected ?: -1) }
    LaunchedEffect(mapReady, loc, prefs.showLocation) {
        if (mapReady) controller.setLocation(if (prefs.showLocation) loc?.latitude else null, loc?.longitude, loc?.accuracy ?: 0f)
    }
    LaunchedEffect(mapReady, loc, follow) { val l = loc; if (mapReady && follow && l != null) controller.follow(l.latitude, l.longitude) }
    LaunchedEffect(mapReady, plan) {
        if (!mapReady) return@LaunchedEffect
        val p = plan
        val r = p?.result as? RouteNetwork.Result.Ok
        controller.setPlan(
            r?.coords ?: emptyList(), listOfNotNull(r?.offStart?.let { listOf(it.from, it.to) }, r?.offEnd?.let { listOf(it.from, it.to) }),
            p?.a?.takeIf { !it.gps }?.let { LatLon(it.lat, it.lon) }, p?.b?.takeIf { !it.gps }?.let { LatLon(it.lat, it.lon) },
        )
        if (r != null) Geo.bounds(r.fullCoords)?.let { controller.fit(it, 64) }
    }
    LaunchedEffect(mapReady, track?.points) { if (mapReady) controller.setTrack(track?.points ?: emptyList()) }
    LaunchedEffect(mapReady, pin) { if (mapReady) controller.setPin(pin?.let { LatLon(it.lat, it.lon) }) }
    LaunchedEffect(Unit) {
        vm.messages.collect { m -> snack.showSnackbar(ctx.getString(m.res, *m.args.toTypedArray())) }
    }

    // «Артқа»: мәзір беті → мәзір → парақ → таңдау режимі → таңдалған нысан
    BackHandler(enabled = menu != null || sheet != null || pick != null || selected != null || selectedRoute != null) {
        when {
            menu != null -> if (menu != MenuPage.ROOT) vm.openMenu(MenuPage.ROOT) else vm.closeMenu()
            sheet != null -> if (sheet == Sheet.TrackStop) vm.resumeTrack() else vm.openSheet(null)
            pick != null -> when (pick) {
                Pick.EDITOR -> vm.cancelEditorPick()
                Pick.MONUMENT -> vm.setPick(null)
                else -> { vm.setPick(null); vm.openSheet(Sheet.Plan) }
            }
            else -> { vm.select(null); vm.selectRoute(null) }
        }
    }

    val locate: () -> Unit = {
        act.withLocation {
            vm.updatePrefs { it.copy(showLocation = true) }
            vm.location.setTracking(true)
            vm.setFollow(true)
            val l = vm.location.location.value
            if (l != null) controller.moveTo(l.latitude, l.longitude, maxOf(controller.zoom(), 15.0))
            else { vm.toast(R.string.msg_gps_wait); vm.location.requestFix { f -> f?.let { controller.moveTo(it.latitude, it.longitude, maxOf(controller.zoom(), 15.0)) } } }
        }
    }

    val outsideOffline by vm.outsideOffline.collectAsState()
    // Векторлық офлайн карталардағы жазулар интерфейс тілінде
    val ruUi = uiLang() == io.github.berikkkk.muragis.core.model.Lang.RU
    LaunchedEffect(ruUi) { vm.setUiLang(ruUi) }

    Scaffold { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
            if (pick != null) Crosshair()
            if (busy) LinearProgressIndicator(Modifier.align(Alignment.TopCenter).fillMaxWidth())
            // Жүктелген (офлайн) картаның шегінен шыққанда
            if (outsideOffline && edit == null && menu == null && sheet != Sheet.Layers) Text(
                stringResource(R.string.not_downloaded_here), color = Chrome.fg, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 56.dp, start = 16.dp, end = 16.dp)
                    .shadow(6.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(Chrome.bg)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )

            val layersOpen = sheet == Sheet.Layers
            when {
                edit != null -> RoutesPane(vm, controller)
                pick != null -> PickBar(vm, pick!!, controller, act)
                !layersOpen -> {
                    SideButtons(prefs.zoomLeft, onZoom = { controller.zoomBy(it) }, onMark = { vm.setPick(Pick.MONUMENT) })
                    Dock(
                        top = prefs.barTop, online = online, offlineTitle = base?.takeIf { it.isOffline }?.title, attribution = base?.attribution.orEmpty(),
                        loc = if (prefs.showLocation && act.hasLocation()) loc else null, gpsOn = prefs.showLocation && act.hasLocation(),
                        follow = follow, track = track, planActive = plan != null,
                        onMenu = { vm.openMenu() }, onLocate = locate,
                        onRec = {
                            val t = track
                            when {
                                t == null -> act.withLocation {
                                    act.askNotifications()
                                    vm.updatePrefs { it.copy(showLocation = true) }
                                    vm.location.setTracking(true)
                                    vm.startTrack()
                                }
                                t.running -> vm.askStopTrack()
                                else -> vm.openSheet(Sheet.TrackStop)
                            }
                        },
                        onRoute = { act.withLocation { vm.location.setTracking(true) }; vm.openPlan() },
                        onLayers = { vm.openSheet(Sheet.Layers) },
                        onStrip = {
                            val l = loc
                            if (l != null && prefs.showLocation) vm.openSheet(Sheet.Copy(l.latitude, l.longitude, ctx.getString(R.string.copy_title_gps)))
                            else locate()
                        },
                    )
                }
            }

            // Таңдалған ескерткіш / маршрут — төменгі парақ
            if (edit == null && pick == null && sheet == null && menu == null) {
                val m = vm.monument(selected)
                val r = routes.firstOrNull { it.id == selectedRoute }
                if (m != null) MapSheet(onDismiss = { vm.select(null) }, maxHeightFraction = 0.6f) { MonumentCardContent(vm, m, prefs.dataLang, prefs.coordFormatDms) }
                else if (r != null) MapSheet(onDismiss = { vm.selectRoute(null) }, maxHeightFraction = 0.6f) { RouteCardContent(vm, r, controller) }
            }

            when (val s = sheet) {
                is Sheet.Copy -> MapSheet(onDismiss = { vm.openSheet(null) }) { CopySheet(vm, s) }
                Sheet.Layers -> MapsPane(vm, controller, act, onClose = { vm.openSheet(null) })
                Sheet.Plan -> MapSheet(onDismiss = { vm.openSheet(null) }, maxHeightFraction = 0.72f) { PlanSheet(vm, act) }
                Sheet.TrackStop -> track?.let { t -> MapSheet(onDismiss = { vm.resumeTrack() }) { TrackStopSheet(vm, t) } }
                Sheet.Pin -> pin?.let { p -> MapSheet(onDismiss = { vm.openSheet(null) }) { PinSheet(vm, p) } }
                null -> {}
            }

            if (menu != null) MenuScreen(vm, menu!!, controller, act)

            SnackbarHost(snack, Modifier.align(if (prefs.barTop) Alignment.BottomCenter else Alignment.TopCenter).padding(top = 8.dp, bottom = 8.dp))
        }
    }

    // Терезелер (бөлімге тәуелсіз)
    val editor by vm.editor.collectAsState()
    editor?.let { MonumentEditorDialog(vm, it, controller, act) }
    val pending by vm.pending.collectAsState()
    pending?.let { PendingPointsDialog(vm, it) }
    val report by vm.mapImport.collectAsState()
    report?.let { MapImportReportDialog(vm, it, controller) }
}

/** Картаның ортасындағы нысана (нүктені дәл қою үшін картаны жылжытады). */
@Composable
fun Crosshair() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Add, null, tint = Color.White, modifier = Modifier.size(52.dp))
        Icon(Icons.Filled.Add, null, tint = Color(0xFF14130F), modifier = Modifier.size(46.dp))
    }
}

/** Zoom (+/−) және оның астында «Белгі қою»: картаның оң не сол жағында (баптаудан). */
@Composable
private fun BoxScope.SideButtons(left: Boolean, onZoom: (Double) -> Unit, onMark: () -> Unit) {
    Column(
        Modifier.align(if (left) Alignment.CenterStart else Alignment.CenterEnd).padding(horizontal = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.shadow(6.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(Chrome.bg)) {
            ChromeIconButton(Icons.Filled.Add, stringResource(R.string.zoom_in)) { onZoom(1.0) }
            Box(Modifier.width(52.dp).height(1.dp).background(Color(0x17FFFFFF)))
            ChromeIconButton(Icons.Filled.Remove, stringResource(R.string.zoom_out)) { onZoom(-1.0) }
        }
        Box(
            Modifier.size(width = 52.dp, height = 56.dp).shadow(6.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(Chrome.accent)
                .clickable(role = Role.Button, onClickLabel = stringResource(R.string.place_mark), onClick = onMark),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.AddLocationAlt, stringResource(R.string.place_mark), tint = Chrome.onAccent) }
    }
}

@Composable
private fun ChromeIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(width = 52.dp, height = 56.dp).clickable(role = Role.Button, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, label, tint = Chrome.fg)
    }
}

/**
 * Координата жолағы мен құралдар панелі бір блокта: панель төменде болса — жолақ оның дәл үстінде,
 * жоғарыда болса — дәл астында. Жазу жүріп жатса — жолақтың қасында жазу күйі.
 */
@Composable
private fun BoxScope.Dock(
    top: Boolean, online: Boolean, offlineTitle: String?, attribution: String,
    loc: android.location.Location?, gpsOn: Boolean, follow: Boolean, track: TrackRec?, planActive: Boolean,
    onMenu: () -> Unit, onLocate: () -> Unit, onRec: () -> Unit, onRoute: () -> Unit, onLayers: () -> Unit, onStrip: () -> Unit,
) {
    val parts = buildList<@Composable () -> Unit> {
        if (!online) add { OfflineChip(offlineTitle) }
        if (track != null) add { RecRow(track, onRec) }
        add { CoordStrip(loc, gpsOn, onStrip) }
        add { ToolBar(follow, track, planActive, onMenu, onLocate, onRec, onRoute, onLayers) }
    }
    Column(
        Modifier.align(if (top) Alignment.TopCenter else Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        (if (top) parts.reversed() else parts).forEach { it() }
    }
    // Негізгі картаның атрибуциясы (лицензия талабы) — әрқашан көрінеді
    if (attribution.isNotBlank()) Surface(
        color = Color(0xB3FFFFFF), shape = RoundedCornerShape(6.dp),
        modifier = Modifier.align(if (top) Alignment.BottomStart else Alignment.TopStart).padding(4.dp),
    ) { Text(attribution, fontSize = 9.sp, color = Color.DarkGray, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)) }
}

@Composable
private fun OfflineChip(title: String?) {
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xF023241F)).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.Filled.WifiOff, null, tint = Chrome.fg, modifier = Modifier.size(16.dp))
        Text(if (title != null) stringResource(R.string.offline_using, title) else stringResource(R.string.offline_no_map),
            color = Chrome.fg, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun RecRow(t: TrackRec, onStop: () -> Unit) {
    var now by remember { mutableLongStateOf(android.os.SystemClock.elapsedRealtime()) }
    LaunchedEffect(t.running) { while (t.running) { now = android.os.SystemClock.elapsedRealtime(); delay(1000) } }
    Row(
        Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xF023241F)).padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(if (t.running) Chrome.rec else Chrome.dim))
        Text(
            (if (t.running) "" else stringResource(R.string.rec_paused) + " · ") + fmtDuration(t.elapsedMs(now)) + " · " + fmtLength(t.distance),
            color = Chrome.fg, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1,
        )
        Box(Modifier.height(34.dp).clip(RoundedCornerShape(9.dp)).background(Chrome.bg3).clickable(onClick = onStop).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text(stringResource(if (t.running) R.string.rec_stop else R.string.rec_decide), color = Chrome.fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Координата жолағы: тек ондық градус және GPS дәлдігі. Түрткенде бірден көшірмейді — пішім таңдау парағы ашылады. */
@Composable
private fun CoordStrip(loc: android.location.Location?, gpsOn: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(48.dp).shadow(4.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(Color(0xF023241F))
            .clickable(role = Role.Button, onClick = onClick).padding(start = 14.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Filled.Place, null, tint = Chrome.accent, modifier = Modifier.size(18.dp))
        if (loc != null) {
            Text(Utm.formatDd(loc.latitude, loc.longitude), color = Chrome.fg, fontFamily = FontFamily.Monospace, fontSize = 14.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            val acc = loc.accuracy.toInt()
            Box(Modifier.size(8.dp).clip(CircleShape).background(when { acc <= 10 -> Chrome.ok; acc <= 30 -> Chrome.warn; else -> Chrome.rec }))
            Text(stringResource(R.string.accuracy_m, acc), color = Chrome.dim, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        } else {
            Text(stringResource(if (gpsOn) R.string.gps_searching else R.string.gps_tap_enable), color = Chrome.dim, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun ToolBar(follow: Boolean, track: TrackRec?, planActive: Boolean, onMenu: () -> Unit, onLocate: () -> Unit, onRec: () -> Unit, onRoute: () -> Unit, onLayers: () -> Unit) {
    Row(Modifier.fillMaxWidth().shadow(8.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(Chrome.bg).padding(6.dp)) {
        ToolButton(Icons.Filled.Menu, stringResource(R.string.tb_menu), Chrome.fg, onMenu)
        ToolButton(if (follow) Icons.Filled.MyLocation else Icons.Outlined.LocationSearching, stringResource(R.string.tb_locate), if (follow) Chrome.accent else Chrome.fg, onLocate)
        ToolButton(Icons.Filled.FiberManualRecord, stringResource(if (track?.running == true) R.string.tb_recording else R.string.tb_record),
            if (track != null) Chrome.rec else Chrome.fg, onRec)
        ToolButton(Icons.Filled.Route, stringResource(R.string.tb_route), if (planActive) Chrome.accent else Chrome.fg, onRoute)
        ToolButton(Icons.Filled.Layers, stringResource(R.string.tb_layers), Chrome.fg, onLayers)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.ToolButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        Modifier.weight(1f).height(60.dp).clip(RoundedCornerShape(16.dp)).clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(3.dp))
        Text(label, color = tint, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Нысана режимі: жаңа ескерткіш не маршруттың А/Б нүктесі. */
@Composable
private fun BoxScope.PickBar(vm: MainViewModel, pick: Pick, controller: MapController, act: MainActivity) {
    val loc by vm.location.location.collectAsState()
    ChromeTheme {
        Surface(color = Chrome.bg, contentColor = Chrome.fg, shape = RoundedCornerShape(20.dp), shadowElevation = 8.dp,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(10.dp)) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(when (pick) {
                    Pick.MONUMENT -> R.string.pick_mark_hint; Pick.EDITOR -> R.string.pick_editor_hint
                    Pick.PLAN_A -> R.string.pick_a_hint; Pick.PLAN_B -> R.string.pick_b_hint
                }), color = Chrome.dim, fontSize = 14.sp)
                if (pick == Pick.MONUMENT || pick == Pick.EDITOR) BigButton(
                    if (loc != null) stringResource(R.string.pick_my_location_acc, loc!!.accuracy.toInt()) else stringResource(R.string.my_location),
                    Modifier.fillMaxWidth(), icon = { Icon(Icons.Filled.MyLocation, null, Modifier.size(20.dp)) },
                ) {
                    if (pick == Pick.MONUMENT) { vm.setPick(null); act.withLocation { vm.newMonumentAtGps() } }
                    else act.withLocation {
                        vm.toast(R.string.msg_gps_wait)
                        vm.location.requestFix { l -> if (l != null) vm.editorPicked(l.latitude, l.longitude) else vm.toast(R.string.err_no_gps) }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BigButton(stringResource(R.string.cancel), Modifier.weight(1f)) {
                        when (pick) { Pick.EDITOR -> vm.cancelEditorPick(); Pick.MONUMENT -> vm.setPick(null); else -> { vm.setPick(null); vm.openSheet(Sheet.Plan) } }
                    }
                    BigButton(stringResource(R.string.this_point), Modifier.weight(1f), primary = true) {
                        controller.center()?.let { (la, lo) ->
                            when (pick) { Pick.MONUMENT -> vm.newMonumentAt(la, lo); Pick.EDITOR -> vm.editorPicked(la, lo); else -> vm.pickPlanAt(la, lo) }
                        }
                    }
                }
            }
        }
    }
}

fun fmtDuration(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) String.format(java.util.Locale.ROOT, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
    else String.format(java.util.Locale.ROOT, "%02d:%02d", s / 60, s % 60)
}
