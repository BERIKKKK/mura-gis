package io.github.berikkkk.muragis.mobile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.db.DownloadJob
import io.github.berikkkk.muragis.core.db.JobState
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.tiles.Projection
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import kotlin.math.roundToInt

@Composable
fun MapsPane(vm: MainViewModel, controller: MapController, act: MainActivity) {
    var area by remember { mutableStateOf<MapLayer?>(null) }   // жүктеу аумағын таңдау режимі (дереккөз)
    Box(Modifier.fillMaxSize()) {
        if (area != null) DownloadAreaSelector(vm, area!!, controller, act) { area = null }
        else LayersSheet(vm, controller, onDownload = { area = it })
    }
}

@Composable
private fun androidx.compose.foundation.layout.BoxScope.LayersSheet(vm: MainViewModel, controller: MapController, onDownload: (MapLayer) -> Unit) {
    val layers by vm.layers.collectAsState()
    val jobs by vm.jobs.collectAsState()
    val online by vm.online.collectAsState()
    val base by vm.effectiveBase.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var importDialog by remember { mutableStateOf(false) }
    var addSource by remember { mutableStateOf(false) }
    var noDownloadInfo by remember { mutableStateOf(false) }
    val bases = layers.filter { it.role == LayerRole.BASE }
    val overlays = layers.filter { it.role == LayerRole.OVERLAY }
    val downloadable = layers.filter { it.kind == LayerKind.ONLINE && vm.policyOf(it).allowed }

    Surface(tonalElevation = 2.dp, shadowElevation = 8.dp, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = 520.dp)) {
        LazyColumn(Modifier.padding(horizontal = 12.dp)) {
            item {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AssistChip(onClick = { if (downloadable.isEmpty()) noDownloadInfo = true else if (downloadable.size == 1) onDownload(downloadable.first()) else noDownloadInfo = true },
                        label = { Text(stringResource(R.string.download_area), fontSize = 12.sp) }, leadingIcon = { Icon(Icons.Filled.CloudDownload, null, Modifier.size(18.dp)) })
                    AssistChip(onClick = { importDialog = true }, label = { Text(stringResource(R.string.import_map), fontSize = 12.sp) },
                        leadingIcon = { Icon(Icons.Filled.InsertDriveFile, null, Modifier.size(18.dp)) })
                    AssistChip(onClick = { addSource = true }, label = { Text(stringResource(R.string.add_source), fontSize = 12.sp) },
                        leadingIcon = { Icon(Icons.Filled.Add, null, Modifier.size(18.dp)) })
                }
            }
            if (jobs.isNotEmpty()) {
                item { SectionTitle(stringResource(R.string.downloads)) }
                items(jobs, key = { "j" + it.id }) { j -> JobRow(vm, j) }
            }
            item { SectionTitle(stringResource(R.string.base_maps)) }
            items(bases, key = { "b" + it.id }) { l ->
                LayerRow(vm, controller, l, isBase = true, checked = l.visible, effective = base?.id == l.id, online = online,
                    preferredOffline = prefs.offlineBaseId == l.id, onDownload = onDownload)
            }
            item { SectionTitle(stringResource(R.string.overlays)) }
            items(overlays, key = { "o" + it.id }) { l ->
                LayerRow(vm, controller, l, isBase = false, checked = l.visible, effective = false, online = online, preferredOffline = false, onDownload = onDownload)
            }
            item {
                Text(stringResource(R.string.layers_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray, modifier = Modifier.padding(vertical = 12.dp))
            }
        }
    }
    if (importDialog) ImportMapDialog(vm) { importDialog = false }
    if (addSource) AddSourceDialog(vm) { addSource = false }
    if (noDownloadInfo) AlertDialog(
        onDismissRequest = { noDownloadInfo = false },
        title = { Text(stringResource(R.string.download_area)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (downloadable.isEmpty()) Text(stringResource(R.string.no_downloadable_sources))
                else {
                    Text(stringResource(R.string.choose_source))
                    downloadable.forEach { s -> TextButton(onClick = { noDownloadInfo = false; onDownload(s) }) { Text(s.title) } }
                }
            }
        },
        confirmButton = { TextButton(onClick = { noDownloadInfo = false }) { Text(stringResource(R.string.ok)) } },
    )
}

