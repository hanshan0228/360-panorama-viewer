import { useState, useEffect } from 'react';
import {
  Server,
  Users,
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Power,
  Search,
  Filter,
  Coins,
  DollarSign,
  Activity,
  Layers,
  Save,
  TrendingUp,
  Receipt,
  UserCheck,
  Radio,
  Wifi,
  Calendar,
  AlertCircle,
  Key,
  Shield,
  HelpCircle,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  LogOut,
  ShieldAlert,
  GitBranch,
  ArrowRightLeft,
  Shuffle,
} from 'lucide-react';
import type {
  ModelEndpointConfig,
  ModelRoutingConfig,
  ManagedUser,
  SystemBillingConfig,
  UserPlanTier,
  SubscriptionRecord,
  InvoiceRecord,
  PaymentGatewayConfig,
} from '../types/panorama';
import {
  getStoredModelEndpoints,
  saveStoredModelEndpoints,
  getStoredRoutingConfig,
  saveStoredRoutingConfig,
  getStoredManagedUsers,
  saveStoredManagedUsers,
  getStoredBillingConfig,
  saveStoredBillingConfig,
  getStoredSubscriptions,
  saveStoredSubscriptions,
  getStoredInvoices,
  getCurrentUser,
  setCurrentUserId,
  getStoredPaymentConfig,
  saveStoredPaymentConfig,
  isAdminSessionValid,
  setAdminSession,
  verifyAdminPassword,
  verifyAdminCredentials,
  setStoredAdminPassword,
  getStoredAdminUsername,
  setStoredAdminUsername,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../utils/adminStorage';
import { testProxyConnection } from '../utils/geminiClient';
import {
  probeBackendHealth,
  type BackendHealthStatus,
  adminAdjustUserCreditsServer,
  adminUpdateUserStatusServer,
  adminCreateUserServer,
  adminSaveBillingConfigServer,
  adminSaveModelsConfigServer,
  adminUpdateCredentialsServer,
  fetchPublicBillingConfig,
} from '../utils/commercialApi';

export function AdminTab() {
  // Session Authentication Guard
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => isAdminSessionValid());
  const [loginUsernameInput, setLoginUsernameInput] = useState(() => getStoredAdminUsername() || 'admin');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState<string | null>(null);

  // Active sub navigation
  const [activeSubSection, setActiveSubSection] = useState<
    'models' | 'users' | 'subscriptions' | 'payments' | 'billing' | 'security'
  >('models');

  // Current session user
  const [currentSessionUser, setCurrentSessionUser] = useState<ManagedUser>(() => getCurrentUser());

  // 1. Models & Routing State
  const [endpoints, setEndpoints] = useState<ModelEndpointConfig[]>(() => getStoredModelEndpoints());
  const [routingConfig, setRoutingConfig] = useState<ModelRoutingConfig>(() => getStoredRoutingConfig());
  const [editingEndpoint, setEditingEndpoint] = useState<ModelEndpointConfig | null>(null);
  const [isAddingEndpoint, setIsAddingEndpoint] = useState(false);
  const [testingEndpointId, setTestingEndpointId] = useState<string | null>(null);
  const [endpointPingResults, setEndpointPingResults] = useState<
    Record<string, { success: boolean; latency: number; message: string }>
  >({});

  // 2. Users State
  const [users, setUsers] = useState<ManagedUser[]>(() => getStoredManagedUsers());
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState<'all' | UserPlanTier>('all');
  const [editingUserCredits, setEditingUserCredits] = useState<{ id: string; amount: number } | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<{
    name: string;
    email: string;
    plan: UserPlanTier;
    credits: number;
    password?: string;
  }>({
    name: '',
    email: '',
    plan: 'pro',
    credits: 1000,
    password: '',
  });

  // 3. Subscriptions & Invoices State
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>(() => getStoredSubscriptions());
  const [invoices] = useState<InvoiceRecord[]>(() => getStoredInvoices());

  // 4. Payment Gateways State (PayPal & Stripe)
  const [paymentConfig, setPaymentConfig] = useState<PaymentGatewayConfig>(() => getStoredPaymentConfig());
  const [showSecrets, setShowSecrets] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendHealthStatus | null>(null);
  const [isServerMode, setIsServerMode] = useState<boolean>(() => {
    return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('panorama_admin_server_token'));
  });

  // 5. Billing Config State
  const [billingConfig, setBillingConfig] = useState<SystemBillingConfig>(() => getStoredBillingConfig());
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Probe server on mount and sync store if authenticated
  useEffect(() => {
    fetchPublicBillingConfig().then((cfg) => {
      if (cfg) setBillingConfig(cfg);
    });
    probeBackendHealth().then((status) => {
      setBackendStatus(status);
      if (status.isOnline) {
        const token = sessionStorage.getItem('panorama_admin_server_token');
        if (token) {
          setIsServerMode(true);
          fetch('/api/admin/store', {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data) {
                if (Array.isArray(data.users) && data.users.length > 0) setUsers(data.users);
                if (Array.isArray(data.subscriptions)) setSubscriptions(data.subscriptions);
              }
            })
            .catch(() => {});
        }
      }
    });
  }, []);

  // Probe server when opening payment section
  const handleOpenPaymentsSection = () => {
    setActiveSubSection('payments');
    probeBackendHealth().then((status) => setBackendStatus(status));
  };

  // 6. Security & Password Management State
  const [adminUsernameEdit, setAdminUsernameEdit] = useState(() => getStoredAdminUsername() || 'admin');
  const [currentPwdInput, setCurrentPwdInput] = useState('');
  const [newPwdInput, setNewPwdInput] = useState('');
  const [confirmNewPwdInput, setConfirmNewPwdInput] = useState('');
  const [pwdErrorMsg, setPwdErrorMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  // Login handler with Dual Mode Support (Real Server Authentication vs Offline Demo Fallback)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErrorMsg(null);

    // 1. 如果后端服务在线，优先走服务端的账号密码校验与 Session Token 颁发
    const health = await probeBackendHealth();
    if (health.isOnline) {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: loginUsernameInput,
            password: loginPasswordInput,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.token) {
          sessionStorage.setItem('panorama_admin_server_token', data.token);
          setAdminSession(true);
          setIsAuthenticated(true);
          setIsServerMode(true);
          setLoginPasswordInput('');

          // 登录成功立即拉取真实服务端账本
          const storeRes = await fetch('/api/admin/store', {
            headers: { Authorization: `Bearer ${data.token}` },
          });
          if (storeRes.ok) {
            const storeData = await storeRes.json();
            if (Array.isArray(storeData.users) && storeData.users.length > 0) setUsers(storeData.users);
            if (Array.isArray(storeData.subscriptions)) setSubscriptions(storeData.subscriptions);
          }
          return;
        } else {
          setLoginErrorMsg(data.error || '管理员账号或密码错误，请核对凭证。');
          return;
        }
      } catch {
        // 网络异常时降级至本地模式
      }
    }

    // 2. 服务端离线或单机模式：本地凭证校验 (账号 + 密码)
    if (verifyAdminCredentials(loginUsernameInput, loginPasswordInput)) {
      setAdminSession(true);
      setIsAuthenticated(true);
      setIsServerMode(false);
      setLoginPasswordInput('');
    } else {
      setLoginErrorMsg('管理员账号或密码错误，请核对凭证后重试。');
    }
  };

  const handleAdminLogout = () => {
    const adminToken = sessionStorage.getItem('panorama_admin_server_token');
    if (adminToken) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
      sessionStorage.removeItem('panorama_admin_server_token');
    }
    setAdminSession(false);
    setIsAuthenticated(false);
    setIsServerMode(false);
    setLoginPasswordInput('');
    setLoginErrorMsg(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErrorMsg(null);

    if (newPwdInput.length < 6) {
      setPwdErrorMsg('新密码长度不能少于 6 个字符。');
      return;
    }

    if (newPwdInput !== confirmNewPwdInput) {
      setPwdErrorMsg('两次输入的新密码不一致，请核对。');
      return;
    }

    if (isServerMode) {
      const res = await adminUpdateCredentialsServer(currentPwdInput, adminUsernameEdit.trim(), newPwdInput);
      if (!res.success) {
        setPwdErrorMsg(res.error || '云端更新管理员凭据失败，请核对旧密码。');
        return;
      }
    } else {
      if (!verifyAdminPassword(currentPwdInput)) {
        setPwdErrorMsg('当前旧密码输入错误。');
        return;
      }
    }

    if (adminUsernameEdit.trim()) {
      setStoredAdminUsername(adminUsernameEdit.trim());
      setLoginUsernameInput(adminUsernameEdit.trim());
    }
    setStoredAdminPassword(newPwdInput);
    setCurrentPwdInput('');
    setNewPwdInput('');
    setConfirmNewPwdInput('');
    showToast('管理员凭据（账号与主密码）已成功保存！');
  };

  const handleResetDefaultPassword = async () => {
    if (confirm('确认将管理员凭证恢复为初始默认值（账号 admin / 密码 admin888）吗？')) {
      if (isServerMode) {
        const inputOld = prompt('请输入当前管理员密码以确认重置操作：');
        if (!inputOld) return;
        const res = await adminUpdateCredentialsServer(inputOld, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
        if (!res.success) {
          alert('云端重置凭据失败：' + (res.error || '旧密码验证不通过'));
          return;
        }
      }
      setStoredAdminPassword(DEFAULT_ADMIN_PASSWORD);
      setStoredAdminUsername(DEFAULT_ADMIN_USERNAME);
      setAdminUsernameEdit(DEFAULT_ADMIN_USERNAME);
      setLoginUsernameInput(DEFAULT_ADMIN_USERNAME);
      showToast('管理员凭证已恢复默认值：账号 admin / 密码 admin888');
    }
  };

  // Model Operations
  const handleToggleEndpointEnabled = (id: string) => {
    const next = endpoints.map((ep) => (ep.id === id ? { ...ep, isEnabled: !ep.isEnabled } : ep));
    setEndpoints(next);
    saveStoredModelEndpoints(next);
    showToast('模型端点启用状态已更新。');
  };

  const handleSetAsPrimaryEndpoint = (id: string) => {
    const nextRouting: ModelRoutingConfig = {
      ...routingConfig,
      primaryEndpointId: id,
      secondaryEndpointId:
        routingConfig.secondaryEndpointId === id
          ? routingConfig.primaryEndpointId
          : routingConfig.secondaryEndpointId,
    };
    setRoutingConfig(nextRouting);
    saveStoredRoutingConfig(nextRouting);
    const nextEndpoints = endpoints.map((ep) => ({ ...ep, isDefault: ep.id === id }));
    setEndpoints(nextEndpoints);
    saveStoredModelEndpoints(nextEndpoints);
    showToast('已设定为【主模型 (Primary)】。系统将优先调用此模型生图。');
  };

  const handleSetAsSecondaryEndpoint = (id: string) => {
    const nextRouting: ModelRoutingConfig = {
      ...routingConfig,
      secondaryEndpointId: id,
    };
    setRoutingConfig(nextRouting);
    saveStoredRoutingConfig(nextRouting);
    showToast('已设定为【次模型 (Secondary)】。当主模型耗尽配额或故障时将自动接管。');
  };

  const handleSaveRoutingStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredRoutingConfig(routingConfig);
    if (isServerMode) {
      await adminSaveModelsConfigServer({ endpoints, routingConfig });
    }
    showToast('模型调度与容灾策略已持久化保存！');
  };

  const handleDeleteEndpoint = (id: string) => {
    if (confirm('确认删除此 AI 模型端点配置吗？')) {
      const next = endpoints.filter((ep) => ep.id !== id);
      setEndpoints(next);
      saveStoredModelEndpoints(next);
      showToast('模型端点已删除。');
    }
  };

  const handleTestEndpointPing = async (ep: ModelEndpointConfig) => {
    setTestingEndpointId(ep.id);
    const start = performance.now();
    try {
      const res = await testProxyConnection({
        baseUrl: ep.baseUrl,
        apiKey: ep.apiKey,
        model: ep.model,
      });
      const latency = Math.round(performance.now() - start);
      setEndpointPingResults((prev) => ({
        ...prev,
        [ep.id]: {
          success: res.success,
          latency,
          message: res.message,
        },
      }));
    } catch (err) {
      setEndpointPingResults((prev) => ({
        ...prev,
        [ep.id]: {
          success: false,
          latency: 0,
          message: err instanceof Error ? err.message : '连接异常',
        },
      }));
    } finally {
      setTestingEndpointId(null);
    }
  };

  const handleSaveEndpointForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEndpoint) return;

    let next: ModelEndpointConfig[];
    if (isAddingEndpoint) {
      next = [...endpoints, editingEndpoint];
    } else {
      next = endpoints.map((ep) => (ep.id === editingEndpoint.id ? editingEndpoint : ep));
    }
    setEndpoints(next);
    saveStoredModelEndpoints(next);
    if (isServerMode) {
      await adminSaveModelsConfigServer({ endpoints: next, routingConfig });
    }
    setEditingEndpoint(null);
    setIsAddingEndpoint(false);
    showToast(isAddingEndpoint ? '新 AI 模型端点添加成功。' : '模型端点配置已保存。');
  };

  // User Operations
  const handleSwitchActiveSessionUser = (user: ManagedUser) => {
    setCurrentUserId(user.id);
    setCurrentSessionUser(user);
    showToast(`当前测试会话用户已切换为：${user.name} (${user.plan.toUpperCase()})`);
  };

  const handleUpdateUserStatus = async (userId: string, newStatus: 'active' | 'suspended') => {
    if (isServerMode) {
      const ok = await adminUpdateUserStatusServer(userId, newStatus);
      if (!ok) {
        showToast('云端账号状态更新失败，请检查会话权限。');
        return;
      }
    }
    const next = users.map((u) => (u.id === userId ? { ...u, status: newStatus } : u));
    setUsers(next);
    saveStoredManagedUsers(next);
    showToast(`用户账号状态已变更为：${newStatus === 'active' ? '正常活跃' : '已封禁挂起'}`);
  };

  const handleAdjustCredits = async (userId: string, delta: number) => {
    if (isServerMode) {
      const ok = await adminAdjustUserCreditsServer(userId, delta);
      if (!ok) {
        showToast('云端积分调整失败，请检查会话权限。');
        return;
      }
    }
    const next = users.map((u) => {
      if (u.id === userId) {
        const nextBalance = Math.max(0, u.creditsBalance + delta);
        return { ...u, creditsBalance: nextBalance };
      }
      return u;
    });
    setUsers(next);
    saveStoredManagedUsers(next);
    setEditingUserCredits(null);
    if (userId === currentSessionUser.id) {
      setCurrentSessionUser(getCurrentUser());
    }
    showToast('用户全景图积分已成功调整。');
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email) return;

    let assignedId = `usr_${Date.now().toString().slice(-4)}`;
    let initialPwdNote = '';
    if (isServerMode) {
      const created = await adminCreateUserServer({
        name: newUserForm.name.trim(),
        email: newUserForm.email.trim(),
        plan: newUserForm.plan,
        credits: newUserForm.credits,
        password: newUserForm.password?.trim() || undefined,
      });
      if (!created) {
        showToast('云端创建用户失败，请检查输入或权限。');
        return;
      }
      assignedId = created.id;
      if (created.initialPassword) {
        initialPwdNote = ` (初始密码: ${created.initialPassword})`;
      }
    }

    const newUsr: ManagedUser = {
      id: assignedId,
      name: newUserForm.name.trim(),
      email: newUserForm.email.trim(),
      plan: newUserForm.plan,
      creditsBalance: newUserForm.credits,
      creditsTotal: newUserForm.credits,
      status: 'active',
      joinedAt: new Date().toISOString().split('T')[0],
      lastActiveAt: '刚刚创建',
      apiCallsCount: 0,
    };

    const next = [newUsr, ...users];
    setUsers(next);
    saveStoredManagedUsers(next);
    setIsAddingUser(false);
    setNewUserForm({ name: '', email: '', plan: 'pro', credits: 1000, password: '' });
    showToast(`成功创建受管用户：${newUsr.name}${initialPwdNote}`);
  };

  // Subscription Operations
  const handleToggleSubscriptionCancel = (subId: string) => {
    const next = subscriptions.map((s) => {
      if (s.id === subId) {
        return {
          ...s,
          cancelAtPeriodEnd: !s.cancelAtPeriodEnd,
        };
      }
      return s;
    });
    setSubscriptions(next);
    saveStoredSubscriptions(next);
    showToast('订阅自动续费设置已更新。');
  };

  // Payment Gateway Operations
  const handleSavePaymentConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredPaymentConfig(paymentConfig);
    showToast('PayPal 与 Stripe 支付网关配置已成功保存！');
  };

  // Billing Config Operations
  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isServerMode) {
      const ok = await adminSaveBillingConfigServer(billingConfig);
      if (!ok) {
        showToast('云端保存计费规则失败，请检查网络或会话。');
        return;
      }
    }
    saveStoredBillingConfig(billingConfig);
    showToast('商业计费规则与积分费率已保存。');
  };

  // Metrics calculation
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const mrr = activeSubs.reduce((acc, s) => {
    if (s.billingCycle === 'monthly') return acc + s.amount;
    return acc + s.amount / 12;
  }, 0);
  const arr = mrr * 12;
  const totalInvoiced = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((acc, inv) => acc + inv.amount, 0);

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearchQuery.toLowerCase());
    const matchesPlan = userPlanFilter === 'all' || u.plan === userPlanFilter;
    return matchesSearch && matchesPlan;
  });

  // ================= RENDER LOGIN GATE IF NOT AUTHENTICATED =================
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-[#030d1d] border border-cyan-500/30 rounded-3xl shadow-2xl relative overflow-hidden text-xs">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500" />

        <div className="text-center space-y-3 mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-400/25">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">管理控制台已锁定</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            受保护的管理控制区域。请输入主管理员密码以进入 AI 模型端点、用户管理、订阅与财务账目控制面板。
          </p>
        </div>

        {/* Dynamic Server / Sandbox Status on Login Gate */}
        <div
          className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 mb-5 border ${
            backendStatus?.isOnline
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200/90'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'
          }`}
        >
          <ShieldAlert
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              backendStatus?.isOnline ? 'text-emerald-400' : 'text-amber-400'
            }`}
          />
          <div className="space-y-0.5">
            <span
              className={`font-bold ${
                backendStatus?.isOnline ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {backendStatus?.isOnline
                ? '云端持久化账本已就绪 (Cloud Connected)'
                : '本地演示沙箱环境 (Demo Sandbox)'}
            </span>
            <p
              className={`text-[11px] leading-relaxed ${
                backendStatus?.isOnline ? 'text-emerald-200/80' : 'text-amber-200/75'
              }`}
            >
              {backendStatus?.isOnline
                ? '当前控制台已成功连通云端持久化数据库。输入管理员密码解锁后，将直接同步服务端账本与真实用户。'
                : '当前处于单机离线演示界面，密码验证与账目仅保存在浏览器本地，未与生产服务端同步。'}
            </p>
          </div>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1.5 flex items-center justify-between">
              <span>管理员账号</span>
              <span className="text-[10px] text-cyan-400 font-mono">默认: admin</span>
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                required
                value={loginUsernameInput}
                onChange={(e) => setLoginUsernameInput(e.target.value)}
                placeholder="请输入管理员账号..."
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1.5 flex items-center justify-between">
              <span>管理员主密码</span>
              <span className="text-[10px] text-cyan-400 font-mono">默认: admin888</span>
            </label>
            <div className="relative">
              <input
                type={showLoginPassword ? 'text' : 'password'}
                required
                value={loginPasswordInput}
                onChange={(e) => setLoginPasswordInput(e.target.value)}
                placeholder="请输入管理员密码..."
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-white cursor-pointer"
              >
                {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {loginErrorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginErrorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="shimmer-btn w-full py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Unlock className="w-4 h-4" />
            <span>解锁管理控制台</span>
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
          <span>初始默认凭据：账号 </span>
          <code className="text-cyan-400 font-mono font-bold">admin</code>
          <span> / 密码 </span>
          <code className="text-cyan-400 font-mono font-bold">admin888</code>
          <span>。登录后可在【安全与凭证】面板中随时修改。</span>
        </div>
      </div>
    );
  }

  // ================= RENDER AUTHENTICATED ADMIN CONSOLE =================
  return (
    <div className="space-y-6">
      {/* Sandbox Demo / Live Server Warning Banner */}
      <div
        className={`${
          isServerMode
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200/90'
            : backendStatus?.isOnline
            ? 'bg-blue-950/40 border-blue-500/40 text-blue-200/90'
            : 'bg-amber-950/30 border-amber-500/30 text-amber-200/90'
        } border text-xs px-4 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <ShieldAlert
            className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${
              isServerMode
                ? 'text-emerald-400'
                : backendStatus?.isOnline
                ? 'text-cyan-400'
                : 'text-amber-400'
            }`}
          />
          <div className="leading-relaxed">
            {isServerMode ? (
              <>
                <strong className="text-emerald-300">服务端持久化管理后台：</strong>
                当前后台已成功连接云端商业持久化服务，管理员鉴权与用户列表、订阅账目由服务端数据库统一同步与落盘。
              </>
            ) : backendStatus?.isOnline ? (
              <>
                <strong className="text-cyan-300">检测到服务端已就绪：</strong>
                当前浏览器处于之前的离线缓存会话。点击右侧按钮退出并重新输入管理员密码，即可直接连通服务端数据库真实账本。
              </>
            ) : (
              <>
                <strong className="text-amber-300">本地演示沙箱声明：</strong>
                当前后台处于单机离线演示模式（本地开发可运行 <code className="text-amber-200 font-mono">npm run server</code> 启动后端），管理员身份与账目仅保存在浏览器本地，未接入服务端持久化账本。
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {!isServerMode && backendStatus?.isOnline && (
            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-3 py-1 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm shadow-cyan-400/25 transition-all"
            >
              一键重新登录同步云端 →
            </button>
          )}

          <span
            className={`text-[10px] border font-mono px-2.5 py-1 rounded-full shrink-0 font-bold tracking-wider ${
              isServerMode
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : backendStatus?.isOnline
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
          >
            {isServerMode
              ? 'LIVE SERVER LEDGER'
              : backendStatus?.isOnline
              ? 'SERVER READY'
              : 'LOCAL DEMO SANDBOX'}
          </span>
        </div>
      </div>

      {/* Header & Sub Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-lg text-slate-950 shadow-md shadow-cyan-500/20">
              <Server className="w-4 h-4" />
            </span>
            <h2 className="text-xl font-bold text-white">系统运营与管理控制中心</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            当前测试会话用户：{' '}
            <strong className="text-cyan-300">
              {currentSessionUser.name} ({currentSessionUser.email}) · 积分余额：{currentSessionUser.creditsBalance}
            </strong>
          </p>
        </div>

        {/* Sub Navigation & Lock Button */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubSection('models')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'models'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>AI 模型路由</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'users'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>用户管理</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('subscriptions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'subscriptions'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>订阅财务</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPaymentsSection}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'payments'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>支付网关</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('billing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'billing'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>定价规则</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('security')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubSection === 'security'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>安全密码</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdminLogout}
            title="锁定控制台并退出"
            className="p-2 bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {saveSuccessMsg && (
        <div className="px-4 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* ================= SECTION 1: Model Management ================= */}
      {activeSubSection === 'models' && (
        <div className="space-y-6">
          {/* Routing & Failover Strategy Configuration Card */}
          <form
            onSubmit={handleSaveRoutingStrategy}
            className="p-6 bg-slate-900/80 border border-cyan-500/30 rounded-2xl shadow-xl space-y-5 text-xs relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 via-teal-300 to-purple-500" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-cyan-400" />
                  <span>模型调度与故障容灾策略 (Model Dispatch &amp; Failover Policy)</span>
                </h3>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  灵活配置主次模型。支持主模型额度耗尽（429 / 配额超限）或报错时零中断自动切换次模型，亦可配置单模型锁定或多模型循环轮询。
                </p>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-400/20 active:scale-95 transition-all self-start sm:self-auto"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存调度策略</span>
              </button>
            </div>

            {/* Mode Selector */}
            <div className="space-y-2">
              <label className="block text-slate-300 font-semibold">
                调度执行模式 (Dispatch Mode)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Failover Mode (Recommended) */}
                <button
                  type="button"
                  onClick={() => setRoutingConfig({ ...routingConfig, mode: 'failover' })}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    routingConfig.mode === 'failover'
                      ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg shadow-cyan-500/15'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-cyan-300">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>主备自动容灾 (Failover)</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-200 font-bold">
                      推荐
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    优先调用主模型。若遇配额耗尽 (429) 或故障，自动无感知切换至次模型。
                  </p>
                </button>

                {/* 2. Single Model Only */}
                <button
                  type="button"
                  onClick={() => setRoutingConfig({ ...routingConfig, mode: 'single' })}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    routingConfig.mode === 'single'
                      ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg shadow-cyan-500/15'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-slate-200">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>单模型锁定 (Single)</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-bold">
                      单模锁定
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    严格仅调用选定主模型，不启用任何次模型或轮询备灾。
                  </p>
                </button>

                {/* 3. Round-Robin Rotation */}
                <button
                  type="button"
                  onClick={() => setRoutingConfig({ ...routingConfig, mode: 'round-robin' })}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    routingConfig.mode === 'round-robin'
                      ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg shadow-cyan-500/15'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-purple-300">
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>循环轮询 (Round-Robin)</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-400/20 text-purple-200 font-bold">
                      循环轮询
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    在所有已启用的模型之间循环轮流分发生成任务，均衡各端点额度。
                  </p>
                </button>
              </div>
            </div>

            {/* Manual Primary & Secondary Endpoint Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>★ 主模型 (Primary Model)</span>
                  <span className="text-[10px] text-cyan-400">第一顺位调用</span>
                </label>
                <select
                  value={routingConfig.primaryEndpointId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setRoutingConfig({ ...routingConfig, primaryEndpointId: id });
                    const next = endpoints.map((ep) => ({ ...ep, isDefault: ep.id === id }));
                    setEndpoints(next);
                    saveStoredModelEndpoints(next);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} ({ep.model}) {!ep.isEnabled ? '[已停用]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>⚡ 次模型 (Secondary Fallback)</span>
                  <span className="text-[10px] text-purple-400">主模型耗尽时切换</span>
                </label>
                <select
                  disabled={routingConfig.mode === 'single'}
                  value={routingConfig.secondaryEndpointId}
                  onChange={(e) => setRoutingConfig({ ...routingConfig, secondaryEndpointId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} ({ep.model}) {!ep.isEnabled ? '[已停用]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>🛡️ 第三备用模型 (Tertiary Fallback)</span>
                  <span className="text-[10px] text-emerald-400">深层安全兜底</span>
                </label>
                <select
                  disabled={routingConfig.mode === 'single'}
                  value={routingConfig.tertiaryEndpointId || ''}
                  onChange={(e) => setRoutingConfig({ ...routingConfig, tertiaryEndpointId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="">-- 无 (不设置第三备用) --</option>
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} ({ep.model}) {!ep.isEnabled ? '[已停用]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          {/* Header & Add Button */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>已配置的模型端点列表 ({endpoints.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setIsAddingEndpoint(true);
                setEditingEndpoint({
                  id: `model_${Date.now()}`,
                  name: '新建自定义端点',
                  provider: 'gemini',
                  baseUrl: 'http://localhost:8317',
                  apiKey: '',
                  model: 'gemini-3.1-flash-image',
                  isEnabled: true,
                  priority: endpoints.length + 1,
                  maxResolution: '4K',
                  isDefault: false,
                });
              }}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-cyan-500/25 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加模型端点</span>
            </button>
          </div>

          <div className="p-3 bg-blue-950/30 border border-blue-500/20 rounded-xl text-[11px] text-blue-200/90 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>公网部署注意：</strong>
              预设的 <code className="text-cyan-300">http://localhost:8317</code> 为本机代理端口。若将本页面部署到公网或 GitHub Pages 供外部访问，访客浏览器无法连接访客自身本机的 8317 端口。公网部署时建议配置公网可访问的反向代理 URL，或配置 Google 官方直连端点 (<code className="text-cyan-300">https://generativelanguage.googleapis.com</code>) 并输入 API Key。
            </span>
          </div>

          {/* Model Endpoints Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {endpoints.map((ep) => {
              const pingResult = endpointPingResults[ep.id];
              const isPinging = testingEndpointId === ep.id;
              const isPrimary = routingConfig.primaryEndpointId === ep.id;
              const isSecondary = routingConfig.secondaryEndpointId === ep.id;
              const isTertiary = routingConfig.tertiaryEndpointId === ep.id;

              return (
                <div
                  key={ep.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isPrimary
                      ? 'bg-slate-900/90 border-cyan-400/60 shadow-lg shadow-cyan-500/15 ring-1 ring-cyan-400/30'
                      : isSecondary
                      ? 'bg-slate-900/80 border-purple-500/40 shadow-md shadow-purple-500/10'
                      : ep.isEnabled
                      ? 'bg-slate-900/60 border-slate-800'
                      : 'bg-slate-950/40 border-slate-900 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-white text-sm">{ep.name}</span>
                          {isPrimary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-mono font-bold">
                              ★ 主模型 (Primary)
                            </span>
                          )}
                          {isSecondary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-300 border border-purple-400/40 font-mono font-bold">
                              ⚡ 次模型 (Secondary)
                            </span>
                          )}
                          {isTertiary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold">
                              🛡️ 备用模型 3
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-cyan-400 mt-0.5">{ep.model}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={ep.isEnabled ? '点击停用端点' : '点击启用端点'}
                          onClick={() => handleToggleEndpointEnabled(ep.id)}
                          className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                            ep.isEnabled
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="编辑端点配置"
                          onClick={() => {
                            setIsAddingEndpoint(false);
                            setEditingEndpoint(ep);
                          }}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="删除端点"
                          disabled={endpoints.length <= 1}
                          onClick={() => handleDeleteEndpoint(ep.id)}
                          className="p-1.5 bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-400 rounded-lg cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-400 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">协议类型:</span>
                        <span className="text-slate-300 uppercase">{ep.provider}</span>
                      </div>
                      <div className="flex justify-between truncate">
                        <span className="text-slate-500">接口地址:</span>
                        <span className="text-slate-300 truncate max-w-[200px]">{ep.baseUrl}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">最高画质:</span>
                        <span className="text-cyan-400">{ep.maxResolution}</span>
                      </div>
                    </div>

                    {/* Ping Test Result Box */}
                    {pingResult && (
                      <div
                        className={`mt-2.5 p-2.5 rounded-xl border text-[11px] font-mono flex items-start gap-2 ${
                          pingResult.success
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {pingResult.success ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 truncate">
                          <span className="font-bold">
                            {pingResult.success ? `连接正常 (${pingResult.latency}ms)` : '连接失败'}
                          </span>
                          <p className="text-[10px] opacity-80 truncate">{pingResult.message}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/80 text-xs gap-2">
                    <button
                      type="button"
                      disabled={isPinging}
                      onClick={() => handleTestEndpointPing(ep)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Wifi className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                      <span>{isPinging ? '测试中...' : '测试延迟'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {!isPrimary && ep.isEnabled && (
                        <button
                          type="button"
                          onClick={() => handleSetAsPrimaryEndpoint(ep.id)}
                          className="px-2 py-0.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded-lg text-[10.5px] font-semibold cursor-pointer"
                        >
                          设为主模型
                        </button>
                      )}
                      {!isSecondary && ep.isEnabled && (
                        <button
                          type="button"
                          onClick={() => handleSetAsSecondaryEndpoint(ep.id)}
                          className="px-2 py-0.5 bg-purple-950 hover:bg-purple-900 border border-purple-500/40 text-purple-300 rounded-lg text-[10.5px] font-semibold cursor-pointer"
                        >
                          设为次模型
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Model Edit / Add Modal */}
          {editingEndpoint && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <form
                onSubmit={handleSaveEndpointForm}
                className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-semibold text-white text-sm">
                    {isAddingEndpoint ? '添加 AI 模型端点' : `编辑端点配置: ${editingEndpoint.name}`}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditingEndpoint(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">显示名称</label>
                    <input
                      type="text"
                      required
                      value={editingEndpoint.name}
                      onChange={(e) => setEditingEndpoint({ ...editingEndpoint, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1">协议类型</label>
                    <select
                      value={editingEndpoint.provider}
                      onChange={(e) =>
                        setEditingEndpoint({
                          ...editingEndpoint,
                          provider: e.target.value as ModelEndpointConfig['provider'],
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    >
                      <option value="gemini">Google Gemini / 8317 本地代理协议 (已实装)</option>
                      <option value="openai">OpenAI 兼容协议 (/v1/images/generations) (已实装)</option>
                      <option value="fal" disabled>Fal.ai Serverless (暂未实装 · 需接入专用 SDK)</option>
                      <option value="replicate" disabled>Replicate 图像生成接口 (暂未实装 · 需接入专用 SDK)</option>
                      <option value="custom">自建服务器 / 自定义反向代理</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">接口地址 (Base URL)</label>
                  <input
                    type="text"
                    required
                    value={editingEndpoint.baseUrl}
                    onChange={(e) => setEditingEndpoint({ ...editingEndpoint, baseUrl: e.target.value })}
                    placeholder="http://localhost:8317 或 https://generativelanguage.googleapis.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    提示：若部署至公网环境供外部访客使用，请配置公网反向代理或 Google 官方端点，避免访客连接失败。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">模型标识 (Model ID)</label>
                    <input
                      type="text"
                      required
                      value={editingEndpoint.model}
                      onChange={(e) => setEditingEndpoint({ ...editingEndpoint, model: e.target.value })}
                      placeholder="gemini-3.1-flash-image"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">最高支持分辨率</label>
                    <select
                      value={editingEndpoint.maxResolution}
                      onChange={(e) =>
                        setEditingEndpoint({ ...editingEndpoint, maxResolution: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    >
                      <option value="1K">1K (1024x512)</option>
                      <option value="2K">2K (2048x1024)</option>
                      <option value="4K">4K (4096x2048)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">API Key 密钥 (本地 8317 代理可留空)</label>
                  <input
                    type="password"
                    value={editingEndpoint.apiKey}
                    onChange={(e) => setEditingEndpoint({ ...editingEndpoint, apiKey: e.target.value })}
                    placeholder="AIzaSy... 或 sk-..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingEndpoint(null)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 shadow-md shadow-cyan-500/20 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>保存端点配置</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION 2: User Management ================= */}
      {activeSubSection === 'users' && (
        <div className="space-y-4">
          {/* Top Search & Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="按邮箱、姓名或用户 ID 搜索..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                {(['all', 'free', 'pro', 'enterprise'] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setUserPlanFilter(plan)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      userPlanFilter === plan
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-sm shadow-cyan-500/30'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {plan === 'all' ? '全部套餐' : plan === 'free' ? '免费体验' : plan === 'pro' ? '专业版' : '企业版'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsAddingUser(true)}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl font-bold flex items-center gap-1 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增用户</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3">用户与邮箱</th>
                    <th className="px-5 py-3">会员套餐</th>
                    <th className="px-5 py-3">积分余额</th>
                    <th className="px-5 py-3">调用次数</th>
                    <th className="px-5 py-3">账号状态</th>
                    <th className="px-5 py-3 text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((u) => {
                    const isCurrent = u.id === currentSessionUser.id;

                    return (
                      <tr key={u.id} className={`hover:bg-slate-800/30 transition-colors ${isCurrent ? 'bg-cyan-950/20' : ''}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{u.name}</span>
                            {isCurrent && (
                              <span className="px-2 py-0.2 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 text-[9px] font-bold">
                                当前测试会话
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                        </td>

                        <td className="px-5 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold uppercase ${
                              u.plan === 'enterprise'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : u.plan === 'pro'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {u.plan}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{u.creditsBalance}</span>
                            <span className="text-slate-500">/ {u.creditsTotal}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingUserCredits({ id: u.id, amount: u.creditsBalance })
                              }
                              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium ml-1 cursor-pointer"
                            >
                              调整
                            </button>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 font-mono text-slate-300">{u.apiCallsCount} 次</td>

                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] ${
                              u.status === 'active'
                                ? 'text-emerald-400'
                                : u.status === 'suspended'
                                ? 'text-red-400'
                                : 'text-slate-500'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'
                              }`}
                            />
                            {u.status === 'active' ? '正常活跃' : '已封禁挂起'}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleSwitchActiveSessionUser(u)}
                                className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded-lg text-[11px] font-bold cursor-pointer"
                              >
                                设为会话用户
                              </button>
                            )}

                            {u.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleUpdateUserStatus(u.id, 'suspended')}
                                className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[11px] cursor-pointer"
                              >
                                封禁账号
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUpdateUserStatus(u.id, 'active')}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] cursor-pointer"
                              >
                                解除封禁
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create User Modal */}
          {isAddingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <form
                onSubmit={handleCreateNewUser}
                className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-semibold text-white text-sm">添加受管用户</h4>
                  <button type="button" onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">用户姓名</label>
                  <input
                    type="text"
                    required
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">电子邮箱</label>
                  <input
                    type="email"
                    required
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">会员等级</label>
                    <select
                      value={newUserForm.plan}
                      onChange={(e) => setNewUserForm({ ...newUserForm, plan: e.target.value as UserPlanTier })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    >
                      <option value="free">Free 免费体验版</option>
                      <option value="pro">Pro 专业创作者</option>
                      <option value="enterprise">Enterprise 商业旗舰</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">初始积分</label>
                    <input
                      type="number"
                      min={0}
                      value={newUserForm.credits}
                      onChange={(e) => setNewUserForm({ ...newUserForm, credits: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 flex items-center justify-between">
                    <span>初始登录密码</span>
                    <span className="text-[10px] text-cyan-400 font-mono">留空自动生成独立随机密码</span>
                  </label>
                  <input
                    type="password"
                    value={newUserForm.password || ''}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    placeholder="输入密码或留空自动生成..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button type="button" onClick={() => setIsAddingUser(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg">
                    取消
                  </button>
                  <button type="submit" className="px-4 py-1.5 bg-cyan-400 text-slate-950 font-bold rounded-lg">
                    创建用户
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Adjust User Credits Modal */}
          {editingUserCredits && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 text-xs">
                <h4 className="font-semibold text-white text-sm">调整用户全景图积分</h4>
                <p className="text-slate-400 text-xs">快速增发或扣减 360° 全景图生成所需积分：</p>
                <div className="grid grid-cols-3 gap-2">
                  {[+100, +500, +1000, -100, -500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleAdjustCredits(editingUserCredits.id, amt)}
                      className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 font-mono font-medium cursor-pointer"
                    >
                      {amt > 0 ? `+${amt}` : amt}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingUserCredits(null)}
                    className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION 3: Subscriptions & ARR Metrics ================= */}
      {activeSubSection === 'subscriptions' && (
        <div className="space-y-6">
          {/* SaaS Key Financial Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-cyan-500/30 p-5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>月经常性收入 (MRR)</span>
                <DollarSign className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">
                ${mrr.toFixed(2)} <span className="text-xs text-slate-400 font-sans">USD</span>
              </div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span>按月与按年合同标准化折算</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-purple-500/30 p-5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>年度合同总值 (ARR)</span>
                <TrendingUp className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">
                ${arr.toFixed(2)} <span className="text-xs text-slate-400 font-sans">USD</span>
              </div>
              <div className="text-[11px] text-purple-300/80">
                12 个月预期合同价值预估
              </div>
            </div>

            <div className="bg-slate-900/60 border border-emerald-500/30 p-5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>活跃订阅数</span>
                <UserCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">{activeSubs.length}</div>
              <div className="text-[11px] text-emerald-400">100% 正常扣费履约状态</div>
            </div>

            <div className="bg-slate-900/60 border border-amber-500/30 p-5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>已结算发票总额</span>
                <Receipt className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">
                ${totalInvoiced.toFixed(2)}
              </div>
              <div className="text-[11px] text-amber-300/80">
                共 {invoices.length} 笔已成功支付记录
              </div>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-3 p-5">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>客户订阅台账记录 (Customer Subscriptions Ledger)</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">订阅 ID</th>
                    <th className="px-4 py-3">订阅用户</th>
                    <th className="px-4 py-3">套餐等级</th>
                    <th className="px-4 py-3">扣费周期</th>
                    <th className="px-4 py-3">订阅金额</th>
                    <th className="px-4 py-3">本期到期日</th>
                    <th className="px-4 py-3">自动续费</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-cyan-400">{sub.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{sub.userName}</div>
                        <div className="text-[11px] text-slate-500">{sub.userEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="uppercase font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                          {sub.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{sub.billingCycle === 'yearly' ? '按年支付' : '按月支付'}</td>
                      <td className="px-4 py-3 font-mono font-bold text-white">
                        ${sub.amount} {sub.currency}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {sub.currentPeriodEnd}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            sub.cancelAtPeriodEnd ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {sub.cancelAtPeriodEnd ? '周期结束即取消' : '正常生效 (自动续费)'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleSubscriptionCancel(sub.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          {sub.cancelAtPeriodEnd ? '恢复续费' : '取消续费'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoices History Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-3 p-5">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>商业账单发票记录 (Commercial Invoice Records)</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">发票编号 #</th>
                    <th className="px-4 py-3">客户邮箱</th>
                    <th className="px-4 py-3">购买套餐明细</th>
                    <th className="px-4 py-3">结算金额</th>
                    <th className="px-4 py-3">支付状态</th>
                    <th className="px-4 py-3 text-right">开票时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-emerald-400">{inv.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{inv.userEmail}</td>
                      <td className="px-4 py-3 text-slate-200">{inv.planName}</td>
                      <td className="px-4 py-3 font-mono font-bold text-white">${inv.amount} {inv.currency}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                          {inv.status === 'paid' ? '已支付' : inv.status === 'open' ? '待付款' : inv.status === 'refunded' ? '已退款' : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">{inv.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= SECTION 4: Payment Gateways (PayPal & Stripe) ================= */}
      {activeSubSection === 'payments' && (
        <form
          onSubmit={handleSavePaymentConfig}
          className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6 text-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>支付网关集成与密钥配置 (PayPal &amp; Stripe)</span>
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                前端环境测试与调试设置。留空状态下前台结账安全运行在沙箱测试模式。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold cursor-pointer transition-colors"
              >
                {showSecrets ? '隐藏机密密钥' : '显示明文密钥'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/25 transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存网关配置</span>
              </button>
            </div>
          </div>

          {/* Architecture & Security Notice */}
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] flex-1">
              <div className="flex items-center justify-between">
                <strong className="text-white text-xs block">
                  架构与安全警示（前端沙箱模式说明）：
                </strong>
                {backendStatus?.isOnline ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                    ● 服务端已在线 (http://localhost:3001)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono">
                    ○ 纯前端单机演示运行中 (终端运行 npm run server 可激活)
                  </span>
                )}
              </div>
              <p className="text-amber-200/90">
                当前项目属于客户端单页应用，敏感密钥暂保存在浏览器端本地缓存中。
                <strong>请切勿在开放公开网络部署的前端页面中输入真实生产环境私钥（如 Stripe Secret Key、PayPal Client Secret）。</strong>
              </p>
              <p className="text-amber-300/80">
                正式商用环境需部署安全服务端（如 Cloudflare Workers / Node.js BFF）托管机密，并通过官方 Webhook 签名验签以保障资金安全。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PayPal Subscriptions Configuration Card */}
            <div className="p-5 bg-slate-950/80 border border-blue-500/30 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg font-black italic text-sm">
                    P
                  </span>
                  <div>
                    <h4 className="font-bold text-white text-sm">PayPal Subscriptions 官方订阅 API</h4>
                    <p className="text-[11px] text-blue-300/70">支持自动循环扣款与 Vault 金库托管</p>
                  </div>
                </div>

                {/* Sandbox / Live Mode Switch */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 border border-slate-800 rounded-xl text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPaymentConfig({ ...paymentConfig, paypalMode: 'sandbox' })}
                    className={`px-2.5 py-0.5 rounded-lg font-bold cursor-pointer transition-all ${
                      paymentConfig.paypalMode === 'sandbox'
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    沙箱环境 (Sandbox)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentConfig({ ...paymentConfig, paypalMode: 'live' })}
                    className={`px-2.5 py-0.5 rounded-lg font-bold cursor-pointer transition-all ${
                      paymentConfig.paypalMode === 'live'
                        ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    生产环境 (Live)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  PayPal Client ID 客户端标识 <span className="text-slate-500">(前端 PayPal SDK Button 必需)</span>
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={paymentConfig.paypalClientId}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paypalClientId: e.target.value })}
                  placeholder="留空即走安全沙箱测试，或粘贴 PayPal Client ID..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    PayPal Client Secret 密钥 (服务端专属凭据)
                  </label>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                    已禁用前端存储
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  安全规范要求：PayPal Client Secret 涉及商家资金结算权限，严禁在浏览器端存储。请配置于后端服务端环境变量中（如 <code className="text-blue-300 font-mono">PAYPAL_CLIENT_SECRET</code>），前端仅需配置用于渲染按钮的 Client ID 与 Plan ID。
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                  <span>PayPal 循环订阅 Plan ID 对应表 (在 PayPal 商家后台生成)</span>
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Pro 月度 Plan ID</label>
                    <input
                      type="text"
                      value={paymentConfig.paypalProMonthlyPlanId}
                      onChange={(e) =>
                        setPaymentConfig({ ...paymentConfig, paypalProMonthlyPlanId: e.target.value })
                      }
                      placeholder="例如 P-5ML427..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Pro 年度 Plan ID</label>
                    <input
                      type="text"
                      value={paymentConfig.paypalProYearlyPlanId}
                      onChange={(e) =>
                        setPaymentConfig({ ...paymentConfig, paypalProYearlyPlanId: e.target.value })
                      }
                      placeholder="例如 P-8UY912..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Enterprise 月度 Plan ID</label>
                    <input
                      type="text"
                      value={paymentConfig.paypalEnterpriseMonthlyPlanId}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          paypalEnterpriseMonthlyPlanId: e.target.value,
                        })
                      }
                      placeholder="例如 P-3LK882..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Enterprise 年度 Plan ID</label>
                    <input
                      type="text"
                      value={paymentConfig.paypalEnterpriseYearlyPlanId}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          paypalEnterpriseYearlyPlanId: e.target.value,
                        })
                      }
                      placeholder="例如 P-1ZA004..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-950/30 border border-blue-500/20 rounded-xl text-[11px] text-blue-200/80 leading-relaxed">
                <strong>PayPal 循环订阅快速接入流程：</strong>
                <ol className="list-decimal pl-4 mt-1 space-y-0.5 text-slate-300">
                  <li>访问 developer.paypal.com &gt; Apps &amp; Credentials &gt; 创建应用并复制 Client ID。</li>
                  <li>前往 PayPal 商家后台 &gt; Pay &amp; Get Paid &gt; Subscriptions &gt; 创建周期计划 (Plan)。</li>
                  <li>复制以 <code className="text-cyan-300">P-</code> 开头的 Plan ID 填入上方对应周期即可。</li>
                </ol>
              </div>
            </div>

            {/* Stripe Subscriptions Configuration Card */}
            <div className="p-5 bg-slate-950/80 border border-cyan-500/30 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg font-black text-sm">
                    S
                  </span>
                  <div>
                    <h4 className="font-bold text-white text-sm">Stripe 国际银行卡支付与账单</h4>
                    <p className="text-[11px] text-cyan-300/70">支持全球信用卡、Apple Pay、Google Pay</p>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-full font-mono">
                  v3 官方 SDK
                </span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  Stripe Publishable Key 公钥 <span className="text-slate-500">(pk_live_... 或 pk_test_...)</span>
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={paymentConfig.stripePublishableKey}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, stripePublishableKey: e.target.value })}
                  placeholder="留空即走安全沙箱测试，或粘贴 pk_test/pk_live..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 text-xs font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    Stripe Secret Key 与 Webhook Secret (服务端专属凭据)
                  </label>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                    已禁用前端存储
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  安全规范要求：Stripe Secret Key (<code className="text-cyan-300 font-mono">sk_live_...</code>) 与 Webhook Secret (<code className="text-cyan-300 font-mono">whsec_...</code>) 具有资金退款与账户最高权限，前端界面已彻底禁用明文输入与本地保存。请配置于服务端环境变量（如 <code className="text-cyan-300 font-mono">STRIPE_SECRET_KEY</code> 与 <code className="text-cyan-300 font-mono">STRIPE_WEBHOOK_SECRET</code>），前端仅需配置用于渲染结账界面的 Publishable Key 与 Price ID。
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Stripe 循环计费 Price ID 对应表 (在 Stripe 产品目录中创建)</span>
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Pro 月度 Price ID</label>
                    <input
                      type="text"
                      value={paymentConfig.stripeProMonthlyPriceId}
                      onChange={(e) =>
                        setPaymentConfig({ ...paymentConfig, stripeProMonthlyPriceId: e.target.value })
                      }
                      placeholder="例如 price_1N4k..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Pro 年度 Price ID</label>
                    <input
                      type="text"
                      value={paymentConfig.stripeProYearlyPriceId}
                      onChange={(e) =>
                        setPaymentConfig({ ...paymentConfig, stripeProYearlyPriceId: e.target.value })
                      }
                      placeholder="例如 price_1N4m..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Enterprise 月度 Price ID</label>
                    <input
                      type="text"
                      value={paymentConfig.stripeEnterpriseMonthlyPriceId}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          stripeEnterpriseMonthlyPriceId: e.target.value,
                        })
                      }
                      placeholder="例如 price_1N4x..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Enterprise 年度 Price ID</label>
                    <input
                      type="text"
                      value={paymentConfig.stripeEnterpriseYearlyPriceId}
                      onChange={(e) =>
                        setPaymentConfig({
                          ...paymentConfig,
                          stripeEnterpriseYearlyPriceId: e.target.value,
                        })
                      }
                      placeholder="例如 price_1N4z..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ================= SECTION 5: Billing & Pricing Rules ================= */}
      {activeSubSection === 'billing' && (
        <form
          onSubmit={handleSaveBilling}
          className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>商业计费规则与积分费率配置</span>
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                自定义配置各级会员额度、每月配发积分、以及各分辨率画质生图的积分扣减费率。
              </p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/25 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存计费规则</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>套餐配额与积分额度</span>
              </h4>

              <div>
                <label className="block text-slate-300 mb-1">免费体验版每月赠送积分 (Credits)</label>
                <input
                  type="number"
                  min={0}
                  value={billingConfig.freeMonthlyCredits}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, freeMonthlyCredits: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Pro 专业版月费价格 (美元 $)</label>
                <input
                  type="number"
                  min={0}
                  value={billingConfig.proMonthlyPriceUsd}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, proMonthlyPriceUsd: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Pro 专业版每月配发积分 (Credits)</label>
                <input
                  type="number"
                  min={0}
                  value={billingConfig.proMonthlyCredits}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, proMonthlyCredits: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>各分辨率画质积分消耗规则</span>
              </h4>

              <div>
                <label className="block text-slate-300 mb-1">1K 标清画质扣除积分 (Credits)</label>
                <input
                  type="number"
                  min={1}
                  value={billingConfig.creditCostPer1K}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, creditCostPer1K: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">2K 高清画质扣除积分 (Credits)</label>
                <input
                  type="number"
                  min={1}
                  value={billingConfig.creditCostPer2K}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, creditCostPer2K: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">4K 超高清 UHD 扣除积分 (Credits)</label>
                <input
                  type="number"
                  min={1}
                  value={billingConfig.creditCostPer4K}
                  onChange={(e) =>
                    setBillingConfig({ ...billingConfig, creditCostPer4K: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ================= SECTION 6: Security & Admin Password Management ================= */}
      {activeSubSection === 'security' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <form
            onSubmit={handleChangePassword}
            className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-5 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-cyan-500/20 text-cyan-300 rounded-lg font-bold">
                  <Key className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-sm">修改管理员登录凭据</h3>
                  <p className="text-slate-400 text-[11px]">
                    更新解锁此系统管理控制台的最高身份验证凭据（账号与主密码）
                  </p>
                </div>
              </div>
            </div>

            {pwdErrorMsg && (
              <div className="p-3 bg-rose-950/50 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pwdErrorMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">管理员账号名</label>
                <input
                  type="text"
                  required
                  value={adminUsernameEdit}
                  onChange={(e) => setAdminUsernameEdit(e.target.value)}
                  placeholder="请输入管理员账号或邮箱..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">当前旧密码</label>
                <input
                  type="password"
                  required
                  value={currentPwdInput}
                  onChange={(e) => setCurrentPwdInput(e.target.value)}
                  placeholder="请输入当前旧密码以验证身份..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">新主密码（至少 6 个字符）</label>
                <input
                  type="password"
                  required
                  value={newPwdInput}
                  onChange={(e) => setNewPwdInput(e.target.value)}
                  placeholder="请输入新主密码..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">确认新主密码</label>
                <input
                  type="password"
                  required
                  value={confirmNewPwdInput}
                  onChange={(e) => setConfirmNewPwdInput(e.target.value)}
                  placeholder="请再次输入新密码以确认..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetDefaultPassword}
                className="text-[11px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
              >
                恢复初始默认凭据 (admin / admin888)
              </button>

              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>更新管理员凭据</span>
              </button>
            </div>
          </form>

          {/* Session Security Card */}
          <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>会话隔离与安全防护策略 (Security Policy)</span>
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc pl-4 leading-relaxed">
              <li>
                前台公共顶栏已<strong>彻底下线并隐藏 Admin 入口</strong>，普通访客无法感知后台。
              </li>
              <li>
                未登录状态下访问 <code className="text-cyan-300">/#admin</code> 将被强制阻断并触发密码门禁。
              </li>
              <li>
                关闭浏览器标签页会自动注销当前的管理员会话凭证。
              </li>
              <li>
                点击右上角<strong>登出图标</strong>可即刻锁定控制台。
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
