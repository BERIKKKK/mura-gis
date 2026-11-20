package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.io.lengthMeters
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController

/** Маршрутты қолмен сызу (өңдеу) режимі — картаның үстінде. */
@Composable
fun RoutesPane(vm: MainViewModel, controller: MapController) {
    val edit by vm.edit.collectAsState()
    Box(Modifier.fillMaxSize()) {
        edit?.let { RouteEditorPanel(vm, it, controller) }
    }
}

@Composable
private fun seasonLabel(s: Season) = stringResource(when (s) { Season.ALL -> R.string.s_all; Season.DRY -> R.string.s_dry })

/** Таңдалған маршрут не трек карточкасы (картадағы төменгі парақтың ішінде). */
@Composable
fun RouteCardContent(vm: MainViewModel, r: Route, controller: MapController) {
    val prefs by vm.prefs.collectAsState()
    var exportOne by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val lang = prefs.dataLang
    val track = MainViewModel.isTrack(r)
    SheetHeader(r.name.display(lang).ifBlank { "—" }, stringResource(if (track) R.string.kind_track else R.string.kind_route)) { vm.selectRoute(null) }
    val ab = listOf(r.aName.display(lang), r.bName.display(lang)).filter { it.isNotBlank() }.joinToString(" → ")
    if (ab.isNotBlank()) Text(ab)
    Text(stringResource(R.string.route_summary, fmtLength(r.lengthMeters()), r.points.size, vehicleLabel(r.vehicle), seasonLabel(r.season)))
    if (r.checked.isNotBlank()) Text(stringResource(R.string.route_checked, r.checked), style = MaterialTheme.typography.bodySmall)
    if (r.note.display(lang).isNotBlank()) Text(r.note.display(lang), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
    Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { vm.editRoute(r.id) }) { Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.edit)) }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = { Geo.bounds(r.points.map { LatLon(it.lat, it.lon) })?.let { controller.fit(it) } }) { Icon(Icons.Filled.ZoomOutMap, stringResource(R.string.zoom_to)) }
        IconButton(onClick = { exportOne = true }) { Icon(Icons.Filled.FileUpload, stringResource(R.string.export_data)) }
        IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete), tint = MaterialTheme.colorScheme.error) }
    }
    if (exportOne) DataDialogs(vm, DataDialog.EXPORT, ImportTarget.ROUTES, false, routeId = r.id) { exportOne = false }
    if (confirmDelete) ConfirmDialog(stringResource(R.string.confirm_delete_route, r.name.display(lang)), stringResource(R.string.delete),
        onConfirm = { vm.deleteRoute(r.id) }, onDismiss = { confirmDelete = false })
}

