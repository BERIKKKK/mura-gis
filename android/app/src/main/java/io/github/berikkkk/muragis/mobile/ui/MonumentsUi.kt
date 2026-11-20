package io.github.berikkkk.muragis.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Periods
import io.github.berikkkk.muragis.core.model.Regions
import io.github.berikkkk.muragis.core.model.Status
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import java.util.Locale

enum class DataDialog { IMPORT, EXPORT }

@Composable
fun DataMenu(onImport: () -> Unit, onExport: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.import_data)) }, onClick = { open = false; onImport() })
            DropdownMenuItem(text = { Text(stringResource(R.string.export_data)) }, onClick = { open = false; onExport() })
        }
    }
}

/** Ескерткіш карточкасы (картадағы төменгі парақтың ішінде). */
@Composable
fun MonumentCardContent(vm: MainViewModel, m: Monument, lang: Lang, dms: Boolean) {
    val ui = uiLang()
    val ctx = LocalContext.current
    var confirmDelete by remember { mutableStateOf(false) }
    SheetHeader(m.name.display(lang).ifBlank { "—" }, null) { vm.select(null) }
    if (m.name[lang].isBlank()) Text(stringResource(R.string.no_translation, langName(lang)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
    val lines = listOf(
        m.period.display(lang), m.type.label(ui), m.category.label(ui), m.status.label(ui),
        listOf(m.oblast.display(lang), m.district.display(lang)).filter { it.isNotBlank() }.joinToString(", "),
        m.place.display(lang),
        fmtCoord(m.lat, dms, true) + "  " + fmtCoord(m.lon, dms, false),
        m.note.display(lang),
    ).filter { it.isNotBlank() }
    lines.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
    Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BigButton(stringResource(R.string.copy), Modifier.weight(1f), icon = { Icon(Icons.Filled.ContentCopy, null, Modifier.size(20.dp)) }) {
            vm.openSheet(Sheet.Copy(m.lat, m.lon, m.name.display(lang)))
        }
        BigButton(stringResource(R.string.route_here), Modifier.weight(1f), primary = true, icon = { Icon(Icons.Filled.Route, null, Modifier.size(20.dp)) }) {
            vm.monumentPoint(m.id)?.let { vm.openPlan(it) }
        }
    }
    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { vm.openEditor(m) }) { Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.edit)) }
        TextButton(onClick = { vm.addMonumentToRoute(m.id) }) { Text(stringResource(R.string.new_route_from), maxLines = 1) }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = {
            val label = Uri.encode(m.name.display(lang))
            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${m.lat},${m.lon}?q=${m.lat},${m.lon}($label)"))) }
        }) { Icon(Icons.Filled.OpenInNew, stringResource(R.string.open_in_app)) }
        IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete), tint = MaterialTheme.colorScheme.error) }
    }
    if (confirmDelete) ConfirmDialog(stringResource(R.string.confirm_delete_monument, m.name.display(lang)), stringResource(R.string.delete),
        onConfirm = { vm.deleteMonuments(listOf(m.id)) }, onDismiss = { confirmDelete = false })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilterDialog(vm: MainViewModel, f: MonumentFilter, onDismiss: () -> Unit) {
    val ui = uiLang()
    var cur by remember { mutableStateOf(f) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.filter)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                SectionTitle(stringResource(R.string.f_type))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MonumentType.entries.forEach { t ->
                        FilterChip(selected = t in cur.types, onClick = { cur = cur.copy(types = cur.types.toggle(t)) }, label = { Text(t.label(ui), fontSize = 12.sp) })
                    }
                }
                SectionTitle(stringResource(R.string.f_category))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Category.entries.forEach { c ->
                        FilterChip(selected = c in cur.categories, onClick = { cur = cur.copy(categories = cur.categories.toggle(c)) }, label = { Text(c.label(ui), fontSize = 12.sp) })
                    }
                }
                SectionTitle(stringResource(R.string.f_status))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Status.entries.forEach { s ->
                        FilterChip(selected = s in cur.statuses, onClick = { cur = cur.copy(statuses = cur.statuses.toggle(s)) }, label = { Text(s.label(ui), fontSize = 12.sp, maxLines = 2) })
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { vm.setFilter(cur); onDismiss() }) { Text(stringResource(R.string.apply)) } },
        dismissButton = { TextButton(onClick = { vm.setFilter(MonumentFilter(query = f.query)); onDismiss() }) { Text(stringResource(R.string.reset)) } },
    )
}

