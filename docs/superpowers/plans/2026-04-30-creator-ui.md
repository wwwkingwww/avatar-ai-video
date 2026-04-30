# 创作者前端 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为自媒体创作者构建移动端 Web 对话式界面，通过最多 4 轮 AI 对话收集视频创作需求，自动提交到 OpenClaw 编排执行

**Architecture:** React 18 + Vite + TypeScript 前端 SPA（移动优先），Node.js + Express 轻量后端 Server（creator-api），SSE 流式输出，Redis 会话管理，MinIO 文件存储，透传代理 OpenClaw

**Tech Stack:** React 18, Vite, TypeScript, Express, ioredis, @minio/minio, multer, uuid

**Design doc:** `docs/superpowers/specs/2026-04-30-creator-ui-design.md`

---

## File Map

| 文件 | 职责 |
|------|------|
| `creator-api/package.json` | Server 依赖声明 |
| `creator-api/server.js` | Express 主入口，路由注册，静态文件 serve |
| `creator-api/routes/sessions.js` | 会话创建、确认页汇总、状态查询 |
| `creator-api/routes/messages.js` | 消息处理 + SSE 流式代理 OpenClaw |
| `creator-api/routes/upload.js` | 文件上传 → MinIO |
| `creator-api/routes/submit.js` | 最终提交 → OpenClaw 执行 |
| `creator-api/middleware/round-guard.js` | 轮次检查中间件 |
| `creator-api/services/session-manager.js` | Redis 会话 CRUD |
| `creator-api/services/minio-uploader.js` | MinIO 上传/下载封装 |
| `creator-api/services/openclaw-proxy.js` | OpenClaw HTTP 代理请求封装 |
| `creator-frontend/package.json` | 前端依赖声明 |
| `creator-frontend/vite.config.ts` | Vite 配置（proxy + build） |
| `creator-frontend/tsconfig.json` | TypeScript 配置 |
| `creator-frontend/tsconfig.node.json` | Vite 配置 TypeScript 支持 |
| `creator-frontend/index.html` | SPA 入口 HTML |
| `creator-frontend/src/main.tsx` | React 挂载入口 |
| `creator-frontend/src/App.tsx` | 视图路由（chat / confirm / result） |
| `creator-frontend/src/types.ts` | 共享类型定义 |
| `creator-frontend/src/services/api.ts` | API 调用封装（fetch + SSE） |
| `creator-frontend/src/hooks/useSSE.ts` | SSE 流式接收 hook |
| `creator-frontend/src/hooks/useSession.ts` | 会话状态管理 hook |
| `creator-frontend/src/styles/variables.css` | CSS 变量（主题色/间距/字体） |
| `creator-frontend/src/styles/chat.css` | 聊天界面全局样式 |
| `creator-frontend/src/components/Bubble.tsx` | 消息气泡组件 |
| `creator-frontend/src/components/QuickOptions.tsx` | 快捷选项按钮组 |
| `creator-frontend/src/components/RoundIndicator.tsx` | 顶部轮次指示器 |
| `creator-frontend/src/components/MessageList.tsx` | 消息列表（自动滚动） |
| `creator-frontend/src/components/FileUploader.tsx` | 文件上传组件（缩略图+进度条） |
| `creator-frontend/src/components/InputArea.tsx` | 底部输入区 |
| `creator-frontend/src/components/ChatView.tsx` | 对话视图（组合上述组件） |
| `creator-frontend/src/components/ConfirmView.tsx` | 确认视图 |
| `creator-frontend/src/components/ResultView.tsx` | 结果视图 |
| `deploy/docker-compose.yml` | 新增 `creator-api` 容器（**修改**） |

---

## Phase 1: creator-api Server 骨架

### Task 1: 创建 creator-api 项目骨架

**Files:**
- Create: `creator-api/package.json`
- Create: `creator-api/server.js`

- [ ] **Step 1: 编写 package.json**

```json
{
  "name": "creator-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "@minio/minio": "^8.0.1",
    "express": "^4.21.0",
    "ioredis": "^5.4.1",
    "multer": "^1.4.5-lts.1",
    "uuid": "^10.0.0"
  }
}
```

- [ ] **Step 2: 编写 server.js 主入口**

```js
// creator-api/server.js
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sessionsRouter } from './routes/sessions.js';
import { messagesRouter } from './routes/messages.js';
import { uploadRouter } from './routes/upload.js';
import { submitRouter } from './routes/submit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', messagesRouter);
app.use('/api/sessions', uploadRouter);
app.use('/api/sessions', submitRouter);

const frontendDist = join(__dirname, '..', 'creator-frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[creator-api] running on http://0.0.0.0:${PORT}`);
});
```

- [ ] **Step 3: 安装依赖**

```bash
cd creator-api && npm install
```

预期输出: `added N packages`

- [ ] **Step 4: Commit**

```bash
git add creator-api/package.json creator-api/server.js
git commit -m "feat: add creator-api project skeleton"
```

---

### Task 2: 会话管理器（Redis）

**Files:**
- Create: `creator-api/services/session-manager.js`

- [ ] **Step 1: 编写会话管理器**

```js
// creator-api/services/session-manager.js
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_TTL = 86400;
const MAX_ROUNDS = 4;

function sessionKey(id) {
  return `session:${id}`;
}

export async function createSession() {
  const id = uuidv4();
  const now = Date.now().toString();
  await redis.hset(sessionKey(id), {
    round: '0',
    status: 'chatting',
    history: '[]',
    context: '{}',
    files: '[]',
    forceConfirm: '0',
    createdAt: now,
  });
  await redis.expire(sessionKey(id), SESSION_TTL);
  return id;
}

export async function getSession(id) {
  const data = await redis.hgetall(sessionKey(id));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    id,
    round: parseInt(data.round, 10),
    status: data.status,
    history: JSON.parse(data.history || '[]'),
    context: JSON.parse(data.context || '{}'),
    files: JSON.parse(data.files || '[]'),
    forceConfirm: data.forceConfirm === '1',
    createdAt: data.createdAt,
  };
}

