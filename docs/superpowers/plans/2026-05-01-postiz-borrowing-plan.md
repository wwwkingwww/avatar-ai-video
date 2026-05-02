# postiz-app + RunningHub 借鉴实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 借鉴 postiz-app 的 UI 设计模式、定时调度架构，以及 RunningHub 的双面板配置预览布局，将 avatar-ai-video 从 MVP（匿名会话+立即执行）升级为支持用户账户、定时发布、可视化任务管理的 Phase 2 系统。

**Architecture:** React 18 + Vite + TypeScript 前端（新增 shadcn/ui 组件库），Node.js + Express → NestJS 后端（渐进迁移），PostgreSQL + Prisma ORM（新增持久化），BullMQ（替代 MQTT 点对点分发），Redis 缓存（保留），MinIO 存储（保留），Docker Compose 编排。

**参考来源:**
- postiz-app — UI 组件架构、Table/Calendar/StatCard 设计模式、BullMQ 延迟队列、Cron 兜底扫描、SchedulePicker 组件
- RunningHub — 左右双面板配置-预览布局、动态节点渲染模式、状态流转 UX
- 当前 avatar-ai-video — 现有 AI 对话、RunningHub 视频生成、手机 Agent 发布三阶段能力保留

---

## ⚠️ 关键差异：postiz 发布 vs avatar 发布（不可照抄）

postiz 的发布是**纯 API 调用**（调用 Twitter/X API、Bluesky SDK 等），HTTP 请求-响应即可完成。
avatar 的发布是**手机自动化操作**（ADB 控制 + AccessibilityService），涉及物理设备、多步骤 UI 操作。

```
┌─ postiz 发布（简单 API 调用）─┐     ┌─ avatar 发布（手机自动化）─────────┐
│                                │     │                                     │
│  API Client                    │     │  BullMQ Worker                      │
│     │                          │     │     │                               │
│     ▼                          │     │     ▼                               │
│  POST /2/tweets (X API)        │     │  1. 下载视频文件（MinIO→本地）        │
│     │                          │     │  2. ADB 推送视频到手机               │
│     ▼                          │     │  3. ADB 启动目标 APP（抖音/快手/小红书）│
│  200 OK → done                 │     │  4. 截图 → 识别UI元素 → 点击        │
│                                │     │  5. 选择视频 → 输入标题 → 添加标签   │
│                                │     │  6. 点击发布 → 等待APP处理           │
│                                │     │  7. 截图验证发布结果                  │
│                                │     │     │                               │
│  失败模式：                     │     │  失败模式：                          │
│  - API 限流 (429)              │     │  - 手机断开连接（USB/WiFi断）        │
│  - Token 过期 (401)            │     │  - APP UI 变更（找不到元素）          │
│  - 网络超时                     │     │  - ADB 命令超时                      │
│                                │     │  - 视频文件过大/格式不兼容            │
│                                │     │  - APP 闪退/卡死                      │
│                                │     │  - 平台反自动化检测                   │
│                                │     │  - 手机屏幕锁定/熄屏                  │
│                                │     │  - 无线网络不稳定                     │
│                                │     │  - AccessibilityService 失效         │
└────────────────────────────────┘     └─────────────────────────────────────┘

           可借鉴部分                               不可照抄，必须保留现有实现
      ┌───────┴───────┐                    ┌───────────────┴───────────────┐
      │ • BullMQ 延迟  │                    │ • ADB 多步骤操作               │
      │ • Cron 兜底    │                    │ • phone-agent 动作序列          │
      │ • 状态机       │                    │ • 截图验证                      │
      │ • 重试机制     │                    │ • 设备心跳/在线检测             │
      │ • SchedulePicker│                   │ • MQTT 设备通信（保留）          │
      │ • 队列监控     │                    │ • AccessibilityService 双通道  │
      └───────────────┘                    └───────────────────────────────┘
```

---

## 核心架构变化

