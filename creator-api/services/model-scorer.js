import { MODEL_PROFILES, getProfile } from './model-knowledge-base.js'

export class ModelScorer {
  constructor(feedbackStore = null) {
    this.feedbackStore = feedbackStore
  }

  score(model, scene, intent = {}, userPreferences = {}) {
    const profile = getProfile(model.endpoint)
    if (!profile) return this._defaultScore()

    const weights = {
      quality: scene.qualityWeight,
      motion: scene.motionWeight,
      speed: scene.speedWeight,
      cost: scene.costWeight,
      adherence: scene.adherenceWeight,
    }

    let sceneScore = 50
    if (profile.sceneStrengths.includes(scene.sceneId)) sceneScore = 95
    else if (profile.sceneWeaknesses.includes(scene.sceneId)) sceneScore = 20

    const qualityScore = profile.qualityScore
    const motionScore = profile.motionScore
    const speedScore = profile.speedScore
    const costScore = profile.costScore
    const adherenceScore = profile.promptAdherence

    let capabilityBonus = 0
    for (const cap of scene.preferredCapabilities || []) {
      if (profile.capabilities?.includes(cap)) capabilityBonus += 5
    }
    for (const cap of scene.requiredCapabilities || []) {
      if (!profile.capabilities?.includes(cap)) capabilityBonus -= 30
    }

    const desiredTier = userPreferences.desiredTier || scene.defaultTier
    let tierBonus = 0
    if (profile.tier === desiredTier) tierBonus = 10
    else if (
      (profile.tier === 'fast' && desiredTier === 'flagship') ||
      (profile.tier === 'flagship' && desiredTier === 'fast')
    ) tierBonus = -15

    let historyScore = 50
    if (this.feedbackStore) {
      const feedback = this.feedbackStore.getFeedback(model.endpoint)
      if (feedback) {
        historyScore = (feedback.successCount / Math.max(feedback.totalCount, 1)) * 100
        if (feedback.recentFailCount >= 3) historyScore *= 0.3
      }
    }

    if (userPreferences.preferSpeed) {
      weights.speed = Math.min(weights.speed + 0.15, 0.5)
      weights.cost = Math.min(weights.cost + 0.10, 0.4)
    }
    if (userPreferences.preferQuality) {
      weights.quality = Math.min(weights.quality + 0.15, 0.5)
      weights.motion = Math.min(weights.motion + 0.10, 0.4)
    }

    const rawScore =
      sceneScore * 0.25 +
      qualityScore * weights.quality +
      motionScore * weights.motion +
      speedScore * weights.speed +
      costScore * weights.cost +
      adherenceScore * weights.adherence +
      historyScore * 0.10 +
      capabilityBonus +
      tierBonus

    return {
      totalScore: Math.round(rawScore * 100) / 100,
      breakdown: {
        sceneScore,
        qualityScore,
        motionScore,
        speedScore,
        costScore,
        adherenceScore,
        capabilityBonus,
        tierBonus,
        historyScore,
      },
      profile,
    }
  }

  _defaultScore() {
    return {
      totalScore: 40,
      breakdown: {
        sceneScore: 50,
        qualityScore: 50,
        motionScore: 50,
        speedScore: 50,
        costScore: 50,
        adherenceScore: 50,
        capabilityBonus: 0,
        tierBonus: 0,
        historyScore: 50,
      },
      profile: null,
    }
  }
}

export function explainRecommendation(scoredModel, scene) {
  const reasons = []
  const profile = scoredModel.profile
  const breakdown = scoredModel.breakdown
  if (!profile) return '综合评分较高'

  if (profile.sceneStrengths?.includes(scene.sceneId)) {
    reasons.push(`擅长${scene.label}场景`)
  }
  if (breakdown.qualityScore >= 85) reasons.push('画质优秀')
  if (breakdown.motionScore >= 85) reasons.push('动作自然')
  if (breakdown.speedScore >= 70) reasons.push('生成速度快')
  if (breakdown.costScore >= 70) reasons.push('性价比高')
  if (breakdown.capabilityBonus > 0) reasons.push('支持所需高级功能')
  if (breakdown.tierBonus > 0) reasons.push('匹配需求等级')
  if (breakdown.historyScore >= 90) reasons.push('历史成功率高')

  return reasons.length > 0 ? reasons.join('，') : '综合评分较高'
}
