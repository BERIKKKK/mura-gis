package io.github.berikkkk.muragis.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.berikkkk.muragis.core.update.AppUpdate
import io.github.berikkkk.muragis.mobile.BuildConfig
import io.github.berikkkk.muragis.mobile.R

/** Ашық кітапхана не дерек: атауы, лицензиясы, сілтемесі. */
private data class OpenItem(val name: String, val license: String, val url: String)

/** Қолданбада және оның карта пакеттерінде пайдаланылатындар (app/build.gradle.kts, tools/packager). */
private val LIBRARIES = listOf(
    OpenItem("MapLibre Native", "BSD-2-Clause", "https://github.com/maplibre/maplibre-native"),
    OpenItem("Jetpack Compose, AndroidX", "Apache 2.0", "https://developer.android.com/jetpack/androidx"),
    OpenItem("Material Icons", "Apache 2.0", "https://fonts.google.com/icons"),
    OpenItem("Lucide Icons", "ISC", "https://lucide.dev"),
    OpenItem("Kotlin, kotlinx.coroutines, kotlinx.serialization", "Apache 2.0", "https://kotlinlang.org"),
    OpenItem("Noto Sans", "SIL OFL 1.1", "https://notofonts.github.io"),
    OpenItem("Planetiler", "Apache 2.0", "https://github.com/onthegomap/planetiler"),
)

private val DATA = listOf(
    OpenItem("OpenStreetMap", "ODbL 1.0", "https://www.openstreetmap.org/copyright"),
    OpenItem("OpenTopoMap", "CC-BY-SA 3.0", "https://opentopomap.org/about"),
    OpenItem("Copernicus DEM GLO-30, Sentinel-2", "Copernicus", "https://dataspace.copernicus.eu"),
    OpenItem("Esri, nakarte.me", "©", "https://nakarte.me"),
)

/** «Бағдарлама туралы»: нұсқа, жаңарту, ашық кітапханалар мен деректер — бір ықшам бетте. */
@Composable
fun AboutPage(vm: MainViewModel) {
    val ctx = LocalContext.current
    val update by vm.update.collectAsState()
    fun open(url: String) = runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp)) {
        PageTitle(stringResource(R.string.about_title), null)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 10.dp)) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF353535)), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(64.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Mura GIS Android", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(stringResource(R.string.about_version, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE), color = Chrome.dim, fontSize = 13.sp)
            }
        }
        Text(stringResource(R.string.about_text), color = Chrome.dim, fontSize = 13.5.sp)

        Spacer(Modifier.padding(top = 12.dp))
        val u = update
        OptionRow(
            stringResource(R.string.update_check),
            when (u) {
                UpdateState.Idle -> null
                UpdateState.Checking -> stringResource(R.string.update_checking)
                UpdateState.UpToDate -> stringResource(R.string.update_latest)
                UpdateState.Error -> stringResource(R.string.update_error)
                is UpdateState.Available -> stringResource(R.string.update_available, u.release.version)
            },
            leading = { Icon(Icons.Filled.SystemUpdate, null, tint = Chrome.accent) },
            trailing = { if (u == UpdateState.Checking) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) },
        ) { vm.checkUpdate() }
        if (u is UpdateState.Available) {
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                u.release.apkUrl?.let { apk ->
                    BigButton(stringResource(R.string.update_download, fmtBytes(u.release.apkSize)), Modifier.fillMaxWidth(), primary = true,
                        icon = { Icon(Icons.Filled.Download, null, Modifier.size(20.dp)) }) { open(apk) }
                }
                BigButton(stringResource(R.string.update_notes), Modifier.fillMaxWidth()) { open(u.release.pageUrl) }
            }
        }

        ChromeLabel(stringResource(R.string.about_libs))
        LinkList(LIBRARIES + DATA, ::open)
        Spacer(Modifier.padding(top = 8.dp))
        LinkList(listOf(OpenItem(stringResource(R.string.about_source), "github.com/${AppUpdate.REPO}", AppUpdate.REPO_URL)), ::open)
    }
}

/** Ықшам тізім: бір жолда атауы мен лицензиясы, түртсе — сілтеме ашылады. */
@Composable
private fun LinkList(items: List<OpenItem>, open: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Chrome.bg2)) {
        items.forEachIndexed { i, it ->
            if (i > 0) Box(Modifier.padding(horizontal = 14.dp).fillMaxWidth().height(1.dp).background(Color(0x17FFFFFF)))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { open(it.url) }.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(it.name, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Text(it.license, color = Chrome.dim, fontSize = 12.5.sp)
                Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = Chrome.dim, modifier = Modifier.size(16.dp))
            }
        }
    }
}