```
                          BEFORE (Phase 1 MVP)
                          ───────────────────
用户 → ChatView → AI对话收集 → ConfirmView → submit() → OpenClaw → 立即执行全流程
                                              ↑ 匿名会话，无用户系统
                                              ↑ Redis KV，无持久化
                                              ↑ MQTT 点对点，无队列/重试

                          AFTER (Phase 2 借鉴升级)
                          ─────────────────────────
              ┌──────────────────────────────────────┐
              │  新 增（借鉴 postiz）                 │
              │  • PostgreSQL + Prisma（持久化）       │
              │  • BullMQ 队列（delay + 重试）         │
              │  • JWT 认证（用户系统）                │
              │  • Cron 兜底扫描                      │
              │  • SchedulePicker 组件                │
              │  • shadcn/ui 组件库                   │
              │  • StatCard / DataTable / DarkMode    │
              └──────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════╗
║  阶段一：手机端 Web UI 收集客户信息                              ║
║  执行位置：用户手机浏览器（creator-frontend SPA）                 ║
╚══════════════════════════════════════════════════════════════╝

用户 → ChatView → AI对话收集（DeepSeek SSE 流式） → ConfirmView(双面板)
                                                        │
                                                   submit(sessionId)
                                                        │
╔══════════════════════════════════════════════════════════════╗
║  阶段二：服务器端生成视频（始终立即执行，不等）                   ║
║  执行位置：creator-api 服务器 → RunningHub 云端 GPU            ║
╚══════════════════════════════════════════════════════════════╝
                                                        │
                                               ┌─ 写入 DB ─┤
                                               │ status=   │
                                               │ GENERATING│
                                               └───────────┘
                                                        │
                                        generationQueue.add(无delay)
                                                        │
                                                  ┌─────▼──────┐
                                                  │ GENERATING  │
                                                  │ (RunningHub)│
                                                  └──┬───┬─────┘
                                                     │   └── 失败 → FAILED
                                                ┌────▼──────┐
                                                │  GENERATED │ ← 视频就绪
                                                │  (预览确认) │
                                                └────┬──────┘
                                                     │
                                         用户选择发布方式（此时才定时）
                                                     │
                                        ┌─ 立即发布 ─┼─ 定时发布 ─┐
                                        │            │            │
╔══════════════════════════════════════════════════════════════════╗
║  阶段三：服务器端控制手机发布视频                                  ║
║  执行位置：creator-api(BullMQ Worker) → MQTT → phone-agent      ║
║           → ADB → Android 手机                                  ║
╚══════════════════════════════════════════════════════════════════╝
                                        │            │
                                  ┌─────▼──┐   ┌─────▼──────┐
                                  │PUBLISHING│  │  SCHEDULED  │
                                  │(立即入队)│  │(BullMQ delay)│
                                  └─────┬──┘   └─────┬──────┘
                                        │            │ 到达时间+Cron兜底
                                        │       ┌────▼──────┐
                                        └──────→│ PUBLISHING  │
                                                │ (Worker:   │
                                                │  MQTT →    │
                                                │  phone-agent│
                                                │  → ADB →   │
                                                │  APP操作)   │
                                                └─────┬──────┘
                                                      │
                                                ┌─────▼──────┐
                                                │ PUBLISHED  │
                                                └────────────┘

              ┌──────────────────────────────────────┐
              │  保 留（不照抄，维持现有实现）          │
              │  • RunningHub API 视频生成              │
              │  • phone-agent ADB 手机控制             │
              │  • AccessibilityService APK 双通道      │
              │  • MQTT 设备通信协议                    │
              │  • action-engine 动作序列               │
              │  • Redis 设备注册表                     │
              │  • MinIO 文件存储                       │
              └──────────────────────────────────────┘
```

---

## File Map（新增/修改文件总览）

> 标注说明: 🆕 = 借鉴 postiz/RunningHub 新增 | 🔧 = 修改现有文件 | 🔁 = 保留现有实现但封装入新架构

### 新增文件

