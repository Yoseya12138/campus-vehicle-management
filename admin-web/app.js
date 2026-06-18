const STORAGE_KEY = 'campus_vehicle_admin_state_v2'
const CONFIG_KEY = 'campus_vehicle_admin_config_v2'

const statusText = { active: '正常', revoked: '已作废', deleted: '已删除' }
const reviewText = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
const violationText = { pending: '待处理', processing: '处理中', resolved: '已处理', ignored: '已忽略' }
const roleText = { admin: '管理员', officer: '保卫科', user: '普通用户' }

function pad(n) { return n < 10 ? `0${n}` : `${n}` }
function now() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }
function randomToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
function idOf(item) { return item && (item.id || item._id) }

const emptyState = () => ({
  students: [],
  teachers: [],
  vehicles: [],
  officers: [],
  scanLogs: [],
  violations: []
})

let state = normalizeState(loadState())
let config = loadConfig()
let currentView = 'dashboard'
let modalSubmit = null

function $(id) { return document.getElementById(id) }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]))
}
function normalizeState(input) {
  const base = input && typeof input === 'object' ? input : emptyState()
  ;['students', 'teachers', 'vehicles', 'officers', 'scanLogs', 'violations'].forEach(key => { if (!Array.isArray(base[key])) base[key] = [] })
  base.students.forEach(x => { if (!x.id && x._id) x.id = x._id })
  base.teachers.forEach(x => { if (!x.id && x._id) x.id = x._id })
  base.officers.forEach(x => { if (!x.id && x._id) x.id = x._id; if (x.enabled === undefined) x.enabled = true })
  base.vehicles.forEach(x => { if (!x.id && x._id) x.id = x._id; if (!x.status) x.status = 'active'; if (!x.reviewStatus) x.reviewStatus = 'pending'; if (!x.vehicleType) x.vehicleType = '电动车' })
  base.violations.forEach(x => { if (!x.id && x._id) x.id = x._id; if (!x.status) x.status = 'pending' })
  return base
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyState() } catch (e) { return emptyState() }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || { apiMode: true, baseUrl: '', token: '' } } catch (e) { return { apiMode: true, baseUrl: '', token: '' } }
}
function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)) }
function toast(message) {
  const el = $('toast')
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800)
}
function maskPhone(phone) {
  const text = String(phone || '')
  return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : text
}
function badge(text, type = '') { return `<span class="pill ${type}">${escapeHtml(text)}</span>` }
function actionButton(label, action, id, type = '') {
  return `<button class="action-btn ${type}" data-action="${action}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`
}
function includesKeyword(values, keyword) {
  if (!keyword) return true
  return values.map(v => String(v || '').toLowerCase()).join(' ').includes(keyword)
}
function addAudit(action, ownerName, token, success = true) {
  state.scanLogs.unshift({
    id: uid('scan'),
    createdAt: now(),
    operatorName: '管理员',
    action,
    success,
    ownerType: '',
    ownerName: ownerName || '',
    token: token || ''
  })
}

function ownerOf(vehicle) {
  const collection = vehicle.ownerType === 'teacher' ? state.teachers : state.students
  return collection.find(x => idOf(x) === vehicle.ownerId) || {}
}
function vehicleById(id) { return state.vehicles.find(v => idOf(v) === id) }
function ownerOptions() {
  const students = state.students.map(s => ({ value: `student:${idOf(s)}`, label: `学生：${s.name || '未命名'} / ${s.studentNo || idOf(s)}` }))
  const teachers = state.teachers.map(t => ({ value: `teacher:${idOf(t)}`, label: `教职工：${t.name || '未命名'} / ${t.employeeNo || idOf(t)}` }))
  return students.concat(teachers)
}
function vehicleOptions() {
  return state.vehicles.map(vehicleView).map(v => ({ value: idOf(v), label: `${v.ownerTypeText}：${v.ownerName || '未知车主'} / ${v.color || ''}${v.brand || ''} / ${v.token || ''}` }))
}
function vehicleView(vehicle) {
  const owner = ownerOf(vehicle)
  const isTeacher = vehicle.ownerType === 'teacher'
  return {
    ...vehicle,
    id: idOf(vehicle),
    ownerName: owner.name || '',
    ownerNo: isTeacher ? owner.employeeNo : owner.studentNo,
    org: isTeacher ? owner.department : owner.college,
    classOrTitle: isTeacher ? owner.title : owner.className,
    ownerTypeText: isTeacher ? '教职工' : '学生',
    phone: owner.phone || '',
    phoneMasked: maskPhone(owner.phone)
  }
}