export async function updateSession(id, updates) {
  const fields = {};
  if (updates.round !== undefined) fields.round = String(updates.round);
  if (updates.status !== undefined) fields.status = updates.status;
  if (updates.history !== undefined) fields.history = JSON.stringify(updates.history);
  if (updates.context !== undefined) fields.context = JSON.stringify(updates.context);
  if (updates.files !== undefined) fields.files = JSON.stringify(updates.files);
  if (updates.forceConfirm !== undefined) fields.forceConfirm = updates.forceConfirm ? '1' : '0';
  if (updates.taskId !== undefined) fields.taskId = updates.taskId;

  if (Object.keys(fields).length > 0) {
    await redis.hset(sessionKey(id), fields);
    await redis.expire(sessionKey(id), SESSION_TTL);
  }
}

export async function incrementRound(session) {
  const newRound = session.round + 1;
  const forceConfirm = newRound >= MAX_ROUNDS;
  await updateSession(session.id, { round: newRound, forceConfirm });
  return { round: newRound, forceConfirm };
}

export { MAX_ROUNDS };
```

- [ ] **Step 2: 验证模块能加载**

```bash
node -e "import('./creator-api/services/session-manager.js').then(m => console.log(m.MAX_ROUNDS))"
```

预期输出: `4`

- [ ] **Step 3: Commit**

```bash
git add creator-api/services/session-manager.js
git commit -m "feat: add session manager with Redis persistence"
```

---

### Task 3: MinIO 上传器

**Files:**
- Create: `creator-api/services/minio-uploader.js`

- [ ] **Step 1: 编写 MinIO 上传封装**

```js
// creator-api/services/minio-uploader.js
import { Client as MinioClient } from 'minio';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = process.env.MINIO_BUCKET || 'creator-uploads';

const minio = new MinioClient({
  endPoint: (process.env.MINIO_ENDPOINT || 'localhost').replace(/^https?:\/\//, ''),
  port: 9000,
  useSSL: (process.env.MINIO_ENDPOINT || '').startsWith('https'),
  accessKey: process.env.MINIO_ACCESS_KEY || 'avatar',
  secretKey: process.env.MINIO_SECRET_KEY || 'changeme123',
});

export async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
  }
}

