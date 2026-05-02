# Phone Agent 手机端自动控制方案 v3

> 日期：2026-04-29
> 项目：avatar-ai-video
> 版本：v3 — 原生 Android APK 方案

---

## 1. 概述

### 1.1 目标

将手机端 Agent 打包为独立 APK，打开后自动检测环境、引导授权、连接服务器，后台常驻，接收 MQTT 任务并自动操作短视频 App（抖音/快手/小红书）完成视频发布。**无需 Termux、无需 Root、无需手动装任何依赖。**

### 1.2 核心能力

| 能力 | 实现方式 |
|------|---------|
| 触控注入 | AccessibilityService dispatchGesture（无需 Root） |
| 文字输入 | ACTION_SET_TEXT / Clipboard 粘贴（无需 Root） |
| 系统按键 | performGlobalAction (BACK / HOME) |
| App 启动 | PackageManager.getLaunchIntentForPackage |
| 截图 | MediaProjection + ImageReader |
| VPN 连接 | Tailscale App + Local API 状态检测 |
| 服务器通信 | Paho MQTT (tcp://) |
| 视频下载 | OkHttp → /sdcard/videos/ |
| 后台保活 | Foreground Service (START_STICKY) + 通知栏 |
| 开机自启 | BOOT_COMPLETED 广播接收器 |

---

## 2. 技术栈

| 维度 | 选型 |
|------|------|
| 语言 | Kotlin |
| UI | Jetpack Compose |
| MQTT | Eclipse Paho (org.eclipse.paho.client.mqttv3:1.2.5) |
| HTTP 下载 | OkHttp 4.12.0 |
| 后台任务 | Foreground Service + WorkManager |
| VPN | Tailscale App (com.tailscale.ipn) |
| 最低 SDK | Android 7.0 (API 24) |
| 目标 SDK | Android 14 (API 34) |

---

## 3. 触控注入方案（无 Root）

### 3.1 Android AccessibilityService

`CameraAccessibilityService` 继承 `AccessibilityService`，在 `onServiceConnected` 时注册自身为单例，供全局调用。

```kotlin
class CameraAccessibilityService : AccessibilityService() {
    companion object {
        var instance: CameraAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }
}
```

### 3.2 点击 (tap)

```kotlin
fun tap(x: Float, y: Float) {
    val path = Path().apply { moveTo(x, y) }
    val gesture = GestureDescription.Builder()
        .addStroke(GestureDescription.StrokeDescription(path, 0, 1))
        .build()
    dispatchGesture(gesture, null, null)
}
```

原理：dispatchGesture 发送一个持续 1ms 的触摸手势（起点=终点，即点击）。Android 7.0+ 原生支持，不需要 Root。

### 3.3 长按 (longPress)

```kotlin
fun longPress(x: Float, y: Float, durationMs: Long = 500) {
    val path = Path().apply { moveTo(x, y) }
    val gesture = GestureDescription.Builder()
        .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
        .build()
    dispatchGesture(gesture, null, null)
}
```

### 3.4 滑动 (swipe)

```kotlin
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
```

### 3.5 输入文字 (inputText)

双策略：优先用 `ACTION_SET_TEXT` 直接设值到焦点输入框；如果没有焦点元素，则通过剪贴板粘贴。

```kotlin
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
```

### 3.6 系统按键

```kotlin
fun pressBack() {
    performGlobalAction(GLOBAL_ACTION_BACK)
}

fun pressHome() {
    performGlobalAction(GLOBAL_ACTION_HOME)
}
```

### 3.7 启动 App

```kotlin
fun launchApp(packageName: String) {
    val intent = packageManager.getLaunchIntentForPackage(packageName)
    if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        startActivity(intent)
    }
}
```

### 3.8 API 总结

| 操作 | API | 是否需要 Root |
|------|-----|--------------|
| 点击 | dispatchGesture (1ms tap) | 不需要 |
| 长按 | dispatchGesture (500ms hold) | 不需要 |
| 滑动 | dispatchGesture (Path) | 不需要 |
| 输入文字 | ACTION_SET_TEXT / ACTION_PASTE | 不需要 |
| 返回键 | performGlobalAction(BACK) | 不需要 |
| Home 键 | performGlobalAction(HOME) | 不需要 |
| 启动 App | PackageManager.launchIntent | 不需要 |
| 截图 | MediaProjection（需一次授权） | 不需要 |

---

## 4. MQTT 通信协议

### 4.1 Topic 设计

| Topic | 方向 | QoS | 说明 |
|-------|------|-----|------|
| `phone/{phone_id}/task` | 服务器 → 手机 | 1 | 发布任务 JSON |
| `phone/{phone_id}/status` | 手机 → 服务器 | 1 | 状态上报 JSON |
| `phone/{phone_id}/heartbeat` | 手机 → 服务器 | 0 | 30 秒心跳 JSON |
| `phone/{phone_id}/cmd` | 服务器 → 手机 | 1 | 控制指令 (restart) |

### 4.2 消息格式

**task（服务器 → 手机）**

```json
{
  "task_id": "task_20260429_001",
  "platform": "douyin",
  "priority": "normal",
  "video": {
    "url": "https://minio.xxx.com/videos/output_001.mp4?sign=xxx",
    "md5": "a1b2c3d4",
    "size_mb": 35.2
  },
  "metadata": {
    "title": "今天的AI视频",
    "tags": ["#AI", "#科技"],
    "description": "自动生成内容"
  },
  "actions": [
    { "type": "launch", "package": "com.ss.android.ugc.aweme" },
    { "type": "wait", "ms": 3000 },
    { "type": "tap", "x": 540, "y": 2200 },
    { "type": "wait", "ms": 1500 },
    { "type": "input_text", "content": "{{title}}" },
    { "type": "tap", "x": 1000, "y": 2200 },
    { "type": "wait", "ms": 8000 },
    { "type": "screenshot", "name": "publish_result" }
  ],
  "params": {}
}
```

**status（手机 → 服务器）**

```json
{
  "task_id": "task_20260429_001",
  "phone_id": "phone_01",
  "platform": "douyin",
  "status": "downloading|publishing|success|failed",
  "step": "download",
  "error": null,
  "screenshots": [],
  "timestamp": 1714387200
}
```

**heartbeat（手机 → 服务器）**

```json
{
  "phone_id": "phone_01",
  "battery": 85,
  "timestamp": 1714387200
}
```

### 4.3 Paho MQTT 客户端配置

```kotlin
val client = MqttAsyncClient(brokerUrl, "agent-$phoneId", MemoryPersistence())

val opts = MqttConnectOptions().apply {
    isCleanSession = true
    connectionTimeout = 10
    keepAliveInterval = 30
    isAutomaticReconnect = false  // 手动控制重连以避免重复订阅
}
```

**断线重连策略**：`connectionLost` 回调中延迟 5 秒后重新调用 `connectMqtt()`。

**心跳**：`Handler.postDelayed` 每 30 秒发布一次 `phone/{id}/heartbeat`。

---

## 5. Action 执行引擎

### 5.1 支持的 Action 类型

| type | 参数 | 说明 |
|------|------|------|
| `launch` | `package` (String) | 启动 App |
| `tap` | `x, y` (Float) | 点击坐标 |
| `swipe` | `x1, y1, x2, y2, duration` | 滑动 |
| `wait` | `ms` (Long) | 等待毫秒 |
| `input_text` | `content, [x, y]` | 输入文字（可选先点击定位输入框）|
| `screenshot` | `name` (String) | 截图并记录路径 |
| `back` | — | 按返回键 |
| `home` | — | 按 Home 键 |

### 5.2 模板变量

所有字符串字段支持 `{{variable}}` 模板变量，执行时从 `params` 中替换。

```kotlin
private fun resolve(template: String, params: Map<String, String>): String {
    val regex = Regex("\\{\\{(\\w+)}}")
    return regex.replace(template) { match ->
        params[match.groupValues[1]] ?: match.value
    }
}
```

### 5.3 执行流程

```
收到 task JSON
    │
    ▼
1. VideoDownloader.download(videoUrl, taskId)
    │ → /sdcard/videos/{taskId}.mp4
    ▼
2. 设置 params = { video_path, title, description, ... }
    │
    ▼
3. 遍历 actions[]
    │
    ├─ launch → AccessibilityService.launchApp(pkg)
    ├─ tap → dispatchGesture(1ms tap)
    ├─ swipe → dispatchGesture(Path)
    ├─ wait → Thread.sleep(ms)
    ├─ input_text → ACTION_SET_TEXT / ACTION_PASTE
    ├─ screenshot → 记录路径
    ├─ back → performGlobalAction(BACK)
    └─ home → performGlobalAction(HOME)
    │
    ▼
4. 上报 success / failed → MQTT status topic
```

---

## 6. VPN 自动连接（Tailscale）

### 6.1 检测流程

App 打开后自动检测 Tailscale 状态：

```
检查 Tailscale 已安装？
    ├─ 否 → 引导跳 Play Store 安装
    └─ 是 → 检查 VPN 已连接？
            ├─ 是 → ✅
            └─ 否 → 打开 Tailscale App → 用户点一次系统 VPN 授权
                    └─ 轮询 http://100.100.100.100/localapi/v0/status
                        └─ 最多等 120 秒 → 超时提示手动连接
```

### 6.2 Tailscale Local API

Tailscale 在每台设备上运行一个本地 HTTP API，地址固定为 `http://100.100.100.100`。VPN 连接成功后，调用 `/localapi/v0/status` 返回 200。

```kotlin
fun checkApi(): Boolean {
    return try {
        val conn = URL("http://100.100.100.100/localapi/v0/status")
            .openConnection() as HttpURLConnection
        conn.connectTimeout = 2000
        conn.readTimeout = 2000
        conn.responseCode == 200
    } catch (e: Exception) {
        false
    }
}

suspend fun waitForVpn(): Boolean {
    return withTimeoutOrNull(120_000) {
        while (!checkApi()) { delay(2000) }
        true
    } ?: false
}
```

### 6.3 为什么是 Tailscale 而不是 WireGuard

| 方案 | 自动化程度 | 缺点 |
|------|-----------|------|
| Tailscale | 需手动点一次系统 VPN 授权 | 之后全自动，有免费套餐 |
| WireGuard | 配置文件自动连 | 需要自建服务器打洞，维护成本高 |

选择 Tailscale：一次 VPN 授权后可完全自动化，无需自建中继。

---

## 7. 后台保活 + 开机自启

### 7.1 Foreground Service

`AgentForegroundService` 继承 `Service`，调用 `startForeground()` 生成常驻通知栏，返回 `START_STICKY` 确保被系统杀后自动重启。

```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification("连接中..."))
    connectMqtt()
    return START_STICKY
}
```

通知栏显示内容：
- 连接中... → MQTT 连接成功 → 运行中 · 抖音
- 通知栏可点击返回 SetupActivity
- Android 13+ 需要在 Manifest 中声明 `FOREGROUND_SERVICE_DATA_SYNC`

### 7.2 开机自启

```kotlin
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("agent_prefs", MODE_PRIVATE)
            val wasRunning = prefs.getBoolean("was_running", false)
            if (wasRunning) {
                // 重新启动 Foreground Service
                val serviceIntent = Intent(context, AgentForegroundService::class.java)
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
```

Manifest 声明：
```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<receiver android:name=".receiver.BootReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

---

## 8. 视频下载

```kotlin
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
        // ... stream → FileOutputStream
        return file.absolutePath
    }
}
```

输出路径：`/sdcard/videos/{taskId}.mp4`

---

## 9. 用户交互流程

### 9.1 SetupActivity UI

Jetpack Compose 单页 UI，包含：

1. **平台选择下拉框**：抖音 / 快手 / 小红书
2. **设备 ID 输入框**：默认 phone_01
3. **服务器地址输入框**：默认 tcp://100.64.0.1:1883
4. **三盏状态灯**：
   - 无障碍服务 ✅/❌ + 跳转系统设置按钮
   - Tailscale 安装 ✅/❌ + 跳 Play Store 按钮
   - VPN 连接 ✅/❌ + 连接按钮
5. **开始/停止按钮**：全绿才能点，点击后最小化到后台

### 9.2 需要手动授权的三项（各一次）

| 授权 | 时机 | 操作 |
|------|------|------|
| 无障碍服务 | 首次打开 App | 点「去开启」→ 系统无障碍设置中打开开关 |
| VPN | Tailscale 首次连接 | 系统弹出 VPN 授权确认框 → 点「确定」 |
| 通知 | Android 13+ | 系统弹出通知权限 → 点「允许」 |

**之后杀进程重启、开机自启均不再需要任何手动操作。**

### 9.3 完整用户流程

```
安装 APK → 打开 App
    │
    ▼