| 文件 | 职责 | 来源 |
|------|------|------|
| `packages/database/prisma/schema.prisma` | 数据库模型定义（User, VideoTask） | 🆕 借鉴 postiz Prisma 模式 |
| `packages/database/package.json` | Prisma Client 包声明 | 🆕 |
| `apps/backend/src/modules/auth/` | NestJS 认证模块（JWT + Refresh Token） | 🆕 借鉴 postiz 双 Token 方案 |
| `apps/backend/src/modules/users/` | 用户 CRUD 模块 | 🆕 |
| `apps/backend/src/modules/tasks/` | 视频任务 CRUD + 调度模块 | 🆕 |
| `apps/backend/src/modules/queue/` | BullMQ 队列定义（generation + publish） | 🆕 借鉴 postiz BullMQ |
| `apps/backend/src/modules/schedule/` | Cron 兜底扫描（@nestjs/schedule） | 🆕 借鉴 postiz Cron 模式 |
| `creator-frontend/src/components/layout/DashboardShell.tsx` | Dashboard 布局容器 | 🆕 借鉴 postiz Sidebar + Header |
| `creator-frontend/src/components/layout/Sidebar.tsx` | 导航侧边栏 | 🆕 借鉴 postiz |
| `creator-frontend/src/components/layout/Header.tsx` | 顶部栏 | 🆕 借鉴 postiz |
| `creator-frontend/src/components/StatCard.tsx` | 统计卡片组件 | 🆕 借鉴 postiz StatCard |
| `creator-frontend/src/components/tasks/TaskTable.tsx` | DataTable 任务历史列表 | 🆕 借鉴 postiz DataTable |
| `creator-frontend/src/components/tasks/ReviewView.tsx` | 视频生成等待+预览视图 | 🆕 借鉴 RunningHub 右侧预览 |
| `creator-frontend/src/components/tasks/SchedulePicker.tsx` | 定时发布选择器 | 🆕 借鉴 postiz SchedulePicker |
| `creator-frontend/src/components/tasks/PlatformPreview.tsx` | 平台预览模拟卡片 | 🆕 借鉴 postiz PlatformPreview |
| `creator-frontend/src/components/tasks/TemplateParams.tsx` | 模板参数动态表单 | 🆕 借鉴 RunningHub nodeInfoList |
| `creator-frontend/src/components/theme/ThemeProvider.tsx` | 暗色/亮色主题 Provider | 🆕 借鉴 postiz next-themes |
| `creator-frontend/src/components/theme/ThemeToggle.tsx` | 主题切换按钮 | 🆕 借鉴 postiz |
| `creator-frontend/src/providers/AuthProvider.tsx` | 认证状态 Provider | 🆕 借鉴 postiz NextAuth 模式 |
| `creator-frontend/src/pages/Dashboard.tsx` | Dashboard 概览页 | 🆕 |
| `creator-frontend/src/pages/TaskHistory.tsx` | 任务历史页 | 🆕 |

### 修改文件

| 文件 | 变更 | 类型 |
|------|------|------|
| `creator-frontend/src/App.tsx` | 新增 review/schedule 视图状态（生成后预览+定时） | 🔧 |
| `creator-frontend/src/components/ConfirmView.tsx` | 重构为左右双面板布局（不含定时，只确认需求） | 🔧 借鉴 RunningHub |
| `creator-frontend/src/hooks/useSession.ts` | 新增生成状态回调、任务ID追踪 | 🔧 |
| `creator-api/routes/submit.js` | 只关心「立即生成」、去掉定时参数；定时逻辑独立到 /tasks/:id/schedule | 🔧 |
| `deploy/docker-compose.yml` | 新增 PostgreSQL、BullMQ Worker 容器 | 🔧 |

### 保留不动的文件（维持现有实现）

| 文件 | 说明 |
|------|------|
| `phone-agent/agent.js` | MQTT 客户端 + 任务订阅，**不动** |
| `phone-agent/adb-bridge.js` | ADB 命令封装，**不动** |
| `phone-agent/action-engine.js` | 平台动作序列执行，**不动** |
| `phone-agent/file-downloader.js` | 视频文件下载，**不动** |
| `phone-agent-apk/` | Android APK 无障碍方案，**不动** |
| `skills/runninghub/` | RunningHub API 集成，**封装后复用** |
| `skills/dispatch/` | MQTT 设备调度，**封装后复用** |
| `shared/mqtt-protocol.js` | MQTT 协议定义，**不动** |
| `templates/platforms/` | 平台动作序列模板，**不动** |
| `creator-api/services/session-manager.js` | Redis 会话管理，**保留同时新增 DB 写入** |

