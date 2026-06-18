# 后端管理界面网页

目录：`admin-web/`

## 运行方式

这是一个无依赖的静态管理后台页面，直接用浏览器打开即可预览：

```bash
cd admin-web
python3 -m http.server 8080
```

访问：`http://localhost:8080`

## 已包含功能

### 总览

- 车辆、学生、教职工、违停、日志统计
- 待审核车辆快捷编辑/通过
- 待处理违停快捷编辑/处理

### 车辆管理 CRUD

- 新增车辆
- 查询车辆：关键词、车主类型、审核状态、车辆状态
- 编辑车辆：车主、类型、品牌、颜色、编号、区域、二维码、审核状态、车辆状态
- 删除车辆：同时删除该车辆关联的违停记录
- 快捷审核：通过、驳回
- 快捷状态：作废、恢复

### 人员管理 CRUD

- 学生：新增、查询、编辑、删除
- 教职工：新增、查询、编辑、删除
- 管理人员/保卫科：新增、查询、编辑、删除
- 删除学生/教职工时，会同步删除其名下车辆及车辆关联违停记录

### 违停管理 CRUD

- 新增违停记录
- 查询违停：关键词、处理状态
- 编辑违停：关联车辆、地点、备注、状态、时间
- 删除违停
- 快捷处理：标记已处理、忽略

### 审计日志 CRUD

- 查询日志：关键词、成功/失败
- 手动新增日志
- 编辑日志
- 删除日志

### 数据与配置

- 导出当前数据为 JSON
- 配置 API Base URL 和管理员 Token，对接云函数/后端接口

## 与小程序/云函数联动

默认使用浏览器 `localStorage` 作为数据缓存，已具备完整增删改查交互。

对接云函数后端：

1. 将 `cloudfunctions/api` 云函数发布为 HTTP 服务；
2. 或自建一个后端接口，转发到云函数/数据库。

后台页面默认发送格式：

```json
{
  "action": "adminList",
  "payload": { "collection": "vehicles", "page": 1, "pageSize": 100 }
}
```

现有云函数已包含这些后台动作：

- `adminDashboard`
- `adminList`
- `reviewVehicle`
- `revokeVehicle`
- `restoreVehicle`
- `updateViolationStatus`
- `exportData`
- `manageOfficer`

如果要让网页端新增/编辑/删除也直接写入云数据库，建议后续补充以下后端动作：

- `createAdminRecord`
- `updateAdminRecord`
- `deleteAdminRecord`

或分别提供车辆、人员、违停的专用 CRUD API。
