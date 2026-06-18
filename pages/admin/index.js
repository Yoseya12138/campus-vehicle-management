const db = require('../../utils/db.js')

Page({
  data: {
    denied: false,
    dashboard: {},
    vehicles: [],
    vehiclesRaw: [],
    students: [],
    teachers: [],
    officers: [],
    logs: [],
    violations: [],
    keyword: '',
    ownerTypeOptions: ['全部车主', '学生', '教职工'],
    ownerTypeValues: ['all', 'student', 'teacher'],
    ownerTypeIndex: 0,
    reviewOptions: ['全部审核', '待审核', '已通过', '已驳回'],
    reviewValues: ['all', 'pending', 'approved', 'rejected'],
    reviewIndex: 0,
    statusOptions: ['全部状态', '正常', '已作废'],
    statusValues: ['all', 'active', 'revoked'],
    statusIndex: 0
  },

  onShow() {
    this.reload()
  },

  reload() {
    if (db.getRole() !== 'admin') {
      this.setData({ denied: true })
      return
    }
    const tables = db.getTables()
    const filters = this.currentFilters()
    this.setData({
      denied: false,
      dashboard: db.dashboard(),
      vehicles: db.listVehicleViews(filters),
      vehiclesRaw: tables.vehicles,
      students: tables.students,
      teachers: tables.teachers,
      officers: tables.officers,
      logs: tables.scanLogs,
      violations: db.listViolations()
    })
  },

  currentFilters() {
    return {
      keyword: this.data.keyword,
      ownerType: this.data.ownerTypeValues[this.data.ownerTypeIndex],
      reviewStatus: this.data.reviewValues[this.data.reviewIndex],
      status: this.data.statusValues[this.data.statusIndex]
    }
  },

  becomeAdmin() {
    wx.showModal({
      title: '管理员验证',
      content: '请输入管理员验证码以获取管理权限。',
      editable: true,
      placeholderText: '请输入管理员口令',
      success: res => {
        if (res.confirm && res.content) {
          db.setRole('admin')
          this.reload()
          wx.showToast({ title: '验证成功', icon: 'success' })
        }
      }
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.reload()
  },

  changeOwnerType(e) {
    this.setData({ ownerTypeIndex: Number(e.detail.value) })
    this.reload()
  },

  changeReview(e) {
    this.setData({ reviewIndex: Number(e.detail.value) })
    this.reload()
  },

  changeStatus(e) {
    this.setData({ statusIndex: Number(e.detail.value) })
    this.reload()
  },

  clearFilters() {
    this.setData({ keyword: '', ownerTypeIndex: 0, reviewIndex: 0, statusIndex: 0 })
    this.reload()
  },

  approveVehicle(e) {
    const id = e.currentTarget.dataset.id
    db.updateVehicleReview(id, 'approved')
    db.updateVehicleStatus(id, 'active')
    this.reload()
    wx.showToast({ title: '已通过', icon: 'success' })
  },

  rejectVehicle(e) {
    const id = e.currentTarget.dataset.id
    db.updateVehicleReview(id, 'rejected')
    this.reload()
    wx.showToast({ title: '已驳回', icon: 'none' })
  },

  revokeVehicle(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认作废车辆？',
      content: '作废后扫码将不能作为正常车辆使用，可在后台恢复。',
      success: res => {
        if (!res.confirm) return
        db.updateVehicleStatus(id, 'revoked')
        this.reload()
        wx.showToast({ title: '已作废', icon: 'success' })
      }
    })
  },

  restoreVehicle(e) {
    const id = e.currentTarget.dataset.id
    db.updateVehicleStatus(id, 'active')
    this.reload()
    wx.showToast({ title: '已恢复', icon: 'success' })
  },

  updateViolationStatus(e) {
    const id = e.currentTarget.dataset.id
    const status = e.currentTarget.dataset.status
    db.updateViolationStatus(id, status)
    this.reload()
    wx.showToast({ title: status === 'resolved' ? '已处理' : '已忽略', icon: 'success' })
  },

  copyExport() {
    wx.setClipboardData({ data: db.exportJson() })
  },

  copyCsv() {
    wx.setClipboardData({ data: db.exportCsv() })
  },

  goRegisterStudent() {
    wx.navigateTo({ url: '/pages/student/form/index?ownerType=student' })
  },

  goRegisterTeacher() {
    wx.navigateTo({ url: '/pages/student/form/index?ownerType=teacher' })
  }
})
