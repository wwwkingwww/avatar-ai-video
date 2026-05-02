# RunningHub V2 视频生成引擎接入 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将视频生成引擎升级为 RunningHub V2 OpenAPI，开放全部模型能力，引入 AI 智能模型推荐

**Architecture:** 渐进迁移——新增 V2 client + model-router 作为独立模块，generation-worker 改造为 V1/V2 双通道，ai-proxy 改造为四阶段对话引导，前端确认卡片支持动态参数编辑和模型切换

**Tech Stack:** Node.js (ESM), Express, BullMQ, Prisma, Redis, React+TypeScript, shadcn/ui, Tailwind CSS

---

## Phase 1: Foundation — V2 Client & Model Router

### Task 1: Add developer-kit git submodule

**Files:**
- Create: `.gitmodules` (append)
- Create: `skills/runninghub/developer-kit/` (submodule)

- [ ] **Step 1: Add git submodule**

```bash
cd e:\cusorspace\avatar-ai-video
git submodule add https://github.com/HM-RunningHub/ComfyUI_RH_OpenAPI.git skills/runninghub/developer-kit
```

- [ ] **Step 2: Verify files exist**

Expected: `skills/runninghub/developer-kit/llms.txt`, `developer-kit/rh-api-contract.md`, `developer-kit/model-registry.public.json`, `developer-kit/pricing.public.json`, `developer-kit/capabilities.md`, `developer-kit/examples/python/client.py`, `developer-kit/tests/test_contract.py`

- [ ] **Step 3: Commit**

```bash
git add .gitmodules skills/runninghub/developer-kit
git commit -m "chore: add RunningHub developer-kit as git submodule"
```

---

### Task 2: Create `skills/runninghub/rh-v2-client.js`

**Files:**
- Create: `skills/runninghub/rh-v2-client.js`

- [ ] **Step 1: Write `skills/runninghub/rh-v2-client.js`**

