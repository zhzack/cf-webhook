import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { RequestList } from './components/RequestList';
import { RequestDetail } from './components/RequestDetail';
import { SettingsModal } from './components/SettingsModal';
import { ReplayModal } from './components/ReplayModal';
import { ForwardModal } from './components/ForwardModal';
import { ShareModal } from './components/ShareModal';
import { ApiClient } from './components/ApiClient';
import { TcpClient } from './components/TcpClient';
import { NavigationRail, MainNavMode } from './components/NavigationRail';
import { Bin, WebhookRecord, User, BinMember, OutboundRequestPayload } from './types';
import { fetchApi } from './api';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [mainViewMode, setMainViewMode] = useState<MainNavMode>('inspector');
  const [clientInitialPayload, setClientInitialPayload] = useState<OutboundRequestPayload | null>(null);
  const [myBins, setMyBins] = useState<Bin[]>([]);
  const [sharedBins, setSharedBins] = useState<Bin[]>([]);
  const [userBins, setUserBins] = useState<Bin[]>([]);
  const [binMembers, setBinMembers] = useState<BinMember[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [ssoAuthUrl, setSsoAuthUrl] = useState('https://auth.b1uegrey.xyz');

  const [bin, setBin] = useState<Bin | null>(null);
  const [requests, setRequests] = useState<WebhookRecord[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRecord | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [replayTargetReq, setReplayTargetReq] = useState<WebhookRecord | null>(null);

  // 左右分栏自由调节与移动端响应式
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_width');
      return saved ? Math.max(260, Math.min(600, parseInt(saved, 10))) : 340;
    }
    return 340;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const eventSourceRef = useRef<EventSource | null>(null);
  const isStreamPausedRef = useRef(isStreamPaused);
  isStreamPausedRef.current = isStreamPaused;

  // 响应窗口尺寸变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. 检查 SSO 鉴权状态与加载用户信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlSsoToken = params.get('sso_token');
      if (urlSsoToken) {
        sessionStorage.setItem('sso_token', urlSsoToken);
        setAuthToken(urlSsoToken);
        params.delete('sso_token');
        const newSearch = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState(null, '', window.location.pathname + newSearch + window.location.hash);
      }
    }

    checkAuthAndInit();

    const handleUnauthorized = () => {
      const host = window.location.hostname;
      if (host === 'b1uegrey.xyz' || host.endsWith('.b1uegrey.xyz')) {
        window.location.href = `${ssoAuthUrl}/?redirect=${encodeURIComponent(window.location.href)}`;
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [ssoAuthUrl]);

  const checkAuthAndInit = async () => {
    try {
      // 1. 获取 SSO 配置
      const statusRes = await fetchApi<{ needSetup: boolean; ssoAuthUrl?: string }>('/api/auth/status');
      const targetSsoUrl = statusRes.ssoAuthUrl || 'https://auth.b1uegrey.xyz';
      setSsoAuthUrl(targetSsoUrl);

      // 2. 尝试获取当前登录用户
      try {
        const meRes = await fetchApi<{ user: User; token?: string }>('/api/auth/me');
        sessionStorage.removeItem('sso_redirect_count');
        sessionStorage.removeItem('sso_redirect_time');
        setUser(meRes.user);
        if (meRes.token) {
          setAuthToken(meRes.token);
          sessionStorage.setItem('sso_token', meRes.token);
        }
        setAuthLoading(false);

        // 检查是否有通过邀请口令加入频道的动作 (#join=st_xxxx)
        const joined = await handleCheckJoinHash();
        if (!joined) {
          await fetchUserBinsAndSelect();
        }
        return;
      } catch (authErr) {
        // 未登录状态
        const host = window.location.hostname;
        const isB1uegreyDomain = host === 'b1uegrey.xyz' || host.endsWith('.b1uegrey.xyz');

        if (isB1uegreyDomain) {
          const redirectCount = parseInt(sessionStorage.getItem('sso_redirect_count') || '0', 10);
          const lastRedirectTime = parseInt(sessionStorage.getItem('sso_redirect_time') || '0', 10);
          const isRapidLoop = Date.now() - lastRedirectTime < 6000 && redirectCount >= 2;

          if (isRapidLoop) {
            console.warn('检测到 SSO 快速重定向循环，已自动阻断并清除可能冲突的残留 Cookie。');
            sessionStorage.removeItem('sso_redirect_count');
            sessionStorage.removeItem('sso_token');
            document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            setUser(null);
            setAuthLoading(false);
            return;
          }

          sessionStorage.setItem('sso_redirect_count', String(redirectCount + 1));
          sessionStorage.setItem('sso_redirect_time', String(Date.now()));

          const redirectTarget = encodeURIComponent(window.location.href);
          window.location.href = `${targetSsoUrl}/?redirect=${redirectTarget}`;
          return;
        }

        // 本地环境：允许无认证或本地测试
        setAuthLoading(false);
        const joined = await handleCheckJoinHash();
        if (!joined) {
          await initBinWithoutAuth();
        }
      }
    } catch (err) {
      setAuthLoading(false);
      await initBinWithoutAuth();
    }
  };

  // 检测 URL hash 中的邀请口令 #join=st_xxxx
  const handleCheckJoinHash = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    if (!hash.includes('join=')) return false;

    const match = hash.match(/join=([^&]+)/);
    if (!match || !match[1]) return false;

    const shareToken = decodeURIComponent(match[1]).trim();
    try {
      const res = await fetchApi<{ success: boolean; bin: Bin; message?: string }>('/api/bins/join-by-share', {
        method: 'POST',
        body: JSON.stringify({ shareToken }),
      });

      if (res.success && res.bin) {
        setBin(res.bin);
        localStorage.setItem('last_bin_id', res.bin.id);
        window.location.hash = res.bin.id;
        await fetchUserBinsAndSelect(res.bin.id);
        return true;
      }
    } catch (e: any) {
      alert('加入协作频道失败: ' + (e.message || '邀请口令无效或已过期'));
    }
    return false;
  };

  // 加载用户所属所有频道 (我的频道 + 协作频道) 并初始化选定频道
  const fetchUserBinsAndSelect = async (overrideSelectBinId?: string) => {
    try {
      const data = await fetchApi<{
        success: boolean;
        myBins: Bin[];
        sharedBins: Bin[];
        bins: Bin[];
      }>('/api/bins');

      if (data.success) {
        setMyBins(data.myBins || []);
        setSharedBins(data.sharedBins || []);
        const all = data.bins || [...(data.myBins || []), ...(data.sharedBins || [])];
        setUserBins(all);

        // 选定频道：优先从传参、URL hash、localStorage、现有列表第一个或新建
        const hashBin = window.location.hash.replace('#', '').trim();
        const storedBin = localStorage.getItem('last_bin_id');
        const targetBinId = overrideSelectBinId || (hashBin && !hashBin.startsWith('join=') ? hashBin : null) || storedBin;

        if (targetBinId) {
          await loadBin(targetBinId);
        } else if (all.length > 0) {
          await loadBin(all[0].id);
        } else {
          await createNewBin();
        }
      }
    } catch {
      await initBinWithoutAuth();
    }
  };

  const initBinWithoutAuth = async () => {
    const hashBin = window.location.hash.replace('#', '').trim();
    const storedBin = localStorage.getItem('last_bin_id');
    const binId = (hashBin && !hashBin.startsWith('join=')) ? hashBin : storedBin;
    if (binId) {
      await loadBin(binId);
    } else {
      await createNewBin();
    }
  };

  // 加载指定 Bin 的信息与历史请求
  const loadBin = async (binId: string) => {
    try {
      const data = await fetchApi<{ success: boolean; bin: Bin }>(`/api/bins/${binId}`);
      if (data.success && data.bin) {
        setBin(data.bin);
        localStorage.setItem('last_bin_id', data.bin.id);
        window.location.hash = data.bin.id;
        fetchRequests(data.bin.id);
        fetchActiveBinMembers(data.bin.id);
      } else {
        createNewBin();
      }
    } catch {
      createNewBin();
    }
  };

  // 加载当前活跃频道的成员列表（用于 Header 协作头像堆叠）
  const fetchActiveBinMembers = async (binId: string) => {
    try {
      const data = await fetchApi<{ success: boolean; members: BinMember[] }>(`/api/bins/${binId}/members`);
      if (data.success && Array.isArray(data.members)) {
        setBinMembers(data.members);
      }
    } catch {
      setBinMembers([]);
    }
  };

  // 创建全新 Bin
  const createNewBin = async () => {
    try {
      const data = await fetchApi<{ success: boolean; bin: Bin }>('/api/bins', { method: 'POST' });
      if (data.success && data.bin) {
        setBin(data.bin);
        localStorage.setItem('last_bin_id', data.bin.id);
        window.location.hash = data.bin.id;
        setMyBins((prev) => [data.bin, ...prev.filter((b) => b.id !== data.bin.id)]);
        setUserBins((prev) => [data.bin, ...prev.filter((b) => b.id !== data.bin.id)]);
        setRequests([]);
        setSelectedRequest(null);
        setBinMembers([]);
      }
    } catch (e) {
      console.error('Failed to create bin:', e);
    }
  };

  // 删除频道
  const handleDeleteBin = async (binId: string) => {
    try {
      await fetchApi(`/api/bins/${binId}`, { method: 'DELETE' });
      const remainingMyBins = myBins.filter((b) => b.id !== binId);
      const remainingAll = userBins.filter((b) => b.id !== binId);
      setMyBins(remainingMyBins);
      setUserBins(remainingAll);

      if (bin?.id === binId) {
        if (remainingAll.length > 0) {
          await loadBin(remainingAll[0].id);
        } else {
          await createNewBin();
        }
      }
    } catch (e: any) {
      alert('删除频道失败: ' + (e.message || '请重试'));
    }
  };

  // 快捷重命名频道
  const handleRenameBin = async (binId: string, newName: string) => {
    try {
      const data = await fetchApi<{ success: boolean; bin: Bin }>(`/api/bins/${binId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName }),
      });
      if (data.success && data.bin) {
        setBin(data.bin);
        setMyBins((prev) => prev.map((b) => (b.id === data.bin.id ? data.bin : b)));
        setUserBins((prev) => prev.map((b) => (b.id === data.bin.id ? data.bin : b)));
      }
    } catch (e: any) {
      alert('重命名频道失败: ' + (e.message || '请重试'));
    }
  };

  // 重置分享口令
  const handleResetShareToken = async (): Promise<string> => {
    if (!bin) throw new Error('当前未选中频道');
    const data = await fetchApi<{ success: boolean; share_token: string }>(
      `/api/bins/${bin.id}/reset-share-token`,
      { method: 'POST' }
    );
    if (data.success && data.share_token) {
      setBin((prev) => (prev ? { ...prev, share_token: data.share_token } : null));
      return data.share_token;
    }
    throw new Error('重置口令失败');
  };

  // 获取请求列表
  const fetchRequests = async (binId: string) => {
    try {
      const data = await fetchApi<{ success: boolean; requests: WebhookRecord[] }>(
        `/api/bins/${binId}/requests?limit=100`
      );
      if (data.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
        if (data.requests.length > 0 && !selectedRequest) {
          setSelectedRequest(data.requests[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch requests:', e);
    }
  };

  // 2. 建立 SSE 实时流连接
  useEffect(() => {
    if (!bin) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    let streamUrl = `/api/bins/${bin.id}/stream`;
    if (authToken) {
      streamUrl += `?token=${encodeURIComponent(authToken)}`;
    } else if (bin.share_token) {
      streamUrl += `?share_token=${encodeURIComponent(bin.share_token)}`;
    }

    const sse = new EventSource(streamUrl);
    eventSourceRef.current = sse;

    sse.addEventListener('connected', () => {
      setIsConnected(true);
    });

    sse.addEventListener('webhook', (e: MessageEvent) => {
      if (isStreamPausedRef.current) return;
      try {
        const record: WebhookRecord = JSON.parse(e.data);
        setRequests((prev) => {
          if (prev.some((r) => r.id === record.id)) return prev;
          return [record, ...prev];
        });

        // 收到新请求时，若当前未选中任何请求，则自动选中最新的
        setSelectedRequest((current) => current || record);
      } catch (err) {
        console.error('Parse webhook sse error:', err);
      }
    });

    sse.onerror = () => {
      setIsConnected(false);
    };

    // 保底策略：每 3 秒做一次轻量轮询，确保网络波动断开时依然能收到数据
    const pollInterval = setInterval(() => {
      if (!isStreamPausedRef.current) {
        fetchRequests(bin.id);
      }
    }, 3000);

    return () => {
      sse.close();
      clearInterval(pollInterval);
    };
  }, [bin?.id, authToken]);

  // 导出当前频道所有抓包记录为 JSON 文件
  const handleExportJson = () => {
    if (!bin || requests.length === 0) return;
    const exportData = {
      binId: bin.id,
      binName: bin.name || `Bin ${bin.id}`,
      exportedAt: new Date().toISOString(),
      totalRequests: requests.length,
      requests,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `webhook_${bin.id}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 全域退出登录
  const handleLogout = async () => {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setAuthToken(null);
      const host = window.location.hostname;
      if (host === 'b1uegrey.xyz' || host.endsWith('.b1uegrey.xyz')) {
        window.location.href = `${ssoAuthUrl}/?redirect=${encodeURIComponent(window.location.href)}`;
      }
    }
  };

  // 清空历史请求
  const handleClearRequests = async () => {
    if (!bin) return;
    if (!window.confirm('确认清空当前频道下的全部请求历史吗？')) return;

    try {
      await fetchApi(`/api/bins/${bin.id}/requests`, { method: 'DELETE' });
      setRequests([]);
      setSelectedRequest(null);
    } catch (e: any) {
      alert('清空请求失败: ' + e.message);
    }
  };

  // 删除单条请求
  const handleDeleteRequest = async (id: string) => {
    if (!bin) return;
    try {
      await fetchApi(`/api/bins/${bin.id}/requests/${id}`, { method: 'DELETE' });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (selectedRequest?.id === id) {
        const remaining = requests.filter((r) => r.id !== id);
        setSelectedRequest(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (e: any) {
      alert('删除请求失败: ' + e.message);
    }
  };

  // 保存自定义响应规则
  const handleSaveSettings = async (settings: any) => {
    if (!bin) return;
    try {
      const data = await fetchApi<{ success: boolean; bin: Bin }>(`/api/bins/${bin.id}`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      if (data.success && data.bin) {
        setBin(data.bin);
        setMyBins((prev) => prev.map((b) => (b.id === data.bin.id ? data.bin : b)));
        setUserBins((prev) => prev.map((b) => (b.id === data.bin.id ? data.bin : b)));
      }
    } catch (e: any) {
      alert('保存配置失败: ' + e.message);
    }
  };

  // 触发重放模态框
  const handleOpenReplay = (req: WebhookRecord) => {
    setReplayTargetReq(req);
    setIsReplayOpen(true);
  };

  // 联动：在出站发包调试器中打开当前 Webhook 请求进行二次编辑与发送
  const handleOpenInClient = (req: WebhookRecord) => {
    let headersObj: Record<string, string> = {};
    try {
      headersObj = JSON.parse(req.headers || '{}');
    } catch {}
    let queryObj: Record<string, string> = {};
    try {
      queryObj = JSON.parse(req.query_params || '{}');
    } catch {}

    const fullUrl = req.url.startsWith('http') ? req.url : `${window.location.origin}${req.url}`;

    setClientInitialPayload({
      url: fullUrl,
      method: req.method || 'POST',
      headers: headersObj,
      queryParams: queryObj,
      body: req.body || '',
      auth: { type: 'none' },
    });
    setMainViewMode('client');
  };

  // 左右拖拽调整分栏宽度
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(260, Math.min(600, startWidth + deltaX));
      setSidebarWidth(newWidth);
      localStorage.setItem('sidebar_width', String(newWidth));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const canEdit = bin ? (bin.role === 'owner' || bin.role === 'editor' || !bin.user_id) : true;
  const currentWebhookUrl = bin
    ? `${typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? window.location.origin : 'https://webhook.b1uegrey.xyz'}/bin/${bin.id}`
    : '';

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 text-slate-100">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-slate-400">正在接入 b1uegrey 统一通行证安全校验...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* 最左侧一级主功能导航 Rail */}
      <NavigationRail
        activeMode={mainViewMode}
        onModeChange={setMainViewMode}
        onOpenForward={() => setIsForwardOpen(true)}
        requestCount={requests.length}
        user={user}
        onLogout={handleLogout}
        ssoAuthUrl={ssoAuthUrl}
      />

      {/* 主工作区 */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {mainViewMode === 'inspector' && (
          <>
            <Header
              bin={bin}
              user={user}
              myBins={myBins}
              sharedBins={sharedBins}
              members={binMembers}
              isConnected={isConnected}
              onSelectBin={(binId) => loadBin(binId)}
              onNewBin={createNewBin}
              onDeleteBin={handleDeleteBin}
              onRenameBin={handleRenameBin}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenForward={() => setIsForwardOpen(true)}
              onOpenShare={() => setIsShareOpen(true)}
              onClearRequests={handleClearRequests}
              onLogout={handleLogout}
              ssoAuthUrl={ssoAuthUrl}
              totalRequests={requests.length}
            />

            {/* 主体两栏视图（支持拖拽分栏与移动端自适应抽屉） */}
            <main className="flex-1 flex overflow-hidden relative select-text">
              {/* 左侧列表 */}
              {(!isMobile || !selectedRequest) && (
                <div 
                  style={{ width: isMobile ? '100%' : `${sidebarWidth}px` }} 
                  className="flex-shrink-0 h-full overflow-hidden"
                >
                  <RequestList
                    requests={requests}
                    selectedId={selectedRequest?.id || null}
                    onSelect={(req) => setSelectedRequest(req)}
                    webhookUrl={currentWebhookUrl}
                    isPaused={isStreamPaused}
                    onTogglePause={() => setIsStreamPaused((prev) => !prev)}
                    onExportJson={handleExportJson}
                  />
                </div>
              )}

              {/* 桌面端宽度调节拖拽中缝 */}
              {!isMobile && (
                <div
                  onMouseDown={handleMouseDownResize}
                  className={`w-1 cursor-col-resize hover:bg-indigo-500 transition-colors flex-shrink-0 relative group z-10 ${
                    isResizing ? 'bg-indigo-500' : 'bg-slate-800'
                  }`}
                  title="左右拖动调整分栏宽度"
                >
                  <div className="absolute inset-y-0 -left-1 -right-1" />
                </div>
              )}

              {/* 右侧详情 */}
              {(!isMobile || selectedRequest) && (
                <div className="flex-1 h-full min-w-0 overflow-hidden">
                  <RequestDetail
                    request={selectedRequest}
                    onDelete={handleDeleteRequest}
                    onOpenReplay={handleOpenReplay}
                    onOpenInClient={handleOpenInClient}
                    canEdit={canEdit}
                    isMobile={isMobile}
                    onBackToList={() => setSelectedRequest(null)}
                  />
                </div>
              )}
            </main>
          </>
        )}

        {mainViewMode === 'client' && (
          <main className="flex-1 flex overflow-hidden relative select-text">
            <ApiClient initialPayload={clientInitialPayload} />
          </main>
        )}

        {mainViewMode === 'tcp' && (
          <main className="flex-1 flex overflow-hidden relative select-text">
            <TcpClient />
          </main>
        )}
      </div>

      {/* 内网转发客户端弹窗 */}
      <ForwardModal
        isOpen={isForwardOpen}
        onClose={() => setIsForwardOpen(false)}
        bin={bin}
        token={authToken}
      />

      {/* 自定义响应配置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        bin={bin}
        onSave={handleSaveSettings}
      />

      {/* 频道协作与分享弹窗 */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        bin={bin}
        currentUser={user}
        onResetShareToken={handleResetShareToken}
        onMembersChange={() => {
          fetchUserBinsAndSelect(bin?.id);
          if (bin?.id) fetchActiveBinMembers(bin.id);
        }}
      />

      {/* 请求重放 / 转发弹窗 */}
      <ReplayModal
        isOpen={isReplayOpen}
        onClose={() => setIsReplayOpen(false)}
        request={replayTargetReq}
        binId={bin?.id || ''}
      />
    </div>
  );
}
