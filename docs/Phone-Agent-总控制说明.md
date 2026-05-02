# Phone Agent — 手机端自动化控制总说明文档

> 日期：2026-05-02
> 项目：avatar-ai-video
> 目标：新手机到手 → 一键自动配置环境 → 自动安装工具 → 自动连接测试 → 立刻投入自动化任务

---

## 1. 概述

### 1.1 系统能力

本系统实现了对 Android 手机的**全自动远程控制**，无需 Root、无需手动操作（仅首次需少量授权），即可让手机：

| 能力 | 说明 |
|------|------|
| **自动发视频** | 下载视频 → 打开抖音/快手/小红书 → 自动发布 |
| **自动浏览互动** | 模拟真人浏览 + 点赞，养号/活跃账号 |
| **后台常驻** | 前台服务 + 通知栏保活，杀进程后自动恢复 |
| **开机自启** | 手机关机重启后自动恢复运行 |
| **远程任务接收** | MQTT 实时接收服务端下发的任务 |
| **VPN 自动连接** | Tailscale 组建加密虚拟内网，一次授权后全自动 |
| **热更新** | Node.js 通道支持从服务端下载最新代码自动更新 |

### 1.2 三种手机端实现

| 通道 | 运行环境 | 自动化方式 | 语言 | 优点 |
|------|---------|-----------|------|------|
| **APK 原生** | Android APK | AccessibilityService 无障碍 | Kotlin | 安装即用，无需 Termux |
| **Termux Agent** | Termux + Node.js | ADB 优先 → HTTP fallback | Node.js (ESM) | 灵活，支持热更新 |
| **Server Bridge** | Windows 服务器 | ADB over TCP/IP 远程 | Node.js (CJS) | 手机无需任何环境 |

> **新手机推荐**：优先使用 APK 通道（最省事），无法安装 APK 时用 Termux 通道。

---

## 2. 系统架构

### 2.1 网络拓扑

```
Windows 宿主机 (Tailscale: 100.79.18.62)
├── MQTT Broker (mosquitto:1883)     ← 消息中枢
├── creator-api (3099)               ← 代码热更新服务
├── Redis (6379)                     ← 设备注册表
├── MinIO (9000)                     ← 视频存储
│
│   Tailscale VPN 加密隧道
│
┌───▼────────────────────────────────┐
│  Android 手机 (Tailscale IP: 100.x.x.x) │
│                                    │
│  运行方式（三选一）:                 │
│  ├── APK → AgentForegroundService  │
│  ├── Termux → node agent.js        │
│  └── 无 → server-bridge.cjs 远程控 │
└────────────────────────────────────┘
```

### 2.2 MQTT 通信架构

```
Topic 体系:
├── phone/{phoneId}/task        ← 服务器下发任务 (QoS 1)
├── phone/{phoneId}/status      ← 手机回报状态 (QoS 1)
├── phone/{phoneId}/heartbeat   ← 手机心跳 (QoS 0, 30s)
└── phone/{phoneId}/cmd         ← 控制指令 (QoS 1)

服务端通配符订阅:
├── phone/+/heartbeat           ← 收集所有设备心跳
└── phone/+/status              ← 监听所有任务结果
```

### 2.3 任务状态流转

```
服务器下发 task
    │
    ▼
download → downloading (状态上报)
    │
    ▼
publish → publishing (状态上报)
    │
    ├── success (上报成功 + 截图)
    └── failed  (上报失败 + 错误信息)
```

---

## 3. 新手机自动配置流程（APK 通道 · 推荐）

> 新手机只需安装一个 APK，全程 5 分钟内完成配置。

### 3.1 准备工作（一次性）

```bash
# 1. 搭建好 Tailscale 网络，获取手机 Tailscale IP
tailscale status

# 2. 确保 MQTT Broker 运行
docker ps | grep mosquitto

# 3. 编译 APK（或使用已编译版本）
cd phone-agent-apk && ./gradlew assembleDebug
# 输出: app/build/outputs/apk/debug/app-debug.apk
```

### 3.2 手机端操作步骤

