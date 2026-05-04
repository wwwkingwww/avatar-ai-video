# Agent 对话框重新设计 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 对话框 UX 升级 — 单栏布局 + 预览面板 + RunningHub 配色 + 无轮次上限智能收敛

**Architecture:** React 18 + TypeScript 前端重写 ChatView 组件树，新增 5 个组件，删除 9 个废弃组件；后端 ai-proxy.js 系统提示词重写 + 移除 MAX_ROUNDS/forceConfirm

**Tech Stack:** React 18, TypeScript, shadcn/ui, CSS Variables

**Design doc:** `docs/superpowers/specs/2026-05-03-agent-dialog-redesign.md`

---

## File Map

| 文件 | 职责 |
|------|------|
| `creator-api/services/ai-proxy.js` | 系统提示词重写为预判式，删除 updateContextFromUser |
| `creator-api/services/session-manager.js` | 移除 MAX_ROUNDS/forceConfirm |
| `creator-api/routes/messages.js` | done 事件移除 forceConfirm |
| `creator-frontend/src/types.ts` | Message +optionMode，SessionState 简化 |
| `creator-frontend/src/services/parseOptions.ts` | 新增 parseOptions() 解析模式标记 |
| `creator-frontend/src/styles/variables.css` | 色板微调 |
| `creator-frontend/src/styles/chat.css` | 新增预览面板+步骤指示器样式 |
| `creator-frontend/src/components/PreviewPanel.tsx` | 🆕 预览面板容器 |
| `creator-frontend/src/components/PreviewSlot.tsx` | 🆕 信息槽位 |
| `creator-frontend/src/components/MissingHint.tsx` | 🆕 缺失提示 |
| `creator-frontend/src/components/StepIndicator.tsx` | 🆕 步骤指示器 |
| `creator-frontend/src/components/ProgressCard.tsx` | 🆕 进度卡片 |
| `creator-frontend/src/components/ChatView.tsx` | 重写集成新模式 |
| `creator-frontend/src/components/Bubble.tsx` | 传 optionMode |
| `creator-frontend/src/components/QuickOptions.tsx` | 支持 single/multi |
| `creator-frontend/src/components/MessageList.tsx` | 适配 |
| `creator-frontend/src/hooks/useSession.ts` | 重写：移除阶段机 + 确认触发词 |
| `creator-frontend/src/App.tsx` | 简化 |

---

## Phase 1: 后端适配

### Task 1: 重写 ai-proxy.js — 预判式系统提示词 + 删除状态机

**Files:**
- Modify: `creator-api/services/ai-proxy.js`

- [ ] **Step 1: 重写 buildSystemPrompt()**

```js
import { TASK_TYPE_IDS, taskTypeInfo, platformLabel } from '../../shared/generation-config.js'

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || 'https://api.deepseek.com'
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || ''

export function buildSystemPrompt(session) {
  const ctx = session.context || {}
  const round = session.round + 1

  const collected = []
  if (ctx.intent?.taskType) collected.push(`类型: ${ctx.intent.taskType}`)
  if (ctx.platforms?.length) collected.push(`平台: ${ctx.platforms.map(p => platformLabel(p)).join('、')}`)
  if (ctx.intent?.hasImage) collected.push('已有图片素材')
  if (ctx.intent?.hasVideo) collected.push('已有视频素材')
  if (ctx.intent?.preferredDuration) collected.push(`时长: ${ctx.intent.preferredDuration}s`)
  if (ctx.intent?.style) collected.push(`风格: ${ctx.intent.style}`)
  if (ctx.intent?.script) collected.push(`文案: ${ctx.intent.script}`)
  if ((session.files || []).length > 0) collected.push(`素材: ${session.files.length}个文件`)
  if (ctx.selectedModel) collected.push(`模型: ${ctx.selectedModel.endpoint}`)

  const collectedStr = collected.length > 0 ? collected.join(' | ') : '无'
  const types = TASK_TYPE_IDS.map(id => taskTypeInfo(id).label).join('、')

  return `你是AI视频创作助手。目标是**尽可能少轮数内完成需求收集**，用户主要通过点击按钮交互。

第${round}轮对话
已收集信息：${collectedStr}