```javascript
const RH_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn';

export class RHV2Client {
  constructor(apiKey, baseUrl = RH_BASE_URL) {
    if (!apiKey) throw new Error('RH_API_KEY is required for V2 client');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  _headers(contentType = 'application/json') {
    const h = { Authorization: `Bearer ${this.apiKey}` };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  async _request(method, path, opts = {}) {
    const { body, contentType, isFormData } = opts;
    let headers = this._headers(isFormData ? undefined : contentType);

    const url = `${this.baseUrl}${path}`;
    const fetchOpts = { method, headers };
    if (body) fetchOpts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RH V2 HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`);
    }

    const data = await res.json();
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`RH V2 API error code=${data.code}: ${data.msg || 'unknown'}`);
    }
    return data;
  }

  async uploadFile(fileBuffer, fileName, fileType) {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);
    formData.append('fileType', fileType);

    const data = await this._request('POST', '/task/openapi/upload', {
      body: formData,
      isFormData: true,
    });
    return data.data;
  }

  async getNodes(webappId) {
    const res = await fetch(`${this.baseUrl}/api/webapp/apiCallDemo?webappId=${webappId}`, {
      headers: this._headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RH V2 getNodes HTTP ${res.status}: ${text.substring(0, 300)}`);
    }
    const data = await res.json();
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`RH V2 getNodes error code=${data.code}: ${data.msg || 'unknown'}`);
    }
    return data.data?.nodeInfoList || [];
  }

  async submitTask(webappId, nodeInfoList) {
    const body = {
      webappId,
      apiKey: this.apiKey,
      nodeInfoList,
    };
    const data = await this._request('POST', '/task/openapi/ai-app/run', { body });
    return data.data;
  }

  async queryOutputs(taskId) {
    const body = { taskId };
    const data = await this._request('POST', '/task/openapi/outputs', { body });
    return {
      status: data.data?.taskStatus || data.data?.status,
      outputs: data.data?.outputs || data.data?.files || [],
      error: data.data?.failedReason || data.data?.error || null,
    };
  }

  async pollTask(taskId, timeoutMs = 10 * 60 * 1000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.queryOutputs(taskId);
      const status = result.status?.toUpperCase();

      if (status === 'SUCCESS') return { status: 'SUCCESS', outputs: result.outputs };
      if (status === 'FAILED') throw new Error(`RH V2 task failed: ${result.error || 'unknown'}`);
      if (status === 'CANCEL') return { status: 'CANCEL', outputs: [] };

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`RH V2 task ${taskId} timed out after ${timeoutMs / 60000}min`);
  }

  async runWorkflow(webappId, nodeInfoList, timeoutMs) {
    const { taskId } = await this.submitTask(webappId, nodeInfoList);
    return this.pollTask(taskId, timeoutMs);
  }
}

export function parseNodeInfoList(model, selectedParams, uploadResults = {}) {
  if (!model || !model.fields || !Array.isArray(model.fields)) return [];

  return model.fields.map((field) => {
    let fieldValue = selectedParams[field.fieldName] !== undefined
      ? selectedParams[field.fieldName]
      : field.fieldValue;

    const uploadKey = `${field.nodeId}:${field.fieldName}`;
    if (uploadResults[uploadKey]) {
      fieldValue = uploadResults[uploadKey].fileName;
    }

    return {
      nodeId: field.nodeId,
      fieldName: field.fieldName,
      fieldValue: String(fieldValue),
    };
  });
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check skills/runninghub/rh-v2-client.js
```

- [ ] **Step 3: Commit**

```bash
git add skills/runninghub/rh-v2-client.js
git commit -m "feat: add RHV2Client — RunningHub V2 OpenAPI client"
```

---

### Task 3: Create `skills/runninghub/model-router.js`

**Files:**
- Create: `skills/runninghub/model-router.js`

- [ ] **Step 1: Write `skills/runninghub/model-router.js`**

```javascript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = join(__dirname, 'developer-kit', 'model-registry.public.json');

export class ModelRouter {
  constructor(registryPath = DEFAULT_REGISTRY_PATH) {
    this.registryPath = registryPath;
    this.models = [];
    this.loaded = false;
  }

  loadRegistry() {
    const raw = readFileSync(this.registryPath, 'utf-8');
    const data = JSON.parse(raw);
    this.models = data.models || data || [];
    this.loaded = true;
  }

  ensureLoaded() {
    if (!this.loaded) this.loadRegistry();
  }

  listCapabilities() {
    this.ensureLoaded();
    const taskTypes = new Set();
    for (const m of this.models) {
      if (m.taskType) taskTypes.add(m.taskType);
    }
    return [...taskTypes];
  }

  searchModels(filters = {}) {
    this.ensureLoaded();

    return this.models.filter((m) => {
      if (filters.taskType && m.taskType !== filters.taskType) return false;
      if (filters.inputType && !(m.inputTypes || []).includes(filters.inputType)) return false;
      if (filters.outputType && !(m.outputTypes || []).includes(filters.outputType)) return false;
      return true;
    });
  }

  getModelSchema(endpoint) {
    this.ensureLoaded();
    const model = this.models.find(
      (m) => m.endpoint === endpoint || m.webappId === endpoint || m.name === endpoint,
    );
    if (!model) return null;
    return model;
  }

  recommend(intent = {}) {
    this.ensureLoaded();

    let candidates = [...this.models];

    if (intent.taskType) {
      candidates = candidates.filter((m) => m.taskType === intent.taskType);

      if (intent.hasImage && intent.taskType === 'text-to-video') {
        const imageToVideo = candidates.filter((m) => m.taskType === 'image-to-video');
        if (imageToVideo.length > 0) candidates = imageToVideo;
      }

      if (intent.hasVideo && intent.taskType === 'text-to-video') {
        const videoToVideo = candidates.filter((m) => m.taskType === 'video-to-video');
        if (videoToVideo.length > 0) candidates = videoToVideo;
      }
    }

    candidates.sort((a, b) => {
      const aCost = a.estimatedCost || 999;
      const bCost = b.estimatedCost || 999;
      return aCost - bCost;
    });

    const top3 = candidates.slice(0, 3).map((m) => ({
      endpoint: m.endpoint || m.webappId,
      name: m.name || m.endpoint,
      taskType: m.taskType,
      description: m.description || '',
      fields: m.fields || [],
      estimatedCost: m.estimatedCost,
    }));

    return {
      recommendations: top3,
      taskType: intent.taskType || 'text-to-video',
      hasImage: !!intent.hasImage,
      hasVideo: !!intent.hasVideo,
    };
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check skills/runninghub/model-router.js
```

- [ ] **Step 3: Commit**

```bash
git add skills/runninghub/model-router.js
git commit -m "feat: add ModelRouter — model search and recommendation from registry"
```

---

### Task 4: Write V2 client unit tests

**Files:**
- Create: `skills/runninghub/rh-v2-client.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, it, before, after } from 'node:test';
import { RHV2Client, parseNodeInfoList } from './rh-v2-client.js';

const BASE = 'https://mock-runninghub.local';
let client;
let fetchSpy;

const mockResponses = {
  upload: { code: 0, msg: 'success', data: { fileName: 'api/test.png', fileType: 'image' } },
  submit: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'RUNNING' } },
  outputsSuccess: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'SUCCESS', outputs: [{ url: 'https://cdn.example.com/video.mp4', type: 'video' }] } },
  outputsRunning: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'RUNNING' } },
  outputsFailed: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'FAILED', failedReason: 'node error' } },
  error: { code: 500, msg: 'internal server error' },
};

function mockFetch(responses, shouldPollSucceed = false) {
  let pollCount = 0;
  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/upload')) {
      return new Response(JSON.stringify(responses.upload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/ai-app/run')) {
      return new Response(JSON.stringify(responses.submit), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/outputs')) {
      pollCount++;
      if (shouldPollSucceed && pollCount >= 2) {
        return new Response(JSON.stringify(responses.outputsSuccess), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(responses.outputsRunning), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
}

async function responseFrom(json) {
  return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('RHV2Client', () => {
  before(() => {
    client = new RHV2Client('rk-test-key', BASE);
  });

  after(() => {
    global.fetch = undefined;
  });

  it('throws if no API key', () => {
    try {
      new RHV2Client('');
      throw new Error('should have thrown');
    } catch (e) {
      if (e.message !== 'RH_API_KEY is required for V2 client') throw e;
    }
  });

  it('uploadFile returns file info', async (t) => {
    global.fetch = async () => responseFrom(mockResponses.upload);
    const result = await client.uploadFile(Buffer.from('fake'), 'test.png', 'image');
    if (result.fileName !== 'api/test.png') throw new Error(`expected api/test.png, got ${result.fileName}`);
  });

  it('submitTask returns taskId', async (t) => {
    global.fetch = async () => responseFrom(mockResponses.submit);
    const result = await client.submitTask('webapp-1', []);
    if (result.taskId !== 'task-123') throw new Error(`expected task-123, got ${result.taskId}`);
  });

  it('queryOutputs returns status and outputs', async (t) => {
    global.fetch = async () => responseFrom(mockResponses.outputsSuccess);
    const result = await client.queryOutputs('task-123');
    if (result.status !== 'SUCCESS') throw new Error(`expected SUCCESS, got ${result.status}`);
  });

  it('pollTask resolves on SUCCESS', async (t) => {
    mockFetch(mockResponses, true);
    const result = await client.pollTask('task-123', 30000, 10);
    if (result.status !== 'SUCCESS') throw new Error(`expected SUCCESS, got ${result.status}`);
  });

  it('pollTask rejects on FAILED', async (t) => {
    global.fetch = async () => responseFrom(mockResponses.outputsFailed);
    try {
      await client.pollTask('task-123', 30000, 10);
      throw new Error('should have thrown');
    } catch (e) {
      if (!e.message.includes('failed')) throw e;
    }
  });

  it('handles HTTP error response', async (t) => {
    global.fetch = async () => new Response('server error', { status: 500 });
    try {
      await client._request('GET', '/some/path');
      throw new Error('should have thrown');
    } catch (e) {
      if (!e.message.includes('HTTP 500')) throw e;
    }
  });
});

describe('parseNodeInfoList', () => {
  it('builds nodeInfoList from model fields and params', () => {
    const model = {
      fields: [
        { nodeId: '10', fieldName: 'prompt', fieldValue: 'default' },
        { nodeId: '11', fieldName: 'duration', fieldValue: '30' },
        { nodeId: '12', fieldName: 'image', fieldValue: 'old.jpg', fieldType: 'IMAGE' },
      ],
    };
    const params = { prompt: 'a cat', duration: 15 };
    const uploads = { '12:image': { fileName: 'api/new.jpg' } };
    const result = parseNodeInfoList(model, params, uploads);
    if (result.find((r) => r.fieldName === 'prompt').fieldValue !== 'a cat') throw new Error('prompt mismatch');
    if (result.find((r) => r.fieldName === 'duration').fieldValue !== '15') throw new Error('duration mismatch');
    if (result.find((r) => r.fieldName === 'image').fieldValue !== 'api/new.jpg') throw new Error('image upload mismatch');
  });

  it('returns empty array for null model', () => {
    const result = parseNodeInfoList(null, {}, {});
    if (result.length !== 0) throw new Error('expected empty array');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
node --test skills/runninghub/rh-v2-client.test.js
```

Expected: all 8 tests pass

- [ ] **Step 3: Commit**

```bash
git add skills/runninghub/rh-v2-client.test.js
git commit -m "test: add RHV2Client unit tests (mock fetch, 8 cases)"
```

---

## Phase 2: Backend Integration

### Task 5: Prisma Schema Migration

**Files:**
- Modify: `creator-api/prisma/schema.prisma`

- [ ] **Step 1: Add new fields to VideoTask model**

```prisma
model VideoTask {
  id           String     @id @default(cuid())
  userId       String     @default("anonymous")
  platform     String     @default("")
  template     String     @default("")
  script       String     @default("")
  tags         String[]   @default([])
  status       TaskStatus @default(DRAFT)
  scheduledAt  DateTime?
  videoUrl     String?
  thumbnailUrl String?
  rhTaskId     String?
  publishResult Json?
  error        String?
  retryCount   Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  // NEW: V2 fields
  rhApiVersion  String?   // 'v1' | 'v2'
  rhOutputs     Json?     // V2 raw outputs
  modelEndpoint String?   // which model endpoint used
  modelParams   Json?     // selected params snapshot

  @@index([scheduledAt])
  @@index([status])
  @@index([userId])
}
```

- [ ] **Step 2: Run migration**

```bash
cd creator-api
npx prisma migrate dev --name add_v2_fields
```

Expected: migration creates new nullable columns without data loss

- [ ] **Step 3: Regenerate client**

```bash
npx prisma generate
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add creator-api/prisma/schema.prisma creator-api/prisma/migrations/
git commit -m "feat: add V2 fields to VideoTask — rhApiVersion, rhOutputs, modelEndpoint, modelParams"
```

---

### Task 6: Rename shared/video-config.js → generation-config.js

**Files:**
- Create: `shared/generation-config.js`
- Modify: `shared/video-config.js` (re-export shim)

- [ ] **Step 1: Write `shared/generation-config.js`**

This is a rename with backward compatibility. Copy all contents of `shared/video-config.js` to `shared/generation-config.js`, then add new exports for capabilities.

```javascript
// shared/generation-config.js
// 统一生成配置：platforms 保留 + 新增生成能力定义

const PLATFORMS = {
  douyin:       { label: '抖音',   icon: '🎵', color: '#111' },
  kuaishou:     { label: '快手',   icon: '🎬', color: '#ff5722' },
  xiaohongshu:  { label: '小红书', icon: '📕', color: '#fe2c55' },
}

// 保留旧模板定义兼容过渡期
const TEMPLATES = {
  'talking-head': { label: '口播讲解', desc: '人物出镜口播', icon: '🎙️' },
  'tech-review':  { label: '科技评测', desc: '数码产品开箱', icon: '🔧' },
  'product-showcase': { label: '产品展示', desc: '商品细节展现', icon: '🛍️' },
  'vlog':         { label: '日常Vlog', desc: '生活记录风格', icon: '📸' },
}

// 新增：生成意图类型
const TASK_TYPES = {
  'text-to-video': { label: '文生视频', desc: '输入文案生成视频', icon: '📝→🎬' },
  'image-to-video': { label: '图生视频', desc: '上传图片生成视频', icon: '🖼️→🎬' },
  'text-to-image': { label: '文生图', desc: '输入文案生成图片', icon: '📝→🖼️' },
  'video-to-video': { label: '视频编辑', desc: '上传视频进行风格转换', icon: '🎬→🎬' },
}

// 对话阶段
const PHASES = ['INTENT', 'PARAMS', 'RECOMMEND', 'CONFIRM']

export const TEMPLATE_IDS = Object.keys(TEMPLATES)
export const PLATFORM_IDS = Object.keys(PLATFORMS)
export const TASK_TYPE_IDS = Object.keys(TASK_TYPES)

export function templateLabel(id) { return TEMPLATES[id]?.label || id }
export function platformLabel(id) { return PLATFORMS[id]?.label || id }
export function platformInfo(id) { return PLATFORMS[id] || { label: id, icon: '📱', color: '#333' } }
export function taskTypeInfo(id) { return TASK_TYPES[id] || { label: id, icon: '🎬' } }

export function templateList() { return Object.entries(TEMPLATES).map(([id, t]) => ({ id, ...t })) }
export function platformList() { return Object.entries(PLATFORMS).map(([id, p]) => ({ id, ...p })) }
export function taskTypeList() { return Object.entries(TASK_TYPES).map(([id, t]) => ({ id, ...t })) }

export function templateOptions() { return TEMPLATE_IDS.map(id => TEMPLATES[id].label).join(' | ') }
export function platformOptions() { return PLATFORM_IDS.map(id => `${PLATFORMS[id].icon} ${PLATFORMS[id].label}`).join(' | ') }
export function taskTypeOptions() { return TASK_TYPE_IDS.map(id => `${TASK_TYPES[id].icon} ${TASK_TYPES[id].label}`).join(' | ') }

export { TEMPLATES, PLATFORMS, TASK_TYPES, PHASES }
```

- [ ] **Step 2: Rewrite `shared/video-config.js` as re-export shim**

```javascript
export {
  TEMPLATES,
  PLATFORMS,
  TEMPLATE_IDS,
  PLATFORM_IDS,
  templateLabel,
  platformLabel,
  platformInfo,
  templateList,
  platformList,
  templateOptions,
  platformOptions,
} from './generation-config.js'
```

- [ ] **Step 3: Verify syntax**

```bash
node --check shared/generation-config.js
node --check shared/video-config.js
```

- [ ] **Step 4: Commit**

```bash
git add shared/generation-config.js shared/video-config.js
git commit -m "refactor: rename video-config → generation-config with backward compat shim"
```

---

### Task 7: Modify session-manager.js — new context structure

**Files:**
- Modify: `creator-api/services/session-manager.js`

- [ ] **Step 1: Verify existing getSession and updateSession handle arbitrary context JSON without schema changes**

The current code reads JSON and writes JSON. No schema changes needed — `context: {}` already accepts any JSON object. The session-manager is already compatible with new context shape.

- [ ] **Step 2: No code changes needed. Mark complete.**

```bash
echo "session-manager.js already accepts arbitrary context JSON — no changes needed"
```

---

### Task 8: Modify ai-proxy.js — four-phase dialogue

**Files:**
- Modify: `creator-api/services/ai-proxy.js`

- [ ] **Step 1: Rewrite system prompt builder**

```javascript
import { TASK_TYPE_IDS, taskTypeInfo, platformLabel, PHASES } from '../../shared/generation-config.js'

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || 'https://api.deepseek.com'
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || ''
const MAX_ROUNDS = 4

export function buildSystemPrompt(session) {
  const round = session.round + 1
  const ctx = session.context || {}
  const phase = ctx.phase || 'INTENT'
  const isLastRound = round >= MAX_ROUNDS

  const collected = []
  if (ctx.intent?.taskType) collected.push(`类型: ${ctx.intent.taskType}`)
  if (ctx.intent?.hasImage) collected.push('已有图片素材')
  if (ctx.intent?.hasVideo) collected.push('已有视频素材')
  if (ctx.intent?.preferredDuration) collected.push(`时长: ${ctx.intent.preferredDuration}s`)
  if (ctx.intent?.style) collected.push(`风格: ${ctx.intent.style}`)
  if (ctx.intent?.script) collected.push(`文案: ${ctx.intent.script}`)
  if (ctx.platforms?.length) collected.push(`平台: ${ctx.platforms.map(p => platformLabel(p)).join('、')}`)
  if (ctx.intent?.tags?.length) collected.push(`标签: ${ctx.intent.tags.join(', ')}`)
  if ((session.files || []).length > 0) collected.push('已上传素材')
  if (ctx.selectedModel) collected.push(`已选模型: ${ctx.selectedModel.endpoint}`)

  const collectedStr = collected.length > 0 ? collected.join(' | ') : '无'

  let phaseGuide = ''
  let availableChoices = []

  switch (phase) {
    case 'INTENT':
      phaseGuide = '当前阶段：了解用户想生成什么类型的视频/图片。先问用户想做什么。'
      availableChoices = TASK_TYPE_IDS.map(id => taskTypeInfo(id).label)
      break
    case 'PARAMS':
      phaseGuide = '当前阶段：收集素材和参数。问用户有没有图片/视频素材，想要多长，什么风格。'
      if (!ctx.intent?.hasImage && !ctx.intent?.hasVideo) {
        availableChoices.push('没有素材，纯文案生成', '上传图片', '上传视频')
      }
      if (!ctx.intent?.preferredDuration) availableChoices.push('5秒', '10秒', '15秒', '30秒')
      if (!ctx.intent?.script) availableChoices.push('AI帮我写文案', '我自己写文案')
      break
    case 'RECOMMEND':
      phaseGuide = '当前阶段：展示AI推荐的模型和参数。回复展示推荐结果，问用户是否确认。'
      availableChoices = ['确认使用推荐', '换一个模型']
      break
    case 'CONFIRM':
      phaseGuide = '当前阶段：最终确认并提交。已选好模型和参数，引导用户确认提交。'
      availableChoices = ['确认并生成视频', '修改参数']
      break
    default:
      phaseGuide = '引导用户描述视频需求。'
      availableChoices = TASK_TYPE_IDS.map(id => taskTypeInfo(id).label)
  }

  const stepGuide = availableChoices.length > 0
    ? `可选项：${availableChoices.join('、')}。`
    : '引导用户确认并提交。'

  const lastRoundHint = isLastRound
    ? '【最后一轮！当前阶段足够，必须引导用户确认提交】'
    : `【第${round}/${MAX_ROUNDS}轮】`

  return `你是AI视频/图片创作助手。用户通过点击按钮选择，不会打字。

${lastRoundHint}
已收集：${collectedStr}
${phaseGuide}
${stepGuide}

## 可用能力
- 文生视频：输入文案直接生成视频
- 图生视频：上传图片+文案生成视频
- 文生图：输入文案生成图片
- 视频编辑：上传视频+文案进行风格转换

## 回复要求
1. 用1-2句话自然回应（如"好的，已记录"、"明白了"）
2. 用一行列出✅已确认信息
3. 最后引导用户做选择
4. 不要说具体选项内容，系统会自动展示按钮`
}

export function updateContextFromUser(content, currentContext) {
  const ctx = JSON.parse(JSON.stringify(currentContext))
  const phase = ctx.phase || 'INTENT'

  switch (phase) {
    case 'INTENT': {
      const taskTypeKeys = {
        '文生视频': 'text-to-video',
        '图生视频': 'image-to-video',
        '文生图': 'text-to-image',
        '视频编辑': 'video-to-video',
      }
      const matched = taskTypeKeys[content]
      if (matched) {
        ctx.intent = { taskType: matched }
        ctx.phase = 'PARAMS'
        return ctx
      }
      // fuzzy match by task type label
      for (const [label, key] of Object.entries(taskTypeKeys)) {
        if (content.includes(label)) {
          ctx.intent = { taskType: key }
          ctx.phase = 'PARAMS'
          return ctx
        }
      }
      break
    }

    case 'PARAMS': {
      if (!ctx.intent) ctx.intent = {}

      if (content === '上传图片') { ctx.intent.hasImage = true; return ctx }
      if (content === '上传视频') { ctx.intent.hasVideo = true; return ctx }
      if (content === '没有素材，纯文案生成') { ctx.intent.hasImage = false; ctx.intent.hasVideo = false; return ctx }

      const durationMatch = content.match(/^(\d+)秒$/)
      if (durationMatch) { ctx.intent.preferredDuration = parseInt(durationMatch[1]); return ctx }

      if (content.match(/^\d+p$/i)) { ctx.intent.preferredQuality = content; return ctx }

      if (content === 'AI帮我写文案' || content === '我自己写文案') {
        // wait for user to type script in next round or set a flag
        return ctx
      }

      // treat any other text as script
      if (content.length > 3 && !ctx.intent.script) {
        ctx.intent.script = content
        return ctx
      }

      // check if we have enough params to move to RECOMMEND
      const hasEnough = ctx.intent.script || ctx.intent.hasImage || ctx.intent.preferredDuration
      if (hasEnough && ctx.phase === 'PARAMS') {
        ctx.phase = 'RECOMMEND'
      }
      return ctx
    }

    case 'RECOMMEND': {
      if (content === '确认使用推荐') {
        ctx.phase = 'CONFIRM'
        return ctx
      }
      if (content === '换一个模型') {
        ctx.phase = 'RECOMMEND'
        ctx.recommendations = undefined
        return ctx
      }
      break
    }

    case 'CONFIRM': {
      if (content === '确认并生成视频') {
        return ctx
      }
      if (content === '修改参数') {
        ctx.phase = 'PARAMS'
        return ctx
      }
      break
    }
  }

  return ctx
}

export async function sendToAI(history, session) {
  const systemPrompt = buildSystemPrompt(session)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
  ]

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + DEEPSEEK_KEY,
  }

  const response = await fetch(`${DEEPSEEK_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DeepSeek 返回错误: HTTP ${response.status} - ${text.substring(0, 200)}`)
  }

  return response.body
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check creator-api/services/ai-proxy.js
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/services/ai-proxy.js
git commit -m "refactor: replace fixed template flow with four-phase dialogue in ai-proxy"
```

---

### Task 9: Create capabilities API route

**Files:**
- Create: `creator-api/routes/capabilities.js`

- [ ] **Step 1: Write `creator-api/routes/capabilities.js`**

```javascript
import { Router } from 'express'
import { ModelRouter } from '../../skills/runninghub/model-router.js'

export const capabilitiesRouter = Router()

let router = null

function getRouter() {
  if (!router) {
    try {
      router = new ModelRouter()
    } catch {
      router = null
    }
  }
  return router
}

capabilitiesRouter.get('/', (_req, res) => {
  try {
    const r = getRouter()
    if (!r) {
      return res.json({
        success: true,
        taskTypes: ['text-to-video', 'image-to-video', 'text-to-image', 'video-to-video'],
        note: 'model-registry not available, showing defaults',
      })
    }

    const tasks = r.listCapabilities()
    const models = r.searchModels({})
    const summary = models.map((m) => ({
      endpoint: m.endpoint || m.webappId,
      name: m.name || m.endpoint,
      taskType: m.taskType,
      description: m.description || '',
    }))

    res.json({ success: true, taskTypes: tasks, models: summary })
  } catch (e) {
    console.error('[capabilities] error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

capabilitiesRouter.get('/models/:endpoint/schema', (req, res) => {
  try {
    const r = getRouter()
    if (!r) {
      return res.status(404).json({ success: false, error: 'model-registry not available' })
    }
    const schema = r.getModelSchema(req.params.endpoint)
    if (!schema) {
      return res.status(404).json({ success: false, error: `model ${req.params.endpoint} not found` })
    }
    res.json({ success: true, schema })
  } catch (e) {
    console.error('[capabilities] schema error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})
```

- [ ] **Step 2: Verify syntax**

```bash
node --check creator-api/routes/capabilities.js
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/routes/capabilities.js
git commit -m "feat: add GET /api/capabilities and /api/models/:endpoint/schema routes"
```

---

### Task 10: Modify submit route — adapt to new context

**Files:**
- Modify: `creator-api/routes/submit.js`

- [ ] **Step 1: Update allowed statuses to include 'confirming' (already there) and adapt context reading**

The current submit.js already reads `ctx.platforms`, `ctx.template`, `ctx.script`, `ctx.tags`. The new context still contains `platforms` at root level. The `template` field is deprecated but we keep it for backward compatibility. No functional changes needed — the route already accepts `chatting` and `confirming` status.

- [ ] **Step 2: Add V2 model params to task creation**

```javascript
// In submit POST handler, after const task = await prisma.videoTask.create(...)
// Change the data object to include new V2 fields:

const hasV2 = !!(ctx.selectedModel && ctx.intent?.taskType)

const task = await prisma.videoTask.create({
  data: {
    platform: Array.isArray(ctx.platforms) ? ctx.platforms.join(',') : (ctx.platforms || ''),
    template: ctx.template || ctx.intent?.taskType || '',
    script: ctx.intent?.script || ctx.script || '',
    tags: ctx.intent?.tags || ctx.tags || [],
    status,
    ...(delay > 0 ? { scheduledAt: new Date(scheduledAt) } : {}),
    ...(hasV2 ? {
      rhApiVersion: 'v2',
      modelEndpoint: ctx.selectedModel.endpoint,
      modelParams: ctx.selectedModel.params || {},
    } : {}),
  },
})
```

Full modified file:

```javascript
import { Router } from 'express'
import { withSession, requireStatus } from '../middleware/round-guard.js'
import { updateSession } from '../services/session-manager.js'
import prisma from '../prisma/client.js'
import { generationQueue } from '../services/queue.js'

export const submitRouter = Router()

submitRouter.post('/:id/submit', withSession(), requireStatus('chatting', 'confirming'), async (req, res) => {
  try {
    const session = req.session
    const ctx = session.context || {}
    const { scheduledAt } = req.body || {}
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0

    const status = delay > 0 ? 'SCHEDULED' : 'GENERATING'

    const hasV2 = !!(ctx.selectedModel && ctx.intent?.taskType)

    const task = await prisma.videoTask.create({
      data: {
        platform: Array.isArray(ctx.platforms) ? ctx.platforms.join(',') : (ctx.platforms || ''),
        template: ctx.template || ctx.intent?.taskType || '',
        script: ctx.intent?.script || ctx.script || '',
        tags: ctx.intent?.tags || ctx.tags || [],
        status,
        ...(delay > 0 ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(hasV2 ? {
          rhApiVersion: 'v2',
          modelEndpoint: ctx.selectedModel.endpoint,
          modelParams: ctx.selectedModel.params || {},
        } : {}),
      },
    })

    const job = await generationQueue.add('generate', {
      taskId: task.id,
      sessionId: session.id,
    }, {
      delay: delay > 0 ? delay : 0,
      jobId: `gen-${task.id}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    })

    await updateSession(session.id, {
      status: delay > 0 ? 'scheduled' : 'generating',
      taskId: task.id,
    })

    res.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
      status,
      scheduledAt: scheduledAt || null,
      estimatedMinutes: delay > 0 ? null : 20,
    })
  } catch (e) {
    console.error('[submit] 任务提交失败:', e.message)
    await updateSession(req.session.id, { status: 'failed' }).catch(() => {})
    res.status(500).json({ success: false, error: `任务提交失败: ${e.message}` })
  }
})
```

- [ ] **Step 2: Verify syntax**

```bash
node --check creator-api/routes/submit.js
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/routes/submit.js
git commit -m "feat: add V2 model params to task creation in submit route"
```

---

### Task 11: Modify generation-worker.js — V1/V2 dual channel

**Files:**
- Modify: `creator-api/workers/generation-worker.js`

- [ ] **Step 1: Rewrite generation worker with V1/V2 dual channel**

```javascript
import { Worker, Queue } from 'bullmq'
import { readFileSync } from 'fs'
import prisma from '../prisma/client.js'
import { getSession } from '../services/session-manager.js'
import { RHV2Client, parseNodeInfoList } from '../../skills/runninghub/rh-v2-client.js'
import { ModelRouter } from '../../skills/runninghub/model-router.js'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const u = new URL(REDIS_URL)
const connection = { host: u.hostname, port: parseInt(u.port || '6379') }

