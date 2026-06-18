const { Security } = require('./Security')

class ApiMiddleware {
  constructor(options) {
    this.options = options || {}
  }

  checkSecurity(event, ctx, routeOptions) {
    const opts = routeOptions || {}
    if (opts.signature) {
      const ok = Security.validateRequestSignature(event, this.options.signatureSecret, this.options.signatureTimeWindow || 300)
      if (!ok) return { code: 'INVALID_SIGNATURE', message: '请求签名验证失败', statusCode: 401 }
    }
    if (opts.csrf) {
      const payload = event.payload || event.data || {}
      const ok = Security.validateCSRFToken(payload.csrfToken, ctx.openid, this.options.csrfSecret)
      if (!ok) return { code: 'INVALID_CSRF', message: 'CSRF验证失败', statusCode: 403 }
    }
    if (opts.requireOfficer && !(ctx.user && ['admin', 'officer'].includes(ctx.user.role))) {
      return { code: 'FORBIDDEN', message: '无权访问', statusCode: 403 }
    }
    if (opts.requireAdmin && !(ctx.user && ctx.user.role === 'admin')) {
      return { code: 'ADMIN_REQUIRED', message: '需要管理员权限', statusCode: 403 }
    }
    return null
  }
}

module.exports = { ApiMiddleware }
