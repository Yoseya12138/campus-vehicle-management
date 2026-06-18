const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { Security } = require('./core/Security')
const securityConfig = require('./config/security.config')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTIONS = {
  students: 'students',
  teachers: 'teachers',
  vehicles: 'vehicles',
  officers: 'officers',
  scanLogs: 'scanLogs',
  violations: 'violations',
  rateLimits: 'rateLimits',
  securityEvents: 'securityEvents'
}

const MAX_PAGE_SIZE = 100
const TOKEN_PREFIX = 'EBIKE:v1:'

function now() {
  return new Date()
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

function hmacToken(token) {
  const pepper = process.env.TOKEN_PEPPER || 'CHANGE_ME_IN_CLOUD_ENV'
  return crypto.createHmac('sha256', pepper).update(String(token)).digest('hex')
}

function randomToken() {
  return crypto.randomBytes(18).toString('base64url').replace(/[-_]/g, '').slice(0, 24).toUpperCase()
}

function normalizeToken(input) {
  let text = String(input || '').trim()
  try { text = decodeURIComponent(text) } catch (e) {}
  const scene = text.match(/[?&]scene=([^&]+)/)
  if (scene) return scene[1].trim()
  const token = text.match(/[?&]token=([^&]+)/)
  if (token) return token[1].trim()
  const ebike = text.match(/EBIKE:v\d+:([A-Za-z0-9_-]+)/)
  if (ebike) return ebike[1].trim()
  return text.replace(/^EBIKE:/, '').trim()
}

function cleanString(value, maxLen) {
  const text = String(value || '').trim().replace(/[<>]/g, '')
  return text.slice(0, maxLen || 80)
}

function assert(condition, code, message, statusCode) {
  if (!condition) {
    const err = new Error(message || code)
    err.code = code
    err.statusCode = statusCode || 400
    throw err
  }
}

function maskPhone(phone) {
  phone = String(phone || '')
  if (phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function maskNo(no) {
  no = String(no || '')
  if (no.length <= 6) return no
  return no.slice(0, 4) + '****' + no.slice(-3)
}

function hasPermission(user, permission) {
  if (!user) return false
  if (user.role === 'admin') return true
  return Array.isArray(user.permissions) && user.permissions.includes(permission)
}

async function getOfficer(openid) {
  const res = await db.collection(COLLECTIONS.officers)
    .where({ openid, enabled: true })
    .limit(1)
    .get()
  return res.data[0] || null
}

function requireOfficer(ctx) {
  assert(ctx.user && ['admin', 'officer'].includes(ctx.user.role), 'FORBIDDEN', '无权访问', 403)
}

function requireAdmin(ctx) {
  assert(ctx.user && ctx.user.role === 'admin', 'ADMIN_REQUIRED', '需要管理员权限', 403)
}

async function rateLimit(ctx, action, limit, windowSeconds) {
  const openid = ctx.openid || 'unknown'
  const ip = ctx.clientIP || 'unknown_ip'
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = sha256([action, ip, openid, bucket].join(':')).slice(0, 48)
  const ref = db.collection(COLLECTIONS.rateLimits).doc(key)
  try {
    await db.collection(COLLECTIONS.rateLimits).add({
      data: {
        _id: key,
        action,
        openidHash: sha256(openid),
        ipHash: sha256(ip),
        bucket,
        count: 1,
        limit,
        expiresAt: new Date(Date.now() + windowSeconds * 1000 * 2),
        createdAt: now(),
        updatedAt: now()
      }
    })
    return
  } catch (e) {
    await ref.update({ data: { count: _.inc(1), updatedAt: now() } })
    const doc = await ref.get()
    const count = doc.data && doc.data.count ? doc.data.count : 0
    if (count > limit) {
      await writeSecurityEvent(ctx, 'RATE_LIMIT', { action, count, limit })
      assert(false, 'TOO_MANY_REQUESTS', '请求过于频繁', 429)
    }
  }
}

async function writeAudit(ctx, action, options) {
  options = options || {}
  await db.collection(COLLECTIONS.scanLogs).add({
    data: {
      openid: ctx.openid,
      operatorId: ctx.user ? ctx.user._id : '',
      operatorName: ctx.user ? ctx.user.name : '',
      operatorRole: ctx.user ? ctx.user.role : 'user',
      action,
      tokenHash: options.token ? hmacToken(normalizeToken(options.token)) : '',
      vehicleId: options.vehicleId || '',
      ownerType: options.ownerType || '',
      ownerName: options.ownerName || '',
      success: options.success !== false,
      ip: ctx.clientIP || '',
      userAgent: ctx.userAgent || '',
      remark: cleanString(options.remark || '', 200),
      createdAt: now()
    }
  })
}

async function writeSecurityEvent(ctx, eventType, detail) {
  await db.collection(COLLECTIONS.securityEvents).add({
    data: {
      eventType,
      openid: ctx.openid || '',
      operatorId: ctx.user ? ctx.user._id : '',
      operatorRole: ctx.user ? ctx.user.role : '',
      detail: detail || {},
      createdAt: now()
    }
  })
}

function sanitizeOwnerInput(payload) {
  const ownerType = payload.ownerType === 'teacher' ? 'teacher' : 'student'
  const phone = cleanString(payload.phone, 20)
  assert(/^1\d{10}$/.test(phone), 'INVALID_PHONE', '手机号格式错误')
  const common = {
    ownerType,
    name: cleanString(payload.name, 30),
    phone
  }
  assert(common.name, 'NAME_REQUIRED', '姓名不能为空')
  if (ownerType === 'teacher') {
    const employeeNo = cleanString(payload.employeeNo, 40)
    assert(employeeNo, 'EMPLOYEE_NO_REQUIRED', '工号不能为空')
    return Object.assign(common, {
      employeeNo,
      department: cleanString(payload.department, 80),
      title: cleanString(payload.title, 60)
    })
  }
  const studentNo = cleanString(payload.studentNo, 40)
  assert(studentNo, 'STUDENT_NO_REQUIRED', '学号不能为空')
  return Object.assign(common, {
    studentNo,
    college: cleanString(payload.college, 80),
    className: cleanString(payload.className, 60)
  })
}

function sanitizeVehicleInput(payload) {
  const brand = cleanString(payload.brand, 40)
  const color = cleanString(payload.color, 30)
  assert(brand, 'BRAND_REQUIRED', '车辆品牌不能为空')
  assert(color, 'COLOR_REQUIRED', '车辆颜色不能为空')
  const photoFileId = cleanString(payload.photoFileId, 220)
  const fileCheck = Security.validateFileMeta(payload.photoMeta, securityConfig.upload)
  assert(fileCheck.ok, 'INVALID_FILE', fileCheck.message || '文件不符合要求')
  assert(Security.validateCloudFileId(photoFileId), 'INVALID_FILE_ID', '文件地址不合法')
  return {
    vehicleType: cleanString(payload.vehicleType || '电动车', 30),
    plateNo: cleanString(payload.plateNo, 50),
    brand,
    color,
    campusArea: cleanString(payload.campusArea, 80),
    photoFileId
  }
}

async function buildVehicleView(vehicle, options) {
  options = options || {}
  const ownerCollection = vehicle.ownerType === 'teacher' ? COLLECTIONS.teachers : COLLECTIONS.students
  const ownerDoc = await db.collection(ownerCollection).doc(vehicle.ownerId).get().catch(() => null)
  const owner = ownerDoc && ownerDoc.data ? ownerDoc.data : {}
  const isTeacher = vehicle.ownerType === 'teacher'
  const ownerNo = isTeacher ? owner.employeeNo : owner.studentNo
  const phone = owner.phone || ''
  return {
    id: vehicle._id,
    ownerType: vehicle.ownerType,
    ownerTypeText: isTeacher ? '教职工' : '学生',
    ownerName: owner.name || '',
    ownerNoLabel: isTeacher ? '工号' : '学号',
    ownerNo: options.full ? ownerNo : maskNo(ownerNo),
    orgLabel: isTeacher ? '部门' : '学院',
    org: isTeacher ? owner.department : owner.college,
    classOrTitleLabel: isTeacher ? '职务' : '班级',
    classOrTitle: isTeacher ? owner.title : owner.className,
    phone: options.fullPhone ? phone : maskPhone(phone),
    vehicleType: vehicle.vehicleType,
    plateNo: vehicle.plateNo,
    brand: vehicle.brand,
    color: vehicle.color,
    campusArea: vehicle.campusArea,
    photoFileId: vehicle.photoFileId || '',
    tokenSuffix: vehicle.tokenSuffix || '',
    status: vehicle.status,
    reviewStatus: vehicle.reviewStatus || 'pending',
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt
  }
}

async function actionLogin(ctx) {
  await writeAudit(ctx, 'login', { success: true })
  return {
    openid: ctx.openid,
    role: ctx.user ? ctx.user.role : 'user',
    name: ctx.user ? ctx.user.name : '',
    permissions: ctx.user ? (ctx.user.permissions || []) : []
  }
}

async function actionGetSecurityToken(ctx) {
  return {
    csrfToken: Security.generateCSRFToken(ctx.openid, process.env.CSRF_SECRET || process.env.TOKEN_PEPPER || 'CHANGE_ME_IN_CLOUD_ENV', 7200),
    expiresIn: 7200
  }
}

async function actionBootstrapAdmin(ctx, payload) {
  await rateLimit(ctx, 'bootstrapAdmin', 5, 3600)
  const code = cleanString(payload.bootstrapCode, 120)
  assert(process.env.BOOTSTRAP_CODE && code === process.env.BOOTSTRAP_CODE, 'INVALID_BOOTSTRAP_CODE', '初始化码错误', 403)
  const existed = await db.collection(COLLECTIONS.officers).where({ role: 'admin', enabled: true }).count()
  assert(existed.total === 0, 'ADMIN_EXISTS', '管理员已存在', 409)
  const name = cleanString(payload.name || '系统管理员', 40)
  await db.collection(COLLECTIONS.officers).add({
    data: {
      openid: ctx.openid,
      name,
      department: cleanString(payload.department || '系统管理', 80),
      role: 'admin',
      enabled: true,
      permissions: ['VIEW_FULL_PHONE', 'EXPORT_DATA', 'MANAGE_OFFICER', 'REVOKE_VEHICLE'],
      createdAt: now(),
      updatedAt: now()
    }
  })
  await writeSecurityEvent(ctx, 'BOOTSTRAP_ADMIN', { name })
  return { ok: true }
}

async function actionCreateVehicle(ctx, payload) {
  await rateLimit(ctx, 'createVehicle', 20, 86400)
  const ownerInput = sanitizeOwnerInput(payload)
  const vehicleInput = sanitizeVehicleInput(payload)
  const privileged = ctx.user && ['admin', 'officer'].includes(ctx.user.role)
  const ownerCollection = ownerInput.ownerType === 'teacher' ? COLLECTIONS.teachers : COLLECTIONS.students
  const t = now()
  const ownerData = Object.assign({}, ownerInput)
  delete ownerData.ownerType
  ownerData.openid = privileged && payload.ownerOpenid ? cleanString(payload.ownerOpenid, 80) : ctx.openid
  ownerData.verified = !!privileged
  ownerData.reviewStatus = privileged ? 'approved' : 'pending'
  ownerData.createdAt = t
  ownerData.updatedAt = t

  const ownerRes = await db.collection(ownerCollection).add({ data: ownerData })
  const rawToken = randomToken()
  const vehicleData = Object.assign({}, vehicleInput, {
    ownerType: ownerInput.ownerType,
    ownerId: ownerRes._id,
    tokenHash: hmacToken(rawToken),
    tokenSuffix: rawToken.slice(-6),
    status: 'active',
    reviewStatus: privileged ? 'approved' : 'pending',
    createdByOpenid: ctx.openid,
    createdAt: t,
    updatedAt: t
  })
  const vehicleRes = await db.collection(COLLECTIONS.vehicles).add({ data: vehicleData })
  await writeAudit(ctx, 'create_vehicle', { token: rawToken, vehicleId: vehicleRes._id, ownerType: ownerInput.ownerType, ownerName: ownerInput.name })
  return {
    vehicleId: vehicleRes._id,
    ownerId: ownerRes._id,
    token: rawToken,
    qrText: TOKEN_PREFIX + rawToken,
    reviewStatus: vehicleData.reviewStatus
  }
}

async function actionResolveQr(ctx, payload) {
  requireOfficer(ctx)
  await rateLimit(ctx, 'resolveQr', 120, 3600)
  const token = normalizeToken(payload.token || payload.scene || payload.qrText)
  assert(token, 'TOKEN_REQUIRED', '二维码编号不能为空')
  const tokenHash = hmacToken(token)
  const res = await db.collection(COLLECTIONS.vehicles)
    .where({ tokenHash, status: 'active' })
    .limit(1)
    .get()
  if (!res.data.length) {
    await writeAudit(ctx, 'resolve_qr_not_found', { token, success: false })
    return { found: false }
  }
  const vehicle = res.data[0]
  const fullPhone = !!payload.fullPhone
  assert(!fullPhone || hasPermission(ctx.user, 'VIEW_FULL_PHONE'), 'NO_PHONE_PERMISSION', '无权查看完整手机号', 403)
  const view = await buildVehicleView(vehicle, { fullPhone, full: ctx.user.role === 'admin' })
  await writeAudit(ctx, fullPhone ? 'view_full_phone' : 'view_detail', {
    token,
    vehicleId: vehicle._id,
    ownerType: vehicle.ownerType,
    ownerName: view.ownerName
  })
  return { found: true, vehicle: view }
}

async function actionCreateViolation(ctx, payload) {
  requireOfficer(ctx)
  await rateLimit(ctx, 'createViolation', 80, 3600)
  const vehicleId = cleanString(payload.vehicleId, 80)
  const token = normalizeToken(payload.token || '')
  let vehicle = null
  if (vehicleId) {
    const doc = await db.collection(COLLECTIONS.vehicles).doc(vehicleId).get().catch(() => null)
    vehicle = doc && doc.data ? doc.data : null
  } else if (token) {
    const res = await db.collection(COLLECTIONS.vehicles).where({ tokenHash: hmacToken(token), status: 'active' }).limit(1).get()
    vehicle = res.data[0] || null
  }
  assert(vehicle, 'VEHICLE_NOT_FOUND', '车辆不存在', 404)
  const view = await buildVehicleView(vehicle)
  const data = {
    vehicleId: vehicle._id,
    tokenHash: vehicle.tokenHash,
    tokenSuffix: vehicle.tokenSuffix,
    ownerType: vehicle.ownerType,
    ownerName: view.ownerName,
    location: cleanString(payload.location, 120),
    remark: cleanString(payload.remark, 300),
    photoFileId: cleanString(payload.photoFileId, 220),
    status: 'pending',
    operatorOpenid: ctx.openid,
    operatorId: ctx.user._id,
    operatorName: ctx.user.name,
    createdAt: now(),
    updatedAt: now()
  }
  assert(data.location, 'LOCATION_REQUIRED', '违停地点不能为空')
  const res = await db.collection(COLLECTIONS.violations).add({ data })
  await writeAudit(ctx, 'create_violation', { vehicleId: vehicle._id, ownerType: vehicle.ownerType, ownerName: view.ownerName })
  return { id: res._id }
}

async function actionAdminList(ctx, payload) {
  requireAdmin(ctx)
  const collection = cleanString(payload.collection, 40)
  const allowed = [COLLECTIONS.students, COLLECTIONS.teachers, COLLECTIONS.vehicles, COLLECTIONS.officers, COLLECTIONS.scanLogs, COLLECTIONS.violations, COLLECTIONS.securityEvents]
  assert(allowed.includes(collection), 'INVALID_COLLECTION', '集合不允许访问')
  const page = Math.max(1, Number(payload.page || 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(payload.pageSize || 20)))
  const res = await db.collection(collection).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  const total = await db.collection(collection).count()
  const data = res.data.map(item => {
    if (collection === COLLECTIONS.vehicles) {
      delete item.tokenHash
    }
    if (collection === COLLECTIONS.officers) {
      delete item.password
    }
    return item
  })
  return { data, total: total.total, page, pageSize }
}

async function actionManageOfficer(ctx, payload) {
  requireAdmin(ctx)
  await rateLimit(ctx, 'manageOfficer', 30, 3600)
  const op = cleanString(payload.op, 20)
  if (op === 'add') {
    const openid = cleanString(payload.openid, 80)
    assert(openid, 'OPENID_REQUIRED', 'openid 不能为空')
    const role = payload.role === 'admin' ? 'admin' : 'officer'
    const data = {
      openid,
      name: cleanString(payload.name, 40),
      department: cleanString(payload.department, 80),
      role,
      permissions: Array.isArray(payload.permissions) ? payload.permissions.filter(x => ['VIEW_FULL_PHONE', 'EXPORT_DATA', 'REVOKE_VEHICLE'].includes(x)) : ['VIEW_FULL_PHONE'],
      enabled: true,
      createdAt: now(),
      updatedAt: now()
    }
    assert(data.name, 'NAME_REQUIRED', '姓名不能为空')
    const res = await db.collection(COLLECTIONS.officers).add({ data })
    await writeSecurityEvent(ctx, 'ADD_OFFICER', { officerId: res._id, role })
    return { id: res._id }
  }
  if (op === 'disable' || op === 'enable') {
    const id = cleanString(payload.id, 80)
    assert(id, 'ID_REQUIRED', 'id 不能为空')
    await db.collection(COLLECTIONS.officers).doc(id).update({ data: { enabled: op === 'enable', updatedAt: now() } })
    await writeSecurityEvent(ctx, op === 'enable' ? 'ENABLE_OFFICER' : 'DISABLE_OFFICER', { officerId: id })
    return { ok: true }
  }
  assert(false, 'INVALID_OPERATION', '操作无效')
}

async function actionReviewVehicle(ctx, payload) {
  requireAdmin(ctx)
  const vehicleId = cleanString(payload.vehicleId, 80)
  const reviewStatus = payload.reviewStatus === 'rejected' ? 'rejected' : 'approved'
  assert(vehicleId, 'VEHICLE_ID_REQUIRED', '车辆 id 不能为空')
  await db.collection(COLLECTIONS.vehicles).doc(vehicleId).update({ data: { reviewStatus, updatedAt: now() } })
  await writeSecurityEvent(ctx, 'REVIEW_VEHICLE', { vehicleId, reviewStatus })
  return { ok: true }
}

async function actionRevokeVehicle(ctx, payload) {
  requireAdmin(ctx)
  const vehicleId = cleanString(payload.vehicleId, 80)
  assert(vehicleId, 'VEHICLE_ID_REQUIRED', '车辆 id 不能为空')
  await db.collection(COLLECTIONS.vehicles).doc(vehicleId).update({ data: { status: 'revoked', revokedAt: now(), updatedAt: now() } })
  await writeSecurityEvent(ctx, 'REVOKE_VEHICLE', { vehicleId })
  return { ok: true }
}

async function actionRestoreVehicle(ctx, payload) {
  requireAdmin(ctx)
  const vehicleId = cleanString(payload.vehicleId, 80)
  assert(vehicleId, 'VEHICLE_ID_REQUIRED', '车辆 id 不能为空')
  await db.collection(COLLECTIONS.vehicles).doc(vehicleId).update({ data: { status: 'active', restoredAt: now(), updatedAt: now() } })
  await writeSecurityEvent(ctx, 'RESTORE_VEHICLE', { vehicleId })
  return { ok: true }
}

async function actionUpdateViolationStatus(ctx, payload) {
  requireAdmin(ctx)
  const violationId = cleanString(payload.violationId, 80)
  const allowed = ['pending', 'processing', 'resolved', 'ignored']
  const status = cleanString(payload.status, 20)
  assert(violationId, 'VIOLATION_ID_REQUIRED', '违停记录 id 不能为空')
  assert(allowed.includes(status), 'INVALID_STATUS', '状态不合法')
  await db.collection(COLLECTIONS.violations).doc(violationId).update({ data: { status, updatedAt: now() } })
  await writeSecurityEvent(ctx, 'UPDATE_VIOLATION_STATUS', { violationId, status })
  return { ok: true }
}

async function actionAdminDashboard(ctx) {
  requireAdmin(ctx)
  const out = {}
  for (const key of [COLLECTIONS.students, COLLECTIONS.teachers, COLLECTIONS.vehicles, COLLECTIONS.officers, COLLECTIONS.scanLogs, COLLECTIONS.violations]) {
    const res = await db.collection(key).count()
    out[key] = res.total
  }
  const pendingVehicles = await db.collection(COLLECTIONS.vehicles).where({ reviewStatus: 'pending' }).count()
  const activeVehicles = await db.collection(COLLECTIONS.vehicles).where({ status: 'active' }).count()
  const revokedVehicles = await db.collection(COLLECTIONS.vehicles).where({ status: 'revoked' }).count()
  const pendingViolations = await db.collection(COLLECTIONS.violations).where({ status: 'pending' }).count()
  return Object.assign(out, {
    pendingVehicles: pendingVehicles.total,
    activeVehicles: activeVehicles.total,
    revokedVehicles: revokedVehicles.total,
    pendingViolations: pendingViolations.total
  })
}

async function actionRotateVehicleToken(ctx, payload) {
  requireAdmin(ctx)
  const vehicleId = cleanString(payload.vehicleId, 80)
  assert(vehicleId, 'VEHICLE_ID_REQUIRED', '车辆 id 不能为空')
  const rawToken = randomToken()
  await db.collection(COLLECTIONS.vehicles).doc(vehicleId).update({
    data: {
      tokenHash: hmacToken(rawToken),
      tokenSuffix: rawToken.slice(-6),
      updatedAt: now()
    }
  })
  await writeSecurityEvent(ctx, 'ROTATE_TOKEN', { vehicleId })
  return { token: rawToken, qrText: TOKEN_PREFIX + rawToken }
}

async function actionExportData(ctx, payload) {
  requireAdmin(ctx)
  assert(hasPermission(ctx.user, 'EXPORT_DATA'), 'NO_EXPORT_PERMISSION', '无导出权限', 403)
  await rateLimit(ctx, 'exportData', 10, 3600)
  const collections = [COLLECTIONS.students, COLLECTIONS.teachers, COLLECTIONS.vehicles, COLLECTIONS.scanLogs, COLLECTIONS.violations]
  const out = {}
  for (const col of collections) {
    const res = await db.collection(col).limit(1000).get()
    out[col] = res.data.map(item => {
      if (col === COLLECTIONS.vehicles) delete item.tokenHash
      return item
    })
  }
  await writeAudit(ctx, 'export_data', { remark: cleanString(payload.reason || '', 200) })
  return { data: out, exportedAt: now() }
}

async function actionMyVehicles(ctx) {
  const ownerCollections = [COLLECTIONS.students, COLLECTIONS.teachers]
  const owners = []
  for (const col of ownerCollections) {
    const res = await db.collection(col).where({ openid: ctx.openid }).get()
    res.data.forEach(item => owners.push({ type: col === COLLECTIONS.teachers ? 'teacher' : 'student', id: item._id }))
  }
  const vehicles = []
  for (const owner of owners) {
    const res = await db.collection(COLLECTIONS.vehicles).where({ ownerType: owner.type, ownerId: owner.id, status: _.neq('deleted') }).get()
    for (const v of res.data) vehicles.push(await buildVehicleView(v))
  }
  return { data: vehicles }
}

const MUTATING_ACTIONS = new Set([
  'bootstrapAdmin',
  'createVehicle',
  'createViolation',
  'manageOfficer',
  'reviewVehicle',
  'revokeVehicle',
  'restoreVehicle',
  'updateViolationStatus',
  'rotateVehicleToken',
  'exportData'
])

async function checkOptionalSecurityGuards(action, ctx, payload, rawEvent) {
  if (!MUTATING_ACTIONS.has(action)) return
  if (securityConfig.csrf.enabled) {
    const secret = process.env.CSRF_SECRET || process.env.TOKEN_PEPPER || 'CHANGE_ME_IN_CLOUD_ENV'
    assert(Security.validateCSRFToken(payload.csrfToken, ctx.openid, secret), 'INVALID_CSRF', 'CSRF验证失败', 403)
  }
  if (securityConfig.signature.enabled) {
    const secret = process.env.API_SIGNATURE_SECRET || process.env.TOKEN_PEPPER || 'CHANGE_ME_IN_CLOUD_ENV'
    assert(Security.validateRequestSignature(rawEvent, secret, securityConfig.signature.timeWindow), 'INVALID_SIGNATURE', '请求签名验证失败', 401)
  }
}

async function route(action, ctx, payload) {
  const routes = {
    login: actionLogin,
    getSecurityToken: actionGetSecurityToken,
    bootstrapAdmin: actionBootstrapAdmin,
    createVehicle: actionCreateVehicle,
    resolveQr: actionResolveQr,
    createViolation: actionCreateViolation,
    adminDashboard: actionAdminDashboard,
    adminList: actionAdminList,
    manageOfficer: actionManageOfficer,
    reviewVehicle: actionReviewVehicle,
    revokeVehicle: actionRevokeVehicle,
    restoreVehicle: actionRestoreVehicle,
    updateViolationStatus: actionUpdateViolationStatus,
    rotateVehicleToken: actionRotateVehicleToken,
    exportData: actionExportData,
    myVehicles: actionMyVehicles
  }
  assert(routes[action], 'UNKNOWN_ACTION', '接口不存在', 404)
  return routes[action](ctx, payload || {})
}

exports.main = async (event, context) => {
  event = event || {}
  const wxContext = cloud.getWXContext()
  const action = cleanString(event.action, 40)
  const payload = Security.sanitizeInput(event.payload || event.data || {}) || {}
  const ctx = {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    clientIP: Security.getClientIp(event),
    userAgent: cleanString(event.userAgent || (event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '', 300),
    user: null
  }
  ctx.user = await getOfficer(ctx.openid)

  try {
    await checkOptionalSecurityGuards(action, ctx, payload, event)
    const data = await route(action, ctx, payload)
    return { ok: true, data }
  } catch (e) {
    await writeSecurityEvent(ctx, 'API_ERROR', { action, code: e.code || 'ERROR', message: e.message }).catch(() => {})
    return {
      ok: false,
      code: e.code || 'INTERNAL_ERROR',
      message: e.message || '系统错误',
      statusCode: e.statusCode || 500
    }
  }
}