async function apiCall(action, payload = {}) {
  if (!config.apiMode || !config.baseUrl) return null
  const res = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
    },
    body: JSON.stringify({ action, payload })
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.message || '接口请求失败')
  return data.data
}
async function refreshFromApi() {
  if (!config.apiMode || !config.baseUrl) return
  const collections = ['students', 'teachers', 'vehicles', 'officers', 'scanLogs', 'violations']
  const next = {}
  for (const col of collections) {
    const res = await apiCall('adminList', { collection: col, page: 1, pageSize: 100 })
    next[col] = (res && res.data) || []
  }
  state = normalizeState(next)
  saveState()
}

function dashboard() {
  return {
    vehicles: state.vehicles.filter(v => v.status !== 'deleted').length,
    active: state.vehicles.filter(v => v.status === 'active').length,
    pending: state.vehicles.filter(v => v.reviewStatus === 'pending').length,
    violations: state.violations.length,
    pendingViolations: state.violations.filter(v => v.status === 'pending').length,
    logs: state.scanLogs.length,
    students: state.students.length,
    teachers: state.teachers.length
  }
}
function renderStats() {
  const d = dashboard()
  const stats = [
    ['车辆总数', d.vehicles, ''], ['正常车辆', d.active, ''], ['待审核', d.pending, 'warn'], ['待处理违停', d.pendingViolations, 'danger'],
    ['学生', d.students, ''], ['教职工', d.teachers, ''], ['违停记录', d.violations, 'danger'], ['审计日志', d.logs, '']
  ]
  $('statsGrid').innerHTML = stats.map(([label, num, cls]) => `<div class="stat-card ${cls}"><div class="num">${num}</div><div class="label">${label}</div></div>`).join('')
}
function miniVehicleCard(v) {
  return `<div class="mini-card"><strong>${escapeHtml(v.ownerTypeText)}：${escapeHtml(v.ownerName || '未知车主')}</strong><p>${escapeHtml(v.color)} ${escapeHtml(v.brand)} / ${escapeHtml(v.plateNo || '未填写')}</p><p>二维码：${escapeHtml(v.token || '')}</p><div class="card-actions">${actionButton('编辑', 'editVehicle', v.id)}${actionButton('通过', 'approveVehicle', v.id, 'ok')}</div></div>`
}
function miniViolationCard(v) {
  return `<div class="mini-card"><strong>${escapeHtml(v.ownerName)} · ${escapeHtml(v.location)}</strong><p>${escapeHtml(v.createdAt || '')}</p><p>${escapeHtml(v.remark || '无备注')}</p><div class="card-actions">${actionButton('编辑', 'editViolation', idOf(v))}${actionButton('已处理', 'resolveViolation', idOf(v), 'ok')}</div></div>`
}
function renderDashboard() {
  renderStats()
  const pendingVehicles = state.vehicles.map(vehicleView).filter(v => v.reviewStatus === 'pending')
  const pendingViolations = state.violations.filter(v => v.status === 'pending')
  $('pendingCount').textContent = pendingVehicles.length
  $('pendingViolationCount').textContent = pendingViolations.length
  $('pendingVehicleList').innerHTML = pendingVehicles.length ? pendingVehicles.map(miniVehicleCard).join('') : '<div class="empty">暂无待审核车辆</div>'
  $('pendingViolationList').innerHTML = pendingViolations.length ? pendingViolations.map(miniViolationCard).join('') : '<div class="empty">暂无待处理违停</div>'
}

