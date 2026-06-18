module.exports = {
  csrf: {
    enabled: process.env.REQUIRE_CSRF === 'true'
  },
  signature: {
    enabled: process.env.REQUIRE_SIGNATURE === 'true',
    timeWindow: Number(process.env.SIGNATURE_TIME_WINDOW || 300)
  },
  rateLimits: {
    bootstrapAdmin: { limit: 5, windowSeconds: 3600 },
    createVehicle: { limit: 20, windowSeconds: 86400 },
    resolveQr: { limit: 120, windowSeconds: 3600 },
    createViolation: { limit: 80, windowSeconds: 3600 },
    manageOfficer: { limit: 30, windowSeconds: 3600 },
    exportData: { limit: 10, windowSeconds: 3600 }
  },
  upload: {
    maxSize: 5 * 1024 * 1024,
    allowTypes: ['image/jpeg', 'image/png', 'image/webp']
  }
}