## 可用能力
- 文生视频：输入文案直接生成视频
- 图生视频：上传图片+文案生成视频
- 文生图：输入文案生成图片
- 视频编辑：上传视频+文案进行风格转换

## 自动推理规则（不追问，直接采用并告知用户）
- 提到「介绍」「展示」→ 模板=产品展示
- 提到「评测」「对比」→ 模板=科技评测
- 提到「vlog」「日常」→ 模板=Vlog
- 提到具体平台名 → 平台=该平台
- 新品发布类 → 风格=快节奏，标签自动生成
- 未传素材 → 默认「纯文案生成」
- 未指定时长 → 默认15s
- 未指定文案 → AI代写
- 「随便」「都行」→ 推荐最佳默认值

## 只追问以下关键缺失
- 用户上传了图片/视频但未说明用途 → 确认用途
- 用户同时提了矛盾方向 → 追问消歧

## 每轮要求
1. 2-3句话自然回应 + 列出✅已确认的信息
2. 每轮末尾必须用标记：平台类用 [OPTIONS:multi:选项1,选项2] 其他用 [OPTIONS:single:选项1,选项2]
3. 每轮options必须包含「✓ 确认并生成视频」
4. 信息足够时，「✓ 确认并生成视频」放第一位`
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
    body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DeepSeek 返回错误: HTTP ${response.status} - ${text.substring(0, 200)}`)
  }

  return response.body
}
```

- [ ] **Step 2: 删除 updateContextFromUser 函数和 MAX_ROUNDS 常量**

从文件中完全删除 `updateContextFromUser` 函数定义和 `const MAX_ROUNDS = 4`。

- [ ] **Step 3: 语法检查**

```bash
cd creator-api; node --check services/ai-proxy.js
```
Expected: exit 0

- [ ] **Step 4: 运行测试**

```bash
cd creator-api; npx vitest run
```
Expected: 检查并更新受影响的 test case

- [ ] **Step 5: Commit**

```bash
git add creator-api/services/ai-proxy.js
git commit -m "refactor(ai-proxy): predictive system prompt, remove phase state machine"
```

---

### Task 2: session-manager.js — 移除 MAX_ROUNDS 和 forceConfirm

**Files:**
- Modify: `creator-api/services/session-manager.js`

- [ ] **Step 1: 删除 MAX_ROUNDS 常量**

删除第 6 行: `const MAX_ROUNDS = 4;`

- [ ] **Step 2: createSession() 移除 forceConfirm 字段**

将 hset 调用改为：
```js
await redis.hset(sessionKey(id), {
  round: '0',
  status: 'chatting',
  history: '[]',
  context: '{}',
  files: '[]',
  createdAt: now,
});
```

- [ ] **Step 3: getSession() 移除 forceConfirm 解析**

删除: `forceConfirm: data.forceConfirm === '1',`

- [ ] **Step 4: updateSession() 移除 forceConfirm 处理**

删除: `if (updates.forceConfirm !== undefined) fields.forceConfirm = updates.forceConfirm ? '1' : '0';`

- [ ] **Step 5: incrementRound() 移除 forceConfirm 逻辑**

```js
export async function incrementRound(session) {
  const newRound = session.round + 1;
  await updateSession(session.id, { round: newRound });
  return { round: newRound };
}
```

- [ ] **Step 6: 删除 export { MAX_ROUNDS }**

- [ ] **Step 7: 语法检查**

```bash
cd creator-api; node --check services/session-manager.js
```
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add creator-api/services/session-manager.js
git commit -m "refactor(session): remove MAX_ROUNDS and forceConfirm"
```

---

### Task 3: messages.js — done 事件移除 forceConfirm

**Files:**
- Modify: `creator-api/routes/messages.js`

- [ ] **Step 1: SSE done 事件去掉 forceConfirm 字段**

找到 `res.write('data: ...')` 中发送 done 事件的代码，确保不包含 `forceConfirm`。

