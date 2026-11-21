package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.core.io.lengthMeters
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController

/** Толық экранды мәзір: жоғарыда атау, одан кейін іздеу, содан соң бөлімдер. */
@Composable
fun MenuScreen(vm: MainViewModel, page: MenuPage, controller: MapController, act: MainActivity) {
    ChromeTheme {
        Surface(color = Chrome.bg, contentColor = Chrome.fg, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (page != MenuPage.ROOT) RoundIcon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back)) { vm.openMenu(page.parent) }
                    Spacer(Modifier.weight(1f))
                    RoundIcon(Icons.Filled.Close, stringResource(R.string.menu_close)) { vm.closeMenu() }
                }
                when (page) {
                    MenuPage.ROOT -> MenuRoot(vm, controller)
                    MenuPage.MONUMENTS -> MonumentsPage(vm, controller)
                    MenuPage.PLACES -> PlacesPage(vm)
                    MenuPage.ROUTES -> RoutesPage(vm, controller)
                    MenuPage.COORDS -> CoordsPage(vm, controller)
                    MenuPage.SETTINGS -> Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                        PageTitle(stringResource(R.string.tab_settings), null)
                        InterfaceSettings(vm)
                        SettingsContent(vm, act)
                    }
                    MenuPage.ABOUT -> AboutPage(vm)
                }
            }
        }
    }
}

@Composable
private fun RoundIcon(icon: ImageVector, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Chrome.bg2)) { Icon(icon, label) }
}

@Composable
fun PageTitle(title: String, sub: String?) {
    Text(title, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
    if (sub != null) Text(sub, color = Chrome.dim, fontSize = 13.5.sp, modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)) else Spacer(Modifier.height(8.dp))
}

@Composable
private fun SectionIcon(icon: ImageVector, tint: Color = Chrome.accent) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Chrome.bg3), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
}

@Composable
private fun Chevron() = Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim)

/** Іздеу өрісі (мәзір түсімен). */
@Composable
fun ChromeSearch(value: String, onChange: (String) -> Unit, hint: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).border(1.dp, Color(0x17FFFFFF), RoundedCornerShape(16.dp))
            .padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Filled.Search, null, tint = Chrome.dim, modifier = Modifier.size(20.dp))
        BasicTextField(value = value, onValueChange = onChange, singleLine = true, textStyle = TextStyle(color = Chrome.fg, fontSize = 15.5.sp),
            cursorBrush = SolidColor(Chrome.accent), modifier = Modifier.weight(1f),
            decorationBox = { inner -> Box { if (value.isEmpty()) Text(hint, color = Chrome.dim, fontSize = 15.5.sp, maxLines = 1); inner() } })
        if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Filled.Close, stringResource(R.string.clear), tint = Chrome.dim) }
        trailing?.invoke()
    }
}

@Composable
private fun MenuRoot(vm: MainViewModel, controller: MapController) {
    val monuments by vm.monuments.collectAsState()
    val places by vm.places.collectAsState()
    val routes by vm.routes.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var q by rememberSaveable { mutableStateOf("") }
    val lang = prefs.dataLang
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp, bottom = 18.dp)) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF353535)), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(64.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(stringResource(R.string.app_name), fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.menu_tagline), color = Chrome.dim, fontSize = 12.5.sp)
            }
        }
        ChromeSearch(q, { q = it }, stringResource(R.string.menu_search_hint))
        Spacer(Modifier.height(18.dp))
        if (q.isNotBlank()) {
            val coord = (Coords.parseLine(q) as? Coords.Pair.Ok)
            val found = monuments.filter { it.name.matches(q) || it.place.matches(q) || it.district.matches(q) }.take(50)
            val foundPlaces = places.filter { it.name.matches(q) }.take(50)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                coord?.let { c ->
                    OptionRow(stringResource(R.string.go_to_coord), Utm.formatDd(c.lat, c.lon), subMono = true, leading = { SectionIcon(Icons.Filled.Place) }, trailing = { Chevron() }) {
                        vm.showPin(c.lat, c.lon); controller.moveTo(c.lat, c.lon, maxOf(controller.zoom(), 14.0))
                    }
                }
                found.forEach { m -> MonumentRow(m, lang) { pickMonument(vm, m) } }
                foundPlaces.forEach { p -> PlaceRow(p, lang) { pickPlace(vm, p) } }
                if (coord == null && found.isEmpty() && foundPlaces.isEmpty()) Text(stringResource(R.string.search_nothing, q), color = Chrome.dim, fontSize = 14.sp, modifier = Modifier.padding(4.dp))
            }
        } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val tracks = routes.count { MainViewModel.isTrack(it) }
            OptionRow(stringResource(R.string.tab_monuments), stringResource(R.string.menu_monuments_sub, monuments.size), leading = { SectionIcon(LucideIcons.Landmark) },
                trailing = { Chevron() }) { vm.openMenu(MenuPage.MONUMENTS) }
            // Өзге нысандар — ескерткіштердің астында (жұмыс үстеліндегідей). Мәзір иконкалары — Desktop-тағы Lucide иконкалары
            OptionRow(stringResource(R.string.tab_places), stringResource(R.string.menu_places_sub, places.size),
                leading = { SectionIcon(LucideIcons.MapPinned) }, trailing = { Chevron() }) { vm.openMenu(MenuPage.PLACES) }
            OptionRow(stringResource(R.string.tab_routes), stringResource(R.string.menu_routes_sub, routes.size - tracks, tracks), leading = { SectionIcon(LucideIcons.Route) },
                trailing = { Chevron() }) { vm.openMenu(MenuPage.ROUTES) }
            OptionRow(stringResource(R.string.coord_input), "DD · DMS · UTM", leading = { SectionIcon(LucideIcons.Locate) }, trailing = { Chevron() }) { vm.openMenu(MenuPage.COORDS) }
            OptionRow(stringResource(R.string.tab_settings),
                stringResource(R.string.menu_settings_sub,
                    stringResource(if (prefs.zoomLeft) R.string.side_left else R.string.side_right),
                    stringResource(if (prefs.barTop) R.string.bar_top else R.string.bar_bottom)),
                leading = { SectionIcon(LucideIcons.Settings) }, trailing = { Chevron() }) { vm.openMenu(MenuPage.SETTINGS) }
        }
    }
}

