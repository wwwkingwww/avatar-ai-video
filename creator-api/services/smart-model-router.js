import { ModelRouter } from '../../skills/runninghub/model-router.js'
import { SceneAnalyzer } from './scene-analyzer.js'
import { ModelScorer, explainRecommendation } from './model-scorer.js'

export class SmartModelRouter extends ModelRouter {
  constructor(registryPath, pricingPath, dbLoader, redisClient) {
    super(registryPath, pricingPath, dbLoader)
    this.sceneAnalyzer = new SceneAnalyzer()
    this.scorer = new ModelScorer(redisClient ? { getFeedback: (ep) => null } : null)
    this.redisClient = redisClient
  }

  async init() {
    await super.init()
    if (this.redisClient) {
      const { FeedbackStore } = await import('./feedback-store.js')
      this.feedbackStore = new FeedbackStore(this.redisClient)
      this.scorer = new ModelScorer(this.feedbackStore)
    }
    return this
  }

  smartRecommend(userInput, intent = {}, userPreferences = {}) {
    this.ensureLoaded()

    const scene = this.sceneAnalyzer.analyze(userInput, intent)
    const qualityNeed = this.sceneAnalyzer.inferQualityNeed(userInput, scene)
    const budgetAwareness = this.sceneAnalyzer.inferBudgetAwareness(userInput)

    let candidates = [...this.models]
    if (intent.taskType) {
      candidates = candidates.filter(m => m.taskType === intent.taskType)
    }
    if (candidates.length === 0) {
      candidates = [...this.models].filter(m => m.outputType === 'video')
    }
    if (intent.hasImage) {
      const withImage = candidates.filter(m => (m.inputTypes || []).includes('image'))
      if (withImage.length > 0) candidates = withImage
    }
    if (intent.hasVideo) {
      const withVideo = candidates.filter(m => (m.inputTypes || []).includes('video'))
      if (withVideo.length > 0) candidates = withVideo
    }
    if (intent.hasAudio) {
      const withAudio = candidates.filter(m => (m.inputTypes || []).includes('audio'))
      if (withAudio.length > 0) candidates = withAudio
    }

    const enrichedPrefs = {
      ...userPreferences,
      desiredTier: qualityNeed,
      budgetAwareness,
    }

    const scored = candidates.map(model => {
      const result = this.scorer.score(model, scene, intent, enrichedPrefs)
      return { ...model, ...result }
    })

    scored.sort((a, b) => b.totalScore - a.totalScore)

    const top3 = scored.slice(0, 3)

    return {
      scene,
      qualityNeed,
      budgetAwareness,
      recommendations: top3.map((m, i) => ({
        rank: i + 1,
        endpoint: m.endpoint,
        name: m.name,
        nameCn: m.nameCn,
        taskType: m.taskType,
        outputType: m.outputType,
        inputTypes: m.inputTypes,
        totalScore: m.totalScore,
        scoreBreakdown: m.breakdown,
        profile: m.profile,
        fields: m.fields,
        estimatedCost: this.getPriceEstimate(m.endpoint),
        whyRecommended: explainRecommendation(m, scene),
      })),
      totalMatched: candidates.length,
      alternatives: scored.slice(3, 6).map(m => ({
        endpoint: m.endpoint,
        name: m.name,
        totalScore: m.totalScore,
        reason: '备选方案',
      })),
    }
  }
}
