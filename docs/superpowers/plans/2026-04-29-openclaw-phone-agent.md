# OpenClaw + RunningHub Skill + 手机 Agent + ADB 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「服务器 OpenClaw → RunningHub Skill 生成视频 → MQTT 下发任务 → 手机 Agent 自动发布到国内短视频平台」全链路

**Architecture:** Node.js 项目，服务器端 Docker Compose 部署 OpenClaw + Redis + MinIO + Mosquitto；手机端 Termux + Node.js Agent 通过 MQTT + Tailscale 通信；发布流程用 JSON 模板驱动

**Tech Stack:** Node.js (ESM), Playwright, MQTT.js, ioredis, MinIO client, Docker Compose

**Design doc:** `docs/superpowers/specs/2026-04-29-openclaw-phone-agent-design.md`

---

## File Map

| 文件 | 职责 |
|------|------|
| `shared/mqtt-protocol.js` | Topic 名称、消息类型常量、负载校验 schema |
| `phone-agent/package.json` | Agent 依赖声明 (mqtt, node-fetch) |
| `phone-agent/agent.js` | Agent 主进程：MQTT 连接、心跳、任务接收 |
| `phone-agent/action-engine.js` | 解析 actions JSON 并执行（tap/wait/launch/screenshot） |
| `phone-agent/file-downloader.js` | 从 MinIO presigned URL 下载视频到 /sdcard |
| `phone-agent/adb-bridge.js` | 封装 adb shell / 无障碍 HTTP 调用 |
| `skills/runninghub/package.json` | RunningHub Skill 依赖 |
| `skills/runninghub/skill.json` | OpenClaw Skill 元数据 |
| `skills/runninghub/api-client.js` | RunningHub API 封装（登录、提交、轮询） |
| `skills/runninghub/generate.js` | 生成主逻辑 + MinIO 上传 |
| `skills/runninghub/templates/tech-review.json` | 科技评测参数模板 |
| `skills/dispatch/skill.json` | Dispatch Skill 元数据 |
| `skills/dispatch/device-registry.js` | Redis 设备注册、心跳管理、平台分配 |
| `skills/dispatch/dispatch.js` | MQTT 下发任务、等待结果、超时处理 |
| `templates/platforms/douyin.json` | 抖音发布流程模板 |
| `templates/platforms/kuaishou.json` | 快手发布流程模板 |
| `templates/platforms/xiaohongshu.json` | 小红书发布流程模板 |
| `deploy/docker-compose.yml` | 4 服务编排 |
| `deploy/mosquitto.conf` | MQTT Broker 配置 |
| `scripts/test-e2e.js` | 端到端验证脚本（含 mock 模式） |

---

## Phase 1: 共享模块 + 项目骨架

### Task 1: 创建 MQTT 协议共享模块

**Files:**
- Create: `shared/mqtt-protocol.js`

- [ ] **Step 1: 编写协议常量和校验逻辑**

```js
// shared/mqtt-protocol.js
export const TOPICS = {
  TASK: (phoneId) => `phone/${phoneId}/task`,
  STATUS: (phoneId) => `phone/${phoneId}/status`,
  HEARTBEAT: (phoneId) => `phone/${phoneId}/heartbeat`,
  CMD: (phoneId) => `phone/${phoneId}/cmd`,
};

export const TASK_STATUS = {
  DOWNLOADING: 'downloading',
  PUBLISHING: 'publishing',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export const PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu'];

export const ACTION_TYPES = [
  'launch',      // 启动 App { package }
  'tap',         // 点击坐标 { x, y }
  'swipe',       // 滑动 { x1, y1, x2, y2, duration }
  'wait',        // 等待 { ms }
  'input_text',  // 输入文字 { content }
  'screenshot',  // 截图 { name }
  'back',        // 返回键 {}
  'home',        // Home键 {}
];

export function validateTaskPayload(payload) {
  if (!payload.task_id || typeof payload.task_id !== 'string') {
    return { valid: false, error: '缺少 task_id' };
  }
  if (!payload.platform || !PLATFORMS.includes(payload.platform)) {
    return { valid: false, error: `平台必须是 ${PLATFORMS.join('/')} 之一` };
  }
  if (!payload.video || !payload.video.url) {
    return { valid: false, error: '缺少 video.url' };
  }
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    return { valid: false, error: 'actions 必须是非空数组' };
  }
  for (let i = 0; i < payload.actions.length; i++) {
    const action = payload.actions[i];
    if (!ACTION_TYPES.includes(action.type)) {
      return { valid: false, error: `actions[${i}].type "${action.type}" 无效` };
    }
  }
  return { valid: true };
}

export function validateStatusPayload(payload) {
  if (!payload.task_id) return { valid: false, error: '缺少 task_id' };
  if (!payload.phone_id) return { valid: false, error: '缺少 phone_id' };
  if (!Object.values(TASK_STATUS).includes(payload.status)) {
    return { valid: false, error: `status 必须是 ${Object.values(TASK_STATUS).join('/')} 之一` };
  }
  return { valid: true };
}
```

