# Phase 1：接通 OpenClaw 视频生成 + 分发链路

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 submit 流程从「绕过 OpenClaw 直接分发占位视频」修复为「OpenClaw 生成视频 → OpenClaw 控制手机发布」的完整链路。

**Architecture:** submit 路由改为调用 `submitTaskToOpenClaw()`，由 OpenClaw 内部依次执行 runninghub-gen skill（视频生成）和 dispatch-agent skill（多平台分发）。统一 creator-api 和 skill 层两套分发逻辑，消除 task-dispatcher.js 的冗余实现。

**Tech Stack:** Node.js + Express, OpenClaw (Docker), RunningHub API, MQTT (Mosquitto), Redis

**前置条件：** OpenClaw 服务通过 `deploy/docker-compose.yml` 正常启动，环境变量正确配置。

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| **修改** | `creator-api/routes/submit.js` | 将 `dispatchTask()` 替换为 `submitTaskToOpenClaw()` |
| **修改** | `creator-api/services/openclaw-proxy.js` | 增加超时控制、错误细化、返回结构增强 |
| **修改** | `skills/dispatch/dispatch.js` | 增加多平台并行分发能力、统一 task-dispatcher 逻辑 |
| **删除/简化** | `creator-api/services/task-dispatcher.js` | 移除冗余分发逻辑，保留为兼容桥 |
| **修改** | `creator-api/services/session-manager.js` | 增加 `taskStatus` 字段，支持轮询 |
| **修改** | `creator-api/routes/sessions.js` | `/status` 端点返回 taskStatus 详情 |
| **新增** | `creator-api/services/task-store.js` | 任务状态独立持久化，不依赖 session TTL |

---

### Task 1: submit.js 改为调用 submitTaskToOpenClaw()

**Files:**
- Modify: `creator-api/routes/submit.js`
- Modify: `creator-api/services/openclaw-proxy.js`

**当前问题：** [submit.js:L4](file:///e:/cusorspace/avatar-ai-video/creator-api/routes/submit.js#L4) 导入 `dispatchTask` 直接跳到分发，跳过视频生成，且 `dispatchTask` 使用占位视频 URL [task-dispatcher.js:L18](file:///e:/cusorspace/avatar-ai-video/creator-api/services/task-dispatcher.js#L18)。

**目标：** submit 调用 `submitTaskToOpenClaw()`，由 OpenClaw 内部依次执行 runninghub-gen → dispatch-agent。

- [ ] **Step 1: 增强 submitTaskToOpenClaw() 的超时和状态上报**

`creator-api/services/openclaw-proxy.js` — 替换 `submitTaskToOpenClaw()` 函数：

```javascript
export async function submitTaskToOpenClaw(session) {
  const taskPayload = {
    type: 'video_creation',
    context: session.context,
    files: session.files,
    sessionId: session.id,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (OPENCLAW_TOKEN) headers['Authorization'] = 'Bearer ' + OPENCLAW_TOKEN;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'openclaw',
        messages: [{
          role: 'system',
          content: [
            `用户已确认以下视频创作需求，请按顺序执行：`,
            ``,
            `## 需求信息`,
            `\`\`\`json`,
            JSON.stringify(taskPayload, null, 2),
            `\`\`\``,
            ``,
            `## 执行步骤`,
            `1. 调用 runninghub-gen skill 生成视频`,
            `   - 参数来自 context: prompt/content, duration, style, resolution`,
            `   - 拿到返回的 videoUrl 后进入下一步`,
            `2. 对 context.platforms 中的每个平台，调用 dispatch-agent skill 分发视频`,
            `   - 每次调用传入 platform、videoUrl、metadata`,
            `3. 汇总所有平台的分发结果`,
            `4. 最终返回 JSON：{"videoUrl":"...","results":[{"platform":"douyin","success":true},...]}`,
          ].join('\n'),
        }, {
          role: 'user',
          content: `请开始执行视频创作和发布任务。sessionId: ${session.id}`,
        }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenClaw 返回错误 HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const result = await response.json();
    const taskId = result.id || `task_${Date.now()}`;

    return {
      taskId,
      videoUrl: result.videoUrl || result.data?.videoUrl || null,
      results: result.results || result.data?.results || [],
      raw: result,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('OpenClaw 任务提交超时（120s），视频生成可能仍在进行中');
    }
    throw new Error(`OpenClaw 提交失败: ${e.message}`);
  }
}
```

- [ ] **Step 2: 修改 submit.js 路由使用新函数**

`creator-api/routes/submit.js` — 完整替换：

```javascript
import { Router } from 'express';
import { withSession } from '../middleware/round-guard.js';
import { updateSession } from '../services/session-manager.js';
import { submitTaskToOpenClaw } from '../services/openclaw-proxy.js';

