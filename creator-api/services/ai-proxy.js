import { TASK_TYPE_IDS, taskTypeInfo, platformLabel } from '../../shared/generation-config.js'

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
      phaseGuide = '当前阶段：了解用户想生成什么。先问用户想做什么类型的视频/图片。'
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

      if (content === '上传图片') { ctx.intent.hasImage = true }
      else if (content === '上传视频') { ctx.intent.hasVideo = true }
      else if (content === '没有素材，纯文案生成') { ctx.intent.hasImage = false; ctx.intent.hasVideo = false }
      else {
        const durationMatch = content.match(/^(\d+)秒$/)
        if (durationMatch) { ctx.intent.preferredDuration = parseInt(durationMatch[1]) }
        else if (content.match(/^\d+p$/i)) { ctx.intent.preferredQuality = content }
        else if (content === 'AI帮我写文案' || content === '我自己写文案') { /* no-op, just acknowledge */ }
        else if (content.length > 3 && !ctx.intent.script) { ctx.intent.script = content }
      }

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
