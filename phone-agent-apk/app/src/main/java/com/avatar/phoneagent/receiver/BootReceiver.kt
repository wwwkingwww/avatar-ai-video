package com.avatar.phoneagent.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.avatar.phoneagent.service.AgentForegroundService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("agent_prefs", Context.MODE_PRIVATE)
            val wasRunning = prefs.getBoolean("was_running", false)
            if (wasRunning) {
                val serviceIntent = Intent(context, AgentForegroundService::class.java).apply {
                    putExtra("phone_id", prefs.getString("phone_id", "phone_01"))
                    putExtra("platform", prefs.getString("platform", "douyin"))
                    putExtra("mqtt_broker", prefs.getString("mqtt_broker", "tcp://100.64.0.1:1883"))
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