function vehicleFilters() {
  return {
    keyword: $('vehicleKeyword')?.value.trim().toLowerCase() || '',
    ownerType: $('ownerFilter')?.value || 'all',
    reviewStatus: $('reviewFilter')?.value || 'all',
    status: $('statusFilter')?.value || 'all'
  }
}
function filteredVehicles() {
  const f = vehicleFilters()
  return state.vehicles.map(vehicleView).filter(v => {
    if (v.status === 'deleted') return false
    if (f.ownerType !== 'all' && v.ownerType !== f.ownerType) return false
    if (f.reviewStatus !== 'all' && v.reviewStatus !== f.reviewStatus) return false
    if (f.status !== 'all' && v.status !== f.status) return false
    return includesKeyword([v.ownerName, v.ownerNo, v.phone, v.brand, v.color, v.plateNo, v.campusArea, v.token], f.keyword)
  })
}
function renderVehicles() {
  const rows = filteredVehicles()
  $('vehicleTable').innerHTML = rows.length ? rows.map(v => `
    <tr>
      <td><strong>${escapeHtml(v.ownerTypeText)}：${escapeHtml(v.ownerName || '未知车主')}</strong><div class="sub">${escapeHtml(v.ownerNo || '')} · ${escapeHtml(v.org || '')} ${escapeHtml(v.classOrTitle || '')}</div><div class="sub">${escapeHtml(v.phoneMasked)}</div></td>
      <td>${escapeHtml(v.vehicleType || '电动车')} / ${escapeHtml(v.color)} ${escapeHtml(v.brand)}<div class="sub">${escapeHtml(v.plateNo || '未填写')} · ${escapeHtml(v.campusArea || '未填写')}</div></td>
      <td>${escapeHtml(v.token || '')}</td>
      <td>${badge(reviewText[v.reviewStatus] || '待审核', v.reviewStatus === 'approved' ? 'ok' : v.reviewStatus === 'rejected' ? 'danger' : 'warn')}</td>
      <td>${badge(statusText[v.status] || '正常', v.status === 'revoked' ? 'danger' : 'ok')}</td>
      <td><div class="actions">${actionButton('编辑', 'editVehicle', v.id)}${actionButton('删除', 'deleteVehicle', v.id, 'danger')}${actionButton('通过', 'approveVehicle', v.id, 'ok')}${actionButton('驳回', 'rejectVehicle', v.id, 'warn')}${v.status === 'revoked' ? actionButton('恢复', 'restoreVehicle', v.id, 'ok') : actionButton('作废', 'revokeVehicle', v.id, 'danger')}</div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">暂无匹配车辆</td></tr>'
}

function filteredViolations() {
  const keyword = $('violationKeyword')?.value.trim().toLowerCase() || ''
  const status = $('violationStatusFilter')?.value || 'all'
  return state.violations.filter(v => {
    if (status !== 'all' && v.status !== status) return false
    return includesKeyword([v.ownerName, v.location, v.remark, v.token], keyword)
  })
}
function renderViolations() {
  const rows = filteredViolations()
  $('violationTable').innerHTML = rows.length ? rows.map(v => `
    <tr>
      <td>${escapeHtml(v.createdAt || '')}</td><td><strong>${escapeHtml(v.ownerName || '')}</strong><div class="sub">${escapeHtml(v.token || '')}</div></td>
      <td>${escapeHtml(v.location || '')}</td><td>${escapeHtml(v.remark || '无')}</td>
      <td>${badge(violationText[v.status] || '待处理', v.status === 'pending' ? 'warn' : v.status === 'ignored' ? 'danger' : 'ok')}</td>
      <td><div class="actions">${actionButton('编辑', 'editViolation', idOf(v))}${actionButton('删除', 'deleteViolation', idOf(v), 'danger')}${actionButton('标记已处理', 'resolveViolation', idOf(v), 'ok')}${actionButton('忽略', 'ignoreViolation', idOf(v), 'warn')}</div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">暂无违停记录</td></tr>'
}

function renderPeople() {
  const studentKeyword = $('studentKeyword')?.value.trim().toLowerCase() || ''
  const teacherKeyword = $('teacherKeyword')?.value.trim().toLowerCase() || ''
  const officerKeyword = $('officerKeyword')?.value.trim().toLowerCase() || ''
  const students = state.students.filter(s => includesKeyword([s.name, s.studentNo, s.college, s.className, s.phone], studentKeyword))
  const teachers = state.teachers.filter(t => includesKeyword([t.name, t.employeeNo, t.department, t.title, t.phone], teacherKeyword))
  const officers = state.officers.filter(o => includesKeyword([o.name, o.department, o.role], officerKeyword))
  $('studentCount').textContent = state.students.length
  $('teacherCount').textContent = state.teachers.length
  $('officerCount').textContent = state.officers.length
  $('studentList').innerHTML = students.map(s => `<div class="mini-card"><strong>${escapeHtml(s.name)} / ${escapeHtml(s.studentNo)}</strong><p>${escapeHtml(s.college || '')} ${escapeHtml(s.className || '')}</p><p>${escapeHtml(maskPhone(s.phone))}</p><div class="card-actions">${actionButton('编辑', 'editStudent', idOf(s))}${actionButton('删除', 'deleteStudent', idOf(s), 'danger')}</div></div>`).join('') || '<div class="empty">暂无学生</div>'
  $('teacherList').innerHTML = teachers.map(t => `<div class="mini-card"><strong>${escapeHtml(t.name)} / ${escapeHtml(t.employeeNo)}</strong><p>${escapeHtml(t.department || '')} ${escapeHtml(t.title || '')}</p><p>${escapeHtml(maskPhone(t.phone))}</p><div class="card-actions">${actionButton('编辑', 'editTeacher', idOf(t))}${actionButton('删除', 'deleteTeacher', idOf(t), 'danger')}</div></div>`).join('') || '<div class="empty">暂无教职工</div>'
  $('officerList').innerHTML = officers.map(o => `<div class="mini-card"><strong>${escapeHtml(o.name)} / ${escapeHtml(roleText[o.role] || o.role)}</strong><p>${escapeHtml(o.department || '')}</p><p>${o.enabled === false ? '已停用' : '已启用'}</p><div class="card-actions">${actionButton('编辑', 'editOfficer', idOf(o))}${actionButton('删除', 'deleteOfficer', idOf(o), 'danger')}</div></div>`).join('') || '<div class="empty">暂无管理人员</div>'
}

function filteredLogs() {
  const keyword = $('logKeyword')?.value.trim().toLowerCase() || ''
  const result = $('logResultFilter')?.value || 'all'
  return state.scanLogs.filter(l => {
    if (result !== 'all' && String(l.success !== false) !== result) return false
    return includesKeyword([l.operatorName, l.action, l.ownerName, l.token], keyword)
  })
}
function renderLogs() {
  const rows = filteredLogs()
  $('logTable').innerHTML = rows.length ? rows.map(l => `
    <tr><td>${escapeHtml(l.createdAt || '')}</td><td>${escapeHtml(l.operatorName || '')}</td><td>${escapeHtml(l.action || '')}</td><td>${escapeHtml(l.ownerType || '')} ${escapeHtml(l.ownerName || '')}<div class="sub">${escapeHtml(l.token || '')}</div></td><td>${l.success === false ? badge('失败', 'danger') : badge('成功', 'ok')}</td><td><div class="actions">${actionButton('编辑', 'editLog', idOf(l))}${actionButton('删除', 'deleteLog', idOf(l), 'danger')}</div></td></tr>`).join('') : '<tr><td colspan="6" class="empty">暂无日志</td></tr>'
}
function renderSettings() {
  $('apiBaseUrl').value = config.baseUrl || ''
  $('apiToken').value = config.token || ''
  $('apiMode').checked = !!config.apiMode
}
function renderAll() {
  renderDashboard(); renderVehicles(); renderViolations(); renderPeople(); renderLogs(); renderSettings()
}
function setView(view) {
  currentView = view
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`))
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view))
  const titles = {
    dashboard: ['总览', '车辆登记、审核、扫码日志与违停闭环管理'],
    vehicles: ['车辆管理', '新增、查询、编辑、删除车辆及审核状态'],
    violations: ['违停管理', '新增、查询、编辑、删除违停事件'],
    people: ['人员管理', '学生、教职工和管理人员增删改查'],
    logs: ['审计日志', '查询、编辑、删除扫码和敏感操作记录'],
    settings: ['接口配置', '配置后端接口地址，后续与小程序云函数联动']
  }
  $('pageTitle').textContent = titles[view][0]
  $('pageSubtitle').textContent = titles[view][1]
}

function fieldHtml(field) {
  const value = field.value ?? ''
  const required = field.required ? 'required' : ''
  const cls = `form-field ${field.full ? 'full' : ''}`
  const help = field.help ? `<div class="form-help">${escapeHtml(field.help)}</div>` : ''
  if (field.type === 'select') {
    const options = (field.options || []).map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')
    return `<div class="${cls}"><label>${escapeHtml(field.label)}</label><select name="${escapeHtml(field.name)}" ${required}>${options}</select>${help}</div>`
  }
  if (field.type === 'textarea') {
    return `<div class="${cls}"><label>${escapeHtml(field.label)}</label><textarea name="${escapeHtml(field.name)}" ${required}>${escapeHtml(value)}</textarea>${help}</div>`
  }
  return `<div class="${cls}"><label>${escapeHtml(field.label)}</label><input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(value)}" ${required} />${help}</div>`
}
function openForm(title, fields, onSubmit) {
  $('modalTitle').textContent = title
  $('modalForm').innerHTML = fields.map(fieldHtml).join('') + '<div class="modal-actions"><button type="button" class="ghost-btn" id="modalCancelBtn">取消</button><button type="submit" class="primary-btn">保存</button></div>'
  modalSubmit = onSubmit
  $('modalMask').hidden = false
  $('modalCancelBtn').addEventListener('click', closeModal)
}
function closeModal() {
  $('modalMask').hidden = true
  $('modalForm').innerHTML = ''
  modalSubmit = null
}
function readForm(form) {
  const data = {}
  new FormData(form).forEach((value, key) => { data[key] = String(value).trim() })
  return data
}
function confirmDelete(message) { return window.confirm(message || '确认删除？此操作不可恢复。') }
function afterChange(message, auditAction) {
  if (auditAction) addAudit(auditAction)
  saveState(); renderAll(); closeModal(); toast(message)
}