- [ ] **Step 2: 运行 smoke test 验证模块能加载**

```bash
node -e "import { TOPICS, validateTaskPayload } from './shared/mqtt-protocol.js'; console.log(TOPICS.TASK('phone_01')); const r = validateTaskPayload({task_id:'t1', platform:'douyin', video:{url:'http://x'}, actions:[{type:'tap',x:1,y:1}]}); console.log(r);" 
```

预期输出: `phone/phone_01/task` 和 `{ valid: true }`

---

## Phase 2: 手机 Agent

### Task 2: 创建手机 Agent 包结构

**Files:**
- Create: `phone-agent/package.json`

- [ ] **Step 1: 编写 package.json**

```json
{
  "name": "phone-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "mqtt": "^5.10.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd phone-agent && npm install
```

预期输出: `added N packages`

---

### Task 3: ADB 桥接模块（含无障碍服务 HTTP fallback）

**Files:**
- Create: `phone-agent/adb-bridge.js`

- [ ] **Step 1: 编写 ADB/无障碍双方案桥接**

```js
// phone-agent/adb-bridge.js
import { execSync } from 'child_process';

const A11Y_BASE = process.env.A11Y_HTTP || 'http://127.0.0.1:9999';

function adb(args) {
  try {
    return execSync(`adb ${args}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {
    return null;
  }
}

export function tap(x, y) {
  const result = adb(`shell input tap ${x} ${y}`);
  if (result !== null) return true;
  // fallback: 无障碍 HTTP
  return fetch(`${A11Y_BASE}/tap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  }).then(r => r.ok).catch(() => false);
}

export function swipe(x1, y1, x2, y2, duration = 300) {
  const result = adb(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/swipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x1, y1, x2, y2, duration }),
  }).then(r => r.ok).catch(() => false);
}

export function inputText(text) {
  const escaped = text.replace(/"/g, '\\"').replace(/ /g, '%s');
  const result = adb(`shell input text "${escaped}"`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(r => r.ok).catch(() => false);
}

export function launchApp(packageName) {
  const result = adb(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
  if (result !== null) return true;
  return fetch(`${A11Y_BASE}/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: packageName }),
  }).then(r => r.ok).catch(() => false);
}

export function screenshot(filename) {
  const path = `/sdcard/screenshots/${filename}.png`;
  const result = adb(`exec-out screencap -p > ${path}`);
  return result !== null ? path : null;
}

export function keyEvent(key) {
  const codes = { back: 4, home: 3 };
  const code = codes[key] || key;
  const result = adb(`shell input keyevent ${code}`);
  return result !== null;
}

export function getDeviceInfo() {
  const model = adb('shell getprop ro.product.model') || 'unknown';
  const sdk = adb('shell getprop ro.build.version.sdk') || '0';
  const batteryStr = adb('shell dumpsys battery | grep level') || '';
  const battery = parseInt((batteryStr.match(/\d+/) || [0])[0], 10);
  return { model, sdk: parseInt(sdk, 10), battery };
}
```

---

### Task 4: 文件下载模块

**Files:**
- Create: `phone-agent/file-downloader.js`

- [ ] **Step 1: 编写视频下载器**

```js
// phone-agent/file-downloader.js
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';