@Composable
private fun reasonText(code: String): String = stringResource(when (code) {
    "osm_tile_policy" -> R.string.policy_osm
    "provider_forbids" -> R.string.policy_provider_forbids
    "license_required" -> R.string.policy_license_required
    "terms_unknown" -> R.string.policy_terms_unknown
    "no_declared_right" -> R.string.policy_no_declared_right
    "bad_url" -> R.string.err_bad_url
    else -> R.string.policy_online_only
})

@Composable
private fun LayerRow(vm: MainViewModel, controller: MapController, l: MapLayer, isBase: Boolean, checked: Boolean, effective: Boolean, online: Boolean,
                     preferredOffline: Boolean, onDownload: (MapLayer) -> Unit) {
    val available = vm.isAvailable(l, online)
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var opacity by remember(l.id) { mutableFloatStateOf(l.opacity.toFloat()) }
    val policy = vm.policyOf(l)
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable(enabled = true) {
            if (isBase) vm.setBase(l.id) else vm.toggleOverlay(l.id, !checked)
        }) {
            if (isBase) RadioButton(selected = checked, onClick = { vm.setBase(l.id) }) else Checkbox(checked = checked, onCheckedChange = { vm.toggleOverlay(l.id, it) })
            Column(Modifier.weight(1f)) {
                Text(l.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (available) Color.Unspecified else Color.Gray,
                    fontWeight = if (effective) FontWeight.Bold else FontWeight.Normal)
                val tags = buildList {
                    when (l.kind) {
                        LayerKind.ONLINE -> add(stringResource(if (online) R.string.tag_online else R.string.tag_online_unavailable))
                        LayerKind.DOWNLOADED -> add(stringResource(R.string.tag_downloaded))
                        LayerKind.IMPORTED -> add(stringResource(R.string.tag_imported))
                    }
                    if (l.isOffline) { add("z${l.minZoom}–${l.maxZoom}"); if (l.sizeBytes > 0) add(fmtBytes(l.sizeBytes)) }
                    if (preferredOffline) add(stringResource(R.string.tag_offline_default))
                    if (effective && !checked) add(stringResource(R.string.tag_auto_offline))
                    if (l.projection == Projection.ELLIPTICAL_MERCATOR.code) add("EPSG:3395")
                }
                Text(tags.joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            }
            if (l.kind == LayerKind.ONLINE) {
                if (policy.allowed) IconButton(onClick = { onDownload(l) }) { Icon(Icons.Filled.CloudDownload, stringResource(R.string.download_area)) }
                else Icon(Icons.Filled.CloudOff, null, tint = Color.LightGray, modifier = Modifier.size(20.dp))
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    l.bounds?.let { b -> DropdownMenuItem(text = { Text(stringResource(R.string.zoom_to)) }, leadingIcon = { Icon(Icons.Filled.ZoomOutMap, null) },
                        onClick = { menu = false; controller.fit(b) }) }
                    if (l.isOffline && isBase) DropdownMenuItem(text = { Text(stringResource(R.string.set_offline_default)) }, onClick = { menu = false; vm.setPreferredOffline(l.id) })
                    if (l.isOffline) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.invert_y)) }, onClick = { menu = false; vm.toggleInvertY(l.id) })
                        DropdownMenuItem(text = { Text(stringResource(if (isBase) R.string.make_overlay else R.string.make_base)) },
                            onClick = { menu = false; vm.setRole(l.id, if (isBase) LayerRole.OVERLAY else LayerRole.BASE) })
                    }
                    if (l.kind == LayerKind.ONLINE && !policy.allowed) DropdownMenuItem(text = { Text(reasonText(policy.reason), fontSize = 12.sp) }, onClick = { menu = false })
                    if (l.license.isNotBlank()) DropdownMenuItem(text = { Text(stringResource(R.string.license_colon, l.license), fontSize = 12.sp) }, onClick = { menu = false })
                    if (l.isOffline || (l.kind == LayerKind.ONLINE && !l.id.startsWith("b-")))
                        DropdownMenuItem(text = { Text(stringResource(R.string.delete)) }, leadingIcon = { Icon(Icons.Filled.Delete, null) }, onClick = { menu = false; confirm = true })
                }
            }
        }
        // Мөлдірлік (үстіңгі қабаттар және таңдалған негіз үшін)
        if (checked && (!isBase || l.isOffline)) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 48.dp, end = 12.dp)) {
            Text(stringResource(R.string.opacity), style = MaterialTheme.typography.labelSmall)
            Slider(value = opacity, valueRange = 0.1f..1f, onValueChange = {
                opacity = it; controller.setOpacity(l.id, isBase, it.toDouble()); vm.setOpacity(l.id, it.toDouble())
            }, onValueChangeFinished = { vm.commitOpacity() }, modifier = Modifier.weight(1f).padding(start = 8.dp))
        }
    }
    if (confirm) ConfirmDialog(stringResource(R.string.confirm_delete_layer, l.title), stringResource(R.string.delete), onConfirm = { vm.deleteLayer(l.id) }, onDismiss = { confirm = false })
}

