import { describe, it, expect } from 'vitest'
import { MODEL_PROFILES, PROFILE_FIELDS, getProfile, hasProfile } from '../services/model-knowledge-base.js'
import { SceneAnalyzer, SCENE_DEFINITIONS } from '../services/scene-analyzer.js'

describe('Model Knowledge Base', () => {
  it('should have 32 model profiles', () => {
    expect(Object.keys(MODEL_PROFILES).length).toBeGreaterThanOrEqual(32)
  })

  it('every profile should have all 16 fields', () => {
    for (const [endpoint, profile] of Object.entries(MODEL_PROFILES)) {
      for (const field of PROFILE_FIELDS) {
        expect(profile, `missing ${field} in ${endpoint}`).toHaveProperty(field)
      }
    }
  })

  it('scores should be in 0-100 range', () => {
    const scoreFields = ['qualityScore', 'speedScore', 'costScore', 'motionScore', 'promptAdherence']
    for (const [endpoint, profile] of Object.entries(MODEL_PROFILES)) {
      for (const f of scoreFields) {
        expect(profile[f], `${endpoint}.${f}`).toBeGreaterThanOrEqual(0)
        expect(profile[f], `${endpoint}.${f}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('successRate should be 0-1', () => {
    for (const [endpoint, profile] of Object.entries(MODEL_PROFILES)) {
      expect(profile.successRate, `${endpoint}.successRate`).toBeGreaterThanOrEqual(0)
      expect(profile.successRate, `${endpoint}.successRate`).toBeLessThanOrEqual(1)
    }
  })

  it('tier should be one of flagship/pro/standard/fast', () => {
    const validTiers = ['flagship', 'pro', 'standard', 'fast']
    for (const [endpoint, profile] of Object.entries(MODEL_PROFILES)) {
      expect(validTiers, `${endpoint}.tier`).toContain(profile.tier)
    }
  })

  it('sceneStrengths and sceneWeaknesses should reference valid scene IDs', () => {
    const validScenes = Object.keys(SCENE_DEFINITIONS)
    for (const [endpoint, profile] of Object.entries(MODEL_PROFILES)) {
      for (const s of profile.sceneStrengths) {
        expect(validScenes, `${endpoint} sceneStrengths has ${s}`).toContain(s)
      }
      for (const s of profile.sceneWeaknesses) {
        expect(validScenes, `${endpoint} sceneWeaknesses has ${s}`).toContain(s)
      }
    }
  })

  it('Wan 2.2 t2v should have cinematicControl capability', () => {
    expect(MODEL_PROFILES['alibaba/wan-2.2/text-to-video'].capabilities).toContain('cinematicControl')
  })

  it('LTX 2.3 t2v should have spatialUpscale and portraitMode capabilities', () => {
    const caps = MODEL_PROFILES['rhart-video/ltx-2.3/text-to-video'].capabilities
    expect(caps).toContain('spatialUpscale')
    expect(caps).toContain('portraitMode')
  })

  it('getProfile returns profile for known endpoint', () => {
    expect(getProfile('kling-video-o3-pro/text-to-video')).toBeDefined()
  })

  it('getProfile returns null for unknown endpoint', () => {
    expect(getProfile('nonexistent/model')).toBeNull()
  })

  it('hasProfile returns true for known endpoint', () => {
    expect(hasProfile('kling-video-o3-pro/text-to-video')).toBe(true)
  })

  it('hasProfile returns false for unknown endpoint', () => {
    expect(hasProfile('nonexistent/model')).toBe(false)
  })
})

describe('SceneAnalyzer', () => {
  const analyzer = new SceneAnalyzer()

  it('should match product-showcase scene', () => {
    const result = analyzer.analyze('帮我做个咖啡产品展示视频')
    expect(result.sceneId).toBe('product-showcase')
    expect(result.score).toBeGreaterThan(0)
  })

  it('should match cinematic scene', () => {
    const result = analyzer.analyze('做个电影感大片')
    expect(result.sceneId).toBe('cinematic')
  })

  it('should match character-action scene', () => {
    const result = analyzer.analyze('做个舞蹈视频')
    expect(result.sceneId).toBe('character-action')
  })

  it('should match vlog scene', () => {
    const result = analyzer.analyze('拍个旅行vlog')
    expect(result.sceneId).toBe('vlog')
  })

  it('should match quick-preview scene', () => {
    const result = analyzer.analyze('快速试试效果')
    expect(result.sceneId).toBe('quick-preview')
  })

  it('should match transition scene', () => {
    const result = analyzer.analyze('做个转场特效')
    expect(result.sceneId).toBe('transition')
  })

  it('should match fashion scene', () => {
    const result = analyzer.analyze('做个时装走秀视频')
    expect(result.sceneId).toBe('fashion')
  })

  it('should match social-media via platform keyword', () => {
    const result = analyzer.analyze('发抖音的短视频')
    expect(result.sceneId).toBe('social-media')
  })

  it('should match image-animation via taskType intent', () => {
    const result = analyzer.analyze('让图片动起来', { taskType: 'image-to-video' })
    expect(result.sceneId).toBe('image-animation')
  })

  it('should fallback to general when no keywords match', () => {
    const result = analyzer.analyze('hello world')
    expect(result.sceneId).toBe('general')
  })

  it('inferQualityNeed should return flagship for 4k keyword', () => {
    const scene = { defaultTier: 'standard' }
    expect(analyzer.inferQualityNeed('做个4K超清视频', scene)).toBe('flagship')
  })

  it('inferQualityNeed should return fast for quick keyword', () => {
    const scene = { defaultTier: 'standard' }
    expect(analyzer.inferQualityNeed('快速预览一下', scene)).toBe('fast')
  })

  it('inferQualityNeed should return scene default when no quality keyword', () => {
    const scene = { defaultTier: 'pro' }
    expect(analyzer.inferQualityNeed('做个产品视频', scene)).toBe('pro')
  })

  it('inferBudgetAwareness should return budget for cheap keyword', () => {
    expect(analyzer.inferBudgetAwareness('便宜的方案')).toBe('budget')
  })

  it('inferBudgetAwareness should return premium for best keyword', () => {
    expect(analyzer.inferBudgetAwareness('不在乎价格，用最好的')).toBe('premium')
  })

  it('inferBudgetAwareness should return balanced by default', () => {
    expect(analyzer.inferBudgetAwareness('做个视频')).toBe('balanced')
  })

  it('scene should have all required weight properties', () => {
    const result = analyzer.analyze('产品展示')
    expect(result).toHaveProperty('qualityWeight')
    expect(result).toHaveProperty('motionWeight')
    expect(result).toHaveProperty('speedWeight')
    expect(result).toHaveProperty('costWeight')
    expect(result).toHaveProperty('adherenceWeight')
    const sum = result.qualityWeight + result.motionWeight + result.speedWeight + result.costWeight + result.adherenceWeight
    expect(sum).toBeCloseTo(1.0, 1)
  })
})
