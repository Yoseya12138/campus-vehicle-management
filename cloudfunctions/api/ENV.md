# 云函数环境变量

在云函数 `api` 中设置以下环境变量：

```text
TOKEN_PEPPER=请替换为32位以上随机强密钥
BOOTSTRAP_CODE=首次初始化管理员的一次性口令
CSRF_SECRET=CSRF随机强密钥，可选
API_SIGNATURE_SECRET=请求签名随机强密钥，可选
REQUIRE_CSRF=false
REQUIRE_SIGNATURE=false
SIGNATURE_TIME_WINDOW=300
```

要求：

- `TOKEN_PEPPER` 不得写入前端代码。
- `TOKEN_PEPPER` 不得提交到公开仓库。
- `BOOTSTRAP_CODE` 初始化管理员后应立即更换或删除。
- 生产环境和测试环境必须使用不同密钥。
- 接入 Web 后台或第三方 API 时建议开启 `REQUIRE_SIGNATURE`。
- 如存在跨站表单或 Web 管理端请求，建议开启 `REQUIRE_CSRF`。
