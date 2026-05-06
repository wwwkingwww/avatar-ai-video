# 创作者服务平台 UI 升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一路由体系 + 首页升级为创作者服务平台（对话+作品墙+工具集）+ 桌面端双栏布局 + 进度可视化升级。

**Architecture:** 引入 `react-router-dom` v6 作为路由层。`/` 路由指向新 `LandingPage`（三段式首页：顶部对话模块 + 中部作品聚合 + 底部工具集）。`/creator` 保留独立创作页（双栏布局）。`ChatView` 新增响应式 CSS：手机竖排，桌面≥1024px 左对话右面板双栏。`ProgressCard` 增加百分比进度条/预估时间/video 内联播放/失败重试。原有 `CreatorPage` 组件抽为 `pages/CreatorPage.tsx`，作为独立路由和 LandingPage 中嵌入复用。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS v4 + react-router-dom v6 + 现有 @base-ui/react + lucide-react

---

## 文件结构总览

```
creator-frontend/
├── package.json                          # [修改] 新增 react-router-dom 依赖
├── src/
│   ├── main.tsx                          # [修改] 包裹 RouterProvider
│   ├── App.tsx                           # [重写] 薄包装 → 指向 LandingPage
│   ├── router.tsx                        # [新建] 集中管理路由定义
│   ├── pages/
│   │   ├── LandingPage.tsx               # [新建] 🆕 三段式首页 (核心新增)
│   │   ├── CreatorPage.tsx               # [新建] 独立创作页 (原 App.tsx 逻辑)
│   │   └── Dashboard.tsx                 # [修改] state activeView → URL 路由
│   ├── components/
│   │   ├── ChatView.tsx                  # [修改] 响应式双栏 + chatBar prop
│   │   ├── ChatBar.tsx                   # [修改] 扩展链接 + Link 导航
│   │   ├── ProgressCard.tsx              # [重写] 百分比/预估/视频/重试
│   │   ├── PortfolioGrid.tsx             # [新建] 🆕 作品聚合模块
│   │   ├── ToolGrid.tsx                  # [新建] 🆕 工具聚合模块
│   │   ├── SectionDivider.tsx            # [新建] 🆕 分隔线组件
│   │   ├── layout/
│   │   │   └── Sidebar.tsx               # [修改] window.location → <Link>
│   │   └── ui/
│   │       └── ...                       # [不变] 基础 UI 组件
│   ├── hooks/
│   │   └── useSession.ts                # [不变]
│   └── styles/
│       └── chat.css                      # [修改] 响应式双栏 + 进度新样式 + 首页样式
```

---

## Phase 0: 新增 — 首页 LandingPage（对话+作品+工具）

### Task 1: 安装 react-router-dom

- [ ] **Step 1: 安装依赖**

```bash
cd creator-frontend && npm install react-router-dom@6
```

- [ ] **Step 2: 验证安装**

```bash
cd creator-frontend && node -e "require('react-router-dom/package.json')"
```
Expected: 打印版本号，无报错。

---

### Task 2: 新建 `src/components/SectionDivider.tsx`

**Files:**
- Create: `creator-frontend/src/components/SectionDivider.tsx`

```typescript
interface SectionDividerProps {
  label: string
  className?: string
}

export function SectionDivider({ label, className }: SectionDividerProps) {
  return (
    <div className={`flex items-center gap-3 px-1 py-2 ${className || ''}`}>
      <div className="flex-1 h-px bg-white/5" />
      <span className="text-xs text-white/20 font-medium whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  )
}
```

---

### Task 3: 新建 `src/components/ToolGrid.tsx`

**Files:**
- Create: `creator-frontend/src/components/ToolGrid.tsx`