export const submitRouter = Router();

submitRouter.post('/:id/submit', withSession(), async (req, res) => {
  try {
    const session = req.session;

    await updateSession(session.id, { status: 'generating' });

    const result = await submitTaskToOpenClaw(session);

    await updateSession(session.id, {
      status: 'completed',
      taskId: result.taskId,
      videoUrl: result.videoUrl || '',
    });

    res.json({
      success: true,
      taskId: result.taskId,
      videoUrl: result.videoUrl,
      results: result.results,
      estimatedMinutes: 20,
    });
  } catch (e) {
    console.error('[submit] 任务提交失败:', e.message);
    await updateSession(req.session.id, { status: 'failed' }).catch(() => {});
    res.status(500).json({ success: false, error: `任务提交失败: ${e.message}` });
  }
});
```

- [ ] **Step 3: 验证导入路径**

`creator-api/routes/submit.js` 移除了对 `../services/task-dispatcher.js` 的导入，确认 `openclaw-proxy.js` 的导入正确。

- [ ] **Step 4: 运行 Lint 检查**

```bash
cd e:\cusorspace\avatar-ai-video\creator-api && npx eslint routes/submit.js services/openclaw-proxy.js --fix
```

---

### Task 2: OpenClaw dispatch skill 支持多平台并行分发

**Files:**
- Modify: `skills/dispatch/dispatch.js`

**当前问题：** [dispatch.js:L8](file:///e:/cusorspace/avatar-ai-video/skills/dispatch/dispatch.js#L8) 的 `dispatchToPhone()` 每次只处理单个平台，多平台需要 OpenClaw 多次调用。效率低且各平台串行。

**目标：** 增加 `dispatchToMultiplePhones()` 函数，并行分发到多个平台，同时保留单平台函数兼容性。

- [ ] **Step 1: 新增多平台并行分发函数**

在 `skills/dispatch/dispatch.js` 末尾追加：

```javascript
export async function dispatchToMultiplePhones(taskList) {
  if (!Array.isArray(taskList) || taskList.length === 0) {
    throw new Error('taskList 必须是非空数组');
  }

  console.log(`[Dispatch] 开始并行分发到 ${taskList.length} 个平台`);

  const promises = taskList.map(async (task) => {
    try {
      const result = await dispatchToPhone(task);
      return { platform: task.platform, success: true, ...result };
    } catch (e) {
      console.error(`[Dispatch] ${task.platform} 分发失败:`, e.message);
      return { platform: task.platform, success: false, error: e.message };
    }
  });

  const results = await Promise.all(promises);
  const succeeded = results.filter((r) => r.success).length;
  console.log(`[Dispatch] 分发完成: ${succeeded}/${results.length} 成功`);

  return { results, totalCount: results.length, successCount: succeeded };
}
```

- [ ] **Step 2: 确认原 dispatchToPhone() 不变**

原有的 [dispatchToPhone()](file:///e:/cusorspace/avatar-ai-video/skills/dispatch/dispatch.js#L8) 函数保持不变，`dispatchToMultiplePhones()` 内部调用它实现并行分发。

---

### Task 3: 精简 task-dispatcher.js 为兼容桥

**Files:**
- Modify: `creator-api/services/task-dispatcher.js`

**当前问题：** `task-dispatcher.js` 有完整的分发逻辑（设备发现 + MQTT 发布 + 状态等待），与 `skills/dispatch/dispatch.js` 功能重复，且使用占位视频 URL。

**目标：** 将 `dispatchTask()` 改为调用 OpenClaw 代理的兼容桥接函数。如果其他地方还在引用它，保持向后兼容；如果没有其他引用，标记为 deprecated。

- [ ] **Step 1: 重写 dispatchTask 为兼容桥**

`creator-api/services/task-dispatcher.js` — 完整替换：

```javascript
import { submitTaskToOpenClaw } from './openclaw-proxy.js';

