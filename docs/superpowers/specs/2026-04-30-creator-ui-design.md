# 创作者前端 UI 设计方案

> 日期：2026-04-30
> 项目：avatar-ai-video
> 阶段：概念设计 → 可扩展原型
> 依赖：现有 OpenClaw + MQTT + Phone Agent 架构

---

## 1. 目标

为自媒体创作者提供一个**移动端 Web 对话式界面**，通过最多 4 轮 AI 对话收集视频创作需求，自动提交到 OpenClaw 编排执行。

### 1.1 核心体验

```
创作者打开手机浏览器 → 与 AI 对话描述需求（最多 4 轮）
→ AI 汇总确认 → 一键提交 → 后台自动生成视频 + 发布到平台
```

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **对话即表单** | 不用固定表单，用 AI 对话自然收集需求 |
| **4 轮上限** | 硬限制轮询次数，避免无休止追问 |
| **流式输出** | AI 回复逐字显示（打字机效果），降低等待焦虑 |
| **渐进增强** | Phase 1 Web 前端快速验证，Phase 2 可用 Flutter 替换前端层 |

---

## 2. 对话模式：混合模式

### 2.1 策略

```
第 1 轮：用户自由描述需求（如"帮我做一个介绍新产品的视频发抖音和小红书"）
         OpenClaw 解析意图，提取已知信息，识别缺失字段

第 2-4 轮：OpenClaw 定向追问缺失的关键信息
         （如"视频风格偏快节奏还是舒缓？"、"请上传产品图片"）

满 4 轮 或 信息收集完整 → 自动进入确认页
```

### 2.2 需求收集维度

OpenClaw 在 4 轮内动态判断需要收集的信息，常用维度包括：

| 维度 | 必要程度 | 示例 |
|------|---------|------|
| 视频模板/类型 | 高 | 数字人口播 / 科技评测 / 产品展示 |
| 文案内容 | 高 | 台词、核心信息、主题 |
| 素材文件 | 中 | 产品图片、Logo、参考视频 |
| 目标平台 | 高 | 抖音 / 快手 / 小红书（可多选） |
| 风格偏好 | 低 | 快节奏/舒缓、正式/轻松 |
| 发布偏好 | 低 | 定时发布、话题标签 |

### 2.3 轮次控制规则

```
if 已收集信息足够生成有效任务:
    → 提前进入确认页（不足 4 轮也可以）
elif 当前轮次 >= 4:
    → 强制进入确认页（已收集信息 + 标注缺失项，让用户手动补全）
else:
    → 继续追问
```

---

## 3. 整体架构

### 3.1 系统分层（与现有架构的衔接）