```typescript
const TOOLS = [
  { icon: '✂️', label: '视频剪辑', status: '开发中' },
  { icon: '🎵', label: '配音配乐', status: '开发中' },
  { icon: '📊', label: '数据分析', status: '开发中' },
  { icon: '🖼', label: '封面设计', status: '开发中' },
  { icon: '📝', label: '文案优化', status: '开发中' },
  { icon: '🔗', label: '多平台同步', status: '开发中' },
]

export function ToolGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {TOOLS.map((tool) => (
        <div
          key={tool.label}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/5 bg-white/[0.01] py-4 px-3 opacity-60 cursor-not-allowed transition-opacity hover:opacity-80"
        >
          <span className="text-xl">{tool.icon}</span>
          <span className="text-xs text-white/25">{tool.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
            {tool.status}
          </span>
        </div>
      ))}
    </div>
  )
}
```

---

### Task 4: 新建 `src/components/PortfolioGrid.tsx`

**Files:**
- Create: `creator-frontend/src/components/PortfolioGrid.tsx`

```typescript
import { useState } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'templates' | 'my-works' | 'featured'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'templates', label: '官方模板', icon: '🎬' },
  { key: 'my-works', label: '我的作品', icon: '📁' },
  { key: 'featured', label: '优秀作品', icon: '⭐' },
]

const TEMPLATES = [
  { icon: '🎤', label: '口播带货', desc: '真人出镜 · 30s', highlight: true },
  { icon: '📦', label: '产品开箱', desc: '特写镜头 · 45s' },
  { icon: '📱', label: '功能演示', desc: 'APP 界面 · 60s' },
  { icon: '🎬', label: 'Vlog 模板', desc: '日常记录 · 30s' },
  { icon: '🎮', label: '游戏集锦', desc: '精彩操作 · 30s' },
  { icon: '🍔', label: '美食探店', desc: '诱人特写 · 45s' },
  { icon: '💄', label: '美妆教程', desc: '步骤演示 · 60s' },
  { icon: '🏠', label: '房屋展示', desc: '全景导览 · 60s' },
]

const MY_WORKS_EXAMPLE = [
  { title: '产品介绍视频', platform: '抖音', time: '5小时前', published: true },
]

const FEATURED = [
  { title: '科技测评', author: '@创作者A', views: '1.2w 播放' },
  { title: '美食探店', author: '@创作者B', views: '8.5k 播放' },
  { title: '产品开箱', author: '@创作者C', views: '6.2k 播放' },
  { title: '功能演示', author: '@创作者D', views: '3.8k 播放' },
]

interface PortfolioGridProps {
  onTemplateClick?: (label: string) => void
}

export function PortfolioGrid({ onTemplateClick }: PortfolioGridProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('templates')

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm rounded-t-lg transition-colors',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary font-medium border-b-2 border-primary'
                : 'text-white/25 hover:text-white/50',
            )}
          >
            <span className="text-xs">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {activeTab === 'templates' &&
          TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              onClick={() => onTemplateClick?.(tpl.label)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 text-left',
                tpl.highlight
                  ? 'bg-primary/5 border-primary/15'
                  : 'bg-white/[0.02] border-white/5',
              )}
            >
              <div className={cn(
                'w-full h-14 rounded-md flex items-center justify-center text-2xl mb-1',
                tpl.highlight
                  ? 'bg-gradient-to-br from-primary/20 to-purple-500/10'
                  : 'bg-gradient-to-br from-cyan-500/10 to-cyan-500/5',
              )}>
                {tpl.icon}
              </div>
              <span className="text-sm font-semibold text-foreground">{tpl.label}</span>
              <span className="text-xs text-white/25">{tpl.desc}</span>
            </button>
          ))}

        {activeTab === 'my-works' && (
          <>
            {MY_WORKS_EXAMPLE.map((work) => (
              <div key={work.title} className="relative flex flex-col rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
                <div className="h-14 bg-black/30 flex items-center justify-center text-lg">▶</div>
                {work.published && (
                  <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/90 text-white">已发布</span>
                )}
                <div className="p-3">
                  <p className="text-sm text-foreground">{work.title}</p>
                  <p className="text-xs text-white/20">{work.platform} · {work.time}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/5 bg-white/[0.01] min-h-[100px] opacity-40 hover:opacity-60 transition-opacity cursor-pointer">
              <span className="text-xl">＋</span>
              <span className="text-xs text-white/20">创建新作品</span>
            </div>
          </>
        )}

        {activeTab === 'featured' &&
          FEATURED.map((work) => (
            <div key={work.title} className="flex flex-col rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
              <div className="h-14 bg-gradient-to-br from-amber-500/10 to-amber-500/5 flex items-center justify-center text-lg">🏆</div>
              <div className="p-3">
                <p className="text-sm text-foreground">{work.title}</p>
                <p className="text-xs text-white/20">{work.author} · {work.views}</p>
              </div>
            </div>
          ))}
      </div>

      {activeTab === 'templates' && (
        <p className="text-center text-xs text-white/10 hover:text-white/25 cursor-pointer transition-colors">
          查看更多模板 →
        </p>
      )}
      {activeTab === 'my-works' && (
        <p className="text-center text-xs text-white/10">登录后可查看全部作品</p>
      )}
      {activeTab === 'featured' && (
        <p className="text-center text-xs text-white/10">每周精选 · 社区投稿</p>
      )}
    </div>
  )
}
```