export async function dispatchTask(session) {
  const result = await submitTaskToOpenClaw(session);
  return {
    taskId: result.taskId,
    results: result.results,
  };
}

export async function dispatchToSinglePlatform(platform, videoUrl, metadata) {
  const mqtt = await import('mqtt');
  const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://mosquitto:1883';
  const TASK_TIMEOUT = 5 * 60 * 1000;
  const PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu'];

  if (!PLATFORMS.includes(platform)) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  return new Promise((resolve, reject) => {
    const client = mqtt.default.connect(BROKER_URL, { clean: true, connectTimeout: 5000 });
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error(`任务 ${taskId} 超时`));
    }, TASK_TIMEOUT);

    client.on('connect', () => {
      client.subscribe('phone/+/heartbeat', { qos: 0 });
    });

    client.on('message', (topic, payload) => {
      try {
        const match = topic.match(/^phone\/(.+)\/heartbeat$/);
        if (!match) return;
        const phoneId = match[1];
        const data = JSON.parse(payload.toString());
        if (data.platforms && data.platforms.includes(platform)) {
          client.unsubscribe('phone/+/heartbeat');
          const statusTopic = `phone/${phoneId}/status`;
          const taskTopic = `phone/${phoneId}/task`;

          client.subscribe(statusTopic, { qos: 1 });
          client.publish(taskTopic, JSON.stringify({
            task_id: taskId,
            platform,
            priority: 'normal',
            video: { url: videoUrl },
            metadata,
            actions: buildPlatformActions(platform, metadata.caption || ''),
          }), { qos: 1 });
        }
      } catch {}
    });

    setTimeout(() => {
      if (!client.connected) {
        client.end();
        resolve(null);
      }
    }, 3000);
  });
}

function buildPlatformActions(platform, caption) {
  const pkgs = {
    douyin: 'com.ss.android.ugc.aweme',
    kuaishou: 'com.kuaishou.nebula',
    xiaohongshu: 'com.xingin.xhs',
  };
  return [
    { type: 'launch', package: pkgs[platform] || '' },
    { type: 'wait', ms: 3000 },
    { type: 'tap', x: 540, y: 200 },
    { type: 'input_text', text: caption },
    { type: 'wait', ms: 1000 },
    { type: 'tap', x: 540, y: 1800 },
    { type: 'wait', ms: 15000 },
    { type: 'screenshot' },
  ];
}
```

- [ ] **Step 2: 验证引用路径**

确认 `submit.js` 不再直接 import `task-dispatcher.js`，搜索全项目引用：

```bash
cd e:\cusorspace\avatar-ai-video && rg "task-dispatcher" --type js
```

预期结果：仅 `creator-api/services/task-dispatcher.js` 自身和可能的文档文件，无其他 `.js` 引用。

---

### Task 4: 任务状态独立持久化 + 轮询端点

**Files:**
- Create: `creator-api/services/task-store.js`
- Modify: `creator-api/routes/sessions.js`
- Modify: `creator-api/services/session-manager.js`

**当前问题：** 任务状态只存在 session hash 中（`taskId` 字段），session 过期（24h）后丢失。前端只有 `estimatedMinutes: 20` 硬编码，无真实进度。

**目标：** 创建独立的 task-store（Redis），记录任务生命周期状态，前端可轮询 `/status` 获取真实进度。

- [ ] **Step 1: 创建 task-store.js**

新建 `creator-api/services/task-store.js`：

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const TASK_TTL = 7 * 24 * 3600;

const TASK_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  DISPATCHING: 'dispatching',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

function taskKey(taskId) {
  return `task:${taskId}`;
}

export async function createTask(taskId, sessionId, meta = {}) {
  await redis.hset(taskKey(taskId), {
    taskId,
    sessionId,
    status: TASK_STATUS.PENDING,
    videoUrl: '',
    results: '[]',
    error: '',
    createdAt: Date.now().toString(),
    updatedAt: Date.now().toString(),
    ...meta,
  });
  await redis.expire(taskKey(taskId), TASK_TTL);
  return taskId;
}

export async function updateTaskStatus(taskId, status, extra = {}) {
  const fields = { status, updatedAt: Date.now().toString(), ...extra };
  if (fields.results && typeof fields.results !== 'string') {
    fields.results = JSON.stringify(fields.results);
  }
  await redis.hset(taskKey(taskId), fields);
  await redis.expire(taskKey(taskId), TASK_TTL);
}

export async function getTask(taskId) {
  const data = await redis.hgetall(taskKey(taskId));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    taskId: data.taskId,
    sessionId: data.sessionId,
    status: data.status,
    videoUrl: data.videoUrl || '',
    results: JSON.parse(data.results || '[]'),
    error: data.error || '',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getTaskBySession(sessionId) {
  const keys = await redis.keys('task:*');
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (data.sessionId === sessionId) {
      return {
        taskId: data.taskId,
        sessionId: data.sessionId,
        status: data.status,
        videoUrl: data.videoUrl || '',
        results: JSON.parse(data.results || '[]'),
        error: data.error || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }
  }
  return null;
}

export { TASK_STATUS };
```

