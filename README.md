# Webhook Inspector (边缘实时 Webhook 测试平台)

基于 **Cloudflare Workers + Hono + D1 + React + Vite + Tailwind CSS** 构建的轻量、高性能 Webhook 接收与实时调试平台。

支持接收飞书、微信支付、Stripe、GitHub 等任意第三方 Webhook 回调，并在 Web 界面毫秒级实时呈现。

👉 **在线体验**：[https://webhook.b1uegrey.xyz](https://webhook.b1uegrey.xyz)

📚 **相关文档**：
- [API 接口文档 (API.md)](./API.md)：详细 RESTful API、SSE 协议与 Webhook 接收网关定义
- [飞书开放平台接入指南 (FEISHU_GUIDE.md)](./FEISHU_GUIDE.md)：飞书自建应用事件订阅与机器人消息调试指南

---

## 🌟 核心特性

- ⚡ **边缘极速响应**：基于 Cloudflare Workers 全球边缘网络，低延迟吞吐。
- 🎯 **飞书原生秒过**：内置针对飞书开放平台的 `url_verification` 挑战包自动拦截与 10ms 极速应答机制。
- 🔄 **实时长连接推送**：基于 Server-Sent Events (SSE) 协议，来信即显，页面无需手动刷新。
- 🛠️ **全能报文解析**：支持格式化 JSON 树形折叠、Raw 原始报文、Headers 键值表格、URL Query 参数解析。
- 📋 **开发者生产力**：一键生成并复制标准终端 `cURL` 命令，支持一键重放（Replay / Forward）到本地开发端口或第三方 API。
- 🎛️ **自定义 Mock 响应**：可在前端自由配置返回状态码（200/400/500 等）、Content-Type 及 Mock 报文。
- 🌐 **绑定独立域名**：已预配置 `webhook.b1uegrey.xyz` 自定义二级域名路由。

---

## 🚀 本地开发与调试

### 1. 初始化本地 D1 数据库
```bash
# 初始化本地 SQLite 数据库表结构
npx wrangler d1 execute cf_webhook_db --local --file=d1/schema.sql
```

### 2. 启动服务
你可以分别启动 Worker 后端与 Vite 前端：

```bash
# 终端 1：启动 Cloudflare Worker 本地后端 (监听 http://127.0.0.1:8787)
npm run dev:worker

# 终端 2：启动 Vite 前端看板 (监听 http://localhost:5174)
npm run dev:web
```

打开浏览器访问 `http://localhost:5174` 即可开始测试。

---

## ☁️ 部署上线到 Cloudflare (绑定 webhook.b1uegrey.xyz)

### 第一步：在 Cloudflare 创建远程 D1 数据库
```bash
npx wrangler d1 create cf_webhook_db
```
创建成功后，终端会打印出类似以下信息：
```text
[[d1_databases]]
binding = "DB"
database_name = "cf_webhook_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
将打印出的 `database_id` 填入 `wrangler.jsonc` 对应字段。

### 第二步：将表结构同步到远程数据库
```bash
npx wrangler d1 execute cf_webhook_db --remote --file=d1/schema.sql
```

### 第三步：构建并发布上线
```bash
npm run deploy
```
发布完成后，Wrangler 会自动关联你在 Cloudflare 托管的 `b1uegrey.xyz` 域名，并自动创建 `webhook.b1uegrey.xyz` 的二级域名解析与合法 HTTPS 证书！

---

## 📖 Webhook 接收地址格式

上线后，你的通用 Webhook 接收地址为：
```
https://webhook.b1uegrey.xyz/bin/<频道ID>
```
例如：`https://webhook.b1uegrey.xyz/bin/3k9f0a2`，也支持追加任意子路径，如：
```
https://webhook.b1uegrey.xyz/bin/3k9f0a2/v1/order/notify
```
所有传入的 Method、Headers、IP、Query 及 Body 都将自动录入并在看板中高亮展示。