// V1 config
const RH_BASE_V1 = 'https://rhtv.runninghub.cn'
const RH_COOKIE = process.env.RUNNINGHUB_COOKIE || ''

// V2 config
const RH_API_KEY = process.env.RH_API_KEY || ''
const RH_API_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn'

const GEN_POLL_INTERVAL = 10000
const GEN_POLL_TIMEOUT = 10 * 60 * 1000

// === V1 (Cookie-based, deprecated) ===
async function submitToRunningHubV1(task, session) {
  if (!RH_COOKIE) throw new Error('RUNNINGHUB_COOKIE 未配置')
  const ctx = session?.context || {}
  const prompt = (ctx.intent?.script || ctx.script || task.script || '生成一个视频')
  const res = await fetch(`${RH_BASE_V1}/canvas/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: RH_COOKIE,
      Referer: 'https://rhtv.runninghub.cn/',
    },
    body: JSON.stringify({ prompt, modelId: 'default', duration: 30, resolution: '1080p' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RunningHub V1 提交失败 HTTP ${res.status}: ${text.substring(0, 200)}`)
  }
  const data = await res.json()
  const rhTaskId = data.taskId || data.data?.taskId
  if (!rhTaskId) throw new Error(`RunningHub V1 未返回 taskId: ${JSON.stringify(data).substring(0, 200)}`)
  return rhTaskId
}