```js
res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse, round: result.round, context: session.context })}\n\n`);
```

- [ ] **Step 2: 语法检查 + Commit**

```bash
cd creator-api; node --check routes/messages.js
git add creator-api/routes/messages.js
git commit -m "refactor(messages): remove forceConfirm from SSE done events"
```

---

## Phase 2: 前端类型 + 解析层

### Task 4: types.ts — Message 加 optionMode，SessionState 简化

**Files:**
- Modify: `creator-frontend/src/types.ts`

- [ ] **Step 1: 更新 Message 接口**

```ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: string[];
  optionMode?: 'single' | 'multi';
  timestamp: number;
}
```

- [ ] **Step 2: 简化 SessionState**

```ts
export interface SessionState {
  sessionId: string | null;
  round: number;
  status: 'chatting' | 'submitted';
  messages: Message[];
  isStreaming: boolean;
}
```

保留其他接口（UploadedFile, ModelRecommendation, ModelField, IntentContext, TaskResult, TaskStatus, TaskStatusInfo）不变。

- [ ] **Step 3: 删除 ConfirmData 接口**

删除 `ConfirmData` 整个接口定义。

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/types.ts
git commit -m "refactor(types): add optionMode to Message, simplify SessionState"
```

---

### Task 5: parseOptions.ts — 支持 optionMode 解析

**Files:**
- Modify: `creator-frontend/src/services/parseOptions.ts`

- [ ] **Step 1: 重写文件**

```typescript
export interface ParsedMessage {
  content: string
  options: string[]
  optionMode: 'single' | 'multi'
}

export function stripOptions(text: string): string {
  return text.replace(/\[OPTIONS:\s*[^\]]*\]/g, '').trim()
}

export function parseOptions(text: string): ParsedMessage {
  const match = text.match(/\[OPTIONS:(single|multi):(.+?)\]/)
  if (match) {
    return {
      content: text.replace(match[0], '').trim(),
      options: match[2].split(',').map(s => s.trim()).filter(Boolean),
      optionMode: match[1] as 'single' | 'multi',
    }
  }
  return { content: text, options: [], optionMode: 'single' }
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/services/parseOptions.ts
git commit -m "feat(parseOptions): support optionMode parsing from AI marks"
```

---

## Phase 3: 新增 5 个组件

### Task 6: 创建 PreviewSlot.tsx + MissingHint.tsx + StepIndicator.tsx

**Files:**
- Create: `creator-frontend/src/components/PreviewSlot.tsx`
- Create: `creator-frontend/src/components/MissingHint.tsx`
- Create: `creator-frontend/src/components/StepIndicator.tsx`

- [ ] **Step 1: PreviewSlot.tsx**

```tsx
interface PreviewSlotProps {
  label: string
  value: string | null
  icon: string
  status: 'empty' | 'pending' | 'filled' | 'error'
}

export function PreviewSlot({ label, value, icon, status }: PreviewSlotProps) {
  return (
    <div className={`preview-slot ${status}`}>
      <span className="preview-slot-icon">{icon}</span>
      <span className="preview-slot-label">{label}</span>
      <span className="preview-slot-value">{status === 'empty' ? '待填写' : value || '—'}</span>
      {status === 'filled' && <span className="preview-slot-check">✓</span>}
    </div>
  )
}
```

- [ ] **Step 2: MissingHint.tsx**

```tsx
interface MissingHintProps {
  items: string[]
}

export function MissingHint({ items }: MissingHintProps) {
  if (items.length === 0) return null
  return <div className="missing-hint">⏳ 还差：{items.join('、')}</div>
}
```

- [ ] **Step 3: StepIndicator.tsx**

```tsx
const STEPS = ['描述需求', '确认参数', '提交生成']

interface StepIndicatorProps {
  step: number  // 1, 2, or 3
}

export function StepIndicator({ step }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {STEPS.map((_, i) => (
        <span key={i} className={`step-dot ${i + 1 <= step ? 'active' : ''} ${i + 1 < step ? 'done' : ''}`} />
      ))}
      <span className="step-label">{STEPS[step - 1]}</span>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/components/PreviewSlot.tsx creator-frontend/src/components/MissingHint.tsx creator-frontend/src/components/StepIndicator.tsx
git commit -m "feat: add PreviewSlot, MissingHint, StepIndicator components"
```

---

### Task 7: 创建 ProgressCard.tsx

**Files:**
- Create: `creator-frontend/src/components/ProgressCard.tsx`

- [ ] **Step 1: 编写组件**

