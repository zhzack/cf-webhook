import React, { useState } from 'react';
import { 
  Activity, 
  Wifi, 
  Clock, 
  Globe, 
  Server, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Send, 
  Terminal, 
  History, 
  Trash2, 
  RotateCw, 
  Sparkles,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';
import { TcpPingResult } from '../types';
import { fetchApi } from '../api';

interface QuickPortPreset {
  name: string;
  port: number;
  protocol: string;
  desc: string;
  payload?: string;
}

const COMMON_PORTS: QuickPortPreset[] = [
  { name: 'HTTPS', port: 443, protocol: 'TLS', desc: 'Web 安全加密服务' },
  { name: 'HTTP', port: 80, protocol: 'TCP', desc: '标准 Web 服务' },
  { name: 'SSH', port: 22, protocol: 'TCP', desc: '远程安全终端 (读取版本 Banner)' },
  { name: 'Redis', port: 6379, protocol: 'TCP', desc: '内存键值数据库', payload: 'PING\r\n' },
  { name: 'MySQL', port: 3306, protocol: 'TCP', desc: 'MySQL / MariaDB 数据库' },
  { name: 'Postgres', port: 5432, protocol: 'TCP', desc: 'PostgreSQL 数据库' },
  { name: 'MongoDB', port: 27017, protocol: 'TCP', desc: 'MongoDB 文档数据库' },
  { name: 'DNS', port: 53, protocol: 'TCP', desc: '域名系统 TCP 查询' },
];

export const TcpClient: React.FC = () => {
  const [host, setHost] = useState('1.1.1.1');
  const [port, setPort] = useState('443');
  const [timeoutMs, setTimeoutMs] = useState(3000);
  const [sendPayload, setSendPayload] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<TcpPingResult | null>(null);

  // 本地历史记录
  const [history, setHistory] = useState<TcpPingResult[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tcp_probe_history');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return [];
  });

  // 执行 TCP Ping 探测
  const handlePing = async (targetHost = host, targetPort = port) => {
    const cleanHost = targetHost.trim();
    const cleanPort = parseInt(targetPort, 10);

    if (!cleanHost) {
      alert('请输入目标主机名或 IP 地址');
      return;
    }
    if (isNaN(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
      alert('端口必须在 1-65535 之间');
      return;
    }

    setIsLoading(true);
    setCurrentResult(null);

    try {
      const res = await fetchApi<TcpPingResult>('/api/tcp/ping', {
        method: 'POST',
        body: JSON.stringify({
          host: cleanHost,
          port: cleanPort,
          timeoutMs,
          sendPayload: sendPayload.trim() || undefined,
        }),
      });

      setCurrentResult(res);

      // 记入历史记录
      const updated = [res, ...history.filter((h) => !(h.host === res.host && h.port === res.port)).slice(0, 29)];
      setHistory(updated);
      localStorage.setItem('tcp_probe_history', JSON.stringify(updated));

    } catch (err: any) {
      const errorResult: TcpPingResult = {
        host: cleanHost,
        port: cleanPort,
        open: false,
        latencyMs: timeoutMs,
        status: 'error',
        error: err.message || '网络探测异常',
        timestamp: Date.now(),
      };
      setCurrentResult(errorResult);
    } finally {
      setIsLoading(false);
    }
  };

  // 选择快捷端口预设
  const handleSelectPreset = (preset: QuickPortPreset) => {
    setPort(String(preset.port));
    if (preset.payload) {
      setSendPayload(preset.payload);
      setShowAdvanced(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      
      {/* 顶部标题与说明栏 */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-100">TCP 端口与连通性探针</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
              Cloudflare Edge Sockets
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            利用 Cloudflare 全球边缘数据中心直接向目标发起 TCP 三次握手，探测端口连通性、物理往返延迟（RTT）及服务 Banner。
          </p>
        </div>

        {/* 右侧：快捷重置 */}
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={() => {
                setHistory([]);
                localStorage.removeItem('tcp_probe_history');
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空探测历史</span>
            </button>
          )}
        </div>
      </div>

      {/* 主体两栏布局：左侧参数配置与探测面板，右侧历史记录与网络诊断 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 左侧：输入与探测面板 */}
        <div className="w-full lg:w-3/5 border-r border-slate-800 flex flex-col h-full overflow-auto p-6 space-y-6">
          
          {/* 输入表单 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* 目标主机名 / IP */}
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  目标主机名或 IP 地址
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="例如: 1.1.1.1 或 api.telegram.org"
                    onKeyDown={(e) => e.key === 'Enter' && handlePing()}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-indigo-200 outline-none transition"
                  />
                </div>
              </div>

              {/* 端口号 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  目标端口 (Port)
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="443"
                  min={1}
                  max={65535}
                  onKeyDown={(e) => e.key === 'Enter' && handlePing()}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs font-mono text-indigo-200 outline-none transition"
                />
              </div>
            </div>

            {/* 常用端口快捷选择胶囊 */}
            <div>
              <span className="text-[11px] text-slate-500 font-medium block mb-2">常用端口预设:</span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PORTS.map((cp) => (
                  <button
                    key={cp.port}
                    type="button"
                    onClick={() => handleSelectPreset(cp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
                      port === String(cp.port)
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                    title={cp.desc}
                  >
                    <span className="font-semibold">{cp.name}</span>
                    <span className="text-[10px] opacity-70 ml-1">({cp.port})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 高级选项开关 */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                <span>{showAdvanced ? '收起高级设置' : '展开高级设置 (探测载荷与超时)'}</span>
                <span className="text-[10px]">{showAdvanced ? '▲' : '▼'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 pt-2 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">握手超时限制 (毫秒)</label>
                    <input
                      type="number"
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(Number(e.target.value))}
                      min={500}
                      max={10000}
                      step={500}
                      className="w-full sm:w-48 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">握手后自动发送探测载荷 (Payload)</label>
                    <input
                      type="text"
                      value={sendPayload}
                      onChange={(e) => setSendPayload(e.target.value)}
                      placeholder="例如: PING\r\n 或 HEAD / HTTP/1.0\r\n\r\n"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-indigo-200 outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      建立连接后立即向目标发送字节报文，可用于探测 SSH、Redis、HTTP 的首包回复。
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 提交发包探测按钮 */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handlePing()}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
              >
                <Activity className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? '正在发起 TCP 握手探测...' : '发起 TCP 连通性探测 (Ping)'}</span>
              </button>
            </div>
          </div>

          {/* 实时探测结果卡片 */}
          {currentResult && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  探测结果报告
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {new Date(currentResult.timestamp).toLocaleTimeString('zh-CN')}
                </span>
              </div>

              {/* 核心状态指标栏 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 状态徽标 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-1">端口状态</span>
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {currentResult.open ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">开放 (OPEN)</span>
                      </>
                    ) : currentResult.status === 'timeout' ? (
                      <>
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-400">超时 (TIMEOUT)</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-400">关闭 (CLOSED)</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 握手延迟 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-1">TCP 握手延时</span>
                  <div className="flex items-center gap-1 font-mono font-bold text-sm">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span
                      className={
                        currentResult.latencyMs < 50
                          ? 'text-emerald-400'
                          : currentResult.latencyMs < 150
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {currentResult.latencyMs} ms
                    </span>
                  </div>
                </div>

                {/* 解析 IP */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-1">解析目标 IPv4</span>
                  <div className="font-mono text-xs text-indigo-300 font-semibold truncate" title={currentResult.ip || currentResult.host}>
                    {currentResult.ip || currentResult.host}
                  </div>
                </div>

                {/* 探测节点 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-500 block mb-1">边缘节点 (PoP)</span>
                  <div className="font-mono text-xs text-slate-300 font-semibold truncate">
                    {currentResult.colo || 'Cloudflare Edge'}
                  </div>
                </div>
              </div>

              {/* 异常原因提示 */}
              {currentResult.error && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{currentResult.error}</span>
                </div>
              )}

              {/* 服务 Greeting Banner */}
              {currentResult.banner && (
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold">首包回显 Banner (首 300 字节):</span>
                  <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 whitespace-pre-wrap break-all leading-relaxed">
                    {currentResult.banner}
                  </pre>
                </div>
              )}
            </div>
          )}

        </div>

        {/* 右侧：探测历史与快速重测 */}
        <div className="hidden lg:flex lg:w-2/5 flex-col h-full bg-slate-900/30 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-indigo-400" />
              探测历史记录 ({history.length})
            </span>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-slate-800/60 p-3 space-y-1.5">
            {history.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                暂无探测记录，在左侧输入主机名发起探测
              </div>
            ) : (
              history.map((h, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setHost(h.host);
                    setPort(String(h.port));
                  }}
                  className="p-3 rounded-xl hover:bg-slate-800/60 transition cursor-pointer group bg-slate-950/40 border border-slate-800/60 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${h.open ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span className="text-xs font-mono font-bold text-slate-200 truncate">
                        {h.host}:{h.port}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
                      <span>IP: {h.ip || h.host}</span>
                      <span>•</span>
                      <span>{new Date(h.timestamp).toLocaleTimeString('zh-CN')}</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span
                      className={`text-xs font-mono font-bold block ${
                        h.open ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {h.open ? `${h.latencyMs} ms` : h.status.toUpperCase()}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePing(h.host, String(h.port));
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 flex items-center gap-0.5 justify-end"
                      title="立即重新探测"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>重测</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
