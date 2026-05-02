# Phone Control 1 — 手机端自动控制技术文档

> 记录 avatar-ai-video 项目手机端 ADB / 无障碍双通道自动控制的完整架构、配置和操作细节。

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────┐
│                    creator-api (Docker)              │
│  task-dispatcher.js                                  │
│    ├─ dispatchTemplate()  模板任务分发                │
│    └─ dispatchToPhone()   统一双通道路由              │
│         │                                           │
│         ▼ 订阅 phone/+/heartbeat (10秒收集窗口)       │
│         │                                           │
│    findBestChannel()                                 │
│      优先: source=agent, adb=true                    │
│      兜底: source=bridge                             │
│         │                                           │
│         ├── phone/phone_01/task ──→ 手机 agent       │
│         └── phone/phone_01_bridge/task ──→ bridge    │
└─────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐     ┌──────────────────────────┐
│ 手机 Termux      │     │ server-bridge.cjs (常驻)  │
│ agent.js        │     │ adb -s 手机IP            │
│ adb connect     │     │          │               │
│ 127.0.0.1:5555  │     │  Tailscale 隧道           │
│      │          │     │          │               │
│      ▼          │     │          ▼               │
│  本地环回 ADB   │     │  手机 ADB TCP 5555        │
└─────────────────┘     └──────────────────────────┘
```

---

## 二、网络拓扑

| 节点 | Tailscale IP | 角色 |
|------|-------------|------|
| 服务器 (Windows) | `100.79.18.62` | Docker 服务 + bridge 进程 |
| 手机 (Xiaomi 21091116AC) | `100.105.213.115` | 执行终端 |
| MQTT Broker | `127.0.0.1:1883` → 宿主机 → `0.0.0.0:1883` | Docker mosquitto |
| API 端点 | `http://100.79.18.62:3099/phone-files/` | 手机端代码热更新 |

手机屏幕: **1080×2400, density 440**

---

## 三、消息协议

### 3.1 Topic 定义

```javascript
// shared/mqtt-protocol.js
TOPICS = {
  TASK:      (phoneId) => `phone/${phoneId}/task`,       // 下发任务
  STATUS:    (phoneId) => `phone/${phoneId}/status`,     // 状态回报
  HEARTBEAT: (phoneId) => `phone/${phoneId}/heartbeat`,  // 心跳 (30s)
  CMD:       (phoneId) => `phone/${phoneId}/cmd`,        // 控制指令
}
```

### 3.2 心跳格式

```json
// agent 通道
{
  "phone_id": "phone_01",
  "platforms": ["douyin","kuaishou","xiaohongshu"],
  "source": "agent",
  "model": "termux",
  "adb": true,
  "battery": 74,
  "timestamp": 1777659800000
}

// bridge 通道 (topic: phone/phone_01_bridge/heartbeat, 间隔10s)
{
  "phone_id": "phone_01",
  "bridge_id": "phone_01_bridge",
  "platforms": ["douyin","kuaishou","xiaohongshu"],
  "source": "bridge",
  "adb": true,
  "battery": 74,
  "timestamp": 1777659800000
}
```

### 3.3 任务下发格式

```json
{
  "task_id": "tpl_1777652345_abcd",
  "platform": "douyin",
  "priority": "normal",
  "actions": [
    {"type": "launch", "package": "com.ss.android.ugc.aweme"},
    {"type": "wait", "ms": 4000},
    {"type": "tap", "x": 960, "y": 1269},
    {"type": "swipe", "x1": 540, "y1": 1800, "x2": 540, "y2": 400, "duration": 400},
    {"type": "home"}
  ],
  "metadata": { "rounds": 5, "likeProbability": 0.6 }
}
```

### 3.4 支持的动作类型