```
┌──────────────────────────────────────────────────────────────┐
│  🆕 创作者端（本次设计范围）                                      │
│                                                              │
│  ┌──────────────────────┐    ┌─────────────────────────────┐ │
│  │  React + Vite 前端    │    │  Node.js Server (creator-api) │ │
│  │  (移动 Web / PWA)     │◄──►│  · 轮次计数                  │ │
│  │                      │    │  · 会话管理 (Redis)          │ │
│  │  · 聊天界面           │    │  · 文件上传 (→ MinIO)        │ │
│  │  · SSE 流式输出       │    │  · OpenClaw 代理             │ │
│  │  · 文件上传           │    │  · 确认页数据组装            │ │
│  └──────────────────────┘    └───────────┬─────────────────┘ │
│                                          │                    │
└──────────────────────────────────────────┼────────────────────┘
                                           │ POST /api/sessions
                                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ✅ 已有 OpenClaw 服务器（Docker Compose）                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ OpenClaw │  │  Redis   │  │  MinIO   │  │mosquitto │    │
│  │  :3000   │  │  :6379   │  │ :9000    │  │  :1883   │    │
│  └────┬─────┘  └──────────┘  └──────────┘  └────┬─────┘    │
│       │                                         │           │
│  ┌────┴─────────────────────────────┐           │           │
│  │  Skill 层                         │           │           │
│  │  ├─ runninghub-gen               │           │           │
│  │  ├─ video-postproc               │           │           │
│  │  └─ dispatch-agent ──────────────┤───────────┘           │
│  └──────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
                                           │ MQTT
                                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ✅ 已有 手机 Agent                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Agent 1  │  │ Agent 2  │  │ Agent N  │                   │
│  │ 抖音      │  │ 快手     │  │ 小红书    │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React 18 + Vite + TypeScript | SPA，移动端优先 |
| UI 样式 | CSS Modules + CSS Variables | 无第三方 UI 库，轻量 |
| HTTP 客户端 | fetch + EventSource (SSE) | 零额外依赖 |
| 后端 Server | Node.js + Express | 轻量接入层 |
| 会话存储 | Redis | 会话上下文 + 轮次计数 |
| 文件存储 | MinIO presigned URL | 复用现有 MinIO |
| 部署 | 同 Docker Compose 加一个容器 | creator-api 服务 |

---

## 4. 前端设计

### 4.1 页面结构（单页应用）

```
┌─────────────────────────┐
│      顶部状态栏          │  ← 轮次指示器 (1/4 · 2/4 · 3/4 · 4/4)
│   ┌─────────────────┐   │
│   │  ● 第 2 轮       │   │
│   └─────────────────┘   │
├─────────────────────────┤
│                         │
│   消息列表（滚动区）      │
│                         │
│  ┌───────────────────┐ │
│  │ 🤖 AI 消息气泡     │ │  ← 左对齐，深色背景
│  │ 你的产品主推什么   │ │
│  │ 卖点呢？          │ │
│  └───────────────────┘ │
│                         │
│  ┌───────────────────┐ │
│  │      👤 用户气泡   │ │  ← 右对齐，品牌色背景
│  │ 续航和性价比       │ │
│  └───────────────────┘ │
│                         │
│  ┌───────────────────┐ │
│  │ 🤖 AI 流式输出...  │ │  ← 打字机效果
│  │ 明白了▊            │ │
│  └───────────────────┘ │
│                         │
├─────────────────────────┤
│  ┌─────────────────┐   │
│  │ 输入区域          │   │  ← 文本 / 文件上传 / 快捷选项
│  │ [📎] [输入框] [➤] │   │
│  └─────────────────┘   │
└─────────────────────────┘
```

### 4.2 三种视图状态

#### 4.2.1 对话视图（默认）

- 消息列表：AI 气泡 + 用户气泡，自动滚到底部
- AI 正在回复时显示 typing indicator / 流式输出
- 输入区：文本框 + 附件按钮 + 发送按钮
- AI 提供选项时，渲染可点击的快捷按钮（如 A/B/C）

#### 4.2.2 确认视图（4轮后或信息齐全时自动进入）

```
┌─────────────────────────┐
│  📋 需求确认             │
├─────────────────────────┤
│  模板     数字人口播      │
│  文案     新品上市介绍...  │
│  平台     抖音、小红书     │  ← 可点击修改
│  素材     photo1.jpg ✓   │
│          product.png  ✓  │
│  风格     快节奏          │
│  标签     #AI #科技       │
├─────────────────────────┤
│  缺失项                   │
│  ⚠ 未指定定时发布时间     │  ← 灰色标注，不影响提交
├─────────────────────────┤
│ [← 继续编辑]  [✓ 确认提交] │
└─────────────────────────┘
```

#### 4.2.3 结果视图（提交后）

```
┌─────────────────────────┐
│  ✅ 任务已提交            │
│                         │
│  任务编号: task_20260430 │
│  预计完成: 15-30 分钟     │
│                         │
│  [查看任务状态]           │
│  [创建新任务]             │
└─────────────────────────┘
```

### 4.3 组件树

```
<App>
  ├─ <RoundIndicator />       // 顶部轮次指示器: 2/4
  ├─ <ChatView>               // 对话视图
  │   ├─ <MessageList>        // 消息列表
  │   │   ├─ <Bubble />       // 单条气泡（AI/用户/系统）
  │   │   └─ <QuickOptions /> // 快捷选项按钮组
  │   └─ <InputArea>          // 底部输入区
  │       ├─ <TextInput />
  │       ├─ <FileButton />   // 附件上传按钮
  │       └─ <SendButton />
  ├─ <ConfirmView>            // 确认视图（条件渲染）
  │   ├─ <InfoCard />         // 已收集信息卡片
  │   ├─ <MissingItems />     // 缺失项提示
  │   └─ <ActionButtons />    // 编辑/提交按钮
  └─ <ResultView>             // 结果视图（条件渲染）