```
步骤 1: 安装 APK
    → adb install app-debug.apk
    → 或通过 USB/网盘传到手机点安装

步骤 2: 打开 Phone Agent App
    → 自动显示配置界面

步骤 3: 配置三项基本信息
    ├── 选择平台: 抖音 / 快手 / 小红书
    ├── 设备 ID: phone_02 (新手机递增编号)
    └── 服务器地址: tcp://100.79.18.62:1883

步骤 4: 三盏灯变绿（各需手动操作一次）
    ├── 🔴 无障碍服务 → 点「去开启」→ 系统设置中打开开关 → 🟢
    ├── 🔴 Tailscale 安装 → 点「安装」→ 跳 Play Store → 🟢
    └── 🔴 VPN 连接 → 点「连接」→ 系统弹窗点「确定」→ 🟢

步骤 5: 全部 🟢 → 点「开始运行」
    → 通知栏显示 "Phone Agent 运行中"
    → App 可关闭，服务继续后台运行
```

### 3.3 之后再也不需要手动操作

| 场景 | 行为 |
|------|------|
| App 被系统杀死 | Foreground Service `START_STICKY` 自动重启 |
| 手机关机重启 | `BootReceiver` 监听 `BOOT_COMPLETED` 自动启动 |
| MQTT 断连 | 5 秒自动重连 |
| Tailscale VPN 断开 | 自动检测并重新连接 |
| 无障碍服务被关 | 心跳上报 `a11y: false`，通知栏提示 |

### 3.4 需要的权限（首次各授权一次）

```xml
<!-- AndroidManifest.xml 中声明 -->
INTERNET                    ← 网络通信
FOREGROUND_SERVICE          ← 后台常驻
FOREGROUND_SERVICE_DATA_SYNC ← Android 13+ 前台服务类型
POST_NOTIFICATIONS          ← 通知栏保活
RECEIVE_BOOT_COMPLETED      ← 开机自启
WRITE_EXTERNAL_STORAGE      ← 视频下载 (≤ Android 9)
READ_EXTERNAL_STORAGE       ← 读取视频 (≤ Android 12)
```

---

## 4. 新手机自动配置流程（Termux 通道 · 备选）

> 适合没有 APK 编译环境，或需要热更新能力的场景。

### 4.1 手机端 ADB 首次授权（一次性）

```bash
# 电脑端执行
# 1. 手机 USB 插电脑，开启「USB 调试」
adb devices
# → 手机弹出授权弹窗 → 点「允许」

# 2. 开启网络 ADB
adb tcpip 5555

# 3. 复制 ADB 密钥到手机（让手机自己能连自己）
adb push ~/.android/adbkey    /data/local/tmp/
adb push ~/.android/adbkey.pub /data/local/tmp/
```

### 4.2 手机 Termux 环境一键安装

在手机 Termux 中执行：

```bash
# 安装基础依赖
pkg update && pkg upgrade -y
pkg install -y nodejs-lts android-tools curl openssh termux-api

# 让手机自己连自己 ADB
cp /data/local/tmp/adbkey* ~/.android/
adb connect 127.0.0.1:5555
adb -s 127.0.0.1:5555 shell echo "ADB OK"
```

### 4.3 手机 Agent 自动部署（bootstrap.sh）

```bash
# 在手机 Termux 中执行
curl -sLo bootstrap.sh http://100.79.18.62:3099/phone-files/bootstrap.sh
bash bootstrap.sh
```

`bootstrap.sh` 自动完成以下操作：

```
1. 从服务器 HTTP 下载所有 JS 文件
   ├── agent.js           ← 主程序
   ├── adb-bridge.js      ← ADB/无障碍双通道
   ├── action-engine.js   ← 动作执行引擎
   ├── file-downloader.js ← 视频下载器
   ├── run-loop.sh        ← 自重启包装器
   └── mqtt-protocol.js   ← 协议定义 (shared/)

2. npm install（安装 mqtt 依赖）

3. 设置环境变量并启动:
   MQTT_BROKER=mqtt://100.79.18.62:1883
   PHONE_ID=phone_02
   PLATFORMS=douyin,kuaishou,xiaohongshu

4. run-loop.sh 包装运行（退出后 2 秒自动重启）
```

