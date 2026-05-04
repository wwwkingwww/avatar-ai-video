# Agent 对话框重新设计 — 单栏移动端 + 预览面板

> 日期：2026-05-03
> 项目：avatar-ai-video
> 阶段：UX 升级 — 对齐 RunningHub Agent 模式
> 参照：RunningHub Agent 模式的交互范式
> 依赖：现有 creator-frontend (React + shadcn/ui) + creator-api (DeepSeek + RH)

---

## 1. 目标

将现有创作者对话框从「纯文字对话」升级为「对话 + 实时预览 + 快捷操作」的移动端优先体验。核心改动：

- **单栏中央布局**：最大宽度 520px，居中，自动适配手机屏幕
- **上方预览面板**：替代 Canvas，用信息摘要卡片展示当前收集到的创作参数
- **RunningHub 风格配色**：深蓝黑底色 + 紫蓝渐变
- **无轮次上限，智能速决**：不硬限制对话轮数，但 LLM 通过精准预判 + 自动补全默认值，在 ≤4 步内完成信息收集

### 1.1 核心体验

```
用户进入页面 → 对话描述需求（AI 引导 + 快捷按钮选择）
→ 每选一项，预览区实时更新
→ LLM 自动推理默认值，只追问关键缺失
→ 信息足够 → AI 主动提议确认 → 提交生成 → 轮询进度
```

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **对话即表单** | 保留现有设计理念，不引入传统表单 |
| **所见即所得** | 每收集一个参数，预览面板对应区域亮起 |
| **按钮优先** | AI 回复中的可选操作用药丸按钮渲染，减少文字输入 |
| **移动端优先** | 单栏居中，max-width 520px，底部输入栏固定 |
| **无上限，速收敛** | 不设轮次硬限制（取消 forceConfirm），LLM 通过预判默认值 + 只追问关键信息，目标 ≤4 轮即提议确认 |
| **渐进增强** | 只改前端 UX 层，后端 API 不变 |

---

## 2. 整体布局

```
┌──────────────────────────────────┐
│          max-width: 520px        │
│          margin: 0 auto          │
│                                  │
│  ┌────────────────────────────┐  │
│  │     PreviewPanel           │  │  ← 预览面板（可折叠）
│  │  模板 · 平台 · 素材 · 文案  │  │     高度约 30vh，内容不足时自动收缩
│  └────────────────────────────┘  │
│                                  │
│  ● ● ● ○  第 2/3 步              │  ← 步骤指示器（3 步）
│                                  │
│  ┌────────────────────────────┐  │
│  │ AI  你想做什么类型的视频？  │  │  ← 消息气泡（左对齐，#1a1a32）
│  └────────────────────────────┘  │
│                                  │
│  [🎤 口播] [🔬 评测] [📦 展示]   │  ← 药丸按钮（#1a1a32 + #2a2a44 边框）
│                                  │
│  ┌────────────────────────────┐  │
│  │            👤 评测         │  │  ← 用户气泡（右对齐，#6366f1）
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ AI  好的，发布到哪些平台？  │  │
│  └────────────────────────────┘  │
│                                  │
│  [✓ 抖音] [✓ 快手] [  小红书 ]   │  ← 多选模式，选中态 border=#6366f1
│        [确认选择]                │  ← 多选确认按钮
│                                  │
├──────────────────────────────────┤
│ 📎  [ 输入你的需求...       ]  ➤│  ← 底部输入栏（sticky）
└──────────────────────────────────┘
```

### 2.1 响应式规则

| 屏幕宽度 | 行为 |
|---------|------|
| < 520px | 占满屏幕宽度，padding: 0 8px |
| 520px - 768px | 居中，max-width: 520px |
| > 768px | 居中，max-width: 520px，预览面板可展开到 40vh |

---

## 3. 预览面板（PreviewPanel）

不渲染真实 Canvas，用一个信息摘要卡片展示当前收集的创作参数。

### 3.1 面板结构

```
┌──────────────────────────────────┐
│  🎬 视频创作预览                  │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │ 模板      │  │ 平台      │     │  ← 两个信息槽位（一行两个）
│  │ 🎤 口播   │  │ 抖音 ✓    │     │
│  │          │  │ 快手 ✓    │     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │ 素材      │  │ 文案      │     │
│  │ 📷 2个文件 │  │ "新品上市…"│     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ⏳ 还差：平台选择、文案            │  ← 缺失提示（仅当有缺失时显示）
│                                  │
│  [展开全部 ▼]                     │  ← 展开完整文案 / 素材列表
└──────────────────────────────────┘
```