```

### 4.4 文件上传策略

| 能力 | 实现 |
|------|------|
| 选择文件 | `<input type="file" accept="image/*,video/*">` |
| 多文件 | 累积上传，显示缩略图列表 |
| 预上传 | 选择后立即上传到 Server → MinIO，返回 URL 存入会话上下文 |
| 进度条 | 显示上传进度（XHR/fetch progress） |
| 限制 | 单文件 ≤ 100MB，总数 ≤ 10 个 |

---

## 5. Server 设计（creator-api）

### 5.1 职责

```
creator-api Server（新增，~300 行 Node.js）
│
├─ POST /api/sessions         创建会话，返回 sessionId + 首条 AI 问候
├─ POST /api/sessions/:id/messages   发送用户消息，返回 AI 回复（SSE 流式）
├─ POST /api/sessions/:id/upload    上传素材文件 → MinIO
├─ GET  /api/sessions/:id/confirm   获取确认页汇总数据
├─ POST /api/sessions/:id/submit    提交任务到 OpenClaw
└─ GET  /api/sessions/:id/status    查询任务执行状态
```

### 5.2 核心逻辑：轮次控制 + OpenClaw 代理

```js
// POST /api/sessions/:id/messages 伪代码
async function handleMessage(sessionId, userMessage) {
  const session = await redis.hgetall(`session:${sessionId}`);

  // 1. 轮次检查
  const round = parseInt(session.round) + 1;
  await redis.hset(`session:${sessionId}`, 'round', round);

  // 2. 追加用户消息到对话历史
  const history = JSON.parse(session.history || '[]');
  history.push({ role: 'user', content: userMessage });

  // 3. 检查是否强制进入确认
  if (round >= 4) {
    await redis.hset(`session:${sessionId}`, 'forceConfirm', '1');
    // 最后一轮：OpenClaw 仍然回复，但前端会显示确认按钮
  }

  // 4. 透传对话到 OpenClaw，流式返回
  const openclawReq = {
    history,
    systemPrompt: buildSystemPrompt(session), // 包含轮次上下文
    stream: true,
  };

  // SSE 流式输出到前端
  const stream = await fetch('http://openclaw:3000/chat', {
    method: 'POST',
    body: JSON.stringify(openclawReq),
  });

  // 逐 chunk 转发
  for await (const chunk of stream.body) {
    res.write(`data: ${chunk}\n\n`);
  }

  // 5. 更新对话历史
  history.push({ role: 'assistant', content: fullResponse });
  await redis.hset(`session:${sessionId}`, 'history', JSON.stringify(history));

  res.end();
}
```

### 5.3 Redis 数据结构

```
session:{id}
  ├─ round:       "1"           // 当前轮次
  ├─ status:      "chatting"    // chatting | confirming | submitted
  ├─ history:     "[...]"       // 对话历史 JSON
  ├─ context:     "{}"          // 已收集的需求上下文（结构化）
  ├─ files:       "["url1","url2"]"  // 已上传文件 URL 列表
  ├─ forceConfirm:"0"           // 是否强制进入确认
  ├─ taskId:      ""            // 提交后的任务 ID
  └─ createdAt:   "1714387200"
```

---

## 6. API 接口设计

### 6.1 POST /api/sessions

创建新会话，返回 AI 首条问候消息。

**Response (SSE stream):**
```
data: {"type":"greeting","content":"你好！今天想做什么类型的视频？","sessionId":"sess_xxx","round":1}
```

### 6.2 POST /api/sessions/:id/messages

发送用户消息，流式返回 AI 回复。

**Request:**
```json
{
  "content": "帮我做一个科技评测视频",
  "attachments": []  // 可选的附件 URL 列表
}
```

**Response (SSE stream):**
```
data: {"type":"chunk","content":"好的"}
data: {"type":"chunk","content":"，科技评测"}
data: {"type":"chunk","content":"视频没问题"}
data: {"type":"done","content":"...","round":2,"canConfirm":false}
```

### 6.3 POST /api/sessions/:id/upload

上传素材文件。

**Request:** `multipart/form-data`，字段 `file`

**Response:**
```json
{
  "success": true,
  "url": "https://minio.xxx.com/uploads/xxx.png",
  "name": "product.png",
  "size": 245760
}
```

### 6.4 GET /api/sessions/:id/confirm

获取确认页汇总数据。

**Response:**
```json
{
  "items": {
    "template": "科技评测",
    "content": "评测新款耳机降噪能力...",
    "platforms": ["douyin", "xiaohongshu"],
    "files": [
      { "name": "headphone.jpg", "url": "https://minio.xxx/uploads/xxx.jpg" }
    ],
    "style": "快节奏",
    "tags": ["#科技", "#耳机"]
  },
  "missing": ["定时发布时间"]
}
```

### 6.5 POST /api/sessions/:id/submit

提交最终任务，触发 OpenClaw 执行。

**Response:**
```json
{
  "success": true,
  "taskId": "task_20260430_001",
  "estimatedMinutes": 20
}
```

---

## 7. 与现有系统的衔接

### 7.1 不改变现有组件

| 现有组件 | 影响 | 说明 |
|----------|------|------|
| OpenClaw (Docker) | **无变化** | creator-api 通过 HTTP 代理调用 |
| MQTT Broker | **无变化** | 任务下发链路不变 |
| Phone Agent | **无变化** | 接收任务、执行发布流程不变 |
| MinIO | **新增 bucket** | 新增 `creator-uploads` bucket 存用户素材 |
| Redis | **新增 key 前缀** | `session:*` 与会话管理，与 `phones:*` 隔离 |

### 7.2 Docker Compose 扩展

在现有 `deploy/docker-compose.yml` 基础上新增：

```yaml
creator-api:
  build: ./creator-api
  ports:
    - "3001:3001"
  environment:
    REDIS_URL: redis://redis:6379
    OPENCLAW_URL: http://openclaw:3000
    MINIO_ENDPOINT: http://minio:9000
    MINIO_BUCKET: creator-uploads
  volumes:
    - ../creator-api:/app
  depends_on:
    - openclaw
    - redis
    - minio
