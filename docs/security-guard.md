# 安全守护实现清单

本项目已按安全功能模块要求完成对应实现，PHP 场景中的 PDO/Session 等内容已转换为微信小程序 + 云开发 + JavaScript 的实现方式。

## 1. API 频率限制

实现位置：

```text
cloudfunctions/api/index.js
cloudfunctions/api/core/RateLimiter.js
cloudfunctions/api/config/security.config.js
```

实现方式：

- 基于 `IP + openid + action + 时间窗口` 生成限流键。
- 限流数据写入 `rateLimits` 集合。
- 超限后返回 `TOO_MANY_REQUESTS`。
- 超限事件写入 `securityEvents`。

已覆盖接口：

```text
bootstrapAdmin
createVehicle
resolveQr
createViolation
manageOfficer
exportData
```

## 2. CSRF 防护

实现位置：

```text
cloudfunctions/api/core/Security.js
cloudfunctions/api/index.js
```

接口：

```text
getSecurityToken
```

启用方式：

```text
REQUIRE_CSRF=true
CSRF_SECRET=随机强密钥
```

实现方式：

- 通过 HMAC 生成 CSRF Token。
- Token 包含时间戳、有效期、随机 nonce、签名。
- 对写操作接口进行校验。

## 3. 注入防护

本项目使用云数据库，不直接拼接 SQL。已做 NoSQL 注入防护：

实现位置：

```text
cloudfunctions/api/core/Security.js
cloudfunctions/api/index.js
```

实现方式：

- 递归清理输入对象。
- 丢弃以 `$` 开头的键。
- 丢弃包含 `.` 的键。
- 后台 `adminList` 只允许访问白名单集合。
- 所有输入字段都经过长度和格式校验。

## 4. XSS 防护

实现方式：

- 云函数输入过滤 `<`、`>` 和控制字符。
- 小程序 WXML 默认文本转义。
- Web 后台使用 `escapeHtml` 输出转义。
- 不允许用户输入 HTML 作为页面内容渲染。

对应文件：

```text
cloudfunctions/api/core/Security.js
campus-vehicle-admin-web/app.js
```

## 5. Session / 身份安全

小程序端不使用传统 PHP Session，使用微信 openid 识别身份。

实现方式：

- `cloud.getWXContext()` 获取 openid。
- 后端从 `officers` 集合查询保卫科/管理员身份。
- 权限判断在云函数中执行，不依赖前端页面。
- 管理员初始化使用一次性 `BOOTSTRAP_CODE`。

## 6. 密码安全

小程序正式后端不使用账号密码作为核心身份凭证，而使用微信 openid 授权。

已提供密码强度方法，供 Web 后台或未来账号密码登录使用：

```text
Security.validatePasswordStrength(password)
```

如后续使用独立账号密码登录，应采用：

- 强密码校验；
- 加盐哈希；
- 登录失败限流；
- 登录日志；
- 定期更换密码。

## 7. 文件上传安全

实现位置：

```text
cloudfunctions/api/core/Security.js
cloudfunctions/api/index.js
```

实现方式：

- 校验文件元数据 `photoMeta`。
- 限制大小，默认 5MB。
- 允许类型：`image/jpeg`、`image/png`、`image/webp`。
- 校验 `photoFileId` 格式。
- 车辆照片和违停照片应通过云存储保存。

## 8. 异常行为检测

实现位置：

```text
securityEvents
scanLogs
rateLimits
```

记录事件：

```text
RATE_LIMIT
API_ERROR
BOOTSTRAP_ADMIN
ADD_OFFICER
ENABLE_OFFICER
DISABLE_OFFICER
REVIEW_VEHICLE
REVOKE_VEHICLE
ROTATE_TOKEN
```

## 9. 登录日志

实现位置：

```text
login 接口
scanLogs 集合
```

记录内容：

- openid；
- 操作人；
- 角色；
- IP；
- User-Agent；
- 时间；
- 成功/失败结果。

## 10. 请求签名验证

实现位置：

```text
cloudfunctions/api/core/Security.js
cloudfunctions/api/index.js
```

启用方式：

```text
REQUIRE_SIGNATURE=true
API_SIGNATURE_SECRET=随机强密钥
SIGNATURE_TIME_WINDOW=300
```

签名内容：

```text
action + timestamp + nonce + stableJson(payload)
```

防护能力：

- 防止请求被篡改；
- 限制重放窗口；
- 配合 nonce 和 timestamp 使用。

## 生产环境必做

1. 设置强随机 `TOKEN_PEPPER`。
2. 数据库集合前端不可直接读写。
3. 初始化管理员后删除或更换 `BOOTSTRAP_CODE`。
4. 只给保卫科和管理员最小必要权限。
5. 开启数据导出审计。
6. 定期检查 `securityEvents` 和 `scanLogs`。
7. 云存储照片不设为公开访问。
8. 如接 Web 后台，必须使用 HTTPS。
9. 如启用外部 API，开启签名验证。
10. 定期清理离校、离职、注销车辆数据。
