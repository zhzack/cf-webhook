import React, { useState } from 'react';
import { 
  Zap, 
  Copy, 
  Check, 
  Plus, 
  Settings, 
  Trash2, 
  ExternalLink,
  Radio
} from 'lucide-react';
import { Bin } from '../types';

interface HeaderProps {
  bin: Bin | null;
  isConnected: boolean;
  onNewBin: () => void;
  onOpenSettings: () => void;
  onClearRequests: () => void;
  totalRequests: number;
}

export const Header: React.FC<HeaderProps> = ({
  bin,
  isConnected,
  onNewBin,
  onOpenSettings,
  onClearRequests,
  totalRequests,
}) => {
  const [copied, setCopied] = useState(false);

  // 线上推荐使用已绑定的专属自定义域名 webhook.b1uegrey.xyz
  // 如果是本地开发环境，则优先展示当前 origin
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const baseUrl = isLocal 
    ? `${window.location.origin}/bin`
    : `https://webhook.b1uegrey.xyz/bin`;
  
  const webhookUrl = bin ? `${baseUrl}/${bin.id}` : '';

  const handleCopy = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Logo & 状态 */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                Webhook Inspector
                <span className="text-xs px-1.5 py-0.5 rounded font-mono font-normal bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Edge
                </span>
              </h1>
            </div>
          </div>

          {/* 实时连接指示灯 */}
          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={isConnected ? 'text-emerald-400' : 'text-slate-400'}>
              {isConnected ? '实时流已就绪' : '连接中...'}
            </span>
          </div>
        </div>

        {/* 专属 Webhook URL 复制条 */}
        <div className="flex-1 max-w-xl w-full">
          <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 focus-within:border-indigo-500/50 p-1 transition-all">
            <div className="px-2 text-slate-500 flex items-center gap-1 text-xs select-none">
              <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>URL:</span>
            </div>
            <input
              type="text"
              readOnly
              value={webhookUrl || '正在生成通道...'}
              className="bg-transparent text-xs sm:text-sm text-indigo-200 font-mono w-full outline-none px-2 select-all truncate"
            />
            <button
              onClick={handleCopy}
              disabled={!webhookUrl}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                copied
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>

        {/* 操作功能按钮 */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="自定义 Mock 响应与飞书自动应答"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>响应配置</span>
          </button>

          <button
            onClick={onClearRequests}
            disabled={totalRequests === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-950/40 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-900/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="清空请求历史"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空 ({totalRequests})</span>
          </button>

          <button
            onClick={onNewBin}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="分配全新的专属 Webhook 频道"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>新建频道</span>
          </button>
        </div>

      </div>
    </header>
  );
};