### 4.4 手机侧手动启动

```bash
cd ~/avatar-ai-video/phone-agent

# 方式1: 前台运行
MQTT_BROKER=mqtt://100.79.18.62:1883 \
  PHONE_ID=phone_02 \
  PLATFORMS=douyin,kuaishou,xiaohongshu \
  node agent.js

# 方式2: run-loop 自重启运行
bash run-loop.sh
```

---

## 5. 新手机自动配置流程（Server Bridge 通道 · 无需手机端操作）

> 手机只需开启 USB 调试 + 网络 ADB，所有控制逻辑在服务器端执行。

### 5.1 手机端准备

```bash
# 手机只需做一次
# 1. 开启「USB 调试」
# 2. 开启「网络 ADB」或通过 USB 执行 adb tcpip 5555
# 3. 手机安装 Tailscale 并连接到同一网络
```

### 5.2 服务器端启动桥接

```bash
cd phone-agent

# 环境变量
export MQTT_BROKER=mqtt://127.0.0.1:1883
export PHONE_ID=phone_02
export PHONE_IP=100.105.213.116:5555    # 新手机 Tailscale IP

node server-bridge.cjs
# 输出:
# [bridge] Server ADB Bridge started
# [bridge] MQTT connected as phone_02_bridge
```

### 5.3 Bridge 通道特点

| 特性 | Agent (Termux) | Bridge (Server) |
|------|---------------|-----------------|
| 运行位置 | 手机 Termux | Windows 服务器 |
| ADB 连接方式 | 本地 `adb connect 127.0.0.1` | 远程 `adb connect {IP}` |
| source 标识 | `agent` | `bridge` |
| 心跳间隔 | 30 秒 | 10 秒 |
| 视频下载 | 有 | **无**（仅执行动作） |
| 优先级 | **高** | 中 |

---

## 6. 自动连接测试与验证

> 新手机配置完成后，按以下步骤自动验证所有环节。

### 6.1 心跳验证（服务端执行）

```bash
# 监听新手机心跳上线
docker exec deploy-mosquitto-1 mosquitto_sub -t 'phone/+/heartbeat' -v

# 预期看到:
# phone/phone_02/heartbeat {"phone_id":"phone_02","platforms":["douyin"],"source":"agent","adb":true,"battery":85}
```

### 6.2 手机端诊断脚本（phone-test.cjs）

```bash
# 将诊断脚本推送到手机并运行
adb push phone-agent/phone-test.cjs /data/local/tmp/

# 手机 Termux 内:
cp /data/local/tmp/phone-test.cjs ~/
node phone-test.cjs
```

**诊断项目（20+ 项）**：

| 类别 | 检查项 |
|------|--------|
| 基础环境 | Node.js 版本、网络连通性 |
| ADB 通道 | adb 二进制、devices 列表、shell、tap、swipe、text、screenshot |
| 无障碍 | dumpsys accessibility、enabled_services、accessibility_enabled |
| HTTP Fallback | 127.0.0.1:9999 连通性、POST /tap /swipe /input |
| 修复逻辑 | ADB 状态机、缓存跳过、错误日志 |

### 6.3 手动任务测试

```bash
# 从服务端向新手机发送测试任务
cd creator-api

docker exec deploy-creator-api-1 node --input-type=module -e "
  const m = await import('./services/task-dispatcher.js');
  const r = await m.dispatchTemplate('browse_douyin', { rounds: 3 });
  console.log(JSON.stringify(r));
"

# 预期返回:
# {"platform":"douyin","success":true,"channel":"agent","fromId":"phone_02"}
```

### 6.4 实时监控面板

