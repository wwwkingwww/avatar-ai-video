# Phone Agent APK 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** 将 phone-agent 打包为原生 Android APK（Kotlin + Jetpack Compose），打开即自动检测环境、引导授权、后台常驻执行发布任务

**Architecture:** Android 原生 App，AccessibilityService 触控注入 + Paho MQTT 通信 + Foreground Service 保活 + Tailscale VPN 自动检测

**Tech Stack:** Kotlin, Jetpack Compose, Paho MQTT, OkHttp, WorkManager

**Design doc:** `docs/superpowers/specs/2026-04-29-phone-agent-apk-design.md`

---

## Phase 1: Android 项目脚手架

### Task 1: 项目根配置文件

**Files:**
- Create: `phone-agent-apk/settings.gradle.kts`
- Create: `phone-agent-apk/build.gradle.kts`
- Create: `phone-agent-apk/gradle.properties`
- Create: `phone-agent-apk/gradle/wrapper/gradle-wrapper.properties`

- [ ] **Step 1: settings.gradle.kts**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://repo.eclipse.org/content/repositories/paho-releases/") }
    }
}

rootProject.name = "PhoneAgent"
include(":app")
```

- [ ] **Step 2: 根 build.gradle.kts**

```kotlin
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
}
```

- [ ] **Step 3: gradle.properties**

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

- [ ] **Step 4: gradle-wrapper.properties**

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

---

### Task 2: App 模块 build.gradle.kts

**Files:**
- Create: `phone-agent-apk/app/build.gradle.kts`

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.avatar.phoneagent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.avatar.phoneagent"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.5"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2023.10.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.8.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
```

---

### Task 3: AndroidManifest.xml

**Files:**
- Create: `phone-agent-apk/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />

    <application
        android:name=".PhoneAgentApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Phone Agent"
        android:supportsRtl="true"
        android:theme="@style/Theme.PhoneAgent"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".setup.SetupActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".service.AgentForegroundService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <service
            android:name=".accessibility.CameraAccessibilityService"
            android:exported="true"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>

        <receiver
            android:name=".receiver.BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

    </application>
</manifest>
```

---

## Phase 2: AccessibilityService 触控层

### Task 4: 无障碍服务配置 + 服务实现

**Files:**
- Create: `phone-agent-apk/app/src/main/res/xml/accessibility_service_config.xml`
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/accessibility/CameraAccessibilityService.kt`

- [ ] **Step 1: accessibility_service_config.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<accessibility-service
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged|typeViewClicked|typeViewFocused"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagRequestTouchExplorationMode"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:description="@string/accessibility_service_desc"
    android:notificationTimeout="100" />
```

- [ ] **Step 2: CameraAccessibilityService.kt**

```kotlin
package com.avatar.phoneagent.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class CameraAccessibilityService : AccessibilityService() {

    companion object {
        var instance: CameraAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d("A11y", "Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    fun tap(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1))
            .build()
        dispatchGesture(gesture, null, null)
    }

    fun longPress(x: Float, y: Float, durationMs: Long = 500) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }

    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long = 300) {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }

    fun inputText(text: String) {
        val root = rootInActiveWindow ?: return
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null) {
            val args = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text
                )
            }
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } else {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("agent", text))
            root.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        }
    }

    fun pressBack() {
        performGlobalAction(GLOBAL_ACTION_BACK)
    }

    fun pressHome() {
        performGlobalAction(GLOBAL_ACTION_HOME)
    }

    fun launchApp(packageName: String) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(intent)
        }
    }
}
```

---

## Phase 3: VPN + 网络检测

### Task 5: TailscaleManager

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/vpn/TailscaleManager.kt`

```kotlin
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
```

---

## Phase 4: MQTT + Agent 核心服务

### Task 6: AgentForegroundService（MQTT + 任务处理）

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/service/AgentForegroundService.kt`

```kotlin
package com.avatar.phoneagent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.avatar.phoneagent.accessibility.CameraAccessibilityService
import com.avatar.phoneagent.engine.ActionEngine
import com.avatar.phoneagent.engine.VideoDownloader
import com.avatar.phoneagent.setup.SetupActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
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
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

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
                metadata?.keys()?.forEach {
                    params[it] = metadata.optString(it, "")
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

    private fun publishStatus(taskId: String, status: String, extra: String = "") {
        val payload = JSONObject().apply {
            put("task_id", taskId)
            put("phone_id", phoneId)
            put("platform", platform)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
        }
        if (extra.isNotEmpty()) {
            payload.put("error", extra)
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
```