### 3.2 槽位状态

每个信息槽位有 4 种视觉状态：

| 状态 | 样式 | 说明 |
|------|------|------|
| **empty** | 灰色虚线边框，文字"选择模板" | 尚未填写 |
| **pending** | 实线边框 + 半透明背景 | 刚刚选择，等待确认 |
| **filled** | 实线边框 + ✓ 绿色角标 | 已确认 |
| **error** | 红色边框 | 必填但缺失（提交时） |

### 3.3 面板折叠

- 默认展开
- 用户可点击标题栏折叠（只保留一行摘要）
- 折叠态显示「🎬 口播 · 抖音 ｜ ⏳ 2/4」
- 新建对话时无内容，折叠态隐藏整个面板，展开态显示引导文字

### 3.4 槽位定义

| 槽位 | 数据来源 | 何时更新 |
|------|---------|---------|
| 模板 | `ctx.intent.taskType` → 模板标签 | INTENT 阶段选择后 |
| 平台 | `ctx.platforms[]` | PARAMS 阶段多选确认后 |
| 素材 | `session.files[]` | 上传完成后 |
| 文案 | `ctx.intent.script` | 用户输入或 AI 生成后 |
| 模型 | `ctx.selectedModel.endpoint` | RECOMMEND 阶段确认后（可选显示） |

---

## 4. 配色方案

参考 RunningHub 实际配色，统一替换现有 CSS 变量。

### 4.1 色板

| 令牌 | 新值 | 旧值（参考） | 用途 |
|------|------|-------------|------|
| `--background` | `#0f0f1a` | `--` | 页面底色 |
| `--card` | `#12122a` | `--` | 卡片/面板底色 |
| `--bubble-ai` | `#1a1a32` | `#2d2d44` | AI 消息气泡 |
| `--bubble-user` | `#6366f1` | `#6366f1` | 用户消息气泡（不变） |
| `--input-bg` | `#1e1e35` | `--` | 输入框背景 |
| `--border` | `#2a2a44` | `--` | 卡片/输入框/选项边框 |
| `--border-hover` | `#444` | `--` | 边框 hover |
| `--primary` | `#6366f1` | `--` | 品牌主色 |
| `--primary-gradient` | `#6366f1 → #8b5cf6` | `--` | 渐变按钮 |
| `--text-primary` | `#e0e0e0` | `--` | 正文 |
| `--text-secondary` | `#888` | `--` | 辅助文字 |
| `--text-muted` | `#555` | `--` | 占位符/禁用文字 |
| `--success` | `#4ade80` | `--` | 完成标记 |
| `--warning` | `#f59e0b` | `--` | 缺失提示 |
| `--danger` | `#ef4444` | `--` | 错误/必填缺失 |
| `--radius-sm` | `6px` | `8px` | 小圆角（标签/选项） |
| `--radius-md` | `10px` | `12px` | 中圆角（气泡/输入框） |
| `--radius-lg` | `14px` | `16px` | 大圆角（卡片/面板） |

### 4.2 字体

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--font-sm` | `12px` | 辅助文字、标签 |
| `--font-md` | `14px` | 正文、气泡内容 |
| `--font-lg` | `16px` | 标题 |
| `--font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | 全局字体 |

---

## 5. 快捷选项设计（核心交互）

### 5.1 三种选项模式

| 模式 | 触发场景 | 交互 |
|------|---------|------|
| **单选** | 模板类型、视频风格、时长 | 点击一项，自动发送该文本，其他取消高亮 |
| **多选** | 目标平台、标签 | 点击切换选中态，需手动点「确认选择」发送 |
| **展开输入** | 文案、自定义参数 | 点击后在选项下方展开 mini 输入区 |

### 5.2 药丸按钮样式

```
默认态:  bg=#1a1a32  border=#2a2a44  text=#888  radius=20px
hover:   border=#6366f1  text=#e0e0e0
选中态:  bg=#6366f1/15  border=#6366f1  text=#6366f1  微光动画
```

单选组用等宽排列，多选组可换行。

### 5.3 选项数据流

