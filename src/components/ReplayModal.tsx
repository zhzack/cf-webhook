import React, { useState } from 'react';
import { X, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { WebhookRecord } from '../types';

interface ReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: WebhookRecord | null;
  binId: string;
}

export const ReplayModal: React.FC<ReplayModalProps> = ({
  isOpen,
  onClose,
  request,
  binId,
}) => {
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000/api/webhook');
  const [method, setMethod] = useState('POST');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    status?: number;
    statusText?: string;
    body?: string;
    error?: string;
  } | null>(null);

  React.useEffect(() => {
    if (request) {
      setMethod(request.method || 'POST');
      setResult(null);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleReplay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);

    let headersObj: Record<string, string> = {};
    try {
      headersObj = JSON.parse(request.headers || '{}');
    } catch {}

    try {
      const res = await fetch(`/api/bins/${binId}/replay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUrl,
          method,
          headers: headersObj,
          body: request.body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          status: data.status,
          statusText: data.statusText,
          body: data.body,
        });
      } else {
        setResult({
          success: false,
          error: data.error || '请求失败',
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || '网络连接错误',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden">
        
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" />
            <span>请求重放与转发 (Replay / Forward)</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <form onSubmit={handleReplay} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              目标转发地址 (Target URL)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="http://localhost:3000/api/webhook"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-200 font-mono outline-none focus:border-indigo-500"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              支持发送到内网穿透地址、本地开发服务或任意公网 API。
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 font-mono space-y-1">
            <div className="flex justify-between">
              <span>方法:</span>
              <span className="text-slate-200 font-bold">{method}</span>
            </div>
            <div className="flex justify-between">
              <span>Payload 长度:</span>
              <span className="text-slate-200">
                {request.body ? `${new Blob([request.body]).size} bytes` : '0 bytes'}
              </span>
            </div>
          </div>

          {/* 结果展示 */}
          {result && (
            <div
              className={`p-3.5 rounded-lg border text-xs font-mono space-y-1 ${
                result.success
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {result.success ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>目标返回: HTTP {result.status} {result.statusText}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>发送失败: {result.error}</span>
                  </>
                )}
              </div>
              {result.body && (
                <pre className="mt-2 p-2 bg-black/40 rounded max-h-32 overflow-auto text-[11px] text-slate-300">
                  {result.body}
                </pre>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              关闭
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow transition disabled:opacity-50"
            >
              {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{sending ? '正在发送...' : '立刻发送'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

