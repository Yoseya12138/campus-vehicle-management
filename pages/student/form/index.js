const db = require('../../../utils/db.js')

Page({
  data: {
    ownerTypeOptions: ['学生', '教职工'],
    ownerTypeValues: ['student', 'teacher'],
    ownerTypeIndex: 0,
    ownerType: 'student',
    form: {},
    photoFilePath: '',
    recentVehicles: []
  },

  onLoad(options) {
    const ownerType = options.ownerType === 'teacher' ? 'teacher' : 'student'
    this.setData({
      ownerType,
      ownerTypeIndex: ownerType === 'teacher' ? 1 : 0
    })
  },

  onShow() {
    this.setData({
      recentVehicles: db.listVehicleViews().slice(0, 5)
    })
  },

  changeOwnerType(e) {
    const index = Number(e.detail.value)
    const ownerType = this.data.ownerTypeValues[index]
    this.setData({
      ownerTypeIndex: index,
      ownerType,
      form: {},
      photoFilePath: ''
    })
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setData({ photoFilePath: res.tempFilePaths[0] })
      }
    })
  },

  clearForm() {
    this.setData({ form: {}, photoFilePath: '' })
  },

  onSubmit(e) {
    const v = Object.assign({}, e.detail.value, { ownerType: this.data.ownerType })
    Object.keys(v).forEach(key => {
      if (typeof v[key] === 'string') v[key] = v[key].trim()
    })
    if (!v.name || !v.phone || !v.brand || !v.color) {
      wx.showToast({ title: '请补全必填信息', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(v.phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!Array.isArray(v.agree) || v.agree.indexOf('yes') === -1) {
      wx.showToast({ title: '请先确认信息采集用途', icon: 'none' })
      return
    }
    if (v.ownerType === 'student' && !v.studentNo) {
      wx.showToast({ title: '请填写学号', icon: 'none' })
      return
    }
    if (v.ownerType === 'teacher' && !v.employeeNo) {
      wx.showToast({ title: '请填写工号', icon: 'none' })
      return
    }

    const saved = db.createOwnerVehicle(v, this.data.photoFilePath)
    wx.showModal({
      title: '登记成功',
      content: '车辆二维码编号：' + saved.vehicle.token,
      showCancel: false,
      success: () => {
        wx.navigateTo({ url: '/pages/student/qrcode/index?token=' + saved.vehicle.token })
      }
    })
  }
})