---

### Task 5: 新建 `src/pages/LandingPage.tsx`

**Files:**
- Create: `creator-frontend/src/pages/LandingPage.tsx`

```typescript
import { useSession } from '../hooks/useSession'
import { ChatView } from '../components/ChatView'
import { ChatBar } from '../components/ChatBar'
import { PortfolioGrid } from '../components/PortfolioGrid'
import { ToolGrid } from '../components/ToolGrid'
import { SectionDivider } from '../components/SectionDivider'
import { useNavigate, Link } from 'react-router-dom'

export function LandingPage() {
  const navigate = useNavigate()
  const {
    step, state, streamingText, uploadedFiles,
    context, taskId, initSession, sendUserMessage, handleFileUpload,
  } = useSession()

  const handleTemplateClick = (label: string) => {
    sendUserMessage(label)
    // 滚动到聊天区顶部
    document.querySelector('.landing-chat-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-lg">🎬</span>
        <span className="font-bold text-sm text-foreground">AI 视频创作</span>
        <div className="flex-1" />
        <Link
          to="/dashboard"
          className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5 rounded-md border border-white/10 hover:border-white/20"
        >
          管理后台
        </Link>
        <button className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-md border border-white/8">
          登录
        </button>
      </header>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-6 pb-12">
        {/* ===== 对话模块 ===== */}
        <section className="landing-chat-section">
          <div className="rounded-xl border border-primary/10 overflow-hidden bg-white/[0.01]">
            <div className="bg-gradient-to-r from-primary/5 to-purple-500/3 px-4 py-2.5 border-b border-primary/5 flex items-center gap-2">
              <span className="text-sm text-primary font-semibold">💬 AI 视频创作助手</span>
              <span className="flex-1" />
              <span className="text-[10px] text-white/10 hidden sm:inline">直接对话开始创作 👇</span>
            </div>

            {/* 嵌入的 ChatView（不含 ChatBar，ChatBar 嵌入在 ChatView 中） */}
            <ChatView
              chatBar={
                <ChatBar
                  onSend={sendUserMessage}
                  onExpand={() => navigate('/creator')}
                  isStreaming={state.isStreaming}
                />
              }
              step={step}
              messages={state.messages}
              streamingText={streamingText}
              isStreaming={state.isStreaming}
              uploadedFiles={uploadedFiles}
              context={context}
              taskId={taskId}
              onSend={sendUserMessage}
              onUpload={handleFileUpload}
              onNewTask={() => { initSession() }}
            />
          </div>
        </section>

        {/* ===== 作品聚合 ===== */}
        <SectionDivider label="🎬 作品聚合" />
        <PortfolioGrid onTemplateClick={handleTemplateClick} />

        {/* ===== 实用工具 ===== */}
        <SectionDivider label="🛠 实用工具" />
        <ToolGrid />

        {/* 页脚 */}
        <footer className="text-center pt-6 text-xs text-white/5">
          AI 视频创作平台 · 让每个人都能轻松创作视频
        </footer>
      </div>
    </div>
  )
}
```

