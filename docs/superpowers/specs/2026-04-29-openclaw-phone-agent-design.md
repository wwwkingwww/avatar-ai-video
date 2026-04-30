# OpenClaw + RunningHub Skill + 手机 Agent + ADB 设计方案

> 日期：2026-04-29
> 项目：avatar-ai-video
> 阶段：概念验证 → 可扩展原型

---

## 1. 目标

打通「Linux 服务器 OpenClaw → RunningHub Skill 生成视频 → MQTT 下发任务 → Android 手机 ADB 自动发布到国内短视频平台」全链路。

一期只做国内平台：**抖音 + 快手 + 小红书**，每台手机绑定一个平台。

---

## 2. 环境与约束

| 维度 | 决策 |
|------|------|
| 服务器 | Linux 云服务器 (Ubuntu 22.04 / Debian 12) |
| 手机连接 | Termux ADB 代理 + Tailscale VPN 隧道 |
| 一期平台 | 抖音、快手、小红书（真机 ADB / 无障碍服务） |
| RunningHub | 纯 API 调用（轻量 Skill），不操作浏览器 |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Linux 云服务器                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Docker Compose 编排                       │   │
│  │                                                       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │   │
│  │  │ OpenClaw │  │  Redis   │  │  MinIO (视频存储)   │  │   │
│  │  │ 核心引擎  │  │ 任务队列  │  │                    │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │   │
│  │       │             │                 │              │   │
│  │       └──────┬──────┴─────────────────┘              │   │
│  │              │                                        │   │
│  │  ┌───────────┴───────────┐                           │   │
│  │  │  OpenClaw Skill 层    │                           │   │
│  │  │                      │                           │   │
│  │  │  ├─ runninghub-gen   │  ← 调 API 生成视频        │   │
│  │  │  ├─ video-postproc   │  ← 加水印/字幕/格式转换    │   │
│  │  │  └─ dispatch-agent   │  ← 分发任务到手机节点      │   │
│  │  └───────────┬───────────┘                           │   │
│  │              │ MQTT Broker (mosquitto)               │   │
│  │              │                                       │   │
│  └──────────────┼───────────────────────────────────────┘   │
│                 │                                            │
│          Tailscale 虚拟内网                                   │
│         ┌───────┼───────┬────────┐                          │
└─────────┼───────┼───────┼────────┼──────────────────────────┘
          │       │       │        │
    ┌─────▼──┐ ┌──▼───┐ ┌▼────┐ ┌─▼──────┐
    │ 手机1  │ │手机2 │ │手机3│ │ 手机N  │
    │ 抖音    │ │ 快手  │ │小红书│ │ 备用   │
    └────────┘ └──────┘ └─────┘ └────────┘
