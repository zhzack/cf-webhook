import React, { useState, useEffect, useMemo } from 'react';
import { 
  Send, 
  Plus, 
  Trash2, 
  RotateCw, 
  Copy, 
  Check, 
  Terminal, 
  History, 
  Layers, 
  Shield, 
  Key, 
  Globe, 
  Clock, 
  Database,
  Sparkles,
  ArrowRight,
  Code
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
  status?: number;
  durationMs?: number;
  payload: OutboundRequestPayload;
}

export const ApiClient: React.FC = () => {
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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

  // 发起请求
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

    try {
      const res = await fetchApi<OutboundResponseData>('/api/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setResponse(res);

      // 保存至历史记录
      const newHistoryItem: RequestHistoryItem = {
        id: crypto.randomUUID(),
        time: Date.now(),
        method,
        url: url.trim(),
        status: res.status,
        durationMs: res.durationMs,
        payload,
      };

      const updatedHistory = [newHistoryItem, ...history.filter((h) => h.url !== url.trim()).slice(0, 29)];
      setHistory(updatedHistory);
      localStorage.setItem('api_client_history', JSON.stringify(updatedHistory));
    } catch (err: any) {
      setResponse({
        success: false,
        status: 0,
        statusText: 'Client Error',
        durationMs: 0,
        sizeBytes: 0,
        headers: {},
        body: '',
        error: err.message || '请求未发出',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 从历史记录恢复请求配置
  const handleRestoreFromHistory = (item: RequestHistoryItem) => {
    setMethod(item.method);
    setUrl(item.url);
    if (item.payload.body) {
      setBodyContent(item.payload.body);
      setBodyType('json');
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
    setIsHistoryOpen(false);
  };

  // 快捷填充常用示例
  const handleLoadSample = (sampleUrl: string, sampleMethod = 'GET') => {
    setUrl(sampleUrl);
    setMethod(sampleMethod);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden text-slate-200">
      
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

        {/* 历史记录抽屉触发器 */}
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className={`p-2 rounded-lg border text-xs transition flex items-center gap-1 ${
            isHistoryOpen 
              ? 'bg-indigo-600 text-white border-indigo-500' 
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
          title="查看近期调试历史"
        >
          <History className="w-4 h-4" />
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
                        className="flex-1 bg-transparent px-2 py-1 text-slate-200 font-mono outline-none border-r border-slate-800"
                      />
                      <input
                        type="text"
                        placeholder="参数值 (Value)"
                        value={p.value}
                        onChange={(e) => {
                          const updated = params.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item));
                          setParams(updated);
                          updateUrlFromParams(updated);
                        }}
                        className="flex-1 bg-transparent px-2 py-1 text-slate-300 font-mono outline-none"
                      />
                      <button
                        onClick={() => {
                          const updated = params.filter((_, i) => i !== idx);
                          setParams(updated.length ? updated : [{ id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
                          updateUrlFromParams(updated);
                        }}
                        className="p-1 text-slate-600 hover:text-rose-400 transition"
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
                      setHeaders([...headers, { id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
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
                          setHeaders(headers.map((item, i) => (i === idx ? { ...item, enabled: e.target.checked } : item)));
                        }}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 ml-1"
                      />
                      <input
                        type="text"
                        placeholder="标头 (Header Key)"
                        value={h.key}
                        onChange={(e) => {
                          setHeaders(headers.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)));
                        }}
                        className="flex-1 bg-transparent px-2 py-1 text-indigo-300 font-mono outline-none border-r border-slate-800"
                      />
                      <input
                        type="text"
                        placeholder="标头值 (Value)"
                        value={h.value}
                        onChange={(e) => {
                          setHeaders(headers.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item)));
                        }}
                        className="flex-1 bg-transparent px-2 py-1 text-slate-300 font-mono outline-none"
                      />
                      <button
                        onClick={() => {
                          const updated = headers.filter((_, i) => i !== idx);
                          setHeaders(updated.length ? updated : [{ id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
                        }}
                        className="p-1 text-slate-600 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Auth 认证选项 */}
            {activeReqTab === 'auth' && (
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-medium">认证方式</label>
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="none">无认证 (No Auth)</option>
                    <option value="bearer">Bearer Token (API 令牌)</option>
                    <option value="basic">Basic Auth (用户名密码)</option>
                  </select>
                </div>

                {authType === 'bearer' && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-medium">Token 凭证</label>
                    <textarea
                      rows={3}
                      placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-indigo-200 outline-none focus:border-indigo-500"
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
                  <div className="flex items-center gap-2">
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
                    输入目标 API 并点击「发送」，Cloudflare 全球边缘节点将向目标发起直连请求并秒级呈现响应详情。
                  </p>
                </div>

                {/* 快捷示例卡片 */}
                <div className="pt-2 flex flex-wrap gap-2 justify-center max-w-md">
                  <button
                    onClick={() => handleLoadSample('https://httpbin.org/get', 'GET')}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                  >
                    GET httpbin.org/get
                  </button>
                  <button
                    onClick={() => handleLoadSample('https://api.github.com/zen', 'GET')}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                  >
                    GET api.github.com/zen
                  </button>
                  <button
                    onClick={() => handleLoadSample('/api/health', 'GET')}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                  >
                    GET /api/health (本地)
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
                  <div className="mb-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                    ❌ 请求失败: {response.error}
                  </div>
                )}

                {/* 1. 响应 Body (使用我们的 JsonViewer 语法高亮) */}
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
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${getMethodColor(item.method)}`}>
                        {item.method}
                      </span>
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
