package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.core.routing.RouteNetwork
import io.github.berikkkk.muragis.mobile.R

/**
 * Маршрут құру (А → Б): жол сақталған маршруттар мен тректер желісінен алдын ала есептеледі (жұмыс үстеліндегі «жол табу»).
 * Жолды жазудан бөлек: ол нақты қозғалысты тіркейді.
 */
@Composable
fun PlanSheet(vm: MainViewModel, act: MainActivity) {
    val plan by vm.plan.collectAsState()
    val p = plan ?: return
    var open by remember { mutableStateOf<Boolean?>(if (p.b == null) false else null) }   // true — А, false — Б
    var q by remember { mutableStateOf("") }

    SheetHeader(stringResource(R.string.plan_title), stringResource(R.string.plan_sub)) { vm.openSheet(null) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PointRow(true, p.a?.label, open == true) { open = if (open == true) null else true; q = "" }
            PointRow(false, p.b?.label, open == false) { open = if (open == false) null else false; q = "" }
        }
        Box(Modifier.size(width = 48.dp, height = 120.dp).clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).clickable { vm.swapPlan() },
            contentAlignment = Alignment.Center) { Icon(Icons.Filled.SwapVert, stringResource(R.string.plan_swap)) }
    }
    open?.let { isA -> PointChooser(vm, act, isA, q, { q = it }) { open = null } }

    ChromeLabel(stringResource(R.string.plan_network))
    Segmented(listOf(true to stringResource(R.string.plan_net_roads), false to stringResource(R.string.plan_net_saved)), p.roads) { vm.setPlanRoads(it) }

    ChromeLabel(stringResource(R.string.f_vehicle))
    Segmented(listOf(Vehicle.CAR to stringResource(R.string.seg_car), Vehicle.OFFROAD to stringResource(R.string.seg_4x4), Vehicle.FOOT to stringResource(R.string.seg_foot)),
        p.vehicle) { vm.setPlanOptions(it, p.wet) }
    Row(Modifier.fillMaxWidth().clickable { vm.setPlanOptions(p.vehicle, !p.wet) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(R.string.plan_wet), fontSize = 14.sp, modifier = Modifier.weight(1f))
        Switch(checked = p.wet, onCheckedChange = { vm.setPlanOptions(p.vehicle, it) })
    }

    when (val r = p.result) {
        null -> {
            Spacer(Modifier.height(8.dp))
            BigButton(stringResource(if (p.busy) R.string.plan_busy else R.string.plan_build), Modifier.fillMaxWidth(), primary = true, enabled = p.a != null && p.b != null && !p.busy,
                icon = { Icon(Icons.Filled.Route, null, Modifier.size(20.dp)) }) { open = null; vm.buildPlan() }
        }
        is RouteNetwork.Result.Ok -> {
            PlanResult(vm, r)
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BigButton(stringResource(R.string.plan_clear), Modifier.weight(1f)) { vm.clearPlan() }
                BigButton(stringResource(R.string.plan_on_map), Modifier.weight(1f)) { vm.openSheet(null) }
            }
            BigButton(stringResource(R.string.save), Modifier.fillMaxWidth().padding(top = 8.dp), primary = true) { vm.savePlan() }
        }
        is RouteNetwork.Result.Failed -> {
            Column(Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).padding(14.dp)) {
                Text(stringResource(when {
                    r.error == RouteNetwork.Result.Error.NO_GRAPH -> R.string.plan_err_no_graph
                    r.error == RouteNetwork.Result.Error.NO_NETWORK -> R.string.plan_err_no_network
                    p.roads -> R.string.plan_err_roads_not_connected
                    else -> R.string.plan_err_not_connected
                }), color = Chrome.warn, fontSize = 14.sp)
            }
            BigButton(stringResource(R.string.plan_clear), Modifier.fillMaxWidth().padding(top = 8.dp)) { vm.clearPlan() }
        }
    }
    Text(stringResource(if (p.roads) R.string.plan_roads_note else R.string.plan_network_note), color = Chrome.dim, fontSize = 12.5.sp, modifier = Modifier.padding(top = 12.dp))
}

@Composable
private fun PointRow(isA: Boolean, label: String?, open: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(16.dp)).background(Chrome.bg2)
            .border(1.dp, if (open) Chrome.accent else Color(0x17FFFFFF), RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(26.dp).clip(CircleShape).background(if (isA) Color.White else Color(0xFF2251C9)), contentAlignment = Alignment.Center) {
            Text(stringResource(if (isA) R.string.point_a else R.string.point_b), color = if (isA) Color(0xFF111111) else Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Text(label ?: stringResource(if (isA) R.string.plan_from_ph else R.string.plan_to_ph), color = if (label == null) Chrome.dim else Chrome.fg,
            fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim)
    }
}

