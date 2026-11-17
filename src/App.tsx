import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { RequestList } from './components/RequestList';
import { RequestDetail } from './components/RequestDetail';
import { SettingsModal } from './components/SettingsModal';
import { ReplayModal } from './components/ReplayModal';
import { ForwardModal } from './components/ForwardModal';
import { Bin, WebhookRecord } from './types';

export default function App() {
  const [bin, setBin] = useState<Bin | null>(null);
  const [requests, setRequests] = useState<WebhookRecord[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRecord | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [replayTargetReq, setReplayTargetReq] = useState<WebhookRecord | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // 1. 初始化 Bin（优先从 URL hash 读取，没有则从 localStorage 或生成新的）
  useEffect(() => {
    const hashBin = window.location.hash.replace('#', '').trim();
    const storedBin = localStorage.getItem('last_bin_id');
    const binId = hashBin || storedBin;

    if (binId) {
      loadBin(binId);
    } else {
      createNewBin();
    }
  }, []);

  // 加载指定 Bin 的信息与历史请求
  const loadBin = async (binId: string) => {
    try {
      const res = await fetch(`/api/bins/${binId}`);
      const data = await res.json();
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
      const res = await fetch('/api/bins', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.bin) {
        setBin(data.bin);
        localStorage.setItem('last_bin_id', data.bin.id);
        window.location.hash = data.bin.id;
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
      const res = await fetch(`/api/bins/${binId}/requests?limit=100`);
      const data = await res.json();
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

    const sse = new EventSource(`/api/bins/${bin.id}/stream`);
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
  }, [bin?.id]);

  // 清空历史请求
  const handleClearRequests = async () => {
    if (!bin) return;
    if (!window.confirm('确认清空当前频道下的全部请求历史吗？')) return;

    try {
      await fetch(`/api/bins/${bin.id}/requests`, { method: 'DELETE' });
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
      await fetch(`/api/bins/${bin.id}/requests/${id}`, { method: 'DELETE' });
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
    const res = await fetch(`/api/bins/${bin.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.success && data.bin) {
      setBin(data.bin);
    }
  };

  // 触发重放模态框
  const handleOpenReplay = (req: WebhookRecord) => {
    setReplayTargetReq(req);
    setIsReplayOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 顶部导航 */}
      <Header
        bin={bin}
        isConnected={isConnected}
        onNewBin={createNewBin}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenForward={() => setIsForwardOpen(true)}
        onClearRequests={handleClearRequests}
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

