package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLocationAlt
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.data.TrackRec

/** Координатаны көшіру: алдымен пішім таңдалады (DD / DMS / UTM) — кездейсоқ көшіріп жіберуден сақтайды. */
@Composable
fun CopySheet(vm: MainViewModel, s: Sheet.Copy) {
    val clip = LocalClipboardManager.current
    SheetHeader(stringResource(R.string.copy_coords), stringResource(R.string.copy_coords_sub, s.title)) { vm.openSheet(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple("DD", stringResource(R.string.fmt_dd), Utm.formatDd(s.lat, s.lon)),
            Triple("DMS", stringResource(R.string.fmt_dms), Utm.formatDms(s.lat, s.lon)),
            Triple("UTM", stringResource(R.string.fmt_utm), Utm.formatUtm(s.lat, s.lon)),
        ).forEach { (tag, title, value) ->
            OptionRow(title, value, subMono = true, leading = { FormatTag(tag) }, trailing = { Icon(Icons.Filled.ContentCopy, null, tint = Chrome.dim) }) {
                clip.setText(AnnotatedString(value))
                vm.openSheet(null)
                vm.toast(R.string.msg_copied, tag, value)
            }
        }
    }
}

@Composable
fun FormatTag(tag: String) {
    Text(tag, color = Chrome.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, textAlign = TextAlign.Center,
        modifier = Modifier.widthIn(min = 48.dp).clip(RoundedCornerShape(8.dp)).background(Chrome.bg3).padding(horizontal = 8.dp, vertical = 5.dp))
}

/** Жазуды тоқтату: сақтау / жалғастыру / жою (жою екі рет растауды қажет етеді). */
@Composable
fun TrackStopSheet(vm: MainViewModel, t: TrackRec) {
    var confirm by remember { mutableStateOf(false) }
    SheetHeader(stringResource(R.string.rec_stop_title),
        stringResource(R.string.rec_stop_sub, fmtDuration(t.elapsedMs()), fmtLength(t.distance), t.points.size)) { vm.resumeTrack() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BigButton(stringResource(R.string.rec_save), Modifier.fillMaxWidth(), primary = true, enabled = t.points.size >= 2) { vm.saveTrack() }
        if (t.points.size < 2) Text(stringResource(R.string.err_track_short), color = Chrome.dim, fontSize = 13.sp)
        BigButton(stringResource(R.string.rec_resume), Modifier.fillMaxWidth()) { vm.resumeTrack() }
        if (confirm) BigButton(stringResource(R.string.rec_delete_confirm), Modifier.fillMaxWidth(), danger = true) { vm.discardTrack() }
        else BigButton(stringResource(R.string.delete), Modifier.fillMaxWidth(), danger = true, icon = { Icon(Icons.Filled.Delete, null, Modifier.size(20.dp)) }) { confirm = true }
    }
}

/** Қолмен енгізілген нүкте: координаталар, көшіру, маршрут, ескерткіш ретінде сақтау, алып тастау. */
@Composable
fun PinSheet(vm: MainViewModel, p: InputPin) {
    SheetHeader(stringResource(R.string.input_point), null) { vm.openSheet(null) }
    Text("DD   " + Utm.formatDd(p.lat, p.lon), fontFamily = FontFamily.Monospace, fontSize = 14.sp)
    Text("UTM  " + Utm.formatUtm(p.lat, p.lon), fontFamily = FontFamily.Monospace, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp, bottom = 14.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BigButton(stringResource(R.string.copy), Modifier.weight(1f), icon = { Icon(Icons.Filled.ContentCopy, null, Modifier.size(20.dp)) }) {
                vm.openSheet(Sheet.Copy(p.lat, p.lon, vm.pinPoint()?.label ?: ""))
            }
            BigButton(stringResource(R.string.route_here), Modifier.weight(1f), primary = true, icon = { Icon(Icons.Filled.Route, null, Modifier.size(20.dp)) }) {
                vm.openPlan(vm.pinPoint())
            }
        }
        BigButton(stringResource(R.string.save_as_monument), Modifier.fillMaxWidth(), icon = { Icon(Icons.Filled.AddLocationAlt, null, Modifier.size(20.dp)) }) {
            vm.openSheet(null); vm.newMonumentAt(p.lat, p.lon)
        }
        BigButton(stringResource(R.string.remove_point), Modifier.fillMaxWidth(), danger = true) { vm.clearPin() }
    }
}