---

### Task 6: 验证 Phase 0 — LandingPage 渲染

- [ ] **Step 1: 确保 router.tsx 中 / → LandingPage**

先在 Task 7 完成 router.tsx 后再验证（见 Phase 1 最终验证）。

---

## Phase 1: 统一路由 (方案 A)

### Task 7: 创建路由配置文件 `src/router.tsx`

**Files:**
- Create: `creator-frontend/src/router.tsx`

```typescript
// creator-frontend/src/router.tsx
import { createBrowserRouter } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { CreatorPage } from './pages/CreatorPage'
import { Dashboard } from './pages/Dashboard'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/creator',
    element: <CreatorPage />,
  },
  {
    path: '/dashboard/:view?',
    element: <Dashboard />,
  },
])
```

---

### Task 8: 新建 `src/pages/CreatorPage.tsx`

**Files:**
- Create: `creator-frontend/src/pages/CreatorPage.tsx`

原 [App.tsx](file:///e:/cusorspace/avatar-ai-video/creator-frontend/src/App.tsx) 的全部逻辑迁移至此。与 LandingPage 的区别：CreatorPage 是独立全屏创作视图，无作品墙和工具集。

```typescript
// creator-frontend/src/pages/CreatorPage.tsx
import { useSession } from '../hooks/useSession'
import { ChatView } from '../components/ChatView'
import { ChatBar } from '../components/ChatBar'
import { useNavigate } from 'react-router-dom'

export function CreatorPage() {
  const navigate = useNavigate()
  const {
    step, state, streamingText, uploadedFiles,
    context, taskId, initSession, sendUserMessage, handleFileUpload,
  } = useSession()

  return (
    <div className="creator-app">
      <ChatView
        chatBar={
          <ChatBar
            onSend={sendUserMessage}
            onExpand={() => navigate('/dashboard')}
            isStreaming={state.isStreaming}
          />
        }
        step={step}
        messages={state.messages}
        streamingText={streamingText}
        isStreaming={state.isStreaming}
        uploadedFiles={uploadedFiles}
        context={context}
        taskId={taskId}
        onSend={sendUserMessage}
        onUpload={handleFileUpload}
        onNewTask={() => { initSession() }}
      />
    </div>
  )
}
```

---

### Task 9: 改造 `src/main.tsx` — 引入 RouterProvider

**Files:**
- Modify: `creator-frontend/src/main.tsx`

替换整个文件：

```typescript
// creator-frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import './index.css'
import './styles/variables.css'
import './styles/chat.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
```

---

### Task 10: 重写 `src/App.tsx` — 保留向后兼容

**Files:**
- Modify: `creator-frontend/src/App.tsx`

```typescript
// creator-frontend/src/App.tsx
// 此文件已废弃，新入口见 src/main.tsx + src/router.tsx
export { LandingPage as default } from './pages/LandingPage'
```

---

### Task 11: 改造 `src/components/layout/Sidebar.tsx` — window.location → <Link>

**Files:**
- Modify: `creator-frontend/src/components/layout/Sidebar.tsx`

在文件顶部新增 import：
```typescript
import { Link, useLocation } from 'react-router-dom'
```

Sidebar 函数体内新增：
```typescript
const location = useLocation()
```

将导航项分为两种模式——"创作"用 `<Link to="/">`，其他用 onClick + navigate：

导航项 map 内部改为：
```typescript
const isActive =
  item.id === 'create'
    ? location.pathname === '/' || location.pathname === '/creator'
    : location.pathname === `/dashboard/${item.id}` ||
      (item.id === 'dashboard' && location.pathname === '/dashboard')

if (item.id === 'create') {
  return (
    <Link
      key={item.id}
      to="/"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

return (
  <button
    key={item.id}
    onClick={() => onNavigate(item.id)}
    className={cn(
      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )}
  >
    <Icon className="h-4 w-4" />
    {item.label}
  </button>
)
```

---

### Task 12: 改造 `src/pages/Dashboard.tsx` — state activeView → URL 参数

**Files:**
- Modify: `creator-frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: 修改导入和状态**

删除：
```typescript
const [activeView, setActiveView] = useState('dashboard')
```

新增：
```typescript
import { useParams, useNavigate } from 'react-router-dom'

// 组件函数体内：
const { view } = useParams<{ view?: string }>()
const navigate = useNavigate()
const activeView = view || 'dashboard'

const handleNavigate = useCallback((v: string) => {
  navigate(v === 'dashboard' ? '/dashboard' : `/dashboard/${v}`)
}, [navigate])
```

- [ ] **Step 2: 将所有 `setActiveView` 替换为 `handleNavigate`**

在 Sidebar 的 `onNavigate` prop 和内部所有 `setActiveView` 调用处，替换为 `handleNavigate`。

---

### Task 13: 改造 `src/components/ChatBar.tsx` — 链接到 Dashboard

**Files:**
- Modify: `creator-frontend/src/components/ChatBar.tsx`

- [ ] **Step 1: 新增 import**

```typescript
import { Link } from 'react-router-dom'
```

- [ ] **Step 2: 将「展开对话」按钮改为 Link**

删除旧 `<Button variant="outline" size="xs" onClick={onExpand}>`（第 56-58 行），替换为：

```typescript
<Link
  to="/dashboard"
  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 shrink-0"
>
  ⛶ 管理后台
</Link>
```

---

### Task 14: 验证 Phase 0 + Phase 1

- [ ] **Step 1: 启动开发服务器**

```bash
cd creator-frontend && npm run dev
```

- [ ] **Step 2: 手动测试**

1. 访问 `http://localhost:5173/` → 应显示 LandingPage（对话区 + 作品墙 + 工具集）
2. 点击 LandingPage 顶部「管理后台」→ 应跳转到 `/dashboard`，无全页刷新
3. 访问 `http://localhost:5173/creator` → 应显示独立 CreatorPage（全屏创作）
4. 在 Dashboard Sidebar 点击「创作」→ 应跳回 `/`
5. 浏览器后退/前进按钮应正常工作

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd creator-frontend && npx tsc --noEmit
```
Expected: 0 errors。

---

## Phase 2: 桌面端双栏布局 (方案 B)

### Task 15: ChatView 增加 `chatBar` prop + 响应式双栏

**Files:**
- Modify: `creator-frontend/src/components/ChatView.tsx`

在 interface 中新增 `chatBar` prop：
```typescript
interface ChatViewProps {
  chatBar?: React.ReactNode
  step: number
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  uploadedFiles: UploadedFile[]
  context: Record<string, unknown>
  taskId: string | null
  onSend: (text: string) => void
  onUpload: (file: File) => void
  onNewTask: () => void
}
```

组件体内的核心逻辑——构建 `sidebarContent` 并拆分为左右两栏：

```typescript
const intent = (context.intent as Record<string, unknown>) || {}
const taskType = intent.taskType as string || null
const platforms = (context.platforms as string[]) || []
const script = intent.script as string || null

const missing: string[] = []
if (!taskType) missing.push('模板')
if (platforms.length === 0) missing.push('平台')
if (!intent.hasImage && !intent.hasVideo && !script && uploadedFiles.length === 0) missing.push('素材或文案')
if (!script) missing.push('文案')

// 桌面端右栏内容
const sidebarContent = step === 3 && taskId ? (
  <ProgressCard taskId={taskId} onNewTask={onNewTask} onRetry={handleRetry} />
) : (
  <>
    <PreviewPanel taskType={taskType} platforms={platforms} files={uploadedFiles} script={script} missing={missing} />
    <StepIndicator step={step} />
  </>
)

return (
  <div className="chat-view">
    {/* 左栏：对话区 */}
    <div className="chat-main">
      {chatBar}
      {/* 手机端顶部：PreviewPanel + StepIndicator，桌面端隐藏 */}
      <div className="lg:hidden">{sidebarContent}</div>
      <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} onOptionSelect={onSend} />
      <InputArea onSend={onSend} onUpload={onUpload} uploadedFiles={uploadedFiles} disabled={isStreaming} />
    </div>
    {/* 右栏：桌面端始终可见的面板 */}
    <aside className="chat-sidebar">
      {sidebarContent}
    </aside>
  </div>
)
```

---

### Task 16: ChatView 响应式双栏 — CSS 层

**Files:**
- Modify: `creator-frontend/src/styles/chat.css`

将 `.chat-view` 规则替换并追加：

```css
/* Chat View — 响应式双栏布局 */
.chat-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* 左栏：对话流（手机全宽，桌面 60%） */
.chat-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* 右栏：预览面板 + 步骤指示器 / 进度卡片（手机隐藏，桌面 40%） */
.chat-sidebar { display: none; flex-direction: column; overflow-y: auto; border-left: 1px solid var(--bg-card); background: var(--bg-primary); }

