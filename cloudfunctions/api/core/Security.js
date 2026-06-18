const crypto = require('crypto')

class Security {
  static getClientIp(event) {
    const headers = event.headers || event.header || {}
    const candidates = [
      event.clientIP,
      event.clientIp,
      headers['x-forwarded-for'],
      headers['X-Forwarded-For'],
      headers['x-real-ip'],
      headers['X-Real-IP'],
      headers['cf-connecting-ip'],
      headers['CF-Connecting-IP']
    ].filter(Boolean)
    if (!candidates.length) return ''
    return String(candidates[0]).split(',')[0].trim().slice(0, 80)
  }

  static validatePasswordStrength(password) {
    const value = String(password || '')
    const errors = []
    if (value.length < 8) errors.push('密码长度至少8位')
    if (!/[A-Z]/.test(value)) errors.push('需要包含大写字母')
    if (!/[a-z]/.test(value)) errors.push('需要包含小写字母')
    if (!/\d/.test(value)) errors.push('需要包含数字')
    if (!/[^A-Za-z0-9]/.test(value)) errors.push('需要包含特殊字符')
    return { ok: errors.length === 0, errors }
  }

  static sanitizeText(input, maxLen) {
    return String(input == null ? '' : input)
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maxLen || 500)
  }

  static sanitizeInput(input) {
    if (input == null) return input
    if (typeof input === 'string') return Security.sanitizeText(input)
    if (typeof input === 'number' || typeof input === 'boolean') return input
    if (Array.isArray(input)) return input.map(item => Security.sanitizeInput(item))
    if (typeof input === 'object') {
      const out = {}
      Object.keys(input).forEach(key => {
        if (key.startsWith('$') || key.includes('.')) return
        out[key] = Security.sanitizeInput(input[key])
      })
      return out
    }
    return input
  }

  static escapeOutput(output) {
    return String(output == null ? '' : output)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  static hmac(secret, text) {
    return crypto.createHmac('sha256', String(secret || '')).update(String(text || '')).digest('hex')
  }

  static safeEqual(a, b) {
    const aa = Buffer.from(String(a || ''))
    const bb = Buffer.from(String(b || ''))
    if (aa.length !== bb.length) return false
    return crypto.timingSafeEqual(aa, bb)
  }

  static generateCSRFToken(subject, secret, ttlSeconds) {
    const ts = Date.now()
    const nonce = crypto.randomBytes(12).toString('hex')
    const ttl = Number(ttlSeconds || 7200)
    const base = [subject || '', ts, nonce, ttl].join('.')
    const sig = Security.hmac(secret, base)
    return [ts, ttl, nonce, sig].join('.')
  }

  static validateCSRFToken(token, subject, secret) {
    const parts = String(token || '').split('.')
    if (parts.length !== 4) return false
    const ts = Number(parts[0])
    const ttl = Number(parts[1])
    const nonce = parts[2]
    const sig = parts[3]
    if (!ts || !ttl || !nonce || !sig) return false
    if (Date.now() - ts > ttl * 1000) return false
    const base = [subject || '', ts, nonce, ttl].join('.')
    const expected = Security.hmac(secret, base)
    return Security.safeEqual(sig, expected)
  }

  static stableStringify(value) {
    if (value == null) return ''
    if (typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return '[' + value.map(item => Security.stableStringify(item)).join(',') + ']'
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + Security.stableStringify(value[key])).join(',') + '}'
  }

  static validateRequestSignature(event, secret, windowSeconds) {
    const payload = event.payload || event.data || {}
    const timestamp = Number(event.timestamp || payload.timestamp || 0)
    const nonce = String(event.nonce || payload.nonce || '')
    const signature = String(event.signature || payload.signature || '')
    const action = String(event.action || '')
    const windowMs = Number(windowSeconds || 300) * 1000
    if (!timestamp || !nonce || !signature || !action) return false
    if (Math.abs(Date.now() - timestamp) > windowMs) return false
    const cleanPayload = Object.assign({}, payload)
    delete cleanPayload.signature
    delete cleanPayload.timestamp
    delete cleanPayload.nonce
    const base = [action, timestamp, nonce, Security.stableStringify(cleanPayload)].join('\n')
    const expected = Security.hmac(secret, base)
    return Security.safeEqual(signature, expected)
  }

  static validateFileMeta(meta, options) {
    if (!meta) return { ok: true }
    const opts = options || {}
    const maxSize = opts.maxSize || 5 * 1024 * 1024
    const allowTypes = opts.allowTypes || ['image/jpeg', 'image/png', 'image/webp']
    const size = Number(meta.size || 0)
    const type = String(meta.type || meta.mimeType || '')
    if (size && size > maxSize) return { ok: false, message: '文件大小超过限制' }
    if (type && !allowTypes.includes(type)) return { ok: false, message: '文件类型不允许' }
    return { ok: true }
  }

  static validateCloudFileId(fileId) {
    const text = String(fileId || '').trim()
    if (!text) return true
    if (text.length > 220) return false
    return /^cloud:\/\//.test(text) || /^https:\/\//.test(text)
  }
}

module.exports = { Security }
