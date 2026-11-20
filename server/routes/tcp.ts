import { Hono } from 'hono';
import { connect } from 'cloudflare:sockets';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';

export const tcpRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession; token: string } }>();

export interface TcpPingResult {
  host: string;
  ip?: string;
  port: number;
  open: boolean;
  latencyMs: number;
  status: 'open' | 'closed' | 'timeout' | 'error';
  colo?: string;
  banner?: string;
  error?: string;
  timestamp: number;
}

// 辅助函数：通过 DoH 智能将域名解析为目标 IPv4 地址 (兼容本地开发环境与线上)
async function resolveHostToIp(host: string): Promise<string> {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') || host === 'localhost') {
    return host === 'localhost' ? '127.0.0.1' : host;
  }
  try {
    const res = await fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=1`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data: any = await res.json();
      const ip = data.Answer?.find((a: any) => a.type === 1)?.data;
      if (ip) return ip;
    }
  } catch {}
  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      headers: { 'Accept': 'application/dns-json' },
    });
    if (res.ok) {
      const data: any = await res.json();
      const ip = data.Answer?.find((a: any) => a.type === 1)?.data;
      if (ip) return ip;
    }
  } catch {}
  return host;
}

// TCP 端口连通性探测与握手延时测试
tcpRouter.post('/tcp/ping', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let { host, port, timeoutMs = 5000, sendPayload } = body;

  if (!host || typeof host !== 'string') {
    return c.json({ error: '主机名或 IP 不能为空' }, 400);
  }
  host = host.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];

  port = parseInt(port, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    return c.json({ error: '端口必须在 1-65535 之间' }, 400);
  }

  // 避免敏感端口滥用
  if (port === 25) {
    return c.json({ error: '端口 25 已被平台安全规则限制' }, 403);
  }

  timeoutMs = Math.min(Math.max(timeoutMs, 500), 10000);
  const startTime = Date.now();
  const colo = (c.req.raw.cf as any)?.colo || 'Local / Cloudflare PoP';

  // 解析真实 IP
  const targetIp = await resolveHostToIp(host);

  try {
    const socketPromise = (async () => {
      const connectStart = Date.now();
      const tcpSocket = connect({ hostname: targetIp, port });
      if ((tcpSocket as any).opened) {
        await (tcpSocket as any).opened;
      }
      const handshakeTime = Date.now() - connectStart;
      const writer = tcpSocket.writable.getWriter();
      const reader = tcpSocket.readable.getReader();
      let banner = '';

      // 若指定了探测测试报文 (例如 PING\r\n 或 HEAD / HTTP/1.0\r\n\r\n)
      if (sendPayload && typeof sendPayload === 'string') {
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(sendPayload));
      }

      // 尝试在 400ms 内读取首包响应 (例如 SSH banner, HTTP header 或 Redis 回显)
      try {
        const readPromise = reader.read();
        const timeoutRead = new Promise<{ value: undefined; done: true }>((res) =>
          setTimeout(() => res({ value: undefined, done: true }), 400)
        );
        const firstChunk = await Promise.race([readPromise, timeoutRead]);
        if (firstChunk && firstChunk.value) {
          banner = new TextDecoder().decode(firstChunk.value).slice(0, 300);
        }
      } catch {}

      try { writer.releaseLock(); } catch {}
      try { reader.releaseLock(); } catch {}
      try { tcpSocket.close(); } catch {}

      return {
        open: true,
        latencyMs: handshakeTime,
        status: 'open' as const,
        banner: banner ? banner.trim() : undefined,
      };
    })();

    const timeoutPromise = new Promise<{ open: boolean; latencyMs: number; status: 'timeout'; error: string }>((resolve) => {
      setTimeout(() => {
        resolve({
          open: false,
          latencyMs: timeoutMs,
          status: 'timeout',
          error: `连接超时 (${timeoutMs}ms 未能建立 TCP 握手)`,
        });
      }, timeoutMs);
    });

    const result = await Promise.race([socketPromise, timeoutPromise]);

    return c.json<TcpPingResult>({
      host,
      ip: targetIp,
      port,
      open: result.open,
      latencyMs: result.latencyMs,
      status: result.status,
      colo,
      banner: (result as any).banner,
      error: (result as any).error,
      timestamp: Date.now(),
    });

  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    let status: 'closed' | 'error' = 'closed';
    let msg = err.message || '连接被拒绝';
    if (/refused/i.test(msg)) {
      status = 'closed';
      msg = '目标主机拒绝连接 (Port Closed / Connection Refused)';
    }

    return c.json<TcpPingResult>({
      host,
      ip: targetIp,
      port,
      open: false,
      latencyMs,
      status,
      colo,
      error: msg,
      timestamp: Date.now(),
    });
  }
});
