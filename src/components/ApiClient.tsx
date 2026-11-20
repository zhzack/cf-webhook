import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Send, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  History, 
  Layers, 
  Shield, 
  Key, 
  Globe, 
  Clock, 
  Database,
  Sparkles,
  ArrowRight,
  Code,
  Laptop,
  Download,
  Upload,
  X,
  FileText,
  AlertCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { OutboundRequestPayload, OutboundResponseData } from '../types';
import { getMethodColor, formatBytes } from '../lib/utils';
import { JsonViewer } from './JsonViewer';
import { fetchApi } from '../api';

interface KeyValueItem {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

interface RequestHistoryItem {
  id: string;
  time: number;
  method: string;
  url: string;
  node: 'edge' | 'browser';
  status?: number;
  durationMs?: number;
  payload: OutboundRequestPayload;
}

interface ApiPreset {
  id: string;
  name: string;
  category: 'im' | 'ai' | 'tool';
  categoryLabel: string;
  icon: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  auth?: { type: 'none' | 'bearer' | 'basic'; token?: string; username?: string; password?: string };
  body?: string;
  description: string;
}

const API_PRESETS: ApiPreset[] = [
  {
    id: 'feishu-bot',
    name: '飞书群自定义机器人',
    category: 'im',
    categoryLabel: '即时通讯机器人',
    icon: '🤖',
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_FEISHU_TOKEN',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: '来自网络调试平台的测试消息 🚀'
      }
    }, null, 2),
    description: '通过飞书自定义机器人 Webhook 向群聊发送测试文本消息'
  },
  {
    id: 'wecom-bot',
    name: '企业微信群机器人',
    category: 'im',
    categoryLabel: '即时通讯机器人',
    icon: '💬',
    method: 'POST',
    url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_BOT_KEY',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: '实时告警通知: <font color="info">网络调试平台</font> 发包测试成功\n> 发包节点: Cloudflare Global Edge\n> 延时: 18ms'
      }
    }, null, 2),
    description: '通过企业微信群机器人 Webhook 发送 Markdown 消息'
  },
  {
    id: 'dingtalk-bot',
    name: '钉钉群自定义机器人',
    category: 'im',
    categoryLabel: '即时通讯机器人',
    icon: '📌',
    method: 'POST',
    url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_ACCESS_TOKEN',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: {
        content: '【调试通知】来自网络调试平台的连通性探测测试'
      }
    }, null, 2),
    description: '向钉钉群机器人发送文本通知'
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot (SendMessage)',
    category: 'im',
    categoryLabel: '即时通讯机器人',
    icon: '✈️',
    method: 'POST',
    url: 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: '@your_channel_or_chat_id',
      text: 'Hello from Cloudflare Edge Worker API Debugger! 🚀 Overseas bypass active.'
    }, null, 2),
    description: '利用 Cloudflare 全球边缘免代理直连 Telegram API 发送消息'
  },
  {
    id: 'openai-chat',
    name: 'OpenAI Chat Completions',
    category: 'ai',
    categoryLabel: 'AI 大模型接口',
    icon: '🧠',
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    auth: { type: 'bearer', token: 'sk-proj-YOUR_API_KEY' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an API testing assistant.' },
        { role: 'user', content: 'Say hello in 5 words!' }
      ],
      temperature: 0.7
    }, null, 2),
    description: '测试 OpenAI / DeepSeek / 通义千问等兼容对话补全接口'
  },
  {
    id: 'httpbin-get',
    name: 'HTTPBin GET Echo',
    category: 'tool',
    categoryLabel: '基础网络诊断',
    icon: '🌐',
    method: 'GET',
    url: 'https://httpbin.org/get',
    headers: { 'Accept': 'application/json' },
    description: 'GET 请求测试及客户端出口 IP / Header 反射回显'
  },
  {
    id: 'httpbin-post',
    name: 'HTTPBin POST Echo',
    category: 'tool',
    categoryLabel: '基础网络诊断',
    icon: '📦',
    method: 'POST',
    url: 'https://httpbin.org/post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      debug: true,
      sender: 'cf-webhook-client',
      timestamp: Date.now()
    }, null, 2),
    description: '测试 JSON Payload 提交与服务器反射'
  },
  {
    id: 'localhost-test',
    name: '本地开发服务探活',
    category: 'tool',
    categoryLabel: '基础网络诊断',
    icon: '💻',
    method: 'GET',
    url: 'http://127.0.0.1:3000/api/health',
    headers: { 'Accept': 'application/json' },
    description: '结合「浏览器直发」或内网代理，探测本机开发端口'
  }
];