```tsx
import { useEffect, useState, useCallback } from 'react'
import type { TaskStatusInfo } from '../types'

interface ProgressCardProps {
  taskId: string
  onNewTask: () => void
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: '已提交', SCHEDULED: '已排期', GENERATING: '生成中',
  GENERATED: '已生成', PUBLISHING: '发布中', PUBLISHED: '已发布',
  FAILED: '失败', PUBLISH_FAILED: '发布失败', CANCELLED: '已取消',
}

export function ProgressCard({ taskId, onNewTask }: ProgressCardProps) {
  const [info, setInfo] = useState<TaskStatusInfo | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json()
      if (data.data) setInfo(data.data)
    } catch { /* ignore */ }
  }, [taskId])

  useEffect(() => {
    poll()
    const i = setInterval(poll, 3000)
    return () => clearInterval(i)
  }, [poll])

  const isDone = info?.status === 'PUBLISHED' || info?.status === 'FAILED'
  const isError = info?.status === 'FAILED' || info?.status === 'PUBLISH_FAILED'

  return (
    <div className="progress-card">
      <div className="progress-card-icon">{isError ? '❌' : isDone ? '🎉' : '⏳'}</div>
      <div className="progress-card-title">{isDone ? '任务完成' : isError ? '任务失败' : '生成中...'}</div>
      <div className="progress-card-info">
        任务编号: <strong>{taskId}</strong>
        {info && <><br />状态: {STATUS_LABELS[info.status] || info.status}</>}
      </div>
      {info?.error && <div className="progress-card-error">{info.error}</div>}
      {info?.videoUrl && (
        <a href={info.videoUrl} target="_blank" rel="noopener" className="progress-card-link">查看视频 →</a>
      )}
      {isDone && <button className="progress-card-btn" onClick={onNewTask}>创建新任务</button>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/ProgressCard.tsx
git commit -m "feat: add ProgressCard component"
```

---

### Task 8: 创建 PreviewPanel.tsx

**Files:**
- Create: `creator-frontend/src/components/PreviewPanel.tsx`

- [ ] **Step 1: 编写组件**

```tsx
import { useState } from 'react'
import { PreviewSlot } from './PreviewSlot'
import { MissingHint } from './MissingHint'
import type { UploadedFile } from '../types'
import { taskTypeInfo } from '../services/videoConfig'

interface PreviewPanelProps {
  taskType: string | null
  platforms: string[]
  files: UploadedFile[]
  script: string | null
  missing: string[]
}

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书',
}

export function PreviewPanel({ taskType, platforms, files, script, missing }: PreviewPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const hasContent = taskType || platforms.length > 0 || files.length > 0 || script

  if (!expanded) {
    const summary = hasContent
      ? `🎬 ${taskType ? taskTypeInfo(taskType)?.label || taskType : '未选'} · ${platforms.length > 0 ? platforms.map(p => PLATFORM_LABELS[p] || p).join('、') : '未选平台'} ｜ ${missing.length > 0 ? `${missing.length}项待填` : '✓ 已完成'}`
      : '🎬 视频创作预览 — 点击展开'
    return <div className="preview-panel collapsed" onClick={() => setExpanded(true)}>{summary}</div>
  }

  return (
    <div className="preview-panel">
      <div className="preview-panel-header" onClick={() => setExpanded(false)}>
        <span>🎬 视频创作预览</span><span className="preview-panel-toggle">▲</span>
      </div>
      {!hasContent ? (
        <div className="preview-panel-empty">在下方描述你的视频创意，AI 将引导你完成创作</div>
      ) : (
        <div className="preview-panel-grid">
          <PreviewSlot label="模板" icon="🎤"
            value={taskType ? taskTypeInfo(taskType)?.label || taskType : null}
            status={taskType ? 'filled' : 'empty'} />
          <PreviewSlot label="平台" icon="📱"
            value={platforms.length > 0 ? platforms.map(p => PLATFORM_LABELS[p] || p).join('、') : null}
            status={platforms.length > 0 ? 'filled' : 'empty'} />
          <PreviewSlot label="素材" icon="📷"
            value={files.length > 0 ? `${files.length}个文件` : (taskType === 'text-to-video' ? '纯文案' : null)}
            status={files.length > 0 || taskType === 'text-to-video' ? 'filled' : 'empty'} />
          <PreviewSlot label="文案" icon="📝"
            value={script ? (script.length > 20 ? script.substring(0, 20) + '...' : script) : null}
            status={script ? 'filled' : 'empty'} />
        </div>
      )}
      <MissingHint items={missing} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/PreviewPanel.tsx
git commit -m "feat: add PreviewPanel component"
```

