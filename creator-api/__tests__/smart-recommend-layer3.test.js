import { describe, it, expect } from 'vitest'
import { ModelScorer, explainRecommendation } from '../services/model-scorer.js'
import { MODEL_PROFILES } from '../services/model-knowledge-base.js'
import { SceneAnalyzer } from '../services/scene-analyzer.js'

const mockModel = (endpoint) => ({ endpoint, name: endpoint, nameCn: '', taskType: 'text-to-video', outputType: 'video', inputTypes: [], fields: [] })

describe('ModelScorer', () => {
  const scorer = new ModelScorer()
  const analyzer = new SceneAnalyzer()

  it('should return default score for unknown model', () => {
    const scene = analyzer.analyze('test')
    const result = scorer.score(mockModel('unknown/model'), scene)
    expect(result.totalScore).toBe(40)
    expect(result.profile).toBeNull()
  })

  it('should give sceneScore=95 for scene strength match', () => {
    const scene = analyzer.analyze('产品展示')
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.breakdown.sceneScore).toBe(95)
  })

  it('should give sceneScore=20 for scene weakness match', () => {
    const scene = analyzer.analyze('产品展示')
    const model = mockModel('skyreels-v4/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.breakdown.sceneScore).toBe(20)
  })

  it('should give sceneScore=50 for neutral scene', () => {
    const scene = analyzer.analyze('产品展示')
    const model = mockModel('minimax/hailuo-2.3/t2v-pro')
    const result = scorer.score(model, scene)
    expect(result.breakdown.sceneScore).toBe(50)
  })

  it('should add capabilityBonus for preferred capability match', () => {
    const scene = analyzer.analyze('产品展示')
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.breakdown.capabilityBonus).toBeGreaterThan(0)
  })

  it('should subtract capabilityBonus for missing required capability', () => {
    const scene = { ...analyzer.analyze('test'), requiredCapabilities: ['nonexistentCapability'] }
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.breakdown.capabilityBonus).toBeLessThan(0)
  })

  it('should add tierBonus when tier matches desiredTier', () => {
    const scene = analyzer.analyze('快速预览')
    const model = mockModel('skyreels-v4/text-to-video')
    const result = scorer.score(model, scene, {}, { desiredTier: 'fast' })
    expect(result.breakdown.tierBonus).toBe(10)
  })

  it('should subtract tierBonus for severe tier mismatch', () => {
    const scene = analyzer.analyze('快速预览')
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorer.score(model, scene, {}, { desiredTier: 'fast' })
    expect(result.breakdown.tierBonus).toBe(-15)
  })

  it('should apply historyScore from feedbackStore', () => {
    const mockFeedback = {
      getFeedback: () => ({ successCount: 45, totalCount: 50, recentFailCount: 0 }),
    }
    const scorerWithFeedback = new ModelScorer(mockFeedback)
    const scene = analyzer.analyze('test')
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorerWithFeedback.score(model, scene)
    expect(result.breakdown.historyScore).toBe(90)
  })

  it('should penalize historyScore for recent failures', () => {
    const mockFeedback = {
      getFeedback: () => ({ successCount: 45, totalCount: 50, recentFailCount: 4 }),
    }
    const scorerWithFeedback = new ModelScorer(mockFeedback)
    const scene = analyzer.analyze('test')
    const model = mockModel('kling-video-o3-pro/text-to-video')
    const result = scorerWithFeedback.score(model, scene)
    expect(result.breakdown.historyScore).toBeLessThan(60)
  })

  it('product-showcase should rank Kling O3 Pro higher than SkyReels V4', () => {
    const scene = analyzer.analyze('帮我做个咖啡产品展示视频')
    const kling = mockModel('kling-video-o3-pro/text-to-video')
    const skyreels = mockModel('skyreels-v4/text-to-video')
    const klingScore = scorer.score(kling, scene)
    const skyreelsScore = scorer.score(skyreels, scene)
    expect(klingScore.totalScore).toBeGreaterThan(skyreelsScore.totalScore)
  })

  it('quick-preview should rank SkyReels V4 higher than Kling O3 Pro', () => {
    const scene = analyzer.analyze('快速试试效果')
    const kling = mockModel('kling-video-o3-pro/text-to-video')
    const skyreels = mockModel('skyreels-v4/text-to-video')
    const klingScore = scorer.score(kling, scene)
    const skyreelsScore = scorer.score(skyreels, scene)
    expect(skyreelsScore.totalScore).toBeGreaterThan(klingScore.totalScore)
  })

  it('Wan 2.2 should score high for cinematic scene', () => {
    const scene = analyzer.analyze('做个电影感大片')
    const model = mockModel('alibaba/wan-2.2/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.totalScore).toBeGreaterThan(70)
    expect(result.breakdown.sceneScore).toBe(95)
  })

  it('LTX 2.3 should score high for quick-preview scene', () => {
    const scene = analyzer.analyze('快速预览一下')
    const model = mockModel('rhart-video/ltx-2.3/text-to-video')
    const result = scorer.score(model, scene)
    expect(result.totalScore).toBeGreaterThan(65)
  })
})

describe('explainRecommendation', () => {
  const analyzer = new SceneAnalyzer()

  it('should include scene strength in explanation', () => {
    const scene = analyzer.analyze('产品展示')
    const scoredModel = {
      profile: MODEL_PROFILES['kling-video-o3-pro/text-to-video'],
      breakdown: { qualityScore: 95, motionScore: 92, speedScore: 40, costScore: 30, capabilityBonus: 5, tierBonus: 0, historyScore: 50 },
    }
    const explanation = explainRecommendation(scoredModel, scene)
    expect(explanation).toContain('产品展示')
  })

  it('should include quality explanation for high qualityScore', () => {
    const scene = analyzer.analyze('test')
    const scoredModel = {
      profile: MODEL_PROFILES['kling-video-o3-pro/text-to-video'],
      breakdown: { qualityScore: 95, motionScore: 92, speedScore: 40, costScore: 30, capabilityBonus: 0, tierBonus: 0, historyScore: 50 },
    }
    const explanation = explainRecommendation(scoredModel, scene)
    expect(explanation).toContain('画质优秀')
  })

  it('should return default for null profile', () => {
    const scene = analyzer.analyze('test')
    const explanation = explainRecommendation({ profile: null, breakdown: {} }, scene)
    expect(explanation).toBe('综合评分较高')
  })
})