private fun <T> Set<T>.toggle(v: T) = if (v in this) this - v else this + v

/** Ескерткішті өңдеу: мәтіндер екі тілде бөлек қойындыларда, координаталар — дәл енгізу. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonumentEditorDialog(vm: MainViewModel, initial: Monument, controller: MapController, act: MainActivity) {
    val prefs by vm.prefs.collectAsState()
    val ui = uiLang()
    var m by remember(initial) { mutableStateOf(initial) }
    var tab by remember { mutableStateOf(prefs.dataLang) }
    var latText by remember(initial) { mutableStateOf(Coords.decimal(initial.lat, 7)) }
    var lonText by remember(initial) { mutableStateOf(Coords.decimal(initial.lon, 7)) }
    var saving by remember { mutableStateOf(false) }
    var periodLang by remember { mutableStateOf<Lang?>(null) }    // мерзім соңғы рет қай тілде жазылды
    val parsed = Coords.parsePair(latText, lonText)
    val coordOk = parsed is Coords.Pair.Ok
    // Жыл/аралық жазылса — екі тілдің мәні бірге қойылады («1967» → «1967 жыл» / «1967 год»)
    fun synced(x: Monument) = periodLang?.let { x.copy(period = Periods.sync(x.period, it)) } ?: x

    // decorFitsSystemWindows = false: пернетақта ашылғанда терезе imePadding арқылы кішірейеді, белсенді өріс оның үстіне шығады
    Dialog(onDismissRequest = { vm.closeEditor() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        DialogAdjustResize()
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
                TopAppBar(
                    title = { Text(stringResource(if (initial.id.isEmpty()) R.string.new_monument else R.string.edit_monument)) },
                    navigationIcon = { IconButton(onClick = { vm.closeEditor() }) { Icon(Icons.Filled.Close, stringResource(R.string.cancel)) } },
                    actions = {
                        IconButton(enabled = coordOk && !saving, onClick = {
                            val p = parsed as Coords.Pair.Ok
                            saving = true
                            m = synced(m)
                            vm.saveMonument(m.copy(lat = p.lat, lon = p.lon)) { saving = false }
                        }) { Icon(Icons.Filled.Check, stringResource(R.string.save)) }
                    },
                )
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                    SectionTitle(stringResource(R.string.coordinates))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CoordField(stringResource(R.string.lat), latText, { latText = it }, Coords.parseOne(latText) is Coords.One.Err, Modifier.weight(1f))
                        CoordField(stringResource(R.string.lon), lonText, { lonText = it }, Coords.parseOne(lonText) is Coords.One.Err, Modifier.weight(1f))
                    }
                    if (parsed is Coords.Pair.Ok && parsed.swapped) Text(stringResource(R.string.coords_swapped), style = MaterialTheme.typography.labelSmall)
                    if (parsed is Coords.Pair.Ok) Text(Coords.dmsLat(parsed.lat) + "  " + Coords.dmsLon(parsed.lon), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Картада белгілеу: терезе уақытша жабылып, нысанамен жаңа орын таңдалады (енгізілген мәліметтер сақталады)
                        OutlinedButton(onClick = {
                            val cur = synced(m).let { x -> (parsed as? Coords.Pair.Ok)?.let { x.copy(lat = it.lat, lon = it.lon) } ?: x }
                            controller.moveTo(cur.lat, cur.lon, maxOf(controller.zoom(), 16.0), animate = false)
                            vm.repickInEditor(cur)
                        }) { Icon(Icons.Filled.AddLocationAlt, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.place_on_map), fontSize = 12.sp) }
                        OutlinedButton(onClick = {
                            act.withLocation {
                                vm.location.requestFix { l -> if (l != null) { latText = Coords.decimal(l.latitude, 7); lonText = Coords.decimal(l.longitude, 7) } }
                            }
                        }) { Icon(Icons.Filled.GpsFixed, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.from_gps), fontSize = 12.sp) }
                    }

                    SectionTitle(stringResource(R.string.texts_by_language))
                    TabRow(selectedTabIndex = tab.ordinal) {
                        Lang.entries.forEach { l ->
                            Tab(selected = tab == l, onClick = { tab = l }, text = {
                                val filled = !m.name[l].isBlank()
                                Text(langName(l) + if (filled) "" else " •")
                            })
                        }
                    }
                    Text(stringResource(R.string.lang_fields_note, langName(tab)), style = MaterialTheme.typography.labelSmall, color = Color.Gray, modifier = Modifier.padding(top = 4.dp))
                    // Әр өріс тек таңдалған тілдің мәнін өзгертеді: екінші тілдің мәні сақталады
                    @Composable fun loc(label: Int, v: Localized, set: (Localized) -> Unit, lines: Int = 1, extra: Modifier = Modifier) {
                        OutlinedTextField(value = v[tab], onValueChange = { set(v.with(tab, it)) }, label = { Text(stringResource(label)) },
                            singleLine = lines == 1, minLines = lines, modifier = Modifier.fillMaxWidth().padding(top = 6.dp).bringIntoViewOnFocus().then(extra))
                    }
                    loc(R.string.f_name, m.name, { m = m.copy(name = it) })
                    var periodFocused by remember { mutableStateOf(false) }
                    loc(R.string.f_period, m.period, { m = m.copy(period = it); periodLang = tab },
                        extra = Modifier.onFocusChanged { f -> if (periodFocused && !f.isFocused) m = synced(m); periodFocused = f.isFocused })
                    if (periodLang != null) Periods.normalize(m.period[periodLang!!])?.let { (kk, ru) ->
                        Text("$kk · $ru", style = MaterialTheme.typography.labelSmall, color = Color.Gray, modifier = Modifier.padding(top = 2.dp))
                    }
                    RegionFields(m, tab, { m = it; vm.rememberOblast(it.oblast.kk) }) { lbl, v, set -> loc(lbl, v, set) }
                    loc(R.string.f_place, m.place, { m = m.copy(place = it) }, 2)
                    loc(R.string.f_note, m.note, { m = m.copy(note = it) }, 2)

                    SectionTitle(stringResource(R.string.classification))
                    Dropdown(stringResource(R.string.f_type), m.type, MonumentType.entries, { it.label(ui) }, { m = m.copy(type = it) }, Modifier.fillMaxWidth())
                    Spacer(Modifier.size(6.dp))
                    Dropdown(stringResource(R.string.f_category), m.category, Category.entries, { it.label(ui) }, { m = m.copy(category = it) }, Modifier.fillMaxWidth())
                    Spacer(Modifier.size(6.dp))
                    Dropdown(stringResource(R.string.f_status), m.status, Status.entries, { it.label(ui) }, { m = m.copy(status = it) }, Modifier.fillMaxWidth())
                    if (initial.id.isNotEmpty()) Text(stringResource(R.string.updated_at, m.updatedAt.take(16).replace('T', ' ')), style = MaterialTheme.typography.labelSmall,
                        color = Color.Gray, modifier = Modifier.padding(vertical = 12.dp))
                    Spacer(Modifier.size(80.dp))
                }
            }
        }
    }
}

/** Импорт/экспорт терезелері (ескерткіштер және маршруттар үшін ортақ). */
@Composable
fun DataDialogs(vm: MainViewModel, kind: DataDialog, target: ImportTarget, filtered: Boolean, routeId: String? = null, onDone: () -> Unit) {
    val prefs by vm.prefs.collectAsState()
    var lang by remember { mutableStateOf(if (kind == DataDialog.IMPORT) prefs.dataLang else prefs.exportLang) }
    val formats = if (target == ImportTarget.MONUMENTS) listOf(MainViewModel.ExportFormat.GEOJSON, MainViewModel.ExportFormat.GPKG, MainViewModel.ExportFormat.KML)
    else listOf(MainViewModel.ExportFormat.GPX, MainViewModel.ExportFormat.GEOJSON, MainViewModel.ExportFormat.KML, MainViewModel.ExportFormat.GPKG)
    var format by remember { mutableStateOf(formats.first()) }
    var onlyFiltered by remember { mutableStateOf(filtered) }

    val open = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) vm.importData(uri, target, lang); onDone() }
    val savers = MainViewModel.ExportFormat.entries.associateWith { f ->
        rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(f.mime)) { uri ->
            if (uri != null) vm.export(uri, target, f, lang, onlyFiltered && target == ImportTarget.MONUMENTS, routeId)
            onDone()
        }
    }
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(if (kind == DataDialog.IMPORT) R.string.import_data else R.string.export_data)) },
        text = {
            Column {
                if (kind == DataDialog.IMPORT) {
                    Text(stringResource(if (target == ImportTarget.MONUMENTS) R.string.import_formats_monuments else R.string.import_formats_routes), style = MaterialTheme.typography.bodySmall)
                    SectionTitle(stringResource(R.string.import_lang))
                    LangRadio(lang) { lang = it }
                    Text(stringResource(R.string.import_lang_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                } else {
                    SectionTitle(stringResource(R.string.format))
                    formats.forEach { f ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { format = f }) {
                            androidx.compose.material3.RadioButton(selected = format == f, onClick = { format = f })
                            Text(stringResource(when (f) {
                                MainViewModel.ExportFormat.GEOJSON -> R.string.fmt_geojson; MainViewModel.ExportFormat.GPKG -> R.string.fmt_gpkg
                                MainViewModel.ExportFormat.KML -> R.string.fmt_kml; MainViewModel.ExportFormat.GPX -> R.string.fmt_gpx
                            }), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    SectionTitle(stringResource(R.string.export_lang))
                    LangRadio(lang) { lang = it }
                    if (target == ImportTarget.MONUMENTS && filtered) Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = onlyFiltered, onCheckedChange = { onlyFiltered = it }); Text(stringResource(R.string.only_filtered))
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (kind == DataDialog.IMPORT) open.launch(arrayOf("*/*"))
                else {
                    val stamp = java.text.SimpleDateFormat("yyyyMMdd", Locale.ROOT).format(java.util.Date())
                    val base = if (target == ImportTarget.MONUMENTS) "eskertkishter" else "marshruttar"
                    savers.getValue(format).launch("$base-${lang.code}-$stamp.${format.ext}")
                }
            }) { Text(stringResource(if (kind == DataDialog.IMPORT) R.string.choose_file else R.string.save_file)) }
        },
        dismissButton = { TextButton(onClick = onDone) { Text(stringResource(R.string.cancel)) } },
    )
}

/** KML/KMZ/GPX/бөтен GeoJSON нүктелерін ескерткіш ретінде импорттау алдында қарау. */
@Composable
fun PendingPointsDialog(vm: MainViewModel, p: PendingPoints) {
    val prefs by vm.prefs.collectAsState()
    val ui = uiLang()
    var sel by remember(p) { mutableStateOf(p.points.indices.toSet()) }
    var lang by remember { mutableStateOf(prefs.dataLang) }
    var type by remember { mutableStateOf(MonumentType.ARCHEO) }
    var cat by remember { mutableStateOf(Category.NONE) }
    var status by remember { mutableStateOf(Status.STATE) }
    Dialog(onDismissRequest = { vm.dismissPending() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Text(stringResource(R.string.pending_title, p.file, p.points.size), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.pending_note), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = sel.size == p.points.size, onCheckedChange = { sel = if (it) p.points.indices.toSet() else emptySet() })
                    Text(stringResource(R.string.select_all, sel.size))
                }
                LazyColumn(Modifier.weight(1f)) {
                    items(p.points.indices.toList()) { i ->
                        val pt = p.points[i]
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { sel = sel.toggle(i) }) {
                            Checkbox(checked = i in sel, onCheckedChange = { sel = sel.toggle(i) })
                            Column {
                                Text(pt.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(Coords.decimal(pt.lat, 5) + ", " + Coords.decimal(pt.lon, 5) + if (pt.folder.isNotBlank()) " · " + pt.folder else "",
                                    style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                            }
                        }
                    }
                }
                Text(stringResource(R.string.import_lang), style = MaterialTheme.typography.labelLarge)
                LangRadio(lang) { lang = it }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Dropdown(stringResource(R.string.f_type), type, MonumentType.entries, { it.label(ui) }, { type = it }, Modifier.weight(1f))
                    Dropdown(stringResource(R.string.f_category), cat, Category.entries, { it.label(ui) }, { cat = it }, Modifier.weight(1f))
                }
                Dropdown(stringResource(R.string.f_status), status, Status.entries, { it.label(ui) }, { status = it }, Modifier.fillMaxWidth())
                Row(Modifier.align(Alignment.End).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { vm.dismissPending() }) { Text(stringResource(R.string.cancel)) }
                    Button(enabled = sel.isNotEmpty(), onClick = { vm.importPending(sel, lang, type, cat, status) }) { Text(stringResource(R.string.import_n, sel.size)) }
                }
            }
        }
    }
}

