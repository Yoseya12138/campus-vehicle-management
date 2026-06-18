const crypto = require('crypto')
const { Security } = require('./Security')

class RateLimiter {
  constructor(db, collectionName) {
    this.db = db
    this.collectionName = collectionName || 'rateLimits'
    this._ = db.command
  }

  hash(text) {
    return crypto.createHash('sha256').update(String(text || '')).digest('hex')
  }

  async checkRateLimit(options) {
    const action = options.action
    const identity = options.identity || options.ip || options.openid || 'unknown'
    const maxRequests = Number(options.maxRequests || 60)
    const windowSeconds = Number(options.windowSeconds || 60)
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
    const key = this.hash([action, identity, bucket].join(':')).slice(0, 48)
    const ref = this.db.collection(this.collectionName).doc(key)

    try {
      await this.db.collection(this.collectionName).add({
        data: {
          _id: key,
          action,
          identityHash: this.hash(identity),
          bucket,
          count: 1,
          limit: maxRequests,
          expiresAt: new Date(Date.now() + windowSeconds * 1000 * 2),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
      return { ok: true, remaining: maxRequests - 1 }
    } catch (e) {
      await ref.update({ data: { count: this._.inc(1), updatedAt: new Date() } })
      const doc = await ref.get()
      const count = doc.data && doc.data.count ? doc.data.count : 0
      if (count > maxRequests) {
        return { ok: false, message: '请求过于频繁', retryAfter: windowSeconds }
      }
      return { ok: true, remaining: Math.max(0, maxRequests - count) }
    }
  }

  async resetRateLimit(action, identity) {
    const identityHash = this.hash(identity || '')
    const res = await this.db.collection(this.collectionName).where({ action, identityHash }).get()
    await Promise.all(res.data.map(item => this.db.collection(this.collectionName).doc(item._id).remove()))
    return { ok: true }
  }
}

module.exports = { RateLimiter }
