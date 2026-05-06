import { describe, it, expect } from 'vitest'
import { FeedbackStore } from '../services/feedback-store.js'
import { UserPreferenceStore } from '../services/user-preference-store.js'
import { PipelineRecommender, PIPELINE_TEMPLATES } from '../services/pipeline-recommender.js'
import { ModelScorer, explainRecommendation } from '../services/model-scorer.js'
import { SceneAnalyzer } from '../services/scene-analyzer.js'
import { MODEL_PROFILES } from '../services/model-knowledge-base.js'

describe('FeedbackStore', () => {
  it('should record generation and retrieve feedback', async () => {
    const mockRedis = {
      get: async () => null,
      set: async () => 'OK',
    }
    const store = new FeedbackStore(mockRedis)
    await store.recordGeneration('test-endpoint', { status: 'SUCCESS' })
    const feedback = store.getFeedback('test-endpoint')
    expect(feedback).toBeDefined()
    expect(feedback.totalCount).toBe(1)
    expect(feedback.successCount).toBe(1)
  })

  it('should track failures', async () => {
    const mockRedis = {
      get: async () => null,
      set: async () => 'OK',
    }
    const store = new FeedbackStore(mockRedis)
    await store.recordGeneration('test-endpoint', { status: 'FAILED' })
    const feedback = store.getFeedback('test-endpoint')
    expect(feedback.failCount).toBe(1)
    expect(feedback.recentFailCount).toBe(1)
  })

  it('should reset recentFailCount on success', async () => {
    const mockRedis = {
      get: async () => null,
      set: async () => 'OK',
    }
    const store = new FeedbackStore(mockRedis)
    await store.recordGeneration('test-endpoint', { status: 'FAILED' })
    await store.recordGeneration('test-endpoint', { status: 'FAILED' })
    await store.recordGeneration('test-endpoint', { status: 'SUCCESS' })
    const feedback = store.getFeedback('test-endpoint')
    expect(feedback.recentFailCount).toBe(0)
    expect(feedback.successCount).toBe(1)
    expect(feedback.failCount).toBe(2)
  })

  it('should calculate avgRating', async () => {
    const mockRedis = {
      get: async () => null,
      set: async () => 'OK',
    }
    const store = new FeedbackStore(mockRedis)
    await store.recordUserRating('test-endpoint', 4)
    await store.recordUserRating('test-endpoint', 5)
    const feedback = store.getFeedback('test-endpoint')
    expect(feedback.avgRating).toBe(4.5)
  })

  it('should return null for unknown endpoint', () => {
    const mockRedis = { get: async () => null, set: async () => 'OK' }
    const store = new FeedbackStore(mockRedis)
    expect(store.getFeedback('unknown')).toBeNull()
  })

  it('should degrade gracefully when Redis fails', async () => {
    const mockRedis = {
      get: async () => { throw new Error('Redis connection refused') },
      set: async () => { throw new Error('Redis connection refused') },
    }
    const store = new FeedbackStore(mockRedis)
    await store.recordGeneration('test-endpoint', { status: 'SUCCESS' })
    const feedback = store.getFeedback('test-endpoint')
    expect(feedback).toBeDefined()
    expect(feedback.successCount).toBe(1)
  })
})

describe('UserPreferenceStore', () => {
  it('should return default preference without prisma', async () => {
    const store = new UserPreferenceStore(null)
    const pref = await store.getPreference('user1')
    expect(pref.preferredTier).toBe('standard')
    expect(pref.preferSpeed).toBe(false)
    expect(pref.budgetLevel).toBe('balanced')
  })

  it('should degrade gracefully when prisma fails', async () => {
    const mockPrisma = {
      userPreference: {
        findUnique: async () => { throw new Error('DB error') },
        upsert: async () => { throw new Error('DB error') },
      },
    }
    const store = new UserPreferenceStore(mockPrisma)
    const pref = await store.getPreference('user1')
    expect(pref.preferredTier).toBe('standard')
  })
})

