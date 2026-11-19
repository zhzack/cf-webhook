#!/usr/bin/env node

/**
 * Webhook Inspector - Local Client & HTTP Proxy (内网转发与出站代理客户端)
 * 
 * 零外部依赖，仅需 Node.js 18+ 原生运行。
 * 原理：
 *   1. 入站转发：通过 Server-Sent Events (SSE) 长连接从云端拉取 Webhook 事件，并在内网本地代发 HTTP 请求。
 *   2. 出站代理：启动标准本地 HTTP/HTTPS 正向代理 (CONNECT 隧道)，通过 Cloudflare Workers WebSocket TCP 透传直连海外 API (如 Telegram / OpenAI)。
 * 
 * 用法：
 *   1. 仅出站代理 (免翻访问 Telegram/OpenAI，无缝平替 Clash):
 *      node scripts/forward.mjs proxy [-p 8787] [-k <token>]
 * 
 *   2. 仅入站 Webhook 转发:
 *      node scripts/forward.mjs -b <binId> -t <localUrl> [-k <token>]
 * 
 *   3. 机器人全功能模式 (入站接收 + 出站代理同时运行):
 *      node scripts/forward.mjs -b <binId> -t <localUrl> --proxy 8787 [-k <token>]
 */

import http from 'node:http';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

// 解析命令行参数
const args = process.argv.slice(2);
function getArg(shortName, longName, defaultValue = '') {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `-${shortName}` || args[i] === `--${longName}`) {
      return args[i + 1] || defaultValue;
    }
    if (args[i].startsWith(`--${longName}=`)) {
      return args[i].split('=')[1] || defaultValue;
    }
  }
  return defaultValue;
}

const isProxySubcommand = args[0] === 'proxy';
const hasHelp = args.includes('-h') || args.includes('--help') || (args.length === 0);

if (hasHelp) {
  console.log(`
${ANSI.bold}${ANSI.cyan}⚡ Webhook Inspector - 内网转发与出站代理客户端${ANSI.reset}

${ANSI.bold}用法:${ANSI.reset}
  node scripts/forward.mjs proxy [选项]                       启动标准 HTTP 出站代理
  node scripts/forward.mjs -b <binId> -t <targetUrl> [选项]   启动入站 Webhook 转发
  node scripts/forward.mjs -b <binId> -t <targetUrl> --proxy 8787  入站 + 出站同时启动

${ANSI.bold}选项:${ANSI.reset}
  -b, --bin <id>       Webhook 频道 ID (入站转发必填，例如: feishu, my-bot)
  -t, --target <url>   内网目标转发地址 (入站转发必填，例如: http://localhost:3000/api/webhook)
  -p, --port <port>    本地 HTTP 代理监听端口 (默认: 8787)
  --proxy [port]       在入站转发的同时，开启本地出站 HTTP 代理 (默认: 8787)
  -k, --token <token>  SSO 访问令牌 (可选，若线上启用了身份校验需提供)
  -s, --server <url>   云端平台地址 (默认: https://webhook.b1uegrey.xyz)
  --keep-path          保留并追加子路径到目标地址 (默认: false)
  -h, --help           显示此帮助信息

${ANSI.bold}示例:${ANSI.reset}
  # 场景 1: 本地免翻访问 Telegram Bot API (无缝平替 Clash)
  node scripts/forward.mjs proxy -p 8787
  export HTTPS_PROXY=http://127.0.0.1:8787
  curl -x http://127.0.0.1:8787 https://api.telegram.org

  # 场景 2: 飞书 Webhook 穿透到本地 3000 端口
  node scripts/forward.mjs -b feishu -t http://localhost:3000/api/webhook

  # 场景 3: Telegram 机器人全托管调试 (收 Webhook + 发出站消息)
  node scripts/forward.mjs -b my-bot -t http://localhost:3000/webhook --proxy 8787
`);
  process.exit(0);
}

const token = getArg('k', 'token', process.env.WEBHOOK_TOKEN || '');
const serverUrl = (getArg('s', 'server', process.env.WEBHOOK_SERVER || 'https://webhook.b1uegrey.xyz')).replace(/\/+$/, '');
const keepPath = args.includes('--keep-path');

