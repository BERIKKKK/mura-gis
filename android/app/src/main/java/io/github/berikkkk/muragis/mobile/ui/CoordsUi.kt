package io.github.berikkkk.muragis.mobile.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.map.MapController
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

private enum class CFmt { DD, DMS, UTM }

/** Енгізу өрістерінің мәні (экран бұрылғанда сақталады). */
private data class CoordForm(
    val fmt: CFmt = CFmt.DD,
    val lat: String = "", val lon: String = "",
    val latD: String = "", val latM: String = "", val latS: String = "", val north: Boolean = true,
    val lonD: String = "", val lonM: String = "", val lonS: String = "", val east: Boolean = true,
    val zone: String = "", val utmNorth: Boolean = true, val e: String = "", val n: String = "",
)

private sealed interface Parsed {
    data class Ok(val p: LatLon) : Parsed
    data class Err(@StringRes val res: Int) : Parsed
}

private fun num(s: String): Double? = s.trim().replace(',', '.').toDoubleOrNull()

private fun CoordForm.parse(): Parsed = when (fmt) {
    CFmt.DD -> {
        val a = num(lat); val b = num(lon)
        when {
            a == null || b == null -> Parsed.Err(R.string.cin_err_dd)
            abs(a) > 90 -> Parsed.Err(R.string.cin_err_lat)
            abs(b) > 180 -> Parsed.Err(R.string.cin_err_lon)
            else -> Parsed.Ok(LatLon(a, b))
        }
    }
    CFmt.DMS -> {
        val v = listOf(latD, latM, latS, lonD, lonM, lonS).map { num(it.ifBlank { "0" }) }
        when {
            latD.isBlank() || lonD.isBlank() || v.any { it == null || it < 0 } -> Parsed.Err(R.string.cin_err_dms)
            v[1]!! >= 60 || v[2]!! >= 60 || v[4]!! >= 60 || v[5]!! >= 60 -> Parsed.Err(R.string.cin_err_ms)
            v[0]!! != floor(v[0]!!) || v[3]!! != floor(v[3]!!) -> Parsed.Err(R.string.cin_err_dms)
            else -> {
                val la = (v[0]!! + v[1]!! / 60 + v[2]!! / 3600) * if (north) 1 else -1
                val lo = (v[3]!! + v[4]!! / 60 + v[5]!! / 3600) * if (east) 1 else -1
                if (abs(la) > 90) Parsed.Err(R.string.cin_err_lat) else if (abs(lo) > 180) Parsed.Err(R.string.cin_err_lon) else Parsed.Ok(LatLon(la, lo))
            }
        }
    }
    CFmt.UTM -> {
        val z = zone.trim().toIntOrNull(); val ee = num(e); val nn = num(n)
        when {
            z == null || z !in 1..60 -> Parsed.Err(R.string.cin_err_zone)
            ee == null || ee < 100_000 || ee > 900_000 -> Parsed.Err(R.string.cin_err_easting)
            nn == null || nn < 0 || nn > 10_000_000 -> Parsed.Err(R.string.cin_err_northing)
            else -> Parsed.Ok(Utm.toLatLon(z, !utmNorth, ee, nn))
        }
    }
}

private fun CoordForm.fill(p: LatLon, to: CFmt): CoordForm = when (to) {
    CFmt.DD -> copy(fmt = to, lat = Coords.decimal(p.lat, 6), lon = Coords.decimal(p.lon, 6))
    CFmt.DMS -> {
        fun parts(v: Double): Triple<String, String, String> {
            val a = abs(v); var d = floor(a).toInt(); var m = floor((a - d) * 60).toInt()
            var s = Math.round(((a - d) * 60 - m) * 60 * 100) / 100.0
            if (s >= 60) { s = 0.0; m++ }; if (m >= 60) { m = 0; d++ }
            return Triple(d.toString(), m.toString(), String.format(Locale.ROOT, "%.2f", s))
        }
        val (a, b, c) = parts(p.lat); val (d, e2, f) = parts(p.lon)
        copy(fmt = to, latD = a, latM = b, latS = c, north = p.lat >= 0, lonD = d, lonM = e2, lonS = f, east = p.lon >= 0)
    }
    CFmt.UTM -> {
        val u = Utm.fromLatLon(p.lat, p.lon)
        copy(fmt = to, zone = u.zone.toString(), utmNorth = !u.south, e = Math.round(u.easting).toString(), n = Math.round(u.northing).toString())
    }
}

/**
 * Координата енгізу (тек мәзір арқылы): DD, DMS, UTM. Формат ауысқанда енгізілген мән жаңа пішімге түрленеді.
 * «Картада көрсету» — нүктені белгілеп, картаны соған әкеледі.
 */
