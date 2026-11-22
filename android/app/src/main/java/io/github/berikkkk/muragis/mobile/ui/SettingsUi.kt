package io.github.berikkkk.muragis.mobile.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import io.github.berikkkk.muragis.mobile.R
import java.io.File

/**
 * Баптаулар: алдымен бөлімдер тізімі (Көрініс, Тіл, Карта, Синхрондау, Сақтық көшірмелер), бөлімді басқанда
 * оның баптаулары бөлек бетте ашылады («Артқа» — бөлімдер тізіміне). Интерфейс тілі мен деректер тілі тәуелсіз.
 */
@Composable
fun SettingsPage(vm: MainViewModel, page: MenuPage, act: MainActivity) {
    val title = when (page) {
        MenuPage.SET_LOOK -> R.string.set_look
        MenuPage.SET_LANG -> R.string.set_lang
        MenuPage.SET_MAP -> R.string.map_settings
        MenuPage.SET_SYNC -> R.string.sync_title
        MenuPage.SET_BACKUP -> R.string.backups
        else -> R.string.tab_settings
    }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
        PageTitle(stringResource(title), null)
        when (page) {
            MenuPage.SET_LOOK -> InterfaceSettings(vm)
            MenuPage.SET_LANG -> LanguageSettings(vm)
            MenuPage.SET_MAP -> MapSettings(vm, act)
            MenuPage.SET_SYNC -> SyncSection(vm, act)
            MenuPage.SET_BACKUP -> BackupSettings(vm)
            else -> SettingsSections(vm)
        }
    }
}

/** Бөлімдер тізімі: әр жолда қысқа күйі көрінеді. */
@Composable
private fun SettingsSections(vm: MainViewModel) {
    val prefs by vm.prefs.collectAsState()
    val sync by vm.syncUi.collectAsState()
    val backups by vm.backups.collectAsState()
    val ui = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    val uiName = when {
        ui.startsWith("kk") -> "Қазақша"
        ui.startsWith("ru") -> "Русский"
        else -> stringResource(R.string.lang_system)
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Section(Icons.Filled.Palette, stringResource(R.string.set_look), stringResource(R.string.menu_settings_sub,
            stringResource(if (prefs.zoomLeft) R.string.side_left else R.string.side_right),
            stringResource(if (prefs.barTop) R.string.bar_top else R.string.bar_bottom))) { vm.openMenu(MenuPage.SET_LOOK) }
        Section(Icons.Filled.Translate, stringResource(R.string.set_lang),
            stringResource(R.string.set_lang_sub, uiName, langName(prefs.dataLang), langName(prefs.exportLang))) { vm.openMenu(MenuPage.SET_LANG) }
        Section(Icons.Filled.Map, stringResource(R.string.map_settings), stringResource(R.string.set_map_sub)) { vm.openMenu(MenuPage.SET_MAP) }
        Section(Icons.Filled.CloudSync, stringResource(R.string.sync_title),
            sync.account?.let { it.email.ifEmpty { it.name } + " · Google Drive" } ?: stringResource(R.string.set_sync_off)) { vm.openMenu(MenuPage.SET_SYNC) }
        Section(Icons.Filled.Backup, stringResource(R.string.backups), stringResource(R.string.set_backups_sub, backups.size)) { vm.openMenu(MenuPage.SET_BACKUP) }
    }
}

@Composable
private fun Section(icon: ImageVector, title: String, sub: String, onClick: () -> Unit) {
    OptionRow(title, sub,
        leading = { Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Chrome.bg3), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Chrome.accent) } },
        trailing = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim) }, onClick = onClick)
}

/** Тіл: интерфейс тілі, деректерді көрсету тілі, экспорт тілі (мыс. интерфейс — қазақша, тізім — орысша, экспорт — қазақша). */
@Composable
private fun LanguageSettings(vm: MainViewModel) {
    val prefs by vm.prefs.collectAsState()
    val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    SectionTitle(stringResource(R.string.ui_language))
    listOf("" to stringResource(R.string.lang_system), "kk" to "Қазақша", "ru" to "Русский").forEach { (tag, label) ->
        val set = { AppCompatDelegate.setApplicationLocales(if (tag.isEmpty()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag)) }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { set() }) {
            RadioButton(selected = current.startsWith(tag) && (tag.isNotEmpty() || current.isEmpty()), onClick = { set() })
            Text(label)
        }
    }

    SectionTitle(stringResource(R.string.data_language))
    Text(stringResource(R.string.data_language_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
    LangRadio(prefs.dataLang) { l -> vm.updatePrefs { it.copy(dataLang = l) } }

    SectionTitle(stringResource(R.string.export_lang))
    LangRadio(prefs.exportLang) { l -> vm.updatePrefs { it.copy(exportLang = l) } }
}

/** Карта: кластерлеу, координата пішімі, орналасу, фонда жазу, жол желісі бойынша маршрут. */
@Composable
private fun MapSettings(vm: MainViewModel, act: MainActivity) {
    val prefs by vm.prefs.collectAsState()
    var bgGuide by remember { mutableStateOf(false) }
    SwitchRow(stringResource(R.string.cluster_markers), prefs.cluster) { v -> vm.updatePrefs { it.copy(cluster = v) } }
    SwitchRow(stringResource(R.string.coords_dms), prefs.coordFormatDms) { v -> vm.updatePrefs { it.copy(coordFormatDms = v) } }
    SwitchRow(stringResource(R.string.show_location), prefs.showLocation) { v ->
        if (v) act.withLocation { vm.updatePrefs { it.copy(showLocation = true) }; vm.location.setTracking(true) }
        else { vm.updatePrefs { it.copy(showLocation = false) }; vm.location.setTracking(false) }
    }
    Text(stringResource(R.string.gps_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
    OptionRow(stringResource(R.string.bg_title), stringResource(R.string.bg_settings_sub), Modifier.padding(top = 8.dp),
        trailing = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Chrome.dim) }) { bgGuide = true }

    SectionTitle(stringResource(R.string.routing_engine))
    Text(stringResource(R.string.routing_engine_note), style = MaterialTheme.typography.bodySmall)
    if (bgGuide) ChromeTheme { BackgroundDialog(vm, act, onClose = { bgGuide = false }) }
}

/** Сақтық көшірмелер: қазір жасау және соңғы 7 көшірмеден қалпына келтіру. */
@Composable
private fun BackupSettings(vm: MainViewModel) {
    val backups by vm.backups.collectAsState()
    var restore by remember { mutableStateOf<File?>(null) }
    Text(stringResource(R.string.backups_note), style = MaterialTheme.typography.labelSmall, color = Color.Gray)
    OutlinedButton(onClick = { vm.createBackup() }, modifier = Modifier.padding(vertical = 4.dp)) { Text(stringResource(R.string.backup_now)) }
    backups.take(7).forEach { f ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(f.name.removePrefix("mura-").removeSuffix(".db") + " · " + fmtBytes(f.length()), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { restore = f }) { Text(stringResource(R.string.restore)) }
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
