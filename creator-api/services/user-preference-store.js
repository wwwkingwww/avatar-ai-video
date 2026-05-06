import { MODEL_PROFILES } from './model-knowledge-base.js'

const DEFAULT_PREFERENCE = {
  preferredTier: 'standard',
  preferSpeed: false,
  preferQuality: false,
  frequentlyUsedEndpoints: [],
  preferredPlatforms: [],
  budgetLevel: 'balanced',
}

export class UserPreferenceStore {
  constructor(prisma) {
    this.prisma = prisma
  }

  async getPreference(userId) {
    if (!this.prisma) return { ...DEFAULT_PREFERENCE }
    try {
      const pref = await this.prisma.userPreference.findUnique({ where: { userId } })
      return pref || { ...DEFAULT_PREFERENCE }
    } catch {
      return { ...DEFAULT_PREFERENCE }
    }
  }

  async updateFromSession(userId, session, taskResult) {
    if (!this.prisma || !userId) return
    try {
      const pref = await this.getPreference(userId)
      const endpoint = session.context?.selectedModel?.endpoint

      if (endpoint) {
        const existing = pref.frequentlyUsedEndpoints || []
        const updated = [...new Set([...existing, endpoint])].slice(-10)
        pref.frequentlyUsedEndpoints = updated
      }

      if (session.context?.platforms?.length) {
        const existing = pref.preferredPlatforms || []
        pref.preferredPlatforms = [...new Set([...existing, ...session.context.platforms])].slice(-10)
      }

      const tierCounts = {}
      for (const ep of pref.frequentlyUsedEndpoints) {
        const profile = MODEL_PROFILES[ep]
        if (profile) tierCounts[profile.tier] = (tierCounts[profile.tier] || 0) + 1
      }
      const dominantTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]
      if (dominantTier) pref.preferredTier = dominantTier[0]

      if (pref.frequentlyUsedEndpoints.length >= 3) {
        const flagshipCount = tierCounts['flagship'] || 0
        const fastCount = tierCounts['fast'] || 0
        pref.preferQuality = flagshipCount > fastCount
        pref.preferSpeed = fastCount > flagshipCount
      }

      await this.prisma.userPreference.upsert({
        where: { userId },
        update: {
          preferredTier: pref.preferredTier,
          preferSpeed: pref.preferSpeed,
          preferQuality: pref.preferQuality,
          frequentlyUsedEndpoints: pref.frequentlyUsedEndpoints,
          preferredPlatforms: pref.preferredPlatforms,
          budgetLevel: pref.budgetLevel,
        },
        create: {
          userId,
          preferredTier: pref.preferredTier,
          preferSpeed: pref.preferSpeed,
          preferQuality: pref.preferQuality,
          frequentlyUsedEndpoints: pref.frequentlyUsedEndpoints,
          preferredPlatforms: pref.preferredPlatforms,
          budgetLevel: pref.budgetLevel,
        },
      })
    } catch {
      // user preference update failure is non-critical
    }
  }
}