---

## Phase 1: 基础设施搭建（数据库 + 认证 + 组件库）

### Task 1: 引入 PostgreSQL + Prisma ORM

- [ ] **Step 1: 创建 Prisma Schema**

目标文件: `packages/database/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  password     String
  name         String?
  avatar       String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  videoTasks   VideoTask[]
}

model VideoTask {
  id            String     @id @default(cuid())
  userId        String
  platform      String
  template      String
  script        String
  tags          String[]
  status        TaskStatus @default(DRAFT)
  scheduledAt   DateTime?
  videoUrl      String?
  thumbnailUrl  String?
  rhTaskId      String?
  publishResult Json?
  error         String?
  retryCount    Int        @default(0)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  user          User       @relation(fields: [userId], references: [id])

  @@index([scheduledAt])
  @@index([status])
  @@index([userId])
}

enum TaskStatus {
  DRAFT
  GENERATING
  GENERATED
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELLED
}
```

- [ ] **Step 2: 创建 Prisma Client 包**

目标文件: `packages/database/package.json` — 导出单例 PrismaClient

- [ ] **Step 3: 添加 docker-compose PostgreSQL 服务**

修改 `deploy/docker-compose.yml`，新增：
```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: avatar_video
      POSTGRES_USER: avatar
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
```

- [ ] **Step 4: 运行迁移验证**

```bash
cd packages/database && npx prisma migrate dev --name init
```

### Task 2: 引入 shadcn/ui 组件库

- [ ] **Step 1: 安装 Tailwind CSS + shadcn/ui**

在 `creator-frontend/` 中安装并初始化：
```bash
npm install -D tailwindcss postcss autoprefixer @tailwindcss/typography
npx tailwindcss init -p
npx shadcn-ui@latest init
```

- [ ] **Step 2: 添加基础组件**

按需添加 shadcn/ui 组件：
```bash
npx shadcn-ui@latest add button card dialog tabs select calendar popover dropdown-menu avatar badge table
```

- [ ] **Step 3: 配置 Tailwind 暗色模式**

修改 `creator-frontend/tailwind.config.ts`：
```ts
module.exports = {
  darkMode: 'class',
  // ... 其余配置
}
```

### Task 3: 用户认证系统（借鉴 postiz JWT 方案）

- [ ] **Step 1: NestJS Auth 模块**（`apps/backend/src/modules/auth/`）

创建 JWT access token + refresh token 双 token 机制：
- `auth.controller.ts` — POST /auth/register, /auth/login, /auth/refresh
- `auth.service.ts` — bcrypt 密码哈希、JWT 签发、refresh 轮换
- `jwt.strategy.ts` — Passport JWT 策略
- `jwt-auth.guard.ts` — 全局认证守卫

- [ ] **Step 2: 前端 AuthProvider**

组件: `creator-frontend/src/providers/AuthProvider.tsx`
- 管理 `accessToken` 和 `refreshToken`
- axios/fetch 拦截器自动附加 Authorization header
- 401 时自动 refresh
- 登录/注册表单 UI

---

## Phase 2: 双面板 ConfirmView 重构（借鉴 RunningHub 布局）

### Task 4: ConfirmView 左右双面板重构

- [ ] **Step 1: 拆分布局**

当前 ConfirmView 是单列静态罗列信息。重构为：

```
┌──────────────────┬───────────────────────┐
│  左侧：配置面板   │   右侧：实时预览        │
│                  │                       │
│  TemplateParams  │   模板封面 + 平台预览   │
│  PlatformSelect  │                       │
│  ScriptEditor    │                       │
│  TagEditor       │                       │
│                  │                       │
│  [确认并生成视频]│                       │
│  (不在这里定时)  │                       │
└──────────────────┴───────────────────────┘
```
> ⚠️ SchedulePicker 不在此视图。ConfirmView 只负责确认需求并触发视频生成。定时发布在视频生成完成后（ReviewView）再选择。

- [ ] **Step 2: TemplateParams 动态表单**