// cURL 解析器
function parseCurlCommand(rawCmd: string): Partial<OutboundRequestPayload> | null {
  if (!rawCmd || typeof rawCmd !== 'string') return null;
  const text = rawCmd.replace(/\\\r?\n/g, ' ').replace(/\n/g, ' ').trim();
  if (!text.toLowerCase().startsWith('curl')) return null;

  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);

  let method = 'GET';
  let url = '';
  const headers: Record<string, string> = {};
  let body = '';
  let auth: { type: 'none' | 'bearer' | 'basic'; token?: string; username?: string; password?: string } = { type: 'none' };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-X' || t === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase();
    } else if (t === '-H' || t === '--header') {
      const headerStr = tokens[++i] || '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > 0) {
        const k = headerStr.slice(0, colonIdx).trim();
        const v = headerStr.slice(colonIdx + 1).trim();
        if (k.toLowerCase() === 'authorization') {
          if (v.toLowerCase().startsWith('bearer ')) {
            auth = { type: 'bearer', token: v.slice(7).trim() };
          } else if (v.toLowerCase().startsWith('basic ')) {
            try {
              const decoded = atob(v.slice(6).trim());
              const [u, p] = decoded.split(':');
              auth = { type: 'basic', username: u, password: p || '' };
            } catch {}
          }
        }
        headers[k] = v;
      }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      body = tokens[++i] || '';
      if (method === 'GET') method = 'POST';
    } else if (t === '-u' || t === '--user') {
      const cred = tokens[++i] || '';
      const [u, p] = cred.split(':');
      auth = { type: 'basic', username: u, password: p || '' };
    } else if (!t.startsWith('-') && !url) {
      url = t.replace(/^['"]|['"]$/g, '');
    }
  }

  const queryParams: Record<string, string> = {};
  try {
    const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    parsedUrl.searchParams.forEach((v, k) => {
      queryParams[k] = v;
    });
  } catch {}

  return { method, url, headers, queryParams, body, auth };
}

interface ApiClientProps {
  initialPayload?: OutboundRequestPayload | null;
}