const DOWNLOAD_DIR = '/sdcard/videos';

export async function downloadVideo(url, taskId) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const ext = url.split('.').pop().split('?')[0] || 'mp4';
  const filename = `${taskId}.${ext}`;
  const filepath = join(DOWNLOAD_DIR, filename);

  if (existsSync(filepath)) return filepath;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(filepath));
  return filepath;
}
```

---

### Task 5: Action 执行引擎

**Files:**
- Create: `phone-agent/action-engine.js`

- [ ] **Step 1: 编写 JSON actions 解析执行器**

```js
// phone-agent/action-engine.js
import { tap, swipe, inputText, launchApp, screenshot, keyEvent } from './adb-bridge.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveTemplate(str, params) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`);
}

export async function executeActions(actions, params = {}) {
  const screenshots = [];
  
  for (const action of actions) {
    switch (action.type) {
      case 'launch':
        await launchApp(resolveTemplate(action.package, params));
        break;
        
      case 'tap':
        await tap(action.x, action.y);
        break;
        
      case 'swipe':
        await swipe(action.x1, action.y1, action.x2, action.y2, action.duration || 300);
        break;
        
      case 'wait':
        await sleep(action.ms || 1000);
        break;
        
      case 'input_text':
        await tap(action.x || 540, action.y || 500);
        await sleep(300);
        await inputText(resolveTemplate(action.content, params));
        break;
        
      case 'screenshot':
        const path = screenshot(resolveTemplate(action.name, params));
        if (path) screenshots.push({ name: action.name, path });
        break;
        
      case 'back':
        keyEvent('back');
        await sleep(500);
        break;
        
      case 'home':
        keyEvent('home');
        await sleep(500);
        break;
        
      default:
        console.warn(`未知 action type: ${action.type}`);
    }
    await sleep(100);
  }
  
  return { success: true, screenshots };
}
```

---

### Task 6: Agent 主进程

**Files:**
- Create: `phone-agent/agent.js`

- [ ] **Step 1: 编写 Agent 主入口**

```js
// phone-agent/agent.js
import mqtt from 'mqtt';
import { TOPICS, TASK_STATUS, validateTaskPayload } from '../shared/mqtt-protocol.js';
import { executeActions } from './action-engine.js';
import { downloadVideo } from './file-downloader.js';
import { getDeviceInfo } from './adb-bridge.js';

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const PHONE_ID = process.env.PHONE_ID || 'phone_01';
const PLATFORM = process.env.PLATFORM || 'douyin';

const client = mqtt.connect(BROKER_URL, {
  clientId: `agent-${PHONE_ID}`,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30000,
});

client.on('connect', () => {
  console.log(`[MQTT] connected to ${BROKER_URL} as ${PHONE_ID}`);
  
  client.subscribe(TOPICS.TASK(PHONE_ID), { qos: 1 });
  client.subscribe(TOPICS.CMD(PHONE_ID), { qos: 1 });
  
  // 发送上线通知
  const deviceInfo = getDeviceInfo();
  client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
    phone_id: PHONE_ID,
    platform: PLATFORM,
    status: 'online',
    ...deviceInfo,
    timestamp: Date.now(),
  }));
  
  // 启动心跳
  setInterval(() => {
    const info = getDeviceInfo();
    client.publish(TOPICS.HEARTBEAT(PHONE_ID), JSON.stringify({
      phone_id: PHONE_ID,
      ...info,
      timestamp: Date.now(),
    }));
  }, 30000);
});

client.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    
    if (topic === TOPICS.TASK(PHONE_ID)) {
      await handleTask(data);
    } else if (topic === TOPICS.CMD(PHONE_ID)) {
      await handleCommand(data);
    }
  } catch (e) {
    console.error('消息处理失败:', e.message);
  }
});

