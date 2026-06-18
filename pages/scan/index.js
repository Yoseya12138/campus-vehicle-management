const db = require('../../utils/db.js')

Page({
  data: {
    token: '',
    roleName: '',
    canView: false
  },

  onLoad(options) {
    const token = db.normalizeToken(options.token || options.scene || '')
    const role = db.getRole()
    const canView = db.canViewDetail(role)
    this.setData({ token, roleName: db.roleName(role), canView })
    if (token && canView) {
      wx.redirectTo({ url: '/pages/officer/detail/index?token=' + encodeURIComponent(token) })
    }
  },

  goHome() {
    wx.redirectTo({ url: '/pages/home/index' })
  }
})