private fun pickMonument(vm: MainViewModel, m: Monument) {
    vm.closeMenu()
    vm.selectRoute(null)
    vm.select(m.id)   // карта белгіге MainScreen-де жылжиды (карточканың үстінде көрінетіндей)
}

@Composable
private fun MonumentRow(m: Monument, lang: io.github.berikkkk.muragis.core.model.Lang, onClick: () -> Unit) {
    val ui = uiLang()
    OptionRow(
        m.name.display(lang).ifBlank { "—" },
        listOf(m.period.display(lang), m.type.label(ui), m.district.display(lang)).filter { it.isNotBlank() }.joinToString(" · "),
        leading = { Box(Modifier.size(14.dp).clip(CircleShape).background(Color(m.category.fill.toInt())).border(2.dp, Color.White, CircleShape)) },
        trailing = { Chevron() }, onClick = onClick,
    )
}

/** Ескерткіштер: іздеу, сүзгі, импорт/экспорт, тізім. Түрткенде карта сол нысанға жақындайды. */
@Composable
private fun MonumentsPage(vm: MainViewModel, controller: MapController) {
    val list by vm.filteredMonuments.collectAsState()
    val all by vm.monuments.collectAsState()
    val filter by vm.filter.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var showFilter by remember { mutableStateOf(false) }
    var dataDialog by remember { mutableStateOf<DataDialog?>(null) }
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                PageTitle(stringResource(R.string.tab_monuments),
                    if (list.size == all.size) stringResource(R.string.monuments_count, all.size) else stringResource(R.string.monuments_count_filtered, list.size, all.size))
            }
            DataMenu(onImport = { dataDialog = DataDialog.IMPORT }, onExport = { dataDialog = DataDialog.EXPORT })
        }
        ChromeSearch(filter.query, { vm.setFilter(filter.copy(query = it)) }, stringResource(R.string.search_hint)) {
            IconButton(onClick = { showFilter = true }) {
                Icon(Icons.Filled.FilterList, stringResource(R.string.filter), tint = if (filter.copy(query = "").active) Chrome.accent else Chrome.dim)
            }
        }
        BigButton(stringResource(R.string.add_monument), Modifier.fillMaxWidth().padding(top = 10.dp), icon = { Icon(Icons.Filled.AddLocationAlt, null, Modifier.size(20.dp)) }) {
            vm.setPick(Pick.MONUMENT)
        }
        Spacer(Modifier.height(10.dp))
        if (list.isEmpty()) Text(stringResource(R.string.list_empty), color = Chrome.dim, modifier = Modifier.padding(8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 32.dp)) {
            items(list, key = { it.id }) { m -> MonumentRow(m, prefs.dataLang) { pickMonument(vm, m) } }
        }
    }
    if (showFilter) FilterDialog(vm, filter, all, prefs.dataLang) { showFilter = false }
    dataDialog?.let { DataDialogs(vm, it, ImportTarget.MONUMENTS, filter.active) { dataDialog = null } }
}