@Composable
private fun PointChooser(vm: MainViewModel, act: MainActivity, isA: Boolean, q: String, setQ: (String) -> Unit, done: () -> Unit) {
    val monuments by vm.monuments.collectAsState()
    val places by vm.places.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val pin by vm.pin.collectAsState()
    Column(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).padding(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        ChooserItem(Icons.Filled.MyLocation, stringResource(R.string.my_location)) {
            act.withLocation {
                vm.location.setTracking(true)
                val g = vm.gpsPoint()
                if (g != null) vm.setPlanPoint(isA, g)
                else {
                    vm.toast(R.string.msg_gps_wait)
                    vm.location.requestFix { f -> if (f != null) vm.gpsPoint()?.let { vm.setPlanPoint(isA, it) } else vm.toast(R.string.err_no_gps) }
                }
            }
            done()
        }
        ChooserItem(Icons.Filled.CenterFocusStrong, stringResource(R.string.plan_pick_map)) { vm.setPick(if (isA) Pick.PLAN_A else Pick.PLAN_B) }
        if (pin != null) ChooserItem(Icons.Filled.Place, stringResource(R.string.input_point)) { vm.pinPoint()?.let { vm.setPlanPoint(isA, it) }; done() }
        OutlinedTextField(value = q, onValueChange = setQ, singleLine = true, placeholder = { Text(stringResource(R.string.plan_find_monument)) },
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        val lang = prefs.dataLang
        val found = (if (q.isBlank()) monuments else monuments.filter { it.name.matches(q) }).take(30)
        found.forEach { m ->
            ChooserItem(Icons.Filled.AccountBalance, m.name.display(lang).ifBlank { "—" }) { vm.monumentPoint(m.id)?.let { vm.setPlanPoint(isA, it) }; done() }
        }
        if (monuments.size > found.size && q.isBlank()) Text(stringResource(R.string.plan_more_monuments, monuments.size - found.size), color = Chrome.dim, fontSize = 12.sp,
            modifier = Modifier.padding(8.dp))
        // Өзге нысандар (елді мекен, қыстау, құдық…) — ескерткіштерден кейін
        (if (q.isBlank()) places else places.filter { it.name.matches(q) || it.kind.label(lang).contains(q, true) }).take(20).forEach { p ->
            ChooserItem(Icons.Filled.Place, p.title(lang)) { vm.placePoint(p.id)?.let { vm.setPlanPoint(isA, it) }; done() }
        }
    }
}

@Composable
private fun ChooserItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, tint = Chrome.accent, modifier = Modifier.size(20.dp))
        Text(text, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private const val MAX_LEGS = 8

@Composable
private fun PlanResult(vm: MainViewModel, r: RouteNetwork.Result.Ok) {
    val prefs by vm.prefs.collectAsState()
    Column(Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(fmtLength(r.totalLen), fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(12.dp))
            Text(stringResource(R.string.plan_time, fmtHours(r.timeSeconds)), color = Chrome.dim, fontSize = 15.sp)
        }
        // OSM бойынша аяқ көп болуы мүмкін — тек алғашқылары, қалғаны санымен
        r.legs.take(MAX_LEGS).forEach { l ->
            Text("• " + l.route.name.display(prefs.dataLang).ifBlank { "—" } + " — " + fmtLength(l.len), fontSize = 13.5.sp, maxLines = 2)
        }
        if (r.legs.size > MAX_LEGS) Text(stringResource(R.string.plan_more_legs, r.legs.size - MAX_LEGS, fmtLength(r.legs.drop(MAX_LEGS).sumOf { it.len })),
            color = Chrome.dim, fontSize = 13.sp)
        val off = (r.offStart?.len ?: 0.0) + (r.offEnd?.len ?: 0.0)
        if (off > 1) Text(stringResource(R.string.plan_off_network, fmtLength(off)), color = Chrome.warn, fontSize = 13.sp)
    }
}

@Composable
fun fmtHours(seconds: Double): String {
    val m = Math.round(seconds / 60).toInt()
    return if (m < 60) stringResource(R.string.dur_min, m) else stringResource(R.string.dur_h_min, m / 60, m % 60)
}