/** Маршрутты картада өңдеу: картаны басу — нүкте қосу, нүктені сүйреу — жылжыту, ескерткішті басу — ескерткішті қосу. */
@Composable
private fun androidx.compose.foundation.layout.BoxScope.RouteEditorPanel(vm: MainViewModel, e: RouteEdit, controller: MapController) {
    var showPoints by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var confirmCancel by remember { mutableStateOf(false) }
    val prefs by vm.prefs.collectAsState()
    val monuments by vm.monuments.collectAsState()

    Surface(shadowElevation = 4.dp, shape = RoundedCornerShape(12.dp), modifier = Modifier.align(Alignment.TopCenter).padding(start = 10.dp, end = 10.dp, top = 22.dp).fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
            IconButton(onClick = { if (e.points.isEmpty()) vm.cancelEdit() else confirmCancel = true }) { Icon(Icons.Filled.Close, stringResource(R.string.cancel)) }
            Column(Modifier.weight(1f)) {
                Text(stringResource(if (e.base.id.isEmpty()) R.string.new_route else R.string.edit_route), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.route_length_points, fmtLength(e.lengthMeters), e.points.size), style = MaterialTheme.typography.bodySmall)
            }
            IconButton(enabled = e.history.isNotEmpty(), onClick = { vm.undo() }) { Icon(Icons.AutoMirrored.Filled.Undo, stringResource(R.string.undo)) }
            IconButton(enabled = e.points.size >= 2, onClick = { saving = true }) { Icon(Icons.Filled.Check, stringResource(R.string.save)) }
        }
    }

    Surface(tonalElevation = 2.dp, shadowElevation = 8.dp, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp), modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
        Column {
            Row(Modifier.fillMaxWidth().clickable { showPoints = !showPoints }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (e.selected >= 0) stringResource(R.string.point_selected_hint, e.selected + 1) else stringResource(R.string.route_edit_hint),
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f),
                )
                Icon(if (showPoints) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess, null)
            }
            if (e.selected in e.points.indices) Row(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                IconButton(onClick = { vm.moveVertexOrder(e.selected, -1) }, enabled = e.selected > 0) { Icon(Icons.Filled.ArrowUpward, stringResource(R.string.move_up)) }
                IconButton(onClick = { vm.moveVertexOrder(e.selected, 1) }, enabled = e.selected < e.points.size - 1) { Icon(Icons.Filled.ArrowDownward, stringResource(R.string.move_down)) }
                IconButton(onClick = { vm.deleteVertex(e.selected) }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete_point), tint = MaterialTheme.colorScheme.error) }
                TextButton(onClick = { vm.selectVertex(e.selected) }) { Text(stringResource(R.string.deselect)) }
            }
            if (showPoints) {
                HorizontalDivider()
                Row(Modifier.padding(horizontal = 8.dp)) {
                    TextButton(onClick = { vm.reverseRoute() }, enabled = e.points.size >= 2) { Icon(Icons.Filled.SwapVert, null, Modifier.size(18.dp)); Text(stringResource(R.string.reverse)) }
                    TextButton(onClick = { controller.center()?.let { (la, lo) -> vm.addPoint(la, lo) } }) { Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Text(stringResource(R.string.add_at_center)) }
                }
                LazyColumn(Modifier.heightIn(max = 260.dp)) {
                    itemsIndexed(e.points) { i, p ->
                        val mn = p.monumentId?.let { id -> monuments.firstOrNull { it.id == id } }
                        Row(Modifier.fillMaxWidth().clickable { vm.selectVertex(i); controller.moveTo(p.lat, p.lon) }.padding(horizontal = 12.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Text("${i + 1}.", fontWeight = if (i == e.selected) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.width(32.dp))
                            Text(mn?.name?.display(prefs.dataLang) ?: (fmtCoord(p.lat, prefs.coordFormatDms, true) + ", " + fmtCoord(p.lon, prefs.coordFormatDms, false)),
                                fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                                color = if (mn != null) MaterialTheme.colorScheme.primary else Color.Unspecified)
                            IconButton(onClick = { vm.moveVertexOrder(i, -1) }, enabled = i > 0) { Icon(Icons.Filled.ArrowUpward, stringResource(R.string.move_up), Modifier.size(18.dp)) }
                            IconButton(onClick = { vm.moveVertexOrder(i, 1) }, enabled = i < e.points.size - 1) { Icon(Icons.Filled.ArrowDownward, stringResource(R.string.move_down), Modifier.size(18.dp)) }
                            IconButton(onClick = { vm.deleteVertex(i) }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete_point), Modifier.size(18.dp)) }
                        }
                    }
                }
            }
        }
    }
    if (saving) RouteSaveDialog(vm, e) { saving = false }
    if (confirmCancel) ConfirmDialog(stringResource(R.string.confirm_discard_route), stringResource(R.string.discard), onConfirm = { vm.cancelEdit() }, onDismiss = { confirmCancel = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RouteSaveDialog(vm: MainViewModel, e: RouteEdit, onDismiss: () -> Unit) {
    val prefs by vm.prefs.collectAsState()
    val monuments by vm.monuments.collectAsState()
    var r by remember {
        // Басы/соңы бос болса — ескерткішке байланған бірінші/соңғы нүктенің атауы ұсынылады
        val first = e.points.firstOrNull()?.monumentId?.let { id -> monuments.firstOrNull { it.id == id } }
        val last = e.points.lastOrNull()?.monumentId?.let { id -> monuments.firstOrNull { it.id == id } }
        mutableStateOf(e.base.copy(
            aName = if (e.base.aName.isBlank() && first != null) first.name else e.base.aName,
            bName = if (e.base.bName.isBlank() && last != null) last.name else e.base.bName,
        ))
    }
    var tab by remember { mutableStateOf(prefs.dataLang) }
    val vLabels = Vehicle.entries.associateWith { vehicleLabel(it) }
    val sLabels = Season.entries.associateWith { seasonLabel(it) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        DialogAdjustResize()
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.systemBarsPadding()) {
                TopAppBar(
                    title = { Text(stringResource(R.string.save_route)) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, stringResource(R.string.cancel)) } },
                    actions = { IconButton(onClick = { vm.saveRoute(r) { ok -> if (ok) onDismiss() } }) { Icon(Icons.Filled.Check, stringResource(R.string.save)) } },
                )
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Text(stringResource(R.string.route_length_points, fmtLength(e.lengthMeters), e.points.size))
                    TabRow(selectedTabIndex = tab.ordinal, modifier = Modifier.padding(top = 8.dp)) {
                        Lang.entries.forEach { l -> Tab(selected = tab == l, onClick = { tab = l }, text = { Text(langName(l)) }) }
                    }
                    @Composable fun loc(label: Int, v: Localized, set: (Localized) -> Unit) {
                        OutlinedTextField(value = v[tab], onValueChange = { set(v.with(tab, it)) }, label = { Text(stringResource(label)) },
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp).bringIntoViewOnFocus())
                    }
                    loc(R.string.f_route_name, r.name) { r = r.copy(name = it) }
                    loc(R.string.f_from, r.aName) { r = r.copy(aName = it) }
                    loc(R.string.f_to, r.bName) { r = r.copy(bName = it) }
                    loc(R.string.f_note, r.note) { r = r.copy(note = it) }
                    Spacer(Modifier.size(8.dp))
                    Dropdown(stringResource(R.string.f_vehicle), r.vehicle, Vehicle.entries, { vLabels.getValue(it) }, { r = r.copy(vehicle = it) }, Modifier.fillMaxWidth())
                    Spacer(Modifier.size(6.dp))
                    Dropdown(stringResource(R.string.f_season), r.season, Season.entries, { sLabels.getValue(it) }, { r = r.copy(season = it) }, Modifier.fillMaxWidth())
                    OutlinedTextField(value = r.checked, onValueChange = { r = r.copy(checked = it.take(10)) }, label = { Text(stringResource(R.string.f_checked)) },
                        placeholder = { Text("2025-06-01") }, singleLine = true, isError = r.checked.isNotEmpty() && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(r.checked),
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).bringIntoViewOnFocus())
                    Row(Modifier.padding(top = 4.dp)) { TextButton(onClick = { r = r.copy(checked = java.time.LocalDate.now().toString()) }) { Text(stringResource(R.string.today)) } }
                    Button(onClick = { vm.saveRoute(r) { ok -> if (ok) onDismiss() } }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text(stringResource(R.string.save)) }
                    ImeSpacer()
                }
            }
        }
    }
}

