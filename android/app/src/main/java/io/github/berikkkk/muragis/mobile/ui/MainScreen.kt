package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.LocationSearching
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import io.github.berikkkk.muragis.mobile.map.MapEvents
import org.maplibre.android.maps.MapView

@Composable
fun MainScreen(vm: MainViewModel, mapView: MapView, act: MainActivity) {
    val ctx = LocalContext.current
    val tab by vm.tab.collectAsState()
    val edit by vm.edit.collectAsState()
    val online by vm.online.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val busy by vm.busy.collectAsState()
    val base by vm.effectiveBase.collectAsState()
    val placing by vm.placing.collectAsState()
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
                if (vm.edit.value == null && vm.tab.value == Tab.MONUMENTS) vm.newMonumentAt(lat, lon)
            }
            override fun onMonumentTap(id: String) {
                if (vm.edit.value != null) vm.addMonumentToRoute(id) else { vm.select(id); if (vm.tab.value != Tab.MONUMENTS) vm.setTab(Tab.MONUMENTS) }
            }
            override fun onRouteTap(id: String) { vm.selectRoute(id); vm.setTab(Tab.ROUTES) }
            override fun onVertexTap(index: Int) = vm.selectVertex(index)
            override fun onVertexMoved(index: Int, lat: Double, lon: Double) = vm.moveVertex(index, lat, lon)
            override fun onCameraIdle(lat: Double, lon: Double, zoom: Double) = vm.rememberCamera(lat, lon, zoom)
            override fun isEditingRoute() = vm.edit.value != null
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
    LaunchedEffect(mapReady, routes, selectedRoute, edit?.base?.id) { if (mapReady) controller.setRoutes(routes, selectedRoute, edit?.base?.id?.ifEmpty { null }) }
    LaunchedEffect(mapReady, edit) { if (mapReady) controller.setEditRoute(edit?.points ?: emptyList(), edit?.selected ?: -1) }
    LaunchedEffect(mapReady, loc, prefs.showLocation) {
        if (mapReady) controller.setLocation(if (prefs.showLocation) loc?.latitude else null, loc?.longitude, loc?.accuracy ?: 0f)
    }
    LaunchedEffect(Unit) {
        vm.messages.collect { m ->
            snack.showSnackbar(ctx.getString(m.res, *m.args.toTypedArray()))
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            NavigationBar {
                listOf(
                    Triple(Tab.MONUMENTS, Icons.Filled.Place, R.string.tab_monuments),
                    Triple(Tab.ROUTES, Icons.Filled.Route, R.string.tab_routes),
                    Triple(Tab.MAPS, Icons.Filled.Map, R.string.tab_maps),
                    Triple(Tab.SETTINGS, Icons.Filled.Settings, R.string.tab_settings),
                ).forEach { (t, icon, label) ->
                    NavigationBarItem(selected = tab == t, onClick = { vm.setTab(t) }, icon = { Icon(icon, null) },
                        label = { Text(stringResource(label), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 11.sp) })
                }
            }
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())

            if (placing) Crosshair()

            if (tab != Tab.SETTINGS) {
                // Жоғарғы күй жолағы: интернет жоқ / фондық жұмыс
                Column(Modifier.align(Alignment.TopCenter).fillMaxWidth()) {
                    if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (!online) Row(
                        Modifier.fillMaxWidth().background(Color(0xCC3B3B3B)).padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(Icons.Filled.WifiOff, null, tint = Color.White, modifier = Modifier.size(16.dp))
                        Text(
                            if (base?.isOffline == true) stringResource(R.string.offline_using, base!!.title) else stringResource(R.string.offline_no_map),
                            color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                // Оң жақ ортақ батырмалар: менің орным, қабаттар
                Column(Modifier.align(Alignment.CenterEnd).padding(end = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SmallFloatingActionButton(onClick = {
                        act.withLocation {
                            vm.updatePrefs { it.copy(showLocation = true) }
                            vm.location.setTracking(true)
                            val l = vm.location.location.value
                            if (l != null) controller.moveTo(l.latitude, l.longitude, maxOf(controller.zoom(), 15.0))
                            else vm.location.requestFix { f -> f?.let { controller.moveTo(it.latitude, it.longitude, maxOf(controller.zoom(), 15.0)) } }
                        }
                    }) { Icon(if (prefs.showLocation) Icons.Filled.MyLocation else Icons.Outlined.LocationSearching, stringResource(R.string.my_location)) }
                    SmallFloatingActionButton(onClick = { vm.setTab(Tab.MAPS) }) { Icon(Icons.Filled.Layers, stringResource(R.string.tab_maps)) }
                }
                // Негізгі картаның атрибуциясы (лицензия талабы) — әрқашан көрінеді
                base?.let { b ->
                    if (b.attribution.isNotBlank()) Surface(
                        color = Color(0xB3FFFFFF), shape = RoundedCornerShape(topEnd = 6.dp),
                        modifier = Modifier.align(Alignment.BottomStart),
                    ) { Text(b.attribution, fontSize = 9.sp, color = Color.DarkGray, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)) }
                }
            }

            when (tab) {
                Tab.MONUMENTS -> MonumentsPane(vm, controller, act)
                Tab.ROUTES -> RoutesPane(vm, controller)
                Tab.MAPS -> MapsPane(vm, controller, act)
                Tab.SETTINGS -> SettingsPane(vm, act)
            }
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
        Icon(Icons.Filled.Add, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(44.dp))
    }
}
