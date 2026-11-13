import React, { useState } from 'react';
import { 
  Terminal, 
  FileText, 
  ListFilter, 
  Copy, 
  Check, 
  Send, 
  Trash2, 
  Code,
  Calendar,
  Globe,
  Monitor
} from 'lucide-react';
import { WebhookRecord } from '../types';
import { getMethodColor, generateCurl } from '../lib/utils';

interface RequestDetailProps {
  request: WebhookRecord | null;
  onDelete: (id: string) => void;
  onOpenReplay: (req: WebhookRecord) => void;
}

export const RequestDetail: React.FC<RequestDetailProps> = ({
  request,
  onDelete,
  onOpenReplay,
}) => {
  const [activeTab, setActiveTab] = useState<'payload' | 'headers' | 'query' | 'curl'>('payload');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isRawPayload, setIsRawPayload] = useState(false);

  if (!request) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-slate-950">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
          <Terminal className="w-8 h-8 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-300">未选择请求</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          点击左侧列表中捕获到的 Webhook 请求，即可在此处查看 Headers、Payload 报文及参数详情。
        </p>
      </div>
    );
  }

  // 解析 Headers 与 Query
  let headersObj: Record<string, string> = {};
  try {
    headersObj = JSON.parse(request.headers || '{}');
  } catch {}

  let queryObj: Record<string, string> = {};
  try {
    queryObj = JSON.parse(request.query_params || '{}');
  } catch {}

  // 格式化 Body JSON
  let formattedBody = request.body || '';
  let isJson = false;
  if (request.body) {
    try {
      const parsed = JSON.parse(request.body);
      formattedBody = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  const curlCommand = generateCurl(request);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      
      {/* 顶部请求元数据栏 */}
      <div className="border-b border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border font-mono tracking-wide ${getMethodColor(
                request.method
              )}`}
            >
              {request.method}
            </span>
            <span className="font-mono text-xs sm:text-sm text-slate-200 truncate select-all">
              {request.url}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenReplay(request)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
              title="重放/转发到本地或指定地址"
            >
              <Send className="w-3.5 h-3.5" />
              <span>重放请求</span>
            </button>

            <button
              onClick={() => copyToClipboard(curlCommand, 'curl')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="复制为 cURL 命令"
            >
              {copiedType === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'curl' ? '已复制' : '复制 cURL'}</span>
            </button>

            <button
              onClick={() => onDelete(request.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-slate-700 transition"
              title="删除此记录"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 详细参数元数据 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{new Date(request.created_at).toLocaleString('zh-CN')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span>{request.ip || '127.0.0.1'}</span>
          </div>
          {request.content_type && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Type:</span>
              <span className="text-indigo-300">{request.content_type}</span>
            </div>
          )}
        </div>
      </div>

      {/* 选项卡导航 */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('payload')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'payload'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>请求体 Payload</span>
            {request.body && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('headers')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'headers'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Headers ({Object.keys(headersObj).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('query')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'query'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Query 参数 ({Object.keys(queryObj).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('curl')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'curl'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>cURL 命令</span>
          </button>
        </div>

        {activeTab === 'payload' && request.body && isJson && (
          <button
            onClick={() => setIsRawPayload(!isRawPayload)}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-mono underline cursor-pointer"
          >
            {isRawPayload ? '查看格式化 JSON' : '查看原始 Raw'}
          </button>
        )}
      </div>

      {/* 选项卡内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {/* 1. Payload 视图 */}
        {activeTab === 'payload' && (
          <div className="h-full flex flex-col">
            {!request.body ? (
              <div className="text-slate-500 text-xs italic p-4 text-center">
                (该请求没有包含 Body 报文)
              </div>
            ) : (
              <div className="relative flex-1">
                <button
                  onClick={() => copyToClipboard(request.body || '', 'body')}
                  className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1 transition"
                >
                  {copiedType === 'body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedType === 'body' ? '已复制' : '复制 Body'}</span>
                </button>

                <pre className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-indigo-200 overflow-auto whitespace-pre-wrap leading-relaxed max-h-[calc(100vh-280px)]">
                  {isRawPayload ? request.body : formattedBody}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 2. Headers 键值对表格 */}
        {activeTab === 'headers' && (
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="p-2.5 w-1/3">Header 名称</th>
                  <th className="p-2.5">Header 值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                {Object.entries(headersObj).map(([k, v]) => (
                  <tr key={k} className="hover:bg-slate-900/40 group">
                    <td className="p-2.5 text-indigo-300 font-semibold select-all break-all align-top">
                      {k}
                    </td>
                    <td className="p-2.5 text-slate-300 select-all break-all flex items-center justify-between gap-2">
                      <span>{v}</span>
                      <button
                        onClick={() => copyToClipboard(v, `h-${k}`)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-300 transition"
                        title="复制值"
                      >
                        {copiedType === `h-${k}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Query 参数表格 */}
        {activeTab === 'query' && (
          <div>
            {Object.keys(queryObj).length === 0 ? (
              <div className="text-slate-500 text-xs italic p-4 text-center">
                (无 URL Query 参数)
              </div>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="p-2.5 w-1/3">参数名</th>
                      <th className="p-2.5">参数值</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                    {Object.entries(queryObj).map(([k, v]) => (
                      <tr key={k} className="hover:bg-slate-900/40">
                        <td className="p-2.5 text-indigo-300 font-semibold select-all">
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
          </div>
        )}

        {/* 4. cURL 代码块 */}
        {activeTab === 'curl' && (
          <div className="relative">
            <button
              onClick={() => copyToClipboard(curlCommand, 'curl-tab')}
              className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 flex items-center gap-1 transition"
            >
              {copiedType === 'curl-tab' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedType === 'curl-tab' ? '已复制' : '复制命令'}</span>
            </button>
            <pre className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-auto whitespace-pre-wrap leading-relaxed">
              {curlCommand}
            </pre>
          </div>
        )}
      </div>

    </div>
  );
};

