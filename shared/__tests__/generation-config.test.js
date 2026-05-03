import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, PLATFORMS, TASK_TYPES, PHASES,
  TEMPLATE_IDS, PLATFORM_IDS, TASK_TYPE_IDS,
  templateLabel, platformLabel, platformInfo, taskTypeInfo,
  templateList, platformList, taskTypeList,
  templateOptions, platformOptions, taskTypeOptions,
} from '../generation-config.js'

describe('generation-config', () => {
  describe('TEMPLATES', () => {
    it('has 4 templates', () => {
      expect(Object.keys(TEMPLATES)).toHaveLength(4)
    })
    it('each template has label, desc, icon', () => {
      for (const t of Object.values(TEMPLATES)) {
        expect(t).toHaveProperty('label')
        expect(t).toHaveProperty('desc')
        expect(t).toHaveProperty('icon')
      }
    })
  })

  describe('PLATFORMS', () => {
    it('has 3 platforms', () => {
      expect(Object.keys(PLATFORMS)).toHaveLength(3)
    })
    it('each platform has label, icon, color', () => {
      for (const p of Object.values(PLATFORMS)) {
        expect(p).toHaveProperty('label')
        expect(p).toHaveProperty('icon')
        expect(p).toHaveProperty('color')
      }
    })
  })

  describe('TASK_TYPES', () => {
    it('has 4 task types', () => {
      expect(Object.keys(TASK_TYPES)).toHaveLength(4)
    })
  })

  describe('PHASES', () => {
    it('has 4 phases in order', () => {
      expect(PHASES).toEqual(['INTENT', 'PARAMS', 'RECOMMEND', 'CONFIRM'])
    })
  })

  describe('ID arrays', () => {
    it('TEMPLATE_IDS matches TEMPLATES keys', () => {
      expect(TEMPLATE_IDS).toEqual(Object.keys(TEMPLATES))
    })
    it('PLATFORM_IDS matches PLATFORMS keys', () => {
      expect(PLATFORM_IDS).toEqual(Object.keys(PLATFORMS))
    })
    it('TASK_TYPE_IDS matches TASK_TYPES keys', () => {
      expect(TASK_TYPE_IDS).toEqual(Object.keys(TASK_TYPES))
    })
  })

  describe('label functions', () => {
    it('templateLabel returns correct label', () => {
      expect(templateLabel('talking-head')).toBe('口播讲解')
    })
    it('templateLabel falls back to id for unknown', () => {
      expect(templateLabel('nonexistent')).toBe('nonexistent')
    })
    it('platformLabel returns correct label', () => {
      expect(platformLabel('douyin')).toBe('抖音')
      expect(platformLabel('kuaishou')).toBe('快手')
      expect(platformLabel('xiaohongshu')).toBe('小红书')
    })
    it('platformLabel falls back to id for unknown', () => {
      expect(platformLabel('unknown')).toBe('unknown')
    })
  })

  describe('info functions', () => {
    it('platformInfo returns full platform data', () => {
      expect(platformInfo('xiaohongshu')).toEqual({
        label: '小红书', icon: '📕', color: '#fe2c55'
      })
    })
    it('platformInfo returns defaults for unknown', () => {
      expect(platformInfo('unknown')).toEqual({ label: 'unknown', icon: '📱', color: '#333' })
    })
    it('taskTypeInfo returns full type data', () => {
      expect(taskTypeInfo('text-to-video')).toEqual({
        label: '文生视频', desc: '输入文案生成视频', icon: '📝→🎬'
      })
    })
    it('taskTypeInfo returns defaults for unknown', () => {
      expect(taskTypeInfo('unknown')).toEqual({ label: 'unknown', icon: '🎬' })
    })
  })

  describe('list functions', () => {
    it('templateList returns array with id and spread props', () => {
      const list = templateList()
      expect(list).toHaveLength(4)
      expect(list[0]).toHaveProperty('id')
      expect(list[0]).toHaveProperty('label')
      expect(list[0]).toHaveProperty('desc')
      expect(list[0]).toHaveProperty('icon')
    })
    it('platformList returns array with id and spread props', () => {
      const list = platformList()
      expect(list).toHaveLength(3)
      expect(list[0]).toHaveProperty('id')
      expect(list[0]).toHaveProperty('label')
    })
    it('taskTypeList returns array with id and spread props', () => {
      const list = taskTypeList()
      expect(list).toHaveLength(4)
    })
  })

  describe('options functions', () => {
    it('templateOptions returns pipe-separated labels', () => {
      const opts = templateOptions()
      expect(opts).toContain('口播讲解')
      expect(opts).toContain('科技评测')
      expect(opts).toContain('产品展示')
      expect(opts).toContain('日常Vlog')
      expect(opts.split(' | ')).toHaveLength(4)
    })
    it('platformOptions contains platform info', () => {
      const opts = platformOptions()
      expect(opts).toContain('🎵 抖音')
      expect(opts).toContain('🎬 快手')
      expect(opts).toContain('📕 小红书')
    })
    it('taskTypeOptions contains task type info', () => {
      const opts = taskTypeOptions()
      expect(opts).toContain('📝→🎬 文生视频')
      expect(opts.split(' | ')).toHaveLength(4)
    })
  })
})
