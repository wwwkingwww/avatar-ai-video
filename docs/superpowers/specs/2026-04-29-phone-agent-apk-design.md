# Phone Agent APK 设计方案

> 日期：2026-04-29
> 项目：avatar-ai-video
> 前提：将现有 phone-agent/ Node.js 脚本升级为原生 Android APK，零外部依赖，安装即用

---

## 1. 目标

把手机端 Agent 打包成一个独立 APK，打开后自动检测环境、引导授权、连接服务器，后台常驻执行发布任务。无需 Termux、无需 Root、无需手动装任何依赖。

## 2. 技术选型

| 维度 | 选型 |
|------|------|
| 语言 | Kotlin |
| UI | Jetpack Compose |
| MQTT | Eclipse Paho (org.eclipse.paho.client.mqttv3) |
| VPN | Tailscale App + Tailscale Local API 状态检测 |
| 触控 | AccessibilityService dispatchGesture / performAction |
| 截图 | MediaProjection + ImageReader |
| 后台 | Foreground Service + WorkManager |
| 下载 | OkHttp |
| 最低 SDK | Android 7.0 (API 24) |
| 目标 SDK | Android 14 (API 34) |

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│                    phone-agent.apk                       │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │  SetupActivity       │  │    AgentForegroundService  │ │
│  │  (Jetpack Compose)   │  │    (通知栏常驻 + START_STICKY) │
│  │                      │  │                            │ │
│  │  · 平台选择下拉框     │  │  ┌───────────────────────┐ │ │
│  │  · 设备ID输入        │  │  │ Paho MqttAsyncClient   │ │ │
│  │  · 服务器IP          │  │  │                        │ │ │
│  │  · 依赖状态灯        │  │  │ subscribe phone/{id}/task │
│  │    ├ 无障碍服务       │  │  │ publish  phone/{id}/status│
│  │    ├ Tailscale 安装  │  │  │ publish  phone/{id}/heartbeat│
│  │    ├ VPN 连接        │  │  │                        │ │ │
│  │    └ MQTT 可达       │  │  └───────┬───────────────┘ │ │
│  │  · [开始运行] 按钮    │  │          │                 │ │
│  └──────────┬──────────┘  │  ┌───────┴───────────────┐ │ │
│             │              │  │ TaskHandler            │ │ │
│             │  startService│  │                        │ │ │
│             └──────────────▶  │ 1. VideoDownloader     │ │ │
│                               │    (OkHttp → /sdcard/) │ │ │
│                               │ 2. ActionEngine        │ │ │
│                               │    (JSON → 触控调用)    │ │ │
│                               │ 3. 上报 success/failed │ │ │
│                               └───────┬───────────────┘ │ │
│                                       │                 │ │
│  ┌────────────────────────────────────┼───────────────┐ │ │
│  │  CameraAccessibilityService        │               │ │ │
│  │  (android:accessibilityService)    │               │ │ │
│  │                                    │               │ │ │
│  │  · dispatchGesture()  → tap/swipe │               │ │ │
│  │  · performAction()    → inputText │               │ │ │
│  │  · performGlobalAction() → back/home  │           │ │ │
│  │  · PackageManager     → launchApp │               │ │ │
│  └────────────────────────────────────┘               │ │
│                                                        │ │
│  ┌──────────────────────────────────────────────────┐ │ │
│  │  TailscaleManager                                 │ │ │
│  │  · isInstalled()         检查 Tailscale App       │ │ │
│  │  · promptSetup()          引导安装/授权           │ │ │
│  │  · waitForVpn()           轮询 localapi 等连接    │ │ │
│  │  · checkApi()             GET 100.100.100.100     │ │ │
│  └──────────────────────────────────────────────────┘ │ │
│                                                        │ │
│  ┌──────────────────────────────────────────────────┐ │ │
│  │  ScreenshotCapture                                │ │ │
│  │  · MediaProjectionManager.createScreenCapture()   │ │ │
│  │  · ImageReader → Bitmap → File → MinIO upload     │ │ │
│  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  BootReceiver (BOOT_COMPLETED → startService)       │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 4. 用户流程