选择平台 + 输入设备ID + 输入服务器地址
    │
    ▼
依赖检查：
    ├─ ✅ 无障碍服务（或点「去开启」）
    ├─ ✅ Tailscale 安装（或点「安装」）
    └─ ✅ VPN 连接（或点「连接」→ 弹一次系统 VPN 授权）
    │
    ▼
全部 ✅ → 点「开始运行」
    │
    ▼
通知栏显示 "Phone Agent 运行中 · 抖音"
App 可关闭，服务继续后台运行
    │
    ▼
自动 MQTT 连接 → 心跳上报 → 等待任务
    │
    ▼
收到任务 → 下载视频 → 无障碍触控发布 → 上报结果
```

---

## 10. 任务处理完整时序

```
服务器                           手机 Agent
  │                                │
  ├── MQTT publish task ──────────▶│
  │                                ├─ 收到 task JSON
  │                                ├─ publish status: "downloading"
  │                                ├─ OkHttp GET video URL
  │                                ├─ 写入 /sdcard/videos/{taskId}.mp4
  │                                ├─ publish status: "publishing"
  │                                │
  │                                ├─ 遍历 actions[]:
  │                                │   ├─ launchApp("com.ss.android.ugc.aweme")
  │                                │   ├─ sleep(3000)
  │                                │   ├─ dispatchGesture tap(540, 2200)  // +号
  │                                │   ├─ sleep(1500)
  │                                │   ├─ dispatchGesture tap(540, 1900)  // 选视频
  │                                │   ├─ sleep(2000)
  │                                │   ├─ tap(540, 500) → inputText(title)
  │                                │   ├─ dispatchGesture tap(1000, 2200)  // 发布
  │                                │   └─ sleep(8000)
  │                                │
  │                                ├─ publish status: "success"
  │  ◀── MQTT status "success" ───┤
  │                                │