/* 桌面端双栏 */
@media (min-width: 1024px) {
  .chat-view { flex-direction: row; }
  .chat-main { flex: 6; }
  .chat-sidebar { display: flex; flex: 4; max-width: 420px; }
}

/* 桌面端侧栏中的 PreviewPanel 始终展开 */
.chat-sidebar .preview-panel { margin: 0; border-radius: 0; background: transparent; }
.chat-sidebar .preview-panel-header { cursor: default; padding: 14px 16px; font-weight: 600; font-size: var(--font-md); }
.chat-sidebar .preview-panel-toggle { display: none; }
```

---

### Task 17: 验证 Phase 2 — 双栏布局

- [ ] **Step 1: 启动开发服务器**

```bash
cd creator-frontend && npm run dev
```

- [ ] **Step 2: 手动测试**

1. 访问 `/creator` → 调整浏览器宽度到 1024px 以上 → 应看到左侧对话 + 右侧预览面板
2. 缩窄到 600px → 应恢复单栏布局，PreviewPanel 在 MessageList 上方
3. 在桌面端对话过程中，右侧预览面板应实时更新参数
4. 提交任务后（step=3），右侧应显示 ProgressCard

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd creator-frontend && npx tsc --noEmit
```

---

## Phase 3: 进度可视化升级 (方案 E)

