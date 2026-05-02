# Phone Control 2 — 手机自动控制系统技术文档

> avatar-ai-video 项目中手机端自动控制系统的完整技术文档。
> 涵盖三种手机端实现（Termux Node.js Agent / Server ADB Bridge / Android 原生 APK）、
> MQTT 通信协议、服务端调度层、动作执行引擎、运维监控等全部细节。

---

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [核心协议层 — MQTT Protocol](#2-核心协议层--mqtt-protocol)
3. [通道一：phone-agent (Node.js + Termux)](#3-通道一phone-agent-nodejs--termux)
4. [通道二：server-bridge (Windows ADB)](#4-通道二server-bridge-windows-adb)
5. [通道三：phone-agent-apk (Android 原生)](#5-通道三phone-agent-apk-android-原生)
6. [服务端调度层](#6-服务端调度层)
7. [平台动作模板](#7-平台动作模板)
8. [完整数据流：一次任务的全生命周期](#8-完整数据流一次任务的全生命周期)
9. [三种通道对比](#9-三种通道对比)
10. [命令与控制（CMD 通道）](#10-命令与控制cmd-通道)
11. [运维监控](#11-运维监控)
12. [文件地图](#12-文件地图)

---

## 1. 系统架构总览

整个手机控制系统由 **三种手机端实现** + **一套 MQTT 协议** + **两种服务端调度器** 构成。

### 1.1 网络拓扑

```
Windows 宿主机 (100.79.18.62)
├── MQTT Broker (mosquitto:1883)
├── creator-api (3099) — 提供 /phone-files 静态文件服务
├── server-bridge.cjs — 服务器端 ADB 桥接
│
│   Tailscale VPN
│         │
┌────────▼────────┐
│  Android 手机     │
│  IP: 100.x.x.x   │
│                  │
│  运行方式:        │
│  ├── Termux → agent.js
│  └── APK → AgentForegroundService
└─────────────────┘
```

### 1.2 三种手机端通道

| 通道 | 运行位置 | 自动化方式 | 实现语言 |
|------|---------|-----------|---------|
| phone-agent | 手机 Termux | ADB 优先 → HTTP fallback 到无障碍服务 | Node.js (ESM) |
| server-bridge | Windows 服务器 | ADB over TCP/IP 远程控制 | Node.js (CommonJS) |
| phone-agent-apk | Android APK | AccessibilityService 无障碍 | Kotlin |

---

## 2. 核心协议层 — MQTT Protocol

> 文件：[shared/mqtt-protocol.js](shared/mqtt-protocol.js)

### 2.1 MQTT 主题定义

```javascript
TOPICS.TASK(phoneId)      → "phone/{phoneId}/task"       // 服务端 → 手机：下发任务
TOPICS.STATUS(phoneId)    → "phone/{phoneId}/status"      // 手机 → 服务端：回报状态
TOPICS.HEARTBEAT(phoneId) → "phone/{phoneId}/heartbeat"   // 手机 → 服务端：心跳
TOPICS.CMD(phoneId)       → "phone/{phoneId}/cmd"         // 服务端 → 手机：控制命令
```

**主题通配符订阅**（服务端使用）：
- `phone/+/heartbeat` — 收集所有设备心跳
- `phone/+/status` — 监听所有设备任务状态

### 2.2 任务状态常量

| 常量 | 值 | 含义 |
|------|------|------|
| `DOWNLOADING` | `downloading` | 正在下载视频文件到手机本地 |
| `PUBLISHING` | `publishing` | 正在执行自动化发布动作 |
| `SUCCESS` | `success` | 任务执行成功 |
| `FAILED` | `failed` | 任务执行失败 |

### 2.3 动作类型枚举

```javascript
ACTION_TYPES = ['launch', 'tap', 'swipe', 'wait', 'input_text', 'screenshot', 'back', 'home']
```

| 动作 | 参数 | 说明 |
|------|------|------|
| `launch` | `package` | 启动指定包名的 App |
| `tap` | `x`, `y` | 点击屏幕坐标 |
| `swipe` | `x1`, `y1`, `x2`, `y2`, `duration` | 滑动操作 |
| `wait` | `ms` | 等待指定毫秒数 |
| `input_text` | `text` / `content` | 输入文本，可选 `x`,`y` 先聚焦再输入 |
| `screenshot` | `name` | 截屏保存 |
| `back` | — | 返回键 |
| `home` | — | Home 键 |

### 2.4 支持的平台

```javascript
PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu']
```

### 2.5 协议校验函数

**validateTaskPayload(payload)** — 校验任务体：
- 必须包含 `task_id`、`platform`、`video.url`、`actions`（非空数组）
- `actions` 中每个元素的 `type` 必须在 `ACTION_TYPES` 中

**validateStatusPayload(payload)** — 校验状态体：
- 必须包含 `task_id`、`phone_id`、`status`
- `status` 必须为合法值

---

## 3. 通道一：phone-agent (Node.js + Termux)

> 目录：`phone-agent/`  
> 运行环境：Android Termux  
> 启动方式：`bash start.sh`

### 3.1 agent.js — 主 Agent 入口

**文件**：[phone-agent/agent.js](phone-agent/agent.js)

**启动流程**：
1. 从环境变量读取 `MQTT_BROKER`、`PHONE_ID`、`PLATFORMS`
2. 连接 MQTT Broker（clientId = `agent-{PHONE_ID}`）
3. 订阅 `phone/{PHONE_ID}/task`（QoS 1）和 `phone/{PHONE_ID}/cmd`（QoS 1）
4. 上线发布 `phone/{PHONE_ID}/status`（status='online', source='agent'）
5. 每 30 秒发布一次心跳 `phone/{PHONE_ID}/heartbeat`

**任务处理流程** [handleTask(task)]()：
```
1. validateTaskPayload(task) — 校验任务格式
2. publishStatus(taskId, 'downloading') — 上报"下载中"
3. downloadVideo(url, taskId) — 调用 file-downloader.js 下载视频
4. publishStatus(taskId, 'publishing') — 上报"发布中"
5. executeActions(task.actions, params) — 调用 action-engine.js 执行动作
6. publishStatus(taskId, 'success', {screenshots}) — 上报成功
```

**命令处理** [handleCommand(cmd)]()：

| 命令 | 效果 |
|------|------|
| `restart` | `process.exit(0)` 退出进程（由 run-loop.sh 自动重启） |
| `exec` | 执行任意 shell 命令并通过 MQTT 回报结果 |
| `reload` | 从服务器 `curl` 下载最新 JS 文件并自重启（热更新） |

**热更新机制**：
```javascript
// 从 creator-api 的 /phone-files 端点拉取最新代码
for (const f of files) {
  execSync(`curl -sLo ${f} ${server}/phone-files/${f}`, ...);
}
setTimeout(() => process.exit(0), 2000);  // 延迟退出让 curl 完成
```

### 3.2 adb-bridge.js — ADB 命令封装层

**文件**：[phone-agent/adb-bridge.js](phone-agent/adb-bridge.js)

**核心设计**：ADB 优先 + HTTP Fallback 双通道策略。

**ADB 状态机**（60 秒周期重试）：

```
状态: unknown → 尝试 ADB
  ├── 成功 → adbAvailable = true
  └── 失败 → adbAvailable = false
               └── 60 秒后 → 重新设置为 unknown → 重试
```

**ADB Serial 自动发现** [initAdbIfNeeded()]()：
- 运行 `adb devices` 找到已连接设备
- 优先本地设备（`127.0.0.1` 或 `localhost`）
- 无设备时自动尝试 `adb connect 127.0.0.1:5555`

**操作映射表**：

| 操作 | ADB 命令 | HTTP Fallback (127.0.0.1:9999) |
|------|---------|-------------------------------|
| **tap(x, y)** | `adb shell input tap x y` | `POST /tap {x, y}` |
| **swipe(x1,y1,x2,y2,dur)** | `adb shell input swipe x1 y1 x2 y2 dur` | `POST /swipe {x1,y1,x2,y2,duration}` |
| **inputText(text)** | `adb shell input text "..."` | `POST /input {text}` （先 base64 编码） |
| **launchApp(pkg)** | `adb shell monkey -p pkg -c android.intent.category.LAUNCHER 1` | `POST /launch {package}` |
| **screenshot(filename)** | `adb exec-out screencap -p > filename` | **无 fallback（直接失败）** |
| **keyEvent(key)** | `adb shell input keyevent N` | **无 fallback** |

### 3.3 action-engine.js — 动作执行引擎

**文件**：[phone-agent/action-engine.js](phone-agent/action-engine.js)

**作用**：解释执行动作序列，从 `adb-bridge.js` 导入底层函数，完全透明于 ADB/HTTP 切换。

**模板变量解析** [resolveTemplate(str, params)]()：
```javascript
// 支持 {{variable}} 语法
resolveTemplate('标题：{{title}}', {title: 'AI视频'})  → '标题：AI视频'
```

**动作执行细节**：

| 动作 | 实现 |
|------|------|
| `launch` | `launchApp(package)` |
| `tap` | `tap(x, y)` |
| `swipe` | `swipe(x1, y1, x2, y2, duration)` |
| `wait` | `await sleep(ms)` |
| `input_text` | 先 `tap(x, y)` 聚焦，再 `inputText(text/content)`，等 500ms |
| `screenshot` | `screenshot(name)` 保存到 `~/screenshots/name.png` |
| `back` | `keyEvent('back')` + 等 500ms |
| `home` | `keyEvent('home')` + 等 500ms |

### 3.4 file-downloader.js — 视频下载器

**文件**：[phone-agent/file-downloader.js](phone-agent/file-downloader.js)

**下载逻辑**：
- 保存路径：`$DOWNLOAD_DIR/{taskId}.{ext}`（默认 `~/videos/`）
- **去重**：`existsSync(filepath)` → 已存在直接返回路径，跳过下载
- 使用 Node.js 原生 `fetch` + stream pipeline
- 从 `Content-Type` 头提取扩展名（默认 `.mp4`）

### 3.5 server-bridge.cjs — 服务器端 ADB 桥接

**文件**：[phone-agent/server-bridge.cjs](phone-agent/server-bridge.cjs)

**与 agent.js 的关键差异**：

| 特性 | agent.js | server-bridge.cjs |
|------|----------|-------------------|
| 运行位置 | 手机 Termux | Windows 服务器 |
| 模块系统 | ESM | CommonJS (.cjs) |
| ADB 方式 | 本地 adb 命令 | `adb -s {PHONE_IP}` 远程连接 |
| 手机标识 | `PHONE_ID` | `BRIDGE_ID = PHONE_ID + '_bridge'` |
| source 字段 | `agent` | `bridge` |
| 心跳间隔 | 30 秒 | 10 秒 |
| 视频下载 | 有 | **无**（仅执行动作） |

**ADB 连接管理** [ensureConnected()]()：
- 缓存连接状态 `_connected`
- 断连时自动 `adb connect {PHONE_IP}`
- 每个任务执行前先调用 `ensureConnected()`

**电池信息采集** [getDeviceInfo()]()：
```javascript
// adb shell dumpsys battery → 解析 level 字段
// 返回 {model:'evergo-bridge', sdk:0, battery, adb:true}
```

### 3.6 task-templates.json — 浏览任务模板

**文件**：[phone-agent/task-templates.json](phone-agent/task-templates.json)

定义三个平台的"自动浏览"任务模板（模拟用户浏览行为）：

| 模板 ID | 平台 | 包名 | 默认浏览数 |
|---------|------|------|-----------|
| `browse_douyin` | 抖音 | `com.ss.android.ugc.aweme` | 5 |
| `browse_kuaishou` | 快手 | `com.kuaishou.nebula` | 5 |
| `browse_xiaohongshu` | 小红书 | `com.xingin.xhs` | 5 |

**行为逻辑**：启动 App → 循环浏览视频（随机停留 2-5 秒）→ 60% 概率点赞 → 上滑到下一个 → 完成后回到桌面。

### 3.7 运维脚本

| 脚本 | 作用 |
|------|------|
| `start.sh` | Termux 一键启动：npm install → 设置环境变量 → 启动 agent.js |
| `bootstrap.sh` | 自动安装：从服务器下载所有 JS 文件 → npm install → 启动 |
| `run-loop.sh` | 自重启包装器：无限循环运行 agent.js，退出后 2 秒自动重启 |
| `phone-test.cjs` | 连通性诊断：20+ 项测试（Node.js / ADB / 无障碍 / HTTP fallback） |

---

## 4. 通道二：server-bridge (Windows ADB)

已在 [3.5 节](#35-server-bridgecjs--服务器端-adb-桥接) 中与 agent.js 对比详述，核心特点：

- 运行在 Windows 服务器，通过 `adb connect {PHONE_IP}:5555` 远程控制
- 不需要 Termux，仅需手机开启"USB 调试"和"网络 ADB"
- source 标识为 `bridge`，通道优先级低于 `agent`
- 不支持视频下载，仅执行动作序列

---

## 5. 通道三：phone-agent-apk (Android 原生)

> 目录：`phone-agent-apk/`  
> 包名：`com.avatar.phoneagent`  
> 技术栈：Kotlin + Jetpack Compose + Eclipse Paho MQTT + OkHttp

### 5.1 组件架构

| 组件 | 类 | 作用 |
|------|------|------|
| **Activity** | `SetupActivity` | Compose 配置界面（平台选择/设备 ID/MQTT Broker） |
| **Service** | `AgentForegroundService` | 前台服务，常驻后台处理 MQTT 任务 |
| **Service** | `CameraAccessibilityService` | 无障碍服务，执行手势和输入 |
| **Receiver** | `BootReceiver` | 开机自启动 |

### 5.2 AndroidManifest 权限

```xml
INTERNET, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC,
POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED,
WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE
```

### 5.3 AgentForegroundService — 核心后台服务

**文件**：[AgentForegroundService.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/service/AgentForegroundService.kt)

**MQTT 连接配置**（Eclipse Paho）：
- Broker URL：默认 `tcp://100.64.0.1:1883`（可配置）
- ClientId：`agent-{phoneId}`
- 断连 5 秒自动重连
- KeepAlive 30 秒

**任务处理流程** [handleTask()]()：
```
1. 解析 task JSON → 提取 taskId, videoUrl, actions, metadata
2. publishStatus(taskId, "downloading")
3. 新线程执行：
   a. VideoDownloader.download(videoUrl, taskId)
   b. publishStatus(taskId, "publishing")
   c. waitForAccessibility() — 等待无障碍服务就绪（最多 5 秒）
   d. ActionEngine.execute(a11y, actions, params)
   e. publishStatus(taskId, "success", {screenshots})
```

**无障碍服务等待** [waitForAccessibility()]()：
- 轮询检查 `CameraAccessibilityService.instance != null`
- 同时确认系统无障碍开关已启用
- 最多重试 50 次 × 100ms = 5 秒超时

**心跳机制** [startHeartbeat()]()：
- 每 30 秒发布 `phone/{phoneId}/heartbeat`
- 包含字段：`phone_id`, `battery`, `a11y`, `timestamp`
- 无障碍断开时通知栏显示警告

### 5.4 CameraAccessibilityService — 无障碍手势服务

**文件**：[CameraAccessibilityService.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/accessibility/CameraAccessibilityService.kt)

**配置**（`accessibility_service_config.xml`）：
- 监听事件：窗口状态变化、内容变化、点击、焦点
- 关键标志：`canPerformGestures=true`, `canRetrieveWindowContent=true`
- 通知超时：50ms

**手势派发（带重试）** [dispatchGestureWithRetry()]()：
- 最大重试次数：`MAX_RETRIES = 2`
- 手势超时：`GESTURE_TIMEOUT_MS = 3000ms`
- 使用 `CountDownLatch` 同步等待手势完成/取消回调
- 失败重试间隔 100ms

**操作 API 实现方式**：

| 方法 | 实现 |
|------|------|
| `tap(x, y)` | `dispatchGesture` + `Path.moveTo` |
| `longPress(x, y, dur)` | `dispatchGesture` + duration |
| `swipe(x1, y1, x2, y2, dur)` | `dispatchGesture` + `Path.moveTo → lineTo` |
| `inputText(text)` | 优先 `ACTION_SET_TEXT`，fallback 剪贴板粘贴 |
| `pressBack()` | `performGlobalAction(GLOBAL_ACTION_BACK)` |
| `pressHome()` | `performGlobalAction(GLOBAL_ACTION_HOME)` |
| `launchApp(pkg)` | `packageManager.getLaunchIntentForPackage → startActivity` |

### 5.5 ActionEngine — Kotlin 版动作引擎

**文件**：[ActionEngine.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/engine/ActionEngine.kt)

与 `phone-agent/action-engine.js` 功能一致，依次解析 JSON 动作数组，调用无障碍服务方法。支持 `{{变量}}` 模板解析。

### 5.6 VideoDownloader — Android 版视频下载

**文件**：[VideoDownloader.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/engine/VideoDownloader.kt)

- OkHttp 实现
- 保存路径：`/sdcard/videos/{taskId}.{ext}`
- 超时配置：连接 30s，读取 120s

### 5.7 TailscaleManager — VPN 管理

**文件**：[TailscaleManager.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/vpn/TailscaleManager.kt)

- 检查/安装/连接 Tailscale VPN
- 通过 Tailscale 本地 API `http://100.100.100.100/localapi/v0/status` 检测连接状态

### 5.8 SetupActivity — 配置界面

**文件**：[SetupActivity.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/setup/SetupActivity.kt)

Jetpack Compose UI，提供：
- 平台选择（抖音/快手/小红书 下拉菜单）
- 设备 ID 配置
- MQTT Broker 地址配置
- 三项依赖检查：无障碍服务 / Tailscale 安装 / VPN 连接
- "开始运行" / "停止运行" 按钮
- 配置持久化到 SharedPreferences

### 5.9 BootReceiver — 开机自启

**文件**：[BootReceiver.kt](phone-agent-apk/app/src/main/java/com/avatar/phoneagent/receiver/BootReceiver.kt)

监听 `BOOT_COMPLETED` 广播，如果上次是运行状态则自动重启前台服务。

---

## 6. 服务端调度层

### 6.1 task-dispatcher.js — 主调度器

**文件**：[creator-api/services/task-dispatcher.js](creator-api/services/task-dispatcher.js)

**核心思想**：不预先知道手机 ID，通过通配符订阅动态发现在线设备。

**通道选择优先级** [findBestChannel(heartbeats, platform)]()：
```
1. 筛选 platforms 包含目标平台的设备
2. 排序规则：
   a. source='agent'（Termux Agent） > source='bridge'（Server Bridge）
   b. adb=true > adb=false
3. 返回最优设备
```

**分发流程** [dispatchToPhone()]()：
```
1. 连接 MQTT，订阅 phone/+/heartbeat 和 phone/+/status
2. 等待 AGENT_WAIT (10s) 收集所有心跳
3. findBestChannel(heartbeats, platform) — 选出最佳设备
4. 发布 phone/{targetId}/task (QoS 1)
5. 监听 phone/+/status 等待结果
6. success → resolve / failed → reject / 5 分钟超时 → reject
```

**提供的函数**：

| 函数 | 参数 | 用途 |
|------|------|------|
| `dispatchTemplate(name, opts)` | 模板名 + `{rounds, likeProbability}` | 分发浏览任务 |
| `dispatchToSinglePlatform(platform, videoUrl, metadata)` | 平台 + 视频 URL + 元数据 | 分发单平台发布 |
| `buildPlatformActions(platform, caption)` | 平台名 + 标题 | 构建发布动作序列 |
| `buildBrowseActions(pkg, rounds, likeProbability)` | 包名 + 浏览数 + 点赞率 | 构建浏览动作序列 |

**发布动作序列**（`buildPlatformActions` 生成的示例）：
```javascript
[
  { type: 'launch', package: 'com.ss.android.ugc.aweme' },
  { type: 'wait', ms: 3000 },
  { type: 'tap', x: 540, y: 2200 },    // 点击创建按钮
  { type: 'wait', ms: 1500 },
  { type: 'tap', x: 540, y: 1900 },    // 选择视频
  { type: 'wait', ms: 2000 },
  { type: 'input_text', x: 540, y: 500, text: caption },  // 输入标题
  { type: 'wait', ms: 500 },
  { type: 'tap', x: 1000, y: 2200 },   // 点击发布
  { type: 'wait', ms: 8000 },
  { type: 'screenshot', name: 'douyin_publish_result' },
]
```

### 6.2 dispatch.js — Skill 级调度器

**文件**：[skills/dispatch/dispatch.js](skills/dispatch/dispatch.js)

比 `task-dispatcher.js` 多一层 **Redis 设备注册表查询**。

**调度流程** [dispatchToPhone()]()：
```
1. getAvailablePhone(platform) — 从 Redis 查询在线设备
2. 连接 MQTT，发布 phone/{phoneId}/task
3. 订阅 phone/{phoneId}/status 等待结果
4. 5 分钟超时
```

**并行分发** [dispatchToMultiplePhones()]()：
```javascript
// Promise.all 同时向多个平台分发
const results = await Promise.all(
  platforms.map(p => dispatchToPhone(p, videoUrl, metadata))
);
```

### 6.3 device-registry.js — 设备注册表

**文件**：[skills/dispatch/device-registry.js](skills/dispatch/device-registry.js)

基于 Redis Hash 的手机设备注册表：

```javascript
// 注册设备心跳（TTL = 90 秒）
registerHeartbeat(phoneId, {platforms, battery, adb, source})
// → HSET device:{phoneId} ... + EXPIRE 90s

// 查找指定平台的在线设备
getAvailablePhone(platform)
// → HGETALL device:* → 筛选 platforms 包含目标平台的

// 获取所有在线设备
getAllPhones()
// → HGETALL device:* → 过滤 TTL 未过期的

// 检查设备是否在线
isPhoneOnline(phoneId)
// → EXISTS device:{phoneId}
```

### 6.4 文件服务暴露

在 [creator-api/server.js]() 中：
```javascript
app.use('/phone-files', express.static(join(__dirname, 'phone-agent')));
app.use('/phone-files/shared', express.static(join(__dirname, 'shared')));
```

允许手机端（agent.js）通过 HTTP 下载最新 JS 代码进行热更新。

---

## 7. 平台动作模板

> 目录：`templates/platforms/`

### 7.1 抖音 (douyin.json)

**包名**：`com.ss.android.ugc.aweme`

```
动作序列（9 步）：
launch → wait 3s → tap 创建(540,2200) → wait 1.5s
→ tap 选择视频(540,1900) → wait 2s
→ input_text 标题(540,500) → wait 0.5s
→ tap 发布(1000,2200) → wait 8s → screenshot
```

### 7.2 快手 (kuaishou.json)

**包名**：`com.smile.gifmaker`（注：实际快手包名是 `com.kuaishou.nebula`）

```
动作序列（10 步）：
launch → wait 3s → tap 拍摄(540,2100) → wait 1.5s
→ tap 相册(540,2000) → wait 2s → tap 选择视频
→ input_text 标题(540,400) → wait 0.5s
→ tap 发布(1000,2100) → wait 10s → screenshot
```

### 7.3 小红书 (xiaohongshu.json)

**包名**：`com.xingin.xhs`

```
动作序列（11 步）：
launch → wait 3s → tap 发布(540,2200) → wait 1.5s
→ tap 选择视频(540,1800) → wait 2s
→ input_text 标题 → input_text 描述
→ tap 发布 → wait 10s → screenshot
```

---

## 8. 完整数据流：一次任务的全生命周期

以"发布一个 AI 生成视频到抖音"为例，展示从创建到完成的完整链路。

### 阶段 0：系统启动

```
┌─ 手机端 ───────────────────────────────────────────┐
│ agent.js 连接到 MQTT Broker                         │
│ 订阅: phone/phone_01/task, phone/phone_01/cmd       │
│ 上线: phone/phone_01/status {status:"online"}       │
│ 每 30s 心跳: phone/phone_01/heartbeat               │
│   {platforms:["douyin","kuaishou","xiaohongshu"]}   │
└─────────────────────────────────────────────────────┘

┌─ 服务端 ───────────────────────────────────────────┐
│ creator-api 启动（3099），暴露 /phone-files 静态服务  │
│ task-dispatcher.js 就绪，等待 API 调用               │
└─────────────────────────────────────────────────────┘
```

### 阶段 1：任务创建

```javascript
// 前端或调度器调用
dispatchToSinglePlatform("douyin", videoUrl, metadata)

// 生成 task JSON：
{
  task_id: "task_1715000000000_abc123",
  platform: "douyin",
  video: { url: "https://minio/video.mp4" },
  metadata: { title: "AI生成的视频标题", caption: "..." },
  actions: [
    { type: "launch", package: "com.ss.android.ugc.aweme" },
    { type: "wait", ms: 3000 },
    { type: "tap", x: 540, y: 2200 },
    // ... 完整发布序列
  ]
}
```

### 阶段 2：设备选择

```
task-dispatcher.js:
  1. 连接 MQTT，订阅 phone/+/heartbeat
  2. 等待 10 秒收集心跳
  3. findBestChannel(heartbeats, "douyin")
     → 筛选 platforms 包含 "douyin" 的设备
     → 排序: agent > bridge, adb=true > adb=false
     → 选中 phone_01 (source=agent, adb=true)
  4. 发布到 phone/phone_01/task (QoS 1)
```

### 阶段 3：MQTT 传输

```
Topic: phone/phone_01/task
Payload: 上述 task JSON
QoS: 1（保证至少送达一次）
Broker: mosquitto on 100.79.18.62:1883
Network: Tailscale VPN
```

### 阶段 4：手机端接收与执行

```
agent.js 收到 MQTT message → handleTask(task):

4a. 校验
  validateTaskPayload(task) → 通过

4b. 上报"下载中"
  publish: phone/phone_01/status {status: "downloading"}

4c. 下载视频
  downloadVideo(url, taskId)
  → fetch(url) → stream pipe → ~/videos/task_1715000000000_abc123.mp4

4d. 上报"发布中"
  publish: phone/phone_01/status {status: "publishing"}

4e. 执行动作序列
  executeActions(actions, params):
    launch  → adb-bridge.launchApp("com.ss.android.ugc.aweme")
              → ADB: monkey -p ... 1
              → 失败时 HTTP: POST /launch {package}
    wait    → sleep(3000)
    tap     → adb-bridge.tap(540, 2200)
              → ADB: input tap 540 2200
              → 失败时 HTTP: POST /tap {x:540, y:2200}
    ... 依次执行所有动作 ...
    screenshot → adb exec-out screencap -p > /sdcard/screenshots/xxx.png

4f. 上报成功
  publish: phone/phone_01/status {
    status: "success",
    screenshots: [{name:"publish_result", path:"/sdcard/..."}]
  }
```

### 阶段 5：服务端接收结果

```
task-dispatcher.js 监听 phone/+/status:
  → 匹配 task_id = "task_1715000000000_abc123"
  → status === "success" → resolve({success: true, ...})
  → status === "failed"  → reject(new Error(...))
  → 5 分钟超时 → reject(new Error("任务超时"))
```

---

## 9. 三种通道对比

| 维度 | phone-agent (Termux) | server-bridge (Windows ADB) | phone-agent-apk (原生) |
|------|---------------------|---------------------------|----------------------|
| **运行环境** | Android Termux | Windows 服务器 | Android APK |
| **自动化方式** | ADB 优先 → HTTP 无障碍 fallback | ADB over TCP/IP | AccessibilityService 无障碍 |
| **编程语言** | Node.js (ESM) | Node.js (CommonJS) | Kotlin |
| **视频下载** | 有 | 无 | 有 (OkHttp) |
| **热更新** | 支持 (reload 命令) | 不支持 | 不支持（需重新编译 APK） |
| **手势重试** | 无（ADB 命令层无重试） | 无 | 有（最多 2 次重试） |
| **ADB 状态机** | 有（60s 周期重试） | 有（连接缓存） | N/A（不使用 ADB） |
| **source 标识** | `agent` | `bridge` | 无 source 字段 |
| **心跳间隔** | 30 秒 | 10 秒 | 30 秒 |
| **持久化配置** | 环境变量 | 环境变量 | SharedPreferences |
| **开机自启** | 需要 Termux:Boot | N/A | BootReceiver |
| **通道优先级** | **最高** | 次高 | 与 agent 同级 |

---

## 10. 命令与控制（CMD 通道）

所有手机端实现都可通过 `phone/{id}/cmd` 主题接收控制命令。

| 命令 | 说明 | agent.js | server-bridge | APK |
|------|------|:---:|:---:|:---:|
| **restart** | 退出进程（外层包装器自动重启） | ✅ | ✅ | ✅ |
| **exec** | 执行任意 shell 命令并回报结果 | ✅ | ✅ | ❌ |
| **reload** | 从服务器 HTTP 下载最新 JS 文件并重启 | ✅ | ❌ | ❌ |
| **status** | 查询设备当前状态 | ✅ | ✅ | ✅ |

**CMD 消息格式**：
```json
{
  "type": "restart",
  "requestId": "cmd_1715000000"
}
```

**CMD 响应格式**（回报到 `phone/{id}/status`）：
```json
{
  "type": "cmd_response",
  "requestId": "cmd_1715000000",
  "success": true,
  "output": "..."
}
```

---

## 11. 运维监控

### 11.1 手机在线状态监控

**脚本**：[scripts/mqtt-phone-watch.mjs](scripts/mqtt-phone-watch.mjs)

实时监控所有在线手机：
- 订阅 `phone/+/heartbeat` — 显示设备上线/下线
- 订阅 `phone/+/status` — 显示任务执行进度
- 每 5 秒输出一次汇总状态

### 11.2 手机端诊断

**脚本**：[phone-agent/phone-test.cjs](phone-agent/phone-test.cjs)

20+ 项连通性测试：
- Node.js 版本和环境检查
- ADB 通道测试（devices、tap、screenshot）
- 无障碍 HTTP 服务测试
- MQTT Broker 连通性
- ADB 状态机逻辑

### 11.3 手动测试

**脚本**：[creator-api/tests/mqtt-send-test.mjs](creator-api/tests/mqtt-send-test.mjs)

```javascript
// 向指定手机发送测试任务
node mqtt-send-test.mjs --phone phone_01 --platform douyin
// 监听 phone/phone_01/status 等待结果，60 秒超时
```

---

## 12. 文件地图

```
avatar-ai-video/
│
├── shared/
│   └── mqtt-protocol.js              ← MQTT 协议定义（主题/状态/校验）
│
├── phone-agent/                      ← 通道一：Node.js Termux Agent
│   ├── agent.js                      ← 主入口（MQTT 连接 + 任务调度）
│   ├── adb-bridge.js                 ← ADB 命令封装 + HTTP fallback
│   ├── action-engine.js              ← 动作解释执行引擎
│   ├── file-downloader.js            ← 视频下载器
│   ├── server-bridge.cjs             ← 通道二：服务器端 ADB 桥接 (.cjs)
│   ├── task-templates.json           ← 浏览任务模板
│   ├── phone-test.cjs                ← 手机端连通性诊断
│   ├── start.sh                      ← Termux 一键启动脚本
│   ├── bootstrap.sh                  ← 自动安装脚本
│   └── run-loop.sh                   ← 自重启包装器
│
├── phone-agent-apk/                  ← 通道三：Android 原生 APK
│   └── app/src/main/java/com/avatar/phoneagent/
│       ├── PhoneAgentApp.kt          ← Application 类
│       ├── service/
│       │   └── AgentForegroundService.kt  ← 前台服务 + MQTT
│       ├── accessibility/
│       │   └── CameraAccessibilityService.kt ← 无障碍手势服务
│       ├── engine/
│       │   ├── ActionEngine.kt       ← Kotlin 动作引擎
│       │   └── VideoDownloader.kt    ← Android 视频下载器
│       ├── setup/
│       │   └── SetupActivity.kt      ← Compose 配置界面
│       ├── vpn/
│       │   └── TailscaleManager.kt   ← VPN 连接管理
│       └── receiver/
│           └── BootReceiver.kt       ← 开机自启
│
├── creator-api/
│   ├── server.js                     ← 暴露 /phone-files 静态文件服务
│   ├── services/
│   │   └── task-dispatcher.js        ← 主调度器（通配符心跳收集 + 通道选择）
│   └── tests/
│       └── mqtt-send-test.mjs        ← 手动测试任务脚本
│
├── skills/dispatch/
│   ├── dispatch.js                   ← Skill 级调度器（Redis + MQTT）
│   └── device-registry.js            ← Redis 设备注册表（TTL 90s）
│
├── templates/platforms/
│   ├── douyin.json                   ← 抖音发布动作模板
│   ├── kuaishou.json                 ← 快手发布动作模板
│   └── xiaohongshu.json              ← 小红书发布动作模板
│
└── scripts/
    └── mqtt-phone-watch.mjs          ← 手机在线状态实时监控
```

---

## 附录：关键配置速查

### agent.js 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MQTT_BROKER` | `mqtt://100.79.18.62:1883` | MQTT Broker 地址 |
| `PHONE_ID` | `phone_01` | 手机唯一标识 |
| `PLATFORMS` | `douyin,kuaishou,xiaohongshu` | 支持的平台（逗号分隔） |
| `DOWNLOAD_DIR` | `~/videos` | 视频下载目录 |
| `FALLBACK_PORT` | `9999` | 无障碍 HTTP 服务端口 |

### server-bridge.cjs 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PHONE_IP` | — | 手机 ADB 远程连接 IP |
| `PHONE_ID` | — | 手机标识（自动加 `_bridge` 后缀） |

### creator-api 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MQTT_BROKER` | `mqtt://mosquitto:1883` | MQTT Broker 地址 |
| `AGENT_WAIT` | `10000` (ms) | 等待心跳收集的时间 |
| `TASK_TIMEOUT` | `300000` (ms) | 任务执行超时时间 |

### docker-compose 服务依赖

```
mosquitto (1883) ← MQTT Broker
redis (6379)     ← device-registry 存储
minio (9000)     ← 视频对象存储
```