```

---

## 8. 文件映射

### 8.1 新增文件

```
creator-api/                      # 🆕 Server 目录
├── package.json                  #    Express + ioredis + multer
├── server.js                     #    主入口，路由注册
├── routes/
│   ├── sessions.js               #    会话 CRUD
│   ├── messages.js               #    消息处理 + SSE 流式
│   ├── upload.js                 #    文件上传 → MinIO
│   └── submit.js                 #    确认 + 提交到 OpenClaw
├── services/
│   ├── openclaw-proxy.js         #    OpenClaw HTTP 代理
│   ├── session-manager.js        #    会话状态管理 (Redis)
│   └── minio-uploader.js         #    MinIO 上传封装
└── middleware/
    └── round-guard.js            #    轮次检查中间件

creator-frontend/                 # 🆕 前端目录
├── package.json                  #    React 18 + Vite + TypeScript
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx                   #    视图路由（chat/confirm/result）
    ├── components/
    │   ├── ChatView.tsx          #    对话视图
    │   ├── MessageList.tsx       #    消息列表
    │   ├── Bubble.tsx            #    消息气泡
    │   ├── QuickOptions.tsx      #    快捷选项
    │   ├── InputArea.tsx         #    输入区
    │   ├── FileUploader.tsx      #    文件上传组件
    │   ├── ConfirmView.tsx       #    确认视图
    │   ├── ResultView.tsx        #    结果视图
    │   └── RoundIndicator.tsx    #    轮次指示器
    ├── hooks/
    │   ├── useSSE.ts             #    SSE 流式接收 hook
    │   └── useSession.ts         #    会话状态 hook
    ├── services/
    │   └── api.ts                #    API 调用封装
    └── styles/
        ├── variables.css         #    CSS 变量（主题色/间距）
        └── chat.css              #    聊天界面样式
```

### 8.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `deploy/docker-compose.yml` | 新增 `creator-api` 服务 |
| `deploy/mosquitto.conf` | 无变化（不需要改） |
| `phone-agent/` 目录 | **无变化** |

---

## 9. 验证方案

| 阶段 | 验证项 | 方法 |
|------|--------|------|
| Server 单测 | session CRUD 正确 | `curl` 发送请求验证 Redis 读写 |
| 流式输出 | SSE 逐 chunk 返回 | 浏览器 Network 面板确认 `text/event-stream` |
| 轮次上限 | 第 4 轮后强制确认 | mock OpenClaw 回复，验证 `forceConfirm` 字段 |
| 文件上传 | 文件到 MinIO 并返回 URL | 上传测试图片，MinIO Console 确认 |
| 端到端 | 完整对话 + 提交 | 手动 4 轮对话，确认任务出现在 Redis 队列 |
| 移动端适配 | 微信/Chrome 移动端正常 | 真机浏览器访问 |

---

## 10. 不在范围内的内容

| 内容 | 原因 | 后续计划 |
|------|------|---------|
| 多轮对话中途修改历史 | 复杂度高，一期不做 | 确认页支持修改单项 |
| 任务进度实时推送 | 需要 WebSocket，一期 SSE 足够 | Phase 2 |
| 用户登录/注册 | 一期先匿名会话，GMV 验证 | Phase 2 |
| 多任务并发 | 一期单任务串行 | Phase 2 |
| Flutter App | 先 Web 验证流程 | Phase 2 |
| 任务状态查询页 | 提交后给 taskId，后续再加 | Phase 2 |

---

## 11. 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenClaw 回复不稳定 | 追问质量差，信息收集不全 | 4 轮上限兜底，确认页人工补全 |
| 移动端文件上传大文件慢 | 用户体验差 | 限制 100MB，预上传 + 进度条 |
| Redis 会话泄漏 | 内存增长 | TTL 24h 自动过期 |
| OpenAI API 调用失败（OpenClaw 依赖） | 对话中断 | 前端显示"AI 暂时不可用，请稍后重试" |
