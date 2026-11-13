# 飞书开放平台 Webhook / 事件订阅接入指南

本指南手把手教你如何使用 **Webhook Inspector** 接收并调试飞书（国内版）自建应用或机器人的所有事件回调。

---

## 一、为什么飞书 Webhook 容易超时？

在飞书开放平台配置「事件订阅」时，有两个极其严格的限制：
1. **URL 验证挑战（`url_verification`）**：保存时飞书会发送带有 `challenge` 的 POST 请求，要求必须在 **1 秒内** 原样返回对应的 JSON。
2. **事件推送必须 3 秒内返回 200**：否则飞书会直接判失败并触发重试风暴。

由于中国大陆机房到未优化的海外 CDN 延迟常在 200~300ms 甚至偶发丢包，非常容易超时。**Webhook Inspector 在边缘节点做到了 10ms 原样回包，完全避免了超时失败的问题。**

---

## 二、配置步骤（3 步完成）

### 第一步：获取你的专属 Webhook 地址
打开 Webhook Inspector 线上平台：
👉 **https://webhook.b1uegrey.xyz**

系统会为你生成一个专属地址，例如：
```text
https://webhook.b1uegrey.xyz/bin/feishu-dev
```
*(路径后缀你可以自定义，例如 `bin/my-bot`)*

---

### 第二步：前往飞书开放平台配置

1. 打开 [飞书开放平台开发者后台](https://open.feishu.cn/app/)。
2. 进入你的企业自建应用，在左侧导航栏点击 **「事件与回调」** ➡️ **「事件配置」**。
3. 点击 **「编辑」** 请求网址（Request URL）：
   - 将你的地址粘贴进去：`https://webhook.b1uegrey.xyz/bin/feishu-dev`
4. 点击 **「保存」**。
   - 此时飞书会立刻向该地址发起校验挑战；
   - Webhook Inspector 会在毫秒级内自动识别并返回 `{ "challenge": "..." }`；
   - 飞书界面会直接提示 **“请求网址已通过校验”**！

---

### 第三步：添加需要监听的事件

在飞书后台添加你需要调试的事件权限，例如：
* **接收消息**：`im.message.receive_v1`（用户在群内 @ 机器人或私聊发消息）
* **审批事件**：`approval.instance.status_changed_v4`
* **通讯录变更**：`contact.user.created_v3` 等

添加完成后，点击飞书后台右上角的 **「创建版本并发布」**（或在测试企业内测试）。

---

### 第四步：在看板中实时调试

回到 [https://webhook.b1uegrey.xyz/#feishu-dev](https://webhook.b1uegrey.xyz/#feishu-dev)：
1. 在飞书群里发一条消息 `@你的机器人`。
2. Webhook Inspector 看板将在 **毫秒级内自动刷出一条新请求**。
3. 点击查看：
   * 完整的飞书事件 JSON 树形结构（`event.message.content`、`sender` 等）。
   * 飞书请求附带的签名 Headers（`X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `X-Lark-Signature`）。
   * 点击右上角 **「复制 cURL」**，可以在本地直接回放复现。
   * 点击 **「重放请求」**，可以一键转推到你本地正在开发的 `http://localhost:3000/api/feishu` 接口进行断点调试！
