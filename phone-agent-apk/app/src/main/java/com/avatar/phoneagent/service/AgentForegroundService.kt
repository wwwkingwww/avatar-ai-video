package com.avatar.phoneagent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.avatar.phoneagent.accessibility.CameraAccessibilityService
import com.avatar.phoneagent.engine.ActionEngine
import com.avatar.phoneagent.engine.VideoDownloader
import com.avatar.phoneagent.setup.SetupActivity
import org.eclipse.paho.client.mqttv3.IMqttActionListener
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.IMqttToken
import org.eclipse.paho.client.mqttv3.MqttAsyncClient
import org.eclipse.paho.client.mqttv3.MqttCallback
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject

class AgentForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "phone_agent_channel"
        const val NOTIFICATION_ID = 1
    }

    private var mqttClient: MqttAsyncClient? = null
    private var phoneId = "phone_01"
    private var platform = "douyin"
    private var brokerUrl = "tcp://100.64.0.1:1883"
    private val handler = Handler(Looper.getMainLooper())

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        phoneId = intent?.getStringExtra("phone_id") ?: phoneId
        platform = intent?.getStringExtra("platform") ?: platform
        brokerUrl = intent?.getStringExtra("mqtt_broker") ?: brokerUrl

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("连接中..."))
        connectMqtt()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Phone Agent",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "后台发布服务"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, SetupActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Phone Agent")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun connectMqtt() {
        try {
            mqttClient = MqttAsyncClient(brokerUrl, "agent-$phoneId", MemoryPersistence())

            mqttClient?.setCallback(object : MqttCallback {
                override fun connectionLost(cause: Throwable?) {
                    Log.w("MQTT", "连接断开，5s 后重连")
                    handler.postDelayed({ connectMqtt() }, 5000)
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    val payload = message?.payload?.toString(Charsets.UTF_8) ?: return
                    val json = JSONObject(payload)

                    when (topic) {
                        "phone/$phoneId/task" -> handleTask(json)
                        "phone/$phoneId/cmd" -> handleCommand(json)
                    }
                }

                override fun deliveryComplete(token: IMqttDeliveryToken?) {}
            })

            val opts = MqttConnectOptions().apply {
                isCleanSession = true
                connectionTimeout = 10
                keepAliveInterval = 30
                isAutomaticReconnect = false
            }

            mqttClient?.connect(opts, null, object : IMqttActionListener {
                override fun onSuccess(token: IMqttToken?) {
                    subscribe("phone/$phoneId/task")
                    subscribe("phone/$phoneId/cmd")
                    reportOnline()
                    startHeartbeat()
                    updateNotification("运行中 · $platform")
                }

                override fun onFailure(token: IMqttToken?, exc: Throwable?) {
                    updateNotification("MQTT 连接失败，重试中...")
                    handler.postDelayed({ connectMqtt() }, 5000)
                }
            })
        } catch (e: Exception) {
            handler.postDelayed({ connectMqtt() }, 5000)
        }
    }

    private fun subscribe(topic: String) {
        mqttClient?.subscribe(topic, 1)
    }

    private fun handleTask(taskJson: JSONObject) {
        val taskId = taskJson.getString("task_id")
        val videoUrl = taskJson.getJSONObject("video").getString("url")
        val actions = taskJson.getJSONArray("actions")
        val metadata = taskJson.optJSONObject("metadata")

        publishStatus(taskId, "downloading")

        Thread {
            try {
                val videoPath = VideoDownloader.download(videoUrl, taskId)
                publishStatus(taskId, "publishing")

                val a11y = CameraAccessibilityService.instance
                if (a11y == null) {
                    publishStatus(taskId, "failed", "无障碍服务未就绪")
                    return@Thread
                }

                val params = mutableMapOf<String, String>()
                params["video_path"] = videoPath
                if (metadata != null) {
                    metadata.keys().forEach {
                        params[it] = metadata.optString(it, "")
                    }
                }

                val result = ActionEngine.execute(a11y, actions, params)

                val extra = HashMap<String, Any>()
                extra["step"] = "done"
                extra["screenshots"] = result["screenshots"] ?: emptyList<String>()

                publishStatus(taskId, "success", extra)
                Log.d("AGENT", "任务 $taskId 完成")
            } catch (e: Exception) {
                publishStatus(taskId, "failed", e.message ?: "未知错误")
                Log.e("AGENT", "任务 $taskId 失败: ${e.message}")
            }
        }.start()
    }

    private fun handleCommand(cmd: JSONObject) {
        val type = cmd.optString("type", "")
        if (type == "restart") {
            stopSelf()
        }
    }

    private fun publishStatus(taskId: String, status: String, errorMsg: String = "") {
        val payload = JSONObject().apply {
            put("task_id", taskId)
            put("phone_id", phoneId)
            put("platform", platform)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
        }
        if (errorMsg.isNotEmpty()) {
            payload.put("error", errorMsg)
        }
        publish("phone/$phoneId/status", payload)
    }

    private fun publishStatus(taskId: String, status: String, extra: Map<String, Any>) {
        val payload = JSONObject().apply {
            put("task_id", taskId)
            put("phone_id", phoneId)
            put("platform", platform)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
            extra.forEach { (k, v) -> put(k, v) }
        }
        publish("phone/$phoneId/status", payload)
    }

    private fun publish(topic: String, payload: JSONObject) {
        val msg = MqttMessage(payload.toString().toByteArray()).apply { qos = 1 }
        mqttClient?.publish(topic, msg)
    }

    private fun reportOnline() {
        val payload = JSONObject().apply {
            put("phone_id", phoneId)
            put("platform", platform)
            put("status", "online")
            put("timestamp", System.currentTimeMillis())
        }
        publish("phone/$phoneId/status", payload)
    }

    private fun startHeartbeat() {
        val runnable = object : Runnable {
            override fun run() {
                val payload = JSONObject().apply {
                    put("phone_id", phoneId)
                    put("battery", getBatteryLevel())
                    put("timestamp", System.currentTimeMillis())
                }
                publish("phone/$phoneId/heartbeat", payload)
                handler.postDelayed(this, 30_000)
            }
        }
        handler.post(runnable)
    }

    private fun getBatteryLevel(): Int {
        val batteryIntent = registerReceiver(null,
            android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else 0
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        updateNotification("运行中 · $platform")
    }
}
