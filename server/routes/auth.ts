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
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    return c.json({ error: '请前往统一认证中心登录: https://auth.b1uegrey.xyz' }, 400);
  }

  const { username } = await c.req.json().catch(() => ({ username: 'admin' }));
  const sessionUser: UserSession = {
    id: 'usr_dev_local',
    username: username || 'admin',
    nickname: '本地开发者',
    role: 'admin',
    status: 'active',
    allowedApps: ['*'],
  };

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
