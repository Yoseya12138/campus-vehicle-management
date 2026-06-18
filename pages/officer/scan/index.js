const db = require('../../../utils/db.js')

Page({
  data: {
    manualCode: '',
    recentLogs: []
  },

  onShow() {
    db.setRole('officer')
    this.setData({ recentLogs: db.listLogs().slice(0, 8) })
  },

  onInput(e) {
    this.setData({ manualCode: e.detail.value })
  },

  scanCode() {
    wx.scanCode({
      onlyFromCamera: false,
      success: res => {
        this.openDetail(res.result)
      },
      fail: () => wx.showToast({ title: '扫码失败', icon: 'none' })
    })
  },

  search() {
    if (!this.data.manualCode) {
      wx.showToast({ title: '请输入二维码编号', icon: 'none' })
      return
    }
    this.openDetail(this.data.manualCode)
  },

  openDetail(raw) {
    const token = db.normalizeToken(raw)
    if (!token) {
      wx.showToast({ title: '二维码内容无效', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/officer/detail/index?token=' + encodeURIComponent(token) })
  }
})