// 计算代理端口
let proxyPort = 0;
if (isProxySubcommand) {
  const pArg = getArg('p', 'port', '8787');
  proxyPort = parseInt(pArg, 10) || 8787;
} else if (args.includes('--proxy')) {
  const pIdx = args.indexOf('--proxy');
  const nextArg = args[pIdx + 1];
  if (nextArg && /^\d+$/.test(nextArg)) {
    proxyPort = parseInt(nextArg, 10);
  } else {
    const pArg = getArg('p', 'port', '8787');
    proxyPort = parseInt(pArg, 10) || 8787;
  }
}

// 计算入站配置
const binId = getArg('b', 'bin', process.env.WEBHOOK_BIN || '');
const targetUrl = getArg('t', 'target', process.env.WEBHOOK_TARGET || '');

if (!isProxySubcommand && !binId && !proxyPort) {
  console.error(`${ANSI.red}❌ 错误: 未指定有效的运行模式。${ANSI.reset}`);
  console.error(`查看帮助: node scripts/forward.mjs --help`);
  process.exit(1);
}

if (!isProxySubcommand && (!binId || !targetUrl) && !proxyPort) {
  console.error(`${ANSI.red}❌ 错误: 入站转发需指定 -b <bin> 和 -t <target>${ANSI.reset}`);
  process.exit(1);
}

let isRunning = true;
process.on('SIGINT', () => {
  console.log(`\n${ANSI.yellow}正在安全退出客户端...${ANSI.reset}`);
  isRunning = false;
  process.exit(0);
});

