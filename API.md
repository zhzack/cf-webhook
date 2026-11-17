# Webhook Inspector REST API 接口文档

本文档详细说明了 Webhook Inspector 后端提供的全部 RESTful API、统一身份认证 (SSO)、SSE 实时流协议以及 Webhook 接收网关规范。

---

## 目录
- [一、通用说明与 SSO 统一身份鉴权](#一通用说明与-sso-统一身份鉴权)
- [二、Webhook 接收网关 (免密公开)](#二webhook-接收网关-免密公开)
  - [1. 接收 Webhook 请求 (ALL /bin/:binId/*)](#1-接收-webhook-请求-all-binbinid)
- [三、身份认证与账号管理 API](#三身份认证与账号管理-api)
  - [1. 检查 SSO 状态 (GET /api/auth/status)](#1-检查-sso-状态-get-apiauthstatus)
  - [2. 获取当前登录用户 (GET /api/auth/me)](#2-获取当前登录用户-get-apiauthme)
  - [3. 全域退出登录 (POST /api/auth/logout)](#3-全域退出登录-post-apiauthlogout)
- [四、频道管理 API (需登录)](#四频道管理-api-需登录)
  - [1. 获取我的频道列表 (GET /api/bins)](#1-获取我的频道列表-get-apibins)
  - [2. 创建新频道 (POST /api/bins)](#2-创建新频道-post-apibins)
  - [3. 获取频道配置 (GET /api/bins/:binId)](#3-获取频道配置-get-apibinsbinid)
  - [4. 更新自定义响应规则 (PUT /api/bins/:binId)](#4-更新自定义响应规则-put-apibinsbinid)
- [五、请求记录管理 API (需登录)](#五请求记录管理-api-需登录)
  - [1. 获取历史请求列表 (GET /api/bins/:binId/requests)](#1-获取历史请求列表-get-apibinsbinidrequests)
  - [2. 清空历史请求 (DELETE /api/bins/:binId/requests)](#2-清空历史请求-delete-apibinsbinidrequests)
  - [3. 删除单条请求记录 (DELETE /api/bins/:binId/requests/:reqId)](#3-删除单条请求记录-delete-apibinsbinidrequestsreqid)
  - [4. 请求重放 / 转发 (POST /api/bins/:binId/replay)](#4-请求重放--转发-post-apibinsbinidreplay)
- [六、实时数据流 (SSE，需登录或 Token)](#六实时数据流-sse需登录或-token)
  - [1. 建立 SSE 连接 (GET /api/bins/:binId/stream)](#1-建立-sse-连接-get-apibinsbinidstream)
  - [2. 内网转发命令行客户端 (-k 参数)](#2-内网转发命令行客户端--k-参数)

---

## 一、通用说明与 SSO 统一身份鉴权

- **在线 Base URL**：`https://webhook.b1uegrey.xyz`
- **SSO 认证中心**：`https://auth.b1uegrey.xyz`
- **单点登录 (SSO)**：
  - 基于 `cf-auth` 签发的 HS256 JWT。
  - 支持跨根域 `.b1uegrey.xyz` Cookie 免密登录（Cookie 名：`auth_token`）。
  - 支持 `Authorization: Bearer <token>` 请求头。
  - 支持 URL 查询参数 `?token=<token>`（专为 SSE 与内网命令行客户端设计）。
- **权限矩阵 (RBAC)**：
  - 必须处于活跃状态（未封禁）。
  - 必须拥有 `*` 全局权限或包含 `webhook` 应用权限矩阵。
- **数据存储**：所有持久化数据存储在 Cloudflare D1 (`cf_webhook_db`) 分布式数据库中。

---

## 二、Webhook 接收网关 (免密公开)

### 1. 接收 Webhook 请求
* **路径**：`ALL /bin/:binId` 或 `ALL /bin/:binId/*`
* **支持方法**：`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`
* **鉴权要求**：**完全公开免密**（供第三方开放平台回调，绝不拦截）
* **说明**：
  - 任意第三方平台向此 URL 发起请求时，系统将捕获所有元数据（客户端真实 IP、User-Agent、所有 Headers、URL Query 参数、原始 Body 报文）。
  - 若 `:binId` 尚不存在，系统会自动**隐式初始化该频道**，无需提前注册，即开即用。
  - **飞书专属适配**：若开启了飞书自动校验（默认开启），当收到飞书发送的 `{"type": "url_verification", "challenge": "..."}` 握手包时，边缘节点会在 10ms 内原地回包 `{"challenge": "..."}`，并异步保存该记录。

#### 响应格式
按照当前 `:binId` 配置的自定义规则返回（默认为 `200 OK`，`application/json`，`{"status":"ok","binId":"xxx"}`）。

附带响应头：
```http
X-Webhook-Inspector-Bin: <binId>
X-Webhook-Inspector-Id: <reqId>
```

---

## 三、身份认证与账号管理 API

### 1. 检查 SSO 状态
* **接口**：`GET /api/auth/status`
* **鉴权要求**：公开
* **响应示例**：
```json
{
  "needSetup": false,
  "ssoAuthUrl": "https://auth.b1uegrey.xyz"
}
```

### 2. 获取当前登录用户
* **接口**：`GET /api/auth/me`
* **鉴权要求**：需登录
* **响应示例**：
```json
{
  "user": {
    "id": "usr_31f1444f07b94242",
    "username": "b1uegrey",
    "nickname": "b1uegrey",
    "role": "admin",
    "status": "active",
    "allowedApps": ["*"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

### 3. 全域退出登录
* **接口**：`POST /api/auth/logout`
* **鉴权要求**：公开 / 需登录
* **说明**：清除 `.b1uegrey.xyz` 及当前域下的 `auth_token` Cookie。

---

## 四、频道管理 API (需登录)

### 1. 获取我的频道列表
* **接口**：`GET /api/bins`
* **鉴权要求**：需登录
* **响应示例**：
```json
{
  "success": true,
  "bins": [
    {
      "id": "feishu",
      "user_id": "usr_31f1444f07b94242",
      "name": "飞书机器人事件调试",
      "response_status": 200,
      "response_content_type": "application/json",
      "response_body": "{\"code\":0,\"msg\":\"success\"}",
      "feishu_auto_challenge": 1,
      "created_at": 1794560000000,
      "updated_at": 1794560100000
    }
  ]
}
```

### 2. 创建新频道
* **接口**：`POST /api/bins`
* **鉴权要求**：需登录
* **响应**：同单个 `bin` 对象。

### 3. 获取频道配置
* **接口**：`GET /api/bins/:binId`
* **鉴权要求**：需登录

### 4. 更新自定义响应规则
* **接口**：`PUT /api/bins/:binId`
* **鉴权要求**：需登录
* **请求体**：
```json
{
  "name": "我的飞书测试频道",
  "response_status": 200,
  "response_content_type": "application/json",
  "response_body": "{\"code\": 0, \"msg\": \"success\"}",
  "feishu_auto_challenge": true
}
```

---

## 五、请求记录管理 API (需登录)

### 1. 获取历史请求列表
* **接口**：`GET /api/bins/:binId/requests?limit=100`
* **鉴权要求**：需登录
* **Query 参数**：`limit` (可选，默认 100，最大 200)

### 2. 清空历史请求
* **接口**：`DELETE /api/bins/:binId/requests`
* **鉴权要求**：需登录

### 3. 删除单条请求记录
* **接口**：`DELETE /api/bins/:binId/requests/:reqId`
* **鉴权要求**：需登录

### 4. 请求重放 / 转发
* **接口**：`POST /api/bins/:binId/replay`
* **鉴权要求**：需登录
* **请求体**：
```json
{
  "targetUrl": "http://localhost:3000/api/webhook",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"event\":\"test\"}"
}
```

---

## 六、实时数据流 (SSE) 与内网转发客户端

### 1. 建立 SSE 连接
* **接口**：`GET /api/bins/:binId/stream`
* **鉴权要求**：需携带 Cookie 或 `?token=<JWT>` 或 `Authorization: Bearer <JWT>`
* **协议**：Server-Sent Events (`text/event-stream`)
* **事件类型**：
  - `event: connected`：连接建立成功时推送。
  - `event: webhook`：当该频道收到新 Webhook 请求时实时推送该请求记录 JSON。
  - `: ping`：每 1.5 秒心跳包，保持长连接不被浏览器或中间代理断开。

### 2. 内网转发命令行客户端
系统自带免克隆一行运行脚本：
```bash
# 方式一：免克隆一行运行
curl -sL https://webhook.b1uegrey.xyz/forward.mjs | node - -b <binId> -t http://localhost:3000/api/webhook -k <token>

# 方式二：本地仓库运行
node scripts/forward.mjs -b <binId> -t http://localhost:3000/api/webhook -k <token>
```
* `-k, --token`：传入在 Webhook Inspector 界面获取的当前 SSO Token，即可跨内网安全连接云端流。