### Task 18: ProgressCard 增加进度百分比

**Files:**
- Modify: `creator-frontend/src/components/ProgressCard.tsx`

- [ ] **Step 1: 新增 `onRetry` prop + 百分比计算**

```typescript
interface ProgressCardProps {
  taskId: string
  onNewTask: () => void
  onRetry?: () => void
}

function progressPercent(status: string): number {
  switch (status) {
    case 'SUBMITTED': return 5
    case 'SCHEDULED': return 10
    case 'GENERATING': return 30
    case 'GENERATED': return 70
    case 'PUBLISHING': return 80
    case 'PUBLISHED': return 100
    case 'FAILED': return 0
    case 'PUBLISH_FAILED': return 50
    default: return 0
  }
}
```

- [ ] **Step 2: 在 pipeline 上方增加进度条**

在 JSX 中 `pipeline` div 前面插入：

```typescript
const pct = progressPercent(state.status)

// 进度条
<div className="progress-bar-section">
  <div className="progress-bar-track">
    <div className={`progress-bar-fill ${isError ? 'error' : ''}`} style={{ width: `${pct}%` }} />
  </div>
  <span className="progress-bar-label">
    {isError ? '❌ 任务失败' : isDone ? '✅ 全部完成' : `${pct}%`}
  </span>
</div>
```

---

### Task 19: ProgressCard 增加预估时间

**Files:**
- Modify: `creator-frontend/src/components/ProgressCard.tsx`

在进度条下方追加：

```typescript
function estimatedRemaining(status: string, elapsed: number): string {
  if (status === 'SUBMITTED') return '排队中…'
  if (status === 'GENERATING') {
    const remaining = Math.max(0, 120 - elapsed)
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return m > 0 ? `预计剩余 ${m} 分 ${s} 秒` : `预计剩余 ${s} 秒`
  }
  if (status === 'PUBLISHING') return '发布中，约 30 秒'
  if (status === 'PUBLISHED' || status === 'GENERATED') return '已完成'
  return ''
}

// JSX：
{!isError && !isDone && !isGenerated && (
  <div className="progress-estimate">
    ⏱ {estimatedRemaining(state.status, elapsed)}
  </div>
)}
```