与现有 `QuickOptions` / `parseOptions.ts` 兼容：

```typescript
// AI 回复中携带 options 字段（现有 Message 类型不变）
interface Message {
  role: 'user' | 'assistant'
  content: string
  options?: string[]          // 选项文本列表
  optionMode?: 'single' | 'multi'  // 新增，后端 [OPTIONS:single/multi:...] 标记
  // 注：expand 模式为前端行为——当选项文本匹配「AI 帮我写文案」等特殊值时，
  // QuickOptions 自动展开 inline 输入区，无需后端标记
}
```

`optionMode` 由后端 `ai-proxy.js` 在回复中通过标记注入。前端解析后决定交互模式。

---

## 6. 流程精简：4 阶段 → 智能收敛

### 6.1 核心策略：预判 + 只追问关键缺失

LLM 不再逐项询问所有参数，而是：

```
用户：「帮我做个介绍新耳机的视频发抖音」

LLM 自动推理：
  模板 → 产品展示（从"介绍xx"推断）
  平台 → 抖音（用户已明确）
  风格 → 快节奏（新品推广默认）
  素材 → 未提供，追问一句即可
  文案 → 可让 AI 代写（新品推荐默认模式）
  标签 → #新品 #耳机 #科技（自动生成）

→ 只追问 1 个关键缺失：「有产品图片吗？」
→ 用户回答后立即提议确认
→ 全程 ≤3 轮
```

**关键规则：**
- LLM 能从语义推断的参数一律自动填充默认值（不追问）
- 只在用户模糊表达时才追问（「随便」「都行」→ 推荐最佳默认值）
- 强制追问的只有：**素材文件**（用户不一定上传）、**模糊意图需要消歧**（如用户同时提了多个方向）
- 每轮回复都直接给出确认提议选项「✓ 确认并生成视频」，不等到固定轮数

### 6.2 轮次行为对比

| 旧策略 | 新策略 |
|--------|--------|
| 第 4 轮 forceConfirm 强制弹确认页 | **不设上限**，AI 判断信息足够即主动提议确认 |
| 逐阶段追问：类型→素材→时长→风格 | **一次尽力收集**：从首条消息提取所有可推断信息 |
| 阶段状态机（INTENT→PARAMS→RECOMMEND→CONFIRM） | **单一对话流**，只有 chatting / submitted 两种状态 |
| 用户不能跳过确认 | 用户可在任意时刻说「确认生成」直接提交 |

### 6.3 用户主动提交

用户随时可以说「确认生成」「开始制作」「提交」等触发词，`useSession.ts` 检测到后跳过剩余收集直接提交。缺省参数由后端 `generation-worker.js` 的 `buildV2Payload()` 填默认值。

### 6.4 步骤指示器（StepIndicator）

虽然无硬限制，但 StepIndicator 提供视觉进度：

| 步骤 | 含义 | 触发条件 |
|------|------|---------|
| 1 | 开始对话 | 会话创建后 |
| 2 | 信息基本齐全 | 预览面板 ≥3/5 槽位 filled |
| 3 | 已提交 | status === 'submitted' |

步骤 2→3 由用户确认或 AI 提议触发，不自动跳转。

---

## 7. 组件树

```
<App>
  └─ <ChatView>                          // 主视图（重写）
       ├─ <PreviewPanel>                 // 新增：顶部预览面板
       │    ├─ <PreviewSlot /> × 4       // 新增：单个信息槽位
       │    └─ <MissingHint />           // 新增：缺失项提示
       ├─ <StepIndicator />              // 替代 RoundIndicator，3 步
       ├─ <MessageList>                  // 保留：消息列表
       │    ├─ <Bubble />                // 改样式：药丸按钮 + 渐变用户气泡
       │    └─ <QuickOptions />          // 改样式：支持三种模式
       └─ <InputArea>                    // 保留：底部输入栏
            └─ <FileUploader />          // 保留
```

### 7.1 废弃的组件

