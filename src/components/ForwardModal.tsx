import React, { useState } from 'react';
import { X, Copy, Check, Radio, Terminal, Laptop, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { Bin } from '../types';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  bin: Bin | null;
  token?: string | null;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  bin,
  token,
}) => {
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000/api/webhook');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen || !bin) return null;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const serverOrigin = isLocal ? window.location.origin : 'https://webhook.b1uegrey.xyz';
  const tokenFlag = token ? ` -k ${token}` : '';

  // 1. 免克隆一行运行命令
  const oneLineCmd = `curl -sL ${serverOrigin}/forward.mjs | node - -b ${bin.id} -t ${targetUrl}${tokenFlag}`;

  // 2. 本地项目内运行命令
  const localProjectCmd = `node scripts/forward.mjs -b ${bin.id} -t ${targetUrl}${tokenFlag}`;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const presets = [
    'http://localhost:3000/api/webhook',
    'http://localhost:8000/webhook',
    'http://localhost:8080/api/callback',
    'http://127.0.0.1:5000/webhook',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden text-xs">
        
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="font-semibold text-slate-100 text-sm">
              内网机器实时转发 (Local Forwarder)
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* 原理提示 */}
          <div className="p-3 bg-indigo-950/40 border border-indigo-500/20 rounded-lg text-slate-300 leading-relaxed space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>无需公网 IP，穿透一切内网与防火墙</span>
              </div>
              {token && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                  已注入 SSO 凭证
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              内网客户端通过 SSE 长连接主动连接云端。当飞书等平台向你的 Webhook 发送请求时，客户端将在内网毫秒级复刻并发起该 HTTP 请求。
            </p>
          </div>

          {/* 目标地址输入 */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              内网服务接收地址 (Local Target URL)
            </label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="http://localhost:3000/api/webhook"
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-200 font-mono outline-none focus:border-indigo-500"
            />
            
            {/* 快速预设 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-slate-500 py-0.5">常用预设:</span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetUrl(preset)}
                  className="px-2 py-0.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded text-[11px] font-mono text-slate-400 hover:text-slate-200 transition"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* 运行命令 1：免克隆一行运行 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>方式一：免克隆一行命令运行 (推荐任何机器)</span>
              </span>
              <button
                onClick={() => copyToClipboard(oneLineCmd, 'oneline')}
                className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
              >
                {copiedType === 'oneline' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedType === 'oneline' ? '已复制' : '复制命令'}</span>
              </button>
            </div>
            <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all select-all">
              {oneLineCmd}
            </pre>
            <p className="text-[11px] text-slate-500">
              * 只要内网机器装有 Node.js 18+，无需下载任何仓库，直接在终端粘贴即可运行。
            </p>
          </div>

          {/* 运行命令 2：项目内运行 */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                <span>方式二：在已克隆的代码仓库内运行</span>
              </span>
              <button
                onClick={() => copyToClipboard(localProjectCmd, 'local')}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                {copiedType === 'local' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedType === 'local' ? '已复制' : '复制命令'}</span>
              </button>
            </div>
            <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all select-all">
              {localProjectCmd}
            </pre>
          </div>

          {/* 使用步骤 */}
          <div className="pt-2 border-t border-slate-800/60 space-y-2">
            <span className="font-semibold text-slate-300">使用三部曲：</span>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <div className="font-bold text-slate-200 mb-0.5">1. 启动本地服务</div>
                <div className="text-slate-500">如 npm run dev 跑在 3000 端口</div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <div className="font-bold text-slate-200 mb-0.5">2. 粘贴命令运行</div>
                <div className="text-slate-500">终端建立持久转发通道</div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                <div className="font-bold text-slate-200 mb-0.5">3. 实时接收调试</div>
                <div className="text-slate-500">飞书事件瞬间灌入本地后端</div>
              </div>
            </div>
          </div>

        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            关闭
          </button>
        </div>

      </div>
    </div>
  );
};
