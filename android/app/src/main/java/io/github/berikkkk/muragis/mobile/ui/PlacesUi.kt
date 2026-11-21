package io.github.berikkkk.muragis.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Place
import io.github.berikkkk.muragis.core.model.PlaceKind
import io.github.berikkkk.muragis.core.model.Sorting
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import io.github.berikkkk.muragis.mobile.map.SymbolIcons

/** Өзге нысанның белгісі — картадағы суреттің дәл өзі (SymbolIcons.place: түсі мен Lucide таңбасы түріне қарай). */
@Composable
fun PlaceBadge(kind: PlaceKind, size: Dp = 28.dp) {
    val px = with(LocalDensity.current) { size.roundToPx() }.coerceAtLeast(1)
    val bmp = remember(kind, px) { SymbolIcons.place(kind, px).asImageBitmap() }
    Image(bmp, null, Modifier.size(size))
}

/**
 * Жаңа белгінің түрін таңдау: негізгісі — ескерткіш белгісі (өрістері өзгеріссіз), екіншісі — өзге нысандар
 * (елді мекен, қыстау, құдық…). Орны алдын ала таңдалған (нысана, ұзақ басу, GPS не енгізілген нүкте).
 */
@Composable
fun MarkChoiceDialog(vm: MainViewModel) {
    ChromeTheme {
        AlertDialog(
            onDismissRequest = { vm.dismissMarkChoice() },
            containerColor = Chrome.bg,
            title = { Text(stringResource(R.string.mark_choice_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OptionRow(stringResource(R.string.mark_choice_monument), stringResource(R.string.mark_choice_monument_sub),
                        leading = { Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Chrome.bg3), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.AccountBalance, null, tint = Chrome.accent)
                        } }) { vm.chooseMark(true) }
                    OptionRow(stringResource(R.string.mark_choice_place), stringResource(R.string.mark_choice_place_sub),
                        leading = { Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { PlaceBadge(PlaceKind.QYSTAU, 32.dp) } }) { vm.chooseMark(false) }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { vm.dismissMarkChoice() }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

/** Түрлерді таңдау: белгісімен бірге чиптер (бір түр). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PlaceKindChips(value: PlaceKind?, onChange: (PlaceKind) -> Unit, ui: Lang) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        PlaceKind.entries.forEach { k ->
            FilterChip(selected = k == value, onClick = { onChange(k) }, leadingIcon = { PlaceBadge(k, 20.dp) }, label = { Text(k.label(ui), fontSize = 13.sp) })
        }
    }
}

/** Өзге нысанды өңдеу: түрі, атауы (екі тілде, міндетті емес) және координатасы. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceEditorDialog(vm: MainViewModel, initial: Place, controller: MapController, act: MainActivity) {
    val prefs by vm.prefs.collectAsState()
    val ui = uiLang()
    var p by remember(initial) { mutableStateOf(initial) }
    var tab by remember { mutableStateOf(prefs.dataLang) }
    var latText by remember(initial) { mutableStateOf(Coords.decimal(initial.lat, 7)) }
    var lonText by remember(initial) { mutableStateOf(Coords.decimal(initial.lon, 7)) }
    var saving by remember { mutableStateOf(false) }
    val parsed = Coords.parsePair(latText, lonText)
    val coordOk = parsed is Coords.Pair.Ok

    Dialog(onDismissRequest = { vm.closePlaceEditor() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        DialogAdjustResize()
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().systemBarsPadding()) {
                TopAppBar(
                    title = { Text(stringResource(if (initial.id.isEmpty()) R.string.new_place else R.string.edit_place)) },
                    navigationIcon = { IconButton(onClick = { vm.closePlaceEditor() }) { Icon(Icons.Filled.Close, stringResource(R.string.cancel)) } },
                    actions = {
                        IconButton(enabled = coordOk && !saving, onClick = {
                            val c = parsed as Coords.Pair.Ok
                            saving = true
                            vm.savePlace(p.copy(lat = c.lat, lon = c.lon)) { saving = false }
                        }) { Icon(Icons.Filled.Check, stringResource(R.string.save)) }
                    },
                )
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                    SectionTitle(stringResource(R.string.f_place_kind))
                    PlaceKindChips(p.kind, { p = p.copy(kind = it) }, ui)

                    SectionTitle(stringResource(R.string.f_place_name))
                    TabRow(selectedTabIndex = tab.ordinal) {
                        Lang.entries.forEach { l ->
                            Tab(selected = tab == l, onClick = { tab = l }, text = { Text(langName(l) + if (p.name[l].isBlank()) " •" else "") })
                        }
                    }
                    OutlinedTextField(value = p.name[tab], onValueChange = { p = p.copy(name = p.name.with(tab, it)) },
                        label = { Text(stringResource(R.string.f_name)) }, placeholder = { Text(p.kind.label(tab)) }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).bringIntoViewOnFocus())
                    Text(stringResource(R.string.place_name_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray, modifier = Modifier.padding(top = 4.dp))

                    SectionTitle(stringResource(R.string.coordinates))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CoordField(stringResource(R.string.lat), latText, { latText = it }, Coords.parseOne(latText) is Coords.One.Err, Modifier.weight(1f))
                        CoordField(stringResource(R.string.lon), lonText, { lonText = it }, Coords.parseOne(lonText) is Coords.One.Err, Modifier.weight(1f))
                    }
                    if (parsed is Coords.Pair.Ok && parsed.swapped) Text(stringResource(R.string.coords_swapped), style = MaterialTheme.typography.labelSmall)
                    if (parsed is Coords.Pair.Ok) Text(Coords.dmsLat(parsed.lat) + "  " + Coords.dmsLon(parsed.lon), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            val cur = (parsed as? Coords.Pair.Ok)?.let { p.copy(lat = it.lat, lon = it.lon) } ?: p
                            controller.moveTo(cur.lat, cur.lon, maxOf(controller.zoom(), 16.0), animate = false)
                            vm.repickInPlaceEditor(cur)
                        }) { Icon(Icons.Filled.AddLocationAlt, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.place_on_map), fontSize = 12.sp) }
                        OutlinedButton(onClick = {
                            act.withLocation {
                                vm.location.requestFix { l -> if (l != null) { latText = Coords.decimal(l.latitude, 7); lonText = Coords.decimal(l.longitude, 7) } }
                            }
                        }) { Icon(Icons.Filled.GpsFixed, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.from_gps), fontSize = 12.sp) }
                    }
                    if (initial.id.isNotEmpty()) Text(stringResource(R.string.updated_at, p.updatedAt.take(16).replace('T', ' ')), style = MaterialTheme.typography.labelSmall,
                        color = Color.Gray, modifier = Modifier.padding(vertical = 12.dp))
                    Spacer(Modifier.size(80.dp))
                    ImeSpacer()
                }
            }
        }
    }
}

/** Өзге нысанның карточкасы (картадағы төменгі парақтың ішінде). */
@Composable
fun PlaceCardContent(vm: MainViewModel, p: Place, lang: Lang, dms: Boolean) {
    val ui = uiLang()
    val ctx = LocalContext.current
    var confirmDelete by remember { mutableStateOf(false) }
    val title = p.title(lang)
    SheetHeader(title, null) { vm.selectPlace(null) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PlaceBadge(p.kind, 22.dp)
        Text(p.kind.label(ui), style = MaterialTheme.typography.bodyMedium)
    }
    Text(fmtCoord(p.lat, dms, true) + "  " + fmtCoord(p.lon, dms, false), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
    Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BigButton(stringResource(R.string.copy), Modifier.weight(1f), icon = { Icon(Icons.Filled.ContentCopy, null, Modifier.size(20.dp)) }) {
            vm.openSheet(Sheet.Copy(p.lat, p.lon, title))
        }
        BigButton(stringResource(R.string.route_here), Modifier.weight(1f), primary = true, icon = { Icon(Icons.Filled.Route, null, Modifier.size(20.dp)) }) {
            vm.placePoint(p.id)?.let { vm.openPlan(it) }
        }
    }
    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { vm.openPlaceEditor(p) }) { Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.edit)) }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = {
            val label = Uri.encode(title)
            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}($label)"))) }
        }) { Icon(Icons.Filled.OpenInNew, stringResource(R.string.open_in_app)) }
        IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete), tint = MaterialTheme.colorScheme.error) }
    }
    if (confirmDelete) ConfirmDialog(stringResource(R.string.confirm_delete_place, title), stringResource(R.string.delete),
        onConfirm = { vm.deletePlaces(listOf(p.id)) }, onDismiss = { confirmDelete = false })
}