借鉴 RunningHub 的 `nodeInfoList` 动态节点渲染：

组件: `creator-frontend/src/components/tasks/TemplateParams.tsx`
```tsx
interface TemplateParam {
  paramId: string
  paramName: string
  paramType: 'STRING' | 'LIST' | 'FILE'
  fieldValue: string
  description: string
  options?: { label: string; value: string }[]
  acceptTypes?: string[]
}
```

根据 `paramType` 渲染：
- STRING → `<Textarea>`（shadcn/ui）
- LIST → `<Select>`（shadcn/ui）
- FILE → 上传按钮 + 缩略图预览

- [ ] **Step 3: 右侧平台预览**

组件: `creator-frontend/src/components/tasks/PlatformPreview.tsx`

借鉴 postiz 的 `PlatformTabs` 模式 + RunningHub 的右侧结果区：

```tsx
<Tabs value={activePlatform}>
  <TabsList>
    <TabsTrigger value="douyin">🎵 抖音</TabsTrigger>
    <TabsTrigger value="kuaishou">🎬 快手</TabsTrigger>
    <TabsTrigger value="xiaohongshu">📕 小红书</TabsTrigger>
  </TabsList>
  <TabsContent value="douyin">
    {/* 抖音风格模拟卡片 */}
    <div className="phone-mockup">
      <img src={templateCover} />
      <div className="caption">{script}</div>
      <div className="tags">{tags.map(t => '#'+t).join(' ')}</div>
    </div>
  </TabsContent>
  {/* ... 其他平台 */}
</Tabs>
```

- [ ] **Step 4: 预览区状态切换**

```
配置阶段: 模板封面 + 文字说明
生成中:   ⏳ 进度条 + 预估时间
已生成:   ▶ 视频播放器
```

---

## Phase 3: 定时调度系统（借鉴 postiz BullMQ 方案）

### Task 5: BullMQ 队列系统搭建

- [ ] **Step 1: 队列定义**

文件: `apps/backend/src/modules/queue/`

定义两个独立队列：
- `generation` 队列 — 视频生成（无 delay，立即执行）
- `publish` 队列 — 视频发布（支持 delay 定时）

```typescript
BullModule.registerQueue(
  { name: 'generation' },  // 生成队列：无 delay
  { name: 'publish' },     // 发布队列：delay 支持
)
```

- [ ] **Step 2: 在 docker-compose.yml 中新增 Redis（BullMQ 依赖）**

Redis 已有，复用。确保 `REDIS_URL` 环境变量配置正确。

### Task 6: 生成-发布解耦流水线

- [ ] **Step 1: 提交时立即生成（不延迟，不定时）**

修改 `creator-api/routes/submit.js`：
```javascript
// 用户提交 → 始终立即入队 generation 队列，不涉及定时
async function submitTask(sessionId) {
  const session = await sessionManager.load(sessionId)
  const ctx = session.context

  const task = await prisma.videoTask.create({
    data: {
      userId: ctx.userId,
      platform: ctx.platform,
      template: ctx.template,
      script: ctx.script,
      tags: ctx.tags,
      status: 'GENERATING',  // 立即生成
      // scheduledAt 不在此处设置，等视频生成后用户再选
    },
  })

  await generationQueue.add('generate', { taskId: task.id })
  return { taskId: task.id }
}
```
> ⚠️ scheduledAt 只在视频 GENERATED 后、用户通过 SchedulePicker 选择时才设置。submit 阶段完全不涉及定时。

- [ ] **Step 2: Generation Worker（保留现有 RunningHub 集成）**

Worker 处理 `generation` 队列：
1. 调用 RunningHub API 提交视频生成（复用现有 `skills/runninghub/generate.js` 逻辑）
2. 轮询等结果（最多 15 分钟）
3. 成功 → 更新 status=GENERATED, videoUrl, thumbnailUrl
4. 失败 → 更新 status=FAILED, error, retryCount+1
5. 通知前端（SSE 推送状态变更）

- [ ] **Step 3: Publish Worker（保留现有手机 Agent 发布流程）**

> ⚠️ 关键：以下流程与 postiz 的 API 调用完全不同，必须保留 avatar 现有的 ADB + MQTT 手机控制方案。

