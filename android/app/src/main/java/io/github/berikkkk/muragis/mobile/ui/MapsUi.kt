package io.github.berikkkk.muragis.mobile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.db.DownloadJob
import io.github.berikkkk.muragis.core.db.JobState
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.packages.Catalog
import io.github.berikkkk.muragis.core.packages.CatalogPackage
import io.github.berikkkk.muragis.core.packages.CatalogRegion
import io.github.berikkkk.muragis.core.packages.MapCategory
import io.github.berikkkk.muragis.core.tiles.Projection
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import java.io.File
import java.util.Locale
import kotlin.math.roundToInt

/** «Карта қабаттары» панелінің беттері: карталар тізімі → аумақтар → аумақтың карта пакеттері. */
private sealed interface LayersPage {
    data object Maps : LayersPage
    data object Regions : LayersPage
    data class Region(val id: String) : LayersPage
}

@Composable
fun MapsPane(vm: MainViewModel, controller: MapController, act: MainActivity, onClose: () -> Unit) {
    var area by remember { mutableStateOf<MapLayer?>(null) }   // өз дереккөзінен аумақ таңдау режимі
    Box(Modifier.fillMaxSize()) {
        if (area != null) DownloadAreaSelector(vm, area!!, controller, act) { area = null }
        else {
            Box(Modifier.matchParentSize().background(Chrome.scrim).clickable(remember { MutableInteractionSource() }, indication = null, onClick = onClose))
            LayersSheet(vm, controller, act, onCustomArea = { area = it }, onClose = onClose)
        }
    }
}

/**
 * Панель: тақырып пен әрекет батырмалары орнында тұрады, тек тізім бөлігі айналады ([LazyColumn], weight(fill = false)) —
 * карта аз болса, панель мазмұнына сай ықшам ашылады. Бұрынғы нұсқадағы бос орын үш батырма бір Row-ға сыймай, үшіншісінің
 * жазуы әріптеп тасымалданып, қатарды биіктетуінен болған; енді екі батырма [ActionButtons] арқылы тең бөлінеді.
 */
@Composable
private fun BoxScope.LayersSheet(vm: MainViewModel, controller: MapController, act: MainActivity, onCustomArea: (MapLayer) -> Unit, onClose: () -> Unit) {
    var page by remember { mutableStateOf<LayersPage>(LayersPage.Maps) }
    var importOptions by remember { mutableStateOf(false) }
    var addSource by remember { mutableStateOf(false) }
    val lang = uiLang()
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importMap(uri, false, false, Projection.WEB_MERCATOR.code, LayerRole.BASE)
    }
    val maxH = (LocalConfiguration.current.screenHeightDp * 0.86f).dp
    ChromeTheme {
        Surface(
            color = Chrome.bg, contentColor = Chrome.fg, shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp), shadowElevation = 12.dp,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().heightIn(max = maxH),
        ) {
            Column(Modifier.padding(top = 10.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(width = 40.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Chrome.bg3))
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp)) {
                    when (val p = page) {
                        LayersPage.Maps -> {
                            SheetHeader(stringResource(R.string.layers_title), null, onClose)
                            ActionButtons(
                                first = { m -> PanelButton(stringResource(R.string.download_area), Icons.Filled.CloudDownload, primary = true, modifier = m) { page = LayersPage.Regions } },
                                second = { m -> PanelButton(stringResource(R.string.import_map), Icons.Filled.InsertDriveFile, modifier = m) { pickFile.launch(arrayOf("*/*")) } },
                            )
                        }
                        LayersPage.Regions -> SubHeader(stringResource(R.string.download_area), onBack = { page = LayersPage.Maps }, onClose = onClose)
                        is LayersPage.Region -> SubHeader(vm.catalog.regions.firstOrNull { it.id == p.id }?.title?.of(lang) ?: "",
                            onBack = { page = LayersPage.Regions }, onClose = onClose)
                    }
                }
                when (val p = page) {
                    LayersPage.Maps -> MapsList(vm, controller, lang, Modifier.weight(1f, fill = false),
                        onImportOptions = { importOptions = true }, onAddSource = { addSource = true }, onCustomArea = onCustomArea)
                    LayersPage.Regions -> RegionsList(vm, lang, Modifier.weight(1f, fill = false), onRegion = { page = LayersPage.Region(it) },
                        onCustomArea = onCustomArea)
                    is LayersPage.Region -> vm.catalog.regions.firstOrNull { it.id == p.id }?.let { r ->
                        RegionPackages(vm, controller, act, r, lang, Modifier.weight(1f, fill = false), onOpened = onClose)
                    }
                }
            }
        }
        if (importOptions) ImportMapDialog(vm) { importOptions = false }
        if (addSource) AddSourceDialog(vm) { addSource = false }
    }
}

