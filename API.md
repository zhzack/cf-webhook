# Webhook Inspector REST API 接口文档

本文档详细说明了 Webhook Inspector 后端提供的全部 RESTful API、SSE 实时流协议以及 Webhook 接收网关规范。

---

## 目录
- [一、通用说明](#一通用说明)
- [二、Webhook 接收网关](#二webhook-接收网关)
  - [1. 接收 Webhook 请求 (ALL /bin/:binId/*)](#1-接收-webhook-请求-all-binbinid)
- [三、频道管理 API](#三频道管理-api)
  - [1. 创建新频道 (POST /api/bins)](#1-创建新频道-post-apibins)
  - [2. 获取频道配置 (GET /api/bins/:binId)](#2-获取频道配置-get-apibinsbinid)
  - [3. 更新自定义响应规则 (PUT /api/bins/:binId)](#3-更新自定义响应规则-put-apibinsbinid)
- [四、请求记录管理 API](#四请求记录管理-api)
  - [1. 获取历史请求列表 (GET /api/bins/:binId/requests)](#1-获取历史请求列表-get-apibinsbinidrequests)
  - [2. 清空历史请求 (DELETE /api/bins/:binId/requests)](#2-清空历史请求-delete-apibinsbinidrequests)
  - [3. 删除单条请求记录 (DELETE /api/bins/:binId/requests/:reqId)](#3-删除单条请求记录-delete-apibinsbinidrequestsreqid)
  - [4. 请求重放 / 转发 (POST /api/bins/:binId/replay)](#4-请求重放--转发-post-apibinsbinidreplay)
- [五、实时数据流 (SSE)](#五实时数据流-sse)
  - [1. 建立 SSE 连接 (GET /api/bins/:binId/stream)](#1-建立-sse-连接-get-apibinsbinidstream)

---

## 一、通用说明

- **在线 Base URL**：`https://webhook.b1uegrey.xyz`
- **本地 Base URL**：`http://127.0.0.1:8787` (Worker) 或 `http://localhost:5174` (Vite 代理)
- **CORS**：全接口支持跨域访问。
- **数据存储**：所有持久化数据存储在 Cloudflare D1 (SQLite) 分布式数据库中。

---

## 二、Webhook 接收网关

### 1. 接收 Webhook 请求
* **路径**：`ALL /bin/:binId` 或 `ALL /bin/:binId/*`
* **支持方法**：`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`
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

## 三、频道管理 API

### 1. 创建新频道
* **接口**：`POST /api/bins`
* **响应示例**：
```json
{
  "success": true,
  "bin": {
    "id": "k8x2m9pq",
    "name": "Bin k8x2m9pq",
    "response_status": 200,
    "response_content_type": "application/json",
    "response_body": "{\"status\":\"ok\",\"binId\":\"k8x2m9pq\"}",
    "feishu_auto_challenge": 1,
    "created_at": 1794560000000,
    "updated_at": 1794560000000
  }
}
```

### 2. 获取频道配置
* **接口**：`GET /api/bins/:binId`
* **响应**：同创建新频道的 `bin` 对象。

### 3. 更新自定义响应规则
* **接口**：`PUT /api/bins/:binId`
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
* **响应**：
```json
{
  "success": true,
  "bin": { ... }
}
```

---

## 四、请求记录管理 API

### 1. 获取历史请求列表
* **接口**：`GET /api/bins/:binId/requests?limit=100`
* **Query 参数**：`limit` (可选，默认 100，最大 200)
* **响应示例**：
```json
{
  "success": true,
  "requests": [
    {
      "id": "req_a1b2c3d4",
      "bin_id": "k8x2m9pq",
      "method": "POST",
      "url": "https://webhook.b1uegrey.xyz/bin/k8x2m9pq/order/callback",
      "path": "/bin/k8x2m9pq/order/callback",
      "headers": "{\"content-type\":\"application/json\",\"user-agent\":\"curl/8.0\"}",
      "query_params": "{\"env\":\"prod\"}",
      "body": "{\"orderId\":\"10001\",\"price\":99.9}",
      "ip": "1.2.3.4",
      "user_agent": "curl/8.0",
      "content_type": "application/json",
      "created_at": 1794560123456
    }
  ]
}
```

### 2. 清空历史请求
* **接口**：`DELETE /api/bins/:binId/requests`
* **响应**：`{"success": true}`

### 3. 删除单条请求记录
* **接口**：`DELETE /api/bins/:binId/requests/:reqId`
* **响应**：`{"success": true}`

### 4. 请求重放 / 转发
* **接口**：`POST /api/bins/:binId/replay`
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
* **响应示例**：
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": "{\"ok\":true}"
}
```

---

## 五、实时数据流 (SSE)

### 1. 建立 SSE 连接
* **接口**：`GET /api/bins/:binId/stream`
* **协议**：Server-Sent Events (`text/event-stream`)
* **事件类型**：
  - `event: connected`：连接建立成功时推送。
  - `event: webhook`：当该频道收到新 Webhook 请求时实时推送该请求记录 JSON。
  - `: ping`：每 1.5 秒心跳包，保持长连接不被浏览器或中间代理断开。
