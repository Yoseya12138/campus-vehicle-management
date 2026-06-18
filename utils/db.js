const cloudApi = require('./cloudApi.js')

const STORAGE_KEY = 'campus_vehicle_db_v2'
const ROLE_KEY = 'campus_vehicle_role_v2'
const LAST_VEHICLE_KEY = 'campus_vehicle_last_v2'

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function now() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function randomToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 16; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}

function uniqueToken(db) {
  let token = randomToken()
  while (db.vehicles.some(item => item.token === token)) {
    token = randomToken()
  }
  return token
}

function defaultDb() {
  return {
    version: 2,
    students: [],
    teachers: [],
    vehicles: [],
    officers: [],
    scanLogs: [],
    violations: []
  }
}

function ensureShape(db) {
  if (!db || typeof db !== 'object') return defaultDb()
  db.version = 2
  db.students = Array.isArray(db.students) ? db.students : []
  db.teachers = Array.isArray(db.teachers) ? db.teachers : []
  db.vehicles = Array.isArray(db.vehicles) ? db.vehicles : []
  db.officers = Array.isArray(db.officers) ? db.officers : []
  db.scanLogs = Array.isArray(db.scanLogs) ? db.scanLogs : []
  db.violations = Array.isArray(db.violations) ? db.violations : []
  db.vehicles.forEach(item => {
    if (!item.ownerType) item.ownerType = 'student'
    if (!item.vehicleType) item.vehicleType = '电动车'
    if (!item.status) item.status = 'active'
    if (!item.reviewStatus) item.reviewStatus = item.status === 'revoked' ? 'rejected' : 'pending'
  })
  db.violations.forEach(item => {
    if (!item.status) item.status = 'pending'
  })
  return db
}

function init() {
  let db = wx.getStorageSync(STORAGE_KEY)
  if (!db) {
    db = defaultDb()
    wx.setStorageSync(STORAGE_KEY, db)
  } else {
    db = ensureShape(db)
    wx.setStorageSync(STORAGE_KEY, db)
  }
  const role = wx.getStorageSync(ROLE_KEY)
  if (!role) {
    wx.setStorageSync(ROLE_KEY, 'guest')
  }
  syncFromCloud()
}

function syncFromCloud() {
  if (!wx.cloud) return
  cloudApi.login().then(data => {
    if (data && data.role) {
      wx.setStorageSync(ROLE_KEY, data.role)
    }
    return cloudApi.myVehicles()
  }).then(vehicles => {
    if (!vehicles || !vehicles.length) return
    const db = ensureShape(wx.getStorageSync(STORAGE_KEY))
    const existingIds = new Set(db.vehicles.map(v => v.id))
    vehicles.forEach(v => {
      if (!existingIds.has(v.id || v._id)) {
        db.vehicles.push(v)
      }
    })
    wx.setStorageSync(STORAGE_KEY, db)
  }).catch(() => {})
}

function load() {
  init()
  return ensureShape(wx.getStorageSync(STORAGE_KEY))
}

function save(db) {
  wx.setStorageSync(STORAGE_KEY, ensureShape(db))
}

function reset() {
  const db = defaultDb()
  wx.setStorageSync(STORAGE_KEY, db)
  wx.removeStorageSync(LAST_VEHICLE_KEY)
  wx.setStorageSync(ROLE_KEY, 'guest')
}

function roleName(role) {
  const map = {
    guest: '普通人员',
    student: '学生',
    teacher: '教师/教职工',
    officer: '保卫科人员',
    admin: '管理员'
  }
  return map[role] || '普通人员'
}

function ownerTypeName(ownerType) {
  return ownerType === 'teacher' ? '教师/教职工' : '学生'
}

function statusName(status) {
  const map = {
    active: '正常',
    revoked: '已作废',
    deleted: '已删除'
  }
  return map[status] || '正常'
}

function reviewStatusName(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回'
  }
  return map[status] || '待审核'
}

function violationStatusName(status) {
  const map = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已处理',
    ignored: '已忽略'
  }
  return map[status] || '待处理'
}

function getRole() {
  init()
  return wx.getStorageSync(ROLE_KEY) || 'guest'
}

function setRole(role) {
  wx.setStorageSync(ROLE_KEY, role)
}

function canViewDetail(role) {
  return role === 'officer' || role === 'admin'
}