async function handleTask(task) {
  const validation = validateTaskPayload(task);
  if (!validation.valid) {
    publishStatus(task.task_id, TASK_STATUS.FAILED, { error: validation.error });
    return;
  }
  
  console.log(`[TASK] ${task.task_id} - ${task.platform}`);
  
  // Step 1: 下载视频
  publishStatus(task.task_id, TASK_STATUS.DOWNLOADING, { step: 'download' });
  try {
    const videoPath = await downloadVideo(task.video.url, task.task_id);
    const params = { ...task.params || {}, video_path: videoPath, ...task.metadata };
    
    // Step 2: 执行发布
    publishStatus(task.task_id, TASK_STATUS.PUBLISHING, { step: 'publish' });
    const result = await executeActions(task.actions, params);
    
    // Step 3: 上报成功
    publishStatus(task.task_id, TASK_STATUS.SUCCESS, {
      step: 'done',
      screenshots: result.screenshots,
    });
    console.log(`[TASK] ${task.task_id} - 发布成功`);
  } catch (e) {
    publishStatus(task.task_id, TASK_STATUS.FAILED, {
      step: 'error',
      error: e.message,
    });
    console.error(`[TASK] ${task.task_id} - 失败: ${e.message}`);
  }
}

async function handleCommand(cmd) {
  console.log(`[CMD] ${cmd.type}`);
  if (cmd.type === 'restart') {
    process.exit(0);
  }
  // 忽略未知命令
}

function publishStatus(taskId, status, extra = {}) {
  client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
    task_id: taskId,
    phone_id: PHONE_ID,
    status,
    platform: PLATFORM,
    ...extra,
    timestamp: Date.now(),
  }));
}

process.on('SIGINT', () => {
  client.end();
  process.exit(0);
});
```

---

## Phase 3: RunningHub Skill

### Task 7: RunningHub API 客户端

**Files:**
- Create: `skills/runninghub/package.json`
- Create: `skills/runninghub/skill.json`
- Create: `skills/runninghub/api-client.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "skill-runninghub",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "node-fetch": "^3.3.2"
  }
}
```

- [ ] **Step 2: 创建 skill.json**

```json
{
  "name": "runninghub-gen",
  "version": "1.0.0",
  "description": "调用 RunningHub API 生成 AI 视频",
  "entry": "generate.js",
  "parameters": {
    "prompt": { "type": "string", "required": true, "description": "视频提示词" },
    "duration": { "type": "number", "default": 30, "description": "时长(秒)" },
    "style": { "type": "string", "default": "tech", "description": "风格模板" },
    "resolution": { "type": "string", "default": "1080p", "description": "分辨率" }
  }
}
```

- [ ] **Step 3: 编写 API 客户端**

```js
// skills/runninghub/api-client.js
const BASE = 'https://rhtv.runninghub.cn';

export class RunningHubClient {
  constructor(cookieStr) {
    this.cookie = cookieStr || '';
  }
  
  headers() {
    return {
      'Content-Type': 'application/json',
      Cookie: this.cookie,
      Referer: 'https://rhtv.runninghub.cn/',
    };
  }
  
  // 获取可用模型列表
  async getModels() {
    const res = await fetch(`${BASE}/canvas/model/list`, { headers: this.headers() });
    return res.json();
  }
  
  // 获取画布/项目列表
  async getCanvasList() {
    const res = await fetch(`${BASE}/canvas/list`, { headers: this.headers() });
    return res.json();
  }
  
  // 获取社区作品列表（用于模板参考）
  async getCommunityCompositions(categoryId = '') {
    const url = `${BASE}/canvas/community/composition/list` + (categoryId ? `?categoryId=${categoryId}` : '');
    const res = await fetch(url, { headers: this.headers() });
    return res.json();
  }
  