| type | 参数 | 说明 |
|------|------|------|
| `launch` | `package` | 启动 App |
| `tap` | `x, y` | 屏幕点击 |
| `swipe` | `x1, y1, x2, y2, duration` | 滑动 |
| `wait` | `ms` | 等待毫秒 |
| `input_text` | `text/content, x, y` | 输入文字 |
| `screenshot` | `name` | 截图 |
| `back` | — | 返回键 (keyevent 4) |
| `home` | — | Home 键 (keyevent 3) |

---

## 四、手机端 ADB 配置

### 4.1 首次授权 (一次性)

```
1. 手机 USB 插电脑, 开启 USB 调试
2. 电脑执行: adb devices → 弹出授权弹窗 → 点"允许"
3. adb tcpip 5555 → 开启 TCP 调试
4. 复制 PC 密钥到手机:
   adb push ~/.android/adbkey    /data/local/tmp/
   adb push ~/.android/adbkey.pub /data/local/tmp/
   → 手机 Termux 内: cp /data/local/tmp/adbkey* ~/.android/
```

### 4.2 手机自己连自己

```bash
# 手机 Termux 内执行, 需先 pkg install android-tools
adb connect 127.0.0.1:5555
# 验证
adb -s 127.0.0.1:5555 shell echo OK
```

### 4.3 服务器无线连接 (Tailscale)

```bash
adb connect 100.105.213.115:5555
```

### 4.4 手机侧 agent 重启

```bash
# Termux 内
cd ~/avatar-ai-video/phone-agent
MQTT_BROKER=mqtt://100.79.18.62:1883 PHONE_ID=phone_01 \
  PLATFORMS=douyin,kuaishou,xiaohongshu node agent.js
```

---

## 五、服务器 bridge 启动

```bash
cd phone-agent
node server-bridge.cjs
# 输出:
# [bridge] Server ADB Bridge started
# [bridge] MQTT connected as phone_01_bridge
```

环境变量:
- `MQTT_BROKER` — 默认 `mqtt://127.0.0.1:1883`
- `PHONE_ID` — 默认 `phone_01`
- `PHONE_IP` — 默认 `100.105.213.115:5555`

---

## 六、任务分发 API

### 6.1 从容器内调用

```javascript
import { dispatchTemplate } from './services/task-dispatcher.js';

// 浏览抖音 5 个视频, 60% 概率点赞
await dispatchTemplate('browse_douyin', { rounds: 5, likeProbability: 0.6 });

// 浏览快手 8 个视频
await dispatchTemplate('browse_kuaishou', { rounds: 8 });

// 浏览小红书 3 篇
await dispatchTemplate('browse_xiaohongshu', { rounds: 3 });
```

### 6.2 命令行测试

```bash
docker exec deploy-creator-api-1 node --input-type=module -e "
  const m = await import('./services/task-dispatcher.js');
  const r = await m.dispatchTemplate('browse_douyin', { rounds: 3 });
  console.log(JSON.stringify(r));
"
```

### 6.3 返回值

```json
{
  "platform": "douyin",
  "success": true,
  "channel": "bridge",
  "fromId": "phone_01_bridge"
}
```

### 6.4 通道选择逻辑

```javascript
function findBestChannel(heartbeats, platform) {
  return heartbeats
    .filter(h => h.platforms && h.platforms.includes(platform))
    .sort((a, b) => {
      if (a.source === 'agent' && b.source !== 'agent') return -1;  // agent 优先
      if (a.source !== 'agent' && b.source === 'agent') return 1;
      if (a.adb === true && b.adb !== true) return -1;             // adb 可用优先
      return 0;
    })[0] || null;
}
```

---

## 七、浏览+点赞动作序列

### 7.1 逻辑

```
启动 App → 等 4 秒
  ↓
循环 N 轮:
  ├─ 观看 2-5 秒 (随机)
  ├─ 60% 概率: 点击 (960, 1100-1400 随机Y)   ← 点赞
  ├─ 上滑切换下一个视频 (540,1800→540,400)
  └─ 等 1.5 秒
  ↓
回桌面 (Home)
```