---

## Phase 4: 修改现有组件

### Task 9: QuickOptions 支持 single/multi 模式

**Files:**
- Modify: `creator-frontend/src/components/QuickOptions.tsx`

- [ ] **Step 1: 重写组件**

```tsx
import { useState, useCallback } from 'react'

interface QuickOptionsProps {
  options: string[]
  mode?: 'single' | 'multi'
  onSelect?: (option: string) => void
}

export function QuickOptions({ options, mode = 'single', onSelect }: QuickOptionsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((opt: string) => {
    if (mode === 'single') { onSelect?.(opt); return }
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(opt) ? next.delete(opt) : next.add(opt)
      return next
    })
  }, [mode, onSelect])

  const confirmMulti = useCallback(() => {
    if (selected.size > 0) {
      onSelect?.(Array.from(selected).join('、'))
      setSelected(new Set())
    }
  }, [selected, onSelect])

  return (
    <div className="quick-options">
      {options.map((opt, i) => {
        const isSelected = mode === 'multi' && selected.has(opt)
        return (
          <button key={i} className={`quick-option${isSelected ? ' selected' : ''}`}
            onClick={() => toggle(opt)}>
            {isSelected ? '✓ ' : ''}{opt}
          </button>
        )
      })}
      {mode === 'multi' && selected.size > 0 && (
        <button className="quick-option confirm" onClick={confirmMulti}>确认选择</button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/QuickOptions.tsx
git commit -m "feat(QuickOptions): single/multi mode with confirm button"
```

---

### Task 10: Bubble + MessageList 适配

**Files:**
- Modify: `creator-frontend/src/components/Bubble.tsx`
- Modify: `creator-frontend/src/components/MessageList.tsx`

- [ ] **Step 1: Bubble.tsx — 传 optionMode + onOptionSelect**

```tsx
import type { Message } from '../types'
import { QuickOptions } from './QuickOptions'

interface BubbleProps {
  message: Message
  isStreaming?: boolean
  onOptionSelect?: (option: string) => void
}

export function Bubble({ message, isStreaming, onOptionSelect }: BubbleProps) {
  const className = `bubble ${message.role}${isStreaming ? ' bubble-streaming' : ''}`
  return (
    <div className={className}>
      <div className="bubble-content">{message.content}</div>
      {message.options && message.options.length > 0 && (
        <QuickOptions options={message.options} mode={message.optionMode || 'single'} onSelect={onOptionSelect} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: MessageList.tsx — 透传 onOptionSelect**

```tsx
import { useEffect, useRef } from 'react'
import type { Message } from '../types'
import { Bubble } from './Bubble'

interface MessageListProps {
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  onOptionSelect?: (option: string) => void
}

export function MessageList({ messages, streamingText, isStreaming, onOptionSelect }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Bubble key={msg.id} message={msg} onOptionSelect={onOptionSelect} />
      ))}
      {isStreaming && streamingText && (
        <Bubble message={{ id: 'stream', role: 'assistant', content: streamingText, timestamp: Date.now() }}
          isStreaming />
      )}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add creator-frontend/src/components/Bubble.tsx creator-frontend/src/components/MessageList.tsx
git commit -m "feat(Bubble,MessageList): pass optionMode and onOptionSelect through"
```

---

### Task 11: 重写 ChatView.tsx

**Files:**
- Modify: `creator-frontend/src/components/ChatView.tsx`

- [ ] **Step 1: 完全重写**

```tsx
import { StepIndicator } from './StepIndicator'
import { PreviewPanel } from './PreviewPanel'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ProgressCard } from './ProgressCard'
import type { Message, UploadedFile } from '../types'