```bash
# 启动手机状态监控
node scripts/mqtt-phone-watch.mjs

# 实时显示:
# ┌──────────┬──────────┬─────────┬────────┬───────┬──────────┐
# │ phone_id │ platform │ battery │ adb    │ a11y  │ status   │
# ├──────────┼──────────┼─────────┼────────┼───────┼──────────┤
# │ phone_01 │ douyin   │ 85%     │ ✅     │ ✅    │ online   │
# │ phone_02 │ douyin   │ 72%     │ ✅     │ ✅    │ online   │
# └──────────┴──────────┴─────────┴────────┴───────┴──────────┘
```

---

## 7. 自动排障指南

### 7.1 常见症状速查表

| 症状 | 检查命令 | 修复措施 |
|------|---------|---------|
| 心跳不上报 | `adb shell ps -A \| grep node` | Termux: `bash run-loop.sh` 重启 |
| bridge 连不上 | `adb connect {IP}:5555` | 检查 Tailscale 连通 + 手机 ADB 端口 |
| agent adb=false | `adb connect 127.0.0.1:5555` | 手机内重连本地 ADB |
| "没有在线设备" | `mosquitto_sub -t 'phone/+/heartbeat'` | 确认 Broker 运行 + Topic 匹配 |
| Tailscale 断连 | `tailscale status` | 重启 Tailscale App |
| 无障碍服务断开 | 系统设置 → 无障碍 → 重新打开 | APK: 通知栏会提示 |
| 后台被杀 | 系统设置 → 电池 → 无限制 | 引导用户加白名单 |

### 7.2 ADB 状态机修复逻辑

```
ADB 状态流转:
  unknown → 尝试 adb devices
    ├── 成功 → adbAvailable = true ✅
    └── 失败 → adbAvailable = false
                  └── 60 秒后 → 重置为 unknown → 重新尝试

每次操作先判断:
  adbAvailable === true?  → 用 ADB 执行
  adbAvailable === false? → 用 HTTP fallback (127.0.0.1:9999)
```

### 7.3 HTTP Fallback（无障碍服务）

当 ADB 不可用时，自动降级到无障碍 HTTP 服务：

| 操作 | HTTP 端点 | 说明 |
|------|----------|------|
| 点击 | `POST /tap {x, y}` | 无障碍手势执行 |
| 滑动 | `POST /swipe {x1, y1, x2, y2, duration}` | 无障碍手势执行 |
| 输入文字 | `POST /input {text}` (base64) | 无障碍输入 |
| 启动 App | `POST /launch {package}` | 启动指定 App |

> ⚠️ `screenshot` 和 `keyEvent` 无 HTTP fallback，ADB 不可用时这些操作直接失败。

### 7.4 APK 端排障

| 问题 | 检查点 |
|------|--------|
| 手势不执行 | `CameraAccessibilityService.instance == null`? → 无障碍被系统关闭 |
| 手势超时 | 3 秒超时 + 最多 2 次重试 → 通知栏报错 |
| 视频下载失败 | `/sdcard/videos/` 目录权限? + 网络连通? |
| VPN 不连 | Tailscale 本地 API `http://100.100.100.100/localapi/v0/status` |

### 7.5 常见分辨率适配

当前坐标基于 **1080×2400** 分辨率。不同手机需调整坐标。

**分辨率缩放公式**：
```
新坐标 = (参考坐标 / 参考分辨率) × 实际分辨率
```

| 参考分辨率 | 创建按钮 | 选择视频 | 发布按钮 |
|-----------|---------|---------|---------|
| 1080×2400 | (540, 2200) | (540, 1900) | (1000, 2200) |
| 1080×1920 | (540, 1760) | (540, 1520) | (1000, 1760) |
| 1440×3200 | (720, 2933) | (720, 2533) | (1333, 2933) |

---

## 8. 一键配置脚本生成

> 核心目标：下一次配置新手机时，运行一个脚本即可完成所有配置。

### 8.1 APK 方式一键配置

