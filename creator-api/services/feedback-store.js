export class FeedbackStore {
  constructor(redisClient) {
    this.redis = redisClient
    this._cache = new Map()
  }

  async recordGeneration(endpoint, result) {
    const key = `feedback:${endpoint}`
    const data = await this._getOrCreate(key)
    data.totalCount += 1
    if (result.status === 'SUCCESS') {
      data.successCount += 1
      data.recentFailCount = 0
    } else {
      data.failCount += 1
      data.recentFailCount = (data.recentFailCount || 0) + 1
    }
    data.lastUsed = Date.now()
    data.recentResults = data.recentResults || []
    data.recentResults.push({ status: result.status, timestamp: Date.now() })
    data.recentResults = data.recentResults.slice(-20)
    this._cache.set(key, data)
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', 86400 * 30)
    } catch {
      // Redis write failure is non-critical
    }
  }

  async recordUserRating(endpoint, rating) {
    const key = `feedback:${endpoint}`
    const data = await this._getOrCreate(key)
    data.ratings = data.ratings || []
    data.ratings.push(rating)
    data.ratings = data.ratings.slice(-50)
    data.avgRating = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
    this._cache.set(key, data)
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', 86400 * 30)
    } catch {
      // Redis write failure is non-critical
    }
  }

  getFeedback(endpoint) {
    const key = `feedback:${endpoint}`
    return this._cache.get(key) || null
  }

  async _getOrCreate(key) {
    if (this._cache.has(key)) return this._cache.get(key)
    try {
      const raw = await this.redis.get(key)
      if (raw) {
        const data = JSON.parse(raw)
        this._cache.set(key, data)
        return data
      }
    } catch {
      // Redis read failure is non-critical
    }
    return { totalCount: 0, successCount: 0, failCount: 0, recentFailCount: 0, recentResults: [], ratings: [] }
  }
}