---

## Phase 5: Action Engine + Video Downloader

### Task 7: VideoDownloader

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/engine/VideoDownloader.kt`

```kotlin
package com.avatar.phoneagent.engine

import android.os.Environment
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

object VideoDownloader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val downloadDir = File(Environment.getExternalStorageDirectory(), "videos")

    fun download(url: String, taskId: String): String {
        downloadDir.mkdirs()

        val ext = url.substringAfterLast('.').substringBefore('?').ifEmpty { "mp4" }
        val file = File(downloadDir, "${taskId}.${ext}")

        if (file.exists()) return file.absolutePath

        val request = Request.Builder().url(url).build()
        val response = client.newCall(request).execute()

        if (!response.isSuccessful) {
            throw Exception("下载失败: HTTP ${response.code}")
        }

        response.body?.byteStream()?.use { input ->
            FileOutputStream(file).use { output ->
                input.copyTo(output)
            }
        } ?: throw Exception("响应体为空")

        return file.absolutePath
    }
}
```

---

### Task 8: ActionEngine

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/engine/ActionEngine.kt`

```kotlin
package com.avatar.phoneagent.engine

import com.avatar.phoneagent.accessibility.CameraAccessibilityService
import org.json.JSONArray
import org.json.JSONObject

object ActionEngine {

    fun execute(
        a11y: CameraAccessibilityService,
        actionsJson: JSONArray,
        params: Map<String, String>
    ): Map<String, Any> {
        val screenshots = mutableListOf<String>()

        for (i in 0 until actionsJson.length()) {
            val action = actionsJson.getJSONObject(i)
            val type = action.getString("type")

            try {
                when (type) {
                    "launch" -> {
                        val pkg = resolve(action.getString("package"), params)
                        a11y.launchApp(pkg)
                    }
                    "tap" -> {
                        val x = action.getDouble("x").toFloat()
                        val y = action.getDouble("y").toFloat()
                        a11y.tap(x, y)
                    }
                    "swipe" -> {
                        val x1 = action.getDouble("x1").toFloat()
                        val y1 = action.getDouble("y1").toFloat()
                        val x2 = action.getDouble("x2").toFloat()
                        val y2 = action.getDouble("y2").toFloat()
                        val dur = action.optLong("duration", 300)
                        a11y.swipe(x1, y1, x2, y2, dur)
                    }
                    "wait" -> {
                        val ms = action.optLong("ms", 1000)
                        Thread.sleep(ms)
                    }
                    "input_text" -> {
                        if (action.has("x") && action.has("y")) {
                            a11y.tap(
                                action.getDouble("x").toFloat(),
                                action.getDouble("y").toFloat()
                            )
                            Thread.sleep(300)
                        }
                        val content = resolve(action.getString("content"), params)
                        a11y.inputText(content)
                    }
                    "screenshot" -> {
                        val name = resolve(action.getString("name"), params)
                        val path = "/sdcard/screenshots/${name}.png"
                        screenshots.add(path)
                    }
                    "back" -> {
                        a11y.pressBack()
                        Thread.sleep(500)
                    }
                    "home" -> {
                        a11y.pressHome()
                        Thread.sleep(500)
                    }
                }
                Thread.sleep(100)
            } catch (e: Exception) {
                throw Exception("Action [$type] 失败: ${e.message}")
            }
        }

        return mapOf(
            "success" to true,
            "screenshots" to screenshots
        )
    }

    private fun resolve(template: String, params: Map<String, String>): String {
        val regex = Regex("\\{\\{(\\w+)}}")
        return regex.replace(template) { match ->
            params[match.groupValues[1]] ?: match.value
        }
    }
}
```

---

## Phase 6: Application + UI + 其他

### Task 9: Application 类 + BootReceiver

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/PhoneAgentApp.kt`
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/receiver/BootReceiver.kt`

- [ ] **PhoneAgentApp.kt**

```kotlin
package com.avatar.phoneagent

import android.app.Application

class PhoneAgentApp : Application() {
    companion object {
        lateinit var instance: PhoneAgentApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }
}
```

- [ ] **BootReceiver.kt**

```kotlin
package com.avatar.phoneagent.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
```

---

### Task 10: SetupActivity (Compose UI)

