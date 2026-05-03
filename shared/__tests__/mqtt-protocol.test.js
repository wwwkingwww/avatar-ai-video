import { describe, it, expect } from 'vitest'
import { TOPICS, TASK_STATUS, ACTION_TYPES, validateTaskPayload, validateStatusPayload } from '../mqtt-protocol.js'

describe('mqtt-protocol', () => {
  describe('TOPICS', () => {
    it('TASK generates correct topic', () => {
      expect(TOPICS.TASK('phone_01')).toBe('phone/phone_01/task')
    })
    it('STATUS generates correct topic', () => {
      expect(TOPICS.STATUS('abc')).toBe('phone/abc/status')
    })
    it('HEARTBEAT generates correct topic', () => {
      expect(TOPICS.HEARTBEAT('x')).toBe('phone/x/heartbeat')
    })
    it('CMD generates correct topic', () => {
      expect(TOPICS.CMD('p1')).toBe('phone/p1/cmd')
    })
  })

  describe('TASK_STATUS', () => {
    it('has 4 status values', () => {
      expect(Object.keys(TASK_STATUS)).toHaveLength(4)
    })
    it('has expected status names', () => {
      expect(TASK_STATUS.DOWNLOADING).toBe('downloading')
      expect(TASK_STATUS.PUBLISHING).toBe('publishing')
      expect(TASK_STATUS.SUCCESS).toBe('success')
      expect(TASK_STATUS.FAILED).toBe('failed')
    })
  })

  describe('ACTION_TYPES', () => {
    it('has 8 action types', () => {
      expect(ACTION_TYPES).toHaveLength(8)
    })
    it('has no duplicates', () => {
      expect(new Set(ACTION_TYPES).size).toBe(ACTION_TYPES.length)
    })
    it('contains expected types', () => {
      expect(ACTION_TYPES).toContain('launch')
      expect(ACTION_TYPES).toContain('tap')
      expect(ACTION_TYPES).toContain('swipe')
      expect(ACTION_TYPES).toContain('wait')
      expect(ACTION_TYPES).toContain('input_text')
      expect(ACTION_TYPES).toContain('screenshot')
      expect(ACTION_TYPES).toContain('back')
      expect(ACTION_TYPES).toContain('home')
    })
  })

  describe('validateTaskPayload', () => {
    it('rejects empty object', () => {
      expect(validateTaskPayload({}).valid).toBe(false)
      expect(validateTaskPayload({}).error).toBe('缺少 task_id')
    })
    it('rejects non-string task_id', () => {
      expect(validateTaskPayload({ task_id: 123 }).valid).toBe(false)
      expect(validateTaskPayload({ task_id: 123 }).error).toBe('缺少 task_id')
    })
    it('rejects missing video', () => {
      expect(validateTaskPayload({ task_id: 't1' }).valid).toBe(false)
    })
    it('rejects missing video.url when no platform provided', () => {
      expect(validateTaskPayload({ task_id: 't1', platform: 'douyin' }).valid).toBe(false)
      expect(validateTaskPayload({ task_id: 't1', platform: 'douyin' }).error).toBe('缺少 video.url')
    })
    it('rejects invalid platform', () => {
      expect(validateTaskPayload({ task_id: 't1', platform: 'wx' }).valid).toBe(false)
      expect(validateTaskPayload({ task_id: 't1', platform: 'wx' }).error).toContain('平台必须是')
    })
    it('rejects missing video.url', () => {
      const r = validateTaskPayload({ task_id: 't1', platform: 'douyin', video: {} })
      expect(r.valid).toBe(false)
      expect(r.error).toBe('缺少 video.url')
    })
    it('rejects missing actions', () => {
      const r = validateTaskPayload({ task_id: 't1', platform: 'douyin', video: { url: 'x' } })
      expect(r.valid).toBe(false)
      expect(r.error).toBe('actions 必须是非空数组')
    })
    it('rejects empty actions array', () => {
      const r = validateTaskPayload({ task_id: 't1', platform: 'douyin', video: { url: 'x' }, actions: [] })
      expect(r.valid).toBe(false)
      expect(r.error).toBe('actions 必须是非空数组')
    })
    it('rejects invalid action type', () => {
      const r = validateTaskPayload({ task_id: 't1', platform: 'douyin', video: { url: 'x' }, actions: [{ type: 'invalid' }] })
      expect(r.valid).toBe(false)
      expect(r.error).toContain('无效')
    })
    it('accepts launch action on douyin', () => {
      expect(validateTaskPayload({ task_id: 't1', platform: 'douyin', video: { url: 'x' }, actions: [{ type: 'launch' }] }).valid).toBe(true)
    })
    it('accepts tap action on kuaishou', () => {
      expect(validateTaskPayload({ task_id: 't1', platform: 'kuaishou', video: { url: 'x' }, actions: [{ type: 'tap' }] }).valid).toBe(true)
    })
    it('accepts input_text on xiaohongshu', () => {
      expect(validateTaskPayload({ task_id: 't1', platform: 'xiaohongshu', video: { url: 'x' }, actions: [{ type: 'input_text' }] }).valid).toBe(true)
    })
    it('accepts all valid platforms', () => {
      for (const p of ['douyin', 'kuaishou', 'xiaohongshu']) {
        expect(validateTaskPayload({ task_id: 't1', platform: p, video: { url: 'x' }, actions: [{ type: 'launch' }] }).valid).toBe(true)
      }
    })
    it('accepts multiple actions', () => {
      expect(validateTaskPayload({
        task_id: 't1', platform: 'douyin', video: { url: 'x' },
        actions: [{ type: 'launch' }, { type: 'tap' }, { type: 'screenshot' }]
      }).valid).toBe(true)
    })
    it('rejects action at specific index with error message', () => {
      const r = validateTaskPayload({ task_id: 't1', platform: 'douyin', video: { url: 'x' }, actions: [{ type: 'launch' }, { type: 'bad' }] })
      expect(r.valid).toBe(false)
      expect(r.error).toContain('actions[1]')
    })
  })

  describe('validateStatusPayload', () => {
    it('rejects empty object', () => {
      expect(validateStatusPayload({}).valid).toBe(false)
      expect(validateStatusPayload({}).error).toBe('缺少 task_id')
    })
    it('rejects missing phone_id', () => {
      expect(validateStatusPayload({ task_id: 't1' }).valid).toBe(false)
      expect(validateStatusPayload({ task_id: 't1' }).error).toBe('缺少 phone_id')
    })
    it('rejects invalid status', () => {
      expect(validateStatusPayload({ task_id: 't1', phone_id: 'p1' }).valid).toBe(false)
      expect(validateStatusPayload({ task_id: 't1', phone_id: 'p1' }).error).toContain('status 必须是')
    })
    it('rejects unknown status value', () => {
      expect(validateStatusPayload({ task_id: 't1', phone_id: 'p1', status: 'invalid' }).valid).toBe(false)
    })
    it('accepts valid success status', () => {
      expect(validateStatusPayload({ task_id: 't1', phone_id: 'p1', status: 'success' }).valid).toBe(true)
    })
    it('accepts all valid statuses', () => {
      for (const s of ['downloading', 'publishing', 'success', 'failed']) {
        expect(validateStatusPayload({ task_id: 't1', phone_id: 'p1', status: s }).valid).toBe(true)
      }
    })
  })
})
