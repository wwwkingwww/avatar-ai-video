package com.avatar.phoneagent.vpn

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import java.net.HttpURLConnection
import java.net.URL

class TailscaleManager(private val context: Context) {

    companion object {
        private const val TS_PACKAGE = "com.tailscale.ipn"
        private const val TS_API = "http://100.100.100.100/localapi/v0/status"
        private const val VPN_TIMEOUT_SECONDS = 120L
    }

    fun isInstalled(): Boolean {
        return try {
            context.packageManager.getPackageInfo(TS_PACKAGE, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    fun installTailscale() {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("market://details?id=$TS_PACKAGE")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://play.google.com/store/apps/details?id=$TS_PACKAGE")
            }
            context.startActivity(intent)
        }
    }

    fun openTailscale() {
        val intent = context.packageManager.getLaunchIntentForPackage(TS_PACKAGE)
        if (intent != null) {
            context.startActivity(intent)
        }
    }

    fun checkApi(): Boolean {
        return try {
            val conn = URL(TS_API).openConnection() as HttpURLConnection
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            conn.responseCode == 200
        } catch (e: Exception) {
            false
        }
    }

    suspend fun waitForVpn(): Boolean {
        return withTimeoutOrNull(VPN_TIMEOUT_SECONDS * 1000) {
            while (!checkApi()) {
                delay(2000)
            }
            true
        } ?: false
    }

    fun isVpnConnected(): Boolean = checkApi()
}