```

---

## 11. 安全与权限

### 11.1 需要的权限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

### 11.2 安全措施

| 措施 | 说明 |
|------|------|
| MQTT Topic 隔离 | 每台手机独立 topic `phone/{id}/*` |
| Tailscale VPN | 手机与服务器在加密虚拟内网通信 |
| 不暴露本地端口 | 手机不开任何监听端口，纯 MQTT 客户端 |
| 敏感配置存 SharedPreferences | 设备 ID、服务器地址、平台选择 |

---

## 12. 发布流程模板

### 12.1 抖音

```json
{
  "platform": "douyin",
  "appPackage": "com.ss.android.ugc.aweme",
  "actions": [
    { "type": "launch", "package": "com.ss.android.ugc.aweme" },
    { "type": "wait", "ms": 3000 },
    { "type": "tap", "x": 540, "y": 2200, "desc": "点击+号创建" },
    { "type": "wait", "ms": 1500 },
    { "type": "tap", "x": 540, "y": 1900, "desc": "选择视频" },
    { "type": "wait", "ms": 2000 },
    { "type": "input_text", "x": 540, "y": 500, "content": "{{title}}" },
    { "type": "wait", "ms": 500 },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "点击发布" },
    { "type": "wait", "ms": 8000 },
    { "type": "screenshot", "name": "publish_result" }
  ]
}
```

### 12.2 快手

```json
{
  "platform": "kuaishou",
  "appPackage": "com.smile.gifmaker",
  "actions": [
    { "type": "launch", "package": "com.smile.gifmaker" },
    { "type": "wait", "ms": 3000 },
    { "type": "tap", "x": 540, "y": 2200, "desc": "点击拍摄按钮" },
    { "type": "wait", "ms": 1500 },
    { "type": "tap", "x": 540, "y": 1800, "desc": "从相册选择" },
    { "type": "wait", "ms": 2000 },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "下一步" },
    { "type": "wait", "ms": 1000 },
    { "type": "input_text", "x": 540, "y": 300, "content": "{{title}}" },
    { "type": "wait", "ms": 500 },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "发布" },
    { "type": "wait", "ms": 8000 },
    { "type": "screenshot", "name": "publish_result" }
  ]
}
```

### 12.3 小红书

```json
{
  "platform": "xiaohongshu",
  "appPackage": "com.xingin.xhs",
  "actions": [
    { "type": "launch", "package": "com.xingin.xhs" },
    { "type": "wait", "ms": 3000 },
    { "type": "tap", "x": 540, "y": 2200, "desc": "点击+号" },
    { "type": "wait", "ms": 1500 },
    { "type": "tap", "x": 540, "y": 1800, "desc": "选择视频" },
    { "type": "wait", "ms": 2000 },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "下一步" },
    { "type": "wait", "ms": 1000 },
    { "type": "input_text", "x": 540, "y": 500, "content": "{{title}}" },
    { "type": "input_text", "x": 540, "y": 800, "content": "{{description}}" },
    { "type": "wait", "ms": 500 },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "发布笔记" },
    { "type": "wait", "ms": 8000 },
    { "type": "screenshot", "name": "publish_result" }
  ]
}
```

> 注：以上坐标为 1080×2400 分辨率参考值，实际可能需要根据手机屏幕分辨率调整。

---

## 13. 文件映射

```
phone-agent-apk/
├── build.gradle.kts                              ← 根构建脚本
├── settings.gradle.kts                            ← Gradle 模块声明
├── gradle.properties                              ← Gradle 属性
├── gradle/wrapper/gradle-wrapper.properties       ← Gradle Wrapper 配置
├── .gitignore                                     ← Android 忽略规则
└── app/
    ├── build.gradle.kts                           ← 依赖声明
    ├── proguard-rules.pro                         ← ProGuard 规则（保活 Paho + JSON）
    └── src/main/
        ├── AndroidManifest.xml                    ← 权限/组件声明
        ├── java/com/avatar/phoneagent/
        │   ├── PhoneAgentApp.kt                   ← Application 类
        │   ├── accessibility/
        │   │   └── CameraAccessibilityService.kt  ← 触控注入核心
        │   ├── engine/
        │   │   ├── ActionEngine.kt                ← JSON actions 解析执行
        │   │   └── VideoDownloader.kt             ← OkHttp 视频下载
        │   ├── service/
        │   │   └── AgentForegroundService.kt      ← MQTT + 心跳 + 任务处理
        │   ├── vpn/
        │   │   └── TailscaleManager.kt            ← VPN 检测与引导
        │   ├── setup/
        │   │   └── SetupActivity.kt               ← Compose UI 设置页
        │   └── receiver/
        │       └── BootReceiver.kt                ← 开机自启
        ├── res/
        │   ├── values/
        │   │   ├── strings.xml                    ← 字符串资源
        │   │   └── themes.xml                     ← 主题
        │   └── xml/
        │       └── accessibility_service_config.xml ← 无障碍服务配置
        └── ...
```

---

## 14. 已知局限与后续优化

| 局限 | 说明 | 后续方向 |
|------|------|---------|
| 坐标硬编码 | 发布流程坐标基于固定分辨率 | 加 UI 树遍历自动定位元素 |
| 视频选择 | 目前无法自动从相册选择特定视频 | 发 intent 指定 content:// URI |
| 截图 | MediaProjection 弹窗需手动确认一次 | 研究无障碍截图替代方案 |
| 风控 | 平台可能检测自动化行为 | 加随机延迟 + 滑动轨迹模拟 |
| 后台被杀 | 国产 ROM 可能杀后台 | 引导用户加入白名单 + 电池优化豁免 |
