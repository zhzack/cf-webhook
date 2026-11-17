import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { RequestList } from './components/RequestList';
import { RequestDetail } from './components/RequestDetail';
import { SettingsModal } from './components/SettingsModal';
import { ReplayModal } from './components/ReplayModal';
import { ForwardModal } from './components/ForwardModal';
import { Bin, WebhookRecord, User } from './types';
import { fetchApi } from './api';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userBins, setUserBins] = useState<Bin[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [ssoAuthUrl, setSsoAuthUrl] = useState('https://auth.b1uegrey.xyz');

  const [bin, setBin] = useState<Bin | null>(null);
  const [requests, setRequests] = useState<WebhookRecord[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRecord | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [replayTargetReq, setReplayTargetReq] = useState<WebhookRecord | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

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

        // 加载用户所属所有频道并初始化活跃频道
        await fetchUserBinsAndSelect();
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
        await initBinWithoutAuth();
      }
    } catch (err) {
      setAuthLoading(false);
      await initBinWithoutAuth();
    }
  };

  // 加载用户所属频道列表
  const fetchUserBinsAndSelect = async () => {
    try {
      const data = await fetchApi<{ success: boolean; bins: Bin[] }>('/api/bins');
      if (data.success && Array.isArray(data.bins)) {
        setUserBins(data.bins);
      }

      // 选定频道：优先从 URL hash 读取，其次从 localStorage，最后选第一个或新建
      const hashBin = window.location.hash.replace('#', '').trim();
      const storedBin = localStorage.getItem('last_bin_id');
      const targetBinId = hashBin || storedBin;

      if (targetBinId) {
        await loadBin(targetBinId);
      } else if (data.bins && data.bins.length > 0) {
        await loadBin(data.bins[0].id);
      } else {
        await createNewBin();
      }
    } catch {
      await initBinWithoutAuth();
    }
  };

  const initBinWithoutAuth = async () => {
    const hashBin = window.location.hash.replace('#', '').trim();
    const storedBin = localStorage.getItem('last_bin_id');
    const binId = hashBin || storedBin;
    if (binId) {
      loadBin(binId);
    } else {
      createNewBin();
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
      } else {
        createNewBin();
      }
    } catch {
      createNewBin();
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
        setUserBins((prev) => [data.bin, ...prev.filter((b) => b.id !== data.bin.id)]);
        setRequests([]);
        setSelectedRequest(null);
      }
    } catch (e) {
      console.error('Failed to create bin:', e);
    }
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

    const streamUrl = authToken 
      ? `/api/bins/${bin.id}/stream?token=${encodeURIComponent(authToken)}`
      : `/api/bins/${bin.id}/stream`;

    const sse = new EventSource(streamUrl);
    eventSourceRef.current = sse;

    sse.addEventListener('connected', () => {
      setIsConnected(true);
    });

    sse.addEventListener('webhook', (e: MessageEvent) => {
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
      fetchRequests(bin.id);
    }, 3000);

    return () => {
      sse.close();
      clearInterval(pollInterval);
    };
  }, [bin?.id, authToken]);

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

  // 本地开发模拟登录
  const handleDevLogin = async () => {
    try {
      const data = await fetchApi<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'local_dev' }),
      });
      setUser(data.user);
      setAuthToken(data.token);
      await fetchUserBinsAndSelect();
    } catch (e: any) {
      alert('登录失败: ' + e.message);
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
    } catch (e) {
      console.error('Failed to clear requests:', e);
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
    } catch (e) {
      console.error('Failed to delete request:', e);
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

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 text-slate-100">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-slate-400">正在接入 b1uegrey 统一通行证安全校验...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 顶部导航 */}
      <Header
        bin={bin}
        user={user}
        userBins={userBins}
        isConnected={isConnected}
        onSelectBin={(binId) => loadBin(binId)}
        onNewBin={createNewBin}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenForward={() => setIsForwardOpen(true)}
        onClearRequests={handleClearRequests}
        onLogout={handleLogout}
        ssoAuthUrl={ssoAuthUrl}
        totalRequests={requests.length}
      />

      {/* 主体两栏视图 */}
      <main className="flex-1 flex overflow-hidden">
        <RequestList
          requests={requests}
          selectedId={selectedRequest?.id || null}
          onSelect={(req) => setSelectedRequest(req)}
          webhookUrl={bin ? `https://webhook.b1uegrey.xyz/bin/${bin.id}` : ''}
        />

        <RequestDetail
          request={selectedRequest}
          onDelete={handleDeleteRequest}
          onOpenReplay={handleOpenReplay}
        />
      </main>

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