- [ ] **Step 2: 修改 session-manager.js 增加 videoUrl 字段**

`creator-api/services/session-manager.js` — 在 `updateSession()` 的 fields 映射中增加 `videoUrl`：

在 `if (updates.taskId !== undefined) fields.taskId = updates.taskId;` 之后新增一行：

```javascript
if (updates.videoUrl !== undefined) fields.videoUrl = updates.videoUrl;
```

同时在 `getSession()` 的返回对象中增加：

在 `createdAt: data.createdAt,` 之后新增：

```javascript
taskId: data.taskId || null,
videoUrl: data.videoUrl || null,
```

- [ ] **Step 3: 增强 /status 端点返回任务详情**

`creator-api/routes/sessions.js` — 修改 `/:id/status` 路由：

```javascript
sessionsRouter.get('/:id/status', withSession(), async (req, res) => {
  const s = await getSession(req.session.id);

  let task = null;
  if (s.taskId) {
    try {
      const { getTask } = await import('../services/task-store.js');
      task = await getTask(s.taskId);
    } catch {}
  }

  res.json({
    success: true,
    sessionId: s.id,
    status: s.status,
    round: s.round,
    taskId: s.taskId || null,
    videoUrl: s.videoUrl || null,
    task: task ? {
      status: task.status,
      videoUrl: task.videoUrl,
      results: task.results,
      error: task.error,
      updatedAt: task.updatedAt,
    } : null,
  });
});
```

- [ ] **Step 4: submit.js 中创建 task 记录**

在 `creator-api/routes/submit.js` 中，`submitTaskToOpenClaw()` 成功返回后，创建 task 记录：

在 `await updateSession(session.id, { status: 'completed', ... })` 之前追加：

```javascript
try {
  const { createTask } = await import('../services/task-store.js');
  await createTask(result.taskId, session.id);
} catch {}
```

---

### Task 5: 新增健康检查端点

**Files:**
- Modify: `creator-api/server.js`

**当前问题：** 无 `/health` 端点，Docker Compose 的 `depends_on` 无法真正探测服务就绪状态。

- [ ] **Step 1: 增加健康检查路由**

在 `creator-api/server.js` 中，`app.use(express.json())` 之后、其他路由之前插入：

