package io.github.berikkkk.muragis.mobile.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Deselect
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController

/**
 * Тізімде бірнеше нысанды белгілеу күйі (ескерткіштер, өзге нысандар). [ids] — белгіленгендердің id-лері;
 * [active] — белгілеу режимі қосулы (жолды басу — белгілеу, ұзақ басу — режимді қосу).
 */
class ListSelection {
    var active by mutableStateOf(false)
    var ids by mutableStateOf(emptySet<String>())

    fun toggle(id: String) { ids = if (id in ids) ids - id else ids + id }
    /** Ұзақ басу: режим қосылып, жол белгіленеді. */
    fun start(id: String) { active = true; ids = ids + id }
    fun close() { active = false; ids = emptySet() }
}

/** Белгілеу күйі: «Артқа» алдымен режимнен шығарады; өшірілген нысандар белгіленгендерден алынады. */
@Composable
fun rememberListSelection(existing: Collection<String>): ListSelection {
    val s = remember { ListSelection() }
    BackHandler(enabled = s.active) { s.close() }
    LaunchedEffect(existing) {
        val set = existing.toHashSet()
        if (s.ids.any { it !in set }) s.ids = s.ids.filterTo(HashSet()) { it in set }
    }
    return s
}

/** Белгілеу режиміндегі жолдың сол жағы: белгі ұяшығы. */
@Composable
fun SelectBox(checked: Boolean, onChange: () -> Unit) {
    Checkbox(checked = checked, onCheckedChange = { onChange() },
        colors = CheckboxDefaults.colors(checkedColor = Chrome.accent, checkmarkColor = Chrome.onAccent, uncheckedColor = Chrome.dim))
}

/**
 * Белгілеу жолағы: саны, барлығын белгілеу / алып тастау (тізімде көрініп тұрғандар), картада көрсету, экспорт, өшіру.
 * [visibleIds] — қазіргі тізімдегі (сүзгіден өткен) нысандар.
 */
@Composable
fun SelectionBar(sel: ListSelection, visibleIds: List<String>, onShow: () -> Unit, onExport: () -> Unit, onDelete: () -> Unit) {
    val n = sel.ids.size
    val allOn = visibleIds.isNotEmpty() && sel.ids.containsAll(visibleIds)
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp).height(52.dp).clip(RoundedCornerShape(16.dp)).background(Chrome.bg3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { sel.close() }) { Icon(Icons.Filled.Close, stringResource(R.string.sel_done)) }
        Text(stringResource(R.string.sel_count, n), fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
        IconButton(onClick = { sel.ids = if (allOn) sel.ids - visibleIds.toSet() else sel.ids + visibleIds }) {
            Icon(if (allOn) Icons.Filled.Deselect else Icons.Filled.SelectAll, stringResource(if (allOn) R.string.sel_none else R.string.sel_all))
        }
        IconButton(onClick = onShow, enabled = n > 0) { Icon(Icons.Filled.ZoomOutMap, stringResource(R.string.zoom_to)) }
        IconButton(onClick = onExport, enabled = n > 0) { Icon(Icons.Filled.FileUpload, stringResource(R.string.export_data)) }
        IconButton(onClick = onDelete, enabled = n > 0) {
            Icon(Icons.Filled.Delete, stringResource(R.string.delete), tint = if (n > 0) Chrome.rec else Chrome.dim)
        }
    }
}

/** Белгіленген нүктелерді картада көрсету: мәзір жабылып, карта бәрін қамтитындай жылжиды. */
fun showOnMap(vm: MainViewModel, controller: MapController, pts: List<LatLon>) {
    val b = Geo.bounds(pts) ?: return
    vm.closeMenu()
    controller.fit(b, 64)
}
