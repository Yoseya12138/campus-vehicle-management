const db = require('../../../utils/db.js')

Page({
  data: {
    vehicleId: '',
    vehicle: null,
    denied: false,
    imagePath: ''
  },

  onLoad(options) {
    const role = db.getRole()
    if (!db.canViewDetail(role)) {
      this.setData({ denied: true })
      return
    }
    const vehicleId = options.vehicleId || ''
    const all = db.listVehicleViews()
    const vehicle = all.find(item => item.id === vehicleId) || null
    this.setData({ vehicleId, vehicle })
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => this.setData({ imagePath: res.tempFilePaths[0] })
    })
  },

  onSubmit(e) {
    if (this.data.denied || !this.data.vehicle) return
    const v = e.detail.value
    if (!v.location) {
      wx.showToast({ title: '请填写违停地点', icon: 'none' })
      return
    }
    db.addViolation(this.data.vehicleId, v, this.data.imagePath)
    wx.showToast({ title: '已登记', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 500)
  }
})
