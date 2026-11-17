#!/usr/bin/env node

/**
 * Webhook Inspector - Local Forwarder Client (内网转发客户端)
 * 
 * 零外部依赖，仅需 Node.js 18+ 原生运行。
 * 原理：通过 Server-Sent Events (SSE) 长连接从云端拉取 Webhook 事件，并在内网本地代发 HTTP 请求。
 * 
 * 用法：
 *   node scripts/forward.mjs --bin <binId> --target <localUrl>
 * 
 * 示例：
 *   node scripts/forward.mjs -b feishu -t http://localhost:3000/api/webhook
 */

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

const hasHelp = args.includes('-h') || args.includes('--help');
if (hasHelp) {
  console.log(`
${ANSI.bold}${ANSI.cyan}⚡ Webhook Inspector - 内网转发客户端${ANSI.reset}

${ANSI.bold}用法:${ANSI.reset}
  node scripts/forward.mjs [选项]

${ANSI.bold}选项:${ANSI.reset}
  -b, --bin <id>       Webhook 频道 ID (必填，例如: feishu)
  -t, --target <url>   内网目标转发地址 (必填，例如: http://localhost:3000/api/webhook)
  -s, --server <url>   云端平台地址 (默认: https://webhook.b1uegrey.xyz)
  --keep-path          保留并追加子路径到目标地址 (默认: false)
  -h, --help           显示此帮助信息

${ANSI.bold}示例:${ANSI.reset}
  node scripts/forward.mjs -b feishu -t http://localhost:3000/api/webhook
  node scripts/forward.mjs -b test -t http://127.0.0.1:8080/order/callback
`);
  process.exit(0);
}

const binId = getArg('b', 'bin', process.env.WEBHOOK_BIN || '');
const targetUrl = getArg('t', 'target', process.env.WEBHOOK_TARGET || '');
const serverUrl = (getArg('s', 'server', process.env.WEBHOOK_SERVER || 'https://webhook.b1uegrey.xyz')).replace(/\/+$/, '');
const keepPath = args.includes('--keep-path');

if (!binId) {
  console.error(`${ANSI.red}❌ 错误: 未指定 Webhook 频道 ID (-b 或 --bin)${ANSI.reset}`);
  console.error(`示例: node scripts/forward.mjs -b feishu -t http://localhost:3000/api/webhook`);
  process.exit(1);
}

if (!targetUrl) {
  console.error(`${ANSI.red}❌ 错误: 未指定内网目标地址 (-t 或 --target)${ANSI.reset}`);
  console.error(`示例: node scripts/forward.mjs -b feishu -t http://localhost:3000/api/webhook`);
  process.exit(1);
}

const streamUrl = `${serverUrl}/api/bins/${binId}/stream`;

console.log(`
${ANSI.cyan}${ANSI.bold}┌─────────────────────────────────────────────────────────────┐
│             ⚡ Webhook Inspector 内网转发客户端               │
└─────────────────────────────────────────────────────────────┘${ANSI.reset}
  ${ANSI.dim}• 云端频道:${ANSI.reset}  ${ANSI.bold}${serverUrl}/bin/${binId}${ANSI.reset}
  ${ANSI.dim}• 内网目标:${ANSI.reset}  ${ANSI.bold}${ANSI.green}${targetUrl}${ANSI.reset}
  ${ANSI.dim}• 事件流源:${ANSI.reset}  ${ANSI.dim}${streamUrl}${ANSI.reset}
  ${ANSI.dim}• 运行状态:${ANSI.reset}  ${ANSI.yellow}正在连接云端事件流...${ANSI.reset}
`);

let isRunning = true;
process.on('SIGINT', () => {
  console.log(`\n${ANSI.yellow}正在退出内网转发客户端...${ANSI.reset}`);
  isRunning = false;
  process.exit(0);
});

// 转发单条 Webhook 请求到本地
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

// 维持与云端的 SSE 长连接
async function startStream() {
  while (isRunning) {
    try {
      const res = await fetch(streamUrl, {
        headers: {
          'Accept': 'text/event-stream',
          'User-Agent': 'Webhook-Inspector-Forwarder/1.0',
        },
      });

      if (!res.ok || !res.body) {
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
      console.warn(`${ANSI.yellow}⚠️ 长连接断开: ${err.message}，将在 3 秒后自动重连...${ANSI.reset}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

startStream();