function studentFields(item = {}) {
  return [
    { name: 'name', label: '姓名', value: item.name, required: true },
    { name: 'studentNo', label: '学号', value: item.studentNo, required: true },
    { name: 'college', label: '学院', value: item.college },
    { name: 'className', label: '班级', value: item.className },
    { name: 'phone', label: '手机号', value: item.phone, required: true },
    { name: 'verified', label: '认证状态', type: 'select', value: String(item.verified !== false), options: [{ value: 'true', label: '已认证' }, { value: 'false', label: '未认证' }] }
  ]
}
function teacherFields(item = {}) {
  return [
    { name: 'name', label: '姓名', value: item.name, required: true },
    { name: 'employeeNo', label: '工号', value: item.employeeNo, required: true },
    { name: 'department', label: '部门/学院', value: item.department },
    { name: 'title', label: '职务/身份', value: item.title },
    { name: 'phone', label: '手机号', value: item.phone, required: true },
    { name: 'verified', label: '认证状态', type: 'select', value: String(item.verified !== false), options: [{ value: 'true', label: '已认证' }, { value: 'false', label: '未认证' }] }
  ]
}
function officerFields(item = {}) {
  return [
    { name: 'openid', label: 'OpenID (微信号)', value: item.openid, help: '微信用户的唯一标识，用于关联小程序登录' },
    { name: 'name', label: '姓名', value: item.name, required: true },
    { name: 'department', label: '部门', value: item.department },
    { name: 'role', label: '角色', type: 'select', value: item.role || 'officer', options: [{ value: 'officer', label: '保卫科' }, { value: 'admin', label: '管理员' }] },
    { name: 'enabled', label: '账号状态', type: 'select', value: String(item.enabled !== false), options: [{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }] }
  ]
}
function vehicleFields(item = {}) {
  const owners = ownerOptions()
  const currentOwnerKey = item.ownerType && item.ownerId ? `${item.ownerType}:${item.ownerId}` : (owners[0] && owners[0].value)
  return [
    { name: 'ownerKey', label: '车主', type: 'select', value: currentOwnerKey, options: owners, required: true, full: true, help: owners.length ? '如需新车主，请先到“人员管理”新增学生或教职工。' : '请先到“人员管理”新增车主。' },
    { name: 'vehicleType', label: '车辆类型', value: item.vehicleType || '电动车' },
    { name: 'brand', label: '品牌', value: item.brand, required: true },
    { name: 'color', label: '颜色', value: item.color, required: true },
    { name: 'plateNo', label: '校内编号/车牌号', value: item.plateNo },
    { name: 'campusArea', label: '校区/停放区域', value: item.campusArea },
    { name: 'token', label: '二维码编号', value: item.token || randomToken(), required: true },
    { name: 'reviewStatus', label: '审核状态', type: 'select', value: item.reviewStatus || 'pending', options: [{ value: 'pending', label: '待审核' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已驳回' }] },
    { name: 'status', label: '车辆状态', type: 'select', value: item.status || 'active', options: [{ value: 'active', label: '正常' }, { value: 'revoked', label: '已作废' }] }
  ]
}
function violationFields(item = {}) {
  const vehicle = item.vehicleId ? vehicleById(item.vehicleId) : null
  const view = vehicle ? vehicleView(vehicle) : null
  return [
    { name: 'vehicleId', label: '关联车辆', type: 'select', value: item.vehicleId || (vehicleOptions()[0] && vehicleOptions()[0].value), options: vehicleOptions(), required: true, full: true },
    { name: 'location', label: '违停地点', value: item.location, required: true, full: true },
    { name: 'status', label: '处理状态', type: 'select', value: item.status || 'pending', options: [{ value: 'pending', label: '待处理' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已处理' }, { value: 'ignored', label: '已忽略' }] },
    { name: 'createdAt', label: '记录时间', value: item.createdAt || now() },
    { name: 'remark', label: '备注', type: 'textarea', value: item.remark, full: true, help: view ? `当前车辆：${view.ownerName} / ${view.token}` : '' }
  ]
}
function logFields(item = {}) {
  return [
    { name: 'createdAt', label: '时间', value: item.createdAt || now(), required: true },
    { name: 'operatorName', label: '操作人', value: item.operatorName || '管理员', required: true },
    { name: 'action', label: '动作', value: item.action || 'manual_log', required: true },
    { name: 'ownerName', label: '对象姓名', value: item.ownerName },
    { name: 'ownerType', label: '对象类型', type: 'select', value: item.ownerType || '', options: [{ value: '', label: '无' }, { value: 'student', label: '学生' }, { value: 'teacher', label: '教职工' }] },
    { name: 'token', label: '二维码编号', value: item.token },
    { name: 'success', label: '结果', type: 'select', value: String(item.success !== false), options: [{ value: 'true', label: '成功' }, { value: 'false', label: '失败' }] }
  ]
}

function saveStudent(data, id) {
  const item = id ? state.students.find(x => idOf(x) === id) : { id: uid('student'), createdAt: now() }
  Object.assign(item, data, { verified: data.verified === 'true', updatedAt: now() })
  if (!id) state.students.unshift(item)
}
function saveTeacher(data, id) {
  const item = id ? state.teachers.find(x => idOf(x) === id) : { id: uid('teacher'), createdAt: now() }
  Object.assign(item, data, { verified: data.verified === 'true', updatedAt: now() })
  if (!id) state.teachers.unshift(item)
}
async function saveOfficer(data, id) {
  const item = id ? state.officers.find(x => idOf(x) === id) : { id: uid('officer'), createdAt: now() }
  Object.assign(item, data, { enabled: data.enabled === 'true', updatedAt: now() })
  if (!id) {
    state.officers.unshift(item)
    if (data.openid) {
      await apiCall('manageOfficer', { op: 'add', openid: data.openid, name: data.name, department: data.department, role: data.role }).catch(() => {})
    }
  }
}
function saveVehicle(data, id) {
  const [ownerType, ownerId] = String(data.ownerKey || '').split(':')
  const item = id ? state.vehicles.find(x => idOf(x) === id) : { id: uid('vehicle'), createdAt: now() }
  Object.assign(item, {
    ownerType, ownerId,
    vehicleType: data.vehicleType || '电动车',
    brand: data.brand,
    color: data.color,
    plateNo: data.plateNo,
    campusArea: data.campusArea,
    token: data.token,
    reviewStatus: data.reviewStatus,
    status: data.status,
    updatedAt: now()
  })
  if (!id) state.vehicles.unshift(item)
}
function saveViolation(data, id) {
  const vehicle = vehicleById(data.vehicleId)
  const view = vehicle ? vehicleView(vehicle) : {}
  const item = id ? state.violations.find(x => idOf(x) === id) : { id: uid('vio'), createdAt: data.createdAt || now() }
  Object.assign(item, {
    vehicleId: data.vehicleId,
    token: view.token || '',
    ownerType: view.ownerType || '',
    ownerName: view.ownerName || '',
    location: data.location,
    remark: data.remark,
    status: data.status,
    createdAt: data.createdAt || item.createdAt || now(),
    updatedAt: now()
  })
  if (!id) state.violations.unshift(item)
}
function saveLog(data, id) {
  const item = id ? state.scanLogs.find(x => idOf(x) === id) : { id: uid('scan') }
  Object.assign(item, data, { success: data.success === 'true' })
  if (!id) state.scanLogs.unshift(item)
}

function openStudentForm(id) {
  const item = id ? state.students.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑学生' : '新增学生', studentFields(item), data => { saveStudent(data, id); afterChange(id ? '学生已更新' : '学生已新增', id ? 'edit_student' : 'add_student') })
}
function openTeacherForm(id) {
  const item = id ? state.teachers.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑教职工' : '新增教职工', teacherFields(item), data => { saveTeacher(data, id); afterChange(id ? '教职工已更新' : '教职工已新增', id ? 'edit_teacher' : 'add_teacher') })
}
function openOfficerForm(id) {
  const item = id ? state.officers.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑管理人员' : '新增管理人员', officerFields(item), data => { saveOfficer(data, id); afterChange(id ? '管理人员已更新' : '管理人员已新增', id ? 'edit_officer' : 'add_officer') })
}
function openVehicleForm(id) {
  if (!ownerOptions().length) { toast('请先新增学生或教职工'); setView('people'); return }
  const item = id ? state.vehicles.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑车辆' : '新增车辆', vehicleFields(item), data => { saveVehicle(data, id); afterChange(id ? '车辆已更新' : '车辆已新增', id ? 'edit_vehicle' : 'add_vehicle') })
}
function openViolationForm(id) {
  if (!vehicleOptions().length) { toast('请先新增车辆'); setView('vehicles'); return }
  const item = id ? state.violations.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑违停' : '新增违停', violationFields(item), data => { saveViolation(data, id); afterChange(id ? '违停已更新' : '违停已新增', id ? 'edit_violation' : 'add_violation') })
}
function openLogForm(id) {
  const item = id ? state.scanLogs.find(x => idOf(x) === id) : {}
  openForm(id ? '编辑日志' : '新增日志', logFields(item), data => { saveLog(data, id); afterChange(id ? '日志已更新' : '日志已新增') })
}

function deleteOwner(type, id) {
  const name = type === 'student' ? '学生' : '教职工'
  if (!confirmDelete(`确认删除该${name}？其名下车辆和关联违停记录也会删除。`)) return
  const vehicleIds = state.vehicles.filter(v => v.ownerType === type && v.ownerId === id).map(idOf)
  state.vehicles = state.vehicles.filter(v => !(v.ownerType === type && v.ownerId === id))
  state.violations = state.violations.filter(v => !vehicleIds.includes(v.vehicleId))
  if (type === 'student') state.students = state.students.filter(x => idOf(x) !== id)
  else state.teachers = state.teachers.filter(x => idOf(x) !== id)
  addAudit(`delete_${type}`)
  saveState(); renderAll(); toast(`${name}已删除`)
}
function deleteBy(collection, id, message, auditAction) {
  if (!confirmDelete(message)) return
  if (collection === 'vehicles') {
    state.vehicles = state.vehicles.filter(x => idOf(x) !== id)
    state.violations = state.violations.filter(x => x.vehicleId !== id)
  } else {
    state[collection] = state[collection].filter(x => idOf(x) !== id)
  }
  if (auditAction !== false) addAudit(auditAction || `delete_${collection}`)
  saveState(); renderAll(); toast('已删除')
}

async function handleAction(action, id) {
  const vehicle = state.vehicles.find(v => idOf(v) === id)
  const violation = state.violations.find(v => idOf(v) === id)
  try {
    if (action === 'addStudent') return openStudentForm()
    if (action === 'editStudent') return openStudentForm(id)
    if (action === 'deleteStudent') return deleteOwner('student', id)
    if (action === 'addTeacher') return openTeacherForm()
    if (action === 'editTeacher') return openTeacherForm(id)
    if (action === 'deleteTeacher') return deleteOwner('teacher', id)
    if (action === 'addOfficer') return openOfficerForm()
    if (action === 'editOfficer') return openOfficerForm(id)
    if (action === 'deleteOfficer') {
      const officer = state.officers.find(x => idOf(x) === id)
      if (officer && officer.openid) {
        await apiCall('manageOfficer', { op: 'disable', officerOpenid: officer.openid }).catch(() => {})
      }
      return deleteBy('officers', id, '确认删除该管理人员？', 'delete_officer')
    }
    if (action === 'addVehicle') return openVehicleForm()
    if (action === 'editVehicle') return openVehicleForm(id)
    if (action === 'deleteVehicle') return deleteBy('vehicles', id, '确认删除该车辆？关联违停记录也会删除。', 'delete_vehicle')
    if (action === 'addViolation') return openViolationForm()
    if (action === 'editViolation') return openViolationForm(id)
    if (action === 'deleteViolation') return deleteBy('violations', id, '确认删除该违停记录？', 'delete_violation')
    if (action === 'addLog') return openLogForm()
    if (action === 'editLog') return openLogForm(id)
    if (action === 'deleteLog') return deleteBy('scanLogs', id, '确认删除该日志？', false)

    if (action === 'approveVehicle' && vehicle) {
      if (config.apiMode) await apiCall('reviewVehicle', { vehicleId: id, reviewStatus: 'approved' })
      vehicle.reviewStatus = 'approved'; vehicle.status = 'active'; vehicle.updatedAt = now(); addAudit('approve_vehicle', '', vehicle.token); toast('已通过审核')
    }
    if (action === 'rejectVehicle' && vehicle) {
      if (config.apiMode) await apiCall('reviewVehicle', { vehicleId: id, reviewStatus: 'rejected' })
      vehicle.reviewStatus = 'rejected'; vehicle.updatedAt = now(); addAudit('reject_vehicle', '', vehicle.token); toast('已驳回')
    }
    if (action === 'revokeVehicle' && vehicle) {
      if (config.apiMode) await apiCall('revokeVehicle', { vehicleId: id })
      vehicle.status = 'revoked'; vehicle.updatedAt = now(); addAudit('revoke_vehicle', '', vehicle.token); toast('已作废车辆')
    }
    if (action === 'restoreVehicle' && vehicle) {
      if (config.apiMode) await apiCall('restoreVehicle', { vehicleId: id })
      vehicle.status = 'active'; vehicle.updatedAt = now(); addAudit('restore_vehicle', '', vehicle.token); toast('已恢复车辆')
    }
    if (action === 'resolveViolation' && violation) {
      if (config.apiMode) await apiCall('updateViolationStatus', { violationId: id, status: 'resolved' })
      violation.status = 'resolved'; violation.updatedAt = now(); addAudit('resolve_violation', violation.ownerName, violation.token); toast('违停已处理')
    }
    if (action === 'ignoreViolation' && violation) {
      if (config.apiMode) await apiCall('updateViolationStatus', { violationId: id, status: 'ignored' })
      violation.status = 'ignored'; violation.updatedAt = now(); addAudit('ignore_violation', violation.ownerName, violation.token); toast('违停已忽略')
    }
    saveState(); renderAll()
  } catch (e) { toast(e.message || '操作失败') }
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)))
  ;['vehicleKeyword', 'ownerFilter', 'reviewFilter', 'statusFilter'].forEach(id => $(id).addEventListener('input', renderVehicles))
  ;['violationKeyword', 'violationStatusFilter'].forEach(id => $(id).addEventListener('input', renderViolations))
  ;['studentKeyword', 'teacherKeyword', 'officerKeyword'].forEach(id => $(id).addEventListener('input', renderPeople))
  ;['logKeyword', 'logResultFilter'].forEach(id => $(id).addEventListener('input', renderLogs))
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (btn) handleAction(btn.dataset.action, btn.dataset.id)
  })
  $('modalForm').addEventListener('submit', e => {
    e.preventDefault()
    if (modalSubmit) modalSubmit(readForm(e.currentTarget))
  })
  $('modalCloseBtn').addEventListener('click', closeModal)
  $('modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal() })
  $('refreshBtn').addEventListener('click', async () => {
    try { await refreshFromApi(); renderAll(); toast('已刷新') } catch (e) { toast(e.message || '刷新失败') }
  })
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `campus-vehicle-export-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  })
  $('saveConfigBtn').addEventListener('click', () => {
    config = { baseUrl: $('apiBaseUrl').value.trim(), token: $('apiToken').value.trim(), apiMode: $('apiMode').checked }
    saveConfig(); toast('配置已保存')
  })
}

bindEvents()
renderAll()
setView(currentView)