**Files:**
- Create: `phone-agent-apk/app/src/main/java/com/avatar/phoneagent/setup/SetupActivity.kt`

```kotlin
package com.avatar.phoneagent.setup

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("Phone Agent", style = MaterialTheme.typography.headlineMedium)

                    // 平台选择
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
                                    onClick = { platform = key; expanded = false }
                                )
                            }
                        }
                    }

                    // 设备ID
                    OutlinedTextField(
                        value = phoneId,
                        onValueChange = { phoneId = it },
                        label = { Text("设备 ID") }
                    )

                    // 服务器地址
                    OutlinedTextField(
                        value = broker,
                        onValueChange = { broker = it },
                        label = { Text("MQTT Broker") }
                    )

                    Divider()

                    // 依赖状态检查
                    Text("依赖检查", style = MaterialTheme.typography.titleMedium)

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val ok = isAccessibilityEnabled()
                        a11yOk = ok
                        Text(if (ok) "✅" else "❌")
                        Spacer(Modifier.width(8.dp))
                        Text("无障碍服务")
                        Spacer(Modifier.weight(1f))
                        if (!ok) {
                            TextButton(onClick = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) {
                                Text("去开启")
                            }
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
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

                    Row(verticalAlignment = Alignment.CenterVertically) {
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

                    Divider()

                    // 开始/停止按钮
                    val allReady = a11yOk && tsInstalled && vpnOk
                    Button(
                        onClick = {
                            if (isRunning) {
                                stopService(Intent(this@SetupActivity, AgentForegroundService::class.java))
                                isRunning = false
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
                    }
                }
            }
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val services = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        )
        return services.any { it.resolveInfo.serviceInfo.packageName == packageName }
    }

    override fun onResume() {
        super.onResume()
        val tm = TailscaleManager(this)
        if (tm.isInstalled() && tm.isVpnConnected()) {
            // 刷新 UI 状态
        }
    }
}
```

---

### Task 11: 资源文件

**Files:**
- Create: `phone-agent-apk/app/src/main/res/values/strings.xml`
- Create: `phone-agent-apk/app/src/main/res/values/themes.xml`

- [ ] **strings.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Phone Agent</string>
    <string name="accessibility_service_desc">Phone Agent 需要无障碍服务权限来模拟触控操作，用于自动发布视频到短视频平台。</string>
</resources>
```

- [ ] **themes.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.PhoneAgent" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
```

---

## Phase 7: 验证

### Task 12: 编译 + 验证

```bash
# 1. 编译
cd phone-agent-apk
./gradlew assembleDebug

# 2. 检查 APK 生成
ls app/build/outputs/apk/debug/app-debug.apk

# 3. 安装到手机
adb install app/build/outputs/apk/debug/app-debug.apk

# 4. 验证流程：
#    - 打开 App → 看到 SetupActivity UI
#    - 查看下拉框、输入框、状态灯
#    - 点击"无障碍服务 → 去开启" → 跳到系统设置
#    - 点击"Tailscale" → 安装/打开 Tailscale
#    - 连接 VPN 后 ✅ 亮起
#    - 点击"开始运行" → 通知栏出现通知
#    - 服务器 mosquitto_sub 看到心跳
#    - 发一条 task JSON → 手机收到并执行
```

---

## 文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| settings.gradle.kts | 15 | Gradle 设置 |
| build.gradle.kts (root) | 5 | 根构建脚本 |
| gradle.properties | 4 | Gradle 属性 |
| gradle-wrapper.properties | 5 | Wrapper 配置 |
| app/build.gradle.kts | 55 | 依赖声明 |
| AndroidManifest.xml | 55 | 权限+组件声明 |
| accessibility_service_config.xml | 10 | 无障碍服务配置 |
| CameraAccessibilityService.kt | 90 | 触控注入 |
| TailscaleManager.kt | 55 | VPN 检测 |
| AgentForegroundService.kt | 210 | MQTT+任务处理 |
| VideoDownloader.kt | 35 | 视频下载 |
| ActionEngine.kt | 85 | JSON→触控执行 |
| PhoneAgentApp.kt | 15 | Application |
| BootReceiver.kt | 35 | 开机自启 |
| SetupActivity.kt | 170 | Compose UI |
| strings.xml | 5 | 字符串资源 |
| themes.xml | 5 | 主题 |

**共 17 文件，约 850 行 Kotlin**
