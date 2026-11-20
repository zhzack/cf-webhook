import React from 'react';
import { 
  Radio, 
  Send, 
  Activity, 
  Terminal, 
  User as UserIcon, 
  LogOut, 
  ExternalLink,
  Shield,
  Layers,
  Sparkles
} from 'lucide-react';
import { User } from '../types';

export type MainNavMode = 'inspector' | 'client' | 'tcp';

interface NavigationRailProps {
  activeMode: MainNavMode;
  onModeChange: (mode: MainNavMode) => void;
  onOpenForward: () => void;
  requestCount: number;
  user: User | null;
  onLogout: () => void;
  ssoAuthUrl?: string;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeMode,
  onModeChange,
  onOpenForward,
  requestCount,
  user,
  onLogout,
  ssoAuthUrl = 'https://auth.b1uegrey.xyz',
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // 点击外部关闭用户菜单
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    {
      id: 'inspector' as MainNavMode,
      name: 'Webhook 监听',
      icon: Radio,
      badge: requestCount > 0 ? (requestCount > 99 ? '99+' : String(requestCount)) : null,
      desc: '入站 Webhook 实时捕获、自动应答与回执校验',
    },
    {
      id: 'client' as MainNavMode,
      name: 'API 发包调试',
      icon: Send,
      desc: '出站 HTTP / REST 请求测试、cURL 导入与常用预设',
    },
    {
      id: 'tcp' as MainNavMode,
      name: 'TCP 网络探针',
      icon: Activity,
      desc: 'Cloudflare 边缘 TCP 端口连通性与握手延时探测',
    },
  ];

  return (
    <nav className="w-16 flex-shrink-0 bg-slate-950 border-r border-slate-800/80 flex flex-col items-center justify-between py-3 select-none z-30">
      
      {/* 顶部 Logo 标识 */}
      <div className="flex flex-col items-center gap-4">
        <div 
          onClick={() => onModeChange('inspector')}
          className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 cursor-pointer shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all group"
          title="cf-webhook 全栈网络调试平台"
        >
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <Radio className="w-5 h-5 text-indigo-400 group-hover:text-cyan-300 transition-colors" />
          </div>
        </div>

        {/* 主导航图标列表 */}
        <div className="flex flex-col items-center gap-2 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMode === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={() => onModeChange(item.id)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all relative ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                  }`}
                  aria-label={item.name}
                >
                  <Icon className="w-5 h-5" />

                  {/* 消息数量小红点/角标 */}
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold font-mono bg-rose-500 text-white rounded-full flex items-center justify-center shadow">
                      {item.badge}
                    </span>
                  )}
                </button>

                {/* 悬浮 Tooltip 气泡 */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-medium rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  <div className="font-semibold text-indigo-300">{item.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </div>
              </div>
            );
          })}

          {/* 内网穿透客户端触发器 */}
          <div className="relative group pt-2 border-t border-slate-800/80 w-full flex justify-center">
            <button
              onClick={onOpenForward}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-900 transition-all"
              title="内网转发与代理客户端"
            >
              <Terminal className="w-5 h-5" />
            </button>
            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs font-medium rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              <div className="font-semibold text-emerald-400">内网穿透与代理</div>
              <div className="text-[10px] text-slate-400 mt-0.5">获取 forward.mjs 脚本与配置</div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部用户账号中心 */}
      <div className="relative flex flex-col items-center gap-3" ref={userMenuRef}>
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-center text-slate-300 hover:text-white transition shadow overflow-hidden"
          title={user ? `${user.nickname || user.username} (@${user.username})` : '点击登录'}
        >
          {user ? (
            <div className="w-full h-full bg-indigo-600/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
              {(user.nickname || user.username || 'U')[0].toUpperCase()}
            </div>
          ) : (
            <UserIcon className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* 用户弹出菜单 */}
        {isUserMenuOpen && (
          <div className="absolute left-full ml-3 bottom-0 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in slide-in-from-left duration-150">
            {user ? (
              <div className="space-y-3">
                <div className="pb-2 border-b border-slate-800">
                  <div className="text-xs font-bold text-slate-100 truncate">{user.nickname || user.username || '未命名用户'}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">@{user.username}</div>
                  <div className="text-[10px] text-indigo-400 mt-1 font-mono flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>Mode 3 统一账号鉴权 ({user.role === 'admin' ? '管理员' : '授权用户'})</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <a
                    href={ssoAuthUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    <span>SSO 统一认证中心</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  </a>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs text-rose-400 hover:bg-rose-950/40 transition text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>退出当前账号</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-center p-2">
                <div className="text-xs font-semibold text-slate-200">当前处于本地模式</div>
                <p className="text-[11px] text-slate-400">登录后可享有多端同步、频道管理与协作者权限共享。</p>
                <a
                  href={`${ssoAuthUrl}/?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                  className="block w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  统一身份登录
                </a>
              </div>
            )}
          </div>
        )}
      </div>

    </nav>
  );
};