| 组件 | 原因 | 处理 |
|------|------|------|
| `ChatDialog.tsx` | 弹窗模式被单页模式替代 | 删除 |
| `ChatBar.tsx` | 快速创建入口保留但不在此次改动范围 | 保留不动 |
| `ConfirmView.tsx` | 确认逻辑融入 PreviewPanel + 对话流 | 删除 |
| `ResultView.tsx` | 结果展示改为聊天流内嵌 ProgressCard | 删除 |
| `RoundIndicator.tsx` | 被 StepIndicator 替代 | 删除 |
| `AgentFab.tsx` | 浮动按钮不再需要 | 删除 |
| `AgentPanel.tsx` | 模板/平台选择融入对话流 | 删除 |
| `ChatHeader.tsx` | 顶部导航简化 | 删除 |
| `ChatPreview.tsx` | 被 PreviewPanel 替代 | 删除 |

---

## 8. 文件改动清单

### 8.1 新增文件

```
creator-frontend/src/components/
├── PreviewPanel.tsx          # 预览面板容器
├── PreviewSlot.tsx           # 单个信息槽位
├── MissingHint.tsx           # 缺失项提示条
├── StepIndicator.tsx         # 3 步进度指示器
└── ProgressCard.tsx          # 生成进度卡片（替代 ResultView）
```

### 8.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/ChatView.tsx` | 重写：顶部加 PreviewPanel + StepIndicator，移除旧 ConfirmView/ResultView 跳转逻辑 |
| `src/components/Bubble.tsx` | 改样式：药丸选项、渐变用户气泡、流式光标 |
| `src/components/QuickOptions.tsx` | 改样式 + 新增 `mode` 属性支持单选/多选/展开 |
| `src/components/MessageList.tsx` | 微调：适配新气泡样式 |
| `src/components/InputArea.tsx` | 微调：配色对齐 |
| `src/components/FileUploader.tsx` | 微调：配色对齐 |
| `src/App.tsx` | 简化：移除 Dialog/ConfirmView/ResultView/AgentFab/AgentPanel 相关逻辑 |
| `src/hooks/useSession.ts` | 简化：移除阶段状态机跳转，新增 `step` 字段，新增 `modifyParam` 方法 |
| `src/services/api.ts` | 不变（无需改动） |
| `src/services/parseOptions.ts` | 改：支持 `optionMode` 解析 |
| `src/types.ts` | 改：Message 新增 `optionMode` 字段，SessionState 简化 |
| `src/styles/variables.css` | 改：色板替换为 RunningHub 风格 |
| `src/styles/chat.css` | 改：全部样式对齐新色板 + 新增预览面板样式 |

### 8.3 删除文件

```
creator-frontend/src/components/
├── ChatDialog.tsx
├── ConfirmView.tsx
├── ResultView.tsx
├── RoundIndicator.tsx
├── AgentFab.tsx
├── AgentPanel.tsx
├── ChatHeader.tsx
├── ChatPreview.tsx
└── SchedulePicker.tsx  (功能可后续在 ProgressCard 中恢复)
```

### 8.4 不动文件

| 文件 | 原因 |
|------|------|
| `ChatBar.tsx` | 快速入口保留 |
| `src/services/api.ts` | API 不变 |
| `creator-api/` 所有文件 | 后端不变 |
| `shared/generation-config.js` | 配置不变 |
| `src/services/videoConfig.ts` | 不变 |
| `src/lib/utils.ts` | 不变 |

---

## 9. 后端适配（最小改动）

### 9.1 ai-proxy.js 改动：预判式系统提示词

重写 `buildSystemPrompt()`，核心转变：从「逐项询问」变为「一次尽力收集 + 只追问关键缺失」。

```javascript
// ai-proxy.js buildSystemPrompt() 新规则：

`你是 AI 视频创作助手。你的目标是**在尽可能少的轮数内完成需求收集**。

## 自动推理规则
从用户的第一条消息就开始推理所有可推断参数：
- 提到「介绍」「展示」→ 模板=产品展示
- 提到「评测」「对比」→ 模板=科技评测
- 提到「vlog」「日常」→ 模板=Vlog
- 提到具体平台名 → 平台=该平台
- 新品/发布类 → 风格=快节奏、标签自动生成
- 没有素材 → 默认「纯文案生成」
- 没有指定时长 → 默认 15s
- 没有指定文案 → 标记为「AI 代写」

**不追问默认值**，直接采用并在回复中告知用户。

## 只追问关键缺失
- 唯一强制追问的场景：用户上传了图片/视频 → 确认素材用途
- 用户模糊表达（「随便」「都行」）→ 推荐 1 个最佳默认值
- 用户同时提了多个矛盾方向 → 追问消歧

