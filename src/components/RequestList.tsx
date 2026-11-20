import React, { useState } from 'react';
import { 
  Search, 
  Clock, 
  ArrowDownRight, 
  Globe, 
  Zap, 
  Send, 
  CheckCircle2, 
  Play, 
  Pause, 
  Download,
  ShieldCheck,
  GitBranch,
  CreditCard,
  ChevronDown
} from 'lucide-react';
import { WebhookRecord } from '../types';
import { getMethodColor, formatTimeAgo, formatBytes } from '../lib/utils';

interface RequestListProps {
  requests: WebhookRecord[];
  selectedId: string | null;
  onSelect: (record: WebhookRecord) => void;
  webhookUrl: string;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onExportJson?: () => void;
}

export const RequestList: React.FC<RequestListProps> = ({
  requests,
  selectedId,
  onSelect,
  webhookUrl,
  isPaused = false,
  onTogglePause,
  onExportJson,
}) => {
  const [keyword, setKeyword] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccessTip, setTestSuccessTip] = useState('');
  const [isTestMenuOpen, setIsTestMenuOpen] = useState(false);

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

  interface MockTemplate {
    id: string;
    title: string;
    desc: string;
    icon: any;
    color: string;
    headers: Record<string, string>;
    body: string;
  }

  // 模拟发包预设模板
  const mockTemplates: MockTemplate[] = [
    {
      id: 'feishu',
      title: '飞书 URL 校验挑战',
      desc: '验证开放平台 url_verification 握手回包',
      icon: ShieldCheck,
      color: 'text-indigo-400',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'url_verification',
        token: 'dGVzdF9mZWlzaHVfdG9rZW5fMjAyNg==',
        challenge: 'feishu_challenge_' + Math.random().toString(36).slice(2, 10),
      }, null, 2),
    },
    {
      id: 'github',
      title: 'GitHub Push 事件',
      desc: '模拟代码提交并触发 Webhook 回调',
      icon: GitBranch,
      color: 'text-emerald-400',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': crypto.randomUUID(),
      },
      body: JSON.stringify({
        ref: 'refs/heads/main',
        repository: { name: 'cf-webhook', full_name: 'b1uegrey/cf-webhook' },
        pusher: { name: 'developer', email: 'dev@b1uegrey.xyz' },
        commits: [{ id: 'c9f8a12', message: 'feat: live test webhook push' }],
      }, null, 2),
    },
    {
      id: 'payment',
      title: '电商支付完成通知',
      desc: '模拟第三方收银台成功扣款回调',
      icon: CreditCard,
      color: 'text-amber-400',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'payment_intent.succeeded',
        order_id: 'ord_' + Date.now(),
        amount: 29900,
        currency: 'CNY',
        status: 'PAID',
        timestamp: Date.now(),
      }, null, 2),
    },
  ];

  const handleSendMock = async (template: typeof mockTemplates[0]) => {
    if (!webhookUrl) {
      alert('请先选择或生成频道');
      return;
    }

    setIsSendingTest(true);
    setIsTestMenuOpen(false);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: template.headers,
        body: template.body,
      });
      setTestSuccessTip(`已成功向当前频道发送 [${template.title}] 报文`);
      setTimeout(() => setTestSuccessTip(''), 3500);
    } catch (e: any) {
      alert('模拟发包失败: ' + e.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-full md:w-80 lg:w-96 flex-shrink-0">
      
      {/* 搜索与筛选工具栏 */}
      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/50">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="搜索路径、Header、Body..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* 实时流暂停/继续切换 */}
          {onTogglePause && (
            <button
              onClick={onTogglePause}
              className={`p-1.5 rounded-md border text-xs transition ${
                isPaused
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isPaused ? '流已暂停（点击恢复实时推流）' : '实时监听中（点击暂停流接收）'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* 快捷测试菜单 */}
          <div className="relative">
            <button
              onClick={() => setIsTestMenuOpen(!isTestMenuOpen)}
              disabled={isSendingTest || !webhookUrl}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition disabled:opacity-50"
              title="快速发送预设测试请求"
            >
              <Zap className={`w-3.5 h-3.5 text-indigo-400 ${isSendingTest ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">测试</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isTestMenuOpen && (
              <div 
                className="absolute right-0 mt-1.5 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setIsTestMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                  一键发送模拟请求
                </div>
                {mockTemplates.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSendMock(t)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800/80 transition flex items-start gap-2"
                    >
                      <Icon className={`w-4 h-4 ${t.color} flex-shrink-0 mt-0.5`} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200 truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">{t.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 导出历史记录 */}
          {onExportJson && (
            <button
              onClick={onExportJson}
              disabled={requests.length === 0}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="导出当前频道捕获记录 (JSON)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
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

        {/* 测试发送成功提示 */}
        {testSuccessTip && (
          <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
            <span className="truncate">{testSuccessTip}</span>
          </div>
        )}
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-slate-500 flex flex-col items-center justify-center space-y-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-400 shadow-inner">
              <ArrowDownRight className="w-6 h-6 text-indigo-400 animate-bounce" />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-300">正在监听 Webhook 传入...</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                向顶部专属 URL 发送任意 HTTP 请求，报文将以毫秒级实时呈现在此。
              </p>
            </div>

            {/* 空状态快捷发包卡片 */}
            <div className="w-full space-y-2 pt-2 text-left">
              <span className="text-[11px] font-semibold text-slate-400 block px-1">
                ⚡ 快速模拟测试
              </span>
              <div className="space-y-1.5">
                {mockTemplates.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSendMock(t)}
                      disabled={isSendingTest || !webhookUrl}
                      className="w-full p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/70 border border-slate-800 hover:border-indigo-500/40 transition flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 ${t.color} flex-shrink-0`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                            {t.title}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">{t.desc}</p>
                        </div>
                      </div>
                      <Send className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          filtered.map((req) => {
            const isSelected = req.id === selectedId;
            const bodyLength = req.body ? new Blob([req.body]).size : 0;
            const pathDisplay = req.path.replace(/^\/bin\/[^/]+/, '') || '/';
            
            // 是否为刚推入的最新请求（5秒内高亮脉冲）
            const isRecent = Date.now() - req.created_at < 5000;
            // 是否为飞书握手请求
            const isFeishuVerification = req.body && req.body.includes('url_verification');

            return (
              <div
                key={req.id}
                onClick={() => onSelect(req)}
                className={`p-3 cursor-pointer transition-all border-l-2 select-none relative ${
                  isSelected
                    ? 'bg-indigo-950/30 border-l-indigo-500'
                    : 'hover:bg-slate-800/40 border-l-transparent'
                } ${isRecent ? 'bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/20' : ''}`}
              >
                {/* 顶部：Method、状态码徽标与时间 */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono tracking-wide ${getMethodColor(
                        req.method
                      )}`}
                    >
                      {req.method}
                    </span>

                    {/* 响应状态回执徽标 */}
                    {isFeishuVerification ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                        200 握手
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-medium">
                        200 OK
                      </span>
                    )}

                    {isRecent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-600" />
                    {formatTimeAgo(req.created_at)}
                  </span>
                </div>

                {/* 路径 */}
                <div className="text-xs font-mono text-slate-200 truncate mb-1">
                  {pathDisplay}
                </div>

                {/* 底部 IP 与 体积 */}
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