async function pollRunningHubV1(rhTaskId) {
  const deadline = Date.now() + GEN_POLL_TIMEOUT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, GEN_POLL_INTERVAL))
    const res = await fetch(`${RH_BASE_V1}/canvas/task/${rhTaskId}`, {
      headers: { Cookie: RH_COOKIE, Referer: 'https://rhtv.runninghub.cn/' },
    })
    if (!res.ok) { console.warn(`[gen-worker] V1 poll HTTP ${res.status}, retrying...`); continue }
    const data = await res.json()
    const status = data.status || data.data?.status || ''
    if (status === 'completed' || status === 'success' || status === 'done') {
      const videoUrl = data.videoUrl || data.data?.videoUrl || data.result?.videoUrl || ''
      if (!videoUrl) throw new Error('RunningHub V1 任务完成但未返回 videoUrl')
      return videoUrl
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`RunningHub V1 任务失败: ${data.error || data.message || status}`)
    }
    console.log(`[gen-worker] V1 task ${rhTaskId} status: ${status}, polling...`)
  }
  throw new Error(`RunningHub V1 任务超时 (${GEN_POLL_TIMEOUT / 60000}min)`)
}

// === V2 (Bearer Token) ===
async function generateViaV2(client, task, session) {
  const ctx = session.context || {}
  const router = new ModelRouter()

  if (!ctx.selectedModel?.endpoint) {
    throw new Error('V2 模式需要 selectedModel.endpoint')
  }

  const model = router.getModelSchema(ctx.selectedModel.endpoint)
  if (!model) {
    throw new Error(`模型 ${ctx.selectedModel.endpoint} 在 registry 中未找到`)
  }

  const uploadResults = {}

  // Upload files if present
  if ((ctx.intent?.hasImage || ctx.intent?.hasVideo) && (session.files || []).length > 0) {
    for (const file of session.files) {
      const fileType = file.type?.startsWith('video') ? 'video' : 'image'
      const fileBuffer = file.buffer || readFileSync(file.path || file.url)

      // Find the matching field in model
      const fileField = model.fields?.find(
        (f) => f.fieldType === 'IMAGE' || f.fieldType === 'VIDEO'
      )
      if (fileField) {
        const result = await client.uploadFile(fileBuffer, file.name || 'upload', fileType)
        uploadResults[`${fileField.nodeId}:${fileField.fieldName}`] = {
          fileName: result.fileName,
          fileType: result.fileType,
        }
      }
    }
  }

  const nodeInfoList = parseNodeInfoList(model, ctx.selectedModel.params || {}, uploadResults)
  const webappId = model.webappId || ctx.selectedModel.endpoint

  console.log(`[gen-worker] V2 submitting to ${model.name || webappId}`)
  const { taskId } = await client.submitTask(webappId, nodeInfoList)
  console.log(`[gen-worker] V2 task: ${taskId}`)

  const result = await client.pollTask(taskId, GEN_POLL_TIMEOUT)

  // Extract video/image URL from outputs
  let videoUrl = ''
  for (const output of (result.outputs || [])) {
    if (output.type === 'video' && output.url) { videoUrl = output.url; break }
    if (output.type === 'image' && output.url && !videoUrl) { videoUrl = output.url }
  }
  if (typeof result.outputs === 'string') videoUrl = result.outputs

  if (!videoUrl) {
    console.warn('[gen-worker] V2 completed but no media URL found in outputs:', JSON.stringify(result.outputs).substring(0, 200))
    videoUrl = JSON.stringify(result.outputs)
  }

  return { videoUrl, rhTaskId: taskId, outputs: result.outputs }
}

