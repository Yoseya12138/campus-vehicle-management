# 校园车辆管理系统

## 功能模块

- 学生车辆登记
- 教职工车辆登记
- 车辆二维码生成
- 扫码查询
- 违停记录
- 管理后台
- 独立后端管理界面网页（`admin-web/`，支持车辆、人员、违停、日志增删改查）
- 车辆审核、作废/恢复、违停处理
- 数据导出

## 后端模块

项目已包含微信云开发云函数脚手架：

```text
cloudfunctions/api
```

后端能力：

- openid 身份识别
- 保卫科/管理员权限校验
- 二维码 token 哈希存储
- 手机号脱敏
- 查看完整手机号审计
- 数据导出审计
- 接口限流
- 管理员初始化
- 人员启停管理
- 车辆审核、作废、重置二维码

## 数据结构

- students：学生信息
- teachers：教职工信息
- vehicles：车辆信息
- officers：管理人员
- scanLogs：扫码日志
- violations：违停记录
- rateLimits：接口限流
- securityEvents：安全事件

## 项目结构

```text
app.js
app.json
app.wxss
pages/
utils/
cloudfunctions/
database/
docs/
admin-web/       # 独立网页管理后台，可直接浏览器打开预览
```

## 运行

### 小程序

使用微信开发者工具导入项目目录并编译运行。

### 后端管理网页

直接打开 `admin-web/index.html`，或在项目目录运行：

```bash
cd admin-web
python3 -m http.server 8080
```

浏览器访问 `http://localhost:8080`。在"接口配置"中填写云函数 HTTP 地址或自建后端地址即可与云端数据联动。

## 云开发资料

```text
docs/security-guard.md
docs/backend-security.md
docs/deploy-cloudbase.md
docs/api-contract.md
database/schema.json
database/indexes.json
database/permissions.md
```