/** Маршруттар: құру (А → Б), қолмен сызу, импорт/экспорт; құрылған маршруттар мен жазылған тректер — бөлек тізімде. */
@Composable
private fun RoutesPage(vm: MainViewModel, controller: MapController) {
    val routes by vm.routes.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var dialog by remember { mutableStateOf<DataDialog?>(null) }
    val lang = prefs.dataLang
    val (tracks, plain) = routes.sortedBy { it.name.display(lang) }.partition { MainViewModel.isTrack(it) }
    LazyColumn(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 32.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { PageTitle(stringResource(R.string.tab_routes), stringResource(R.string.routes_page_sub)) }
                DataMenu(onImport = { dialog = DataDialog.IMPORT }, onExport = { dialog = DataDialog.EXPORT })
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BigButton(stringResource(R.string.plan_title), Modifier.weight(1f), primary = true, icon = { Icon(Icons.Filled.Route, null, Modifier.size(20.dp)) }) { vm.openPlan() }
                BigButton(stringResource(R.string.draw_route), Modifier.weight(1f), icon = { Icon(Icons.Filled.Draw, null, Modifier.size(20.dp)) }) { vm.startNewRoute() }
            }
        }
        item { ChromeLabel(stringResource(R.string.routes_built)) }
        if (plain.isEmpty()) item { Text(stringResource(R.string.routes_empty), color = Chrome.dim, fontSize = 14.sp) }
        items(plain, key = { it.id }) { r -> RouteRow(vm, controller, r, lang, false) }
        item { ChromeLabel(stringResource(R.string.tracks_recorded)) }
        if (tracks.isEmpty()) item { Text(stringResource(R.string.tracks_empty), color = Chrome.dim, fontSize = 14.sp) }
        items(tracks, key = { it.id }) { r -> RouteRow(vm, controller, r, lang, true) }
    }
    dialog?.let { DataDialogs(vm, it, ImportTarget.ROUTES, false) { dialog = null } }
}

@Composable
private fun RouteRow(vm: MainViewModel, controller: MapController, r: Route, lang: io.github.berikkkk.muragis.core.model.Lang, track: Boolean) {
    OptionRow(r.name.display(lang).ifBlank { "—" }, fmtLength(r.lengthMeters()) + if (track) "" else " · " + vehicleLabel(r.vehicle),
        leading = { SectionIcon(if (track) Icons.Filled.FiberManualRecord else Icons.Filled.Route, if (track) Chrome.rec else Chrome.accent) },
        trailing = { Chevron() }) {
        vm.closeMenu()
        vm.select(null)
        vm.selectRoute(r.id)
        Geo.bounds(r.points.map { LatLon(it.lat, it.lon) })?.let { controller.fit(it, 64) }
    }
}

/** Интерфейс баптаулары: zoom батырмаларының орны және құралдар панелінің орны (алдын ала көрінісімен). */
@Composable
fun InterfaceSettings(vm: MainViewModel) {
    val prefs by vm.prefs.collectAsState()
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.weight(1f)) {
            ChromeLabel(stringResource(R.string.set_zoom_side))
            Segmented(listOf(false to stringResource(R.string.side_right), true to stringResource(R.string.side_left)), prefs.zoomLeft) { v -> vm.updatePrefs { it.copy(zoomLeft = v) } }
            ChromeLabel(stringResource(R.string.set_bar_pos))
            Segmented(listOf(false to stringResource(R.string.bar_bottom), true to stringResource(R.string.bar_top)), prefs.barTop) { v -> vm.updatePrefs { it.copy(barTop = v) } }
        }
        // Шағын алдын ала көрініс
        Box(Modifier.padding(top = 16.dp).size(width = 84.dp, height = 156.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFE2DAC5))
            .border(2.dp, Chrome.bg3, RoundedCornerShape(16.dp))) {
            Box(Modifier.align(if (prefs.zoomLeft) Alignment.CenterStart else Alignment.CenterEnd).padding(horizontal = 5.dp).size(width = 12.dp, height = 34.dp)
                .clip(RoundedCornerShape(5.dp)).background(Chrome.bg))
            Column(Modifier.align(if (prefs.barTop) Alignment.TopCenter else Alignment.BottomCenter).padding(6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                val strip = @Composable { Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(3.dp)).background(Chrome.bg.copy(alpha = 0.85f))) }
                val bar = @Composable { Box(Modifier.fillMaxWidth().height(16.dp).clip(RoundedCornerShape(6.dp)).background(Chrome.bg)) }
                if (prefs.barTop) { bar(); strip() } else { strip(); bar() }
            }
        }
    }
    Text(stringResource(R.string.set_defaults_note), color = Chrome.dim, fontSize = 12.5.sp, modifier = Modifier.padding(top = 10.dp))
    if (prefs.zoomLeft || prefs.barTop) BigButton(stringResource(R.string.set_reset_ui), Modifier.fillMaxWidth().padding(top = 8.dp)) {
        vm.updatePrefs { it.copy(zoomLeft = false, barTop = false) }
    }
}

@Composable
fun vehicleLabel(v: io.github.berikkkk.muragis.core.model.Vehicle) = stringResource(when (v) {
    io.github.berikkkk.muragis.core.model.Vehicle.CAR -> R.string.v_car
    io.github.berikkkk.muragis.core.model.Vehicle.OFFROAD -> R.string.v_4x4
    io.github.berikkkk.muragis.core.model.Vehicle.FOOT -> R.string.v_foot
})
