# 云开发部署说明

## 1. 开通云开发

在微信开发者工具中打开项目，开通云开发环境。建议正式环境和测试环境分开：

```text
campus-vehicle-dev
campus-vehicle-prod
```

## 2. 设置环境变量

在云函数 `api` 的环境变量中设置：

```text
TOKEN_PEPPER=长度不少于32位的随机字符串
BOOTSTRAP_CODE=首次初始化管理员的一次性口令
CSRF_SECRET=CSRF随机强密钥，可选
API_SIGNATURE_SECRET=请求签名随机强密钥，可选
REQUIRE_CSRF=false
REQUIRE_SIGNATURE=false
SIGNATURE_TIME_WINDOW=300
```

生成随机密钥示例：

```bash
openssl rand -base64 32
```

## 3. 创建数据库集合

需要创建：

```text
students
teachers
vehicles
officers
scanLogs
violations
rateLimits
securityEvents
```

字段说明见：

```text
database/schema.json
```

索引建议见：

```text
database/indexes.json
```

权限建议见：

```text
database/permissions.md
```

## 4. 上传云函数

在微信开发者工具中右键：

```text
cloudfunctions/api
```

选择：

```text
上传并部署：云端安装依赖
```

## 5. 初始化第一个管理员

部署后，在小程序或临时调试代码中调用：

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    action: 'bootstrapAdmin',
    payload: {
      bootstrapCode: '你的 BOOTSTRAP_CODE',
      name: '管理员姓名',
      department: '保卫科/信息化部门'
    }
  }
})
```

初始化完成后，应立即更换或删除 `BOOTSTRAP_CODE`。

## 6. 调用接口示例

### 创建车辆登记

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    action: 'createVehicle',
    payload: {
      ownerType: 'student',
      name: '张三',
      studentNo: '2023123456',
      college: '信息工程学院',
      className: '计科2301',
      phone: '13800000000',
      vehicleType: '电动车',
      brand: '雅迪',
      color: '白色',
      plateNo: '学生车001',
      campusArea: '南校区'
    }
  }
})
```

返回：

```json
{
  "vehicleId": "...",
  "ownerId": "...",
  "token": "随机token",
  "qrText": "EBIKE:v1:随机token",
  "reviewStatus": "pending"
}
```

### 保卫科扫码查询

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    action: 'resolveQr',
    payload: {
      token: 'EBIKE:v1:二维码token'
    }
  }
})
```

### 查看完整手机号

```js
wx.cloud.callFunction({
  name: 'api',
  data: {
    action: 'resolveQr',
    payload: {
      token: 'EBIKE:v1:二维码token',
      fullPhone: true
    }
  }
})
```

## 7. 小程序接入方式

当前前端保留本地数据模式，便于离线开发。需要接入云端时，可使用：

```text
utils/cloudApi.js
```

将页面中的本地 `db.js` 方法替换为云函数调用即可。
