import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../services/ai-proxy.js'

function makeSession(overrides = {}) {
  return {
    id: 'test-session-id',
    round: 0,
    context: {},
    files: [],
    messages: [],
    ...overrides,
  }
}

describe('ai-proxy', () => {
  describe('buildSystemPrompt', () => {
    it('shows round counter', () => {
      const s = makeSession({ round: 0 })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('第1轮对话')
    })

    it('shows round 3 correctly', () => {
      const s = makeSession({ round: 2 })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('第3轮对话')
    })

    it('includes auto-inference rules', () => {
      const prompt = buildSystemPrompt(makeSession())
      expect(prompt).toContain('自动推理规则')
      expect(prompt).toContain('不追问，直接采用')
    })

    it('shows no collected info when empty', () => {
      const prompt = buildSystemPrompt(makeSession())
      expect(prompt).toContain('已收集信息：无')
    })

    it('shows collected task type', () => {
      const s = makeSession({ context: { intent: { taskType: 'text-to-video' } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('类型: text-to-video')
    })

    it('shows collected platform', () => {
      const s = makeSession({ context: { platforms: ['douyin'] } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('抖音')
    })

    it('shows collected script', () => {
      const s = makeSession({ context: { intent: { script: 'Hello World' } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('文案: Hello World')
    })

    it('shows collected duration', () => {
      const s = makeSession({ context: { intent: { preferredDuration: 10 } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('时长: 10s')
    })

    it('shows uploaded files count', () => {
      const s = makeSession({ files: [{ name: 'test.jpg' }] })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('素材: 1个文件')
    })

    it('shows collected style', () => {
      const s = makeSession({ context: { intent: { style: '快节奏' } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('风格: 快节奏')
    })

    it('includes option mark format instruction', () => {
      const prompt = buildSystemPrompt(makeSession())
      expect(prompt).toContain('[OPTIONS')
      expect(prompt).toContain('multi')
    })

    it('includes confirm option requirement', () => {
      const prompt = buildSystemPrompt(makeSession())
      expect(prompt).toContain('✓ 确认并生成视频')
    })

    it('includes available capabilities', () => {
      const prompt = buildSystemPrompt(makeSession())
      expect(prompt).toContain('文生视频')
      expect(prompt).toContain('图生视频')
      expect(prompt).toContain('文生图')
    })
  })
})