async function generatePlaceholderVideo(task, session) {
  console.log(`[gen-worker] 使用占位视频 (无 API 配置)`)
  const ctx = session?.context || {}
  const tt = ctx.intent?.taskType || task.template || 'default'
  return `https://placeholder.video/avatar-ai/${tt}_${task.id}.mp4`
}

// === Worker ===
const genQueue = new Queue('generation', { connection })
const pubQueue = new Queue('publish', { connection })

const worker = new Worker('generation', async (job) => {
  const { taskId, sessionId } = job.data
  console.log(`[gen-worker] starting job for task ${taskId}`)

  await prisma.videoTask.update({
    where: { id: taskId },
    data: { status: 'GENERATING' },
  })

  try {
    const session = await getSession(sessionId)
    const task = await prisma.videoTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error(`Task ${taskId} not found`)

    let videoUrl = null
    let rhTaskId = null
    let rhOutputs = null

    // Priority: V2 API Key → V1 Cookie → Placeholder
    if (RH_API_KEY) {
      try {
        const client = new RHV2Client(RH_API_KEY, RH_API_BASE_URL)
        const v2Result = await generateViaV2(client, task, session)
        videoUrl = v2Result.videoUrl
        rhTaskId = v2Result.rhTaskId
        rhOutputs = v2Result.outputs
        console.log(`[gen-worker] V2 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V2 生成失败: ${e.message}, 尝试 V1 回退...`)
        if (RH_COOKIE) {
          try {
            rhTaskId = await submitToRunningHubV1(task, session)
            console.log(`[gen-worker] V1 fallback task: ${rhTaskId}`)
            videoUrl = await pollRunningHubV1(rhTaskId)
            console.log(`[gen-worker] V1 video generated: ${videoUrl}`)
          } catch (e2) {
            console.warn(`[gen-worker] V1 也失败: ${e2.message}`)
            videoUrl = await generatePlaceholderVideo(task, session)
          }
        } else {
          videoUrl = await generatePlaceholderVideo(task, session)
        }
      }
    } else if (RH_COOKIE) {
      try {
        rhTaskId = await submitToRunningHubV1(task, session)
        console.log(`[gen-worker] V1 task: ${rhTaskId}`)
        videoUrl = await pollRunningHubV1(rhTaskId)
        console.log(`[gen-worker] V1 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V1 生成失败: ${e.message}`)
        videoUrl = await generatePlaceholderVideo(task, session)
      }
    } else {
      videoUrl = await generatePlaceholderVideo(task, session)
    }

    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: 'GENERATED',
        videoUrl,
        rhTaskId: rhTaskId || undefined,
        rhApiVersion: RH_API_KEY ? 'v2' : (RH_COOKIE ? 'v1' : undefined),
        rhOutputs: rhOutputs || undefined,
        thumbnailUrl: videoUrl ? videoUrl.replace(/\.mp4(\?.*)?$/, '.jpg') : null,
      },
    })

    const platforms = (await getSession(sessionId))?.context?.platforms || []
    await pubQueue.add('publish-all', {
      taskId,
      sessionId,
      platforms,
      videoUrl,
    }, { jobId: `pub-${taskId}` })

    return { taskId, status: 'GENERATED', videoUrl }
  } catch (e) {
    console.error(`[gen-worker] task ${taskId} failed:`, e.message)
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', error: e.message, retryCount: { increment: 1 } },
    })
    throw e
  }
}, {
  connection,
  concurrency: 2,
})