### 7.2 平台包名

| 平台 | 包名 |
|------|------|
| 抖音 | `com.ss.android.ugc.aweme` |
| 快手 | `com.kuaishou.nebula` |
| 小红书 | `com.xingin.xhs` |

---

## 八、adb-bridge.js 修复要点

| 问题 | 修复 |
|------|------|
| ADB 一次失败永久禁用 | 60 秒定时重置 `_adbAvail` 为 `unknown`, 允许周期性重试 |
| 多设备时命令冲突 | `initAdbIfNeeded()` 自动检测设备, 用 `adb -s <serial>` 指定目标 |
| HTTP fallback 失败无日志 | 每次 fetch 失败打印 HTTP 状态码和错误原因 |
| screenshot 无错误处理 | 独立 try-catch, 打印详细错误 |
| 设备自动连接 | 启动时自动 `adb connect 127.0.0.1:5555` |

---

## 九、APK 端修复要点 (未构建)

### 9.1 CameraAccessibilityService

- `tap/swipe` 加 `GestureResultCallback` + `CountDownLatch` 同步等待
- 失败自动重试 2 次, 超时 3 秒
- `onDestroy` 日志记录

### 9.2 accessibility_service_config.xml

- 加 `flagReportViewIds | flagIncludeNotImportantViews` 提高优先级
- `notificationTimeout` 从 100ms 降到 50ms

### 9.3 AgentForegroundService

- 任务执行前 `waitForAccessibility()` 轮询 5 秒
- 心跳上报 `a11y` 字段, 断开时通知栏提示
- 新增 `isAccessibilityServiceEnabled()` 系统级检测

---

## 十、手机诊断脚本

### phone-test.cjs 用法

```bash
# 推送
adb push phone-agent/phone-test.cjs /data/local/tmp/

# 手机 Termux 内
cp /data/local/tmp/phone-test.cjs ~/ && node phone-test.cjs
```

### 测试项

- 基础环境: Node.js, 网络
- ADB 通道: 二进制存在, devices, shell, tap, swipe, text, screenshot
- 无障碍: dumpsys, enabled_services, accessibility_enabled
- HTTP Fallback: 127.0.0.1:9999 连通性, POST /tap /swipe /input
- 修复逻辑: ADB 状态机, 缓存跳过, 错误日志

---

## 十一、快速排障

| 症状 | 检查 |
|------|------|
| 手机心跳不上报 | `adb -s 100.105.213.115:5555 shell ps -A \| grep node` |
| bridge 连不上手机 | `adb connect 100.105.213.115:5555` → 重试 |
| agent adb=false | 手机 Termux: `adb connect 127.0.0.1:5555` |
| dispatcher "没有在线设备" | `mosquitto_sub -t 'phone/+/heartbeat'` 确认心跳 |
| bridge 不上线 | `node server-bridge.cjs` 重新启动 |
| Tailscale 断连 | `tailscale status` 检查手机 active 状态 |

---

## 十二、关键文件索引

```
phone-agent/
├── agent.js              ← 手机侧 MQTT agent (source=agent)
├── adb-bridge.js         ← ADB/无障碍双通道桥接
├── action-engine.js      ← 动作序列执行引擎
├── server-bridge.cjs     ← 服务器侧 ADB 桥接 (source=bridge)
├── phone-test.cjs        ← 手机端诊断脚本
├── run-loop.sh           ← Termux 自重启包装
└── bootstrap.sh          ← 自动安装脚本

creator-api/services/
└── task-dispatcher.js    ← 任务分发 + 双通道智能路由

shared/
└── mqtt-protocol.js      ← MQTT 协议定义

phone-agent-apk/
└── app/src/main/java/com/avatar/phoneagent/
    ├── accessibility/CameraAccessibilityService.kt
    ├── engine/ActionEngine.kt
    ├── service/AgentForegroundService.kt
    └── setup/SetupActivity.kt
```