// ==========================================
// 1. 本地 HTTP/HTTPS 正向代理服务器 (Outbound)
// ==========================================
function startProxyServer(port) {
  const server = http.createServer((req, res) => {
    // 处理普通明文 HTTP 代理请求 (GET http://example.com/path)
    try {
      const urlObj = new URL(req.url);
      const targetHost = urlObj.hostname;
      const targetPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      const target = `${targetHost}:${targetPort}`;

      handleTunnel(req.socket, target, Buffer.alloc(0), (err, ws) => {
        if (err) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Bad Gateway: ${err.message}`);
          return;
        }

        const method = req.method || 'GET';
        const path = urlObj.pathname + urlObj.search;
        let rawReq = `${method} ${path} HTTP/1.1\r\n`;
        for (const [k, v] of Object.entries(req.headers)) {
          if (k.toLowerCase() === 'proxy-connection') continue;
          rawReq += `${k}: ${v}\r\n`;
        }
        rawReq += '\r\n';
        ws.send(Buffer.from(rawReq));
        req.on('data', (chunk) => ws.send(chunk));
      });
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Invalid proxy request: ${e.message}`);
    }
  });

  // 处理 HTTPS CONNECT 隧道 (CONNECT api.telegram.org:443 HTTP/1.1)
  server.on('connect', (req, clientSocket, head) => {
    const target = req.url; // e.g. "api.telegram.org:443"
    const startTime = Date.now();
    const timeStr = new Date().toLocaleTimeString('zh-CN');

    handleTunnel(clientSocket, target, head, (err) => {
      const duration = Date.now() - startTime;
      if (err) {
        console.error(
          `[${ANSI.dim}${timeStr}${ANSI.reset}] ` +
          `${ANSI.bold}${ANSI.cyan}CONNECT${ANSI.reset} ` +
          `${ANSI.yellow}${target.padEnd(28)}${ANSI.reset} ` +
          `${ANSI.dim}→${ANSI.reset} ` +
          `${ANSI.red}连接异常: ${err.message}${ANSI.reset} ` +
          `${ANSI.dim}(${duration}ms)${ANSI.reset}`
        );
      } else {
        console.log(
          `[${ANSI.dim}${timeStr}${ANSI.reset}] ` +
          `${ANSI.bold}${ANSI.cyan}CONNECT${ANSI.reset} ` +
          `${ANSI.yellow}${target.padEnd(28)}${ANSI.reset} ` +
          `${ANSI.dim}→${ANSI.reset} ` +
          `${ANSI.green}200 Connection Established${ANSI.reset} ` +
          `${ANSI.dim}(${duration}ms)${ANSI.reset}`
        );
      }
    });
  });

  function handleTunnel(clientSocket, target, head, cb) {
    let wsUrl = `${serverUrl.replace(/^http/, 'ws')}/api/tunnel?target=${encodeURIComponent(target)}`;
    if (token) {
      wsUrl += `&token=${encodeURIComponent(token)}`;
    }

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      if (!clientSocket.destroyed) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      }
      cb(e);
      return;
    }

    let established = false;
    const pendingChunks = [];

    ws.onopen = () => {
      established = true;
      if (!clientSocket.destroyed) {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          ws.send(head);
        }
        while (pendingChunks.length > 0) {
          ws.send(pendingChunks.shift());
        }
      }
      cb(null, ws);
    };

    ws.onmessage = (event) => {
      if (clientSocket.writable) {
        if (event.data instanceof ArrayBuffer) {
          clientSocket.write(Buffer.from(event.data));
        } else if (typeof event.data === 'string') {
          clientSocket.write(event.data);
        }
      }
    };

    ws.onerror = (event) => {
      if (!established && !clientSocket.destroyed) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
      clientSocket.destroy();
      cb(new Error(event.message || 'WebSocket Error'));
    };

    ws.onclose = () => {
      clientSocket.end();
    };

    clientSocket.on('data', (chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        pendingChunks.push(chunk);
      }
    });

    clientSocket.on('error', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    clientSocket.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
  }

  server.listen(port, '127.0.0.1', () => {
    console.log(`
${ANSI.cyan}${ANSI.bold}┌─────────────────────────────────────────────────────────────┐
│             ⚡ Webhook Inspector - HTTP 出站代理             │
└─────────────────────────────────────────────────────────────┘${ANSI.reset}
  ${ANSI.dim}• 代理地址:${ANSI.reset}  ${ANSI.bold}${ANSI.green}http://127.0.0.1:${port}${ANSI.reset}
  ${ANSI.dim}• 边缘节点:${ANSI.reset}  ${ANSI.dim}${serverUrl}${ANSI.reset}
  ${ANSI.dim}• 认证凭证:${ANSI.reset}  ${token ? ANSI.green + '已配置 (Bearer Token)' : ANSI.dim + '未配置 (若云端需鉴权请通过 -k 提供)'}${ANSI.reset}
  ${ANSI.dim}• 终端设置:${ANSI.reset}  ${ANSI.yellow}export HTTPS_PROXY=http://127.0.0.1:${port}${ANSI.reset}
  ${ANSI.dim}• 测试连通:${ANSI.reset}  ${ANSI.dim}curl -x http://127.0.0.1:${port} https://api.telegram.org${ANSI.reset}
`);
  });

  return server;
}

// ==========================================
// 2. 本地 Webhook 事件监听与转发 (Inbound)
// ==========================================
async function forwardRequest(record) {
  const timeStr = new Date().toLocaleTimeString('zh-CN');
  let destUrl = targetUrl;

  if (keepPath && record.path) {
    const subpath = record.path.replace(new RegExp(`^/bin/${binId}`), '') || '';
    const destObj = new URL(destUrl);
    destObj.pathname = (destObj.pathname.replace(/\/+$/, '') + subpath).replace(/\/\//g, '/');
    destUrl = destObj.toString();
  }

  // 整理并过滤不需要转发的 hop-by-hop 头
  let rawHeaders = {};
  try {
    rawHeaders = JSON.parse(record.headers || '{}');
  } catch {}

  const headers = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    const lower = k.toLowerCase();
    if (!['host', 'content-length', 'connection', 'cf-ray', 'cf-connecting-ip', 'cf-visitor', 'x-forwarded-proto'].includes(lower)) {
      headers[k] = v;
    }
  }

  const startTime = Date.now();
  const method = (record.method || 'POST').toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method) && record.body;

  try {
    const res = await fetch(destUrl, {
      method,
      headers,
      body: hasBody ? record.body : undefined,
    });

    const duration = Date.now() - startTime;
    const statusColor = res.status >= 200 && res.status < 300 ? ANSI.green : (res.status >= 400 ? ANSI.red : ANSI.yellow);

    console.log(
      `[${ANSI.dim}${timeStr}${ANSI.reset}] ` +
      `${ANSI.bold}${ANSI.cyan}${method.padEnd(6)}${ANSI.reset} ` +
      `${ANSI.dim}→${ANSI.reset} ` +
      `${statusColor}${res.status} ${res.statusText}${ANSI.reset} ` +
      `${ANSI.dim}(${duration}ms)${ANSI.reset} ` +
      `${ANSI.dim}目标:${ANSI.reset} ${destUrl}`
    );
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(
      `[${ANSI.dim}${timeStr}${ANSI.reset}] ` +
      `${ANSI.bold}${ANSI.cyan}${method.padEnd(6)}${ANSI.reset} ` +
      `${ANSI.dim}→${ANSI.reset} ` +
      `${ANSI.red}转发失败: ${err.message}${ANSI.reset} ` +
      `${ANSI.dim}(${duration}ms)${ANSI.reset} ` +
      `${ANSI.dim}目标:${ANSI.reset} ${destUrl}`
    );
  }
}