Worker 处理 `publish` 队列，完整手机自动化发布流程：

```
┌─ Publish Worker（每步都可能失败，每步都需要重试/回退）────────┐
│                                                               │
│  1. 从 DB 加载 VideoTask + videoUrl                           │
│     │                                                         │
│  2. 检查设备可用性（通过 Redis 设备注册表）                      │
│     ├─ 在线 → 继续                                            │
│     └─ 离线 → 标记 FAILED，error="无可用设备"                   │
│     │                                                         │
│  3. 从 MinIO/RunningHub 下载视频到本地临时目录                  │
│     └─ 下载失败 → 重试 3 次 → 标记 FAILED                     │
│     │                                                         │
│  4. ADB 推送视频文件到手机                                     │
│     └─ push 失败 → 检查 USB/WiFi 连接 → 重试 3 次             │
│     │                                                         │
│  5. 通过 MQTT 下发发布指令到 phone-agent（保留现有协议）        │
│     topic: phone/{deviceId}/task                              │
│     payload: { action: "publish-video", platform, filePath,   │
│                title, tags }                                  │
│     │                                                         │
│  6. phone-agent 执行动作序列（复用现有 action-engine.js）：     │
│     a. ADB 启动目标 APP（com.ss.android.ugc.aweme 等）         │
│     b. 等待 APP 加载 → 截图验证                               │
│     c. 查找「发布/＋」按钮 → 点击                              │
│     d. 选择视频文件 → 等待导入                                 │
│     e. 输入标题文字（ADB input text / 粘贴板）                  │
│     f. 添加话题标签                                            │
│     g. 点击「发布」→ 等待上传+处理                             │
│     h. 截图验证发布成功                                         │
│     │                                                         │
│  7. phone-agent 通过 MQTT 上报状态                             │
│     topic: phone/{deviceId}/status                            │
│     └─ SUCCESS / FAILED / STEP_FAILED                         │
│     │                                                         │
│  8. Worker 收到结果 → 更新 VideoTask                           │
│     ├─ SUCCESS → status=PUBLISHED, publishResult              │
│     └─ FAILED → status=FAILED, error=失败步骤详情              │
│                                                               │
│  重试策略（针对手机自动化的特殊场景）：                           │
│  - 设备离线 → 不重试，标记 FAILED，等待下次 Cron 检测新设备       │
│  - 下载失败 → 指数退避重试 3 次                                │
│  - ADB 命令超时 → 重试 2 次                                   │
│  - APP 找不到元素 → 重试 1 次（可能是加载延迟）                  │
│  - 发布被平台拒绝 → 不重试，标记 FAILED（内容问题）              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

BullMQ 配置适配手机自动化场景：
```typescript
publishQueue.add('publish-video', { taskId }, {
  delay,                                  // 借鉴 postiz：BullMQ delay
  jobId: `publish:${taskId}`,
  backoff: {
    type: 'exponential',
    delay: 60000,                         // 手机操作比 API 慢，初始 60s
  },
  attempts: 3,                            // 借鉴 postiz：最多 3 次
  removeOnComplete: true,
  removeOnFail: false,                    // 保留失败记录供排查
})
```

### Task 7: 用户触发发布（立即 / 定时）

- [ ] **Step 1: 发布调度 API**

```typescript
// POST /api/tasks/:id/schedule
async function schedulePublish(taskId, scheduledAt) {
  const task = await prisma.videoTask.findUnique({ where: { id: taskId } })
  if (task.status !== 'GENERATED') throw new Error('视频尚未生成')

  const delay = scheduledAt.getTime() - Date.now()

  if (delay <= 0) {
    // 立即发布
    await publishQueue.add('publish', { taskId })
    await prisma.videoTask.update({ where: { id: taskId }, data: { status: 'PUBLISHING' } })
  } else {
    // 定时发布 — BullMQ delay（借鉴 postiz 核心特性）
    await publishQueue.add('publish', { taskId }, {
      delay,
      jobId: `publish:${taskId}`,
      backoff: { type: 'exponential', delay: 30000 },
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    })
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: 'SCHEDULED', scheduledAt },
    })
  }
}
```

### Task 8: Cron 兜底扫描（借鉴 postiz 双重保障）

- [ ] **Step 1: 扫描到期发布任务**

```typescript
// 每 30 秒扫描（借鉴 postiz 的核心设计）
@Cron('*/30 * * * * *')
async function scanDuePublishes() {
  const dueTasks = await prisma.videoTask.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date() },
    },
  })

  for (const task of dueTasks) {
    const existing = await publishQueue.getJob(`publish:${task.id}`)
    if (!existing) {
      // BullMQ 中已丢失（Redis 重启等），重新入队
      await publishQueue.add('publish', { taskId: task.id })
    }
  }
}
```

---

## Phase 4: Dashboard + 任务管理 UI（借鉴 postiz）

### Task 9: Dashboard 概览页

- [ ] **Step 1: StatCard 统计卡片行（借鉴 postiz）**

组件: `creator-frontend/src/components/StatCard.tsx`

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <StatCard title="已生成视频" value={totalVideos} icon={<VideoIcon />} trend="+15" />
  <StatCard title="已发布" value={publishedCount} icon={<SendIcon />} trend="+3" />
  <StatCard title="排队中" value={queuedCount} icon={<ClockIcon />} />
  <StatCard title="失败" value={failedCount} icon={<AlertIcon />} variant="destructive" />
</div>
```