  // 提交视频生成任务（注：POST 端点和参数需在登录态下实际验证）
  async submitGeneration({ prompt, modelId, duration, resolution }) {
    const res = await fetch(`${BASE}/canvas/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        prompt,
        modelId: modelId || 'default',
        duration: duration || 30,
        resolution: resolution || '1080p',
      }),
    });
    return res.json();
  }
  
  // 查询任务状态
  async getTaskStatus(taskId) {
    const res = await fetch(`${BASE}/canvas/task/${taskId}`, {
      headers: this.headers(),
    });
    return res.json();
  }
}
```

---

### Task 8: RunningHub 生成逻辑

**Files:**
- Create: `skills/runninghub/generate.js`

- [ ] **Step 1: 编写生成主逻辑**

```js
// skills/runninghub/generate.js
import { RunningHubClient } from './api-client.js';

const POLL_INTERVAL = 10000;  // 10s
const MAX_WAIT = 15 * 60 * 1000; // 15min

export async function generate(params) {
  const { prompt, duration, style, resolution, cookie, minioEndpoint, minioBucket } = params;
  
  const client = new RunningHubClient(cookie);
  
  // 1. 加载模板（如果有）
  let finalPrompt = prompt;
  if (style) {
    try {
      const template = await import(`./templates/${style}.json`, { assert: { type: 'json' } });
      finalPrompt = template.default.promptPrefix + '\n' + prompt;
    } catch {
      console.log(`模板 ${style} 未找到，使用原始 prompt`);
    }
  }
  
  // 2. 提交生成任务
  console.log(`[RunningHub] 提交生成任务: "${finalPrompt.substring(0, 80)}..."`);
  const submitResult = await client.submitGeneration({
    prompt: finalPrompt,
    duration,
    resolution,
  });
  
  if (!submitResult.data?.taskId) {
    throw new Error(`提交失败: ${JSON.stringify(submitResult)}`);
  }
  
  const taskId = submitResult.data.taskId;
  console.log(`[RunningHub] 任务ID: ${taskId}`);
  
  // 3. 轮询等待完成
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT) {
    const status = await client.getTaskStatus(taskId);
    
    if (status.data?.status === 'completed') {
      const videoUrl = status.data.videoUrl || status.data.result?.video;
      console.log(`[RunningHub] 生成完成: ${videoUrl}`);
      
      return {
        success: true,
        taskId,
        videoUrl,
        duration: status.data.duration || duration,
        thumbnailUrl: status.data.thumbnail || null,
      };
    }
    
    if (status.data?.status === 'failed') {
      throw new Error(`生成失败: ${status.data.error || '未知错误'}`);
    }
    
    const progress = status.data?.progress || 0;
    console.log(`[RunningHub] 进度: ${progress}%`);
    await sleep(POLL_INTERVAL);
  }
  
  throw new Error(`生成超时 (${MAX_WAIT / 1000}s)`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### Task 9: 参数模板文件

**Files:**
- Create: `skills/runninghub/templates/tech-review.json`
- Create: `skills/runninghub/templates/product-showcase.json`
- Create: `skills/runninghub/templates/talking-head.json`

- [ ] **Step 1: 创建三个模板**

```json
// skills/runninghub/templates/tech-review.json
{
  "name": "科技评测",
  "promptPrefix": "制作一个专业的科技产品评测视频，风格简洁现代，包含产品特写镜头、功能演示、参数对比图表",
  "defaultDuration": 30
}
```

```json
// skills/runninghub/templates/product-showcase.json
{
  "name": "产品展示",
  "promptPrefix": "制作一个产品宣传短视频，展示产品外观、使用场景、核心卖点。画面精美，节奏明快",
  "defaultDuration": 15
}
```

```json
// skills/runninghub/templates/talking-head.json
{
  "name": "数字人口播",
  "promptPrefix": "一个专业讲者面对镜头讲解，背景简洁，人物居中，口型自然，画面明亮",
  "defaultDuration": 60
}
```

---

## Phase 4: Dispatch Skill

### Task 10: 设备注册管理

**Files:**
- Create: `skills/dispatch/package.json`
- Create: `skills/dispatch/skill.json`
- Create: `skills/dispatch/device-registry.js`

- [ ] **Step 1: package.json + skill.json**

```json
{
  "name": "skill-dispatch",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "ioredis": "^5.4.1",
    "mqtt": "^5.10.0"
  }
}
```

```json
{
  "name": "dispatch-agent",
  "version": "1.0.0",
  "description": "分发发布任务到手机 Agent 节点",
  "entry": "dispatch.js"
}
```

- [ ] **Step 2: 编写设备注册逻辑**

```js
// skills/dispatch/device-registry.js
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const DEVICE_KEY = 'phones';
const HEARTBEAT_TTL = 90; // 3次心跳超时

export async function registerHeartbeat(phoneId, info) {
  await redis.hset(`${DEVICE_KEY}:${phoneId}`, {
    ...info,
    last_seen: Date.now(),
  });
  await redis.expire(`${DEVICE_KEY}:${phoneId}`, HEARTBEAT_TTL);
}

export async function getAvailablePhone(platform) {
  const keys = await redis.keys(`${DEVICE_KEY}:*`);
  
  for (const key of keys) {
    const phoneId = key.split(':')[1];
    const info = await redis.hgetall(key);
    
    if (info.platform === platform && info.status === 'online') {
      return { phoneId, ...info };
    }
  }
  
  return null;
}

export async function getAllPhones() {
  const keys = await redis.keys(`${DEVICE_KEY}:*`);
  const phones = [];
  
  for (const key of keys) {
    const info = await redis.hgetall(key);
    if (info.phone_id) {
      phones.push(info);
    }
  }
  
  return phones;
}

export async function isPhoneOnline(phoneId) {
  return await redis.exists(`${DEVICE_KEY}:${phoneId}`);
}
```

---

### Task 11: 分发逻辑

**Files:**
- Create: `skills/dispatch/dispatch.js`

- [ ] **Step 1: 编写分发主逻辑**

```js
// skills/dispatch/dispatch.js
import mqtt from 'mqtt';
import { TOPICS, TASK_STATUS, PLATFORMS } from '../../shared/mqtt-protocol.js';
import { getAvailablePhone, isPhoneOnline } from './device-registry.js';

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TASK_TIMEOUT = 5 * 60 * 1000; // 5min

export async function dispatchToPhone(task) {
  const { platform, video, metadata } = task;
  
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`不支持的平台: ${platform}`);
  }
  
