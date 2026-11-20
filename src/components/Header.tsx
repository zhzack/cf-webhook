import React, { useState, useEffect, useRef } from 'react';
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
  Wallet,
  Users,
  ShieldCheck,
  Eye,
  Edit2,
  Crown,
  Send,
  X
} from 'lucide-react';
import { Bin, User, BinMember } from '../types';

interface HeaderProps {
  bin: Bin | null;
  user: User | null;
  myBins: Bin[];
  sharedBins: Bin[];
  members?: BinMember[];
  isConnected: boolean;
  onSelectBin: (binId: string) => void;
  onNewBin: () => void;
  onDeleteBin?: (binId: string) => void;
  onRenameBin?: (binId: string, newName: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenForward: () => void;
  onOpenShare: () => void;
  onClearRequests: () => void;
  onLogout: () => void;
  ssoAuthUrl?: string;
  viewMode?: 'inspector' | 'client';
  onViewModeChange?: (mode: 'inspector' | 'client') => void;
  totalRequests: number;
}

export const Header: React.FC<HeaderProps> = ({
  bin,
  user,
  myBins,
  sharedBins,
  members = [],
  viewMode = 'inspector',
  onViewModeChange,
  isConnected,
  onSelectBin,
  onNewBin,
  onDeleteBin,
  onRenameBin,
  onOpenSettings,
  onOpenForward,
  onOpenShare,
  onClearRequests,
  onLogout,
  ssoAuthUrl = 'https://auth.b1uegrey.xyz',
  totalRequests,
}) => {
  const [copied, setCopied] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // 行内快捷重命名状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bin) {
      setEditingNameValue(bin.name || `Bin ${bin.id}`);
    }
    setIsEditingName(false);
  }, [bin?.id, bin?.name]);

  useEffect(() => {
    if (isEditingName && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isEditingName]);

  const isLocal = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const baseUrl = isLocal 
    ? `${window.location.origin}/bin`
    : `https://webhook.b1uegrey.xyz/bin`;
  
  const webhookUrl = bin ? `${baseUrl}/${bin.id}` : '';

  const isOwner = bin?.role === 'owner' || !bin?.user_id;
  const isEditor = bin?.role === 'editor';
  const isViewer = bin?.role === 'viewer';
  const canEdit = isOwner || isEditor;

  const handleCopy = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteCurrentBin = (e: React.MouseEvent, binId: string) => {
    e.stopPropagation();
    if (!onDeleteBin) return;
    if (window.confirm(`确定要永久删除频道 #${binId} 及其所有请求历史吗？此操作无法撤销。`)) {
      onDeleteBin(binId);
      setIsChannelMenuOpen(false);
    }
  };

  const handleSaveRename = async () => {
    if (!bin || !onRenameBin) return;
    const trimmed = editingNameValue.trim();
    if (!trimmed || trimmed === bin.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await onRenameBin(bin.id, trimmed);
    } finally {
      setIsEditingName(false);
    }
  };

  const handleKeyDownRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
      setEditingNameValue(bin?.name || `Bin ${bin?.id}`);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Logo & 频道切换 */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
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

          {/* 频道切换与行内重命名 */}
          <div className="flex items-center gap-1.5">
            {isEditingName ? (
              <div className="flex items-center gap-1 bg-slate-950 border border-indigo-500/80 rounded-lg px-2 py-0.5">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  onKeyDown={handleKeyDownRename}
                  onBlur={handleSaveRename}
                  className="bg-transparent text-xs text-indigo-200 outline-none w-28 font-medium"
                />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSaveRename();
                  }}
                  className="text-emerald-400 hover:text-emerald-300 p-0.5"
                  title="保存名称"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsEditingName(false);
                    setEditingNameValue(bin?.name || `Bin ${bin?.id}`);
                  }}
                  className="text-slate-500 hover:text-slate-300 p-0.5"
                  title="取消"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative flex items-center gap-1">
                <button
                  onClick={() => setIsChannelMenuOpen(!isChannelMenuOpen)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 transition"
                  title="切换 Webhook 频道 (我的频道 / 协作频道)"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="font-medium max-w-[110px] truncate">{bin?.name || bin?.id || '选择频道'}</span>
                  
                  {/* 角色标识 */}
                  {isOwner ? (
                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-semibold" title="所有者">
                      主
                    </span>
                  ) : isEditor ? (
                    <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300 font-semibold" title="协作者">
                      编
                    </span>
                  ) : (
                    <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-400 font-semibold" title="只读">
                      阅
                    </span>
                  )}
                  
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* 频道行内重命名小按钮 (仅编辑权限显示) */}
                {canEdit && bin && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition"
                    title="快速修改频道名称"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}

                {isChannelMenuOpen && (
                  <div 
                    className="absolute left-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setIsChannelMenuOpen(false)}
                  >
                    {/* 菜单顶栏 */}
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex items-center justify-between">
                      <span>频道切换与协作</span>
                      <button
                        onClick={() => {
                          setIsChannelMenuOpen(false);
                          onNewBin();
                        }}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> 新建频道
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-800/60">
                      {/* 分组 1: 我的频道 */}
                      <div>
                        <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-400/70" />
                          <span>我的频道 ({myBins.length})</span>
                        </div>
                        {myBins.length > 0 ? (
                          myBins.map((b) => (
                            <div
                              key={b.id}
                              onClick={() => {
                                onSelectBin(b.id);
                                setIsChannelMenuOpen(false);
                              }}
                              className={`group w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-800/70 transition cursor-pointer ${
                                bin?.id === b.id ? 'text-indigo-300 font-semibold bg-indigo-950/40' : 'text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 flex-shrink-0" />
                                <span className="truncate max-w-[130px]">{b.name || b.id}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500 font-mono">#{b.id}</span>
                                {onDeleteBin && (
                                  <button
                                    onClick={(e) => handleDeleteCurrentBin(e, b.id)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition"
                                    title="删除此频道"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-1.5 text-slate-500 text-center text-[11px]">暂无专属频道</div>
                        )}
                      </div>

                      {/* 分组 2: 与我协作 */}
                      <div className="pt-1">
                        <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <Users className="w-3 h-3 text-indigo-400/70" />
                          <span>与我协作 ({sharedBins.length})</span>
                        </div>
                        {sharedBins.length > 0 ? (
                          sharedBins.map((b) => (
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
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{b.name || b.id}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] px-1 rounded font-medium ${
                                  b.role === 'editor' 
                                    ? 'bg-indigo-500/20 text-indigo-300' 
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {b.role === 'editor' ? '可编辑' : '只读'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">#{b.id}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-1.5 text-slate-500 text-center text-[11px]">暂无受邀协作频道</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 实时连接指示灯 */}
          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700 flex-shrink-0">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={isConnected ? 'text-emerald-400' : 'text-slate-400'}>
              {isConnected ? '实时就绪' : '连接中...'}
            </span>
          </div>
        </div>

        {/* 主功能视图切换开关 (Webhook 监听 vs API 发包调试) */}
        {onViewModeChange && (
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex-shrink-0">
            <button
              onClick={() => onViewModeChange('inspector')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'inspector'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Webhook 监听</span>
            </button>
            <button
              onClick={() => onViewModeChange('client')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'client'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>API 发包调试</span>
            </button>
          </div>
        )}

        {/* 专属 Webhook URL 复制条 (仅在 Inspector 视图显示) */}
        {viewMode === 'inspector' ? (
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
        ) : (
          <div className="flex-1 max-w-lg hidden md:flex items-center justify-center">
            <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Cloudflare 全球边缘发包节点就绪
            </span>
          </div>
        )}

        {/* 操作功能按钮 & 用户统一账号中心 */}
        <div className="flex items-center gap-1.5 w-full md:w-auto justify-end flex-wrap">
          
          {/* 协作成员头像气泡堆叠 (Avatar Stack) */}
          {members && members.length > 0 && (
            <div 
              onClick={onOpenShare}
              className="flex items-center -space-x-1.5 cursor-pointer hover:opacity-90 transition pr-1"
              title={`当前频道共有 ${members.length} 名成员，点击管理协作`}
            >
              {members.slice(0, 3).map((m) => (
                <div 
                  key={m.user_id} 
                  className={`w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center font-bold text-[10px] text-white shadow ${
                    m.role === 'owner' ? 'bg-amber-600' : (m.role === 'editor' ? 'bg-indigo-600' : 'bg-slate-700')
                  }`}
                  title={`@${m.username || m.user_id} (${m.role === 'owner' ? '所有者' : (m.role === 'editor' ? '协作者' : '只读')})`}
                >
                  {(m.nickname || m.username || 'U').slice(0, 1).toUpperCase()}
                </div>
              ))}
              {members.length > 3 && (
                <div className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-800 text-slate-300 flex items-center justify-center font-mono text-[9px] font-medium">
                  +{members.length - 3}
                </div>
              )}
            </div>
          )}

          {/* 协作分享按钮 */}
          <button
            onClick={onOpenShare}
            disabled={!bin}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            title="生成邀请口令或管理协作成员"
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>协作分享</span>
          </button>

          <button
            onClick={onOpenForward}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
            title="将收到的 Webhook 实时穿透转发到本地/内网机器"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>内网转发</span>
          </button>

          <button
            onClick={onOpenSettings}
            disabled={!canEdit}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              canEdit 
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
            }`}
            title={canEdit ? '自定义 Mock 响应与飞书自动应答' : '当前为只读权限，无法修改响应配置'}
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>响应配置</span>
          </button>

          <button
            onClick={onClearRequests}
            disabled={totalRequests === 0 || !canEdit}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-950/40 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-900/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title={canEdit ? '清空请求历史' : '当前为只读权限，无法清空请求'}
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
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
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
