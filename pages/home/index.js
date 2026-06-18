const db = require('../../utils/db.js')

Page({
  data: {},

  goStudent() {
    db.setRole('student')
    wx.navigateTo({ url: '/pages/student/form/index?ownerType=student' })
  },

  goTeacher() {
    db.setRole('teacher')
    wx.navigateTo({ url: '/pages/student/form/index?ownerType=teacher' })
  },

  goQr() {
    wx.navigateTo({ url: '/pages/student/qrcode/index' })
  },

  goOfficer() {
    db.setRole('officer')
    wx.navigateTo({ url: '/pages/officer/scan/index' })
  },

  goAdmin() {
    db.setRole('admin')
    wx.navigateTo({ url: '/pages/admin/index' })
  }
})
