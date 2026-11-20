import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  RotateCw, 
  Users, 
  Link, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  Eye, 
  Edit3, 
  AlertCircle,
  LogOut
} from 'lucide-react';
import { Bin, User, BinMember } from '../types';
import { fetchApi } from '../api';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  bin: Bin | null;
  currentUser: User | null;
  onResetShareToken: () => Promise<string>;
  onMembersChange?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  bin,
  currentUser,
  onResetShareToken,
  onMembersChange,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'members'>('link');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // 成员管理状态
  const [members, setMembers] = useState<BinMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor'>('viewer');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isOwner = bin?.role === 'owner' || !bin?.user_id;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareLink = bin?.share_token ? `${origin}/#join=${bin.share_token}` : '';

  useEffect(() => {
    if (isOpen && bin?.id) {
      loadMembers();
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [isOpen, bin?.id]);

  const loadMembers = async () => {
    if (!bin?.id) return;
    setLoadingMembers(true);
    try {
      const data = await fetchApi<{ success: boolean; members: BinMember[] }>(
        `/api/bins/${bin.id}/members`
      );
      if (data.success && Array.isArray(data.members)) {
        setMembers(data.members);
      }
    } catch (e: any) {
      // 忽略未授权查看成员的细微错误
    } finally {
      setLoadingMembers(false);
    }
  };

  if (!isOpen || !bin) return null;

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyToken = () => {
    if (!bin.share_token) return;
    navigator.clipboard.writeText(bin.share_token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleResetToken = async () => {
    if (!window.confirm('重置口令后，原先发出的邀请链接和口令将立即失效，确定要重置吗？')) return;
    setIsResetting(true);
    try {
      await onResetShareToken();
      setSuccessMessage('口令已成功重置！');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (e: any) {
      setErrorMessage(e.message || '重置口令失败');
    } finally {
      setIsResetting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setIsAdding(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await fetchApi(`/api/bins/${bin.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          role: newRole,
        }),
      });

      setSuccessMessage(`已成功将用户 @${newUsername.trim()} 添加为 ${newRole === 'editor' ? '协作者' : '只读查看者'}`);
      setNewUsername('');
      await loadMembers();
      if (onMembersChange) onMembersChange();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (e: any) {
      setErrorMessage(e.message || '添加成员失败');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string, targetUsername?: string) => {
    const isSelf = currentUser?.id === targetUserId;
    const confirmText = isSelf
      ? '确定要退出该频道的协作吗？'
      : `确定要将成员 @${targetUsername || targetUserId} 从该频道移除吗？`;

    if (!window.confirm(confirmText)) return;

    try {
      await fetchApi(`/api/bins/${bin.id}/members/${targetUserId}`, {
        method: 'DELETE',
      });
      if (isSelf) {
        onClose();
        if (onMembersChange) onMembersChange();
      } else {
        await loadMembers();
        if (onMembersChange) onMembersChange();
      }
    } catch (e: any) {
      alert('操作失败: ' + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <span>频道协作与分享</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  #{bin.id}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                {bin.name || `Bin ${bin.id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-slate-800 px-5 pt-2 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('link')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'link'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>口令与链接分享</span>
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>协作成员 ({members.length})</span>
          </button>
        </div>

        {/* 提示消息 */}
        {errorMessage && (
          <div className="mx-5 mt-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-5 mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 主体内容 */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {activeTab === 'link' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed">
                <p className="font-medium text-slate-200 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  安全免密协作链接
                </p>
                将此链接发送给团队成员或协作者，对方在浏览器打开后将自动加入该频道的协作网络，实时同步接收到的 Webhook 报文。
              </div>

              {/* 专属加入链接 */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  一键加入链接
                </label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                  <input
                    type="text"
                    readOnly
                    value={shareLink || '未分配口令'}
                    className="bg-transparent text-xs text-indigo-300 font-mono w-full outline-none px-2 select-all truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    disabled={!shareLink}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? '已复制' : '复制链接'}</span>
                  </button>
                </div>
              </div>

              {/* 分享口令 (Token) */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  协作口令 (Share Token)
                </label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                  <input
                    type="text"
                    readOnly
                    value={bin.share_token || ''}
                    className="bg-transparent text-xs text-slate-300 font-mono w-full outline-none px-2 select-all truncate"
                  />
                  <button
                    onClick={handleCopyToken}
                    disabled={!bin.share_token}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedToken ? '已复制' : '复制口令'}</span>
                  </button>
                </div>
              </div>

              {/* 重置口令 */}
              {isOwner && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 font-medium">重置协作口令</p>
                    <p className="text-[11px] text-slate-500">重置后旧链接立即失效，已加入成员不受影响</p>
                  </div>
                  <button
                    onClick={handleResetToken}
                    disabled={isResetting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 hover:border-rose-900/50 transition disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                    <span>{isResetting ? '重置中...' : '重置口令'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* 添加成员表单 (仅 Owner 可用) */}
              {isOwner ? (
                <form onSubmit={handleAddMember} className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2.5">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                    按账号邀请成员
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="输入成员账号 (如: zheng)"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500"
                    />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200 outline-none focus:border-indigo-500"
                    >
                      <option value="viewer">只读查看 (Viewer)</option>
                      <option value="editor">协作编辑 (Editor)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isAdding || !newUsername.trim()}
                      className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow transition disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isAdding ? '添加中...' : '添加'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    提示：被邀请的用户需在统一认证中心拥有账号且已登录过平台。
                  </p>
                </form>
              ) : (
                <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span>您当前为协作者，仅所有者可直接添加或调整成员权限。</span>
                </div>
              )}

              {/* 现有成员列表 */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-300 text-xs block">
                  成员列表 ({members.length})
                </span>

                {loadingMembers ? (
                  <div className="py-6 text-center text-slate-500">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>加载成员列表中...</span>
                  </div>
                ) : members.length > 0 ? (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
                    {members.map((m) => {
                      const isSelf = currentUser?.id === m.user_id;
                      const isOwnerRole = m.role === 'owner';

                      return (
                        <div key={m.user_id} className="p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                              {(m.nickname || m.username || 'U').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-200 truncate flex items-center gap-1.5">
                                <span>{m.nickname || m.username || '神秘成员'}</span>
                                {isSelf && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    我
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-500 font-mono truncate">
                                @{m.username || m.user_id}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* 角色 Badge */}
                            {isOwnerRole ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> 所有者
                              </span>
                            ) : m.role === 'editor' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                <Edit3 className="w-3 h-3" /> 可编辑
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                                <Eye className="w-3 h-3" /> 只读
                              </span>
                            )}

                            {/* 操作按钮 */}
                            {isOwner && !isOwnerRole && (
                              <button
                                onClick={() => handleRemoveMember(m.user_id, m.username)}
                                className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                                title="从频道中移除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isOwner && isSelf && (
                              <button
                                onClick={() => handleRemoveMember(m.user_id)}
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition flex items-center gap-1 text-[11px]"
                                title="退出该频道"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>退出</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-center text-slate-500 border border-slate-800 rounded-lg">
                    暂无其他成员
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-slate-800 flex justify-end bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-xs font-medium"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
};

