import { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { Env, UserSession } from './types';

export const DEFAULT_JWT_SECRET = 'b1uegrey_shared_sso_secret_2026_xyz';

// PBKDF2 密码哈希 (利用 WebCrypto API)
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const finalSalt = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hash, salt: finalSalt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const result = await hashPassword(password, salt);
  return result.hash === hash;
}

// 签发跨子域通用的 JWT (指定 HS256 算法)
export async function createSessionToken(user: UserSession, secret?: string): Promise<string> {
  const payload = {
    sub: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role || 'user',
    status: user.status || 'active',
    apps: user.allowedApps || ['*'],
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30天有效
  };
  return await sign(payload, secret || DEFAULT_JWT_SECRET, 'HS256');
}

// 提取请求中所有可能的鉴权 Token（按优先级依次尝试：Authorization 标头、URL 参数、Cookie）
export function extractCandidateTokens(c: Context): string[] {
  const candidates: string[] = [];

  // 1. Authorization: Bearer <token>
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const val = authHeader.substring(7).trim();
    if (val && !candidates.includes(val)) candidates.push(val);
  }

  // 2. URL query 中的 token 或 sso_token
  const qToken = c.req.query('sso_token') || c.req.query('token');
  if (qToken) {
    const val = qToken.trim();
    if (val && !candidates.includes(val)) candidates.push(val);
  }

  // 3. 解析 Cookie Header 中所有的 auth_token
  const cookieHeader = c.req.header('Cookie') || '';
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        const key = part.slice(0, eqIdx).trim();
        const value = part.slice(eqIdx + 1).trim();
        if (key === 'auth_token' && value && !candidates.includes(value)) {
          candidates.push(value);
        }
      }
    }
  }

  // 4. Hono getCookie 保底
  const honoCookie = getCookie(c, 'auth_token');
  if (honoCookie && !candidates.includes(honoCookie)) {
    candidates.push(honoCookie);
  }

  return candidates;
}

// 鉴权中间件 (支持多 Cookie 容错重试、Authorization 标头、或 URL Query token)
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: { user: UserSession; token: string } }>,
  next: Next
) {
  const candidates = extractCandidateTokens(c);

  if (candidates.length === 0) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }

  const jwtSecret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  let validPayload: any = null;
  let workingToken: string = '';

  for (const token of candidates) {
    try {
      const payload = await verify(token, jwtSecret, 'HS256');
      if (payload && payload.sub) {
        validPayload = payload;
        workingToken = token;
        break;
      }
    } catch {}
  }

  if (!validPayload) {
    return c.json({ error: '登录凭证已过期或无效，请重新登录' }, 401);
  }

  // 检查账号状态 (防封禁账号渗透)
  if (validPayload.status === 'disabled') {
    return c.json({ error: '该账号已被管理员封禁，无法访问 Webhook 调试网关' }, 403);
  }

  // 检查子系统授权矩阵
  if (Array.isArray(validPayload.apps)) {
    const isAllowed = validPayload.apps.includes('*') || validPayload.apps.includes('webhook');
    if (!isAllowed) {
      return c.json({ error: '您尚未获得访问 Webhook 调试网关的权限，请联系管理员分配' }, 403);
    }
  }

  // 若请求中存在多个 auth_token（历史遗留的 host-only Cookie 冲突），主动清除残留的子域 Cookie
  const cookieHeader = c.req.header('Cookie') || '';
  if (cookieHeader.split('auth_token=').length > 2) {
    deleteCookie(c, 'auth_token', { path: '/' });
  }

  c.set('user', {
    id: validPayload.sub as string,
    username: (validPayload.username as string) || '',
    nickname: (validPayload.nickname as string) || '',
    role: (validPayload.role as string) || 'user',
    status: (validPayload.status as string) || 'active',
    allowedApps: Array.isArray(validPayload.apps) ? (validPayload.apps as string[]) : ['*'],
  });
  c.set('token', workingToken);

  await next();
}