@Composable
fun CoordsPage(vm: MainViewModel, controller: MapController) {
    val pin by vm.pin.collectAsState()
    val loc by vm.location.location.collectAsState()
    var form by rememberSaveable {
        val start = pin?.let { LatLon(it.lat, it.lon) } ?: loc?.let { LatLon(it.latitude, it.longitude) }
            ?: controller.center()?.let { LatLon(it.first, it.second) } ?: LatLon(48.0, 67.0)
        mutableStateOf(ArrayList(CoordForm().fill(start, CFmt.DD).toList()))
    }
    val f = fromList(form)
    var err by rememberSaveable { mutableStateOf<Int?>(null) }
    fun set(n: CoordForm) { form = ArrayList(n.toList()); err = null }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp)) {
        PageTitle(stringResource(R.string.coord_input), stringResource(R.string.cin_sub))
        Segmented(listOf(CFmt.DD to "DD", CFmt.DMS to "DMS", CFmt.UTM to "UTM"), f.fmt) { to ->
            if (to == f.fmt) return@Segmented
            when (val p = f.parse()) {
                is Parsed.Ok -> set(f.fill(p.p, to))
                is Parsed.Err -> err = R.string.cin_err_switch
            }
        }
        Spacer(Modifier.height(16.dp))
        when (f.fmt) {
            CFmt.DD -> {
                Field(stringResource(R.string.cin_lat_n), f.lat) { set(f.copy(lat = it)) }
                Field(stringResource(R.string.cin_lon_e), f.lon) { set(f.copy(lon = it)) }
                Hint(stringResource(R.string.cin_hint_dd))
            }
            CFmt.DMS -> {
                Text(stringResource(R.string.lat), color = Chrome.dim, fontSize = 14.sp)
                DmsRow(f.latD, f.latM, f.latS, if (f.north) "N" else "S", { set(f.copy(latD = it)) }, { set(f.copy(latM = it)) }, { set(f.copy(latS = it)) }) { set(f.copy(north = !f.north)) }
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.lon), color = Chrome.dim, fontSize = 14.sp)
                DmsRow(f.lonD, f.lonM, f.lonS, if (f.east) "E" else "W", { set(f.copy(lonD = it)) }, { set(f.copy(lonM = it)) }, { set(f.copy(lonS = it)) }) { set(f.copy(east = !f.east)) }
                Hint(stringResource(R.string.cin_hint_dms))
            }
            CFmt.UTM -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field(stringResource(R.string.cin_zone), f.zone, Modifier.weight(1f), KeyboardType.Number) { set(f.copy(zone = it)) }
                    HemiButton(if (f.utmNorth) "N" else "S") { set(f.copy(utmNorth = !f.utmNorth)) }
                }
                Field("Easting, м", f.e, keyboard = KeyboardType.Number) { set(f.copy(e = it)) }
                Field("Northing, м", f.n, keyboard = KeyboardType.Number) { set(f.copy(n = it)) }
                Hint(stringResource(R.string.cin_hint_utm))
            }
        }
        val parsed = f.parse()
        if (parsed is Parsed.Ok && f.fmt != CFmt.DD) Hint("= " + Utm.formatDd(parsed.p.lat, parsed.p.lon))
        err?.let { Text(stringResource(it), color = androidx.compose.material3.MaterialTheme.colorScheme.error, fontSize = 13.5.sp, modifier = Modifier.padding(top = 10.dp)) }
        BigButton(stringResource(R.string.cin_show), Modifier.fillMaxWidth().padding(top = 14.dp), primary = true, icon = { Icon(Icons.Filled.Map, null, Modifier.size(20.dp)) }) {
            when (parsed) {
                is Parsed.Ok -> { vm.showPin(parsed.p.lat, parsed.p.lon); controller.moveTo(parsed.p.lat, parsed.p.lon, maxOf(controller.zoom(), 14.0)) }
                is Parsed.Err -> err = parsed.res
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String, modifier: Modifier = Modifier.fillMaxWidth(), keyboard: KeyboardType = KeyboardType.Decimal, onChange: (String) -> Unit) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true,
        textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 16.sp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard), modifier = modifier.padding(bottom = 8.dp))
}

@Composable
private fun DmsRow(d: String, m: String, s: String, hemi: String, onD: (String) -> Unit, onM: (String) -> Unit, onS: (String) -> Unit, onHemi: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Field("°", d, Modifier.weight(1f), KeyboardType.Number, onD)
        Field("′", m, Modifier.weight(1f), KeyboardType.Number, onM)
        Field("″", s, Modifier.weight(1.4f), KeyboardType.Decimal, onS)
        HemiButton(hemi, onHemi)
    }
}

@Composable
private fun HemiButton(text: String, onClick: () -> Unit) {
    Box(Modifier.padding(bottom = 8.dp).size(width = 52.dp, height = 56.dp).clip(RoundedCornerShape(14.dp)).background(Chrome.bg3).clickable(onClick = onClick),
        contentAlignment = Alignment.Center) {
        Text(text, color = Chrome.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 16.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Hint(text: String) = Text(text, color = Chrome.dim, fontSize = 12.5.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 4.dp))

// rememberSaveable үшін: форма жолдар тізімі ретінде сақталады
private fun CoordForm.toList(): List<String> = listOf(fmt.name, lat, lon, latD, latM, latS, north.toString(), lonD, lonM, lonS, east.toString(), zone, utmNorth.toString(), e, n)
private fun fromList(l: List<String>) = CoordForm(CFmt.valueOf(l[0]), l[1], l[2], l[3], l[4], l[5], l[6].toBoolean(), l[7], l[8], l[9], l[10].toBoolean(), l[11], l[12].toBoolean(), l[13], l[14])