async function startStream() {
  let streamUrl = `${serverUrl}/api/bins/${binId}/stream`;
  if (token) {
    streamUrl += (streamUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
  }

  console.log(`
${ANSI.cyan}${ANSI.bold}┌─────────────────────────────────────────────────────────────┐
│             ⚡ Webhook Inspector 内网入站转发               │
└─────────────────────────────────────────────────────────────┘${ANSI.reset}
  ${ANSI.dim}• 云端频道:${ANSI.reset}  ${ANSI.bold}${serverUrl}/bin/${binId}${ANSI.reset}
  ${ANSI.dim}• 内网目标:${ANSI.reset}  ${ANSI.bold}${ANSI.green}${targetUrl}${ANSI.reset}
  ${ANSI.dim}• 事件流源:${ANSI.reset}  ${ANSI.dim}${streamUrl}${ANSI.reset}
  ${ANSI.dim}• 认证凭证:${ANSI.reset}  ${token ? ANSI.green + '已配置 (Bearer Token)' : ANSI.dim + '使用 Cookie 或公开'}${ANSI.reset}
  ${ANSI.dim}• 运行状态:${ANSI.reset}  ${ANSI.yellow}正在连接云端事件流...${ANSI.reset}
`);

  while (isRunning) {
    try {
      const reqHeaders = {
        'Accept': 'text/event-stream',
        'User-Agent': 'Webhook-Inspector-Forwarder/1.0',
      };
      if (token) {
        reqHeaders['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(streamUrl, {
        headers: reqHeaders,
      });

      if (!res.ok || !res.body) {
        if (res.status === 401) {
          throw new Error('未授权 (HTTP 401)，请提供有效 Token: -k <token> 或登录 https://auth.b1uegrey.xyz');
        }
        if (res.status === 403) {
          throw new Error('权限不足 (HTTP 403)，当前账号未获得 Webhook 权限，请在认证中心联系管理员开通');
        }
        throw new Error(`连接失败，云端返回 HTTP ${res.status}`);
      }

      console.log(`${ANSI.green}✔ 已成功接入云端事件流！正在实时监听 Webhook 传入并转发到内网...${ANSI.reset}\n`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (isRunning) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let event = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data += (data ? '\n' : '') + line.slice(5).trim();
            }
          }

          if (event === 'webhook' && data) {
            try {
              const record = JSON.parse(data);
              await forwardRequest(record);
            } catch (e) {
              console.error(`${ANSI.red}解析事件数据失败:${ANSI.reset}`, e.message);
            }
          }
        }
      }

    } catch (err) {
      if (!isRunning) break;
      console.warn(`${ANSI.yellow}⚠️ 连接异常: ${err.message}，将在 3 秒后重试...${ANSI.reset}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// ==========================================
// 3. 启动任务
// ==========================================
if (proxyPort > 0) {
  startProxyServer(proxyPort);
}

if (binId && targetUrl) {
  startStream();
}
