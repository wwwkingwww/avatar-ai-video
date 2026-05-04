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
