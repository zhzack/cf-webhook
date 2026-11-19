import { Hono } from 'hono';
import { connect } from 'cloudflare:sockets';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';

export const tunnelRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession; token: string } }>();

tunnelRouter.get('/tunnel', requireAuth, async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const target = c.req.query('target');
  if (!target) {
    return c.text('Missing target parameter (e.g. api.telegram.org:443)', 400);
  }

  const [hostname, portStr] = target.split(':');
  const port = parseInt(portStr || '443', 10);

  if (!hostname || isNaN(port) || port <= 0 || port > 65535) {
    return c.text('Invalid target format', 400);
  }

  // 禁止 SMTP 等敏感端口
  if (port === 25) {
    return c.text('Port 25 is blocked', 403);
  }

  // 创建 WebSocket 对 (Edge 与本地客户端通信)
  const webSocketPair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(webSocketPair);

  serverWs.accept();

  try {
    const tcpSocket = connect({ hostname, port });
    const writer = tcpSocket.writable.getWriter();
    const reader = tcpSocket.readable.getReader();

    // 本地 CLI (WebSocket) -> 远程目标服务器 (TCP Socket)
    serverWs.addEventListener('message', async (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          await writer.write(new Uint8Array(event.data));
        } else if (typeof event.data === 'string') {
          await writer.write(new TextEncoder().encode(event.data));
        }
      } catch {
        try { serverWs.close(1011, 'TCP write failed'); } catch {}
      }
    });

    serverWs.addEventListener('close', () => {
      try { tcpSocket.close(); } catch {}
    });

    serverWs.addEventListener('error', () => {
      try { tcpSocket.close(); } catch {}
    });

    // 远程目标服务器 (TCP Socket) -> 本地 CLI (WebSocket)
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            serverWs.send(value);
          }
        }
      } catch {
      } finally {
        try { serverWs.close(1000, 'TCP closed'); } catch {}
        try { tcpSocket.close(); } catch {}
      }
    })();

  } catch (err: any) {
    serverWs.close(1011, `Connect failed: ${err.message || 'unknown'}`);
  }

  return new Response(null, {
    status: 101,
    webSocket: clientWs,
  });
});

