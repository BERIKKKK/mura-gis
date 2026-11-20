package io.github.berikkkk.muragis.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.mobile.R

/**
 * Картаның үстіндегі басқару элементтерінің түстері: әдейі бір (қараңғы графит) күйде — кез келген карта түсінде
 * (топокарта, спутник, сызба) оқылады және далада, күн астында контрасты жоғары.
 */
object Chrome {
    val bg = Color(0xFF23241F)
    val bg2 = Color(0xFF30312B)
    val bg3 = Color(0xFF3B3C35)
    val fg = Color(0xFFF3EFE6)
    val dim = Color(0xFFABA494)
    val accent = Color(0xFFD2AD74)
    val onAccent = Color(0xFF1D1A14)
    val rec = Color(0xFFE2553B)
    val ok = Color(0xFF74C37A)
    val warn = Color(0xFFE6B24A)
    val scrim = Color(0x61000000)
}

/** Мәзір мен парақтардың тақырыбы: Chrome түстері Material компоненттеріне (өріс, ауыстырғыш, диалог) беріледі. */
@Composable
fun ChromeTheme(content: @Composable () -> Unit) {
    val scheme = remember {
        darkColorScheme(
            primary = Chrome.accent, onPrimary = Chrome.onAccent, primaryContainer = Chrome.bg3, onPrimaryContainer = Chrome.fg,
            secondary = Chrome.accent, onSecondary = Chrome.onAccent, secondaryContainer = Chrome.bg3, onSecondaryContainer = Chrome.fg,
            background = Chrome.bg, onBackground = Chrome.fg, surface = Chrome.bg, onSurface = Chrome.fg,
            surfaceVariant = Chrome.bg2, onSurfaceVariant = Chrome.dim, surfaceContainer = Chrome.bg2, surfaceContainerHigh = Chrome.bg2,
            surfaceContainerHighest = Chrome.bg3, surfaceContainerLow = Chrome.bg, outline = Chrome.dim, outlineVariant = Chrome.bg3,
            error = Color(0xFFFF8E76),
        )
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

/** Картаның үстіндегі төменгі парақ: күңгірт фонды басқанда жабылады. */
@Composable
fun BoxScope.MapSheet(onDismiss: () -> Unit, maxHeightFraction: Float = 0.8f, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.matchParentSize().background(Chrome.scrim).clickable(remember { MutableInteractionSource() }, indication = null, onClick = onDismiss))
    ChromeTheme {
        Surface(
            color = Chrome.bg, contentColor = Chrome.fg, shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp), shadowElevation = 12.dp,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .heightIn(max = (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * maxHeightFraction).dp),
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 24.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(width = 40.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Chrome.bg3))
                Spacer(Modifier.height(10.dp))
                content()
            }
        }
    }
}

/** Парақтың тақырыбы және «Жабу» батырмасы. */
@Composable
fun SheetHeader(title: String, sub: String? = null, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        IconButton(onClick = onClose, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Chrome.bg2)) {
            Icon(Icons.Filled.Close, stringResource(R.string.close))
        }
    }
    if (sub != null) Text(sub, color = Chrome.dim, fontSize = 14.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
    else Spacer(Modifier.height(10.dp))
}

/** Үлкен батырма (биіктігі 52 dp — қолғаппен де басылады). */
@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, primary: Boolean = false, danger: Boolean = false, enabled: Boolean = true,
              icon: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    val bg = when { danger -> Color(0x29E2553B); primary -> Chrome.accent; else -> Chrome.bg2 }
    val fg = when { danger -> Color(0xFFFF8E76); primary -> Chrome.onAccent; else -> Chrome.fg }
    Row(
        modifier.height(52.dp).clip(RoundedCornerShape(16.dp)).background(if (enabled) bg else bg.copy(alpha = 0.4f))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides fg.copy(alpha = if (enabled) 1f else 0.5f)) {
            if (icon != null) { icon(); Spacer(Modifier.width(8.dp)) }
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
        }
    }
}

/** Сегменттік ауыстырғыш (DD/DMS/UTM, оң/сол, төмен/жоғары). */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, value: T, modifier: Modifier = Modifier, onChange: (T) -> Unit) {
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Chrome.bg2).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (v, label) ->
            val on = v == value
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(11.dp)).background(if (on) Chrome.accent else Color.Transparent).clickable { onChange(v) },
                contentAlignment = Alignment.Center,
            ) { Text(label, color = if (on) Chrome.onAccent else Chrome.dim, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1) }
        }
    }
}

/** Тізім жолы: белгіше, тақырып, қосымша жол, оң жақта — көрсеткі не әрекет. */
@Composable
fun OptionRow(title: String, sub: String? = null, modifier: Modifier = Modifier, leading: (@Composable () -> Unit)? = null,
              trailing: (@Composable RowScope.() -> Unit)? = null, subMono: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(16.dp)).background(Chrome.bg2).clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2)
            if (!sub.isNullOrBlank()) Text(sub, color = Chrome.dim, fontSize = 13.sp, maxLines = 2,
                fontFamily = if (subMono) androidx.compose.ui.text.font.FontFamily.Monospace else null)
        }
        trailing?.invoke(this)
    }
}

/** Бөлім белгісі (бас әріппен). */
@Composable
fun ChromeLabel(text: String) {
    Text(text.uppercase(), color = Chrome.dim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
}