---

### Task 20: ProgressCard 已生成阶段 — <video> 内联播放

**Files:**
- Modify: `creator-frontend/src/components/ProgressCard.tsx`

将"已生成" StepCard 中的 `<img>` 替换为 `<video>`：

```typescript
{state.videoUrl ? (
  <div className="sc-thumb">
    <video
      src={state.videoUrl}
      controls
      preload="metadata"
      className="sc-video"
      style={{ width: '100%', maxHeight: 200, borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}
    />
    <a href={state.videoUrl} target="_blank" rel="noopener" className="sc-thumb-link">
      在新窗口查看视频 →
    </a>
  </div>
) : (
  <div className="sc-hint">等待生成完成…</div>
)}
```

---

### Task 21: ProgressCard 失败状态 — "重试"按钮

**Files:**
- Modify: `creator-frontend/src/components/ProgressCard.tsx`

在"生成中" StepCard 的 error 区域增加按钮：

```typescript
{isError && (
  <div className="sc-error">
    <span>❌ {state.error}</span>
    {onRetry && (
      <button className="retry-btn" onClick={onRetry}>
        🔄 重试
      </button>
    )}
  </div>
)}
```

同时需要在 ChatView.tsx 中实现 `handleRetry`：

```typescript
const handleRetry = useCallback(async () => {
  if (!taskId) return
  try { await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' }) }
  catch { /* ignore */ }
}, [taskId])
```

---

### Task 22: ProgressCard 新样式追加到 chat.css

**Files:**
- Modify: `creator-frontend/src/styles/chat.css`

追加：

```css
/* Progress Bar */
.progress-bar-section { display: flex; align-items: center; gap: 12px; padding: 0 4px; }
.progress-bar-track { flex: 1; height: 6px; border-radius: 3px; background: var(--bg-input); overflow: hidden; }
.progress-bar-fill { height: 100%; border-radius: 3px; background: var(--accent-gradient); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.progress-bar-fill.error { background: var(--error); }
.progress-bar-label { font-size: var(--font-sm); color: var(--accent-light); font-weight: 600; min-width: 80px; text-align: right; }

/* Progress Estimate */
.progress-estimate { text-align: center; font-size: var(--font-sm); color: var(--text-secondary); padding: 4px 0; }

/* Retry Button */
.retry-btn { margin-top: 8px; padding: 6px 14px; border-radius: var(--radius-sm); background: var(--accent); color: #fff; border: none; font-size: var(--font-sm); cursor: pointer; transition: opacity 0.2s; }
.retry-btn:hover { opacity: 0.85; }

/* Publish Result Anim */
.sc-pub-item { transition: all 0.3s ease; }
.sc-pub-item.pub-ok { animation: pub-success 0.4s ease-out; }
@keyframes pub-success { 0% { transform: scale(0.95); opacity: 0.6; } 50% { transform: scale(1.02); } 100% { transform: scale(1); opacity: 1; } }
```

---

### Task 23: 验证 Phase 3 — 进度可视化

- [ ] **Step 1: 启动开发服务器，提交一个任务，检查进度卡片**

1. 进度条显示百分比，过渡平滑
2. GENERATING 阶段显示预估剩余时间
3. GENERATED 阶段有 `<video>` 播放器
4. 失败后显示错误信息 + 重试按钮

- [ ] **Step 2: TypeScript 编译检查**

```bash
cd creator-frontend && npx tsc --noEmit
```

---

## Phase 4: 最终验证

### Task 24: 完整构建验证

- [ ] **Step 1: 类型检查**

```bash
cd creator-frontend && npx tsc --noEmit
```
Expected: 0 errors。

- [ ] **Step 2: 构建**

```bash
cd creator-frontend && npm run build
```
Expected: `dist/` 目录生成成功，exit 0。

