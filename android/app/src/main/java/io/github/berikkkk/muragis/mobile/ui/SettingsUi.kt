package io.github.berikkkk.muragis.mobile.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import androidx.core.os.LocaleListCompat
import io.github.berikkkk.muragis.mobile.BuildConfig
import io.github.berikkkk.muragis.mobile.R
import java.io.File

/**
 * Баптаулар (мәзірдің «Баптаулар» беті, интерфейс баптауларынан кейін). Интерфейс тілі мен деректер тілі тәуелсіз: мыс. интерфейс — қазақша, тізім — орысша, экспорт — қазақша.
 */
@Composable
fun SettingsContent(vm: MainViewModel, act: MainActivity) {
    val prefs by vm.prefs.collectAsState()
    val backups by vm.backups.collectAsState()
    var restore by remember { mutableStateOf<File?>(null) }
    val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()

    Column(Modifier.padding(bottom = 16.dp)) {
        run {
            SectionTitle(stringResource(R.string.ui_language))
            listOf("" to stringResource(R.string.lang_system), "kk" to "Қазақша", "ru" to "Русский").forEach { (tag, label) ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable {
                    AppCompatDelegate.setApplicationLocales(if (tag.isEmpty()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag))
                }) {
                    RadioButton(selected = current.startsWith(tag) && (tag.isNotEmpty() || current.isEmpty()), onClick = {
                        AppCompatDelegate.setApplicationLocales(if (tag.isEmpty()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag))
                    })
                    Text(label)
                }
            }

            SectionTitle(stringResource(R.string.data_language))
            Text(stringResource(R.string.data_language_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            LangRadio(prefs.dataLang) { l -> vm.updatePrefs { it.copy(dataLang = l) } }

            SectionTitle(stringResource(R.string.export_lang))
            LangRadio(prefs.exportLang) { l -> vm.updatePrefs { it.copy(exportLang = l) } }

            SectionTitle(stringResource(R.string.map_settings))
            SwitchRow(stringResource(R.string.cluster_markers), prefs.cluster) { v -> vm.updatePrefs { it.copy(cluster = v) } }
            SwitchRow(stringResource(R.string.coords_dms), prefs.coordFormatDms) { v -> vm.updatePrefs { it.copy(coordFormatDms = v) } }
            SwitchRow(stringResource(R.string.show_location), prefs.showLocation) { v ->
                if (v) act.withLocation { vm.updatePrefs { it.copy(showLocation = true) }; vm.location.setTracking(true) }
                else { vm.updatePrefs { it.copy(showLocation = false) }; vm.location.setTracking(false) }
            }
            Text(stringResource(R.string.gps_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)

            SectionTitle(stringResource(R.string.backups))
            Text(stringResource(R.string.backups_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            OutlinedButton(onClick = { vm.createBackup() }, modifier = Modifier.padding(vertical = 4.dp)) { Text(stringResource(R.string.backup_now)) }
            backups.take(7).forEach { f ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(f.name.removePrefix("mura-").removeSuffix(".db") + " · " + fmtBytes(f.length()), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { restore = f }) { Text(stringResource(R.string.restore)) }
                }
            }

            SectionTitle(stringResource(R.string.routing_engine))
            Text(stringResource(R.string.routing_engine_note), style = MaterialTheme.typography.bodySmall)

            HorizontalDivider(Modifier.padding(vertical = 12.dp))
            OptionRow(stringResource(R.string.about_title), BuildConfig.VERSION_NAME, Modifier.padding(bottom = 24.dp),
                trailing = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim) }) { vm.openMenu(MenuPage.ABOUT) }
        }
    }
    restore?.let { f ->
        ConfirmDialog(stringResource(R.string.confirm_restore, f.name), stringResource(R.string.restore), onConfirm = { vm.restoreBackup(f) }, onDismiss = { restore = null })
    }
}

@Composable
private fun SwitchRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(vertical = 2.dp)) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }
}