@Composable
private fun SubHeader(title: String, onBack: () -> Unit, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Chrome.bg2)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back))
        }
        Text(title, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(horizontal = 12.dp))
        IconButton(onClick = onClose, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Chrome.bg2)) {
            Icon(Icons.Filled.Close, stringResource(R.string.close))
        }
    }
}

/**
 * Екі әрекет батырмасы: сыйса — қатар, тең енімен; сыймаса (тар экран, үлкейтілген жүйелік қаріп) — бірінің астында бірі.
 * Екі жағдайда да биіктігі бірдей (екеуінің ең биігіне теңестіріледі), жазу қысқартылмай толық көрсетіледі.
 */
@Composable
private fun ActionButtons(first: @Composable (Modifier) -> Unit, second: @Composable (Modifier) -> Unit) {
    val gap = 8.dp
    Layout(content = { first(Modifier); second(Modifier) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) { ms, c ->
        val g = gap.roundToPx()
        val w = c.maxWidth
        val half = (w - g) / 2
        // Қатарға қою шарты: әр батырманың ең ұзын сөзі (белгішесімен) жарты енге сыяды — жазу қажет болса екі жолға бөлінеді
        val row = ms.all { it.minIntrinsicWidth(Constraints.Infinity) <= half }
        val cw = if (row) half else w
        val h = ms.maxOf { it.minIntrinsicHeight(cw) }
        val ps = ms.map { it.measure(Constraints.fixed(cw, h)) }
        val total = if (row) h else h * 2 + g
        layout(w, total) {
            if (row) { ps[0].place(0, 0); ps[1].place(half + g, 0) } else { ps[0].place(0, 0); ps[1].place(0, h + g) }
        }
    }
}

@Composable
private fun PanelButton(text: String, icon: ImageVector, modifier: Modifier = Modifier, primary: Boolean = false, onClick: () -> Unit) {
    val bg = if (primary) Chrome.accent else Chrome.bg2
    val fg = if (primary) Chrome.onAccent else Chrome.fg
    Row(
        modifier.heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(bg).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun categoryTitle(c: MapCategory) = stringResource(when (c) {
    MapCategory.BASIC -> R.string.cat_basic
    MapCategory.TOPO -> R.string.cat_topo
    MapCategory.SATELLITE -> R.string.cat_satellite
    MapCategory.HISTORIC -> R.string.cat_historic
    MapCategory.USER -> R.string.cat_user
    MapCategory.OVERLAY -> R.string.overlays
})

/** Пакет қабатының атауы — интерфейс тілінде (каталогтан), қалғаны — сақталған атауы. */
private fun MainViewModel.titleOf(l: MapLayer, lang: Lang) = packageOf(l)?.title?.of(lang) ?: l.title

@Composable
private fun MapsList(vm: MainViewModel, controller: MapController, lang: Lang, modifier: Modifier,
                     onImportOptions: () -> Unit, onAddSource: () -> Unit, onCustomArea: (MapLayer) -> Unit) {
    val layers by vm.layers.collectAsState()
    val jobs by vm.jobs.collectAsState()
    val online by vm.online.collectAsState()
    val base by vm.effectiveBase.collectAsState()
    val prefs by vm.prefs.collectAsState()
    // Санаттар бекітілген ретпен; бос санаттың тақырыбы да көрсетілмейді
    val groups = layers.groupBy { vm.categoryOf(it) }
    val visibleJobs = jobs.filter { !(Catalog.packageIdOf(it.sourceId) != null && it.state == JobState.COMPLETED) }
    LazyColumn(modifier.fillMaxWidth(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (visibleJobs.isNotEmpty()) {
            item(key = "h-jobs") { ChromeLabel(stringResource(R.string.downloads)) }
            items(visibleJobs, key = { "j" + it.id }) { j -> JobCard(vm, j) }
        }
        for (cat in MapCategory.entries) {
            val list = groups[cat].orEmpty()
            if (list.isEmpty()) continue
            item(key = "h-" + cat.code) { CategoryLabel(categoryTitle(cat), first = cat == MapCategory.entries.first { groups[it].orEmpty().isNotEmpty() } && visibleJobs.isEmpty()) }
            items(list, key = { "l" + it.id }) { l ->
                MapRow(vm, controller, l, lang, active = if (l.role == LayerRole.BASE) base?.id == l.id else l.visible, online = online,
                    preferredOffline = prefs.offlineBaseId == l.id, onCustomArea = onCustomArea)
            }
        }
        item(key = "footer") {
            Column(Modifier.padding(top = 8.dp)) {
                FooterLink(stringResource(R.string.import_options), Icons.Filled.FolderOpen, onImportOptions)
                FooterLink(stringResource(R.string.add_source), Icons.Filled.Add, onAddSource)
                Text(stringResource(R.string.layers_note), color = Chrome.dim, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

/** Санат тақырыбы: біріншісінің үстінде артық шегініс жоқ — тізім батырмалардың астынан бірден басталады. */
@Composable
private fun CategoryLabel(text: String, first: Boolean) {
    Text(text.uppercase(), color = Chrome.dim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
        modifier = Modifier.padding(top = if (first) 4.dp else 12.dp, bottom = 2.dp))
}

@Composable
private fun FooterLink(text: String, icon: ImageVector, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Chrome.accent, modifier = Modifier.size(20.dp))
        Text(text, color = Chrome.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp))
    }
}

/** Карта жолы: түрткенде ашылады; белсендісі белгіленеді; атаудың астында күйі; ⋮ — осы картаға қолжетімді әрекеттер. */
@Composable
private fun MapRow(vm: MainViewModel, controller: MapController, l: MapLayer, lang: Lang, active: Boolean, online: Boolean,
                   preferredOffline: Boolean, onCustomArea: (MapLayer) -> Unit) {
    val isBase = l.role == LayerRole.BASE
    val available = vm.isAvailable(l, online)
    val pkg = vm.packageOf(l)
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var details by remember { mutableStateOf(false) }
    var opacity by remember(l.id) { mutableFloatStateOf(l.opacity.toFloat()) }
    val policy = vm.policyOf(l)
    val title = vm.titleOf(l, lang)
    val open: () -> Unit = {
        if (isBase) {
            vm.setBase(l.id)
            // Офлайн картаның аумағы экранда болмаса — соған апару
            val c = controller.center()
            l.bounds?.takeIf { l.isOffline && (c == null || !it.contains(c.first, c.second)) }?.let { controller.fit(it) }
        } else { vm.toggleOverlay(l.id, !l.visible) }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (active) Chrome.bg3 else Chrome.bg2)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = open).padding(start = 14.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val mark = when {
                !isBase -> if (l.visible) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank
                active -> Icons.Filled.CheckCircle
                else -> Icons.Filled.RadioButtonUnchecked
            }
            Icon(mark, if (active) stringResource(R.string.state_active) else null, tint = if (active) Chrome.accent else Chrome.dim, modifier = Modifier.size(24.dp))
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    color = if (available) Chrome.fg else Chrome.dim)
                val state = when (l.kind) {
                    LayerKind.ONLINE -> stringResource(if (online) R.string.state_online else R.string.state_online_off)
                    LayerKind.DOWNLOADED -> stringResource(R.string.state_downloaded)
                    LayerKind.IMPORTED -> stringResource(R.string.state_local)
                }
                val extra = buildList {
                    if (l.isOffline && l.sizeBytes > 0) add(fmtBytes(l.sizeBytes))
                    if (preferredOffline && l.kind != LayerKind.DOWNLOADED) add(stringResource(R.string.tag_offline_default))
                    if (l.projection == Projection.ELLIPTICAL_MERCATOR.code) add("EPSG:3395")
                }
                Text((listOf(state) + extra).joinToString(" · "), color = if (l.isOffline) Chrome.ok else Chrome.dim, fontSize = 13.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
                // Карточкадағы қосымша мәлімет: тарихи карта — жылы, аумағы, дереккөзі; пакет — ажыратымдылығы/кезеңі, дереккөзі
                val meta = when {
                    l.sourceId == "gsh" -> stringResource(R.string.hist_gsh_meta)
                    l.sourceId == "gsh1m" -> stringResource(R.string.hist_gsh1m_meta)
                    pkg != null -> listOf(pkg.resolution.of(lang), pkg.period.of(lang), pkg.source.of(lang).ifBlank { null }).filterNot { it.isNullOrBlank() }.joinToString(" · ")
                    else -> ""
                }
                if (meta.isNotBlank()) Text(meta, color = Chrome.dim, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more), tint = Chrome.dim) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    l.bounds?.let { b -> DropdownMenuItem(text = { Text(stringResource(R.string.zoom_to)) }, leadingIcon = { Icon(Icons.Filled.ZoomOutMap, null) },
                        onClick = { menu = false; if (isBase && !active) vm.setBase(l.id); controller.fit(b) }) }
                    if (l.kind == LayerKind.ONLINE && policy.allowed) DropdownMenuItem(text = { Text(stringResource(R.string.download_area)) },
                        leadingIcon = { Icon(Icons.Filled.CloudDownload, null) }, onClick = { menu = false; onCustomArea(l) })
                    if (l.isOffline && isBase && !preferredOffline) DropdownMenuItem(text = { Text(stringResource(R.string.set_offline_default)) },
                        onClick = { menu = false; vm.setPreferredOffline(l.id) })
                    if (l.kind == LayerKind.IMPORTED) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.invert_y)) }, onClick = { menu = false; vm.toggleInvertY(l.id) })
                        DropdownMenuItem(text = { Text(stringResource(if (isBase) R.string.make_overlay else R.string.make_base)) },
                            onClick = { menu = false; vm.setRole(l.id, if (isBase) LayerRole.OVERLAY else LayerRole.BASE) })
                    }
                    DropdownMenuItem(text = { Text(stringResource(R.string.map_details)) }, leadingIcon = { Icon(Icons.Filled.Info, null) },
                        onClick = { menu = false; details = true })
                    if (l.isOffline || (l.kind == LayerKind.ONLINE && !l.id.startsWith("b-")))
                        DropdownMenuItem(text = { Text(stringResource(R.string.delete)) }, leadingIcon = { Icon(Icons.Filled.Delete, null) }, onClick = { menu = false; confirm = true })
                }
            }
        }
        // Мөлдірлік: үстіңгі қабаттар және таңдалған растр офлайн негіз үшін (векторлық пакетте мөлдірлік жоқ)
        val vectorPkg = pkg?.format == "vector"
        if (l.visible && (!isBase || (l.isOffline && !vectorPkg))) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 50.dp, end = 14.dp, bottom = 4.dp)) {
            Text(stringResource(R.string.opacity), color = Chrome.dim, fontSize = 12.sp)
            Slider(value = opacity, valueRange = 0.1f..1f, onValueChange = {
                opacity = it; controller.setOpacity(l.id, isBase, it.toDouble()); vm.setOpacity(l.id, it.toDouble())
            }, onValueChangeFinished = { vm.commitOpacity() }, modifier = Modifier.weight(1f).padding(start = 8.dp))
        }
    }
    if (confirm) ConfirmDialog(stringResource(R.string.confirm_delete_layer, title), stringResource(R.string.delete), onConfirm = { vm.deleteLayer(l.id) }, onDismiss = { confirm = false })
    if (details) AlertDialog(
        onDismissRequest = { details = false },
        title = { Text(title) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (pkg != null) PackageFacts(pkg, lang)
                else {
                    if (l.sourceId == "gsh") Text(stringResource(R.string.hist_gsh_meta))
                    if (l.sourceId == "gsh1m") Text(stringResource(R.string.hist_gsh1m_meta))
                    l.bounds?.let { Text(stringResource(R.string.pkg_coverage, fmtBounds(it))) }
                    if (l.isOffline) Text(stringResource(R.string.report_zoom, l.minZoom, l.maxZoom))
                    if (l.attribution.isNotBlank()) Text(stringResource(R.string.attribution_colon, l.attribution))
                    if (l.license.isNotBlank()) Text(stringResource(R.string.license_colon, l.license))
                    if (l.kind == LayerKind.ONLINE && !policy.allowed) Text(reasonText(policy.reason), color = Chrome.dim, fontSize = 13.sp)
                }
            }
        },
        confirmButton = { TextButton(onClick = { details = false }) { Text(stringResource(R.string.ok)) } },
    )
}

