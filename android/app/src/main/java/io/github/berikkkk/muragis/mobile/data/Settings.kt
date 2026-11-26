package io.github.berikkkk.muragis.mobile.data

import android.content.Context
import io.github.berikkkk.muragis.core.model.Lang
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Пайдаланушы баптаулары. Интерфейс тілі — AppCompatDelegate (жүйенің қосымша тілі), бұл жерде тек деректер баптаулары. */
data class Prefs(
    /** Деректерді көрсету тілі (тізім, карта, карточка). Интерфейс тілінен тәуелсіз. */
    val dataLang: Lang = Lang.KK,
    /** Экспорт файлдарының әдепкі тілі. */
    val exportLang: Lang = Lang.KK,
    val cluster: Boolean = true,
    val showLocation: Boolean = false,
    /** Интернет жоғалғанда ауысатын офлайн негізгі карта (қабат id). */
    val offlineBaseId: String = "",
    val lastLat: Double = 48.0,
    val lastLon: Double = 67.0,
    val lastZoom: Double = 4.5,
    val coordFormatDms: Boolean = false,
    /** Zoom және «Белгі қою» батырмалары картаның сол жағында (әдепкі — оң жақ). */
    val zoomLeft: Boolean = false,
    /** Құралдар панелі экранның жоғарғы жағында (әдепкі — төменде). */
    val barTop: Boolean = false,
    /** Навигация режимінде орын экранның дәл ортасында (әдепкі — төменгі бөлігінде, алдағы жол көбірек көрінеді). */
    val navCenter: Boolean = false,
    /** Соңғы таңдалған облыс (жаңа ескерткіштің әдепкі мәні; бос — Ақтөбе облысы). */
    val lastOblast: String = "",
)

class Settings(context: Context) {
    private val sp = context.getSharedPreferences("mura_settings", Context.MODE_PRIVATE)
    private val _prefs = MutableStateFlow(read())
    val prefs: StateFlow<Prefs> = _prefs

    private fun read() = Prefs(
        dataLang = Lang.of(sp.getString("dataLang", "kk")),
        exportLang = Lang.of(sp.getString("exportLang", "kk")),
        cluster = sp.getBoolean("cluster", true),
        showLocation = sp.getBoolean("showLocation", false),
        offlineBaseId = sp.getString("offlineBaseId", "") ?: "",
        lastLat = sp.getFloat("lastLat", 48f).toDouble(),
        lastLon = sp.getFloat("lastLon", 67f).toDouble(),
        lastZoom = sp.getFloat("lastZoom", 4.5f).toDouble(),
        coordFormatDms = sp.getBoolean("coordDms", false),
        zoomLeft = sp.getBoolean("zoomLeft", false),
        barTop = sp.getBoolean("barTop", false),
        navCenter = sp.getBoolean("navCenter", false),
        lastOblast = sp.getString("lastOblast", "") ?: "",
    )

    fun update(f: (Prefs) -> Prefs) {
        val p = f(_prefs.value)
        sp.edit()
            .putString("dataLang", p.dataLang.code).putString("exportLang", p.exportLang.code)
            .putBoolean("cluster", p.cluster).putBoolean("showLocation", p.showLocation)
            .putString("offlineBaseId", p.offlineBaseId)
            .putFloat("lastLat", p.lastLat.toFloat()).putFloat("lastLon", p.lastLon.toFloat()).putFloat("lastZoom", p.lastZoom.toFloat())
            .putBoolean("coordDms", p.coordFormatDms)
            .putBoolean("zoomLeft", p.zoomLeft).putBoolean("barTop", p.barTop).putBoolean("navCenter", p.navCenter).putString("lastOblast", p.lastOblast)
            .apply()
        _prefs.value = p
    }

    /** Аяқталмаған маршрут жобасы (қосымша кенет жабылса, қалпына келтіру үшін). */
    var routeDraft: String?
        get() = sp.getString("routeDraft", null)
        set(v) { sp.edit().putString("routeDraft", v).apply() }

    /** Картада үнемі көрсетілетін маршруттар мен тректердің id-лері (қалғандары тек карточкасы ашылғанда көрінеді). */
    var shownRoutes: Set<String>
        get() = sp.getStringSet("shownRoutes", null)?.toSet() ?: emptySet()
        set(v) { sp.edit().putStringSet("shownRoutes", v).apply() }

    /** Жазылып жатқан трек (қосымша кенет жабылса, келесі ашылғанда кідіртілген күйде қалпына келеді). */
    var trackDraft: String?
        get() = sp.getString("trackDraft", null)
        set(v) { sp.edit().putString("trackDraft", v).apply() }

    /** «Фонда жазу» рұқсаттары туралы терезені қайта көрсетпеу. */
    var bgAskOff: Boolean
        get() = sp.getBoolean("bgAskOff", false)
        set(v) { sp.edit().putBoolean("bgAskOff", v).apply() }

    var lastBackup: Long
        get() = sp.getLong("lastBackup", 0L)
        set(v) { sp.edit().putLong("lastBackup", v).apply() }

    var mapLicenseAcknowledged: Boolean
        get() = sp.getBoolean("mapLicenseAck", false)
        set(v) { sp.edit().putBoolean("mapLicenseAck", v).apply() }
}
