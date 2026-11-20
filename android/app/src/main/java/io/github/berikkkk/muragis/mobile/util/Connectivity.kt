package io.github.berikkkk.muragis.mobile.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Интернет бар ма (тексерілген желі). Интернет жоғалса, карта офлайн қабатқа ауысады. */
class Connectivity(ctx: Context) {
    private val cm = ctx.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(current())
    val online: StateFlow<Boolean> = _online

    private fun current(): Boolean {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private val cb = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { _online.value = current() }
        override fun onLost(network: Network) { _online.value = current() }
        override fun onCapabilitiesChanged(network: Network, nc: NetworkCapabilities) { _online.value = current() }
    }

    init { runCatching { cm.registerDefaultNetworkCallback(cb) } }
}
