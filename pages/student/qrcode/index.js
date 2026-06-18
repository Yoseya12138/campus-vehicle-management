const db = require('../../../utils/db.js')
const qrcode = require('../../../utils/qrcode.js')

Page({
  data: {
    owner: {},
    vehicle: null,
    qrText: '',
    hasVehicle: false,
    token: ''
  },

  onLoad(options) {
    this.setData({ token: db.normalizeToken(options.token || '') })
  },

  onShow() {
    let current
    if (this.data.token) {
      const found = db.findByToken(this.data.token)
      current = { owner: found.owner, vehicle: found.vehicle }
    } else {
      current = db.getLastRegistration()
    }

    if (!current || !current.vehicle) {
      this.setData({ hasVehicle: false })
      return
    }

    const view = db.findByToken(current.vehicle.token).view
    const qrText = 'EBIKE:v1:' + current.vehicle.token
    this.setData({
      owner: current.owner || {},
      vehicle: view,
      qrText,
      hasVehicle: true
    })
    setTimeout(() => this.drawQr(qrText), 100)
  },

  drawQr(text) {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const count = qr.getModuleCount()
    const size = 260
    const cell = Math.floor(size / count)
    const actualSize = cell * count
    const margin = Math.floor((size - actualSize) / 2)
    const ctx = wx.createCanvasContext('qrCanvas', this)
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, size, size)
    ctx.setFillStyle('#111111')
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(margin + col * cell, margin + row * cell, cell, cell)
        }
      }
    }
    ctx.draw()
  },

  goForm() {
    wx.navigateTo({ url: '/pages/student/form/index' })
  },

  copyToken() {
    wx.setClipboardData({ data: this.data.qrText })
  },

  goOfficerDetail() {
    db.setRole('officer')
    wx.navigateTo({ url: '/pages/officer/detail/index?token=' + encodeURIComponent(this.data.vehicle.token) })
  },

  saveQr() {
    wx.canvasToTempFilePath({
      canvasId: 'qrCanvas',
      width: 260,
      height: 260,
      destWidth: 520,
      destHeight: 520,
      success: res => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
        })
      },
      fail: () => wx.showToast({ title: '生成图片失败', icon: 'none' })
    }, this)
  }
})