```bash
#!/bin/bash
# setup-new-phone-apk.sh - 新手机 APK 一键配置脚本
# 用法: bash setup-new-phone-apk.sh phone_03 100.105.213.117

set -e

PHONE_ID=${1:?请输入手机ID, 如 phone_03}
PHONE_IP=${2:?请输入手机Tailscale IP}
APK_PATH="phone-agent-apk/app/build/outputs/apk/debug/app-debug.apk"

echo "============================================"
echo "  Phone Agent 新手机配置 - APK 方式"
echo "  手机ID: $PHONE_ID"
echo "  手机IP: $PHONE_IP"
echo "============================================"

# 1. 编译 APK（如果不存在）
if [ ! -f "$APK_PATH" ]; then
    echo "[1/4] 编译 APK ..."
    cd phone-agent-apk && ./gradlew assembleDebug
    cd ..
fi

# 2. 安装到手机
echo "[2/4] 安装 APK 到 $PHONE_IP ..."
adb connect $PHONE_IP:5555
adb -s $PHONE_IP:5555 install -r "$APK_PATH"

# 3. 等待用户手动完成 App 内三项授权
echo ""
echo "============================================"
echo "  [3/4] 请在手机上完成以下操作:"
echo "  1. 打开 Phone Agent App"
echo "  2. 设备ID 填: $PHONE_ID"
echo "  3. 服务器地址: tcp://100.79.18.62:1883"
echo "  4. 依次开通: 无障碍服务 / Tailscale / VPN"
echo "  5. 点「开始运行」"
echo "============================================"
echo ""
read -p "手机上已完成配置? (回车继续) "

# 4. 验证心跳上线
echo "[4/4] 验证心跳上线 ..."
sleep 5
HEARTBEAT=$(timeout 15 docker exec mosquitto mosquitto_sub -t "phone/$PHONE_ID/heartbeat" -C 1 2>/dev/null || echo "")

if [ -z "$HEARTBEAT" ]; then
    echo "❌ 心跳未检测到，请检查手机配置"
    echo "   手动验证: mosquitto_sub -t 'phone/$PHONE_ID/heartbeat' -v"
else
    echo "✅ 心跳正常: $HEARTBEAT"
    echo "✅ 新手机 $PHONE_ID 配置完成！"
fi
```

### 8.2 Termux 方式一键配置

```bash
#!/bin/bash
# setup-new-phone-termux.sh - 新手机 Termux 一键配置脚本
# 用法: bash setup-new-phone-termux.sh phone_03 100.105.213.117

set -e

PHONE_ID=${1:?请输入手机ID}
PHONE_IP=${2:?请输入手机Tailscale IP}
SERVER="http://100.79.18.62:3099/phone-files"

echo "============================================"
echo "  Phone Agent 新手机配置 - Termux 方式"
echo "============================================"

# 1. USB + ADB 首次授权
echo "[1/6] 连接手机 ADB ..."
adb connect $PHONE_IP:5555

# 2. 推送 ADB 密钥
echo "[2/6] 推送 ADB 密钥 ..."
adb -s $PHONE_IP:5555 push ~/.android/adbkey    /data/local/tmp/
adb -s $PHONE_IP:5555 push ~/.android/adbkey.pub /data/local/tmp/

# 3. 推送 bootstrap 脚本
echo "[3/6] 推送安装脚本 ..."
adb -s $PHONE_IP:5555 push phone-agent/bootstrap.sh /data/local/tmp/

# 4. 推送诊断脚本
echo "[4/6] 推送诊断脚本 ..."
adb -s $PHONE_IP:5555 push phone-agent/phone-test.cjs /data/local/tmp/

echo ""
echo "============================================"
echo "  [5/6] 请打开手机 Termux 执行以下命令:"
echo ""
echo "  # 安装基础依赖"
echo "  pkg update && pkg upgrade -y"
echo "  pkg install -y nodejs-lts android-tools curl"
echo ""
echo "  # 配置 ADB 密钥"
echo "  cp /data/local/tmp/adbkey* ~/.android/"
echo "  adb connect 127.0.0.1:5555"
echo ""
echo "  # 一键安装 Agent"
echo "  cp /data/local/tmp/bootstrap.sh ~/"
echo "  bash bootstrap.sh"
echo ""
echo "  # 运行诊断"
echo "  cp /data/local/tmp/phone-test.cjs ~/"
echo "  node phone-test.cjs"
echo "============================================"
echo ""

# 5. 验证
echo "[6/6] 请在手机上完成上述步骤后按回车验证心跳..."
read -p "已完成? (回车继续) "
HEARTBEAT=$(timeout 15 docker exec mosquitto mosquitto_sub -t "phone/$PHONE_ID/heartbeat" -C 1 2>/dev/null || echo "")
if [ -z "$HEARTBEAT" ]; then
    echo "❌ 心跳未检测到，请检查配置"
else
    echo "✅ 心跳正常: $HEARTBEAT"
    echo "✅ 新手机 $PHONE_ID 配置完成！"
fi
```