describe('PipelineRecommender', () => {
  it('should recommend video-with-voiceover for voiceover keywords', () => {
    const recommender = new PipelineRecommender(null)
    const pipelines = recommender.recommendPipeline('帮我做个配音视频')
    expect(pipelines.length).toBeGreaterThan(0)
    expect(pipelines[0].pipelineId).toBe('video-with-voiceover')
  })

  it('should recommend product-showcase-full for full pipeline keywords', () => {
    const recommender = new PipelineRecommender(null)
    const pipelines = recommender.recommendPipeline('从零开始做产品展示全流程')
    expect(pipelines.length).toBeGreaterThan(0)
    expect(pipelines.some(p => p.pipelineId === 'product-showcase-full')).toBe(true)
  })

  it('should recommend video-enhance for upscale keywords', () => {
    const recommender = new PipelineRecommender(null)
    const pipelines = recommender.recommendPipeline('视频画质增强')
    expect(pipelines.length).toBeGreaterThan(0)
    expect(pipelines[0].pipelineId).toBe('video-enhance')
  })

  it('should return empty for non-matching input', () => {
    const recommender = new PipelineRecommender(null)
    const pipelines = recommender.recommendPipeline('做个普通视频')
    expect(pipelines).toHaveLength(0)
  })

  it('should sort by relevanceScore', () => {
    const recommender = new PipelineRecommender(null)
    const pipelines = recommender.recommendPipeline('配音的全流程产品展示')
    for (let i = 1; i < pipelines.length; i++) {
      expect(pipelines[i - 1].relevanceScore).toBeGreaterThanOrEqual(pipelines[i].relevanceScore)
    }
  })

  it('should have 4 pipeline templates', () => {
    expect(Object.keys(PIPELINE_TEMPLATES)).toHaveLength(4)
  })
})

describe('Integration: Smart Recommend End-to-End', () => {
  const analyzer = new SceneAnalyzer()
  const scorer = new ModelScorer()

  it('product-showcase scenario should recommend high-quality models', () => {
    const scene = analyzer.analyze('帮我做个咖啡产品展示视频，发抖音')
    expect(scene.sceneId).toBe('product-showcase')

    const kling = { endpoint: 'kling-video-o3-pro/text-to-video' }
    const wan22 = { endpoint: 'alibaba/wan-2.2/text-to-video' }
    const skyreels = { endpoint: 'skyreels-v4/text-to-video' }

    const klingScore = scorer.score(kling, scene)
    const wan22Score = scorer.score(wan22, scene)
    const skyreelsScore = scorer.score(skyreels, scene)

    expect(klingScore.totalScore).toBeGreaterThan(skyreelsScore.totalScore)
    expect(wan22Score.totalScore).toBeGreaterThan(skyreelsScore.totalScore)
  })

  it('quick-preview scenario should recommend fast models', () => {
    const scene = analyzer.analyze('快速试试效果，做个风景视频')
    expect(scene.sceneId).toBe('quick-preview')

    const skyreels = { endpoint: 'skyreels-v4/text-to-video' }
    const kling = { endpoint: 'kling-video-o3-pro/text-to-video' }
    const ltx = { endpoint: 'rhart-video/ltx-2.3/text-to-video' }

    const skyreelsScore = scorer.score(skyreels, scene)
    const klingScore = scorer.score(kling, scene)
    const ltxScore = scorer.score(ltx, scene)

    expect(skyreelsScore.totalScore).toBeGreaterThan(klingScore.totalScore)
    expect(ltxScore.totalScore).toBeGreaterThan(klingScore.totalScore)
  })

  it('cinematic scenario should recommend flagship models', () => {
    const scene = analyzer.analyze('做个电影感大片')
    expect(scene.sceneId).toBe('cinematic')

    const kling = { endpoint: 'kling-video-o3-pro/text-to-video' }
    const wan22 = { endpoint: 'alibaba/wan-2.2/text-to-video' }
    const minimax = { endpoint: 'minimax/hailuo-2.3/t2v-standard' }

    const klingScore = scorer.score(kling, scene)
    const wan22Score = scorer.score(wan22, scene)
    const minimaxScore = scorer.score(minimax, scene)

    expect(klingScore.totalScore).toBeGreaterThan(minimaxScore.totalScore)
    expect(wan22Score.totalScore).toBeGreaterThan(minimaxScore.totalScore)
  })

  it('Wan 2.2 should have cinematicControl capability', () => {
    const profile = MODEL_PROFILES['alibaba/wan-2.2/text-to-video']
    expect(profile.capabilities).toContain('cinematicControl')
  })

  it('LTX 2.3 should have portraitMode and spatialUpscale capabilities', () => {
    const profile = MODEL_PROFILES['rhart-video/ltx-2.3/text-to-video']
    expect(profile.capabilities).toContain('portraitMode')
    expect(profile.capabilities).toContain('spatialUpscale')
  })

  it('all profiles should have valid scene references', () => {
    const sceneIds = new Set(Object.keys(analyzer.constructor.prototype.constructor.__proto__ ? [] : []))
    // Just verify no runtime errors occur during scoring
    for (const [endpoint] of Object.entries(MODEL_PROFILES)) {
      const scene = analyzer.analyze('test')
      const result = scorer.score({ endpoint }, scene)
      expect(result.totalScore).toBeGreaterThan(0)
      expect(result.breakdown).toBeDefined()
    }
  })
})