export async function uploadFile(fileBuffer, originalName, mimeType) {
  await ensureBucket();

  const ext = extname(originalName) || '.bin';
  const objectName = `uploads/${uuidv4()}${ext}`;

  await minio.putObject(BUCKET, objectName, fileBuffer, fileBuffer.length, {
    'Content-Type': mimeType,
  });

  const url = await minio.presignedGetObject(BUCKET, objectName, 24 * 60 * 60);

  return {
    url,
    name: originalName,
    objectName,
    size: fileBuffer.length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-api/services/minio-uploader.js
git commit -m "feat: add MinIO uploader service"
```

---

### Task 4: OpenClaw 代理

**Files:**
- Create: `creator-api/services/openclaw-proxy.js`

- [ ] **Step 1: 编写 OpenClaw HTTP 代理**

```js
// creator-api/services/openclaw-proxy.js
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:3000';
const MAX_ROUNDS = 4;

export function buildSystemPrompt(session) {
  const roundInfo = `当前是第 ${session.round + 1} 轮对话，最多 ${MAX_ROUNDS} 轮。`;
  const collectedInfo = session.context && Object.keys(session.context).length > 0
    ? `已收集的信息: ${JSON.stringify(session.context)}`
    : '尚未收集任何信息。';

  return `你是一个视频创作需求收集助手。${roundInfo}
你需要从用户那里收集以下信息（按优先级）：
- 视频模板/类型（数字人口播、科技评测、产品展示）
- 文案内容 / 核心信息
- 目标平台（抖音、快手、小红书，可多选）
- 素材文件（用户会上传）
- 风格偏好（可选）
- 发布偏好（可选，如话题标签）

${collectedInfo}

规则：
1. 如果用户第1轮就描述了完整需求，后续轮次只追问缺失的关键信息
2. 每轮回复尽量简洁，1-2句话 + 1个具体问题
3. 如果用户上传了文件，确认已收到
4. 在第3轮时，如果信息基本齐全，提示用户即将进入确认`;
}

export async function sendToOpenClaw(history, session) {
  const systemPrompt = buildSystemPrompt(session);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw 返回错误: HTTP ${response.status}`);
  }

  return response.body;
}

export async function submitTaskToOpenClaw(session) {
  const taskPayload = {
    type: 'video_creation',
    context: session.context,
    files: session.files,
    sessionId: session.id,
  };

  const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `用户已确认以下视频创作需求，请执行：
${JSON.stringify(taskPayload, null, 2)}

你需要：
1. 调用 runninghub-gen skill 生成视频
2. 调用 dispatch-agent skill 分发到对应平台
3. 返回任务 ID 给用户`,
        },
        {
          role: 'user',
          content: '请开始执行视频创作和发布任务',
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw 提交失败: HTTP ${response.status}`);
  }

  const result = await response.json();
  const taskId = result.id || `task_${Date.now()}`;
  return { taskId };
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-api/services/openclaw-proxy.js
git commit -m "feat: add OpenClaw proxy service"
```

---

### Task 5: 轮次守卫中间件

**Files:**
- Create: `creator-api/middleware/round-guard.js`

- [ ] **Step 1: 编写中间件**

```js
// creator-api/middleware/round-guard.js
import { getSession } from '../services/session-manager.js';

export function withSession(paramName = 'id') {
  return async (req, res, next) => {
    const sessionId = req.params[paramName];
    if (!sessionId) {
      return res.status(400).json({ success: false, error: '缺少 session ID' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: '会话不存在或已过期' });
    }

    req.session = session;
    next();
  };
}

export function requireStatus(...statuses) {
  return (req, res, next) => {
    if (!statuses.includes(req.session.status)) {
      return res.status(409).json({
        success: false,
        error: `会话状态为 ${req.session.status}，不支持此操作`,
      });
    }
    next();
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-api/middleware/round-guard.js
git commit -m "feat: add session middleware with round guard"
```

---

### Task 6: 会话路由

**Files:**
- Create: `creator-api/routes/sessions.js`

- [ ] **Step 1: 编写会话路由**

```js
// creator-api/routes/sessions.js
import { Router } from 'express';
import { createSession, getSession } from '../services/session-manager.js';
import { withSession } from '../middleware/round-guard.js';

export const sessionsRouter = Router();

sessionsRouter.post('/', async (_req, res) => {
  try {
    const sessionId = await createSession();
    res.json({
      success: true,
      sessionId,
      message: '你好！今天想做什么类型的视频？',
      round: 1,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/:id/confirm', withSession(), async (req, res) => {
  try {
    const s = req.session;
    const requiredFields = ['template', 'content', 'platforms'];
    const missing = requiredFields.filter((f) => !s.context[f]);

    res.json({
      success: true,
      items: { ...s.context, files: s.files },
      missing,
      round: s.round,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/:id/status', withSession(), async (req, res) => {
  const s = await getSession(req.session.id);
  res.json({
    success: true,
    sessionId: s.id,
    status: s.status,
    round: s.round,
    taskId: s.taskId || null,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add creator-api/routes/sessions.js
git commit -m "feat: add session routes (create, confirm, status)"
```

---

### Task 7: 消息路由（SSE 流式）

**Files:**
- Create: `creator-api/routes/messages.js`

- [ ] **Step 1: 编写消息处理 + SSE 流式路由**

```js
// creator-api/routes/messages.js
import { Router } from 'express';
import { withSession, requireStatus } from '../middleware/round-guard.js';
import { incrementRound, updateSession } from '../services/session-manager.js';
import { sendToOpenClaw } from '../services/openclaw-proxy.js';

export const messagesRouter = Router();

messagesRouter.post(
  '/:id/messages',
  withSession(),
  requireStatus('chatting'),
  async (req, res) => {
    const { content, attachments } = req.body;
    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ success: false, error: '消息内容不能为空' });
    }

    const session = req.session;

    const { round, forceConfirm } = await incrementRound(session);
    session.round = round;
    session.forceConfirm = forceConfirm;

    let userContent = content || '';
    if (attachments && attachments.length > 0) {
      const currentFiles = session.files || [];
      const newFiles = attachments.map((url, i) => ({
        url,
        name: `file_${Date.now()}_${i}`,
      }));
      await updateSession(session.id, {
        files: [...currentFiles, ...newFiles],
      });
      userContent = content
        ? `${content}\n[已上传 ${attachments.length} 个文件]`
        : `[已上传 ${attachments.length} 个文件]`;
    }

    const history = session.history || [];
    history.push({ role: 'user', content: userContent });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let fullResponse = '';

    try {
      const stream = await sendToOpenClaw(history, session);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: e.message })}\n\n`);
    }

    if (fullResponse) {
      history.push({ role: 'assistant', content: fullResponse });
    }

    await updateSession(session.id, { history });

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        content: fullResponse,
        round,
        forceConfirm,
      })}\n\n`
    );
    res.end();
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add creator-api/routes/messages.js
git commit -m "feat: add message route with SSE streaming from OpenClaw"
```

---

### Task 8: 上传 + 提交路由

**Files:**
- Create: `creator-api/routes/upload.js`
- Create: `creator-api/routes/submit.js`

- [ ] **Step 1: 编写文件上传路由**

```js
// creator-api/routes/upload.js
import { Router } from 'express';
import multer from 'multer';
import { withSession } from '../middleware/round-guard.js';
import { uploadFile } from '../services/minio-uploader.js';
import { updateSession } from '../services/session-manager.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

export const uploadRouter = Router();

uploadRouter.post(
  '/:id/upload',
  withSession(),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '未提供文件' });
      }

      const result = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      const session = req.session;
      const files = session.files || [];
      files.push(result);
      await updateSession(session.id, { files });

      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);
```

- [ ] **Step 2: 编写提交路由**

```js
// creator-api/routes/submit.js
import { Router } from 'express';
import { withSession } from '../middleware/round-guard.js';
import { updateSession } from '../services/session-manager.js';
import { submitTaskToOpenClaw } from '../services/openclaw-proxy.js';

export const submitRouter = Router();

submitRouter.post('/:id/submit', withSession(), async (req, res) => {
  try {
    const session = req.session;

    const { taskId } = await submitTaskToOpenClaw(session);
    await updateSession(session.id, { status: 'submitted', taskId });

    res.json({
      success: true,
      taskId,
      estimatedMinutes: 20,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/routes/upload.js creator-api/routes/submit.js
git commit -m "feat: add file upload and task submit routes"
```

---

## Phase 4: creator-frontend 骨架

### Task 9: 创建前端项目骨架

**Files:**
- Create: `creator-frontend/package.json`
- Create: `creator-frontend/vite.config.ts`
- Create: `creator-frontend/tsconfig.json`
- Create: `creator-frontend/tsconfig.node.json`
- Create: `creator-frontend/index.html`
- Create: `creator-frontend/src/main.tsx`
- Create: `creator-frontend/src/types.ts`

- [ ] **Step 1: 编写 package.json**

```json
{
  "name": "creator-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: 编写 vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
```

- [ ] **Step 3: 编写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 编写 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: 编写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#0f0f1a" />
  <title>AI 视频创作</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: 编写 src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/variables.css';
import './styles/chat.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: 编写 src/types.ts**

```ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: string[];
  timestamp: number;
}

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
}

export interface SessionState {
  sessionId: string | null;
  round: number;
  status: 'chatting' | 'confirming' | 'submitted';
  messages: Message[];
  forceConfirm: boolean;
  isStreaming: boolean;
}

export interface ConfirmData {
  items: Record<string, unknown>;
  missing: string[];
}

export interface TaskResult {
  taskId: string;
  estimatedMinutes: number;
}
```

- [ ] **Step 8: 安装依赖**

```bash
cd creator-frontend && npm install
```

预期输出: `added N packages`

- [ ] **Step 9: Commit**

```bash
git add creator-frontend/
git commit -m "feat: add creator-frontend project skeleton with React + Vite + TypeScript"
```

---

## Phase 5: creator-frontend 基础设施

### Task 10: API 服务 + SSE + Session Hooks

**Files:**
- Create: `creator-frontend/src/services/api.ts`
- Create: `creator-frontend/src/hooks/useSSE.ts`
- Create: `creator-frontend/src/hooks/useSession.ts`

- [ ] **Step 1: 编写 API 服务**

```ts
// creator-frontend/src/services/api.ts
import type { ConfirmData, TaskResult, UploadedFile } from '../types';

const BASE = '/api/sessions';

export async function createSession(): Promise<{ sessionId: string; message: string; round: number }> {
  const res = await fetch(BASE, { method: 'POST' });
  if (!res.ok) throw new Error('创建会话失败');
  return res.json();
}

export function sendMessage(
  sessionId: string,
  content: string,
  attachments: string[],
  onChunk: (text: string) => void,
  onDone: (info: { round: number; forceConfirm: boolean }) => void,
  onError: (err: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, attachments }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        onError(err.error || '请求失败');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError('流读取失败'); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') {
                onChunk(data.content);
              } else if (data.type === 'done') {
                onDone({ round: data.round, forceConfirm: data.forceConfirm });
              } else if (data.type === 'error') {
                onError(data.content);
              }
            } catch {
              // skip failed parse
            }
          }
        }
      }
    })
    .catch((e) => {
      if (e.name !== 'AbortError') {
        onError(e.message);
      }
    });

  return controller;
}

export async function uploadFile(sessionId: string, file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}/${sessionId}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('上传失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '上传失败');
  return { url: data.url, name: data.name, size: data.size };
}

export async function getConfirmData(sessionId: string): Promise<ConfirmData> {
  const res = await fetch(`${BASE}/${sessionId}/confirm`);
  if (!res.ok) throw new Error('获取确认数据失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { items: data.items, missing: data.missing };
}

export async function submitTask(sessionId: string): Promise<TaskResult> {
  const res = await fetch(`${BASE}/${sessionId}/submit`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('提交失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { taskId: data.taskId, estimatedMinutes: data.estimatedMinutes };
}
```

- [ ] **Step 2: 编写 useSSE hook**

```ts
// creator-frontend/src/hooks/useSSE.ts
import { useRef, useCallback } from 'react';
import { sendMessage } from '../services/api';

interface SSEOptions {
  onChunk: (text: string) => void;
  onDone: (info: { round: number; forceConfirm: boolean }) => void;
  onError: (err: string) => void;
}

export function useSSE() {
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const connect = useCallback(
    (sessionId: string, content: string, attachments: string[], opts: SSEOptions) => {
      cancel();
      controllerRef.current = sendMessage(
        sessionId,
        content,
        attachments,
        opts.onChunk,
        opts.onDone,
        opts.onError
      );
    },
    [cancel]
  );

  return { connect, cancel };
}
```

- [ ] **Step 3: 编写 useSession hook**

```ts
// creator-frontend/src/hooks/useSession.ts
import { useState, useCallback, useRef } from 'react';
import type { Message, SessionState, UploadedFile, TaskResult } from '../types';
import { createSession, uploadFile, getConfirmData, submitTask } from '../services/api';
import { useSSE } from './useSSE';

let msgIdCounter = 0;
function nextId() {
  return `msg_${Date.now()}_${++msgIdCounter}`;
}

const initialState: SessionState = {
  sessionId: null,
  round: 0,
  status: 'chatting',
  messages: [],
  forceConfirm: false,
  isStreaming: false,
};

export function useSession() {
  const [state, setState] = useState<SessionState>(initialState);
  const [streamingText, setStreamingText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const pendingAttachments = useRef<string[]>([]);

  const sse = useSSE();

  const initSession = useCallback(async () => {
    setState(initialState);
    setStreamingText('');
    setUploadedFiles([]);
    try {
      const { sessionId, message, round } = await createSession();
      setState((prev) => ({
        ...prev,
        sessionId,
        round,
        messages: [
          {
            id: nextId(),
            role: 'assistant',
            content: message,
            timestamp: Date.now(),
          },
        ],
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: nextId(), role: 'system', content: `连接失败: ${msg}`, timestamp: Date.now() },
        ],
      }));
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!state.sessionId) return;
    try {
      const result = await uploadFile(state.sessionId, file);
      setUploadedFiles((prev) => [...prev, result]);
      pendingAttachments.current.push(result.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: nextId(), role: 'system', content: `文件上传失败: ${msg}`, timestamp: Date.now() },
        ],
      }));
    }
  }, [state.sessionId]);

  const sendUserMessage = useCallback(
    (content: string) => {
      if (!state.sessionId || state.isStreaming) return;

      const attachments = [...pendingAttachments.current];
      pendingAttachments.current = [];

      const userMsg: Message = {
        id: nextId(),
        role: 'user',
        content: content || '已上传文件',
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isStreaming: true,
        messages: [...prev.messages, userMsg],
      }));
      setStreamingText('');

      sse.connect(state.sessionId, content, attachments, {
        onChunk: (text) => {
          setStreamingText((prev) => prev + text);
        },
        onDone: (info) => {
          setStreamingText((prev) => {
            setState((s) => ({
              ...s,
              isStreaming: false,
              round: info.round,
              forceConfirm: info.forceConfirm,
              messages: [
                ...s.messages,
                {
                  id: nextId(),
                  role: 'assistant' as const,
                  content: prev,
                  timestamp: Date.now(),
                },
              ],
              status: info.forceConfirm ? 'confirming' : 'chatting',
            }));
            return '';
          });
        },
        onError: (err) => {
          setState((s) => ({
            ...s,
            isStreaming: false,
            messages: [
              ...s.messages,
              { id: nextId(), role: 'system', content: `错误: ${err}`, timestamp: Date.now() },
            ],
          }));
          setStreamingText('');
        },
      });
    },
    [state.sessionId, state.isStreaming, sse]
  );

  const goToConfirm = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await getConfirmData(state.sessionId);
      setState((prev) => ({ ...prev, status: 'confirming' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取确认数据失败';
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: nextId(), role: 'system', content: msg, timestamp: Date.now() },
        ],
      }));
    }
  }, [state.sessionId]);

  const handleSubmit = useCallback(async (): Promise<TaskResult | null> => {
    if (!state.sessionId) return null;
    try {
      const result = await submitTask(state.sessionId);
      setState((prev) => ({ ...prev, status: 'submitted' }));
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败';
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { id: nextId(), role: 'system', content: `提交失败: ${msg}`, timestamp: Date.now() },
        ],
      }));
      return null;
    }
  }, [state.sessionId]);

  return {
    state,
    streamingText,
    uploadedFiles,
    initSession,
    sendUserMessage,
    handleFileUpload,
    goToConfirm,
    handleSubmit,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/services/api.ts creator-frontend/src/hooks/
git commit -m "feat: add API service, SSE hook, and session state hook"
```

---

## Phase 6: creator-frontend 样式

### Task 11: CSS 样式

**Files:**
- Create: `creator-frontend/src/styles/variables.css`
- Create: `creator-frontend/src/styles/chat.css`

- [ ] **Step 1: 编写 CSS 变量**

```css
/* creator-frontend/src/styles/variables.css */
:root {
  --bg-primary: #0f0f1a;
  --bg-secondary: #1a1a2e;
  --bg-card: #2d2d44;
  --bg-input: #1e1e32;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --text-muted: #666;
  --accent: #6366f1;
  --accent-light: #8b5cf6;
  --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --bubble-user: #6366f1;
  --bubble-ai: #2d2d44;
  --bubble-system: #1a1a2e;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  --font-sm: 12px;
  --font-md: 14px;
  --font-lg: 16px;
  --safe-bottom: env(safe-area-inset-bottom, 16px);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  height: 100dvh;
}

#root {
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: 编写聊天界面样式**

```css
/* creator-frontend/src/styles/chat.css */
.creator-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

/* ====== RoundIndicator ====== */
.round-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--bg-card);
  flex-shrink: 0;
}

.round-dots {
  display: flex;
  gap: 6px;
}

.round-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-card);
  transition: background 0.3s;
}

.round-dot.active {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-light);
}

.round-dot.done {
  background: var(--accent);
}

.round-label {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  margin-left: 4px;
}

/* ====== MessageList ====== */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-overflow-scrolling: touch;
}

/* ====== Bubble ====== */
.bubble {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}

.bubble.user {
  align-self: flex-end;
}

.bubble.assistant {
  align-self: flex-start;
}

.bubble.system {
  align-self: center;
  max-width: 90%;
}

.bubble-content {
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  line-height: 1.5;
  word-break: break-word;
}

.bubble.user .bubble-content {
  background: var(--bubble-user);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.assistant .bubble-content {
  background: var(--bubble-ai);
  color: var(--text-primary);
  border-top-left-radius: 4px;
}

.bubble.system .bubble-content {
  background: var(--bubble-system);
  color: var(--text-secondary);
  font-size: var(--font-sm);
  text-align: center;
}

.bubble-streaming .bubble-content::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--accent-light);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* ====== QuickOptions ====== */
.quick-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
}

.quick-option {
  background: var(--bg-card);
  color: var(--accent-light);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  padding: 8px 14px;
  font-size: var(--font-md);
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.quick-option:active {
  background: var(--accent);
  color: #fff;
}

/* ====== InputArea ====== */
.input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 16px;
  padding-bottom: calc(10px + var(--safe-bottom));
  background: var(--bg-secondary);
  border-top: 1px solid var(--bg-card);
  flex-shrink: 0;
}

.input-area textarea {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--bg-card);
  border-radius: var(--radius-xl);
  color: var(--text-primary);
  font-size: var(--font-md);
  padding: 10px 16px;
  resize: none;
  outline: none;
  max-height: 100px;
  line-height: 1.4;
}

.input-area textarea::placeholder {
  color: var(--text-muted);
}

.input-area .send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent-gradient);
  border: none;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.input-area .send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-area .attach-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-card);
  border: none;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ====== FileUploader ====== */
.file-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px 0;
}

.file-preview {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--bg-card);
}

.file-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-preview .file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
  font-size: 20px;
}

.file-preview .file-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  border: none;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ====== ConfirmView ====== */
.confirm-view {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.confirm-title {
  font-size: var(--font-lg);
  font-weight: 600;
  text-align: center;
}

.confirm-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
}

.confirm-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--bg-secondary);
}

.confirm-item:last-child {
  border-bottom: none;
}

.confirm-item .label {
  color: var(--text-secondary);
  font-size: var(--font-sm);
  flex-shrink: 0;
  margin-right: 12px;
}

.confirm-item .value {
  color: var(--text-primary);
  font-size: var(--font-md);
  text-align: right;
  word-break: break-word;
}

.confirm-item .value.editable {
  color: var(--accent-light);
  cursor: pointer;
}

.missing-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 12px 16px;
}

.missing-section .missing-title {
  font-size: var(--font-sm);
  color: var(--warning);
  margin-bottom: 4px;
}

.missing-section .missing-item {
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.confirm-actions {
  display: flex;
  gap: 12px;
  padding-bottom: var(--safe-bottom);
}

.confirm-actions button {
  flex: 1;
  padding: 14px 20px;
  border-radius: var(--radius-md);
  font-size: var(--font-md);
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.confirm-actions .btn-back {
  background: var(--bg-card);
  color: var(--text-primary);
}

.confirm-actions .btn-submit {
  background: var(--accent-gradient);
  color: #fff;
}

.confirm-actions button:active {
  opacity: 0.8;
}

/* ====== ResultView ====== */
.result-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  gap: 20px;
  text-align: center;
}

.result-icon {
  font-size: 64px;
}

.result-title {
  font-size: 20px;
  font-weight: 600;
}

.result-info {
  font-size: var(--font-md);
  color: var(--text-secondary);
  line-height: 1.6;
}

.result-info strong {
  color: var(--text-primary);
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
  margin-top: 8px;
}

.result-actions button {
  padding: 14px 20px;
  border-radius: var(--radius-md);
  font-size: var(--font-md);
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.result-actions .btn-primary {
  background: var(--accent-gradient);
  color: #fff;
}

.result-actions .btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
}

.result-actions button:active {
  opacity: 0.8;
}

/* ====== Splash Screen ====== */
.splash-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  gap: 16px;
  text-align: center;
}

.splash-screen h2 {
  font-size: 20px;
  font-weight: 600;
}

.splash-screen p {
  font-size: var(--font-md);
  color: var(--text-secondary);
  line-height: 1.6;
}

.splash-screen button {
  margin-top: 12px;
  padding: 14px 32px;
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  color: #fff;
  font-size: var(--font-md);
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
}

.splash-screen button:active {
  opacity: 0.8;
}
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/styles/
git commit -m "feat: add CSS styles (variables + chat components)"
```

---

## Phase 7: creator-frontend 组件

### Task 12: Bubble + QuickOptions + RoundIndicator 组件

**Files:**
- Create: `creator-frontend/src/components/Bubble.tsx`
- Create: `creator-frontend/src/components/QuickOptions.tsx`
- Create: `creator-frontend/src/components/RoundIndicator.tsx`

- [ ] **Step 1: 编写 Bubble 组件**

```tsx
// creator-frontend/src/components/Bubble.tsx
import type { Message } from '../types';

interface BubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function Bubble({ message, isStreaming }: BubbleProps) {
  const className = `bubble ${message.role}${isStreaming ? ' bubble-streaming' : ''}`;

  return (
    <div className={className}>
      <div className="bubble-content">{message.content}</div>
      {message.options && message.options.length > 0 && (
        <QuickOptions options={message.options} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 编写 QuickOptions 组件**

```tsx
// creator-frontend/src/components/QuickOptions.tsx
interface QuickOptionsProps {
  options: string[];
  onSelect?: (option: string) => void;
}

export function QuickOptions({ options, onSelect }: QuickOptionsProps) {
  return (
    <div className="quick-options">
      {options.map((opt, i) => (
        <button
          key={i}
          className="quick-option"
          onClick={() => onSelect?.(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 编写 RoundIndicator 组件**

```tsx
// creator-frontend/src/components/RoundIndicator.tsx
const MAX_ROUNDS = 4;

interface RoundIndicatorProps {
  round: number;
}

export function RoundIndicator({ round }: RoundIndicatorProps) {
  return (
    <div className="round-indicator">
      <div className="round-dots">
        {Array.from({ length: MAX_ROUNDS }, (_, i) => {
          const r = i + 1;
          let cls = 'round-dot';
          if (r < round) cls += ' done';
          else if (r === round) cls += ' active';
          return <div key={r} className={cls} />;
        })}
      </div>
      <span className="round-label">第 {round}/{MAX_ROUNDS} 轮</span>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/components/Bubble.tsx creator-frontend/src/components/QuickOptions.tsx creator-frontend/src/components/RoundIndicator.tsx
git commit -m "feat: add Bubble, QuickOptions, and RoundIndicator components"
```

---

### Task 13: MessageList + InputArea + FileUploader 组件

**Files:**
- Create: `creator-frontend/src/components/MessageList.tsx`
- Create: `creator-frontend/src/components/FileUploader.tsx`
- Create: `creator-frontend/src/components/InputArea.tsx`

- [ ] **Step 1: 编写 MessageList 组件**

```tsx
// creator-frontend/src/components/MessageList.tsx
import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { Bubble } from './Bubble';

interface MessageListProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

export function MessageList({ messages, streamingText, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Bubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingText && (
        <Bubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingText,
            timestamp: Date.now(),
          }}
          isStreaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: 编写 FileUploader 组件**

```tsx
// creator-frontend/src/components/FileUploader.tsx
import { useRef } from 'react';
import type { UploadedFile } from '../types';

interface FileUploaderProps {
  files: UploadedFile[];
  onUpload: (file: File) => void;
  disabled: boolean;
}

export function FileUploader({ files, onUpload, disabled }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) {
      for (let i = 0; i < fileList.length; i++) {
        onUpload(fileList[i]);
      }
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

  return (
    <>
      {files.length > 0 && (
        <div className="file-previews">
          {files.map((f, i) => (
            <div key={i} className="file-preview">
              {isImage(f.name) ? (
                <img src={f.url} alt={f.name} />
              ) : (
                <div className="file-icon">📄</div>
              )}
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </>
  );
}
```

- [ ] **Step 3: 编写 InputArea 组件**

```tsx
// creator-frontend/src/components/InputArea.tsx
import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import type { UploadedFile } from '../types';
import { FileUploader } from './FileUploader';

interface InputAreaProps {
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  uploadedFiles: UploadedFile[];
  disabled: boolean;
}

export function InputArea({ onSend, onUpload, uploadedFiles, disabled }: InputAreaProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && uploadedFiles.length === 0) return;
    onSend(trimmed);
    setText('');
  }, [text, uploadedFiles, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <>
      <FileUploader files={uploadedFiles} onUpload={onUpload} disabled={disabled} />
      <div className="input-area">
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (let i = 0; i < files.length; i++) {
                onUpload(files[i]);
              }
            }
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想做什么视频..."
          rows={1}
          disabled={disabled}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && uploadedFiles.length === 0)}
        >
          ➤
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/components/MessageList.tsx creator-frontend/src/components/FileUploader.tsx creator-frontend/src/components/InputArea.tsx
git commit -m "feat: add MessageList, FileUploader, and InputArea components"
```

---

### Task 14: ChatView 组件

**Files:**
- Create: `creator-frontend/src/components/ChatView.tsx`

- [ ] **Step 1: 编写 ChatView**

```tsx
// creator-frontend/src/components/ChatView.tsx
import { RoundIndicator } from './RoundIndicator';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import type { Message, UploadedFile } from '../types';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  round: number;
  uploadedFiles: UploadedFile[];
  forceConfirm: boolean;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  onGoToConfirm: () => void;
}

export function ChatView({
  messages,
  streamingText,
  isStreaming,
  round,
  uploadedFiles,
  forceConfirm,
  onSend,
  onUpload,
  onGoToConfirm,
}: ChatViewProps) {
  return (
    <>
      <RoundIndicator round={round} />
      <MessageList
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming}
      />
      {forceConfirm && !isStreaming ? (
        <div className="input-area">
          <button
            className="btn-submit"
            onClick={onGoToConfirm}
            style={{
              flex: 1,
              padding: '14px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gradient)',
              color: '#fff',
              border: 'none',
              fontSize: 'var(--font-md)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            📋 查看需求确认
          </button>
        </div>
      ) : (
        <InputArea
          onSend={onSend}
          onUpload={onUpload}
          uploadedFiles={uploadedFiles}
          disabled={isStreaming}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/ChatView.tsx
git commit -m "feat: add ChatView component"
```

---

### Task 15: ConfirmView 组件

**Files:**
- Create: `creator-frontend/src/components/ConfirmView.tsx`

- [ ] **Step 1: 编写 ConfirmView**

```tsx
// creator-frontend/src/components/ConfirmView.tsx
import { useState, useEffect } from 'react';
import { getConfirmData } from '../services/api';
import type { ConfirmData } from '../types';

const LABELS: Record<string, string> = {
  template: '模板类型',
  content: '视频文案',
  platforms: '目标平台',
  files: '素材文件',
  style: '风格偏好',
  tags: '话题标签',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'platforms' && Array.isArray(value)) {
    const map: Record<string, string> = {
      douyin: '抖音',
      kuaishou: '快手',
      xiaohongshu: '小红书',
    };
    return value.map((v) => map[String(v)] || String(v)).join('、');
  }
  if (key === 'files' && Array.isArray(value)) {
    return value.map((f: { name: string }) => f.name).join('、');
  }
  if (Array.isArray(value)) {
    return value.join('、');
  }
  return String(value ?? '未指定');
}

interface ConfirmViewProps {
  sessionId: string;
  onBack: () => void;
  onSubmit: () => void;
}

export function ConfirmView({ sessionId, onBack, onSubmit }: ConfirmViewProps) {
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getConfirmData(sessionId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="confirm-view">
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>加载确认信息...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="confirm-view">
        <p style={{ textAlign: 'center', color: 'var(--error)' }}>{error}</p>
        <div className="confirm-actions">
          <button className="btn-back" onClick={onBack}>← 返回</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const entries = Object.entries(data.items).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );

  return (
    <div className="confirm-view">
      <h2 className="confirm-title">📋 需求确认</h2>

      <div className="confirm-card">
        {entries.map(([key, value]) => (
          <div key={key} className="confirm-item">
            <span className="label">{LABELS[key] || key}</span>
            <span className={`value${data.missing.includes(key) ? '' : ''}`}>
              {formatValue(key, value)}
            </span>
          </div>
        ))}
        {entries.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 'var(--font-md)' }}>
            暂无已收集的信息
          </p>
        )}
      </div>

      {data.missing.length > 0 && (
        <div className="missing-section">
          <div className="missing-title">⚠ 以下信息尚未收集（不影响提交）</div>
          {data.missing.map((field) => (
            <div key={field} className="missing-item">
              · {LABELS[field] || field}
            </div>
          ))}
        </div>
      )}

      <div className="confirm-actions">
        <button className="btn-back" onClick={onBack}>
          ← 继续编辑
        </button>
        <button className="btn-submit" onClick={onSubmit}>
          ✓ 确认提交
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/ConfirmView.tsx
git commit -m "feat: add ConfirmView component"
```

---

### Task 16: ResultView 组件

**Files:**
- Create: `creator-frontend/src/components/ResultView.tsx`

- [ ] **Step 1: 编写 ResultView**

```tsx
// creator-frontend/src/components/ResultView.tsx
import type { TaskResult } from '../types';

interface ResultViewProps {
  result: TaskResult;
  onNewTask: () => void;
}

export function ResultView({ result, onNewTask }: ResultViewProps) {
  return (
    <div className="result-view">
      <div className="result-icon">✅</div>
      <h2 className="result-title">任务已提交</h2>
      <div className="result-info">
        <div>
          任务编号: <strong>{result.taskId}</strong>
        </div>
        <div>
          预计完成: <strong>{result.estimatedMinutes} 分钟</strong>
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          视频正在生成中，完成后将自动发布到指定平台
        </div>
      </div>
      <div className="result-actions">
        <button className="btn-primary" onClick={onNewTask}>
          创建新任务
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/ResultView.tsx
git commit -m "feat: add ResultView component"
```

---

### Task 17: App.tsx 视图路由

**Files:**
- Create: `creator-frontend/src/App.tsx`

- [ ] **Step 1: 编写 App 主组件**

```tsx
// creator-frontend/src/App.tsx
import { useEffect, useState } from 'react';
import { useSession } from './hooks/useSession';
import { ChatView } from './components/ChatView';
import { ConfirmView } from './components/ConfirmView';
import { ResultView } from './components/ResultView';
import type { TaskResult } from './types';

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="splash-screen">
      <div style={{ fontSize: 48 }}>🎬</div>
      <h2>AI 视频创作助手</h2>
      <p>
        用自然语言描述你的视频创意，
        <br />
        AI 将帮你生成并自动发布到多平台
      </p>
      <button onClick={onStart}>开始创作</button>
    </div>
  );
}

export default function App() {
  const {
    state,
    streamingText,
    uploadedFiles,
    initSession,
    sendUserMessage,
    handleFileUpload,
    goToConfirm,
    handleSubmit,
  } = useSession();

  const [result, setResult] = useState<TaskResult | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) {
      initSession();
    }
  }, [started, initSession]);

  const handleStart = () => {
    setStarted(true);
  };

  const handleNewTask = () => {
    setResult(null);
    initSession();
  };

  const handleSubmitTask = async () => {
    const r = await handleSubmit();
    if (r) {
      setResult(r);
    }
  };

  if (!started) {
    return (
      <div className="creator-app">
        <SplashScreen onStart={handleStart} />
      </div>
    );
  }

  if (state.status === 'submitted' && result) {
    return (
      <div className="creator-app">
        <ResultView result={result} onNewTask={handleNewTask} />
      </div>
    );
  }

  if (state.status === 'confirming' && state.sessionId) {
    return (
      <div className="creator-app">
        <ConfirmView
          sessionId={state.sessionId}
          onBack={() => {}}
          onSubmit={handleSubmitTask}
        />
      </div>
    );
  }

  return (
    <div className="creator-app">
      <ChatView
        messages={state.messages}
        streamingText={streamingText}
        isStreaming={state.isStreaming}
        round={state.round}
        uploadedFiles={uploadedFiles}
        forceConfirm={state.forceConfirm}
        onSend={sendUserMessage}
        onUpload={handleFileUpload}
        onGoToConfirm={goToConfirm}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/App.tsx
git commit -m "feat: add App component with view routing"
```

---

## Phase 8: 集成与验证

### Task 18: 更新 Docker Compose 配置

**Files:**
- Modify: `deploy/docker-compose.yml`

- [ ] **Step 1: 在 docker-compose.yml 末尾新增 creator-api 服务**

在现有 `deploy/docker-compose.yml` 的 `services:` 块末尾添加：

```yaml
  creator-api:
    build:
      context: ../creator-api
      dockerfile: ../creator-api/Dockerfile
    ports:
      - "3001:3001"
    environment:
      REDIS_URL: redis://redis:6379
      OPENCLAW_URL: http://openclaw:3000
      MINIO_ENDPOINT: http://minio:9000
      MINIO_BUCKET: creator-uploads
      MINIO_ACCESS_KEY: avatar
      MINIO_SECRET_KEY: ${MINIO_PASSWORD:-changeme123}
    depends_on:
      - openclaw
      - redis
      - minio
```

- [ ] **Step 2: 创建 Dockerfile**

**Files:**
- Create: `creator-api/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml creator-api/Dockerfile
git commit -m "feat: add creator-api service to docker-compose"
```

---

### Task 19: 构建前端并验证

**Files:**
- Modify: `creator-frontend/src/App.tsx` (fix back button handler)

- [ ] **Step 1: 修复 ConfirmView 的返回按钮回调**

ConfirmView 的 `onBack` 目前是空函数。需要恢复 `App.tsx` 中的处理：

在 `App.tsx` 中，加入返回聊天视图的能力。修改 `ConfirmView` 的 `onBack` 属性：

```tsx
<ConfirmView
  sessionId={state.sessionId}
  onBack={() => {
    // 回到聊天视图继续编辑
    setState((prev) => ({ ...prev, status: 'chatting' }));
  }}
  onSubmit={handleSubmitTask}
/>
```

需要从 `useSession` 中额外导出 `setState`，或者在 App 中管理一个本地覆盖：

在 App.tsx 中，用本地 state 覆盖：

将 `state.status === 'confirming'` 的判断改为可被返回操作覆盖。由于 useSession 返回的 state 是只读的，需要在 App 层面加一层 statusOverride：

```tsx
// 在 App 组件顶部添加
const [localStatus, setLocalStatus] = useState<string | null>(null);
const effectiveStatus = localStatus ?? state.status;
```

然后在 ConfirmView 的 onBack 中：

```tsx
onBack={() => setLocalStatus('chatting')}
```

注意：直接修改比较 hacky。更简洁的方式是 useSession 导出一个 `setStatusChatting`：

在 `useSession.ts` 中添加：

```ts
const backToChat = useCallback(() => {
  setState((prev) => ({ ...prev, status: 'chatting' }));
}, []);
```

并在返回值中导出 `backToChat`。

更新 `useSession.ts` 返回值：

```ts
return {
  state,
  streamingText,
  uploadedFiles,
  initSession,
  sendUserMessage,
  handleFileUpload,
  goToConfirm,
  handleSubmit,
  backToChat,
};
```

更新 `App.tsx` 中使用 `backToChat`：

```tsx
const {
  state,
  streamingText,
  uploadedFiles,
  initSession,
  sendUserMessage,
  handleFileUpload,
  goToConfirm,
  handleSubmit,
  backToChat,
} = useSession();
```

然后 ConfirmView 中：

```tsx
<ConfirmView
  sessionId={state.sessionId}
  onBack={backToChat}
  onSubmit={handleSubmitTask}
/>
```

- [ ] **Step 2: 构建前端**

```bash
cd creator-frontend && npm run build
```

预期输出: `✓ built in X.XXs`

- [ ] **Step 3: 启动 creator-api + 验证**

```bash
cd creator-api && node server.js &
sleep 2
curl -X POST http://localhost:3001/api/sessions
```

预期输出: `{"success":true,"sessionId":"...","message":"你好！...","round":1}`

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/useSession.ts creator-frontend/src/App.tsx creator-frontend/dist/
git commit -m "feat: add back-to-chat flow, build frontend, verify API"
```

---

## Phase 9: E2E 验证

### Task 20: 端到端验证

- [ ] **Step 1: 启动完整服务栈（Docker）**

```bash
cd deploy && docker compose up -d
```

- [ ] **Step 2: 验证 creator-api 健康**

```bash
curl http://localhost:3001/
```

预期: 返回前端 index.html

- [ ] **Step 3: 创建会话**

```bash
curl -X POST http://localhost:3001/api/sessions
```

预期输出: `{"success":true,"sessionId":"xxx-xxx","message":"你好！今天想做什么类型的视频？","round":1}`

- [ ] **Step 4: 发送消息（注意：需要 OpenClaw 可用）**

```bash
SESSION_ID=<replace>
curl -X POST http://localhost:3001/api/sessions/$SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"帮我做一个科技评测视频发抖音","attachments":[]}'
```

预期: SSE 流式返回 AI 回复

- [ ] **Step 5: 验证轮次上限**

连续发送 4 条消息，确认第 4 条返回 `forceConfirm: true`

- [ ] **Step 6: 打开移动端浏览器访问**

访问 `http://<server-ip>:3001`，在手机 Chrome 中测试完整对话流程

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: finalize creator-ui with e2e verification"
```

---

## 验证清单

| # | 验证项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | creator-api 依赖安装 | `cd creator-api && npm install` | 无错误 |
| 2 | creator-api 启动 | `node server.js` | `[creator-api] running on http://0.0.0.0:3001` |
| 3 | 创建会话 | `curl -X POST http://localhost:3001/api/sessions` | JSON 含 sessionId |
| 4 | 确认页 | `curl http://localhost:3001/api/sessions/<id>/confirm` | JSON 含 items + missing |
| 5 | 前端构建 | `cd creator-frontend && npm run build` | `✓ built in X.XXs` |
| 6 | 前端 dev server | `cd creator-frontend && npm run dev` | `http://localhost:5173` 可访问 |
| 7 | Redis 连接 | `redis-cli PING` | `PONG` |
| 8 | TODO: 轮次上限 | 连续 4 条消息 | 第 4 条返回 forceConfirm: true |
| 9 | TODO: SSE 流式 | 发送消息 | 浏览器逐字显示 AI 回复 |
| 10 | TODO: 文件上传 | 上传图片 | MinIO Console 确认文件存在 |
| 11 | TODO: 任务提交 | 确认后点击提交 | Redis 中 session 状态变为 submitted |

> 标记 TODO 的验证项需要 OpenClaw 服务可用才能完成。mock 模式下可通过 Node.js 脚本模拟。