### 8.3 Server Bridge 方式一键配置

```bash
#!/bin/bash
# setup-new-phone-bridge.sh - 新手机 Bridge 一键配置脚本
# 用法: bash setup-new-phone-bridge.sh phone_03 100.105.213.117

PHONE_ID=${1:?请输入手机ID}
PHONE_IP=${2:?请输入手机Tailscale IP}

echo "[1/3] 连接手机 ADB (TCP/IP) ..."
adb connect $PHONE_IP:5555

echo "[2/3] 启动 Server Bridge ..."
MQTT_BROKER=mqtt://127.0.0.1:1883 \
  PHONE_ID=$PHONE_ID \
  PHONE_IP=$PHONE_IP:5555 \
  node phone-agent/server-bridge.cjs &

sleep 3

echo "[3/3] 验证心跳 ..."
HEARTBEAT=$(timeout 15 docker exec mosquitto mosquitto_sub -t "phone/${PHONE_ID}_bridge/heartbeat" -C 1 2>/dev/null || echo "")
if [ -z "$HEARTBEAT" ]; then
    echo "❌ 心跳未检测到"
else
    echo "✅ 心跳正常: $HEARTBEAT"
    echo "✅ Bridge $PHONE_ID 配置完成！"
fi
```

---

## 9. 三种通道对比与选择

| 维度 | APK 原生 | Termux Agent | Server Bridge |
|------|---------|-------------|---------------|
| **手机端复杂度** | ⭐ 仅安装 APK | ⭐⭐⭐ 需装 Termux | ⭐ 无需操作 |
| **首次授权** | 3 项（无障碍/VPN/通知） | ADB 密钥 + 无障碍 | 仅需开网络 ADB |
| **视频下载** | ✅ OkHttp | ✅ fetch | ❌ 不支持 |
| **热更新** | ❌ 需重编译 | ✅ reload 命令 | ❌ 手动重启进程 |
| **后台保活** | ✅ Foreground Service | ⚠️ 需 Termux:Boot | N/A (服务器运行) |
| **开机自启** | ✅ BootReceiver | ⚠️ 需 Termux:Boot | N/A |
| **手势重试** | ✅ 最多 2 次 | ❌ 无 | ❌ 无 |
| **ADB 状态机** | N/A (不用 ADB) | ✅ 60s 周期重试 | ✅ 连接缓存 |
| **调度优先级** | 高 | **最高** | 中 |
| **推荐场景** | 长期运行 | 开发调试 | 临时测试 |

---

## 10. 服务器端环境要求

### 10.1 Docker 服务清单

```yaml
# docker-compose.yml 核心服务
services:
  mosquitto:        # MQTT Broker，端口 1883
  redis:            # 设备注册表，端口 6379
  minio:            # 视频对象存储，端口 9000
  creator-api:      # API 服务 + 文件热更新，端口 3099
```

### 10.2 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MQTT_BROKER` | `mqtt://mosquitto:1883` | Docker 内：mosquitto 主机名 |
| `MQTT_BROKER` (手机端) | `mqtt://100.79.18.62:1883` | 手机端：宿主机 Tailscale IP |
| `AGENT_WAIT` | `10000` (ms) | 心跳收集等待时间 |
| `TASK_TIMEOUT` | `300000` (ms) | 单任务超时（5 分钟） |

### 10.3 通道选择逻辑