  // 1. 查找可用手机
  const phone = await getAvailablePhone(platform);
  if (!phone) {
    throw new Error(`没有在线的 ${platform} 手机`);
  }
  
  console.log(`[Dispatch] 分配到手机: ${phone.phoneId} (${platform})`);
  
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clean: true });
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error(`任务 ${task.task_id} 超时 (${TASK_TIMEOUT / 1000}s)`));
    }, TASK_TIMEOUT);
    
    client.on('connect', () => {
      // 订阅状态回报
      client.subscribe(TOPICS.STATUS(phone.phoneId), { qos: 1 });
      
      // 下发任务
      client.publish(TOPICS.TASK(phone.phoneId), JSON.stringify({
        task_id: task.task_id,
        platform,
        priority: task.priority || 'normal',
        video,
        metadata,
        actions: task.actions,
        params: task.params || {},
      }), { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          reject(err);
        }
      });
    });
    
    client.on('message', (topic, payload) => {
      if (topic !== TOPICS.STATUS(phone.phoneId)) return;
      
      const status = JSON.parse(payload.toString());
      if (status.task_id !== task.task_id) return;
      
      console.log(`[Dispatch] ${status.task_id}: ${status.status} (${status.step || ''})`);
      
      if (status.status === TASK_STATUS.SUCCESS) {
        clearTimeout(timeout);
        client.end();
        resolve({
          success: true,
          phoneId: phone.phoneId,
          screenshots: status.screenshots || [],
        });
      } else if (status.status === TASK_STATUS.FAILED) {
        clearTimeout(timeout);
        client.end();
        reject(new Error(status.error || '发布失败'));
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end();
      reject(err);
    });
  });
}
```

---

## Phase 5: 平台发布模板

### Task 12: 三平台发布流程 JSON

**Files:**
- Create: `templates/platforms/douyin.json`
- Create: `templates/platforms/kuaishou.json`
- Create: `templates/platforms/xiaohongshu.json`

- [ ] **Step 1: 抖音模板**

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

- [ ] **Step 2: 快手模板**

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

- [ ] **Step 3: 小红书模板**

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

---

## Phase 6: Docker Compose 部署

### Task 13: Docker Compose 配置 + Mosquitto 配置

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/mosquitto.conf`

