# 校园车辆管理系统

## 项目背景

随着校园内电动车数量激增，违规停放现象日益严重——消防通道被堵、人行道被占、充电区域混乱，却往往无法追溯车主身份。传统的贴条警告效率低下，且难以形成有效闭环管理。

本系统采用**一车一码**方案：由校方统一打印专属二维码贴纸，勒令学生贴在车辆醒目位置。保卫科人员日常巡逻时扫码即可获知车主信息，登记违停记录并通知整改。普通学生扫码只能看到自己的车辆信息，**车主隐私仅对保卫科和管理员可见**，兼顾管理效率与隐私保护。

## 使用场景

```
学生登记车辆 → 生成专属二维码 → 打印贴纸 → 贴在车上
                                        ↓
保卫科巡逻扫码 → 识别车主身份 → 登记违停 → 通知整改 → 闭环处理
                                        ↓
管理员后台审核 → 车辆管理 → 数据导出 → 全局管控
```

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

---

## ⭐ Star History

如果这个项目对你有帮助，欢迎点个 Star 支持一下~

[![Star History Chart](https://api.star-history.com/svg?repos=Yoseya12138/campus-vehicle-management&type=Date)](https://star-history.com/#Yoseya12138/campus-vehicle-management&Date)