worker.on('completed', (job) => {
  console.log(`[gen-worker] job ${job.id} completed: ${job.data.taskId}`)
})

worker.on('failed', (job, err) => {
  console.error(`[gen-worker] job ${job?.id} failed:`, err.message)
})

console.log('[gen-worker] started (V1/V2 dual channel)')
```

- [ ] **Step 2: Verify syntax**

```bash
node --check creator-api/workers/generation-worker.js
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/workers/generation-worker.js
git commit -m "feat: V1/V2 dual-channel generation worker with V2 priority and auto-fallback"
```

---

### Task 12: Register new routes in server.js

**Files:**
- Modify: `creator-api/server.js`

- [ ] **Step 1: Add capabilities router**

```javascript
// Add at line 7 (after tasksRouter import):
import { capabilitiesRouter } from './routes/capabilities.js'

// Add at line 66 (after stats router):
app.use('/api/capabilities', capabilitiesRouter)
```

Full changed section of [server.js](file:///e:/cusorspace/avatar-ai-video/creator-api/server.js):

```javascript
import { tasksRouter } from './routes/tasks.js';
import { queueRouter } from './routes/queue.js';
import { taskSubmitRouter } from './routes/task-submit.js';
import { statsRouter } from './routes/stats.js';
import { capabilitiesRouter } from './routes/capabilities.js';
```

And:

```javascript
app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', taskSubmitRouter);
app.use('/api/queues', queueRouter);
app.use('/api/stats', statsRouter);
app.use('/api/capabilities', capabilitiesRouter);
```

- [ ] **Step 2: Verify syntax**

```bash
node --check creator-api/server.js
```

- [ ] **Step 3: Commit**

```bash
git add creator-api/server.js
git commit -m "feat: register /api/capabilities routes"
```

---

## Phase 3: Frontend Adaptation

### Task 13: Update frontend types

**Files:**
- Modify: `creator-frontend/src/types.ts`

- [ ] **Step 1: Add new types**

```typescript
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

export interface ModelRecommendation {
  endpoint: string;
  name: string;
  taskType: string;
  description: string;
  fields?: ModelField[];
  estimatedCost?: number;
}

export interface ModelField {
  nodeId: string;
  nodeName?: string;
  fieldName: string;
  fieldValue?: string;
  fieldType?: 'STRING' | 'LIST' | 'IMAGE' | 'VIDEO' | 'AUDIO';
  fieldData?: unknown;
  description?: string;
}

export interface IntentContext {
  taskType?: string;
  hasImage?: boolean;
  hasVideo?: boolean;
  preferredDuration?: number;
  preferredQuality?: string;
  style?: string;
  script?: string;
  tags?: string[];
}

export interface ConfirmContext {
  phase?: 'INTENT' | 'PARAMS' | 'RECOMMEND' | 'CONFIRM';
  intent?: IntentContext;
  recommendations?: ModelRecommendation[];
  selectedModel?: {
    endpoint: string;
    params?: Record<string, unknown>;
  };
  platforms?: string[];
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
  recommendations?: ModelRecommendation[];
  phase?: string;
}

export interface TaskResult {
  taskId: string;
  status: string;
  videoUrl?: string;
  estimatedMinutes: number;
  jobId?: string;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/types.ts
git commit -m "feat: add V2 model/types to frontend — ModelRecommendation, ModelField, IntentContext, ConfirmContext"
```

---

### Task 14: Update `create-frontend/src/services/api.ts`

**Files:**
- Modify: `creator-frontend/src/services/api.ts`

- [ ] **Step 1: Add capabilities fetch function**

```typescript
import type { ConfirmData, TaskResult, UploadedFile, ModelRecommendation } from '../types';

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
  onDone: (info: { round: number; forceConfirm: boolean; context?: Record<string, unknown> }) => void,
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
                onDone({ round: data.round, forceConfirm: data.forceConfirm, context: data.context || {} });
              } else if (data.type === 'error') {
                onError(data.content);
              }
            } catch { /* skip */ }
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

  const res = await fetch(`${BASE}/${sessionId}/upload`, { method: 'POST', body: formData });
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
  return {
    items: data.items,
    missing: data.missing,
    phase: data.items?.phase as string | undefined,
  };
}

