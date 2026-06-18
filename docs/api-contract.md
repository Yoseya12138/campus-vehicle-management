# API 合同

统一云函数：`api`

调用格式：

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    action: '接口名',
    payload: {}
  }
})
```

返回格式：

```json
{
  "ok": true,
  "data": {}
}
```

错误格式：

```json
{
  "ok": false,
  "code": "FORBIDDEN",
  "message": "无权访问",
  "statusCode": 403
}
```

## login

获取当前 openid 与后台角色。

权限：微信用户。

## getSecurityToken

生成 CSRF Token。

权限：微信用户。

在开启 `REQUIRE_CSRF=true` 时，写操作需要把返回的 `csrfToken` 带入 payload。

## bootstrapAdmin

初始化第一个管理员。

权限：需要 `BOOTSTRAP_CODE`，且当前环境没有管理员。

## createVehicle

登记学生或教职工车辆。

权限：微信用户可提交；保卫科/管理员提交时可直接设为已审核。

## resolveQr

扫码查询车辆。

权限：保卫科或管理员。

参数：

```json
{
  "token": "EBIKE:v1:二维码token",
  "fullPhone": false
}
```

`fullPhone=true` 需要 `VIEW_FULL_PHONE` 权限。

## createViolation

登记违停记录。

权限：保卫科或管理员。

## adminDashboard

查询后台统计数据。

权限：管理员。

## adminList

分页查询后台数据。

权限：管理员。

## manageOfficer

新增、启用、停用保卫科/管理员。

权限：管理员。

## reviewVehicle

审核车辆登记。

权限：管理员。

## revokeVehicle

作废车辆二维码。

权限：管理员。

## restoreVehicle

恢复已作废车辆二维码。

权限：管理员。

## updateViolationStatus

更新违停记录状态，支持 `pending`、`processing`、`resolved`、`ignored`。

权限：管理员。

## rotateVehicleToken

重新生成车辆二维码 token。

权限：管理员。

## exportData

导出数据。

权限：管理员 + `EXPORT_DATA`。

## myVehicles

查询当前微信用户本人名下车辆。

权限：微信用户。
