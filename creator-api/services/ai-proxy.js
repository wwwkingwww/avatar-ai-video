import { TASK_TYPE_IDS, taskTypeInfo, platformLabel } from '../../shared/generation-config.js'
import { PipelineRecommender } from './pipeline-recommender.js'

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || 'https://api.deepseek.com'
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || ''

let _smartRouter = null
let _pipelineRecommender = null

export function setSmartRouter(router) {
  _smartRouter = router
  _pipelineRecommender = new PipelineRecommender(router)
}

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

  let modelRecommendation = ''
  let pipelineRecommendation = ''
  if (_smartRouter && session.history?.length > 0) {
    try {
      const userText = session.history.map(m => m.content || '').join(' ')
      const smartResult = _smartRouter.smartRecommend(userText, ctx.intent || {})
      if (smartResult.recommendations.length > 0) {
        const lines = smartResult.recommendations.map(r =>
          `${r.rank}. ${r.nameCn || r.name} — ${r.whyRecommended}`
        )
        modelRecommendation = `\n## 推荐模型（按匹配度排序）\n${lines.join('\n')}`
      }

      if (_pipelineRecommender) {
        const pipelines = _pipelineRecommender.recommendPipeline(userText, ctx.intent || {})
        if (pipelines.length > 0) {
          const pLines = pipelines.slice(0, 2).map(p =>
            `• ${p.label}：${p.steps.map(s => s.step).join(' → ')}（约${p.estimatedCost}）`
          )
          pipelineRecommendation = `\n## 推荐管线\n${pLines.join('\n')}`
        }
      }
    } catch {
      // smart recommend failure is non-critical
    }
  }

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
4. 信息足够时，「✓ 确认并生成视频」放第一位${modelRecommendation}${pipelineRecommendation}`
}

function createMockStream(content) {
  const encoder = new TextEncoder()
  let index = 0
  const chunkSize = 16

  return new ReadableStream({
    start(controller) {
      function push() {
        if (index >= content.length) {
          controller.close()
          return
        }
        const chunk = content.slice(index, index + chunkSize)
        index += chunkSize
        const data = { choices: [{ delta: { content: chunk } }] }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        setTimeout(push, 10)
      }
      push()
    }
  })
}

function buildMockResponse(session, history) {
  const ctx = session.context || {}
  const intent = ctx.intent || {}
  const round = session.round || 1
  const userMsg = history[history.length - 1]?.content || ''

  const collected = []
  if (intent.taskType) collected.push(`✅ 类型: ${intent.taskType}`)
  if (ctx.platforms?.length) collected.push(`✅ 平台: ${ctx.platforms.join('、')}`)
  if (intent.hasImage) collected.push('✅ 已有图片素材')
  if (intent.hasVideo) collected.push('✅ 已有视频素材')
  if (intent.script) collected.push(`✅ 文案: ${intent.script.substring(0, 20)}...`)
  if ((session.files || []).length > 0) collected.push(`✅ 素材: ${session.files.length}个文件`)

  const missing = []
  if (!intent.taskType) missing.push('模板类型')
  if (!ctx.platforms?.length) missing.push('发布平台')
  if (!intent.script && !userMsg.match(/口播|文案|脚本|内容/)) missing.push('视频文案')

  let response = ''

  if (userMsg.includes('确认') || userMsg.includes('生成') || userMsg.includes('提交')) {
    response = `好的，已收到您的确认！正在为您生成视频...\n\n${collected.length > 0 ? collected.join('\n') : ''}\n\n[MOCK MODE] 当前为模拟模式，视频不会真正生成。如需真实生成，请配置 DEEPSEEK_KEY。`
  } else if (missing.length === 0) {
    response = `信息已收集完整！\n\n${collected.join('\n')}\n\n一切就绪，点击「✓ 确认并生成视频」开始制作吧！\n\n[OPTIONS:single:✓ 确认并生成视频,修改文案,更换平台]`
  } else if (!intent.taskType) {
    response = `欢迎创作视频！请选择一个模板类型开始。\n\n[OPTIONS:single:口播带货,产品展示,科技评测,Vlog日常]`
  } else if (!ctx.platforms?.length) {
    response = `已选择「${intent.taskType}」模板。请选择发布平台。\n\n${collected.join('\n') || '暂无已确认信息'}\n\n[OPTIONS:multi:抖音,快手,小红书,B站]`
  } else if (!intent.script) {
    response = `已选择「${intent.taskType}」模板，平台：${ctx.platforms.join('、')}。\n\n请提供视频文案，或让我帮您生成：\n\n${collected.join('\n')}\n\n[OPTIONS:single:帮我写一段口播文案,我自己输入文案,✓ 确认并生成视频]`
  } else {
    response = `收到！让我确认一下您的需求：\n\n${collected.join('\n')}\n\n还需要补充什么吗？\n\n[OPTIONS:single:✓ 确认并生成视频,修改文案,更换平台]`
  }

  return response
}

export async function sendToAI(history, session) {
  if (!DEEPSEEK_KEY || DEEPSEEK_KEY === 'your-deepseek-api-key-here') {
    console.warn('[MOCK MODE] DEEPSEEK_KEY 未配置，使用模拟响应。请在 .env 中设置真实的 API Key。')
    const mockContent = buildMockResponse(session, history)
    return createMockStream(mockContent)
  }

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
    if (response.status === 401) {
      throw new Error('DeepSeek API Key 无效（401）。请检查 creator-api/.env 中的 DEEPSEEK_KEY 是否正确')
    }
    throw new Error(`DeepSeek 返回错误: HTTP ${response.status} - ${text.substring(0, 200)}`)
  }

  return response.body
}