@Composable
private fun JobRow(vm: MainViewModel, j: DownloadJob) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(j.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(stringResource(R.string.job_status, stringResource(when (j.state) {
                    JobState.QUEUED -> R.string.st_queued; JobState.RUNNING -> R.string.st_running; JobState.PAUSED -> R.string.st_paused
                    JobState.COMPLETED -> R.string.st_completed; JobState.FAILED -> R.string.st_failed; JobState.CANCELLED -> R.string.st_cancelled
                }), j.percent, j.done, j.total, fmtBytes(j.bytes)), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                if (j.failed > 0) Text(stringResource(R.string.job_missing, j.failed), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                if (j.error.isNotBlank()) Text(j.error, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            }
            when (j.state) {
                JobState.RUNNING, JobState.QUEUED -> IconButton(onClick = { vm.pauseDownload(j.id) }) { Icon(Icons.Filled.Pause, stringResource(R.string.pause)) }
                JobState.PAUSED, JobState.FAILED -> IconButton(onClick = { vm.resumeDownload(j.id) }) { Icon(Icons.Filled.PlayArrow, stringResource(R.string.resume)) }
                else -> {}
            }
            if (j.state != JobState.COMPLETED) IconButton(onClick = { vm.cancelDownload(j.id) }) { Icon(Icons.Filled.Stop, stringResource(R.string.cancel_download)) }
            else IconButton(onClick = { vm.removeJobRecord(j.id) }) { Icon(Icons.Filled.Close, stringResource(R.string.hide)) }
        }
        LinearProgressIndicator(progress = { j.percent / 100f }, modifier = Modifier.fillMaxWidth())
    }
    HorizontalDivider(Modifier.padding(top = 4.dp))
}