@Composable
fun PlaceRow(p: Place, lang: Lang, onClick: () -> Unit) {
    val ui = uiLang()
    OptionRow(
        p.title(lang),
        if (p.name.display(lang).isBlank()) null else p.kind.label(ui),
        leading = { PlaceBadge(p.kind, 26.dp) },
        trailing = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim) }, onClick = onClick,
    )
}

fun pickPlace(vm: MainViewModel, p: Place) {
    vm.closeMenu()
    vm.selectPlace(p.id)   // карта нысанға MainScreen-де жылжиды
}

/** Мәзірдегі «Өзге нысандар» беті: іздеу, түрі бойынша сүзгі, қосу, импорт/экспорт, тізім. */
@Composable
fun PlacesPage(vm: MainViewModel) {
    val all by vm.places.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val ui = uiLang()
    // Сүзгі ViewModel-де: картада да тек сүзгіге сай нысандар көрінеді
    val f by vm.placeFilter.collectAsState()
    val list by vm.filteredPlaces.collectAsState()
    val q = f.query; val kind = f.kind
    var dataDialog by remember { mutableStateOf<DataDialog?>(null) }
    val lang = prefs.dataLang
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                PageTitle(stringResource(R.string.tab_places),
                    if (list.size == all.size) stringResource(R.string.places_count, all.size) else stringResource(R.string.places_count_filtered, list.size, all.size))
            }
            DataMenu(onImport = { dataDialog = DataDialog.IMPORT }, onExport = { dataDialog = DataDialog.EXPORT })
        }
        ChromeSearch(q, { vm.setPlaceFilter(f.copy(query = it)) }, stringResource(R.string.places_search_hint))
        LazyRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            item { FilterChip(selected = kind == null, onClick = { vm.setPlaceFilter(f.copy(kind = null)) }, label = { Text(stringResource(R.string.all_kinds), fontSize = 13.sp) }) }
            items(PlaceKind.entries) { k ->
                FilterChip(selected = kind == k, onClick = { vm.setPlaceFilter(f.copy(kind = if (kind == k) null else k)) }, leadingIcon = { PlaceBadge(k, 18.dp) }, label = { Text(k.label(ui), fontSize = 13.sp) })
            }
        }
        BigButton(stringResource(R.string.add_place), Modifier.fillMaxWidth().padding(top = 8.dp), icon = { Icon(Icons.Filled.AddLocationAlt, null, Modifier.size(20.dp)) }) {
            vm.setPick(Pick.PLACE)
        }
        Spacer(Modifier.height(10.dp))
        if (list.isEmpty()) Text(stringResource(R.string.list_empty), color = Chrome.dim, modifier = Modifier.padding(8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 32.dp)) {
            items(list, key = { it.id }) { p -> PlaceRow(p, lang) { pickPlace(vm, p) } }
        }
    }
    dataDialog?.let { DataDialogs(vm, it, ImportTarget.PLACES, false) { dataDialog = null } }
}