function maskPhone(phone) {
  if (!phone) return ''
  if (phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function maskNo(no) {
  if (!no) return ''
  if (no.length <= 6) return no
  return no.slice(0, 4) + '****' + no.slice(-3)
}

function normalizeToken(input) {
  let text = (input || '').trim()
  if (!text) return ''
  try {
    text = decodeURIComponent(text)
  } catch (e) {}

  const sceneMatch = text.match(/[?&]scene=([^&]+)/)
  if (sceneMatch && sceneMatch[1]) return sceneMatch[1].trim()

  const tokenMatch = text.match(/[?&]token=([^&]+)/)
  if (tokenMatch && tokenMatch[1]) return tokenMatch[1].trim()

  const ebikeMatch = text.match(/EBIKE:v\d+:([A-Za-z0-9_-]+)/)
  if (ebikeMatch && ebikeMatch[1]) return ebikeMatch[1].trim()

  return text.replace(/^EBIKE:/, '').trim()
}

function getStudentById(db, id) {
  return db.students.find(item => item.id === id)
}

function getTeacherById(db, id) {
  return db.teachers.find(item => item.id === id)
}

function getOwnerByVehicle(db, vehicle) {
  if (!vehicle) return null
  if (vehicle.ownerType === 'teacher') return getTeacherById(db, vehicle.ownerId) || null
  return getStudentById(db, vehicle.ownerId) || null
}

function getVehicleById(db, id) {
  return db.vehicles.find(item => item.id === id)
}

function getLastRegistration() {
  const db = load()
  const lastId = wx.getStorageSync(LAST_VEHICLE_KEY)
  let vehicle = lastId ? getVehicleById(db, lastId) : null
  if (!vehicle) vehicle = db.vehicles[0] || null
  const owner = getOwnerByVehicle(db, vehicle)
  return { owner, student: owner, vehicle }
}

function getLocalStudentAndVehicle() {
  return getLastRegistration()
}

function createOwnerVehicle(form, photoFilePath) {
  const db = load()
  const t = now()
  const ownerType = form.ownerType === 'teacher' ? 'teacher' : 'student'
  let owner

  if (ownerType === 'teacher') {
    owner = {
      id: uid('teacher'),
      openid: 'teacher_' + Date.now(),
      name: form.name || '',
      employeeNo: form.employeeNo || '',
      department: form.department || '',
      title: form.title || '',
      phone: form.phone || '',
      verified: false,
      createdAt: t,
      updatedAt: t
    }
    db.teachers.unshift(owner)
  } else {
    owner = {
      id: uid('student'),
      openid: 'student_' + Date.now(),
      name: form.name || '',
      studentNo: form.studentNo || '',
      college: form.college || '',
      className: form.className || '',
      phone: form.phone || '',
      verified: false,
      createdAt: t,
      updatedAt: t
    }
    db.students.unshift(owner)
  }

  const vehicle = {
    id: uid('vehicle'),
    ownerType,
    ownerId: owner.id,
    vehicleType: form.vehicleType || '电动车',
    plateNo: form.plateNo || '',
    brand: form.brand || '',
    color: form.color || '',
    campusArea: form.campusArea || '',
    photoFilePath: photoFilePath || '',
    token: uniqueToken(db),
    status: 'active',
    reviewStatus: 'pending',
    createdAt: t,
    updatedAt: t
  }
  db.vehicles.unshift(vehicle)
  save(db)
  wx.setStorageSync(LAST_VEHICLE_KEY, vehicle.id)

  if (wx.cloud) {
    cloudApi.createVehicle({
      ownerType,
      name: owner.name,
      studentNo: owner.studentNo || '',
      employeeNo: owner.employeeNo || '',
      college: owner.college || '',
      department: owner.department || '',
      className: owner.className || '',
      title: owner.title || '',
      phone: owner.phone || '',
      vehicleType: vehicle.vehicleType,
      plateNo: vehicle.plateNo,
      brand: vehicle.brand,
      color: vehicle.color,
      campusArea: vehicle.campusArea,
      photoFilePath: vehicle.photoFilePath
    }).catch(() => {})
  }

  return { owner, student: owner, vehicle }
}

function saveStudentAndVehicle(form, photoFilePath) {
  const merged = Object.assign({}, form, { ownerType: 'student' })
  return createOwnerVehicle(merged, photoFilePath)
}

function buildVehicleView(db, vehicle) {
  const owner = getOwnerByVehicle(db, vehicle) || {}
  const isTeacher = vehicle.ownerType === 'teacher'
  const ownerNo = isTeacher ? (owner.employeeNo || '') : (owner.studentNo || '')
  const org = isTeacher ? (owner.department || '') : (owner.college || '')
  const classOrTitle = isTeacher ? (owner.title || '') : (owner.className || '')
  return {
    id: vehicle.id,
    ownerType: vehicle.ownerType || 'student',
    ownerTypeText: ownerTypeName(vehicle.ownerType),
    ownerId: vehicle.ownerId || '',
    token: vehicle.token,
    qrText: 'EBIKE:v1:' + vehicle.token,
    status: vehicle.status,
    statusText: statusName(vehicle.status),
    reviewStatus: vehicle.reviewStatus || 'pending',
    reviewStatusText: reviewStatusName(vehicle.reviewStatus || 'pending'),
    vehicleType: vehicle.vehicleType || '电动车',
    plateNo: vehicle.plateNo || '',
    brand: vehicle.brand || '',
    color: vehicle.color || '',
    campusArea: vehicle.campusArea || '',
    photoFilePath: vehicle.photoFilePath || '',
    createdAt: vehicle.createdAt || '',
    updatedAt: vehicle.updatedAt || '',
    name: owner.name || '',
    ownerNo,
    ownerNoMasked: maskNo(ownerNo),
    ownerNoLabel: isTeacher ? '工号' : '学号',
    org,
    orgLabel: isTeacher ? '部门/学院' : '学院',
    classOrTitle,
    classOrTitleLabel: isTeacher ? '职务/身份' : '班级',
    phone: owner.phone || '',
    phoneMasked: maskPhone(owner.phone || ''),
    verified: !!owner.verified,
    studentId: owner.id || '',
    studentNo: ownerNo,
    college: org,
    className: classOrTitle,
    department: org,
    title: classOrTitle
  }
}

function listVehicleViews(filters) {
  const db = load()
  const f = filters || {}
  let list = db.vehicles.map(item => buildVehicleView(db, item))
  if (f.includeDeleted !== true) {
    list = list.filter(item => item.status !== 'deleted')
  }
  if (f.ownerType && f.ownerType !== 'all') {
    list = list.filter(item => item.ownerType === f.ownerType)
  }
  if (f.status && f.status !== 'all') {
    list = list.filter(item => item.status === f.status)
  }
  if (f.reviewStatus && f.reviewStatus !== 'all') {
    list = list.filter(item => item.reviewStatus === f.reviewStatus)
  }
  const keyword = String(f.keyword || '').trim().toLowerCase()
  if (keyword) {
    list = list.filter(item => [item.name, item.ownerNo, item.phone, item.plateNo, item.brand, item.color, item.campusArea, item.token].join(' ').toLowerCase().indexOf(keyword) !== -1)
  }
  return list
}

function getVehicleViewById(vehicleId) {
  const db = load()
  const vehicle = getVehicleById(db, vehicleId)
  return vehicle ? buildVehicleView(db, vehicle) : null
}

function findByToken(rawToken) {
  const token = normalizeToken(rawToken)
  const db = load()
  const vehicle = db.vehicles.find(item => item.token === token)
  if (!vehicle) {
    return { token, vehicle: null, owner: null, student: null, view: null }
  }
  const owner = getOwnerByVehicle(db, vehicle) || null
  return { token, vehicle, owner, student: owner, view: buildVehicleView(db, vehicle) }
}

function addScanLog(rawToken, action, success) {
  const db = load()
  const token = normalizeToken(rawToken)
  const found = db.vehicles.find(item => item.token === token)
  const view = found ? buildVehicleView(db, found) : null
  db.scanLogs.unshift({
    id: uid('scan'),
    token,
    vehicleId: found ? found.id : '',
    ownerType: view ? view.ownerType : '',
    ownerName: view ? view.name : '',
    operatorRole: getRole(),
    operatorName: roleName(getRole()),
    action: action || 'scan',
    success: !!success,
    createdAt: now()
  })
  save(db)

  if (wx.cloud && found) {
    cloudApi.resolveQr(token, false).catch(() => {})
  }
}

function addViolation(vehicleId, form, imagePath) {
  const db = load()
  const vehicle = getVehicleById(db, vehicleId)
  if (!vehicle) return null
  const view = buildVehicleView(db, vehicle)
  const item = {
    id: uid('violation'),
    vehicleId,
    token: vehicle.token,
    ownerType: view.ownerType,
    ownerName: view.name,
    officerRole: getRole(),
    location: form.location || '',
    remark: form.remark || '',
    photoFilePath: imagePath || '',
    status: 'pending',
    statusText: violationStatusName('pending'),
    createdAt: now(),
    updatedAt: now()
  }
  db.violations.unshift(item)
  save(db)

  if (wx.cloud) {
    cloudApi.createViolation({
      vehicleId,
      token: vehicle.token,
      location: form.location || '',
      remark: form.remark || '',
      photoFilePath: imagePath || ''
    }).catch(() => {})
  }

  return item
}

function listViolations(vehicleId) {
  const db = load()
  let list = db.violations.map(item => Object.assign({}, item, { statusText: violationStatusName(item.status) }))
  if (vehicleId) {
    list = list.filter(item => item.vehicleId === vehicleId)
  }
  return list
}

function updateVehicleStatus(vehicleId, status) {
  const db = load()
  const vehicle = getVehicleById(db, vehicleId)
  if (!vehicle) return false
  vehicle.status = status
  vehicle.updatedAt = now()
  save(db)

  if (wx.cloud) {
    if (status === 'revoked') {
      cloudApi.revokeVehicle(vehicleId).catch(() => {})
    } else if (status === 'active') {
      cloudApi.restoreVehicle(vehicleId).catch(() => {})
    }
  }

  return true
}

function updateVehicleReview(vehicleId, reviewStatus) {
  const db = load()
  const vehicle = getVehicleById(db, vehicleId)
  if (!vehicle) return false
  vehicle.reviewStatus = reviewStatus
  vehicle.updatedAt = now()
  save(db)

  if (wx.cloud) {
    cloudApi.reviewVehicle(vehicleId, reviewStatus).catch(() => {})
  }

  return true
}

function updateViolationStatus(violationId, status) {
  const db = load()
  const item = db.violations.find(v => v.id === violationId)
  if (!item) return false
  item.status = status
  item.statusText = violationStatusName(status)
  item.updatedAt = now()
  save(db)

  if (wx.cloud) {
    cloudApi.updateViolationStatus(violationId, status).catch(() => {})
  }

  return true
}

function listLogs() {
  return load().scanLogs
}

function dashboard() {
  const db = load()
  return {
    students: db.students.length,
    teachers: db.teachers.length,
    vehicles: db.vehicles.filter(item => item.status !== 'deleted').length,
    activeVehicles: db.vehicles.filter(item => item.status === 'active').length,
    revokedVehicles: db.vehicles.filter(item => item.status === 'revoked').length,
    pendingVehicles: db.vehicles.filter(item => item.reviewStatus === 'pending').length,
    officers: db.officers.length,
    logs: db.scanLogs.length,
    violations: db.violations.length,
    pendingViolations: db.violations.filter(item => item.status === 'pending').length
  }
}

function getTables() {
  const db = load()
  return {
    students: db.students,
    teachers: db.teachers,
    vehicles: db.vehicles,
    officers: db.officers,
    scanLogs: db.scanLogs,
    violations: db.violations
  }
}

function exportJson() {
  return JSON.stringify(load(), null, 2)
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value)
  return '"' + text.replace(/"/g, '""') + '"'
}

function makeCsvSection(title, headers, rows) {
  const lines = []
  lines.push(title)
  lines.push(headers.map(csvCell).join(','))
  rows.forEach(row => {
    lines.push(headers.map(key => csvCell(row[key])).join(','))
  })
  return lines.join('\n')
}

function exportCsv() {
  const db = load()
  const sections = [
    makeCsvSection('students', ['id', 'name', 'studentNo', 'college', 'className', 'phone', 'verified', 'createdAt'], db.students),
    makeCsvSection('teachers', ['id', 'name', 'employeeNo', 'department', 'title', 'phone', 'verified', 'createdAt'], db.teachers),
    makeCsvSection('vehicles', ['id', 'ownerType', 'ownerId', 'vehicleType', 'plateNo', 'brand', 'color', 'campusArea', 'token', 'status', 'reviewStatus', 'createdAt'], db.vehicles),
    makeCsvSection('scanLogs', ['id', 'token', 'vehicleId', 'ownerType', 'ownerName', 'operatorName', 'action', 'success', 'createdAt'], db.scanLogs),
    makeCsvSection('violations', ['id', 'vehicleId', 'token', 'ownerType', 'ownerName', 'location', 'remark', 'status', 'createdAt', 'updatedAt'], db.violations)
  ]
  return sections.join('\n\n')
}

module.exports = {
  init,
  load,
  save,
  reset,
  now,
  getRole,
  setRole,
  roleName,
  ownerTypeName,
  statusName,
  reviewStatusName,
  violationStatusName,
  canViewDetail,
  maskPhone,
  normalizeToken,
  getLocalStudentAndVehicle,
  getLastRegistration,
  createOwnerVehicle,
  saveStudentAndVehicle,
  listVehicleViews,
  getVehicleViewById,
  findByToken,
  addScanLog,
  addViolation,
  listViolations,
  updateVehicleStatus,
  updateVehicleReview,
  updateViolationStatus,
  listLogs,
  dashboard,
  getTables,
  exportJson,
  exportCsv
}