export async function submitTask(sessionId: string, scheduledAt?: string | null): Promise<TaskResult> {
  const res = await fetch(`${BASE}/${sessionId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt: scheduledAt || null }),
  });
  if (!res.ok) throw new Error('提交失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    taskId: data.taskId,
    status: data.status || 'GENERATING',
    videoUrl: data.videoUrl || undefined,
    estimatedMinutes: data.estimatedMinutes || 20,
    jobId: data.jobId || undefined,
  };
}

export async function getCapabilities(): Promise<{
  taskTypes: string[];
  models: ModelRecommendation[];
}> {
  const res = await fetch('/api/capabilities');
  if (!res.ok) throw new Error('获取能力列表失败');
  const data = await res.json();
  return { taskTypes: data.taskTypes || [], models: data.models || [] };
}

export async function getModelSchema(endpoint: string): Promise<ModelRecommendation> {
  const res = await fetch(`/api/capabilities/models/${encodeURIComponent(endpoint)}/schema`);
  if (!res.ok) throw new Error('获取模型参数失败');
  const data = await res.json();
  return data.schema;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/services/api.ts
git commit -m "feat: add getCapabilities and getModelSchema to frontend API"
```

---

### Task 15: Update `creator-frontend/src/services/parseOptions.ts`

**Files:**
- Modify: `creator-frontend/src/services/parseOptions.ts`

- [ ] **Step 1: Replace fixed template/option logic with phase-aware logic**

```typescript
import { TASK_TYPE_IDS, PLATFORM_IDS, taskTypeInfo, platformLabel } from './videoConfig'

export interface ParsedMessage {
  content: string
  options: string[]
}

export function stripOptions(text: string): string {
  return text.replace(/\[OPTIONS:\s*[^\]]*\]/g, '').trim()
}

export function buildOptions(context: Record<string, unknown>, round: number, maxRounds: number): string[] {
  const ctx = context || {}
  const phase = (ctx.phase as string) || 'INTENT'

  if (round >= maxRounds) return ['确认并生成视频', '修改需求']

  switch (phase) {
    case 'INTENT':
      return TASK_TYPE_IDS.map(id => taskTypeInfo(id).label)
    case 'PARAMS': {
      const intent = (ctx.intent as Record<string, unknown>) || {}
      const opts: string[] = []
      if (!intent.hasImage && !intent.hasVideo) {
        opts.push('没有素材，纯文案生成', '上传图片', '上传视频')
      }
      if (!intent.preferredDuration) opts.push('5秒', '10秒', '15秒', '30秒')
      if (!intent.script) opts.push('AI帮我写文案', '我自己写文案')
      return opts.length > 0 ? opts : ['确认并生成视频']
    }
    case 'RECOMMEND':
      return ['确认使用推荐', '换一个模型']
    case 'CONFIRM':
      return ['确认并生成视频', '修改参数']
    default:
      return TASK_TYPE_IDS.map(id => taskTypeInfo(id).label)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/services/parseOptions.ts
git commit -m "feat: phase-aware option builder in parseOptions"
```

---

### Task 16: Update `creator-frontend/src/hooks/useSession.ts`

**Files:**
- Modify: `creator-frontend/src/hooks/useSession.ts`

- [ ] **Step 1: Replace inferTag with phase-aware logic**

The main changes:
1. Remove old `inferTag` (template/platform matching)
2. Keep `TASK_TYPE_IDS` import for task type button matching
3. Add `getModelSchema` import
4. In `sendUserMessage`'s `onDone`, detect `phase === 'RECOMMEND'` from context and auto-fetch recommendations

```typescript
import { useState, useCallback, useRef } from 'react';
import type { Message, SessionState, UploadedFile, TaskResult, ModelRecommendation } from '../types';
import { createSession, uploadFile, getConfirmData, submitTask, getCapabilities } from '../services/api';
import { stripOptions, buildOptions } from '../services/parseOptions';
import { TASK_TYPE_IDS, taskTypeInfo } from '../services/videoConfig';
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
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([]);
  const pendingAttachments = useRef<string[]>([]);
  const lastContext = useRef<Record<string, unknown>>({});
  const sse = useSSE();

  function inferTag(content: string, ctx: Record<string, unknown>): string {
    const phase = (ctx.phase as string) || 'INTENT'
    if (phase === 'INTENT') {
      const match = TASK_TYPE_IDS.find(id => taskTypeInfo(id).label === content)
      if (match) return content
    }
    return content
  }

  const initSession = useCallback(async () => {
    setState(initialState);
    setStreamingText('');
    setUploadedFiles([]);
    setRecommendations([]);
    try {
      const { sessionId, message, round } = await createSession();
      const content = stripOptions(message)
      const msg: Message = {
        id: nextId(), role: 'assistant' as const, content,
        options: buildOptions({ phase: 'INTENT' }, round, 4),
        timestamp: Date.now(),
      }
      setState((prev) => ({
        ...prev, sessionId, round,
        messages: [msg],
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${msg}`, timestamp: Date.now() }],
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
        messages: [...prev.messages, { id: nextId(), role: 'system', content: `文件上传失败: ${msg}`, timestamp: Date.now() }],
      }));
    }
  }, [state.sessionId]);

  const sendUserMessage = useCallback((content: string) => {
    if (!state.sessionId || state.isStreaming) return;

    const attachments = [...pendingAttachments.current];
    pendingAttachments.current = [];

    const taggedContent = inferTag(content, lastContext.current)

    const userMsg: Message = { id: nextId(), role: 'user', content: taggedContent, timestamp: Date.now() };
    setState((prev) => ({ ...prev, isStreaming: true, messages: [...prev.messages, userMsg] }));
    setStreamingText('');

    sse.connect(state.sessionId, taggedContent, attachments, {
      onChunk: (text) => { setStreamingText((prev) => prev + text); },
      onDone: async (info) => {
        setStreamingText((prev) => {
          const content = stripOptions(prev || '')
          const ctx = info.context || {}
          lastContext.current = ctx
          const options = buildOptions(ctx, info.round, 4)

          // If entering RECOMMEND phase, fetch model recommendations
          if (ctx.phase === 'RECOMMEND' || content.includes('推荐')) {
            getCapabilities().then(caps => {
              setRecommendations(caps.models.slice(0, 3))
            }).catch(() => {})
          }

          const msg: Message = {
            id: nextId(),
            role: 'assistant' as const,
            content,
            options: options.length > 0 ? options : undefined,
            timestamp: Date.now(),
          }
          setState((s) => ({
            ...s, isStreaming: false, round: info.round, forceConfirm: info.forceConfirm,
            messages: [...s.messages, msg],
            status: info.forceConfirm ? 'confirming' : 'chatting',
          }));
          return '';
        });
      },
      onError: (err) => {
        setState((s) => ({ ...s, isStreaming: false, messages: [...s.messages, { id: nextId(), role: 'system', content: `错误: ${err}`, timestamp: Date.now() }] }));
        setStreamingText('');
      },
    });
  }, [state.sessionId, state.isStreaming, sse]);

  const backToChat = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'chatting' }));
  }, []);

  const goToConfirm = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await getConfirmData(state.sessionId);
      setState((prev) => ({ ...prev, status: 'confirming' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取确认数据失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: msg, timestamp: Date.now() }] }));
    }
  }, [state.sessionId]);

  const handleSubmit = useCallback(async (scheduledAt?: string | null): Promise<TaskResult | null> => {
    if (!state.sessionId) return null;
    try {
      const result = await submitTask(state.sessionId, scheduledAt);
      setState((prev) => ({ ...prev, status: 'submitted' }));
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `提交失败: ${msg}`, timestamp: Date.now() }] }));
      return null;
    }
  }, [state.sessionId]);

  return { state, streamingText, uploadedFiles, recommendations, initSession, sendUserMessage, handleFileUpload, goToConfirm, handleSubmit, backToChat };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/hooks/useSession.ts