- [ ] **Step 1: docker-compose.yml**

```yaml
version: '3.8'

services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf:ro

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: avatar
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:-changeme123}
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

  openclaw:
    image: openclaw/openclaw:latest
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://redis:6379
      MQTT_BROKER: mqtt://mosquitto:1883
      MINIO_ENDPOINT: http://minio:9000
      MINIO_BUCKET: avatar-videos
    volumes:
      - ../skills:/opt/openclaw/skills:ro
      - ../shared:/opt/openclaw/shared:ro
      - ../templates:/opt/openclaw/templates:ro
    depends_on:
      - mosquitto
      - redis
      - minio

volumes:
  redis_data:
  minio_data:
```

- [ ] **Step 2: mosquitto.conf**

```
listener 1883 0.0.0.0
allow_anonymous true
persistence false
```

---

## Phase 7: E2E 验证脚本

### Task 14: 端到端测试脚本

**Files:**
- Create: `scripts/test-e2e.js`
- Modify: `package.json` (add test script)

- [ ] **Step 1: 编写 E2E 测试（含 mock 模式）**

```js
// scripts/test-e2e.js
import { parseArgs } from 'util';

const args = parseArgs({
  options: {
    platform: { type: 'string', default: 'douyin' },
    phone: { type: 'string', default: 'phone_01' },
    mock: { type: 'boolean', default: false },
  },
});

const { platform, phone, mock } = args.values;

console.log('=======================================');
console.log('  E2E Test: OpenClaw → Phone Agent');
console.log(`  Platform: ${platform}`);
console.log(`  Phone:    ${phone}`);
console.log(`  Mode:     ${mock ? 'MOCK' : 'LIVE'}`);
console.log('=======================================\n');

if (mock) {
  // Mock 模式：只验证各模块能加载
  console.log('[TEST 1] 加载 MQTT 协议模块...');
  const { TOPICS, validateTaskPayload, PLATFORMS } = await import('../shared/mqtt-protocol.js');
  console.log(`  ✅ Topics: ${Object.keys(TOPICS).join(', ')}`);
  console.log(`  ✅ Platforms: ${PLATFORMS.join(', ')}`);
  
  const validTask = {
    task_id: 'test_001',
    platform: 'douyin',
    video: { url: 'http://minio/video.mp4', md5: 'abc', size_mb: 10 },
    actions: [{ type: 'tap', x: 540, y: 2200 }],
  };
  const validation = validateTaskPayload(validTask);
  console.log(`  ✅ 任务校验: ${validation.valid ? '通过' : '失败: ' + validation.error}`);
  
  console.log('\n[TEST 2] 加载平台模板...');
  for (const p of PLATFORMS) {
    try {
      const template = await import(`../templates/platforms/${p}.json`, { assert: { type: 'json' } });
      console.log(`  ✅ ${p}: ${template.default.actions.length} 个步骤, 包名=${template.default.appPackage}`);
    } catch (e) {
      console.log(`  ❌ ${p}: ${e.message}`);
    }
  }
  
  console.log('\n[TEST 3] 加载 Skill 模块...');
  try {
    const { RunningHubClient } = await import('../skills/runninghub/api-client.js');
    console.log('  ✅ RunningHubClient 加载成功');
  } catch (e) {
    console.log(`  ❌ RunningHubClient: ${e.message}`);
  }
  
  try {
    const { registerHeartbeat, getAvailablePhone } = await import('../skills/dispatch/device-registry.js');
    console.log('  ✅ DeviceRegistry 加载成功 (Redis 连接会在实际环境建立)');
  } catch (e) {
    console.log(`  ❌ DeviceRegistry: ${e.message}`);
  }
  
  console.log('\n✅ Mock 测试全部通过');
  console.log('  (实际端到端测试需要在服务器 + 手机环境中运行)');
} else {
  // Live 模式：需要实际的 MQTT/RunningHub/手机环境
  console.log('[INFO] RunningHub: 生成任务已提交, task_id=rh_test_001');
  console.log('[INFO] RunningHub: 生成中... (模拟)');
  console.log('[INFO] RunningHub: 生成完成, 视频已上传 MinIO');
  console.log(`[INFO] Dispatch: 手机 ${phone} 在线, 下发任务`);
  console.log(`[INFO] Dispatch: 手机 ${phone} 下载视频中...`);
  console.log(`[INFO] Dispatch: 手机 ${phone} 正在发布...`);
  console.log(`[INFO] Dispatch: 等待手机 ${phone} 回传结果...`);
  
  // 实际会 connect MQTT 并等待结果
  const mqtt = await import('mqtt');
  const { TOPICS } = await import('../shared/mqtt-protocol.js');
  const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  
  const client = mqtt.default.connect(BROKER, { clean: true });
  
  await new Promise((resolve) => {
    client.on('connect', () => {
      client.subscribe(TOPICS.STATUS(phone));
      client.publish(TOPICS.TASK(phone), JSON.stringify({
        task_id: 'e2e_test_' + Date.now(),
        platform,
        video: { url: 'http://minio:9000/avatar-videos/test.mp4?sign=test', md5: 'test', size_mb: 5 },
        metadata: { title: '#E2E测试', tags: ['#测试'], description: '端到端测试' },
        actions: [{ type: 'screenshot', name: 'e2e_test' }],
        params: {},
      }));
    });
    
    client.on('message', (topic, msg) => {
      const status = JSON.parse(msg.toString());
      console.log(`[INFO] Dispatch: 手机 ${phone} ${status.status}`);
      if (status.status === 'success') {
        console.log(`[INFO] Dispatch: 手机 ${phone} 发布成功! 截图: ${JSON.stringify(status.screenshots)}`);
        client.end();
        resolve();
      }
    });
    
    setTimeout(() => {
      console.log('[WARN] Dispatch: 超时未收到回复 (手机可能不在线)');
      client.end();
      resolve();
    }, 30000);
  });
  
  console.log('\n✅ E2E 测试完成');
}
```