- [ ] **Step 3: lint 检查**

```bash
cd creator-frontend && npm run lint
```
Expected: 0 errors（允许已有 warning，但不新增 error）。

---

## 任务索引

| Task | Phase | 名称 | 文件 |
|------|-------|------|------|
| 1 | P0 | 安装 react-router-dom | `package.json` |
| 2 | P0 | 新建 SectionDivider | `components/SectionDivider.tsx` 🆕 |
| 3 | P0 | 新建 ToolGrid | `components/ToolGrid.tsx` 🆕 |
| 4 | P0 | 新建 PortfolioGrid | `components/PortfolioGrid.tsx` 🆕 |
| 5 | P0 | 新建 LandingPage | `pages/LandingPage.tsx` 🆕 |
| 6 | P0 | Phase 0 验证 | — |
| 7 | P1 | 创建 router.tsx | `router.tsx` 🆕 |
| 8 | P1 | 新建 CreatorPage | `pages/CreatorPage.tsx` 🆕 |
| 9 | P1 | 改造 main.tsx | `main.tsx` ✏️ |
| 10 | P1 | 重写 App.tsx | `App.tsx` ✏️ |
| 11 | P1 | 改造 Sidebar | `layout/Sidebar.tsx` ✏️ |
| 12 | P1 | 改造 Dashboard | `pages/Dashboard.tsx` ✏️ |
| 13 | P1 | 改造 ChatBar | `ChatBar.tsx` ✏️ |
| 14 | P1 | Phase 0+1 验证 | — |
| 15 | P2 | ChatView 双栏组件层 | `ChatView.tsx` ✏️ |
| 16 | P2 | ChatView 双栏 CSS | `chat.css` ✏️ |
| 17 | P2 | Phase 2 验证 | — |
| 18 | P3 | ProgressCard 百分比 | `ProgressCard.tsx` ✏️ |
| 19 | P3 | ProgressCard 预估时间 | `ProgressCard.tsx` ✏️ |
| 20 | P3 | ProgressCard video 播放 | `ProgressCard.tsx` ✏️ |
| 21 | P3 | ProgressCard 重试按钮 | `ProgressCard.tsx` + `ChatView.tsx` ✏️ |
| 22 | P3 | ProgressCard CSS | `chat.css` ✏️ |
| 23 | P3 | Phase 3 验证 | — |
| 24 | P4 | 构建 & lint & tsc | — |

**合计: 24 个 Task · 6 个新文件 · 11 个修改文件**

---

## 路由映射

```
/                      → LandingPage   (首页：对话+作品+工具)
/creator               → CreatorPage   (独立创作全屏视图)
/dashboard              → Dashboard     (概览)
/dashboard/tasks        → Dashboard     (任务列表)
/dashboard/calendar     → Dashboard     (排期)
/dashboard/settings     → Dashboard     (设置)
```

---

## 风险与回滚

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| react-router-dom 与现有 Vite 配置不兼容 | 低 | 标准依赖，Vite 官方支持 |
| 双栏布局在特定分辨率下溢出 | 低 | 使用 flex + max-width + min-w-0 确保不溢出 |
| Session 状态在路由切换时丢失 | 中 | useSession 是组件级 state。LandingPage 和 CreatorPage 各自独立渲染，Dashboard 有独立数据获取，互不影响 |
| ProgressCard 的 video 跨域播放 | 低 | 视频 URL 来自 API 返回，通常同源或已配置 CORS |
| PortfolioGrid /my-works 需要登录态 | 低 | 采用占位 UI + 登录提示，不阻塞未登录用户 |
| 首页内容过多导致首屏加载慢 | 低 | LandingPage 中 ChatView 保持在首屏，其他模块在下方，懒加载可后续优化 |

**回滚方案**：
1. Git revert 本次所有提交
2. 或：删除 `router.tsx`/`LandingPage.tsx`/`PortfolioGrid.tsx`/`ToolGrid.tsx`/`SectionDivider.tsx`/`CreatorPage.tsx`，恢复 `main.tsx`/`App.tsx` 旧版
