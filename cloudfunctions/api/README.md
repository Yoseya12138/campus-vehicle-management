# 云函数 api

统一后端入口，前端通过 `wx.cloud.callFunction({ name: 'api', data: { action, payload } })` 调用。

## 环境变量

必填：

```text
TOKEN_PEPPER=二维码 token HMAC 加密盐，必须为随机强密钥
BOOTSTRAP_CODE=首次初始化管理员的一次性口令
```

可选：

```text
REQUIRE_CSRF=true
CSRF_SECRET=CSRF HMAC 密钥
REQUIRE_SIGNATURE=true
API_SIGNATURE_SECRET=API 请求签名密钥
SIGNATURE_TIME_WINDOW=300
```

## 核心安全模块

```text
core/Security.js       输入清理、输出转义、CSRF、签名、文件校验、密码强度
core/RateLimiter.js    频率限制
core/ApiMiddleware.js  API 安全中间件
config/security.config.js 安全配置
```

## 关键安全点

- 数据库不保存二维码明文 token，只保存 `tokenHash` 和后 6 位 `tokenSuffix`。
- 保卫科/管理员权限在云函数中校验，不能依赖前端页面判断。
- 查看完整手机号需要 `VIEW_FULL_PHONE` 权限。
- 导出数据需要 `EXPORT_DATA` 权限。
- 扫码、查看完整手机号、导出、管理人员变更均写入日志。
- 写操作可开启 CSRF 和请求签名验证。
- API 限流基于 `IP + openid + action + 时间窗口`。
