import React, { useState } from 'react';
import { 
  Zap, 
  Copy, 
  Check, 
  Plus, 
  Settings, 
  Trash2, 
  ExternalLink,
  Radio,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Layers,
  Wallet
} from 'lucide-react';
import { Bin, User } from '../types';

interface HeaderProps {
  bin: Bin | null;
  user: User | null;
  userBins: Bin[];
  isConnected: boolean;
  onSelectBin: (binId: string) => void;
  onNewBin: () => void;
  onOpenSettings: () => void;
  onOpenForward: () => void;
  onClearRequests: () => void;
  onLogout: () => void;
  ssoAuthUrl?: string;
  totalRequests: number;
}

export const Header: React.FC<HeaderProps> = ({
  bin,
  user,
  userBins,
  isConnected,
  onSelectBin,
  onNewBin,
  onOpenSettings,
  onOpenForward,
  onClearRequests,
  onLogout,
  ssoAuthUrl = 'https://auth.b1uegrey.xyz',
  totalRequests,
}) => {
  const [copied, setCopied] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // 线上推荐使用已绑定的专属自定义域名 webhook.b1uegrey.xyz
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
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Logo & 频道切换 */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                Webhook Inspector
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  SSO
                </span>
              </h1>
            </div>
          </div>

          {/* 频道切换下拉框 */}
          <div className="relative">
            <button
              onClick={() => setIsChannelMenuOpen(!isChannelMenuOpen)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 transition"
              title="切换已创建的 Webhook 频道"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span className="font-medium max-w-[100px] truncate">{bin?.name || bin?.id || '选择频道'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isChannelMenuOpen && (
              <div 
                className="absolute left-0 mt-1.5 w-56 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setIsChannelMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>我的频道列表</span>
                  <button
                    onClick={() => {
                      setIsChannelMenuOpen(false);
                      onNewBin();
                    }}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> 新建
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {userBins.length > 0 ? (
                    userBins.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          onSelectBin(b.id);
                          setIsChannelMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-800/70 transition ${
                          bin?.id === b.id ? 'text-indigo-300 font-semibold bg-indigo-950/40' : 'text-slate-300'
                        }`}
                      >
                        <span className="truncate">{b.name || b.id}</span>
                        <span className="text-[10px] text-slate-500 font-mono ml-2">#{b.id}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-slate-500 text-center">暂无其它频道</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 实时连接指示灯 */}
          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={isConnected ? 'text-emerald-400' : 'text-slate-400'}>
              {isConnected ? '实时就绪' : '连接中...'}
            </span>
          </div>
        </div>

        {/* 专属 Webhook URL 复制条 */}
        <div className="flex-1 max-w-lg w-full">
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

        {/* 操作功能按钮 & 用户统一账号中心 */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={onOpenForward}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            title="将收到的 Webhook 实时穿透转发到本地/内网机器"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>内网转发</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="自定义 Mock 响应与飞书自动应答"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>响应配置</span>
          </button>

          <button
            onClick={onClearRequests}
            disabled={totalRequests === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-950/40 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-900/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="清空请求历史"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空 ({totalRequests})</span>
          </button>

          <button
            onClick={onNewBin}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="分配全新的专属 Webhook 频道"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>新建</span>
          </button>

          {/* 统一认证 SSO 用户头像与下拉菜单 */}
          {user ? (
            <div className="relative ml-1">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs transition"
              >
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                  {user.nickname ? user.nickname.slice(0, 1).toUpperCase() : user.username.slice(0, 1).toUpperCase()}
                </div>
                <span className="max-w-[70px] truncate">{user.nickname || user.username}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div 
                  className="absolute right-0 mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setIsUserMenuOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="font-semibold text-slate-200 truncate">{user.nickname || user.username}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">@{user.username}</p>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {user.role === 'admin' ? '超级管理员' : '授权用户'}
                    </span>
                  </div>

                  <div className="py-1">
                    <a
                      href={ssoAuthUrl}
                      className="px-3 py-1.5 flex items-center justify-between text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" /> 统一应用中心
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                    </a>
                    <a
                      href="https://book.b1uegrey.xyz"
                      className="px-3 py-1.5 flex items-center justify-between text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-emerald-400" /> 记账与持物
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                    </a>
                  </div>

                  <div className="border-t border-slate-800 pt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-rose-400 hover:bg-rose-950/40 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" /> 退出全域登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <a
              href={`${ssoAuthUrl}/?redirect=${encodeURIComponent(window.location.href)}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>SSO 登录</span>
            </a>
          )}
        </div>

      </div>
    </header>
  );
};
