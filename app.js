const db = require('./utils/db.js')

App({
  globalData: {
    appName: '校园车辆管理系统'
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true })
    }
    db.init()
  }
})