```javascript
app.get('/health', async (_req, res) => {
  try {
    const { createClient } = await import('ioredis');
    const probe = new (createClient || Redis)(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await probe.connect();
    await probe.ping();
    probe.disconnect();

    const mqtt = await import('mqtt');
    const mqttOk = await new Promise((resolve) => {
      const c = mqtt.default.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
        connectTimeout: 3000,
        clean: true,
      });
      c.on('connect', () => { c.end(); resolve(true); });
      c.on('error', () => { c.end(); resolve(false); });
      setTimeout(() => { c.end(); resolve(false); }, 2500);
    });

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      checks: { redis: true, mqtt: mqttOk },
    });
  } catch {
    res.status(503).json({ status: 'degraded', uptime: process.uptime() });
  }
});
```

注意：需要在文件顶部添加 `import Redis from 'ioredis'` 或在动态 import 中处理。由于 server.js 当前没有 ioredis import，使用动态 import。

- [ ] **Step 2: 验证端点可用**

启动服务后验证：

```bash
curl http://localhost:3099/health
```

预期输出：
```json
{"status":"ok","uptime":1.23,"checks":{"redis":true,"mqtt":true}}
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 启动全部服务**

```bash
cd e:\cusorspace\avatar-ai-video\deploy && docker-compose up -d
```

- [ ] **Step 2: 验证健康检查**

```bash
curl http://localhost:3099/health
```
预期：`{"status":"ok",...}`

- [ ] **Step 3: 创建会话并模拟提交**

```bash
# 创建会话
curl -X POST http://localhost:3099/api/sessions
# 获取 sessionId 后，模拟确认页提交
curl -X POST http://localhost:3099/api/sessions/<SESSION_ID>/submit \
  -H "Content-Type: application/json"
```

- [ ] **Step 4: 检查 OpenClaw 日志**

```bash
docker logs deploy-openclaw-1 --tail 50
```
预期：看到 `[RunningHub]` 和 `[Dispatch]` 日志输出。

- [ ] **Step 5: 检查 Redis 任务记录**

```bash
docker exec deploy-redis-1 redis-cli KEYS "task:*"
```
预期：存在 `task:task_xxxxx` 记录。

- [ ] **Step 6: 验证状态轮询端点**

```bash
curl http://localhost:3099/api/sessions/<SESSION_ID>/status
```
预期：`task` 字段包含 `status`、`videoUrl`、`results`。

---

## 验证方案

| 检查项 | 命令 | 预期 |
|--------|------|------|
| Lint 无错误 | `npx eslint creator-api/routes/submit.js creator-api/services/openclaw-proxy.js` | 0 errors |
| task-dispatcher 无外部引用 | `rg "task-dispatcher" --type js --glob '!docs/**'` | 仅自身文件 |
| 健康检查端点正常 | `curl http://localhost:3099/health` | `{"status":"ok"}` |
| submit 后 session 状态变为 completed | 查 Redis `HGET session:xxx status` | `completed` |
| task-store 记录存在 | `docker exec deploy-redis-1 redis-cli KEYS "task:*"` | 返回 key |
| OpenClaw 日志含生成进度 | `docker logs deploy-openclaw-1 --tail 100 \| grep RunningHub` | 含 `[RunningHub]` |

## 回滚方案

如果 OpenClaw 处理超时导致 submit 请求挂死：

1. **临时绕过：** 将 `submit.js` 改回调用 `dispatchTask()`（从 `task-dispatcher.js` 导入），task-dispatcher.js 虽不可用但保持 build 不报错
2. **超时调整：** 增大 `submitTaskToOpenClaw()` 中的 AbortController 超时时间（当前 120s → 300s）
3. **异步模式（后续 Phase 4）：** 引入 BullMQ 队列，submit 立即返回，后台异步处理

## Spec 自审

1. **Placeholder 扫描：** 无 TBD/TODO，所有函数签名和代码完整
2. **内部一致性：** submit.js → openclaw-proxy.js → OpenClaw skills (runninghub-gen → dispatch-agent) 链路一致
3. **范围检查：** 聚焦 Phase 1 三项目标（断链修复、dispatch 合并、任务持久化），不涉及 Phase 2-4
4. **歧义检查：** 各平台的动作序列已定义明确（buildPlatformActions），videoUrl 流向清晰