```javascript
// task-dispatcher.js 核心逻辑
function findBestChannel(heartbeats, platform) {
  return heartbeats
    .filter(h => h.platforms && h.platforms.includes(platform))
    .sort((a, b) => {
      // 1. agent (Termux) 优先于 bridge (Server)
      if (a.source === 'agent' && b.source !== 'agent') return -1;
      if (a.source !== 'agent' && b.source === 'agent') return 1;
      // 2. ADB 可用优先
      if (a.adb === true && b.adb !== true) return -1;
      return 0;
    })[0] || null;
}
```

---

## 11. 平台动作模板速查

### 11.1 支持平台

| 平台 | 包名 | 模板文件 |
|------|------|---------|
| 抖音 | `com.ss.android.ugc.aweme` | `templates/platforms/douyin.json` |
| 快手 | `com.kuaishou.nebula` | `templates/platforms/kuaishou.json` |
| 小红书 | `com.xingin.xhs` | `templates/platforms/xiaohongshu.json` |

### 11.2 抖音发布动作序列

```json
[
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
```

### 11.3 支持的动作类型

| type | 参数 | 说明 |
|------|------|------|
| `launch` | `package` (String) | 启动指定包名 App |
| `tap` | `x, y` (Float) | 点击屏幕坐标 |
| `swipe` | `x1, y1, x2, y2, duration` | 滑动操作 |
| `wait` | `ms` (Long) | 等待指定毫秒 |
| `input_text` | `content, [x, y]` | 输入文字，可选先聚焦 |
| `screenshot` | `name` (String) | 截图保存 |
| `back` | — | 返回键 |
| `home` | — | Home 键 |

> 所有字符串字段支持 `{{variable}}` 模板变量。

---

## 12. 命令与控制（CMD 通道）

所有手机端都可通过 `phone/{id}/cmd` 接收控制命令：

| 命令 | 说明 | Agent | Bridge | APK |
|------|------|:---:|:---:|:---:|
| `restart` | 退出进程（外层自动重启） | ✅ | ✅ | ✅ |
| `exec` | 执行 shell 命令并回报 | ✅ | ✅ | ❌ |
| `reload` | HTTP 下载最新代码并重启 | ✅ | ❌ | ❌ |
| `status` | 查询设备当前状态 | ✅ | ✅ | ✅ |

---

## 13. 安全措施

| 措施 | 说明 |
|------|------|
| MQTT Topic 隔离 | 每台手机独立 topic `phone/{id}/*` |
| Tailscale VPN 加密 | 所有通信在虚拟内网中进行 |
| 不暴露端口 | 手机端不开监听端口，纯 MQTT 客户端 |
| 配置持久化 | SharedPreferences / 环境变量 |
| 无 Root 需求 | 所有操作基于系统标准 API |

---

## 14. 已知局限与后续方向

| 局限 | 影响 | 改进方向 |
|------|------|---------|
| 坐标硬编码 | 不同分辨率手机需调整 | UI 树遍历自动定位 |
| 视频选择需手动指定 | 无法从相册自动选视频 | Intent 指定 content:// URI |
| 截图需 MediaProjection | 首次需手动确认弹窗 | 无障碍截图替代方案 |
| 平台风控 | 可能被检测自动化 | 随机延迟 + 轨迹模拟 |
| 国产 ROM 杀后台 | 服务可能被停 | 引导白名单 + 电池豁免 |

---

## 15. 完整文件地图

