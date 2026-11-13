import React, { useState } from 'react';
import { Search, Filter, Clock, ArrowDownRight, Globe } from 'lucide-react';
import { WebhookRecord } from '../types';
import { getMethodColor, formatTimeAgo, formatBytes } from '../lib/utils';

interface RequestListProps {
  requests: WebhookRecord[];
  selectedId: string | null;
  onSelect: (record: WebhookRecord) => void;
  webhookUrl: string;
}

export const RequestList: React.FC<RequestListProps> = ({
  requests,
  selectedId,
  onSelect,
  webhookUrl,
}) => {
  const [keyword, setKeyword] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  const filtered = requests.filter((req) => {
    if (methodFilter !== 'ALL' && req.method.toUpperCase() !== methodFilter) {
      return false;
    }
    if (!keyword.trim()) return true;
    const lower = keyword.toLowerCase();
    return (
      req.path.toLowerCase().includes(lower) ||
      req.method.toLowerCase().includes(lower) ||
      (req.body && req.body.toLowerCase().includes(lower)) ||
      (req.ip && req.ip.includes(lower)) ||
      req.headers.toLowerCase().includes(lower)
    );
  });

  const methods = ['ALL', 'POST', 'GET', 'PUT', 'DELETE'];

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-full md:w-80 lg:w-96 flex-shrink-0">
      
      {/* 搜索与筛选工具栏 */}
      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/50">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="搜索路径、Header、Body..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* 方法切换标签 */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-2 py-0.5 text-xs rounded font-mono transition-all ${
                methodFilter === m
                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400'
              }`}
            >
              {m}
            </button>
          ))}
          <span className="text-[11px] text-slate-500 ml-auto font-mono">
            {filtered.length} 条
          </span>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center h-64 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-slate-600 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">正在等待 Webhook 传入...</p>
              <p className="text-xs text-slate-600 mt-1 max-w-xs">
                你可以向顶部的 URL 发送一个 POST 请求，请求将即时出现在这里。
              </p>
            </div>
          </div>
        ) : (
          filtered.map((req) => {
            const isSelected = req.id === selectedId;
            const bodyLength = req.body ? new Blob([req.body]).size : 0;
            const pathDisplay = req.path.replace(/^\/bin\/[^/]+/, '') || '/';

            return (
              <div
                key={req.id}
                onClick={() => onSelect(req)}
                className={`p-3 cursor-pointer transition-all border-l-2 select-none ${
                  isSelected
                    ? 'bg-indigo-950/30 border-l-indigo-500'
                    : 'hover:bg-slate-800/40 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono tracking-wide ${getMethodColor(
                      req.method
                    )}`}
                  >
                    {req.method}
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-600" />
                    {formatTimeAgo(req.created_at)}
                  </span>
                </div>

                <div className="text-xs font-mono text-slate-200 truncate mb-1">
                  {pathDisplay}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-mono truncate max-w-[140px]">
                    <Globe className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    {req.ip || '127.0.0.1'}
                  </span>
                  <span className="font-mono text-slate-400">
                    {formatBytes(bodyLength)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

