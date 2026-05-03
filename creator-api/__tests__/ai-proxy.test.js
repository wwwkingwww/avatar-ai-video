import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildSystemPrompt, updateContextFromUser } from '../services/ai-proxy.js'

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

function ctx(base = {}) {
  return { ...base }
}

describe('ai-proxy', () => {
  describe('buildSystemPrompt', () => {
    it('INTENT phase guides user to choose video type', () => {
      const s = makeSession({ context: { phase: 'INTENT' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('了解用户想生成什么')
    })

    it('PARAMS phase guides user to provide materials', () => {
      const s = makeSession({ context: { phase: 'PARAMS' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('收集素材和参数')
    })

    it('RECOMMEND phase shows recommendations', () => {
      const s = makeSession({ context: { phase: 'RECOMMEND' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('展示AI推荐的模型')
    })

    it('CONFIRM phase guides confirmation', () => {
      const s = makeSession({ context: { phase: 'CONFIRM' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('最终确认并提交')
    })

    it('last round (round=3) shows last round hint', () => {
      const s = makeSession({ round: 3, context: { phase: 'INTENT' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('最后一轮')
    })

    it('first round shows round counter', () => {
      const s = makeSession({ round: 0, context: { phase: 'INTENT' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('第1/4轮')
    })

    it('includes platform when set in context', () => {
      const s = makeSession({ context: { phase: 'INTENT', platforms: ['douyin'] } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('抖音')
    })

    it('includes script when set in context', () => {
      const s = makeSession({ context: { phase: 'INTENT', intent: { script: 'Hello World' } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('文案: Hello World')
    })

    it('includes task type when set', () => {
      const s = makeSession({ context: { phase: 'INTENT', intent: { taskType: 'text-to-video' } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('文生视频')
    })

    it('includes duration when set', () => {
      const s = makeSession({ context: { phase: 'INTENT', intent: { preferredDuration: 10 } } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('时长: 10s')
    })

    it('shows uploaded files count', () => {
      const s = makeSession({ files: [{ name: 'test.jpg' }], context: { phase: 'INTENT' } })
      const prompt = buildSystemPrompt(s)
      expect(prompt).toContain('已上传素材')
    })
  })

  describe('updateContextFromUser', () => {
    describe('INTENT phase', () => {
      it('recognizes "文生视频" → text-to-video and advances to PARAMS', () => {
        const result = updateContextFromUser('文生视频', ctx({ phase: 'INTENT' }))
        expect(result.phase).toBe('PARAMS')
        expect(result.intent.taskType).toBe('text-to-video')
      })

      it('recognizes "图生视频" → image-to-video', () => {
        const result = updateContextFromUser('图生视频', ctx({ phase: 'INTENT' }))
        expect(result.phase).toBe('PARAMS')
        expect(result.intent.taskType).toBe('image-to-video')
      })

      it('does not change phase on unmatched text', () => {
        const result = updateContextFromUser('随便聊聊', ctx({ phase: 'INTENT' }))
        expect(result.phase).toBe('INTENT')
        expect(result.intent).toBeUndefined()
      })

      it('preserves existing context keys not being updated', () => {
        const existing = ctx({ phase: 'INTENT', platforms: ['douyin'] })
        const result = updateContextFromUser('文生视频', existing)
        expect(result.platforms).toEqual(['douyin'])
      })
    })

    describe('PARAMS phase', () => {
      it('"上传图片" sets hasImage=true', () => {
        const result = updateContextFromUser('上传图片', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.hasImage).toBe(true)
      })

      it('"上传视频" sets hasVideo=true', () => {
        const result = updateContextFromUser('上传视频', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.hasVideo).toBe(true)
      })

      it('"没有素材，纯文案生成" clears image/video', () => {
        const result = updateContextFromUser('没有素材，纯文案生成', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.hasImage).toBe(false)
        expect(result.intent.hasVideo).toBe(false)
      })

      it('"5秒" sets preferredDuration=5', () => {
        const result = updateContextFromUser('5秒', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.preferredDuration).toBe(5)
      })

      it('"30秒" sets preferredDuration=30', () => {
        const result = updateContextFromUser('30秒', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.preferredDuration).toBe(30)
      })

      it('long text sets script field', () => {
        const result = updateContextFromUser('这是测试文案内容', ctx({ phase: 'PARAMS', intent: {} }))
        expect(result.intent.script).toBe('这是测试文案内容')
      })

      it('advances to RECOMMEND when enough params collected', () => {
        const result = updateContextFromUser('5秒', ctx({ phase: 'PARAMS', intent: { script: '已有文案' } }))
        expect(result.phase).toBe('RECOMMEND')
      })
    })

    describe('RECOMMEND phase', () => {
      it('"确认使用推荐" advances to CONFIRM', () => {
        const result = updateContextFromUser('确认使用推荐', ctx({ phase: 'RECOMMEND' }))
        expect(result.phase).toBe('CONFIRM')
      })

      it('"换一个模型" stays in RECOMMEND and clears recommendations', () => {
        const result = updateContextFromUser('换一个模型', ctx({ phase: 'RECOMMEND', recommendations: [{ id: 1 }] }))
        expect(result.phase).toBe('RECOMMEND')
        expect(result.recommendations).toBeUndefined()
      })
    })

    describe('CONFIRM phase', () => {
      it('"确认并生成视频" preserves phase', () => {
        const result = updateContextFromUser('确认并生成视频', ctx({ phase: 'CONFIRM' }))
        expect(result.phase).toBe('CONFIRM')
      })

      it('"修改参数" goes back to PARAMS', () => {
        const result = updateContextFromUser('修改参数', ctx({ phase: 'CONFIRM' }))
        expect(result.phase).toBe('PARAMS')
      })

      it('unknown text preserves phase', () => {
        const result = updateContextFromUser('其他内容', ctx({ phase: 'CONFIRM' }))
        expect(result.phase).toBe('CONFIRM')
      })
    })

    describe('immutability', () => {
      it('does not mutate original context', () => {
        const original = ctx({ phase: 'INTENT', platforms: ['douyin'] })
        const copy = { ...original, platforms: [...original.platforms] }
        updateContextFromUser('文生视频', original)
        expect(original).toEqual(copy)
      })
    })
  })
})