- [ ] **Step 2: 页面布局 Shell（借鉴 postiz Sidebar + Header）**

```
┌──────────┬─────────────────────────────────┐
│ Sidebar  │  Header（面包屑 + 通知 + 头像）   │
│          ├─────────────────────────────────┤
│  📊 概览  │                                 │
│  📋 任务  │       Content Area              │
│  🎬 创建  │                                 │
│  ⚙️ 设置  │                                 │
└──────────┴─────────────────────────────────┘
```

### Task 10: DataTable 任务历史列表

- [ ] **Step 1: 使用 @tanstack/react-table + shadcn DataTable**

组件: `creator-frontend/src/components/tasks/TaskTable.tsx`

| 视频标题 | 平台 | 创建时间 | 定时时间 | 状态 | 操作 |
|---------|-----|---------|---------|------|------|
| 618促销 | 🎵  | 05-01 | 05-03 20:00 | ✅ 已发布 | 查看 |
| 新品开箱 | 📕  | 04-30 | — | 🔄 生成中 | — |
| — | — | — | — | ❌ 失败 | 重试 |

支持排序、筛选（按状态/平台）、分页、行点击查看详情。

### Task 11: ReviewView — 视频生成后预览 + 定时发布（借鉴 postiz）

> ⚠️ 此组件在视频 GENERATED 后展示，不在 ConfirmView 中。用户看到生成结果 → 选择立即或定时发布。

- [ ] **Step 1: ReviewView 组件（含 SchedulePicker）**

组件: `creator-frontend/src/components/tasks/ReviewView.tsx`

```tsx
function SchedulePicker({ date, onSelect }) {
  return (
    <div className="space-y-3">
      <Label>发布方式</Label>
      <RadioGroup>
        <RadioGroupItem value="now">立即发布</RadioGroupItem>
        <RadioGroupItem value="scheduled">定时发布</RadioGroupItem>
      </RadioGroup>

      {mode === 'scheduled' && (
        <div className="flex gap-2">
          {/* 日期选择 — shadcn Calendar */}
          <Popover>
            <PopoverTrigger>
              <Button variant="outline">
                {date ? format(date, 'yyyy-MM-dd') : '选择日期'}
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(d) => d < new Date()} // 禁止过去日期
              />
            </PopoverContent>
          </Popover>

          {/* 时间选择 — 30分钟间隔 */}
          <Select onValueChange={setTime}>
            <SelectTrigger>
              <SelectValue placeholder="选择时间" />
            </SelectTrigger>
            <SelectContent>
              {timeSlots.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
```

---

## Phase 5: 主题系统

### Task 12: 暗色/亮色主题（借鉴 postiz next-themes）

- [ ] **Step 1: ThemeProvider**

