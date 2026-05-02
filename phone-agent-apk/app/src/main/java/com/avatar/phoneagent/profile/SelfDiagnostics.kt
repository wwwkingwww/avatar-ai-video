package com.avatar.phoneagent.profile

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.view.accessibility.AccessibilityManager
import com.avatar.phoneagent.accessibility.CameraAccessibilityService
import com.avatar.phoneagent.vpn.TailscaleManager
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL

data class DiagItem(
    val name: String,
    val status: DiagStatus,
    val detail: String = "",
    val fixAction: String = ""
)

enum class DiagStatus {
    PASS, WARN, FAIL
}

class SelfDiagnostics(private val context: Context) {

    private val results = mutableListOf<DiagItem>()

    fun runAll(
        brokerHost: String,
        brokerPort: Int
    ): List<DiagItem> {
        results.clear()

        addDiag("Android 版本") {
            val sdk = android.os.Build.VERSION.SDK_INT
            if (sdk >= 24) DiagStatus.PASS else DiagStatus.FAIL
        }.detail("SDK ${android.os.Build.VERSION.SDK_INT}, ${android.os.Build.VERSION.RELEASE}")
         .fix("需要 Android 7.0+")

        addDiag("网络连接") {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return@addDiag DiagStatus.FAIL
            val caps = cm.getNetworkCapabilities(network) ?: return@addDiag DiagStatus.FAIL
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) DiagStatus.PASS
            else DiagStatus.FAIL
        }.detail(if (isOnline()) "已连接互联网" else "无网络")
         .fix("请检查 WiFi 或移动数据")

        addDiag("无障碍服务") {
            val a11yInstance = CameraAccessibilityService.instance
            val systemEnabled = isAccessibilityEnabled()
            when {
                a11yInstance != null && systemEnabled -> DiagStatus.PASS
                systemEnabled -> DiagStatus.WARN
                else -> DiagStatus.FAIL
            }
        }.detail(if (isAccessibilityEnabled()) "已启用" else "未启用")
         .fix("设置 → 无障碍 → Phone Agent → 开启")

        val screenProfile = DeviceProfile.detect(context)
        addDiag("屏幕分辨率") {
            if (screenProfile.actualWidth >= 720 && screenProfile.actualHeight >= 1280) DiagStatus.PASS
            else DiagStatus.WARN
        }.detail("${screenProfile.actualWidth}×${screenProfile.actualHeight}, dpi=${screenProfile.densityDpi}")

        val freeMB = getFreeStorageMB()
        addDiag("存储空间") {
            when {
                freeMB >= 1024 -> DiagStatus.PASS
                freeMB >= 256 -> DiagStatus.WARN
                else -> DiagStatus.FAIL
            }
        }.detail("可用 $freeMB MB")
         .fix("请清理存储空间，至少保留 256MB")

        val tm = TailscaleManager(context)
        val tsInstalled = tm.isInstalled()
        addDiag("Tailscale 安装") {
            if (tsInstalled) DiagStatus.PASS else DiagStatus.WARN
        }.detail(if (tsInstalled) "已安装" else "未安装")
         .fix("从 Play Store 安装 Tailscale")

        addDiag("VPN 连接") {
            when {
                !tsInstalled -> DiagStatus.FAIL
                tm.isVpnConnected() -> DiagStatus.PASS
                else -> DiagStatus.WARN
            }
        }.detail(if (tm.isVpnConnected()) "已连接" else "未连接")
         .fix("打开 Tailscale App 并连接 VPN")

        addDiag("MQTT Broker 连通") {
            if (testTcpConnection(brokerHost, brokerPort)) DiagStatus.PASS
            else DiagStatus.FAIL
        }.detail("$brokerHost:$brokerPort")
         .fix("请确认 MQTT Broker 正在运行，且手机已连接 Tailscale VPN")

        addDiag("目标 App 安装") {
            val appProfile = DeviceProfile.detect(context)
            val missing = appProfile.installedApps.filter { !it.value }.keys
            if (missing.isEmpty()) DiagStatus.PASS else DiagStatus.WARN
        }.detail(
            DeviceProfile.TARGET_APPS.entries.joinToString(", ") { (name, pkg) ->
                val installed = context.isPackageInstalled(pkg)
                "${if (installed) "✅" else "❌"} $name"
            }
        ).fix("请在应用商店安装缺失的 App")

        return results.toList()
    }

    private fun addDiag(name: String, check: () -> DiagStatus): DiagItem {
        val status = try {
            check()
        } catch (e: Exception) {
            DiagStatus.FAIL
        }
        val item = DiagItem(name, status)
        results.add(item)
        return item
    }

    private fun DiagItem.detail(d: String): DiagItem {
        val idx = results.indexOfFirst { it.name == this.name }
        if (idx >= 0) results[idx] = this.copy(detail = d)
        return this
    }

    private fun DiagItem.fix(f: String): DiagItem {
        val idx = results.indexOfFirst { it.name == this.name }
        if (idx >= 0) results[idx] = this.copy(fixAction = f)
        return this
    }

    private fun Context.isPackageInstalled(pkg: String): Boolean {
        return try {
            packageManager.getPackageInfo(pkg, 0)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun isOnline(): Boolean {
        return try {
            val url = URL("https://www.google.com")
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.responseCode
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun testTcpConnection(host: String, port: Int): Boolean {
        return try {
            val socket = Socket()
            socket.connect(InetSocketAddress(host, port), 5000)
            socket.close()
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false
        val services = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        )
        return services.any { it.resolveInfo.serviceInfo.packageName == context.packageName }
    }

    private fun getFreeStorageMB(): Long {
        return try {
            val stat = android.os.StatFs(android.os.Environment.getExternalStorageDirectory().path)
            val availableBlocks = stat.availableBlocksLong
            val blockSize = stat.blockSizeLong
            availableBlocks * blockSize / (1024 * 1024)
        } catch (e: Exception) {
            0
        }
    }
}
