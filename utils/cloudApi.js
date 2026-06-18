const CLOUD_FUNCTION_NAME = 'api'

function call(action, payload) {
  if (!wx.cloud) {
    return Promise.reject(new Error('当前环境未启用云开发'))
  }
  return wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: {
      action,
      payload: payload || {}
    }
  }).then(res => {
    const data = res.result || {}
    if (!data.ok) {
      const err = new Error(data.message || '请求失败')
      err.code = data.code
      err.statusCode = data.statusCode
      throw err
    }
    return data.data
  })
}

function login() {
  return call('login')
}

function getSecurityToken() {
  return call('getSecurityToken')
}

function createVehicle(payload) {
  return call('createVehicle', payload)
}

function resolveQr(token, fullPhone) {
  return call('resolveQr', { token, fullPhone: !!fullPhone })
}

function createViolation(payload) {
  return call('createViolation', payload)
}

function adminDashboard() {
  return call('adminDashboard')
}

function adminList(collection, page, pageSize) {
  return call('adminList', { collection, page, pageSize })
}

function manageOfficer(payload) {
  return call('manageOfficer', payload)
}

function reviewVehicle(vehicleId, reviewStatus) {
  return call('reviewVehicle', { vehicleId, reviewStatus })
}

function revokeVehicle(vehicleId) {
  return call('revokeVehicle', { vehicleId })
}

function restoreVehicle(vehicleId) {
  return call('restoreVehicle', { vehicleId })
}

function updateViolationStatus(violationId, status) {
  return call('updateViolationStatus', { violationId, status })
}

function rotateVehicleToken(vehicleId) {
  return call('rotateVehicleToken', { vehicleId })
}

function exportData(reason) {
  return call('exportData', { reason })
}

function myVehicles() {
  return call('myVehicles')
}

module.exports = {
  call,
  login,
  getSecurityToken,
  createVehicle,
  resolveQr,
  createViolation,
  adminDashboard,
  adminList,
  manageOfficer,
  reviewVehicle,
  revokeVehicle,
  restoreVehicle,
  updateViolationStatus,
  rotateVehicleToken,
  exportData,
  myVehicles
}
