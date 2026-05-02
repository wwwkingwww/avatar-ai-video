import { TASK_TYPE_IDS, taskTypeInfo } from './videoConfig'

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