组件: `creator-frontend/src/components/theme/ThemeProvider.tsx`
使用 `usehooks-ts` 的 `useDarkMode` hook 或自行实现。

- [ ] **Step 2: ThemeToggle**

组件: `creator-frontend/src/components/theme/ThemeToggle.tsx`
在 Header 右侧放置太阳/月亮图标切换按钮。

- [ ] **Step 3: 全局 dark: 前缀**

所有 Tailwind 组件添加 `dark:` 变体（shadcn/ui 组件原生支持）。

---

## 状态机总览

```
                               阶段一（手机端）
                               ═══════════════
用户对话收集
     │
     ▼
   DRAFT ──────────────────────────────────────┐
     │                                          │
     │ 确认提交 → 服务器接管                     │
     ▼                                          │
                               阶段二（服务器端）
                               ═══════════════
GENERATING ──── 失败 ──→ FAILED ──→ DRAFT      │
     │               (允许重新生成)               │
     │ 成功                                      │
     ▼                                          │
 GENERATED ────────────────────────────────────┐│
     │                                          ││
     │ 用户预览后选择发布方式（此时才定时）         ││
     │                                          ││
                               阶段三（服务器端） ││
                               ═══════════════ ││
     │                                          ││
     ├─ 立即发布 ──────────────────────────────┐││
     │  PUBLISHING (BullMQ入队, 无delay)       │││
     │     │                                   ▼▼
     │     │                           PUBLISHING
     │     │                           (Worker: MQTT→
     │     │                            phone-agent→
     │     │                            ADB→APP操作)
     │     │                                │
     │     │                          成功/失败
     │     │                                │
     │     └────────────────────────→ PUBLISHED / FAILED
     │
     └─ 定时发布 → SCHEDULED
          (BullMQ delay + Cron兜底)
                │
                │ 到达时间
                ▼
          PUBLISHING → PUBLISHED / FAILED

取消: DRAFT / GENERATED / SCHEDULED → CANCELLED
```

---

## 风险与回滚

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| BullMQ 替代 MQTT 影响现有点对点通信 | 🔴 高 | **分阶段：Publish Worker 内部仍走 MQTT 下发 phone-agent，BullMQ 只管理队列/延迟/重试。手机心跳、设备注册保留 MQTT 不变** |
| 手机发布步骤多，BullMQ 单一 Job 超时难控制 | 🔴 高 | Publish Worker 内部拆分超时：下载 2min / ADB 推送 1min / APP 操作 5min，任意步骤超时→标记 STEP_FAILED→上报具体失败阶段 |
| 排队中的定时任务到达时设备离线 | 🟡 中 | Cron 扫描时检查设备可用性，无设备则保持 SCHEDULED + 增加 error 备注，等待下次扫描 |
| PostgreSQL 引入增加运维复杂度 | 🟡 中 | Docker Compose 一键部署，Prisma 简化迁移 |
| 前端重构 ConfirmView 影响现有对话流程 | 🟡 中 | 新建组件，旧 ConfirmView 保留为 fallback，feature flag 切换 |
| phone-agent 与 BullMQ Worker 在不同机器/容器 | 🟡 中 | Worker 通过 MQTT 桥接（保留现有协议），不要求同机部署 |
| 视频文件下载到 Worker 本地再 ADB push 的存储压力 | 🟢 低 | 下载后立即 push，push 完成后删除临时文件；单 Worker 串行处理避免磁盘爆满 |
| NestJS 迁移 Express 工作量大 | 🟢 低 | 渐进迁移：新模块写 NestJS，旧路由保留 Express，通过 API Gateway 统一

## 实施顺序建议

```
Phase 1: 基础架构（1-3天）
  Task 1: PostgreSQL + Prisma
  Task 2: shadcn/ui
  Task 3: JWT 认证

Phase 2: 双面板 UI（2-3天）
  Task 4: ConfirmView 重构

Phase 3: 调度系统（3-4天）
  Task 5-8: BullMQ + 生成-发布解耦 + Cron 兜底

Phase 4: Dashboard（2-3天）
  Task 9-11: StatCard + DataTable + SchedulePicker

Phase 5: 主题系统（1天）
  Task 12: Dark/Light Theme
```