```

### 四层结构

| 层 | 位置 | 职责 |
|----|------|------|
| OpenClaw 核心 | Linux 服务器 Docker | 任务编排、Skill 调度、用户交互 |
| Skill 层 | Linux 服务器 | RunningHub 视频生成、后处理、发布分发 |
| MQTT 通信层 | mosquitto + Tailscale | 服务器↔手机双向消息、任务下发、状态上报 |
| 手机 Agent | Android 手机 Termux | 接收指令 → ADB/无障碍触控 → 平台发布 → 回传截图 |

### OpenClaw 与手机的关系

OpenClaw **不直接与手机通信**。中间层是 MQTT Broker：

- OpenClaw Skill 通过本地 MQTT client 发布消息到 mosquitto
- 手机 Agent 订阅对应 topic 接收任务
- 手机 Agent 发布状态/截图到 mosquitto
- OpenClaw Skill 订阅状态 topic 等待结果

---

## 4. 手机 Agent 设计

### 4.1 手机端架构

```
┌─────────────────────────────────────────────────┐
│              Android 手机 (一台一个平台)           │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Termux (Linux 沙箱)              │  │
│  │                                            │  │
│  │  ┌──────────┐  ┌──────────────────────┐   │  │
│  │  │ MQTT     │  │  Node.js Agent 进程   │   │  │
│  │  │ Client   │──│                      │   │  │
│  │  └──────────┘  │  · 接收任务 JSON     │   │  │
│  │                │  · 解析发布流程      │   │  │
│  │  ┌──────────┐  │  · 执行触控注入      │   │  │
│  │  │ Tailscale│  │  · 截图 + 上报状态   │   │  │
│  │  └──────────┘  └──────────┬───────────┘   │  │
│  │                           │                │  │
│  │                  触控注入方式：              │  │
│  │                  ┌─────────┴──────────┐    │  │
│  │                  │        │          │    │  │
│  │           无障碍服务  │  adb shell    │    │  │
│  │           (优先)      │  (root 兜底)   │    │  │
│  └───────────────────────┼──────────────┘────┘  │
│                          │                      │
│    抖音 / 快手 / 小红书 App                      │
│    界面操作 + 上传 + 发布                        │
└─────────────────────────────────────────────────┘
```

### 4.2 触控注入方案

| 方案 | 条件 | 优先级 |
|------|------|--------|
| Android 无障碍服务 App | 安装自定义无障碍服务 APK | **优先使用** |
| ADB shell input | 手机 root、或 USB 调试授权 | root 可用时兜底 |

**风险说明**：Termux 内运行 `adb shell input tap` 操作自身 App 在无 root 环境下可能失败。因此一期采用**无障碍服务优先**策略——开发一个轻量 Android App 注册无障碍服务，通过 HTTP 接口接收 Termux 的触控指令并注入。

### 4.3 发布流程模板（JSON）

```json
{
  "platform": "douyin",
  "actions": [
    { "type": "launch", "package": "com.ss.android.ugc.aweme" },
    { "type": "wait", "ms": 2000 },
    { "type": "tap", "x": 540, "y": 2200, "desc": "点击+号" },
    { "type": "wait", "ms": 1000 },
    { "type": "tap", "x": 540, "y": 1900, "desc": "选择视频" },
    { "type": "wait", "ms": 2000 },
    { "type": "system_picker", "video_path": "{{video_path}}" },
    { "type": "wait", "ms": 3000 },
    { "type": "tap", "x": 540, "y": 200, "desc": "点击标题框" },
    { "type": "input_text", "content": "{{title}}" },
    { "type": "tap", "x": 1000, "y": 2200, "desc": "点击发布" },
    { "type": "wait", "ms": 5000 },
    { "type": "screenshot", "name": "publish_result" }
  ],
  "params": {
    "video_path": "/sdcard/videos/output.mp4",
    "title": "#AI视频 #自动生成"
  }
}
```

### 4.4 安全隔离

| 措施 | 说明 |
|------|------|
| Tailscale ACL | 限定手机只能访问服务器 MQTT 端口 (1883) |
| MQTT Topic 隔离 | 每台手机独立 topic `phone/{id}/task`、`phone/{id}/status` |
| MinIO presigned URL | 视频文件通过临时签名 URL 传输，手机直接下载 |
| Termux 最小权限 | 只跑 Agent 进程，不开 SSH |

---

## 5. MQTT 通信协议

### 5.1 Topic 设计

```
phone/{phone_id}/task          ← 服务器下发发布任务 (JSON)
phone/{phone_id}/status        → 手机上报执行状态 (JSON)
phone/{phone_id}/screenshot    → 手机回传截图 (URL 或 base64)
phone/{phone_id}/heartbeat     → 手机心跳 (30s)
phone/{phone_id}/cmd           ← 服务器下发控制指令 (restart/update/stop)
```

### 5.2 消息格式

**task（服务器→手机）**

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
  "actions": [...]
}
```

**status（手机→服务器）**

```json
{
  "task_id": "task_20260429_001",
  "phone_id": "phone_01",
  "status": "downloading|publishing|success|failed",
  "step": "upload_video",
  "progress_pct": 60,
  "error": null,
  "screenshot_url": "https://minio.xxx.com/screenshots/task_001_step3.png",
  "timestamp": 1714387200
}
```

### 5.3 心跳与健康检查

| 机制 | 参数 | 说明 |
|------|------|------|
| 心跳间隔 | 30s | 手机定时发 PING |
| 离线判定 | 90s (3 次超时) | 服务器标记 OFFLINE |
| 重连策略 | 指数退避 1s→2s→4s→... max 60s | MQTT 自动重连 |
| 心跳内容 | `{phone_id, battery, storage_free_mb}` | 附带设备健康信息 |

---

## 6. OpenClaw Skill 设计

### 6.1 Skill 执行流程

```
用户对话: "生成一个科技类视频发抖音"
          │
          ▼
┌─────────────────────┐
│ 意图识别             │  解析: 类型=科技, 平台=抖音
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ runninghub-gen      │  调 RunningHub API → 生成视频 → 上传 MinIO
│ Skill               │  输出: {video_url, duration, thumbnail_url}
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ video-postproc      │  FFmpeg 后处理(可选): 加水印/裁剪/字幕
│ Skill               │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ dispatch-agent      │  1. Redis 查询可用手机
│ Skill               │  2. MQTT 下发 task JSON
│                     │  3. 等待 status 回传
│                     │  4. 超时 5min → 告警
│                     │  5. 成功 → 通知用户
└─────────────────────┘
```

### 6.2 RunningHub Skill 内部流程

