package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import io.github.berikkkk.muragis.core.sync.Side
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.sync.SyncManager
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.systemDefault())
private fun fmtTime(iso: String) = runCatching { FMT.format(Instant.parse(iso)) }.getOrDefault("")

/**
 * «Баптаулар → Синхрондау»: сақтау қызметі мен аккаунт, соңғы синхрондау, күтілетін өзгерістер, күй, қайшылықтар,
 * «Қазір синхрондау» / «Аккаунтты ажырату». Аккаунт міндетті емес — қосылмаса, қосымша бұрынғыдай толық жергілікті жұмыс істейді.
 */
@Composable
fun SyncSection(vm: MainViewModel, act: MainActivity) {
    val ui by vm.syncUi.collectAsState()
    var consent by remember { mutableStateOf(false) }
    var disconnect by remember { mutableStateOf(false) }
    var newProject by remember { mutableStateOf(false) }
    var link by remember { mutableStateOf<SyncManager.ProjectUi?>(null) }
    var assign by remember { mutableStateOf(false) }
    val hint = MaterialTheme.typography.labelSmall

    SectionTitle(stringResource(R.string.sync_title))
    Text(stringResource(R.string.sync_provider), style = MaterialTheme.typography.bodySmall)
    listOf(Triple("gdrive", "Google Drive", true), Triple("onedrive", "Microsoft OneDrive", false), Triple("dropbox", "Dropbox", false)).forEach { (id, name, on) ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = id == "gdrive", onClick = null, enabled = on)
            Text(if (on) name else name + " " + stringResource(R.string.sync_later), color = if (on) Color.Unspecified else Color.Gray, modifier = Modifier.padding(start = 6.dp))
        }
    }

    val a = ui.account
    if (a == null) {
        Text(stringResource(R.string.sync_optional), style = hint, color = Color.Gray, modifier = Modifier.padding(vertical = 4.dp))
        Button(onClick = { consent = true }, modifier = Modifier.padding(vertical = 4.dp)) { Text(stringResource(R.string.sync_sign_in)) }
    } else {
        Text(a.name.ifEmpty { a.email } + " · Google Drive", style = MaterialTheme.typography.bodyMedium)
        if (a.name.isNotEmpty()) Text(a.email, style = hint, color = Color.Gray)
        Text(stateText(ui), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp),
            color = if (ui.state in setOf("auth", "quota", "error", "offline") || ui.conflicts.isNotEmpty()) MaterialTheme.colorScheme.error else Color.Unspecified)
        Text(stringResource(R.string.sync_last, if (ui.lastSync.isEmpty()) stringResource(R.string.sync_never) else fmtTime(ui.lastSync)), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.sync_pending, ui.pending), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.sync_conflicts, ui.conflicts.size), style = MaterialTheme.typography.bodySmall)
        Row(Modifier.padding(vertical = 4.dp)) {
            Button(onClick = { vm.syncNow() }, enabled = !ui.syncing) { Text(stringResource(R.string.sync_now)) }
            TextButton(onClick = { disconnect = true }) { Text(stringResource(R.string.sync_disconnect)) }
        }

        // Белсенді жоба: жаңа ескерткіш пен маршрут осы жобаға жазылады (компьютерде — сол жобаның ішінде көрінеді)
        Text(stringResource(R.string.sync_active), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        Text(stringResource(R.string.sync_active_note), style = hint, color = Color.Gray)
        (ui.projects + ui.localOnly).forEach { p ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { vm.syncSetActive(p.id) }) {
                RadioButton(selected = ui.active == p.id, onClick = { vm.syncSetActive(p.id) })
                Column(Modifier.weight(1f)) {
                    Text(p.name.ifEmpty { stringResource(R.string.sync_unnamed) })
                    val sub = listOf(p.oblast, if (p.lastSync.isNotEmpty()) stringResource(R.string.sync_last, fmtTime(p.lastSync)) else "",
                        if (p.pending > 0) stringResource(R.string.sync_pending, p.pending) else "", errText(p.error)).filter { it.isNotEmpty() }.joinToString(" · ")
                    if (sub.isNotEmpty()) Text(sub, style = hint, color = Color.Gray)
                }
                if (p in ui.localOnly) TextButton(onClick = { link = p }) { Text(stringResource(R.string.sync_upload)) }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { vm.syncSetActive("") }) {
            RadioButton(selected = ui.active.isEmpty(), onClick = { vm.syncSetActive("") })
            Text(stringResource(R.string.sync_no_project))
        }
        OutlinedButton(onClick = { newProject = true }, modifier = Modifier.padding(vertical = 4.dp)) { Text(stringResource(R.string.sync_new_project)) }
        if (ui.unassigned > 0 && ui.active.isNotEmpty()) {
            Text(stringResource(R.string.sync_unassigned, ui.unassigned), style = hint, color = Color.Gray)
            TextButton(onClick = { assign = true }) { Text(stringResource(R.string.sync_assign)) }
        }

        // Қайшылықтар: екі нұсқа да сақталған, пайдаланушы таңдайды
        val otherDevice = stringResource(R.string.sync_other_device)
        ui.conflicts.forEach { c ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(10.dp)) {
                    Text(stringResource(if (c.t == "route") R.string.sync_conflict_route else R.string.sync_conflict_mark) + " · " + c.projectName,
                        style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
                    Text(sideText(c.local, stringResource(R.string.sync_this_device)), style = MaterialTheme.typography.bodySmall)
                    Text(sideText(c.remote, c.remote.dn.ifEmpty { otherDevice }), style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { vm.syncResolve(c.project, c.key, false) }) { Text(stringResource(R.string.sync_keep_local)) }
                        TextButton(onClick = { vm.syncResolve(c.project, c.key, true) }) { Text(stringResource(R.string.sync_keep_remote)) }
                    }
                }
            }
        }
        Text(stringResource(R.string.sync_scope_note), style = hint, color = Color.Gray, modifier = Modifier.padding(top = 4.dp))
    }

    if (consent) AlertDialog(
        onDismissRequest = { consent = false },
        title = { Text(stringResource(R.string.sync_consent_title)) },
        text = { Text(stringResource(R.string.sync_consent_text)) },
        confirmButton = { TextButton(onClick = { consent = false; vm.syncConnect(act) }) { Text(stringResource(R.string.sync_consent_ok)) } },
        dismissButton = { TextButton(onClick = { consent = false }) { Text(stringResource(R.string.cancel)) } },
    )
    if (disconnect) ConfirmDialog(stringResource(R.string.sync_disconnect_confirm), stringResource(R.string.sync_disconnect),
        onConfirm = { disconnect = false; vm.syncDisconnect() }, onDismiss = { disconnect = false })
    link?.let { p ->
        ConfirmDialog(stringResource(R.string.sync_upload_confirm, p.name, a?.email ?: ""), stringResource(R.string.sync_upload),
            onConfirm = { link = null; vm.syncLinkProject(p.id) }, onDismiss = { link = null })
    }
    if (assign) {
        val name = (ui.projects + ui.localOnly).firstOrNull { it.id == ui.active }?.name ?: ""
        ConfirmDialog(stringResource(R.string.sync_assign_confirm, ui.unassigned, name), stringResource(R.string.sync_assign),
            onConfirm = { assign = false; vm.syncAssign() }, onDismiss = { assign = false })
    }
    if (newProject) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newProject = false },
            title = { Text(stringResource(R.string.sync_new_project)) },
            text = {
                Column {
                    OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.sync_project_name)) }, singleLine = true)
                    Text(stringResource(R.string.sync_new_project_note), style = hint, color = Color.Gray, modifier = Modifier.padding(top = 6.dp))
                }
            },
            confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { newProject = false; vm.syncCreateProject(name) }) { Text(stringResource(R.string.save)) } },
            dismissButton = { TextButton(onClick = { newProject = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
private fun stateText(ui: SyncManager.Ui): String = when {
    ui.syncing || ui.state == "syncing" -> stringResource(R.string.sync_st_syncing)
    ui.state == "offline" -> stringResource(R.string.sync_st_offline)
    ui.state == "auth" -> stringResource(R.string.sync_st_auth)
    ui.state == "quota" -> stringResource(R.string.sync_st_quota)
    ui.state == "error" && ui.code == "rate" -> stringResource(R.string.sync_st_rate)
    ui.state == "error" && ui.code == "server" -> stringResource(R.string.sync_st_server)
    ui.state == "error" -> stringResource(R.string.sync_st_error, ui.detail.ifEmpty { ui.code })
    ui.conflicts.isNotEmpty() -> stringResource(R.string.sync_st_conflicts)
    else -> stringResource(R.string.sync_st_ok)
}

@Composable
private fun errText(e: String): String = when (e) {
    "" -> ""
    "offline" -> stringResource(R.string.sync_err_offline_short)
    else -> stringResource(R.string.sync_st_error, e)
}

@Composable
private fun sideText(s: Side, who: String): String {
    if (s.del) return who + ": " + stringResource(R.string.sync_deleted) + (if (s.at.isNotEmpty()) " · " + fmtTime(s.at) else "")
    val d = s.d
    fun f(k: String) = (d?.get(k) as? JsonPrimitive)?.content ?: ""
    val name = f("name").ifEmpty { f("name_ru") }.ifEmpty { stringResource(R.string.sync_unnamed) }
    val pts = (d?.get("pts") as? kotlinx.serialization.json.JsonArray)?.size
    val where = if (pts != null) stringResource(R.string.sync_points, pts) else listOf(f("lat").take(10), f("lon").take(10)).filter { it.isNotEmpty() }.joinToString(", ")
    return who + ": " + listOf(name, where, f("note").take(120), if (s.at.isNotEmpty()) fmtTime(s.at) else "").filter { it.isNotEmpty() }.joinToString(" · ")
}