fun fmtBounds(b: Bounds) = String.format(Locale.ROOT, "%.2f–%.2f° N, %.2f–%.2f° E", b.south, b.north, b.west, b.east)

/** Пакеттің мәліметтері: санаты, аумағы, көлемі, дерек күні, дереккөзі, лицензиясы, авторлық белгісі. */
@Composable
private fun PackageFacts(p: CatalogPackage, lang: Lang, regionTitle: String? = null) {
    val dim = Chrome.dim
    @Composable fun line(s: String) = Text(s, color = dim, fontSize = 13.sp, lineHeight = 17.sp)
    line(categoryTitle(p.category))
    line(stringResource(R.string.pkg_coverage, (regionTitle?.let { "$it, " } ?: "") + fmtBounds(p.bounds)))
    line(stringResource(R.string.pkg_size, fmtBytes(p.size)))
    line(stringResource(R.string.pkg_date, p.date))
    p.resolution.of(lang).takeIf { it.isNotBlank() }?.let { line(it) }
    p.period.of(lang).takeIf { it.isNotBlank() }?.let { line(it) }
    line(stringResource(R.string.pkg_source, p.source.of(lang)))
    line(stringResource(R.string.license_colon, p.license))
    line(stringResource(R.string.attribution_colon, p.attribution))
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

/** Аумақтар тізімі (альфада — дайын аумақтар каталогтан) және өз дереккөзінен аумақ таңдау. */
@Composable
private fun RegionsList(vm: MainViewModel, lang: Lang, modifier: Modifier, onRegion: (String) -> Unit, onCustomArea: (MapLayer) -> Unit) {
    val layers by vm.layers.collectAsState()
    val downloadable = layers.filter { it.kind == LayerKind.ONLINE && vm.policyOf(it).allowed }
    var chooseSource by remember { mutableStateOf(false) }
    LazyColumn(modifier.fillMaxWidth(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text(stringResource(R.string.regions_hint), color = Chrome.dim, fontSize = 13.sp, lineHeight = 18.sp) }
        item { Text(stringResource(R.string.free_space, fmtBytes(vm.freeSpace())), color = Chrome.dim, fontSize = 13.sp) }
        items(vm.catalog.regions, key = { it.id }) { r ->
            OptionRow(r.title.of(lang), stringResource(R.string.region_maps, r.packages.size, fmtBytes(r.packages.sumOf { it.size })),
                leading = { Icon(Icons.Filled.Map, null, tint = Chrome.accent) }, trailing = { Icon(Icons.Filled.ChevronRight, null, tint = Chrome.dim) }) { onRegion(r.id) }
        }
        if (downloadable.isNotEmpty()) item {
            FooterLink(stringResource(R.string.custom_area), Icons.Filled.CloudDownload) {
                if (downloadable.size == 1) onCustomArea(downloadable.first()) else chooseSource = true
            }
        }
    }
    if (chooseSource) AlertDialog(
        onDismissRequest = { chooseSource = false },
        title = { Text(stringResource(R.string.choose_source)) },
        text = { Column { downloadable.forEach { s -> TextButton(onClick = { chooseSource = false; onCustomArea(s) }) { Text(s.title) } } } },
        confirmButton = { TextButton(onClick = { chooseSource = false }) { Text(stringResource(R.string.cancel)) } },
    )
}

/** Аумақтың карта пакеттері: көлемі, бос орын, жүктеу барысы, кідірту/жалғастыру/болдырмау, жүктелгенін ашу. */
@Composable
private fun RegionPackages(vm: MainViewModel, controller: MapController, act: MainActivity, r: CatalogRegion, lang: Lang, modifier: Modifier, onOpened: () -> Unit) {
    vm.layers.collectAsState().value
    vm.jobs.collectAsState().value
    val free = vm.freeSpace()
    LazyColumn(modifier.fillMaxWidth(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text(stringResource(R.string.free_space, fmtBytes(free)), color = Chrome.dim, fontSize = 13.sp) }
        val order = MapCategory.entries
        items(r.packages.sortedBy { order.indexOf(it.category) }, key = { it.id }) { p ->
            val (layer, job) = vm.packageState(p)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(p.title.of(lang), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                PackageFacts(p, lang, r.title.of(lang))
                Spacer(Modifier.height(8.dp))
                when {
                    layer != null -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.state_downloaded), color = Chrome.ok, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        PanelButton(stringResource(R.string.pkg_open), Icons.Filled.Map, primary = true) {
                            vm.setBase(layer.id); controller.fit(p.bounds); onOpened()
                        }
                    }
                    job != null -> JobControls(vm, job)
                    else -> {
                        val enough = free >= p.size
                        PanelButton(stringResource(R.string.pkg_download) + " · " + fmtBytes(p.size), Icons.Filled.CloudDownload, primary = enough,
                            modifier = Modifier.fillMaxWidth()) { act.askNotifications(); vm.startPackageDownload(p, lang) }
                        if (!enough) Text(stringResource(R.string.err_no_space), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun jobText(j: DownloadJob): String {
    val st = stringResource(when (j.state) {
        JobState.QUEUED -> if (j.error == "network") R.string.st_waiting_network else R.string.st_queued
        JobState.RUNNING -> R.string.st_running; JobState.PAUSED -> R.string.st_paused
        JobState.COMPLETED -> R.string.st_completed; JobState.FAILED -> R.string.st_failed; JobState.CANCELLED -> R.string.st_cancelled
    })
    return if (Catalog.packageIdOf(j.sourceId) != null) stringResource(R.string.job_bytes, st, j.percent, fmtBytes(j.done), fmtBytes(j.total))
    else stringResource(R.string.job_status, st, j.percent, j.done, j.total, fmtBytes(j.bytes))
}

/** Жүктеу барысы және басқару батырмалары. */
@Composable
private fun JobControls(vm: MainViewModel, j: DownloadJob) {
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(jobText(j), color = Chrome.dim, fontSize = 13.sp)
                if (j.failed > 0) Text(stringResource(R.string.job_missing, j.failed), color = Chrome.dim, fontSize = 12.sp)
                if (j.state == JobState.FAILED) Text(if (j.error.startsWith("verify")) stringResource(R.string.err_verify) else j.error,
                    color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            }
            when (j.state) {
                JobState.RUNNING, JobState.QUEUED -> IconButton(onClick = { vm.pauseDownload(j.id) }) { Icon(Icons.Filled.Pause, stringResource(R.string.pause)) }
                JobState.PAUSED, JobState.FAILED -> IconButton(onClick = { vm.resumeDownload(j.id) }) { Icon(Icons.Filled.PlayArrow, stringResource(R.string.resume)) }
                else -> {}
            }
            if (j.state != JobState.COMPLETED) IconButton(onClick = { vm.cancelDownload(j.id) }) { Icon(Icons.Filled.Stop, stringResource(R.string.cancel_download)) }
            else IconButton(onClick = { vm.removeJobRecord(j.id) }) { Icon(Icons.Filled.Close, stringResource(R.string.hide)) }
        }
        LinearProgressIndicator(progress = { j.percent / 100f }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp), color = Chrome.accent, trackColor = Chrome.bg3)
    }
}

@Composable
private fun JobCard(vm: MainViewModel, j: DownloadJob) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).padding(start = 14.dp, end = 4.dp, top = 10.dp, bottom = 10.dp)) {
        val title = Catalog.packageIdOf(j.sourceId)?.let { vm.catalog.pkg(it) }?.title?.of(uiLang()) ?: j.title
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        JobControls(vm, j)
    }
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
                // Файл тікелей таңдалады (алдын ала растау терезесі жоқ) — лицензия туралы ескерту осында көрсетіледі
                Text(stringResource(R.string.license_warning), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
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
