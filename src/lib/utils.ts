import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { WebhookRecord } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getMethodColor(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'POST':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'PUT':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'PATCH':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'DELETE':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

export function generateCurl(record: WebhookRecord): string {
  let curl = `curl -X ${record.method} '${record.url}'`;

  let headersObj: Record<string, string> = {};
  try {
    headersObj = JSON.parse(record.headers || '{}');
  } catch {}

  for (const [k, v] of Object.entries(headersObj)) {
    const lower = k.toLowerCase();
    // 忽略一些客户端不需要带的代理/传输头
    if (!['host', 'content-length', 'cf-ray', 'cf-connecting-ip', 'cf-visitor', 'x-forwarded-proto'].includes(lower)) {
      curl += ` \\\n  -H '${k}: ${v}'`;
    }
  }

  if (record.body && !['GET', 'HEAD'].includes(record.method.toUpperCase())) {
    const escaped = record.body.replace(/'/g, "'\\''");
    curl += ` \\\n  --data-raw '${escaped}'`;
  }

  return curl;
}