/** Жүктелетін аумақ — экрандағы жақтау ішіндегі бөлік; масштабтар, көлемді алдын ала есептеу. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun androidx.compose.foundation.layout.BoxScope.DownloadAreaSelector(vm: MainViewModel, src: MapLayer, controller: MapController, act: MainActivity, onClose: () -> Unit) {
    var frame by remember { mutableStateOf<Rect?>(null) }
    var bounds by remember { mutableStateOf<Bounds?>(null) }
    val policy = vm.policyOf(src)
    val maxZ = minOf(src.maxZoom, policy.maxZoom)
    val z0 = controller.zoom().roundToInt().coerceIn(src.minZoom, maxZ)
    var range by remember { mutableStateOf(z0.toFloat()..minOf(maxZ, z0 + 4).toFloat()) }
    var title by remember { mutableStateOf(src.title) }
    // Жақтау (картаның ортасында, шеттерінен шегініспен)
    Box(Modifier.fillMaxSize().padding(start = 28.dp, end = 28.dp, top = 40.dp, bottom = 300.dp)
        .border(BorderStroke(3.dp, MaterialTheme.colorScheme.primary), RoundedCornerShape(4.dp))
        .onGloballyPositioned { frame = it.boundsInParent() })
    val minZ = range.start.roundToInt(); val mz = range.endInclusive.roundToInt()
    fun refresh() { frame?.let { f -> bounds = controller.boundsOfScreenRect(f.left, f.top, f.right, f.bottom) } }
    androidx.compose.runtime.LaunchedEffect(frame) { refresh() }
    Surface(tonalElevation = 3.dp, shadowElevation = 8.dp, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp), modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.download_from, src.title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, stringResource(R.string.close)) }
            }
            Text(stringResource(R.string.download_area_hint), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            Text(stringResource(R.string.zoom_range, minZ, mz), modifier = Modifier.padding(top = 6.dp))
            RangeSlider(value = range, onValueChange = { range = it; refresh() }, valueRange = src.minZoom.toFloat()..maxZ.toFloat(), steps = (maxZ - src.minZoom - 1).coerceAtLeast(0))
            val b = bounds
            if (b != null) {
                val (n, bytes) = vm.estimate(b, minZ, mz)
                val tooMany = policy.maxTilesPerJob in 1 until n
                Text(stringResource(R.string.estimate, n, fmtBytes(bytes)), color = if (tooMany) MaterialTheme.colorScheme.error else Color.Unspecified)
                if (tooMany) Text(stringResource(R.string.err_too_many_tiles), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            } else Text(stringResource(R.string.estimate_press), style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text(stringResource(R.string.map_title)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text(stringResource(R.string.attribution_colon, src.attribution), style = MaterialTheme.typography.labelSmall, color = Color.Gray, modifier = Modifier.padding(top = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = { refresh() }) { Text(stringResource(R.string.use_this_view)) }
                Button(enabled = bounds != null, onClick = {
                    refresh()
                    bounds?.let { bb -> act.askNotifications(); vm.startDownload(src, bb, minZ, mz, title); onClose() }
                }) { Text(stringResource(R.string.start_download)) }
            }
        }
    }
}

/** Сыртқы картаны импорттау: алдымен лицензия ескертуі, содан кейін файл не қалта (Storage Access Framework). */
@Composable
private fun ImportMapDialog(vm: MainViewModel, onDone: () -> Unit) {
    var ack by remember { mutableStateOf(false) }
    var tms by remember { mutableStateOf(false) }
    var yandex by remember { mutableStateOf(false) }
    var overlay by remember { mutableStateOf(false) }
    fun proj() = if (yandex) Projection.ELLIPTICAL_MERCATOR.code else Projection.WEB_MERCATOR.code
    val role = if (overlay) LayerRole.OVERLAY else LayerRole.BASE
    val file = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) vm.importMap(uri, false, tms, proj(), role); onDone() }
    val tree = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri -> if (uri != null) vm.importMap(uri, true, tms, proj(), role); onDone() }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(R.string.import_map)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.import_map_formats), style = MaterialTheme.typography.bodySmall)
                Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    Text(stringResource(R.string.license_warning), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = ack, onCheckedChange = { ack = it }); Text(stringResource(R.string.license_ack), fontSize = 13.sp) }
                HorizontalDivider(Modifier.padding(vertical = 6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = overlay, onCheckedChange = { overlay = it }); Text(stringResource(R.string.as_overlay), fontSize = 13.sp) }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = tms, onCheckedChange = { tms = it }); Text(stringResource(R.string.tms_option), fontSize = 13.sp) }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = yandex, onCheckedChange = { yandex = it }); Text(stringResource(R.string.epsg3395_option), fontSize = 13.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    Button(enabled = ack, onClick = { file.launch(arrayOf("*/*")) }) { Icon(Icons.Filled.InsertDriveFile, null, Modifier.size(18.dp)); Text(" " + stringResource(R.string.pick_file)) }
                    OutlinedButton(enabled = ack, onClick = { tree.launch(null) }) { Icon(Icons.Filled.FolderOpen, null, Modifier.size(18.dp)); Text(" " + stringResource(R.string.pick_folder)) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDone) { Text(stringResource(R.string.cancel)) } },
    )
}

