package io.github.berikkkk.muragis.mobile.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.mobile.R

/** Өндірушінің өз батарея шектеулері (Android-тың жалпы баптауларынан бөлек) — сол телефонға арналған нұсқаулық. */
@StringRes
private fun oemGuide(): Int {
    val m = (Build.MANUFACTURER + " " + Build.BRAND).lowercase()
    return when {
        listOf("xiaomi", "redmi", "poco").any { it in m } -> R.string.bg_oem_xiaomi
        "samsung" in m -> R.string.bg_oem_samsung
        listOf("huawei", "honor").any { it in m } -> R.string.bg_oem_huawei
        listOf("oppo", "realme", "oneplus").any { it in m } -> R.string.bg_oem_oppo
        listOf("vivo", "iqoo").any { it in m } -> R.string.bg_oem_vivo
        else -> R.string.bg_oem_other
    }
}

/**
 * Трек фонда (басқа қолданба ашық не экран өшкен кезде) үзілмеуі үшін: орынға «Әрқашан» рұқсат, батарея үнемдеуінен
 * босату және телефон маркасына сай қосымша нұсқаулық. Әр батырма — жүйенің өз терезесі; берілгені белгіленеді.
 * [closeWhenGranted] — жазу басталғанда көрсетілсе: бәрі берілген болса, терезе ашылмайды.
 */
@Composable
fun BackgroundDialog(vm: MainViewModel, act: MainActivity, onClose: () -> Unit, closeWhenGranted: Boolean = false) {
    act.resumes.intValue // баптаулардан қайтқанда күйді қайта оқу
    val bgOk = act.hasBackgroundLocation()
    val batOk = act.ignoresBatteryOptimizations()
    if (closeWhenGranted && bgOk && batOk) { LaunchedEffect(Unit) { onClose() }; return }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(stringResource(R.string.bg_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(R.string.bg_text), fontSize = 14.sp)
                Text(stringResource(R.string.bg_step1), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                BigButton(stringResource(if (bgOk) R.string.bg_location_ok else R.string.bg_location), Modifier.fillMaxWidth(),
                    primary = !bgOk, enabled = !bgOk) { act.askBackgroundLocation() }
                Text(stringResource(R.string.bg_step2), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                BigButton(stringResource(if (batOk) R.string.bg_battery_ok else R.string.bg_battery), Modifier.fillMaxWidth(),
                    primary = !batOk, enabled = !batOk) { act.askIgnoreBatteryOptimizations() }
                Text(stringResource(R.string.bg_step3, Build.MANUFACTURER.replaceFirstChar { it.uppercase() }), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text(stringResource(oemGuide()), fontSize = 14.sp, lineHeight = 20.sp)
                BigButton(stringResource(R.string.bg_open_app_settings), Modifier.fillMaxWidth()) {
                    runCatching { act.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.packageName))) }
                }
                Text(stringResource(R.string.bg_where), fontSize = 13.sp, color = Chrome.dim)
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.close)) } },
        dismissButton = if (closeWhenGranted) ({ TextButton(onClick = { vm.bgAskOff = true; onClose() }) { Text(stringResource(R.string.bg_dont_ask)) } }) else null,
    )
}