@Suppress("unused") private val keepFill = Modifier.fillMaxHeight()

/**
 * Облыс пен аудан — тізімнен таңдалады (жұмыс үстеліндегідей, src/js/regions.js). Таңдағанда екі тілдің мәні бірге
 * қойылады, сондықтан қазақша мен орысша әртүрлі болмайды. Тізімде жоқ ескі мән (импорт, қолмен жазылған) сақталады
 * және тізімде көрінеді; облыс тізімнен тыс болса — аудан қолмен жазылады.
 */
@Composable
private fun RegionFields(m: Monument, tab: Lang, onChange: (Monument) -> Unit, textField: @Composable (Int, Localized, (Localized) -> Unit) -> Unit) {
    val region = Regions.find(m.oblast.kk.ifBlank { m.oblast.ru })
    val customOblast = region == null && !m.oblast.isBlank()
    val none = stringResource(R.string.none_dash)
    // null — «таңдалмаған», "custom" — тізімде жоқ ескі мән
    val oblastKeys: List<String?> = buildList { add(null); if (customOblast) add("custom"); Regions.list.forEach { add(it.kk) } }
    Spacer(Modifier.size(6.dp))
    Dropdown(stringResource(R.string.f_oblast), if (customOblast) "custom" else region?.kk, oblastKeys, { k ->
        when (k) { null -> none; "custom" -> m.oblast.display(tab); else -> Regions.find(k)!!.label(tab) }
    }, { k ->
        if (k == "custom") return@Dropdown
        val r = k?.let { Regions.find(it) }
        val keepDistrict = r != null && Regions.findUnit(r, m.district.kk.ifBlank { m.district.ru }) != null
        onChange(m.copy(oblast = r?.name ?: Localized.EMPTY, district = if (keepDistrict) m.district else Localized.EMPTY))
    }, Modifier.fillMaxWidth().padding(top = 6.dp))
    if (region == null) {
        textField(R.string.f_district, m.district) { onChange(m.copy(district = it)) }
        return
    }
    val unit = Regions.findUnit(region, m.district.kk.ifBlank { m.district.ru })
    val customDistrict = unit == null && !m.district.isBlank()
    val keys: List<String?> = buildList { add(null); if (customDistrict) add("custom"); region.units.forEach { add(it.kk) } }
    Spacer(Modifier.size(6.dp))
    Dropdown(stringResource(R.string.f_district), if (customDistrict) "custom" else unit?.kk, keys, { k ->
        when (k) { null -> none; "custom" -> m.district.display(tab); else -> Regions.findUnit(region, k)!!.label(tab) }
    }, { k ->
        if (k == "custom") return@Dropdown
        onChange(m.copy(district = k?.let { Regions.findUnit(region, it)?.name } ?: Localized.EMPTY))
    }, Modifier.fillMaxWidth())
}
