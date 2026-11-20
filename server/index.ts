import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, Bin, WebhookRecord, UserSession, BinMember, OutboundRequestPayload, OutboundResponseData } from './types';
import { forwardScript } from './forwardScript';
import { requireAuth, getOptionalUser, getBinUserRole } from './auth';
import { authRouter } from './routes/auth';
import { tunnelRouter } from './routes/tunnel';
import { tcpRouter } from './routes/tcp';

const app = new Hono<{ Bindings: Env; Variables: { user: UserSession; token: string } }>();

// CORS 配置 (允许凭证跨子域传递)
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowHeaders: ['*'],
}));

// 提供内网转发客户端极速获取脚本 (公开免鉴权，通过 curl 管道直接下载)
app.get('/forward.mjs', (c) => {
  return new Response(forwardScript, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

// 辅助函数：安全兼容历史表结构变更
let schemaEnsured = false;
async function ensureSchema(db: D1Database) {
  if (schemaEnsured) return;
  try {
    await db.prepare('ALTER TABLE bins ADD COLUMN user_id TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE bins ADD COLUMN description TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE bins ADD COLUMN share_token TEXT').run();
  } catch {}
  try {
    await db.prepare('ALTER TABLE bins ADD COLUMN is_public INTEGER DEFAULT 0').run();
  } catch {}
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS bin_members (
        bin_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (bin_id, user_id)
      )
    `).run();
  } catch {}
  schemaEnsured = true;
}

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

// 辅助函数：生成协作分享口令 (16位随机字符)
function generateShareToken(): string {
  return 'st_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// 辅助函数：根据 binId 查找或隐式创建 Bin，并关联所有者用户与生成分享口令
async function getOrCreateBin(db: D1Database, binId: string, userId?: string, name?: string): Promise<Bin> {
  await ensureSchema(db);
  const existing = await db
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (existing) {
    let needUpdate = false;
    let newUserId = existing.user_id;
    let newShareToken = existing.share_token;

    if (!existing.user_id && userId) {
      newUserId = userId;
      needUpdate = true;
    }
    if (!existing.share_token) {
      newShareToken = generateShareToken();
      needUpdate = true;
    }

    if (needUpdate) {
      try {
        await db
          .prepare('UPDATE bins SET user_id = ?, share_token = ? WHERE id = ?')
          .bind(newUserId, newShareToken, binId)
          .run();
        existing.user_id = newUserId;
        existing.share_token = newShareToken;
      } catch {}
    }

    // 确保创建者在 bin_members 表中有记录
    if (existing.user_id) {
      try {
        await db
          .prepare(
            `INSERT INTO bin_members (bin_id, user_id, role, created_at)
             VALUES (?, ?, 'owner', ?)
             ON CONFLICT(bin_id, user_id) DO NOTHING`
          )
          .bind(existing.id, existing.user_id, existing.created_at || Date.now())
          .run();
      } catch {}
    }

    return existing;
  }

  const now = Date.now();
  const shareToken = generateShareToken();
  const newBin: Bin = {
    id: binId,
    user_id: userId || null,
    name: name || `Bin ${binId}`,
    description: '',
    response_status: 200,
    response_content_type: 'application/json',
    response_body: JSON.stringify({ status: 'ok', binId }),
    feishu_auto_challenge: 1,
    share_token: shareToken,
    is_public: 0,
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO bins (id, user_id, name, description, response_status, response_content_type, response_body, feishu_auto_challenge, share_token, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newBin.id,
      newBin.user_id,
      newBin.name,
      newBin.description,
      newBin.response_status,
      newBin.response_content_type,
      newBin.response_body,
      newBin.feishu_auto_challenge,
      newBin.share_token,
      newBin.is_public,
      newBin.created_at,
      newBin.updated_at
    )
    .run();

  // 若关联了用户，同步写入 bin_members 作为 owner
  if (userId) {
    try {
      await db
        .prepare(
          `INSERT INTO bin_members (bin_id, user_id, role, created_at)
           VALUES (?, ?, 'owner', ?)`
        )
        .bind(binId, userId, now)
        .run();
    } catch {}
  }

  return newBin;
}

// ----------------------------------------------------
// 1. API 路由 (/api/...)
// ----------------------------------------------------
const api = new Hono<{ Bindings: Env; Variables: { user: UserSession; token: string } }>();

// 健康检查 (公开)
api.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'cf-webhook', timestamp: Date.now() });
});

// 认证子路由 (/api/auth)
api.route('/auth', authRouter);

// TCP 隧道路由 (/api/tunnel)
api.route('/', tunnelRouter);

// TCP 端口探测路由 (/api/tcp/ping)
api.route('/', tcpRouter);

// 获取当前登录用户可访问的所有频道列表（我的频道 vs 与我协作）
api.get('/bins', requireAuth, async (c) => {
  const user = c.get('user');
  await ensureSchema(c.env.DB);

  // 1. 我的频道 (创建者是我，或历史遗留未绑定所有者的频道)
  const myBinsRes = await c.env.DB
    .prepare(
      `SELECT b.*, 
        (SELECT COUNT(*) FROM requests r WHERE r.bin_id = b.id) as request_count,
        'owner' as role
       FROM bins b 
       WHERE b.user_id = ? OR b.user_id IS NULL 
       ORDER BY b.updated_at DESC 
       LIMIT 50`
    )
    .bind(user.id)
    .all<Bin>();

  // 2. 与我协作的频道 (通过 bin_members 被授权，且创建者不是我)
  const sharedBinsRes = await c.env.DB
    .prepare(
      `SELECT b.*, 
        bm.role as role,
        u.nickname as owner_name,
        (SELECT COUNT(*) FROM requests r WHERE r.bin_id = b.id) as request_count
       FROM bin_members bm
       JOIN bins b ON bm.bin_id = b.id
       LEFT JOIN users u ON b.user_id = u.id
       WHERE bm.user_id = ? AND (b.user_id != ? OR b.user_id IS NULL)
       ORDER BY b.updated_at DESC
       LIMIT 50`
    )
    .bind(user.id, user.id)
    .all<Bin>();

  const myBins = myBinsRes.results || [];
  const sharedBins = sharedBinsRes.results || [];

  return c.json({
    success: true,
    myBins,
    sharedBins,
    bins: [...myBins, ...sharedBins],
  });
});

// 创建新频道 (需要登录)
api.post('/bins', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const binId = generateBinId();
  const name = body.name ? String(body.name).trim() : `Bin ${binId}`;
  const bin = await getOrCreateBin(c.env.DB, binId, user.id, name);
  return c.json({ success: true, bin: { ...bin, role: 'owner' } });
});

// 通过分享口令加入频道 (协作邀请链接)
api.post('/bins/join-by-share', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const shareToken = (body.shareToken || '').trim();

  if (!shareToken) {
    return c.json({ error: '请输入有效的分享口令' }, 400);
  }

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE share_token = ?')
    .bind(shareToken)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '分享口令不存在或已失效' }, 404);
  }

  // 若已经是所有者
  if (bin.user_id === user.id) {
    return c.json({ success: true, bin: { ...bin, role: 'owner' }, message: '您是该频道的所有者' });
  }

  // 检查是否已是成员
  const existingMember = await c.env.DB
    .prepare('SELECT role FROM bin_members WHERE bin_id = ? AND user_id = ?')
    .bind(bin.id, user.id)
    .first<{ role: string }>();

  if (!existingMember) {
    // 默认加入为 viewer 角色
    await c.env.DB
      .prepare(
        `INSERT INTO bin_members (bin_id, user_id, role, created_at)
         VALUES (?, ?, 'viewer', ?)`
      )
      .bind(bin.id, user.id, Date.now())
      .run();
  }

  const role = existingMember ? existingMember.role : 'viewer';
  return c.json({
    success: true,
    bin: { ...bin, role },
    message: '成功加入频道协作',
  });
});

// 获取指定 Bin 的配置信息及当前用户权限
api.get('/bins/:binId', async (c) => {
  const binId = c.req.param('binId') || '';
  const shareToken = c.req.query('share_token') || c.req.header('x-share-token');
  const user = await getOptionalUser(c);

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在或已被删除' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user, shareToken);
  if (!perm.canView) {
    return c.json({ error: '无权访问该频道，请登录或获取分享口令' }, 403);
  }

  return c.json({
    success: true,
    bin: {
      ...bin,
      role: perm.role,
    },
  });
});

// 更新指定 Bin 的配置（名称、Mock响应、飞书自动应答等，需编辑权限）
api.put('/bins/:binId', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');
  const body = await c.req.json().catch(() => ({}));
  const now = Date.now();

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.canEdit) {
    return c.json({ error: '您没有编辑该频道的权限（只读权限无法修改配置）' }, 403);
  }

  const name = body.name !== undefined ? String(body.name) : bin.name;
  const description = body.description !== undefined ? String(body.description) : bin.description;
  const response_status = typeof body.response_status === 'number' ? body.response_status : (bin.response_status || 200);
  const response_content_type = body.response_content_type || bin.response_content_type || 'application/json';
  const response_body = body.response_body !== undefined ? body.response_body : (bin.response_body ?? '{"status":"ok"}');
  const feishu_auto_challenge = body.feishu_auto_challenge !== undefined ? (body.feishu_auto_challenge ? 1 : 0) : bin.feishu_auto_challenge;
  const is_public = (perm.isOwner && body.is_public !== undefined) ? (body.is_public ? 1 : 0) : (bin.is_public || 0);

  await c.env.DB
    .prepare(
      `UPDATE bins SET
         name = ?,
         description = ?,
         response_status = ?,
         response_content_type = ?,
         response_body = ?,
         feishu_auto_challenge = ?,
         is_public = ?,
         updated_at = ?
       WHERE id = ?`
    )
    .bind(
      name,
      description,
      response_status,
      response_content_type,
      response_body,
      feishu_auto_challenge,
      is_public,
      now,
      binId
    )
    .run();

  const updated = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  return c.json({ success: true, bin: { ...updated, role: perm.role } });
});

// 重置频道的分享口令 (仅 Owner 可操作)
api.post('/bins/:binId/reset-share-token', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.isOwner) {
    return c.json({ error: '仅频道创建者可重置分享口令' }, 403);
  }

  const newShareToken = generateShareToken();
  await c.env.DB
    .prepare('UPDATE bins SET share_token = ?, updated_at = ? WHERE id = ?')
    .bind(newShareToken, Date.now(), binId)
    .run();

  return c.json({ success: true, share_token: newShareToken });
});

// 删除频道 (仅 Owner 可删除，级联删除请求历史与成员表)
api.delete('/bins/:binId', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.isOwner) {
    return c.json({ error: '仅频道创建者可删除该频道' }, 403);
  }

  // 级联删除请求与成员
  await c.env.DB.prepare('DELETE FROM requests WHERE bin_id = ?').bind(binId).run();
  await c.env.DB.prepare('DELETE FROM bin_members WHERE bin_id = ?').bind(binId).run();
  await c.env.DB.prepare('DELETE FROM bins WHERE id = ?').bind(binId).run();

  return c.json({ success: true });
});

// 获取频道成员列表
api.get('/bins/:binId/members', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.canView) {
    return c.json({ error: '无权查看频道成员' }, 403);
  }

  const membersRes = await c.env.DB
    .prepare(
      `SELECT bm.bin_id, bm.user_id, bm.role, bm.created_at, u.username, u.nickname
       FROM bin_members bm
       LEFT JOIN users u ON bm.user_id = u.id
       WHERE bm.bin_id = ?
       ORDER BY 
         CASE bm.role 
           WHEN 'owner' THEN 1 
           WHEN 'editor' THEN 2 
           ELSE 3 
         END, 
         bm.created_at ASC`
    )
    .bind(binId)
    .all<BinMember>();

  return c.json({
    success: true,
    members: membersRes.results || [],
  });
});

// 添加或更新频道成员 (仅 Owner 可操作)
api.post('/bins/:binId/members', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const role = body.role === 'editor' ? 'editor' : 'viewer';

  if (!username) {
    return c.json({ error: '请输入要添加的用户名' }, 400);
  }

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.isOwner) {
    return c.json({ error: '仅频道创建者可管理成员' }, 403);
  }

  // 根据用户名在本地 users 查找目标用户
  const targetUser = await c.env.DB
    .prepare('SELECT id, username, nickname FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: string; username: string; nickname?: string }>();

  if (!targetUser) {
    return c.json({
      error: `未找到用户 "${username}"。请确认该用户名正确，且对方已至少登录过一次平台或认证中心`,
    }, 404);
  }

  if (targetUser.id === bin.user_id) {
    return c.json({ error: '该用户是频道创建者，无需重复添加' }, 400);
  }

  await c.env.DB
    .prepare(
      `INSERT INTO bin_members (bin_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(bin_id, user_id) DO UPDATE SET role = excluded.role`
    )
    .bind(binId, targetUser.id, role, Date.now())
    .run();

  return c.json({
    success: true,
    member: {
      bin_id: binId,
      user_id: targetUser.id,
      username: targetUser.username,
      nickname: targetUser.nickname,
      role,
      created_at: Date.now(),
    },
  });
});

// 移除频道成员 (Owner 可移除他人，或者协作者自行退出)
api.delete('/bins/:binId/members/:targetUserId', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');
  const targetUserId = c.req.param('targetUserId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  const isSelf = user.id === targetUserId;

  if (!perm.isOwner && !isSelf) {
    return c.json({ error: '仅所有者可移除成员，或协作者自行退出' }, 403);
  }

  if (targetUserId === bin.user_id) {
    return c.json({ error: '无法将所有者从频道中移除' }, 400);
  }

  await c.env.DB
    .prepare('DELETE FROM bin_members WHERE bin_id = ? AND user_id = ?')
    .bind(binId, targetUserId)
    .run();

  return c.json({ success: true, isSelf });
});

// 获取请求历史列表 (需查看权限)
api.get('/bins/:binId/requests', async (c) => {
  const binId = c.req.param('binId');
  const shareToken = c.req.query('share_token') || c.req.header('x-share-token');
  const user = await getOptionalUser(c);

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user, shareToken);
  if (!perm.canView) {
    return c.json({ error: '无权查看该频道的请求历史' }, 403);
  }

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

// 清空当前 Bin 的所有历史请求 (需编辑权限)
api.delete('/bins/:binId/requests', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.canEdit) {
    return c.json({ error: '只读成员无权清空请求' }, 403);
  }

  await c.env.DB
    .prepare('DELETE FROM requests WHERE bin_id = ?')
    .bind(binId)
    .run();

  return c.json({ success: true });
});

// 删除单个请求记录 (需编辑权限)
api.delete('/bins/:binId/requests/:reqId', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');
  const reqId = c.req.param('reqId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.canEdit) {
    return c.json({ error: '只读成员无权删除请求' }, 403);
  }

  await c.env.DB
    .prepare('DELETE FROM requests WHERE bin_id = ? AND id = ?')
    .bind(binId, reqId)
    .run();

  return c.json({ success: true });
});

// 请求重放代理 (Replay / Forward，需编辑权限)
api.post('/bins/:binId/replay', requireAuth, async (c) => {
  const user = c.get('user');
  const binId = c.req.param('binId');

  await ensureSchema(c.env.DB);
  const bin = await c.env.DB
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.json({ error: '频道不存在' }, 404);
  }

  const perm = await getBinUserRole(c.env.DB, bin, user);
  if (!perm.canEdit) {
    return c.json({ error: '只读成员无权发起请求重放' }, 403);
  }

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

// 平台通用出站发包代理 (API 调试器，支持从边缘直接发包)
api.post('/send', requireAuth, async (c) => {
  const startTime = Date.now();
  try {
    const payload: OutboundRequestPayload = await c.req.json().catch(() => ({} as any));
    let { url, method = 'GET', headers = {}, queryParams = {}, body, auth } = payload;

    if (!url || typeof url !== 'string') {
      return c.json<OutboundResponseData>({
        success: false,
        status: 0,
        statusText: 'Bad Request',
        durationMs: 0,
        sizeBytes: 0,
        headers: {},
        body: '',
        error: '请求 URL 不能为空',
      }, 400);
    }

    url = url.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // 拼接 Query 参数
    try {
      const urlObj = new URL(url);
      if (queryParams && typeof queryParams === 'object') {
        for (const [k, v] of Object.entries(queryParams)) {
          if (k && k.trim()) {
            urlObj.searchParams.set(k.trim(), String(v));
          }
        }
      }
      url = urlObj.toString();
    } catch (e: any) {
      return c.json<OutboundResponseData>({
        success: false,
        status: 0,
        statusText: 'Invalid URL',
        durationMs: 0,
        sizeBytes: 0,
        headers: {},
        body: '',
        error: '无效的目标 URL: ' + e.message,
      }, 400);
    }

    // 整理并清洗 Headers
    const cleanHeaders: Record<string, string> = {};
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        const lower = k.toLowerCase().trim();
        if (lower && !['host', 'content-length', 'connection', 'cf-ray', 'cf-connecting-ip'].includes(lower)) {
          cleanHeaders[k.trim()] = String(v);
        }
      }
    }

    // 处理认证体系
    if (auth && auth.type) {
      if (auth.type === 'bearer' && auth.token) {
        cleanHeaders['Authorization'] = `Bearer ${auth.token.trim()}`;
      } else if (auth.type === 'basic' && auth.username) {
        const credentials = btoa(`${auth.username}:${auth.password || ''}`);
        cleanHeaders['Authorization'] = `Basic ${credentials}`;
      }
    }

    const upperMethod = method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(upperMethod) && body !== undefined && body !== null;

    const fetchRes = await fetch(url, {
      method: upperMethod,
      headers: cleanHeaders,
      body: hasBody ? String(body) : undefined,
    });

    const durationMs = Date.now() - startTime;
    const resText = await fetchRes.text();
    const resHeaders: Record<string, string> = {};
    fetchRes.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    const sizeBytes = new Blob([resText]).size;

    return c.json<OutboundResponseData>({
      success: true,
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      durationMs,
      sizeBytes,
      headers: resHeaders,
      body: resText,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return c.json<OutboundResponseData>({
      success: false,
      status: 0,
      statusText: 'Network Error',
      durationMs,
      sizeBytes: 0,
      headers: {},
      body: '',
      error: err.message || '请求发送异常',
    }, 500);
  }
});

// SSE 实时推送流 (支持浏览器 Cookie、Token 鉴权或分享口令)
api.get('/bins/:binId/stream', async (c) => {
  const binId = c.req.param('binId');
  const shareToken = c.req.query('share_token') || c.req.header('x-share-token');
  const user = await getOptionalUser(c);
  const db = c.env.DB;

  await ensureSchema(db);
  const bin = await db
    .prepare('SELECT * FROM bins WHERE id = ?')
    .bind(binId)
    .first<Bin>();

  if (!bin) {
    return c.text('Bin not found', 404);
  }

  const perm = await getBinUserRole(db, bin, user, shareToken);
  if (!perm.canView) {
    return c.text('Unauthorized: no permission to listen to this bin stream', 403);
  }

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
// 保持对第三方平台 (如飞书、GitHub、Stripe、微信等) 公开免密接收
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