```
用户安装 APK
     │
     ▼
打开 App → SetupActivity
     │
     ├─ 选择平台（抖音/快手/小红书）
     ├─ 输入设备ID（phone_01）
     ├─ 输入服务器地址（100.64.0.1）
     │
     ▼
依赖检查（自动）
     │
     ├─ ❌ 无障碍服务未开启 → 点击「去开启」→ 跳系统设置
     ├─ ❌ Tailscale 未安装 → 点击「安装」→ 跳 Play Store
     ├─ ❌ VPN 未连接 → 打开 Tailscale App → 用户点一次授权
     │                   └─ 等待 ≤2min → 自动检测连通
     ├─ ❌ MQTT 不可达 → 等待重试
     │
     ▼
全部 ✅ → 「开始运行」按钮亮起
     │
     ▼
点击 → 最小化到后台 → 通知栏显示 "Phone Agent 运行中"
     │
     ▼
后续完全自动：
  · 30s 心跳上报
  · 收到 task → 下载视频 → 注入触控 → 上报结果
  · 断线自动重连
  · 任务失败自动上报
  · 开机自启
```

### 需要手动授权的三项（各一次）

| 授权 | 时机 | 说明 |
|------|------|------|
| 无障碍服务 | 首次打开 App | 跳系统设置页，用户开关一次 |
| VPN | Tailscale 首次连接 | 跳 Tailscale App，弹系统 VPN 授权框 |
| 屏幕录制 | 首次截图时 | MediaProjection 系统弹窗，确认一次 |

之后杀进程重启均不再弹窗。

## 5. AccessibilityService 触控 API

| 操作 | API | 说明 |
|------|-----|------|
| tap(x, y) | dispatchGesture(0→1ms tap) | 点击 |
| longPress(x, y) | dispatchGesture(0→500ms hold) | 长按 |
| swipe(x1,y1,x2,y2) | dispatchGesture(Path) | 滑动 |
| inputText(text) | ACTION_SET_TEXT / ACTION_PASTE | 输入 |
| pressBack() | performGlobalAction(BACK) | 返回 |
| pressHome() | performGlobalAction(HOME) | 桌面 |
| launchApp(pkg) | PackageManager.getLaunchIntent | 启动 |

## 6. MQTT 通信

复用现有 `shared/mqtt-protocol.js` 的 topic 和消息格式，Kotlin 侧按相同 JSON 结构收发。

| Topic | 方向 | 说明 |
|-------|------|------|
| phone/{id}/task | 服→机 | 发布任务 JSON |
| phone/{id}/status | 机→服 | 状态上报 JSON |
| phone/{id}/heartbeat | 机→服 | 30s 心跳 JSON |
| phone/{id}/cmd | 服→机 | 控制指令 JSON |

## 7. 文件结构

```
phone-agent-apk/
├── build.gradle.kts
├── app/
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/avatar/phoneagent/
│       │   ├── PhoneAgentApp.kt            ← Application
│       │   ├── setup/
│       │   │   └── SetupActivity.kt         ← Compose UI
│       │   ├── service/
│       │   │   ├── AgentForegroundService.kt
│       │   │   └── MqttService.kt
│       │   ├── accessibility/
│       │   │   └── CameraAccessibilityService.kt
│       │   ├── engine/
│       │   │   ├── ActionEngine.kt
│       │   │   └── VideoDownloader.kt
│       │   ├── vpn/
│       │   │   └── TailscaleManager.kt
│       │   ├── capture/
│       │   │   └── ScreenshotCapture.kt
│       │   └── receiver/
│       │       └── BootReceiver.kt
│       ├── res/
│       │   ├── xml/
│       │   │   └── accessibility_service_config.xml
│       │   └── drawable/
│       │       └── ic_notification.xml
│       └── values/
│           └── strings.xml
```

## 8. 验证方案

| 阶段 | 验证项 | 方法 |
|------|--------|------|
| 编译 | ./gradlew assembleDebug | APK 生成成功 |
| UI | 打开 APK → 选择平台 → 输入ID | Compose 页面正常渲染 |
| 无障碍 | 打开系统无障碍设置 → 开启服务 | 服务 onServiceConnected 回调 |
| 触控 | 发 tap(540,2200) | 目标元素被点击 |
| VPN | 引导安装 Tailscale → 连 VPN | TailscaleManager.checkApi() == true |
| MQTT | 启动服务 → 心跳上报 | mosquitto_sub 看到 heartbeat |
| 任务 | 发 task JSON → 模拟执行 | status topic 收到 success |
| 截图 | 触发 screenshot action | 文件写入 /sdcard/screenshots/ |
| 自启 | 重启手机 | 通知栏出现 "运行中" |
