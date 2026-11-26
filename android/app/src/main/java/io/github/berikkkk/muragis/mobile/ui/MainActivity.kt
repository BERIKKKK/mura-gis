package io.github.berikkkk.muragis.mobile.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.maplibre.android.maps.MapView

/**
 * Жалғыз экран. Карта (MapView) бір рет құрылады және барлық бөлімдерде ортақ — бөлім ауысқанда қайта жүктелмейді.
 * Интерфейс тілі — AppCompatDelegate.setApplicationLocales (Android 13+ жүйелік «қосымша тілі», төменгі нұсқаларда — AppCompat).
 */
class MainActivity : AppCompatActivity() {
    private val vm: MainViewModel by viewModels()
    private lateinit var mapView: MapView
    private var afterLocationGrant: (() -> Unit)? = null

    private val locationPerm = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r.values.any { it }) afterLocationGrant?.invoke()
        afterLocationGrant = null
    }
    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    /** Google рұқсат терезесі (синхрондау: drive.appdata) — нәтижесі ViewModel-ге. */
    private val authLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        if (r.resultCode == RESULT_OK) vm.syncAuthResult(r.data) else vm.toast(io.github.berikkkk.muragis.mobile.R.string.sync_err_denied)
    }
    fun launchAuth(pi: android.app.PendingIntent) {
        runCatching { authLauncher.launch(androidx.activity.result.IntentSenderRequest.Builder(pi.intentSender).build()) }
    }
    private val bgPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { resumes.intValue++ }
    /** onResume саны — жүйелік баптаулардан қайтқанда рұқсат күйін қайта тексеру үшін. */
    val resumes = androidx.compose.runtime.mutableIntStateOf(0)

    /** Орынға «Әрқашан» рұқсат (Android 10+) — жазу фонда, басқа қолданба ашық тұрғанда да үзілмеуі үшін. */
    fun hasBackgroundLocation() = Build.VERSION.SDK_INT < 29 ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Android 11+-та жүйе баптаулар бетін ашады — онда «Әрқашан рұқсат ету» таңдалады. */
    fun askBackgroundLocation() { if (Build.VERSION.SDK_INT >= 29) bgPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION) }

    fun ignoresBatteryOptimizations() = getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

    @android.annotation.SuppressLint("BatteryLife")
    fun askIgnoreBatteryOptimizations() {
        runCatching {
            startActivity(android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:$packageName")))
        }.onFailure { runCatching { startActivity(android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) } }
    }

    fun hasLocation() = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Орынға рұқсатты сұрап, берілсе — [then]. */
    fun withLocation(then: () -> Unit) {
        if (hasLocation()) { then(); return }
        afterLocationGrant = then
        locationPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mapView = MapView(this)
        mapView.onCreate(savedInstanceState)
        setContent { MuraTheme { MainScreen(vm, mapView, this) } }
    }

    override fun onStart() { super.onStart(); mapView.onStart() }
    override fun onResume() {
        super.onResume(); mapView.onResume()
        resumes.intValue++
        if (vm.prefs.value.showLocation && hasLocation()) vm.location.setTracking(true)
    }
    override fun onPause() {
        // GPS қажет болмаған кезде (қосымша фонда) тоқтатылады
        vm.location.setTracking(false)
        mapView.onPause(); super.onPause()
    }
    override fun onStop() { mapView.onStop(); super.onStop() }
    override fun onLowMemory() { super.onLowMemory(); mapView.onLowMemory() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); mapView.onSaveInstanceState(outState) }
    override fun onDestroy() { mapView.onDestroy(); super.onDestroy() }
}