```
输入: {prompt, duration, style, resolution}
      │
      ▼
  POST /api/generate          ← 基于现有逆向成果的 API 调用
      │
      ▼
  轮询 GET /api/task/{id}     ← 每 10s 查一次，最多 15min
      │
      ▼
  下载视频 → 上传 MinIO
      │
      ▼
  输出: {video_url, duration, thumbnail_url}
```

### 6.3 文件结构

```
skills/runninghub/
├── skill.json          ← Skill 元数据
├── generate.js          ← 核心生成逻辑
├── api-client.js        ← RunningHub API 封装
└── templates/           ← 参数模板
    ├── tech-review.json
    ├── product-showcase.json
    └── talking-head.json

skills/dispatch/
├── skill.json
├── dispatch.js          ← 手机分发逻辑
└── device-registry.js   ← 设备状态管理 (Redis)

skills/video-postproc/
├── skill.json
└── postproc.js          ← FFmpeg 后处理
```

---

## 7. 部署方案

### 7.1 Linux 服务器

```bash
# 1. 基础依赖
apt install docker.io docker-compose tailscale
tailscale up --authkey=tskey-xxx

# 2. 拉取项目
git clone <repo-url> /opt/avatar-ai-video

# 3. 启动
cd /opt/avatar-ai-video/deploy
docker compose up -d
```

**docker-compose.yml 服务清单：**

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| mosquitto | eclipse-mosquitto:2 | 1883 | MQTT Broker |
| redis | redis:7-alpine | 6379 | 任务队列 + 设备注册 |
| minio | minio/minio | 9000,9001 | 视频/截图对象存储 |
| openclaw | openclaw/openclaw:latest | 3000 | AI 编排引擎 |

### 7.2 Android 手机

```
# 1. Termux (F-Droid 版)
pkg update && pkg upgrade
pkg install nodejs-lts

# 2. Tailscale (Google Play)
# 登录同账号

# 3. 无障碍服务 App (自研)
# 安装 a11y-agent.apk，授予无障碍权限

# 4. 部署 Agent
git clone <agent-repo-url>
cd phone-agent && npm install

# 5. 启动
node agent.js --phone-id=phone_01 --platform=douyin

# 6. 自启动
# 使用 Termux:Boot 插件
```

---

## 8. 验证方案

| 阶段 | 验证项 | 成功标准 |
|------|--------|---------|
| 服务器 | `docker compose up -d` | 所有容器 healthy |
| 网络 | 手机 ping 服务器 Tailscale IP | 延迟 < 100ms |
| MQTT | Agent 连接 Broker | 日志显示 `connected` |
| 任务下发 | 服务器发测试 JSON | 手机 3s 内收到 |
| 触控 | Agent 执行无障碍 tap | 目标 App 按钮被点击 |
| 端到端 | 完整发布任务 | 平台发布成功，截图回传 |

### 端到端验证脚本

```
# 服务器端手动触发
$ cd /opt/avatar-ai-video
$ node scripts/test-e2e.js --platform=douyin --phone=phone_01

预期输出:
[INFO] RunningHub: 生成任务已提交, task_id=rh_xxx
[INFO] RunningHub: 生成中... (10%)
[INFO] RunningHub: 生成完成, 视频已上传 MinIO
[INFO] Dispatch: 手机 phone_01 在线, 下发任务
[INFO] Dispatch: 手机 phone_01 下载视频中...
[INFO] Dispatch: 手机 phone_01 正在发布...
[INFO] Dispatch: 手机 phone_01 发布成功! 截图: https://minio/...
```

---

## 9. 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Termux 无 root 下 ADB 受限 | 无法触控注入 | 优先用无障碍服务 App |
| 国内平台风控检测自动化 | 账号限流/封禁 | 真人行为模拟（随机延迟、滑动轨迹）、多账号轮换 |
| RunningHub API 变更 | Skill 失效 | 基于现有逆向成果持续监控；浏览器兜底方案已预留 |
| Tailscale DERP 中继延迟高 | 通信变慢 | 国内 VPS 优先直连；延迟 > 200ms 时告警 |

---

## 10. 文件映射

| 组件 | 代码位置 |
|------|---------|
| Docker Compose 配置 | `deploy/docker-compose.yml` |
| MQTT 协议定义 | `shared/mqtt-protocol.js` |
| OpenClaw Skills | `skills/runninghub/` `skills/dispatch/` |
| 手机 Agent | `phone-agent/` (独立仓库或子目录) |
| 无障碍服务 App | `a11y-agent/` (Android 项目) |
| 发布流程模板 | `templates/platforms/{douyin|kuaishou|xhs}.json` |
| 现有 RunningHub 分析 | `scripts/analyze-runninghub.js` |
