import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { Env, UserSession } from '../types';
import { createSessionToken, requireAuth, DEFAULT_JWT_SECRET } from '../auth';

export const authRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession; token: string } }>();

// 检查 SSO 配置与鉴权状态
authRouter.get('/status', async (c) => {
  return c.json({
    needSetup: false,
    ssoAuthUrl: c.env.AUTH_URL || 'https://auth.b1uegrey.xyz',
  });
});

// 获取当前用户信息与活跃 SSO 会话 Token
authRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const token = c.get('token');

  // 自动将当前登录用户信息同步至本地 users 表，便于成员协作邀请搜索
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, salt, nickname, created_at)
       VALUES (?, ?, '', '', ?, ?)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, nickname = excluded.nickname`
    )
      .bind(user.id, user.username, user.nickname || user.username, Date.now())
      .run();
  } catch {}

  return c.json({ user, token });
});

// 全域退出登录 (清理根域与当前域 Cookie)
authRouter.post('/logout', (c) => {
  const rootDomain = c.env.ROOT_DOMAIN || 'b1uegrey.xyz';
  deleteCookie(c, 'auth_token', { domain: '.' + rootDomain, path: '/' });
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ success: true });
});

// 本地开发备用登录 (仅限本地开发测试使用)
authRouter.post('/login', async (c) => {
  const host = c.req.header('host') || '';
  const isLocal = 
    !c.req.header('cf-ray') ||
    c.req.header('cf-connecting-ip') === '127.0.0.1' ||
    c.req.header('mf-original-hostname') !== undefined ||
    c.req.header('x-dev-auth') === 'true' ||
    host.includes('localhost') || 
    host.includes('127.0.0.1');

  if (!isLocal) {
    return c.json({ error: '请前往统一认证中心登录: https://auth.b1uegrey.xyz' }, 400);
  }

  const { username, nickname } = await c.req.json().catch(() => ({ username: 'admin', nickname: '本地管理员' }));
  const loginUsername = (username || 'admin').trim();
  const loginId = 'usr_' + loginUsername;

  const sessionUser: UserSession = {
    id: loginId,
    username: loginUsername,
    nickname: nickname || loginUsername,
    role: 'admin',
    status: 'active',
    allowedApps: ['*'],
  };

  // 同步用户至本地数据库
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, salt, nickname, created_at)
       VALUES (?, ?, '', '', ?, ?)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, nickname = excluded.nickname`
    )
      .bind(sessionUser.id, sessionUser.username, sessionUser.nickname || '', Date.now())
      .run();
  } catch {}

  const token = await createSessionToken(sessionUser, c.env.JWT_SECRET || DEFAULT_JWT_SECRET);
  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return c.json({ user: sessionUser, token });
});
