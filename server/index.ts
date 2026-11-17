import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, Bin, WebhookRecord } from './types';
import { forwardScript } from './forwardScript';

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowHeaders: ['*'],
}));

// 提供内网转发客户端极速获取脚本
app.get('/forward.mjs', (c) => {
  return new Response(forwardScript, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

// 辅助函数：生成简短唯一的 Bin ID (8位字母数字)
function generateBinId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// 辅助函数：根据 binId 查找或隐式创建 Bin
async function getOrCreateBin(db: D1Database, binId: string): Promise<Bin> {
  const existing = await db
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const newBin: Bin = {
    id: binId,
    name: `Bin ${binId}`,
    response_status: 200,
    response_content_type: 'application/json',
    response_body: JSON.stringify({ status: 'ok', binId }),
    feishu_auto_challenge: 1,
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO bins (id, name, response_status, response_content_type, response_body, feishu_auto_challenge, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newBin.id,
      newBin.name,
      newBin.response_status,
      newBin.response_content_type,
      newBin.response_body,
      newBin.feishu_auto_challenge,
      newBin.created_at,
      newBin.updated_at
    )
    .run();

  return newBin;
}

// ----------------------------------------------------
// 1. API 路由 (/api/...)
// ----------------------------------------------------
const api = new Hono<{ Bindings: Env }>();

api.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 创建新 Bin
api.post('/bins', async (c) => {
  const binId = generateBinId();
  const bin = await getOrCreateBin(c.env.DB, binId);
  return c.json({ success: true, bin });
});

// 获取指定 Bin 的配置信息
api.get('/bins/:binId', async (c) => {
  const binId = c.req.param('binId');
  const bin = await getOrCreateBin(c.env.DB, binId);
  return c.json({ success: true, bin });
});

// 更新指定 Bin 的自定义响应规则
api.put('/bins/:binId', async (c) => {
  const binId = c.req.param('binId');
  const body = await c.req.json().catch(() => ({}));
  const now = Date.now();

  const response_status = typeof body.response_status === 'number' ? body.response_status : 200;
  const response_content_type = body.response_content_type || 'application/json';
  const response_body = body.response_body ?? '{"status":"ok"}';
  const feishu_auto_challenge = body.feishu_auto_challenge ? 1 : 0;
  const name = body.name || `Bin ${binId}`;

  await c.env.DB
    .prepare(
      `INSERT INTO bins (id, name, response_status, response_content_type, response_body, feishu_auto_challenge, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         response_status = excluded.response_status,
         response_content_type = excluded.response_content_type,
         response_body = excluded.response_body,
         feishu_auto_challenge = excluded.feishu_auto_challenge,
         updated_at = excluded.updated_at`
    )
    .bind(binId, name, response_status, response_content_type, response_body, feishu_auto_challenge, now, now)
    .run();

  const updated = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  return c.json({ success: true, bin: updated });
});

// 获取请求历史列表 (默认最新 100 条)
api.get('/bins/:binId/requests', async (c) => {
  const binId = c.req.param('binId');
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 200);

  const results = await c.env.DB
    .prepare(
      `SELECT * FROM requests 
       WHERE bin_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`
    )
    .bind(binId, limit)
    .all<WebhookRecord>();

  return c.json({
    success: true,
    requests: results.results || [],
  });
});

// 清空当前 Bin 的所有历史请求
api.delete('/bins/:binId/requests', async (c) => {
  const binId = c.req.param('binId');
  await c.env.DB
    .prepare('DELETE FROM requests WHERE bin_id = ?')
    .bind(binId)
    .run();
  return c.json({ success: true });
});

// 删除单个请求记录
api.delete('/bins/:binId/requests/:reqId', async (c) => {
  const binId = c.req.param('binId');
  const reqId = c.req.param('reqId');
  await c.env.DB
    .prepare('DELETE FROM requests WHERE bin_id = ? AND id = ?')
    .bind(binId, reqId)
    .run();
  return c.json({ success: true });
});

// 请求重放代理 (Replay / Forward)
api.post('/bins/:binId/replay', async (c) => {
  try {
    const payload = await c.req.json();
    const { targetUrl, method = 'POST', headers = {}, body } = payload;

    if (!targetUrl) {
      return c.json({ success: false, error: 'targetUrl is required' }, 400);
    }

    // 过滤掉 host 等敏感 header
    const cleanHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      if (!['host', 'content-length', 'cf-ray', 'cf-connecting-ip'].includes(lower)) {
        cleanHeaders[k] = String(v);
      }
    }

    const fetchRes = await fetch(targetUrl, {
      method,
      headers: cleanHeaders,
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
    });

    const resText = await fetchRes.text();
    const resHeaders: Record<string, string> = {};
    fetchRes.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    return c.json({
      success: true,
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      headers: resHeaders,
      body: resText,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Replay failed' }, 500);
  }
});

// SSE 实时推送流
api.get('/bins/:binId/stream', (c) => {
  const binId = c.req.param('binId');
  const db = c.env.DB;

  let lastCheckedTime = Date.now() - 5000;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 发送初始连接成功事件
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ binId, time: Date.now() })}\n\n`));

      const pollInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const newRecords = await db
            .prepare(
              `SELECT * FROM requests 
               WHERE bin_id = ? AND created_at > ? 
               ORDER BY created_at ASC`
            )
            .bind(binId, lastCheckedTime)
            .all<WebhookRecord>();

          if (newRecords.results && newRecords.results.length > 0) {
            for (const record of newRecords.results) {
              controller.enqueue(encoder.encode(`event: webhook\ndata: ${JSON.stringify(record)}\n\n`));
              if (record.created_at > lastCheckedTime) {
                lastCheckedTime = record.created_at;
              }
            }
          } else {
            // 心跳保持连接
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch {
          // 忽略轮询临时错误
        }
      }, 1500);

      c.req.raw.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

app.route('/api', api);

// ----------------------------------------------------
// 2. Webhook 万能接收网关 (/bin/:binId, /bin/:binId/*)
// ----------------------------------------------------
app.all('/bin/:binId/*', handleWebhook);
app.all('/bin/:binId', handleWebhook);

async function handleWebhook(c: any) {
  const binId = c.req.param('binId');
  const reqId = 'req_' + generateBinId() + Date.now().toString(36);
  const now = Date.now();

  // 1. 获取该 Bin 的响应配置
  const bin = await getOrCreateBin(c.env.DB, binId);

  // 2. 提取 Headers 与 Query
  const rawHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((v: string, k: string) => {
    rawHeaders[k] = v;
  });

  const queryParams: Record<string, string> = {};
  const urlObj = new URL(c.req.url);
  urlObj.searchParams.forEach((v, k) => {
    queryParams[k] = v;
  });

  const method = c.req.method.toUpperCase();
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || '';
  const contentType = c.req.header('content-type') || '';

  // 3. 读取 Body
  let bodyText = '';
  try {
    bodyText = await c.req.text();
  } catch {
    bodyText = '';
  }

  // 4. 异步保存请求到 D1（不阻塞当前响应，提高吞吐并防止超时）
  const savePromise = (async () => {
    try {
      await c.env.DB
        .prepare(
          `INSERT INTO requests (id, bin_id, method, url, path, headers, query_params, body, ip, user_agent, content_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          reqId,
          binId,
          method,
          c.req.url,
          urlObj.pathname,
          JSON.stringify(rawHeaders),
          JSON.stringify(queryParams),
          bodyText,
          ip,
          userAgent,
          contentType,
          now
        )
        .run();
    } catch (e) {
      console.error('Failed to save webhook request:', e);
    }
  })();

  if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
    c.executionCtx.waitUntil(savePromise);
  } else {
    await savePromise;
  }

  // 5. 飞书开放平台 URL 校验挑战 (url_verification) 极速拦截响应
  if (bin.feishu_auto_challenge !== 0 && bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.type === 'url_verification' && parsed?.challenge) {
        return c.json({ challenge: parsed.challenge }, 200);
      }
    } catch {}
  }

  // 6. 按照 Bin 配置返回自定义响应
  const status = bin.response_status || 200;
  const resContentType = bin.response_content_type || 'application/json';
  const resBody = bin.response_body ?? '{"status":"ok"}';

  return new Response(resBody, {
    status,
    headers: {
      'Content-Type': resContentType,
      'X-Webhook-Inspector-Bin': binId,
      'X-Webhook-Inspector-Id': reqId,
    },
  });
}

// ----------------------------------------------------
// 3. 前端静态资源托管 (Cloudflare Workers Assets)
// ----------------------------------------------------
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      return new Response(res.body, {
        status: res.status,
        headers,
      });
    }
    return res;
  }
  return c.text('Webhook Inspector Backend is running. Frontend assets not built yet.', 404);
});

export default app;

