const db = require('../../../utils/db.js')

Page({
  data: {
    token: '',
    denied: false,
    notFound: false,
    vehicle: null,
    phoneText: '',
    showFullPhone: false,
    violations: []
  },

  onLoad(options) {
    const token = db.normalizeToken(options.token || options.scene || '')
    this.setData({ token })
    this.loadDetail(token)
  },

  onShow() {
    if (this.data.token) this.loadDetail(this.data.token)
  },

  loadDetail(token) {
    const role = db.getRole()
    if (!db.canViewDetail(role)) {
      db.addScanLog(token, 'denied', false)
      this.setData({ denied: true, notFound: false, vehicle: null })
      return
    }

    const found = db.findByToken(token)
    if (!found.vehicle) {
      db.addScanLog(token, 'not_found', false)
      this.setData({ denied: false, notFound: true, vehicle: null })
      return
    }

    db.addScanLog(token, 'view_detail', true)
    this.setData({
      denied: false,
      notFound: false,
      vehicle: found.view,
      phoneText: found.view.phoneMasked,
      showFullPhone: false,
      violations: db.listViolations(found.view.id)
    })
  },

  showPhone() {
    if (!this.data.vehicle) return
    db.addScanLog(this.data.token, 'view_full_phone', true)
    this.setData({
      phoneText: this.data.vehicle.phone,
      showFullPhone: true
    })
  },

  makeCall() {
    if (!this.data.vehicle || !this.data.vehicle.phone) return
    wx.makePhoneCall({ phoneNumber: this.data.vehicle.phone })
  },

  goViolation() {
    if (!this.data.vehicle) return
    wx.navigateTo({ url: '/pages/officer/violation/index?vehicleId=' + this.data.vehicle.id })
  },

  goScan() {
    wx.redirectTo({ url: '/pages/officer/scan/index' })
  }
})