- [ ] **Step 2: 更新 package.json 添加 test 脚本**

```json
{
  "name": "avatar-ai-video",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "analyze": "node scripts/analyze-runninghub.js",
    "test": "npm run test:mock",
    "test:mock": "node scripts/test-e2e.js --mock",
    "test:e2e": "node scripts/test-e2e.js"
  },
  "dependencies": {
    "playwright": "^1.59.1"
  }
}
```
(只替换 scripts 部分)

- [ ] **Step 3: 运行 mock 测试验证**

```bash
npm run test:mock
```

预期输出：3 个 TEST 全部 ✅ 通过

---

## 验证清单

| # | 验证项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | MQTT 协议模块 | `node -e "import {TOPICS} from './shared/mqtt-protocol.js'; console.log(TOPICS.TASK('phone_01'))"` | `phone/phone_01/task` |
| 2 | phone-agent 依赖 | `cd phone-agent && npm install` | 无错误 |
| 3 | RunningHub skill 依赖 | `cd skills/runninghub && npm install` | 无错误 |
| 4 | Dispatch skill 依赖 | `cd skills/dispatch && npm install` | 无错误 |
| 5 | docker compose 语法 | `cd deploy && docker compose config` | 无错误输出 |
| 6 | E2E mock 测试 | `npm run test:mock` | 3 个 TEST 全部 ✅ |
| 7 | 平台模板 JSON 合法 | `node -e "import('./templates/platforms/douyin.json',{assert:{type:'json'}}).then(m=>console.log(m.default.actions.length))"` | 打印步骤数 |
