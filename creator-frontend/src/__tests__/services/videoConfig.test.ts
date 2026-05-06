import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  PLATFORMS,
  TASK_TYPES,
  TASK_TYPE_IDS,
  TEMPLATE_IDS,
  PLATFORM_IDS,
  templateLabel,
  platformLabel,
  taskTypeInfo,
  templateOptions,
  platformOptions,
} from '@/services/videoConfig'

describe('videoConfig', () => {
  describe('TEMPLATES', () => {
    it('包含 4 个模板', () => {
      expect(Object.keys(TEMPLATES)).toHaveLength(4)
    })

    it('每个模板有 label, desc, icon', () => {
      for (const t of Object.values(TEMPLATES)) {
        expect(t).toHaveProperty('label')
        expect(t).toHaveProperty('desc')
        expect(t).toHaveProperty('icon')
        expect(typeof t.label).toBe('string')
        expect(typeof t.icon).toBe('string')
      }
    })
  })

  describe('PLATFORMS', () => {
    it('包含 3 个平台', () => {
      expect(Object.keys(PLATFORMS)).toHaveLength(3)
    })

    it('每个平台有 label, icon, color', () => {
      for (const p of Object.values(PLATFORMS)) {
        expect(p).toHaveProperty('label')
        expect(p).toHaveProperty('icon')
        expect(p).toHaveProperty('color')
      }
    })
  })

  describe('TASK_TYPES', () => {
    it('包含 4 种任务类型', () => {
      expect(Object.keys(TASK_TYPES)).toHaveLength(4)
    })
  })

  describe('templateLabel', () => {
    it('返回已知模板的 label', () => {
      expect(templateLabel('talking-head')).toBe('口播讲解')
      expect(templateLabel('tech-review')).toBe('科技评测')
    })

    it('未知模板返回原始 id', () => {
      expect(templateLabel('unknown')).toBe('unknown')
    })
  })

  describe('platformLabel', () => {
    it('返回已知平台的 label', () => {
      expect(platformLabel('douyin')).toBe('抖音')
      expect(platformLabel('xiaohongshu')).toBe('小红书')
    })

    it('未知平台返回原始 id', () => {
      expect(platformLabel('unknown')).toBe('unknown')
    })
  })

  describe('taskTypeInfo', () => {
    it('返回已知类型的 label 和 icon', () => {
      const info = taskTypeInfo('text-to-video')
      expect(info.label).toBe('文生视频')
      expect(info.icon).toBe('📝→🎬')
    })

    it('未知类型返回 id 和默认 icon', () => {
      const info = taskTypeInfo('unknown')
      expect(info.label).toBe('unknown')
      expect(info.icon).toBe('🎬')
    })
  })

  describe('templateOptions', () => {
    it('返回所有模板 label 的 | 分隔字符串', () => {
      const result = templateOptions()
      expect(result).toContain('口播讲解')
      expect(result).toContain('科技评测')
      expect(result).toContain(' | ')
    })
  })

  describe('platformOptions', () => {
    it('返回所有平台 icon+label 的 | 分隔字符串', () => {
      const result = platformOptions()
      expect(result).toContain('抖音')
      expect(result).toContain('小红书')
      expect(result).toContain(' | ')
    })
  })

  describe('ID 数组', () => {
    it('TASK_TYPE_IDS 包含 4 个元素', () => {
      expect(TASK_TYPE_IDS).toHaveLength(4)
    })

    it('TEMPLATE_IDS 包含 4 个元素', () => {
      expect(TEMPLATE_IDS).toHaveLength(4)
    })

    it('PLATFORM_IDS 包含 3 个元素', () => {
      expect(PLATFORM_IDS).toHaveLength(3)
    })
  })
})
