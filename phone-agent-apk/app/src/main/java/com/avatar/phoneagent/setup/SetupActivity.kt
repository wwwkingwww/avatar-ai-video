package com.avatar.phoneagent.setup

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.avatar.phoneagent.service.AgentForegroundService
import com.avatar.phoneagent.vpn.TailscaleManager
import kotlinx.coroutines.launch

class SetupActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("agent_prefs", MODE_PRIVATE)
        val tm = TailscaleManager(this)

        setContent {
            var platform by remember { mutableStateOf(prefs.getString("platform", "douyin") ?: "douyin") }
            var phoneId by remember { mutableStateOf(prefs.getString("phone_id", "phone_01") ?: "phone_01") }
            var broker by remember { mutableStateOf(prefs.getString("mqtt_broker", "tcp://100.64.0.1:1883") ?: "tcp://100.64.0.1:1883") }
            var a11yOk by remember { mutableStateOf(false) }
            var tsInstalled by remember { mutableStateOf(false) }
            var vpnOk by remember { mutableStateOf(false) }
            var isRunning by remember { mutableStateOf(false) }

            val scope = rememberCoroutineScope()

            MaterialTheme {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("Phone Agent", style = MaterialTheme.typography.headlineMedium)

                    val platforms = listOf("douyin" to "抖音", "kuaishou" to "快手", "xiaohongshu" to "小红书")
                    var expanded by remember { mutableStateOf(false) }
                    Box {
                        Button(onClick = { expanded = true }) {
                            Text(platforms.first { it.first == platform }.second)
                        }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            platforms.forEach { (key, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        platform = key
                                        expanded = false
                                    }
                                )
                            }
                        }
                    }

                    OutlinedTextField(
                        value = phoneId,
                        onValueChange = { phoneId = it },
                        label = { Text("设备 ID") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = broker,
                        onValueChange = { broker = it },
                        label = { Text("MQTT Broker") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Divider(modifier = Modifier.padding(vertical = 8.dp))

                    Text("依赖检查", style = MaterialTheme.typography.titleMedium)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val ok = isAccessibilityServiceEnabled()
                        a11yOk = ok
                        Text(if (ok) "✅" else "❌")
                        Spacer(Modifier.width(8.dp))
                        Text("无障碍服务")
                        Spacer(Modifier.weight(1f))
                        if (!ok) {
                            TextButton(onClick = {
                                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                            }) {
                                Text("去开启")
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        tsInstalled = tm.isInstalled()
                        Text(if (tsInstalled) "✅" else "❌")
                        Spacer(Modifier.width(8.dp))
                        Text("Tailscale")
                        Spacer(Modifier.weight(1f))
                        if (!tsInstalled) {
                            TextButton(onClick = { tm.installTailscale() }) {
                                Text("安装")
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val connected = tm.isVpnConnected()
                        vpnOk = connected
                        Text(if (connected) "✅" else "❌")
                        Spacer(Modifier.width(8.dp))
                        Text("VPN 连接")
                        Spacer(Modifier.weight(1f))
                        if (!connected && tsInstalled) {
                            TextButton(onClick = {
                                scope.launch {
                                    tm.openTailscale()
                                    vpnOk = tm.waitForVpn()
                                }
                            }) {
                                Text("连接")
                            }
                        }
                    }

                    Divider(modifier = Modifier.padding(vertical = 8.dp))

                    val allReady = a11yOk && tsInstalled && vpnOk

                    Button(
                        onClick = {
                            if (isRunning) {
                                stopService(Intent(this@SetupActivity, AgentForegroundService::class.java))
                                isRunning = false
                                prefs.edit().putBoolean("was_running", false).apply()
                            } else {
                                prefs.edit().apply {
                                    putString("platform", platform)
                                    putString("phone_id", phoneId)
                                    putString("mqtt_broker", broker)
                                    putBoolean("was_running", true)
                                }.apply()

                                val intent = Intent(this@SetupActivity, AgentForegroundService::class.java).apply {
                                    putExtra("platform", platform)
                                    putExtra("phone_id", phoneId)
                                    putExtra("mqtt_broker", broker)
                                }
                                startForegroundService(intent)
                                isRunning = true
                            }
                        },
                        enabled = allReady || isRunning,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (isRunning) "停止运行" else "开始运行")
                    }

                    if (isRunning) {
                        Text("运行中 · 可关闭此页面", color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "通知栏将显示常驻服务。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (!allReady && !isRunning) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "请先完成以上 3 项检查，全部通过后可开始运行。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val services = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        )
        return services.any { it.resolveInfo.serviceInfo.packageName == packageName }
    }
}
