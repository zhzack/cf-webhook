import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { Bin } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bin: Bin | null;
  onSave: (settings: {
    response_status: number;
    response_content_type: string;
    response_body: string;
    feishu_auto_challenge: boolean;
  }) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  bin,
  onSave,
}) => {
  const [status, setStatus] = useState(200);
  const [contentType, setContentType] = useState('application/json');
  const [body, setBody] = useState('{"status":"ok"}');
  const [feishuAuto, setFeishuAuto] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bin) {
      setStatus(bin.response_status || 200);
      setContentType(bin.response_content_type || 'application/json');
      setBody(bin.response_body ?? '{"status":"ok"}');
      setFeishuAuto(bin.feishu_auto_challenge !== 0);
    }
  }, [bin]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        response_status: Number(status),
        response_content_type: contentType,
        response_body: body,
        feishu_auto_challenge: feishuAuto,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden">
        
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
            <span>Webhook 自定义响应配置</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          {/* 飞书专属智能响应开关 */}
          <div className="p-3.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">飞书 URL 校验自动应答 (推荐)</span>
                <input
                  type="checkbox"
                  checked={feishuAuto}
                  onChange={(e) => setFeishuAuto(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>
              <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                当飞书开放平台发起 <code>url_verification</code> 握手挑战时，边缘节点将以 10 毫秒极速回包，确保配置顺利通过。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 状态码 */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                HTTP 返回状态码
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-200 outline-none focus:border-indigo-500 font-mono"
              >
                <option value={200}>200 OK</option>
                <option value={201}>201 Created</option>
                <option value={204}>204 No Content</option>
                <option value={400}>400 Bad Request</option>
                <option value={401}>401 Unauthorized</option>
                <option value={404}>404 Not Found</option>
                <option value={500}>500 Internal Error</option>
              </select>
            </div>

            {/* Content-Type */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Content-Type
              </label>
              <input
                type="text"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                placeholder="application/json"
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-200 outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Response Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium">
                默认返回 Body (Mock 报文)
              </label>
              <button
                type="button"
                onClick={() => setBody(JSON.stringify({ code: 0, msg: 'success', timestamp: Date.now() }, null, 2))}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                填入常用 JSON
              </button>
            </div>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-slate-200 font-mono outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow transition disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