interface ChatViewProps {
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

export function ChatView({
  step, messages, streamingText, isStreaming, uploadedFiles,
  context, taskId, onSend, onUpload, onNewTask,
}: ChatViewProps) {
  if (step === 3 && taskId) {
    return <ProgressCard taskId={taskId} onNewTask={onNewTask} />
  }

  const intent = (context.intent as Record<string, unknown>) || {}
  const taskType = intent.taskType as string || null
  const platforms = (context.platforms as string[]) || []
  const script = intent.script as string || null

  const missing: string[] = []
  if (!taskType) missing.push('模板')
  if (platforms.length === 0) missing.push('平台')
  if (!intent.hasImage && !intent.hasVideo && !script && uploadedFiles.length === 0) missing.push('素材或文案')
  if (!script) missing.push('文案')

  return (
    <div className="chat-view">
      <PreviewPanel taskType={taskType} platforms={platforms} files={uploadedFiles} script={script} missing={missing} />
      <StepIndicator step={step} />
      <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} onOptionSelect={onSend} />
      <InputArea onSend={onSend} onUpload={onUpload} uploadedFiles={uploadedFiles} disabled={isStreaming} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/components/ChatView.tsx
git commit -m "feat(ChatView): rewrite with PreviewPanel + StepIndicator + ProgressCard"
```

---

## Phase 5: Hook 重构

### Task 12: 重写 useSession.ts

**Files:**
- Modify: `creator-frontend/src/hooks/useSession.ts`

- [ ] **Step 1: 完全重写**

```ts
import { useState, useCallback, useRef } from 'react'
import type { Message, SessionState, UploadedFile, TaskResult } from '../types'
import { createSession, uploadFile, submitTask } from '../services/api'
import { parseOptions } from '../services/parseOptions'
import { useSSE } from './useSSE'

let msgIdCounter = 0
function nextId() { return `msg_${Date.now()}_${++msgIdCounter}` }

const initialState: SessionState = {
  sessionId: null, round: 0, status: 'chatting', messages: [], isStreaming: false,
}

export function useSession() {
  const [state, setState] = useState<SessionState>(initialState)
  const [streamingText, setStreamingText] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [context, setContext] = useState<Record<string, unknown>>({})
  const [taskId, setTaskId] = useState<string | null>(null)
  const pendingAttachments = useRef<string[]>([])
  const pendingInit = useRef<Promise<string> | null>(null)
  const sse = useSSE()

  const initSession = useCallback(async () => {
    if (pendingInit.current) return pendingInit.current
    const promise = (async () => {
      setState(initialState); setStreamingText(''); setUploadedFiles([])
      setContext({}); setTaskId(null)
      try {
        const { sessionId, message } = await createSession()
        const parsed = parseOptions(message)
        const msg: Message = {
          id: nextId(), role: 'assistant', content: parsed.content,
          options: parsed.options.length > 0 ? parsed.options : undefined,
          optionMode: parsed.options.length > 0 ? parsed.optionMode : undefined,
          timestamp: Date.now(),
        }
        setState(prev => ({ ...prev, sessionId, round: 1, messages: [msg] }))
        return sessionId
      } catch (e) {
        const err = e instanceof Error ? e.message : '未知错误'
        setState(prev => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${err}`, timestamp: Date.now() }] }))
        throw e
      }
    })()
    pendingInit.current = promise
    promise.finally(() => { pendingInit.current = null })
    return promise
  }, [])

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId
    return initSession()
  }, [state.sessionId, initSession])

  const handleFileUpload = useCallback(async (file: File) => {
    const sid = await ensureSession()
    if (!sid) return
    try {
      const result = await uploadFile(sid, file)
      setUploadedFiles(prev => [...prev, result])
      pendingAttachments.current.push(result.url)
    } catch (e) {
      const err = e instanceof Error ? e.message : '上传失败'
      setState(prev => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `文件上传失败: ${err}`, timestamp: Date.now() }] }))
    }
  }, [ensureSession])

  const computeStep = useCallback((ctx: Record<string, unknown>, status: string, files: UploadedFile[]): number => {
    if (status === 'submitted') return 3
    const intent = (ctx.intent as Record<string, unknown>) || {}
    const filled = [
      !!intent.taskType,
      !!((ctx.platforms as string[])?.length),
      files.length > 0 || !!intent.hasImage || intent.taskType === 'text-to-video',
      !!intent.script,
    ].filter(Boolean).length
    return filled >= 3 ? 2 : 1
  }, [])

  const sendUserMessage = useCallback(async (content: string) => {
    const sid = await ensureSession()
    if (!sid || state.isStreaming) return

    const attachments = [...pendingAttachments.current]
    pendingAttachments.current = []

    if (/^(确认生成|开始制作|提交|确认并生成视频)/.test(content.trim())) {
      setState(prev => ({ ...prev, status: 'submitted' }))
      try {
        const result = await submitTask(sid, null, null)
        setTaskId(result.taskId)
      } catch (e) {
        const err = e instanceof Error ? e.message : '提交失败'
        setState(prev => ({ ...prev, status: 'chatting', messages: [...prev.messages, { id: nextId(), role: 'system', content: `提交失败: ${err}`, timestamp: Date.now() }] }))
      }
      return
    }

    const userMsg: Message = { id: nextId(), role: 'user', content, timestamp: Date.now() }
    setState(prev => ({ ...prev, isStreaming: true, messages: [...prev.messages, userMsg] }))
    setStreamingText('')

    sse.connect(sid, content, attachments, {
      onChunk: (text) => { setStreamingText(prev => prev + text) },
      onDone: (info) => {
        setStreamingText(prev => {
          const parsed = parseOptions(prev || '')
          const ctx = (info.context || {}) as Record<string, unknown>
          setContext(ctx)
          const msg: Message = {
            id: nextId(), role: 'assistant', content: parsed.content,
            options: parsed.options.length > 0 ? parsed.options : undefined,
            optionMode: parsed.options.length > 0 ? parsed.optionMode : undefined,
            timestamp: Date.now(),
          }
          setState(s => ({ ...s, isStreaming: false, round: info.round, messages: [...s.messages, msg] }))
          return ''
        })
      },
      onError: (err) => {
        setState(s => ({ ...s, isStreaming: false, messages: [...s.messages, { id: nextId(), role: 'system', content: `错误: ${err}`, timestamp: Date.now() }] }))
        setStreamingText('')
      },
    })
  }, [state, sse, ensureSession])

  const step = computeStep(context, state.status, uploadedFiles)

  return { step, state, streamingText, uploadedFiles, context, taskId, initSession, ensureSession, sendUserMessage, handleFileUpload }
}
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/hooks/useSession.ts
git commit -m "refactor(useSession): remove phase state machine, add confirm trigger word detection"
```

---

## Phase 6: App.tsx 简化 + 删除废弃组件 + 样式

### Task 13: App.tsx 简化 + 删除 9 个废弃组件

**Files:**
- Modify: `creator-frontend/src/App.tsx`
- Delete: 9 files

- [ ] **Step 1: 重写 App.tsx**

```tsx
import { useSession } from './hooks/useSession'
import { ChatView } from './components/ChatView'
import { ChatBar } from './components/ChatBar'

export default function App() {
  const { step, state, streamingText, uploadedFiles, context, taskId, initSession, sendUserMessage, handleFileUpload } = useSession()

  return (
    <div className="creator-app">
      <ChatBar onSend={sendUserMessage} onExpand={() => {}} isStreaming={state.isStreaming} />
      <ChatView
        step={step} messages={state.messages} streamingText={streamingText}
        isStreaming={state.isStreaming} uploadedFiles={uploadedFiles}
        context={context} taskId={taskId}
        onSend={sendUserMessage} onUpload={handleFileUpload}
        onNewTask={() => { initSession() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: 删除废弃文件**

```bash
git rm creator-frontend/src/components/ChatDialog.tsx
git rm creator-frontend/src/components/ConfirmView.tsx
git rm creator-frontend/src/components/ResultView.tsx
git rm creator-frontend/src/components/RoundIndicator.tsx
git rm creator-frontend/src/components/AgentFab.tsx
git rm creator-frontend/src/components/AgentPanel.tsx
git rm creator-frontend/src/components/ChatHeader.tsx
git rm creator-frontend/src/components/ChatPreview.tsx
git rm creator-frontend/src/components/SchedulePicker.tsx
```

- [ ] **Step 3: tsc 检查**

```bash
cd creator-frontend; npx tsc --noEmit
```
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add creator-frontend/src/App.tsx
git commit -m "refactor: simplify App, remove 9 deprecated components"
```

---

### Task 14: 更新 chat.css 样式

**Files:**
- Modify: `creator-frontend/src/styles/chat.css`

**备注:** 在现有 chat.css 基础上追加以下新样式块，不做大规模重写：

```css
/* 预览面板 */
.preview-panel { background: var(--bg-card); border-radius: var(--radius-md); margin: 0 16px 8px; overflow: hidden; }
.preview-panel.collapsed { padding: 10px 14px; font-size: var(--font-sm); color: var(--text-secondary); cursor: pointer; }
.preview-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; font-size: var(--font-sm); color: var(--text-secondary); cursor: pointer; border-bottom: 1px solid var(--bg-secondary); }
.preview-panel-toggle { font-size: 10px; }
.preview-panel-empty { padding: 20px 14px; text-align: center; font-size: var(--font-sm); color: var(--text-muted); }
.preview-panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 14px; }

/* 预览槽位 */
.preview-slot { background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 10px; position: relative; }
.preview-slot.empty { border: 1px dashed var(--bg-input); }
.preview-slot.filled { border: 1px solid var(--bg-card); }
.preview-slot-icon { font-size: 14px; margin-right: 4px; }
.preview-slot-label { font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px; }
.preview-slot-value { font-size: var(--font-sm); color: var(--text-primary); }
.preview-slot-check { position: absolute; top: 6px; right: 8px; font-size: 12px; color: var(--success); }

/* 缺失提示 */
.missing-hint { padding: 8px 14px 10px; font-size: var(--font-sm); color: var(--warning); }

/* 步骤指示器 */
.step-indicator { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 0; flex-shrink: 0; }
.step-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bg-card); transition: background 0.3s; }
.step-dot.active { background: var(--accent); box-shadow: 0 0 6px var(--accent-light); }
.step-dot.done { background: var(--success); }
.step-label { font-size: var(--font-sm); color: var(--text-secondary); margin-left: 6px; }

/* 进度卡片 */
.progress-card { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; gap: 16px; text-align: center; }
.progress-card-icon { font-size: 56px; }
.progress-card-title { font-size: var(--font-lg); font-weight: 600; }
.progress-card-info { font-size: var(--font-sm); color: var(--text-secondary); line-height: 1.6; }
.progress-card-error { font-size: var(--font-sm); color: var(--error); background: rgba(239,68,68,0.1); padding: 8px 14px; border-radius: var(--radius-sm); }
.progress-card-link { color: var(--accent-light); text-decoration: none; font-size: var(--font-md); }
.progress-card-btn { margin-top: 8px; padding: 14px 32px; border-radius: var(--radius-md); background: var(--accent-gradient); color: #fff; font-size: var(--font-md); border: none; cursor: pointer; font-weight: 500; }

/* 快捷选项增强 */
.quick-option.selected { background: rgba(99,102,241,0.15); border-color: var(--accent); color: var(--accent); }
.quick-option.confirm { background: var(--accent-gradient); color: #fff; border: none; }

/* 聊天视图 */
.chat-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
```

- [ ] **Step 2: Commit**

```bash
git add creator-frontend/src/styles/chat.css
git commit -m "style: add preview panel, step indicator, progress card styles"
```

---

## Phase 7: 最终验证

### Task 15: 全量语法 + 类型检查

- [ ] **Step 1: 检查所有引用**

```bash
cd creator-frontend; npx tsc --noEmit
```
Expected: exit 0, 0 errors

- [ ] **Step 2: 后端语法检查**

```bash
cd creator-api; node --check server.js
cd creator-api; node --check services/ai-proxy.js
cd creator-api; node --check services/session-manager.js
cd creator-api; node --check routes/messages.js
```
Expected: all exit 0

- [ ] **Step 3: 运行测试**

```bash
cd creator-api; npx vitest run
```

- [ ] **Step 4: Vite 构建**

```bash
cd creator-frontend; npm run build
```
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

## 完成标准

- [ ] `npx tsc --noEmit` exit 0
- [ ] 所有 `node --check` exit 0
- [ ] `npm run build` exit 0
- [ ] 已删除的 9 个组件无残留引用
- [ ] PreviewPanel 4 个槽位正确渲染
- [ ] QuickOptions 单选/多选模式正常
- [ ] StepIndicator 随数据完整度自动切换
- [ ] ProgressCard 正确轮询任务状态
- [ ] 确认触发词 `确认生成|开始制作|提交` 正确触发提交