export const ApiClient: React.FC<ApiClientProps> = ({ initialPayload }) => {
  // 发包节点模式：'edge' (Cloudflare 全球边缘代理) vs 'browser' (浏览器直连)
  const [sendNode, setSendNode] = useState<'edge' | 'browser'>('edge');

  // 请求基本要素
  const [method, setMethod] = useState<string>('GET');
  const [url, setUrl] = useState<string>('https://httpbin.org/get');
  const [activeReqTab, setActiveReqTab] = useState<'params' | 'headers' | 'auth' | 'body'>('params');
  const [activeResTab, setActiveResTab] = useState<'body' | 'headers' | 'curl'>('body');

  // Params 参数列表
  const [params, setParams] = useState<KeyValueItem[]>([
    { id: '1', enabled: true, key: '', value: '' },
  ]);

  // Headers 请求头列表
  const [headers, setHeaders] = useState<KeyValueItem[]>([
    { id: 'h1', enabled: true, key: 'Content-Type', value: 'application/json' },
    { id: 'h2', enabled: false, key: 'Accept', value: 'application/json' },
  ]);

  // Auth 认证
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic'>('none');
  const [bearerToken, setBearerToken] = useState<string>('');
  const [basicUser, setBasicUser] = useState<string>('');
  const [basicPass, setBasicPass] = useState<string>('');

  // Body 请求体
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'raw'>('none');
  const [bodyContent, setBodyContent] = useState<string>('{\n  "message": "Hello from Network Debugger",\n  "timestamp": 123456\n}');

  // 发包状态与响应结果
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<OutboundResponseData | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);

  // 弹窗与抽屉控制
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
  const [curlInputText, setCurlInputText] = useState('');
  const [curlError, setCurlError] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // 发包历史记录 (localStorage)
  const [history, setHistory] = useState<RequestHistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('api_client_history');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return [];
  });

  // 响应外部传入的 initialPayload (收发无缝联动)
  useEffect(() => {
    if (!initialPayload) return;
    if (initialPayload.method) setMethod(initialPayload.method.toUpperCase());
    if (initialPayload.url) setUrl(initialPayload.url);

    if (initialPayload.headers) {
      const hItems: KeyValueItem[] = Object.entries(initialPayload.headers).map(([k, v], idx) => ({
        id: `h_inbound_${idx}`,
        enabled: true,
        key: k,
        value: v,
      }));
      if (hItems.length > 0) setHeaders(hItems);
    }

    if (initialPayload.queryParams) {
      const pItems: KeyValueItem[] = Object.entries(initialPayload.queryParams).map(([k, v], idx) => ({
        id: `p_inbound_${idx}`,
        enabled: true,
        key: k,
        value: v,
      }));
      if (pItems.length > 0) setParams(pItems);
    }

    if (initialPayload.body) {
      setBodyContent(initialPayload.body);
      try {
        JSON.parse(initialPayload.body);
        setBodyType('json');
      } catch {
        setBodyType('raw');
      }
      setActiveReqTab('body');
    }
  }, [initialPayload]);

  // 同步 Params 到 URL
  const updateUrlFromParams = (newParams: KeyValueItem[]) => {
    try {
      const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
      parsedUrl.search = '';
      for (const p of newParams) {
        if (p.enabled && p.key.trim()) {
          parsedUrl.searchParams.append(p.key.trim(), p.value);
        }
      }
      setUrl(parsedUrl.toString());
    } catch {}
  };

  // 快捷格式化 JSON Body
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(bodyContent);
      setBodyContent(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      alert('JSON 格式有误: ' + e.message);
    }
  };

  // 生成对应的 cURL 命令行
  const generatedCurl = useMemo(() => {
    const parts = [`curl -X ${method} "${url}"`];
    for (const h of headers) {
      if (h.enabled && h.key.trim()) {
        parts.push(`-H "${h.key.trim()}: ${h.value}"`);
      }
    }
    if (authType === 'bearer' && bearerToken.trim()) {
      parts.push(`-H "Authorization: Bearer ${bearerToken.trim()}"`);
    } else if (authType === 'basic' && basicUser.trim()) {
      parts.push(`-u "${basicUser.trim()}:${basicPass}"`);
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && bodyType !== 'none' && bodyContent.trim()) {
      parts.push(`-d '${bodyContent.replace(/'/g, "'\\''")}'`);
    }
    return parts.join(' \\\n  ');
  }, [method, url, headers, authType, bearerToken, basicUser, basicPass, bodyType, bodyContent]);

  // 发起请求 (支持 Cloudflare Edge 代理与前端浏览器直连)
  const handleSendRequest = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setResponse(null);

    // 组装 Headers
    const reqHeaders: Record<string, string> = {};
    for (const h of headers) {
      if (h.enabled && h.key.trim()) {
        reqHeaders[h.key.trim()] = h.value;
      }
    }

    // 组装 Query Params
    const queryParams: Record<string, string> = {};
    for (const p of params) {
      if (p.enabled && p.key.trim()) {
        queryParams[p.key.trim()] = p.value;
      }
    }

    const payload: OutboundRequestPayload = {
      url: url.trim(),
      method,
      headers: reqHeaders,
      queryParams,
      body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && bodyType !== 'none' ? bodyContent : undefined,
      auth: {
        type: authType,
        token: bearerToken,
        username: basicUser,
        password: basicPass,
      },
    };

    const startTime = Date.now();

    try {
      let resData: OutboundResponseData;

      if (sendNode === 'edge') {
        // 模式 1: 通过 Cloudflare 边缘节点代理发包
        resData = await fetchApi<OutboundResponseData>('/api/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        // 模式 2: 浏览器前端直连发包 (适合 localhost 或局域网调试)
        let directUrl = url.trim();
        if (!/^https?:\/\//i.test(directUrl)) {
          directUrl = 'http://' + directUrl;
        }

        const directHeaders = { ...reqHeaders };
        if (authType === 'bearer' && bearerToken.trim()) {
          directHeaders['Authorization'] = `Bearer ${bearerToken.trim()}`;
        } else if (authType === 'basic' && basicUser.trim()) {
          directHeaders['Authorization'] = `Basic ${btoa(`${basicUser.trim()}:${basicPass}`)}`;
        }

        const fetchInit: RequestInit = {
          method,
          headers: directHeaders,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && bodyType !== 'none' ? bodyContent : undefined,
        };

        const clientRes = await fetch(directUrl, fetchInit);
        const durationMs = Date.now() - startTime;
        const resText = await clientRes.text();
        const resHeaders: Record<string, string> = {};
        clientRes.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });

        resData = {
          success: true,
          status: clientRes.status,
          statusText: clientRes.statusText || 'OK',
          durationMs,
          sizeBytes: new Blob([resText]).size,
          headers: resHeaders,
          body: resText,
        };
      }

      setResponse(resData);

      // 保存至历史记录
      const newHistoryItem: RequestHistoryItem = {
        id: crypto.randomUUID(),
        time: Date.now(),
        method,
        url: url.trim(),
        node: sendNode,
        status: resData.status,
        durationMs: resData.durationMs,
        payload,
      };

      const updatedHistory = [newHistoryItem, ...history.filter((h) => h.url !== url.trim()).slice(0, 29)];
      setHistory(updatedHistory);
      localStorage.setItem('api_client_history', JSON.stringify(updatedHistory));

    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      let errorMsg = err.message || '请求未发出';
      if (sendNode === 'browser') {
        errorMsg += '。\n💡 提示: 浏览器直连受同源策略 (CORS) 限制，若目标服务未允许跨域，请切换至「CF 边缘节点」发包。';
      }

      setResponse({
        success: false,
        status: 0,
        statusText: sendNode === 'browser' ? 'CORS / Network Error' : 'Client Error',
        durationMs,
        sizeBytes: 0,
        headers: {},
        body: '',
        error: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 应用常用预设模板
  const handleApplyPreset = (preset: ApiPreset) => {
    setMethod(preset.method);
    setUrl(preset.url);

    // 设置 Headers
    const hItems: KeyValueItem[] = Object.entries(preset.headers || {}).map(([k, v], idx) => ({
      id: `preset_h_${idx}`,
      enabled: true,
      key: k,
      value: v,
    }));
    setHeaders(hItems);

    // 设置 Auth
    if (preset.auth) {
      setAuthType(preset.auth.type);
      setBearerToken(preset.auth.token || '');
      setBasicUser(preset.auth.username || '');
      setBasicPass(preset.auth.password || '');
    } else {
      setAuthType('none');
    }

    // 设置 Body
    if (preset.body) {
      setBodyContent(preset.body);
      setBodyType('json');
      setActiveReqTab('body');
    } else {
      setBodyType('none');
      setActiveReqTab('params');
    }

    // 默认切回边缘节点
    if (preset.id === 'localhost-test') {
      setSendNode('browser');
    } else {
      setSendNode('edge');
    }

    setIsPresetsOpen(false);
  };

  // 解析并导入 cURL
  const handleImportCurl = () => {
    setCurlError('');
    const parsed = parseCurlCommand(curlInputText);
    if (!parsed || !parsed.url) {
      setCurlError('无法识别有效的 cURL 命令，请确保包含 URL (例如: curl https://example.com -X POST)');
      return;
    }

    if (parsed.method) setMethod(parsed.method);
    if (parsed.url) setUrl(parsed.url);

    if (parsed.headers && Object.keys(parsed.headers).length > 0) {
      const hItems: KeyValueItem[] = Object.entries(parsed.headers).map(([k, v], idx) => ({
        id: `curl_h_${idx}`,
        enabled: true,
        key: k,
        value: v,
      }));
      setHeaders(hItems);
    }

    if (parsed.auth) {
      setAuthType(parsed.auth.type);
      if (parsed.auth.token) setBearerToken(parsed.auth.token);
      if (parsed.auth.username) setBasicUser(parsed.auth.username);
      if (parsed.auth.password) setBasicPass(parsed.auth.password);
    }

    if (parsed.body) {
      setBodyContent(parsed.body);
      try {
        JSON.parse(parsed.body);
        setBodyType('json');
      } catch {
        setBodyType('raw');
      }
      setActiveReqTab('body');
    }

    setIsCurlModalOpen(false);
    setCurlInputText('');
  };

  // 从历史记录恢复请求配置
  const handleRestoreFromHistory = (item: RequestHistoryItem) => {
    setMethod(item.method);
    setUrl(item.url);
    if (item.node) setSendNode(item.node);

    if (item.payload.body) {
      setBodyContent(item.payload.body);
      setBodyType('json');
      setActiveReqTab('body');
    }
    if (item.payload.headers) {
      const restoredHeaders: KeyValueItem[] = Object.entries(item.payload.headers).map(([k, v], idx) => ({
        id: `h_rest_${idx}`,
        enabled: true,
        key: k,
        value: v,
      }));
      setHeaders(restoredHeaders);
    }
    if (item.payload.auth) {
      setAuthType(item.payload.auth.type || 'none');
      setBearerToken(item.payload.auth.token || '');
      setBasicUser(item.payload.auth.username || '');
      setBasicPass(item.payload.auth.password || '');
    }
    setIsHistoryOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden text-slate-200">
      
      {/* 顶部主工具栏：发包节点 + 预设库 + cURL导入 + 历史抽屉 */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-2.5">
        
        {/* 左侧：发包节点切换器 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">发包节点:</span>
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setSendNode('edge')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                sendNode === 'edge'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="由 Cloudflare 全球边缘 Worker 代发：海外直连 (免代理访问 Telegram/OpenAI)、无跨域限制"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-300" />
              <span>CF 边缘代理</span>
            </button>
            <button
              onClick={() => setSendNode('browser')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                sendNode === 'browser'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="由前端浏览器直接发包：可直达 localhost / 局域网内部服务 (需服务支持 CORS)"
            >
              <Laptop className="w-3.5 h-3.5 text-emerald-300" />
              <span>浏览器直连</span>
            </button>
          </div>
        </div>

        {/* 右侧：预设模板 + cURL 导入 + 调试历史 */}
        <div className="flex items-center gap-2">
          {/* 预设模板触发按钮 */}
          <button
            onClick={() => setIsPresetsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="选择常用 API 模板 (飞书/企微/钉钉/Telegram/OpenAI)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>常用预设</span>
          </button>

          {/* cURL 导入按钮 */}
          <button
            onClick={() => setIsCurlModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="从任意 cURL 命令一键导入参数"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>导入 cURL</span>
          </button>

          {/* 历史记录按钮 */}
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              isHistoryOpen 
                ? 'bg-indigo-600 text-white border-indigo-500' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="查看近期调试发包历史"
          >
            <History className="w-3.5 h-3.5 text-slate-300" />
            <span>历史 ({history.length})</span>
          </button>
        </div>
      </div>

      {/* 顶部请求地址栏 */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2">
        {/* Method 下拉选择 */}
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={`px-3 py-2 rounded-lg font-mono text-xs font-bold outline-none border transition ${getMethodColor(
            method
          )} bg-slate-900 border-slate-700 cursor-pointer`}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
        </select>

        {/* URL 输入框 */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="输入目标 API 地址，例如: https://httpbin.org/get"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSendRequest();
              }
            }}
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-indigo-200 outline-none transition"
          />
        </div>

        {/* 发送按钮 */}
        <button
          onClick={handleSendRequest}
          disabled={isLoading || !url.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition flex-shrink-0"
          title="发送请求 (快捷键: Ctrl + Enter)"
        >
          <Send className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? '发送中...' : '发送 (Send)'}</span>
        </button>
      </div>

      {/* 主体两栏布局：左侧请求构建器，右侧响应结果面板 */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* 左侧：请求构造器 */}
        <div className="w-1/2 border-r border-slate-800 flex flex-col h-full bg-slate-900/30">
          {/* 请求参数选项卡 */}
          <div className="border-b border-slate-800 bg-slate-900/60 px-3 flex items-center gap-1">
            <button
              onClick={() => setActiveReqTab('params')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
                activeReqTab === 'params'
                  ? 'border-indigo-500 text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Params ({params.filter((p) => p.enabled && p.key).length})
            </button>
            <button
              onClick={() => setActiveReqTab('headers')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
                activeReqTab === 'headers'
                  ? 'border-indigo-500 text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Headers ({headers.filter((h) => h.enabled && h.key).length})
            </button>
            <button
              onClick={() => setActiveReqTab('auth')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
                activeReqTab === 'auth'
                  ? 'border-indigo-500 text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Auth {authType !== 'none' && <span className="text-emerald-400 text-[10px]">●</span>}
            </button>
            <button
              onClick={() => setActiveReqTab('body')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
                activeReqTab === 'body'
                  ? 'border-indigo-500 text-indigo-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Body {bodyType !== 'none' && <span className="text-indigo-400 text-[10px]">●</span>}
            </button>
          </div>

          {/* 请求参数表单内容 */}
          <div className="flex-1 overflow-auto p-3 text-xs">
            {/* 1. Params 键值对 */}
            {activeReqTab === 'params' && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-500 flex items-center justify-between pb-1">
                  <span>URL 查询参数列表</span>
                  <button
                    onClick={() => {
                      const newItems = [...params, { id: crypto.randomUUID(), enabled: true, key: '', value: '' }];
                      setParams(newItems);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 添加参数
                  </button>
                </div>

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  {params.map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-2 p-1.5">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => {
                          const updated = params.map((item, i) => (i === idx ? { ...item, enabled: e.target.checked } : item));
                          setParams(updated);
                          updateUrlFromParams(updated);
                        }}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 ml-1"
                      />
                      <input
                        type="text"
                        placeholder="参数名 (Key)"
                        value={p.key}
                        onChange={(e) => {
                          const updated = params.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item));
                          setParams(updated);
                          updateUrlFromParams(updated);
                        }}
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-slate-200 font-mono text-xs focus:ring-0 outline-none"
                      />
                      <span className="text-slate-600 font-mono">=</span>
                      <input
                        type="text"
                        placeholder="参数值 (Value)"
                        value={p.value}
                        onChange={(e) => {
                          const updated = params.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item));
                          setParams(updated);
                          updateUrlFromParams(updated);
                        }}
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-indigo-200 font-mono text-xs focus:ring-0 outline-none"
                      />
                      <button
                        onClick={() => {
                          const updated = params.filter((_, i) => i !== idx);
                          setParams(updated.length ? updated : [{ id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
                          updateUrlFromParams(updated);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Headers 键值对 */}
            {activeReqTab === 'headers' && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-500 flex items-center justify-between pb-1">
                  <span>自定义请求头 (Headers)</span>
                  <button
                    onClick={() => {
                      const newItems = [...headers, { id: crypto.randomUUID(), enabled: true, key: '', value: '' }];
                      setHeaders(newItems);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 添加标头
                  </button>
                </div>

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  {headers.map((h, idx) => (
                    <div key={h.id} className="flex items-center gap-2 p-1.5">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => {
                          const updated = headers.map((item, i) => (i === idx ? { ...item, enabled: e.target.checked } : item));
                          setHeaders(updated);
                        }}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 ml-1"
                      />
                      <input
                        type="text"
                        placeholder="标头名 (如 Content-Type)"
                        value={h.key}
                        onChange={(e) => {
                          const updated = headers.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item));
                          setHeaders(updated);
                        }}
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-slate-200 font-mono text-xs focus:ring-0 outline-none"
                      />
                      <span className="text-slate-600 font-mono">:</span>
                      <input
                        type="text"
                        placeholder="标头值"
                        value={h.value}
                        onChange={(e) => {
                          const updated = headers.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item));
                          setHeaders(updated);
                        }}
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-indigo-200 font-mono text-xs focus:ring-0 outline-none"
                      />
                      <button
                        onClick={() => {
                          const updated = headers.filter((_, i) => i !== idx);
                          setHeaders(updated);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Auth 认证凭证配置 */}
            {activeReqTab === 'auth' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">认证方式</label>
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="none">无需认证 (No Auth)</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth (用户名/密码)</option>
                  </select>
                </div>

                {authType === 'bearer' && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-medium">Bearer Token</label>
                    <input
                      type="text"
                      placeholder="例如: eyJhbGciOi..."
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {authType === 'basic' && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-medium">用户名</label>
                      <input
                        type="text"
                        value={basicUser}
                        onChange={(e) => setBasicUser(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs mb-1 font-medium">密码</label>
                      <input
                        type="password"
                        value={basicPass}
                        onChange={(e) => setBasicPass(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Body 报文配置 */}
            {activeReqTab === 'body' && (
              <div className="h-full flex flex-col space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                      <input
                        type="radio"
                        checked={bodyType === 'none'}
                        onChange={() => setBodyType('none')}
                      />
                      <span>None</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                      <input
                        type="radio"
                        checked={bodyType === 'json'}
                        onChange={() => setBodyType('json')}
                      />
                      <span>JSON</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                      <input
                        type="radio"
                        checked={bodyType === 'raw'}
                        onChange={() => setBodyType('raw')}
                      />
                      <span>Raw Text</span>
                    </label>
                  </div>

                  {bodyType === 'json' && (
                    <button
                      onClick={handleFormatJson}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> 格式化 JSON
                    </button>
                  )}
                </div>

                {bodyType !== 'none' && (
                  <textarea
                    rows={12}
                    value={bodyContent}
                    onChange={(e) => setBodyContent(e.target.value)}
                    className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-indigo-200 outline-none focus:border-indigo-500 leading-relaxed"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：响应结果面板 */}
        <div className="w-1/2 flex flex-col h-full bg-slate-950 overflow-hidden">
          {/* 响应状态栏 */}
          <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Response</span>
              {response && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      response.status >= 200 && response.status < 300
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : response.status >= 400
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {response.durationMs} ms
                  </span>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Database className="w-3 h-3 text-slate-500" />
                    {formatBytes(response.sizeBytes)}
                  </span>
                </div>
              )}
            </div>

            {/* 响应选项卡切换 */}
            {response && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveResTab('body')}
                  className={`px-2.5 py-1 text-xs rounded transition ${
                    activeResTab === 'body'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Body
                </button>
                <button
                  onClick={() => setActiveResTab('headers')}
                  className={`px-2.5 py-1 text-xs rounded transition ${
                    activeResTab === 'headers'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Headers ({Object.keys(response.headers || {}).length})
                </button>
                <button
                  onClick={() => setActiveResTab('curl')}
                  className={`px-2.5 py-1 text-xs rounded transition ${
                    activeResTab === 'curl'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cURL
                </button>
              </div>
            )}
          </div>

          {/* 响应内容渲染 */}
          <div className="flex-1 overflow-auto p-4">
            {!response && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shadow-inner">
                  <Globe className="w-7 h-7 text-indigo-400/80" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-300 text-sm">准备发送 HTTP 请求</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                    选择发包节点并点击「发送」，系统将向目标发起直连请求并秒级呈现响应详情。
                  </p>
                </div>

                {/* 快捷示例卡片 */}
                <div className="pt-2 flex flex-wrap gap-2 justify-center max-w-md">
                  <button
                    onClick={() => {
                      setUrl('https://httpbin.org/get');
                      setMethod('GET');
                    }}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                  >
                    GET httpbin.org/get
                  </button>
                  <button
                    onClick={() => {
                      setUrl('https://api.github.com/zen');
                      setMethod('GET');
                    }}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                  >
                    GET api.github.com/zen
                  </button>
                  <button
                    onClick={() => setIsPresetsOpen(true)}
                    className="px-2.5 py-1 rounded-md bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/60 text-[11px] font-mono text-indigo-300 transition"
                  >
                    ✨ 查看所有模板预设...
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="h-full flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-mono">正在连接目标服务器...</span>
              </div>
            )}

            {response && (
              <div className="h-full flex flex-col">
                {response.error && (
                  <div className="mb-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs whitespace-pre-wrap leading-relaxed">
                    ❌ 请求失败: {response.error}
                  </div>
                )}

                {/* 1. 响应 Body */}
                {activeResTab === 'body' && (
                  <div className="flex-1 overflow-hidden">
                    <JsonViewer content={response.body || ''} />
                  </div>
                )}

                {/* 2. 响应 Headers */}
                {activeResTab === 'headers' && (
                  <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-2.5 w-1/3">Header 标头</th>
                          <th className="p-2.5">标头值</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                        {Object.entries(response.headers || {}).map(([k, v]) => (
                          <tr key={k} className="hover:bg-slate-900/40">
                            <td className="p-2.5 text-indigo-300 font-semibold select-all break-all align-top">
                              {k}
                            </td>
                            <td className="p-2.5 text-slate-300 select-all break-all">
                              {v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. 对应 cURL */}
                {activeResTab === 'curl' && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCurl);
                        setCurlCopied(true);
                        setTimeout(() => setCurlCopied(false), 2000);
                      }}
                      className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1 transition"
                    >
                      {curlCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{curlCopied ? '已复制' : '复制命令'}</span>
                    </button>
                    <pre className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-auto whitespace-pre-wrap leading-relaxed">
                      {generatedCurl}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 预设模板模态框 */}
        {isPresetsOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">常用 API 发包预设库</h3>
                </div>
                <button
                  onClick={() => setIsPresetsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-4">
                {['im', 'ai', 'tool'].map((cat) => {
                  const filtered = API_PRESETS.filter((p) => p.category === cat);
                  const catLabel = filtered[0]?.categoryLabel || cat;
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                        {catLabel}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filtered.map((preset) => (
                          <div
                            key={preset.id}
                            onClick={() => handleApplyPreset(preset)}
                            className="p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 hover:border-indigo-500/50 transition cursor-pointer group flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-sm flex items-center gap-1.5 font-medium text-slate-200 group-hover:text-indigo-300 transition">
                                  <span>{preset.icon}</span>
                                  <span>{preset.name}</span>
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${getMethodColor(preset.method)}`}>
                                  {preset.method}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                {preset.description}
                              </p>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 truncate mt-2">
                              {preset.url}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* cURL 导入模态框 */}
        {isCurlModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <Upload className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">导入 cURL 命令</h3>
                </div>
                <button
                  onClick={() => setIsCurlModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-400">
                  粘贴从 Chrome DevTools、文档或终端复制的任意 cURL 命令，系统将自动解析其 Method、URL、Headers 及 Body。
                </p>

                <textarea
                  rows={8}
                  placeholder={`curl -X POST "https://api.example.com/v1/test" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "test"}'`}
                  value={curlInputText}
                  onChange={(e) => setCurlInputText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-indigo-200 outline-none focus:border-indigo-500 leading-relaxed"
                />

                {curlError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{curlError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setIsCurlModalOpen(false);
                      setCurlInputText('');
                    }}
                    className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImportCurl}
                    disabled={!curlInputText.trim()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition"
                  >
                    解析并导入
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 历史记录侧边抽屉 */}
        {isHistoryOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800 shadow-2xl z-20 flex flex-col animate-in slide-in-from-right duration-150">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                出站调试历史 ({history.length})
              </span>
              <button
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem('api_client_history');
                }}
                className="text-[11px] text-slate-500 hover:text-rose-400 transition"
              >
                清空
              </button>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-slate-800/60 p-2 space-y-1">
              {history.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  暂无发包记录
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleRestoreFromHistory(item)}
                    className="p-2.5 rounded-lg hover:bg-slate-800/60 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${getMethodColor(item.method)}`}>
                          {item.method}
                        </span>
                        <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 font-mono">
                          {item.node === 'browser' ? '浏览器' : 'CF边缘'}
                        </span>
                      </div>
                      {item.status !== undefined && (
                        <span className={`text-[10px] font-mono ${item.status >= 200 && item.status < 300 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {item.status} ({item.durationMs}ms)
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-slate-300 truncate" title={item.url}>
                      {item.url}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {new Date(item.time).toLocaleTimeString('zh-CN')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