@Composable
fun MapImportReportDialog(vm: MainViewModel, r: MapImportReport, controller: MapController) {
    val l = r.layer
    AlertDialog(
        onDismissRequest = { vm.dismissMapImport() },
        title = { Text(stringResource(if (l != null) R.string.import_ok else R.string.import_failed)) },
        text = {
            if (l != null) Column {
                Text(l.title, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.report_format, l.format.code, l.tileFormat.uppercase()))
                Text(stringResource(R.string.report_zoom, l.minZoom, l.maxZoom))
                Text(stringResource(R.string.report_crs, l.projection))
                l.bounds?.let { b -> Text(stringResource(R.string.report_bounds, String.format(java.util.Locale.ROOT, "%.4f, %.4f — %.4f, %.4f", b.south, b.west, b.north, b.east))) }
                Text(stringResource(R.string.report_size, fmtBytes(l.sizeBytes)))
                if (l.attribution.isNotBlank()) Text(stringResource(R.string.attribution_colon, l.attribution), style = MaterialTheme.typography.labelSmall)
            } else Text(stringResource(when (r.error) {
                "geotiff_unsupported" -> R.string.err_geotiff
                "vector_unsupported" -> R.string.err_vector
                "gpkg_tiles_crs" -> R.string.err_gpkg_crs
                "gpkg_no_tiles" -> R.string.err_gpkg_no_tiles
                "is_project" -> R.string.err_is_project
                "xyz_no_tiles" -> R.string.err_no_tiles
                "zip" -> R.string.err_zip
                "mbtiles_no_tiles", "mbtiles_empty", "no_bounds" -> R.string.err_mbtiles
                "cancelled" -> R.string.st_cancelled
                else -> R.string.err_unknown_format
            }) + if (r.detail.isNotBlank()) "\n(" + r.detail + ")" else "")
        },
        confirmButton = {
            if (l != null) TextButton(onClick = {
                if (l.role == LayerRole.BASE) vm.setBase(l.id) else vm.toggleOverlay(l.id, true)
                l.bounds?.let { controller.fit(it) }
                vm.dismissMapImport()
            }) { Text(stringResource(R.string.show_on_map)) }
            else TextButton(onClick = { vm.dismissMapImport() }) { Text(stringResource(R.string.ok)) }
        },
        dismissButton = { if (l != null) TextButton(onClick = { vm.dismissMapImport() }) { Text(stringResource(R.string.close)) } },
    )
}

/** Өз тайл-серверін не лицензиясы рұқсат ететін XYZ сервисін қосу. */
@Composable
private fun AddSourceDialog(vm: MainViewModel, onDone: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("https://") }
    var attribution by remember { mutableStateOf("") }
    var license by remember { mutableStateOf("") }
    var maxZoom by remember { mutableStateOf("18") }
    var overlay by remember { mutableStateOf(false) }
    var offline by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(R.string.add_source)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.map_title)) }, singleLine = true)
                OutlinedTextField(url, { url = it }, label = { Text(stringResource(R.string.xyz_url)) }, singleLine = true,
                    supportingText = { Text("https://tiles.example.kz/{z}/{x}/{y}.png") })
                OutlinedTextField(attribution, { attribution = it }, label = { Text(stringResource(R.string.attribution)) }, singleLine = true)
                OutlinedTextField(license, { license = it }, label = { Text(stringResource(R.string.license_terms)) })
                OutlinedTextField(maxZoom, { maxZoom = it.filter(Char::isDigit).take(2) }, label = { Text(stringResource(R.string.max_zoom)) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = overlay, onCheckedChange = { overlay = it }); Text(stringResource(R.string.as_overlay), fontSize = 13.sp) }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = offline, onCheckedChange = { offline = it }); Text(stringResource(R.string.offline_right_decl), fontSize = 13.sp) }
                Text(stringResource(R.string.offline_right_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            }
        },
        confirmButton = {
            TextButton(enabled = attribution.isNotBlank() && url.length > 10, onClick = {
                vm.addCustomSource(title, url, attribution, license, maxZoom.toIntOrNull() ?: 18, overlay, offline); onDone()
            }) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { TextButton(onClick = onDone) { Text(stringResource(R.string.cancel)) } },
    )
}
