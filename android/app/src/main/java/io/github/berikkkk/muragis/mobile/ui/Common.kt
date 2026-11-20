package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusEvent
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.berikkkk.muragis.core.geo.Coords
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.mobile.R
import java.util.Locale

private val Brown = Color(0xFF8A4B2A)

@Composable
fun MuraTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) darkColorScheme(primary = Color(0xFFE0A47F), secondary = Color(0xFFC9A27E))
    else lightColorScheme(primary = Brown, secondary = Color(0xFF6B4E3A), primaryContainer = Color(0xFFF6E3D6))
    MaterialTheme(colorScheme = scheme, content = content)
}

/** Интерфейс тілі (жүйе/қосымша тілі): заң анықтамалықтарының атауларын осы тілде көрсету үшін. */
@Composable
fun uiLang(): Lang {
    val l = LocalConfiguration.current.locales[0]?.language ?: Locale.getDefault().language
    return if (l == "ru") Lang.RU else Lang.KK
}

fun langName(l: Lang) = if (l == Lang.KK) "Қазақша" else "Русский"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Dropdown(label: String, value: T, options: List<T>, text: (T) -> String, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier) {
        OutlinedTextField(
            value = text(value), onValueChange = {}, readOnly = true, label = { Text(label) }, singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { o -> DropdownMenuItem(text = { Text(text(o)) }, onClick = { onChange(o); open = false }) }
        }
    }
}

@Composable
fun LangRadio(value: Lang, onChange: (Lang) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Lang.entries.forEach { l ->
            RadioButton(selected = value == l, onClick = { onChange(l) })
            Text(langName(l), modifier = Modifier.padding(end = 12.dp))
        }
    }
}

@Composable
fun ConfirmDialog(text: String, confirm: String = stringResource(R.string.ok), onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

/** Координата өрісі: ондық градус та, ° ′ ″ та қабылданады (жұмыс үстеліндегі талдағыш). */
@Composable
fun CoordField(label: String, text: String, onText: (String) -> Unit, error: Boolean, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = text, onValueChange = onText, label = { Text(label) }, isError = error, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text), modifier = modifier.bringIntoViewOnFocus(),
        supportingText = if (error) ({ Text(stringResource(R.string.err_coord_format)) }) else null,
    )
}

/**
 * Өріс фокус алғанда (пернетақта ашылып болғаннан кейін) айналдырылатын тізімде көрінетін жерге шығарылады —
 * өріс пернетақтаның астында қалмайды.
 */
@OptIn(ExperimentalFoundationApi::class)
fun Modifier.bringIntoViewOnFocus(): Modifier = composed {
    val req = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()
    bringIntoViewRequester(req).onFocusEvent { f ->
        if (f.isFocused) scope.launch { delay(350); req.bringIntoView() }
    }
}

fun fmtCoord(v: Double, dms: Boolean, isLat: Boolean): String =
    if (dms) (if (isLat) Coords.dmsLat(v) else Coords.dmsLon(v)) else Coords.decimal(v, 6)

fun fmtLength(m: Double): String = if (m < 1000) String.format(Locale.ROOT, "%.0f м", m) else String.format(Locale.ROOT, "%.2f км", m / 1000)

fun fmtBytes(b: Long): String = when {
    b >= 1L shl 30 -> String.format(Locale.ROOT, "%.1f ГБ", b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> String.format(Locale.ROOT, "%.1f МБ", b / (1L shl 20).toDouble())
    else -> String.format(Locale.ROOT, "%d КБ", (b / 1024).coerceAtLeast(1))
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
}

@Composable
fun FormColumn(content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}