```
avatar-ai-video/
│
├── shared/
│   └── mqtt-protocol.js              ← MQTT 协议定义（Topic/状态/校验）
│
├── phone-agent/                      ← Termux Node.js Agent + Server Bridge
│   ├── agent.js                      ← 主入口（MQTT 连接 + 任务调度）
│   ├── adb-bridge.js                 ← ADB/HTTP 双通道桥接
│   ├── action-engine.js              ← 动作解释执行引擎
│   ├── file-downloader.js            ← 视频下载器
│   ├── server-bridge.cjs             ← 服务器端 ADB 桥接
│   ├── task-templates.json           ← 浏览任务模板
│   ├── phone-test.cjs                ← 手机端诊断脚本（20+ 项）
│   ├── start.sh                      ← Termux 手动启动脚本
│   ├── bootstrap.sh                  ← 自动安装脚本
│   └── run-loop.sh                   ← 自重启包装器
│
├── phone-agent-apk/                  ← Android 原生 APK
│   └── app/src/main/java/com/avatar/phoneagent/
│       ├── PhoneAgentApp.kt          ← Application 类
│       ├── accessibility/
│       │   └── CameraAccessibilityService.kt  ← 触控注入核心（无障碍）
│       ├── engine/
│       │   ├── ActionEngine.kt       ← Kotlin 动作引擎
│       │   └── VideoDownloader.kt    ← Android 视频下载器
│       ├── service/
│       │   └── AgentForegroundService.kt  ← 前台服务 + MQTT
│       ├── setup/
│       │   └── SetupActivity.kt      ← Compose 配置界面
│       ├── vpn/
│       │   └── TailscaleManager.kt   ← VPN 检测与引导
│       └── receiver/
│           └── BootReceiver.kt       ← 开机自启
│
├── creator-api/
│   ├── server.js                     ← 暴露 /phone-files 热更新服务
│   ├── services/
│   │   └── task-dispatcher.js        ← 主调度器（心跳收集 + 通道选择）
│   └── tests/
│       └── mqtt-send-test.mjs        ← 手动测试脚本
│
├── skills/dispatch/
│   ├── dispatch.js                   ← Skill 级调度器（Redis + MQTT）
│   └── device-registry.js            ← Redis 设备注册表（TTL 90s）
│
├── templates/platforms/
│   ├── douyin.json                   ← 抖音发布模板
│   ├── kuaishou.json                 ← 快手发布模板
│   └── xiaohongshu.json              ← 小红书发布模板
│
├── scripts/
│   └── mqtt-phone-watch.mjs          ← 手机在线状态实时监控
│
└── docs/
    ├── Phone-control-1.md            ← 架构 + ADB 配置详解
    ├── Phone-contol-2.md             ← 三通道完整技术文档
    ├── Phone-control-3.md            ← APK 原生方案详解
    └── Phone-Agent-总控制说明.md      ← 本文档（总说明）
```

---

## 附录 A：新手机配置检查清单

| # | 步骤 | 状态 |
|---|------|:---:|
| 1 | 手机安装 Tailscale，获取虚拟 IP | ☐ |
| 2 | 确认 MQTT Broker 运行正常 | ☐ |
| 3 | 选择通道（APK / Termux / Bridge） | ☐ |
| 4 | 运行对应的一键配置脚本 | ☐ |
| 5 | 手机完成首次手动授权 | ☐ |
| 6 | 验证心跳在 mosquitto_sub 中出现 | ☐ |
| 7 | 发送测试任务，确认执行成功 | ☐ |
| 8 | 杀进程测试自动恢复 | ☐ |
| 9 | 重启手机测试开机自启 | ☐ |

## 附录 B：MQTT 消息格式速查

**Task（服务器 → 手机）**：
```json
{
  "task_id": "task_20260502_001",
  "platform": "douyin",
  "priority": "normal",
  "video": { "url": "https://minio/video.mp4", "md5": "abc", "size_mb": 35 },
  "metadata": { "title": "标题", "tags": ["#AI"], "description": "描述" },
  "actions": [ /* 动作序列 */ ]
}
```

**Status（手机 → 服务器）**：
```json
{
  "task_id": "task_20260502_001",
  "phone_id": "phone_01",
  "status": "downloading|publishing|success|failed",
  "error": null,
  "screenshots": [],
  "timestamp": 1746172800
}
```

**Heartbeat（手机 → 服务器）**：
```json
{
  "phone_id": "phone_01",
  "platforms": ["douyin", "kuaishou", "xiaohongshu"],
  "source": "agent",
  "adb": true,
  "battery": 85,
  "a11y": true,
  "timestamp": 1746172800
}
```
