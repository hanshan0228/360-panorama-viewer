import { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Sparkles,
  AlertCircle,
  LogOut,
  Coins,
} from 'lucide-react';
import { authServerUser } from '../../utils/commercialApi';
import type { ManagedUser } from '../../types/panorama';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ManagedUser;
  onAuthSuccess: (user: ManagedUser) => void;
}

export function UserAuthModal({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
}: UserAuthModalProps) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLoggedIn = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('panorama_server_user_token'));

  const handleLogout = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('panorama_server_user_token');
    }
    const guestUser: ManagedUser = {
      id: 'usr_guest',
      email: 'guest@panoramagenerator.ai',
      name: 'Free Trial Guest',
      plan: 'free',
      creditsBalance: 4,
      creditsTotal: 4,
      status: 'active',
      joinedAt: new Date().toISOString().split('T')[0],
      lastActiveAt: 'Just now',
      apiCallsCount: 0,
    };
    onAuthSuccess(guestUser);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg('请输入有效的电子邮箱地址。');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('账户密码长度不能少于 6 个字符。');
      return;
    }

    setLoading(true);
    try {
      const res = await authServerUser(email.trim(), isRegisterMode ? name.trim() : undefined, password);
      if (res.success && res.user) {
        const authedUser: ManagedUser = {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          plan: res.user.plan,
          creditsBalance: res.user.creditsBalance,
          creditsTotal: res.user.creditsTotal,
          status: res.user.status || 'active',
          joinedAt: new Date().toISOString().split('T')[0],
          lastActiveAt: '刚刚登录',
          apiCallsCount: res.user.apiCallsCount || 0,
        };
        onAuthSuccess(authedUser);
        onClose();
      } else {
        setErrorMsg(res.error || '登录鉴权失败，请检查密码凭证。');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '网络异常，无法连接鉴权服务器');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="bg-[#030d1d] border border-cyan-500/30 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl relative text-xs text-sky-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-r from-[#061838] to-[#020917] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-xl text-slate-950 font-bold shadow-md shadow-cyan-400/25">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {isLoggedIn ? '我的账户信息' : isRegisterMode ? '注册新账户 · 领 4 点试用积分' : '登录 PanoramaAI 账户'}
              </h3>
              <p className="text-[11px] text-cyan-300/70">
                {isLoggedIn ? '云端持久化账户与积分' : '云端同步全景图积分与商业授权'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isLoggedIn ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">用户名称</span>
                  <span className="font-bold text-white text-sm">{currentUser.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">绑定邮箱</span>
                  <span className="font-mono text-cyan-300">{currentUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">当前等级</span>
                  <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-200 font-bold font-mono">
                    {currentUser.plan}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-400 text-xs flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>可用积分</span>
                  </span>
                  <span className="font-mono text-amber-300 font-bold text-sm">
                    {currentUser.creditsBalance} 点
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 px-4 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>退出登录当前账户</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="p-3 bg-cyan-950/40 border border-cyan-500/25 rounded-2xl text-[11px] text-cyan-200/90 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p>
                  新注册账户自动赠送 <strong>4 点试用积分</strong>，支持免费体验 1 次 4K 极清或 2 次 2K 高清全景图生成。
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-950/50 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {isRegisterMode && (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">用户昵称 / 团队名</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如 Alex Vance..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">电子邮箱 (Email)</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:border-cyan-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">账户密码</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码（至少 6 个字符）..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:border-cyan-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="shimmer-btn w-full py-2.5 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black rounded-xl shadow-lg shadow-cyan-400/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? '处理中...' : isRegisterMode ? '立即注册并领取 4 积分' : '登录账户'}
              </button>

              <div className="text-center pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setErrorMsg(null);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 text-[11px] underline cursor-pointer"
                >
                  {isRegisterMode ? '已有账户？点击切换为登录' : '没有账户？点击注册新账户领 4 点积分'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