## 每轮必含确认提议
每轮回复的 options 中必须包含「✓ 确认并生成视频」
用户说「确认生成」「开始制作」「提交」→ 立即进入确认
**不要等到固定轮数才提议确认**，信息足够就立刻提议。

## 选项标记
使用 [OPTIONS:single:选项1,选项2] 或 [OPTIONS:multi:选项1,选项2]
平台选择用 multi，其他用 single。每轮必须带 options。`
```

### 9.2 轮次中间件变更

`round-guard.js` 中移除 `MAX_ROUNDS` 常量与 `forceConfirm` 逻辑：

```javascript
// 删除：
const MAX_ROUNDS = 4

// incrementRound() 中删除：
forceConfirm = newRound >= MAX_ROUNDS

// session-manager.js 中删除 forceConfirm 字段初始化
```

### 9.3 前端 parseOptions.ts 改动

```typescript
export function parseOptions(text: string): { content: string; options: string[]; optionMode: 'single' | 'multi' } {
  const match = text.match(/\[OPTIONS:(single|multi):(.+?)\]/)
  if (match) {
    return {
      content: text.replace(match[0], '').trim(),
      options: match[2].split(',').map(s => s.trim()),
      optionMode: match[1] as 'single' | 'multi',
    }
  }
  return { content: text, options: [], optionMode: 'single' }
}
```

### 9.4 会话步骤映射

`session.context` Redis key 结构不变。`useSession.ts` 中 step 改为按数据完整度计算：

```typescript
// useSession.ts
const filledSlots = [
  ctx.intent?.taskType,
  ctx.platforms?.length > 0,
  session.files?.length > 0 || ctx.intent?.hasImage || !ctx.intent?.hasVideo,  // 素材或明确不需要
  ctx.intent?.script,
].filter(Boolean).length

const step = status === 'submitted' ? 3 : filledSlots >= 3 ? 2 : 1
```

| step | 含义 | 触发条件 |
|------|------|---------|
| 1 | 开始对话 | 会话创建后，filledSlots < 3 |
| 2 | 信息基本齐全 | filledSlots ≥ 3（≥3/4 必须槽位 filled） |
| 3 | 已提交 | status === 'submitted' |

**无 forceConfirm**：不再由轮数驱动确认，改为 LLM 主动提议 + 用户主动触发。

---

## 10. 验证方案

| 阶段 | 验证项 | 方法 | 成功标准 |
|------|--------|------|---------|
| 语法 | 所有 .tsx/.ts 通过 tsc | `npx tsc --noEmit` | exit 0, 0 错误 |
| 样式 | 移动端布局正常 | Chrome DevTools 模拟 iPhone 14 | 单栏居中，无横向滚动 |
| 预览面板 | 槽位状态切换正确 | 走一遍完整对话 | 4 个槽位依次从 empty → filled |
| 选项模式 | 三种模式交互正常 | 单选点一次发送、多选点确认发送 | 消息正确追加到列表 |
| 步骤流转 | 3 步正确切换 | 对话到第 3 轮 → 确认 → 提交 | StepIndicator 正确高亮 |
| 配色 | 暗色主题一致 | 肉眼对比 design-v1.html | 无色差 |
| 已删除组件 | 无引用残留 | `grep -rn "ChatDialog\|ConfirmView\|ResultView\|AgentFab\|AgentPanel" src/` | 0 结果 |
| 构建 | vite build 成功 | `npm run build` | exit 0 |

---

## 11. 不在范围内

| 内容 | 原因 |
|------|------|
| ChatBar 改造 | 快速入口逻辑不变，仅配色自动对齐 |
| 后端 API 变更 | 只改前端 UX，后端兼容现有接口 |
| 用户登录系统 | Phase 2 |
| 多任务并发 | Phase 2 |
| 视频播放器嵌入 | ProgressCard 只显示链接，点击跳转 |
| Flutter App | Phase 2 |

---

## 12. 已知风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 删除组件后 App.tsx 引用断开 | 构建失败 | 先全局 grep 引用，再逐个删除 |
| 预览面板与后端数据不同步 | 显示过期信息 | 每次消息往返后刷新 PreviewPanel |
| 选项模式标记解析异常 | 选项不显示 | 降级为纯文本显示（不崩溃） |
| 移动端文件上传体验差 | 用户流失 | 保留现有 FileUploader 缩略图逻辑 |