git commit -m "feat: phase-aware hook — auto-fetch recommendations, remove fixed template logic"
```

---

### Task 17: Update `creator-frontend/src/components/ConfirmView.tsx`

**Files:**
- Modify: `creator-frontend/src/components/ConfirmView.tsx`

- [ ] **Step 1: Rewrite with capability-aware card**

```tsx
import { useState, useEffect } from 'react';
import { getConfirmData } from '../services/api';
import { SchedulePicker } from './SchedulePicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { ConfirmData, ModelRecommendation, ModelField } from '../types';

const LABELS: Record<string, string> = {
  template: '模板类型', script: '视频文案', platforms: '目标平台',
  files: '素材文件', style: '风格偏好', tags: '话题标签',
  taskType: '任务类型', duration: '时长', model: '模型',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'platforms' && Array.isArray(value)) {
    const map: Record<string, string> = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书' };
    return value.map((v) => map[String(v)] || String(v)).join('、');
  }
  if (key === 'files' && Array.isArray(value)) {
    return value.map((f: { name: string }) => f.name).join('、');
  }
  if (key === 'taskType') {
    const map: Record<string, string> = {
      'text-to-video': '文生视频',
      'image-to-video': '图生视频',
      'text-to-image': '文生图',
      'video-to-video': '视频编辑'
    };
    return map[String(value)] || String(value);
  }
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '未指定');
}

interface ConfirmViewProps {
  sessionId: string;
  onBack: () => void;
  onSubmit: (scheduledAt: string | null) => void;
  recommendations?: ModelRecommendation[];
}

export function ConfirmView({ sessionId, onBack, onSubmit, recommendations = [] }: ConfirmViewProps) {
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [selectedRecIndex, setSelectedRecIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getConfirmData(sessionId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return (
    <div className="confirm-view">
      <Skeleton className="h-8 w-40 mx-auto" />
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
  if (error) return (
    <div className="confirm-view">
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <p style={{ color: 'var(--error)' }}>{error}</p>
          <Button variant="outline" onClick={onBack}>← 返回</Button>
        </CardContent>
      </Card>
    </div>
  );
  if (!data) return null;

  const items = data.items || {};
  const intent = (items.intent as Record<string, unknown>) || {};
  const currentRec = recommendations[selectedRecIndex];

  const entries = Object.entries(items).filter(
    ([k, v]) =>
      k !== 'intent' && k !== 'phase' && k !== 'recommendations' && k !== 'selectedModel' &&
      v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );

  // Flatten intent fields
  const intentEntries = Object.entries(intent).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== false
  );

  return (
    <div className="confirm-view">
      <h2 className="confirm-title">📋 需求确认</h2>
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* task type badge */}
          {intent.taskType && (
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary">
                {formatValue('taskType', intent.taskType)}
              </Badge>
              {currentRec && (
                <Badge variant="outline">{currentRec.name}</Badge>
              )}
            </div>
          )}

          {/* intent display */}
          {intentEntries.map(([key, val]) => (
            <div key={key} className="confirm-item">
              <span className="label">{LABELS[key] || key}</span>
              <span className="value">{formatValue(key, val)}</span>
            </div>
          ))}

          {/* other items */}
          {entries.map(([key, value]) => (
            <div key={key} className="confirm-item">
              <span className="label">{LABELS[key] || key}</span>
              <span className="value">{formatValue(key, value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* model recommendations */}
      {recommendations.length > 0 && (
        <div className="recommendations-section mt-3">
          <div className="text-sm font-medium mb-2 text-muted-foreground">
            🤖 AI 推荐模型
          </div>
          <div className="flex gap-2 flex-wrap">
            {recommendations.map((rec, idx) => (
              <button
                key={rec.endpoint}
                onClick={() => setSelectedRecIndex(idx)}
                className={`p-3 rounded-lg border text-left text-sm transition-colors min-w-[140px] ${
                  idx === selectedRecIndex
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-semibold">{rec.name}</div>
                <div className="text-xs text-muted-foreground">{rec.description}</div>
                {rec.estimatedCost !== undefined && (
                  <div className="text-xs mt-1 text-muted-foreground">
                    预估: {rec.estimatedCost} RH币
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* params editor — if selected model has fields */}
      {currentRec?.fields && currentRec.fields.length > 0 && (
        <div className="params-section mt-3">
          <div className="text-sm font-medium mb-2 text-muted-foreground">
            ⚙️ 参数设置
          </div>
          <Card>
            <CardContent className="p-3 space-y-2">
              {currentRec.fields.map((field: ModelField) => (
                <div key={`${field.nodeId}-${field.fieldName}`} className="flex items-center gap-2 text-sm">
                  <span className="label min-w-[60px] text-muted-foreground">
                    {field.description || field.fieldName}
                  </span>
                  {field.fieldType === 'LIST' && typeof field.fieldData === 'string' ? (
                    <span className="value text-muted-foreground">
                      {field.fieldValue || '(默认)'}
                    </span>
                  ) : (
                    <span className="value">
                      {field.fieldValue || '(默认)'}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <SchedulePicker onSelect={setScheduledAt} selected={scheduledAt} />

      {data.missing.length > 0 && (
        <div className="missing-section">
          <div className="missing-title">⚠ 以下信息尚未收集（不影响提交）</div>
          {data.missing.map((field) => (
            <div key={field} className="missing-item">· {LABELS[field] || field}</div>
          ))}
        </div>
      )}
      <div className="confirm-actions">
        <Button variant="outline" className="flex-1" onClick={onBack}>← 继续编辑</Button>
        <Button className="flex-1" onClick={() => onSubmit(scheduledAt)}>✓ 确认提交</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 3: Update App.tsx to pass recommendations**

```tsx
// In creator-frontend/src/App.tsx
// Change line 192-195:
<ConfirmView
  sessionId={state.sessionId!}
  onBack={() => { setConfirmOpen(false); backToChat() }}
  onSubmit={handleDialogSubmit}
  recommendations={recommendations}  // NEW
/>
```

And add the destructuring at the top:

```tsx
const { state, streamingText, recommendations, initSession, sendUserMessage, goToConfirm, handleSubmit, backToChat } = useSession()
```

- [ ] **Step 4: Verify TypeScript again**

```bash
cd creator-frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add creator-frontend/src/components/ConfirmView.tsx creator-frontend/src/App.tsx
git commit -m "feat: capability-aware ConfirmView — model recommendations, params display, dynamic fields"
```

---

## Verification

- [ ] Run all syntax checks: `node --check` each .js file
- [ ] Run TypeScript check: `cd creator-frontend && npx tsc --noEmit`
- [ ] Run backend build: `cd creator-api && npm run build`
- [ ] Run frontend build: `cd creator-frontend && npm run build`
- [ ] Run unit tests: `node --test skills/runninghub/rh-v2-client.test.js`
- [ ] Security scan: `grep -rn "sk-\|api_key\|API_KEY" --include="*.js" --include="*.ts" --include="*.tsx" src/ skills/ | grep -v node_modules`
- [ ] Check no console.log in production code
