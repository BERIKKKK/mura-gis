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
        if (vm.prefs.value.showLocation && hasLocation()) vm.location.setTracking(true)
        if (vm.headingUp.value) vm.heading.setActive(true)
    }
    override fun onPause() {
        // GPS қажет болмаған кезде (қосымша фонда) тоқтатылады
        vm.location.setTracking(false)
        vm.heading.setActive(false)
        mapView.onPause(); super.onPause()
    }
    override fun onStop() { mapView.onStop(); super.onStop() }
    override fun onLowMemory() { super.onLowMemory(); mapView.onLowMemory() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); mapView.onSaveInstanceState(outState) }
    override fun onDestroy() { mapView.onDestroy(); super.onDestroy() }
}
