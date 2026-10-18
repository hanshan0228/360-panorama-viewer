import { useEffect, useRef, useState } from 'react';
import { X, User, AlertCircle, LogOut, Coins } from 'lucide-react';
import { authServerUser, paypalRequest, type PayPalConfig } from '../../utils/commercialApi';
import type { ManagedUser } from '../../types/panorama';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ManagedUser;
  onAuthSuccess: (user: ManagedUser, action?: 'login' | 'register') => void;
  initialMode?: 'login' | 'register';
  trialCredits?: number;
  continueToCheckout?: boolean;
  checkoutIntent?: { plan: 'pro' | 'enterprise'; cycle: 'monthly' | 'yearly' } | null;
}

export function UserAuthModal({ isOpen, onClose, currentUser, onAuthSuccess, initialMode = 'login', trialCredits = 4, continueToCheckout = false, checkoutIntent = null }: UserAuthModalProps) {
  const [isRegisterMode, setIsRegisterMode] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pricing, setPricing] = useState<PayPalConfig | null>(null);
  const [pricingError, setPricingError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const isGuest = currentUser.id.startsWith('usr_guest');
  const isLoggedIn = !isGuest && typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('panorama_server_user_token'));

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    if (!isLoggedIn) emailRef.current?.focus();
    return () => {
      requestRef.current?.abort();
      dialog.close();
      previousFocus?.focus();
    };
  }, [isOpen, currentUser.id, isLoggedIn]);

  useEffect(() => {
    if (!isOpen || !checkoutIntent) return;
    let active = true;
    paypalRequest<PayPalConfig>('config').then(config => { if (active) setPricing(config); })
      .catch(() => { if (active) setPricingError(true); });
    return () => { active = false; };
  }, [isOpen, checkoutIntent]);

  const closeDialog = () => {
    requestRef.current?.abort();
    setPassword('');
    setShowPassword(false);
    setErrorMsg(null);
    setLoading(false);
    onClose();
  };

  const switchMode = (register: boolean) => {
    setIsRegisterMode(register);
    setPassword('');
    setShowPassword(false);
    setErrorMsg(null);
    emailRef.current?.focus();
  };

  const handleLogout = () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('panorama_server_user_token');
    const guestUser: ManagedUser = {
      id: 'usr_guest', email: 'guest@360panoramaviewer.com', name: 'Free Trial Guest', plan: 'free',
      creditsBalance: 0, creditsTotal: 0, status: 'active', joinedAt: new Date().toISOString().split('T')[0],
      lastActiveAt: 'Just now', apiCallsCount: 0,
    };
    onAuthSuccess(guestUser);
    window.dispatchEvent(new Event('panorama-session-changed'));
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErrorMsg('Enter a valid email address.'); return; }
    if (!password || password.length > 1024 || (isRegisterMode && password.length < 6)) { setErrorMsg(isRegisterMode ? 'Use a password between 6 and 1024 characters.' : 'Enter your account password (up to 1024 characters).'); return; }
    const request = new AbortController();
    requestRef.current?.abort();
    requestRef.current = request;
    setLoading(true);
    try {
      const result = await authServerUser(email.trim(), isRegisterMode ? name.trim() || undefined : undefined, password, { mode: isRegisterMode ? 'register' : 'login', signal: request.signal });
      if (request.signal.aborted) return;
      if (!result.success || !result.user) { setErrorMsg(result.error || (isRegisterMode ? 'Unable to create your account. Please try again.' : 'Unable to sign in. Check your credentials.')); return; }
      onAuthSuccess({ ...result.user, joinedAt: result.user.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0], lastActiveAt: 'Just now', apiCallsCount: result.user.apiCallsCount || 0 }, isRegisterMode ? 'register' : 'login');
      closeDialog();
      window.dispatchEvent(new Event('panorama-session-changed'));
    } catch (error) {
      if (!request.signal.aborted) setErrorMsg(error instanceof Error ? error.message : 'Unable to reach the sign-in service.');
    } finally { if (!request.signal.aborted) setLoading(false); }
  };

  if (!isOpen) return null;
  const offer = checkoutIntent ? pricing?.plans?.[checkoutIntent.plan]?.[checkoutIntent.cycle] : null;
  return <dialog ref={dialogRef} aria-labelledby="auth-title" aria-describedby="auth-description" onCancel={event => { event.preventDefault(); closeDialog(); }}
    className="m-auto p-0 w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto bg-[#030d1d] border border-cyan-500/30 rounded-3xl text-sky-100 backdrop:bg-slate-950/80 backdrop:backdrop-blur-md">
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-start gap-3">
        <div><User className="w-6 h-6 text-cyan-300 mb-3" /><h2 id="auth-title" className="font-bold text-xl">{isLoggedIn ? 'Your account' : isRegisterMode ? 'Create your account' : 'Sign in to 360 Panorama Viewer'}</h2>
          <p id="auth-description" className="text-sm text-cyan-200/75 mt-2">{isLoggedIn ? 'Your account, plan access and available credits.' : continueToCheckout ? 'Continue with the plan below. No payment is taken when you create an account or sign in.' : isRegisterMode ? 'Start creating panoramas with a free account. No subscription required.' : 'Welcome back. Sign in to use your account credits.'}</p></div>
        <button type="button" aria-label="Close account dialog" onClick={closeDialog} className="p-2 rounded-xl hover:bg-cyan-500/15"><X className="w-5 h-5" /></button>
      </div>
      {!isLoggedIn && <div role="group" aria-label="Account access" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-cyan-500/20">
        <button type="button" disabled={loading} aria-pressed={!isRegisterMode} onClick={() => switchMode(false)} className={`py-2 rounded-lg text-sm font-bold ${!isRegisterMode ? 'bg-cyan-300 text-slate-950' : 'text-cyan-200'}`}>Sign in</button>
        <button type="button" disabled={loading} aria-pressed={isRegisterMode} onClick={() => switchMode(true)} className={`py-2 rounded-lg text-sm font-bold ${isRegisterMode ? 'bg-cyan-300 text-slate-950' : 'text-cyan-200'}`}>Create account</button>
      </div>}
      {!isLoggedIn && checkoutIntent && <section aria-label="Selected plan" className="rounded-xl border border-cyan-500/25 bg-cyan-950/30 p-3 space-y-1 text-sm">
        <p className="font-bold">{checkoutIntent.plan === 'pro' ? 'Pro Creator' : 'Studio'} · {checkoutIntent.cycle === 'yearly' ? 'Annual billing' : 'Monthly billing'}</p>
        <p>{offer ? `$${(offer.amountCents / 100).toFixed(2)} USD charged ${checkoutIntent.cycle === 'yearly' ? 'each year' : 'each month'} · ${offer.credits.toLocaleString('en-US')} credits per payment` : pricingError || pricing ? 'Price will be confirmed in checkout. Signing in does not start a subscription.' : 'Loading the selected plan price...'}</p>
        {offer && <p className="text-xs text-cyan-200/75">Automatically renews until cancelled. You approve payment on PayPal after signing in.</p>}
      </section>}
      {isLoggedIn ? <div className="space-y-4">
        <dl className="rounded-2xl border border-cyan-500/25 bg-slate-950 p-4 space-y-3 text-sm">
          <div><dt className="text-slate-400">Name</dt><dd className="text-white break-words">{currentUser.name}</dd></div>
          <div><dt className="text-slate-400">Email</dt><dd className="text-white break-all">{currentUser.email}</dd></div>
          <div><dt className="text-slate-400">Plan access</dt><dd className="text-cyan-300 capitalize">{currentUser.plan === 'enterprise' ? 'Studio' : currentUser.plan}</dd></div>
          <div><dt className="text-slate-400">Available credits</dt><dd className="text-amber-300 flex items-center gap-2"><Coins className="w-4 h-4" />{currentUser.creditsBalance.toLocaleString('en-US')} credits</dd></div>
        </dl>
        <button type="button" onClick={handleLogout} className="w-full py-3 rounded-xl border border-rose-500/40 text-rose-200 flex justify-center items-center gap-2"><LogOut className="w-4 h-4" />Sign out</button>
      </div> : <form onSubmit={handleSubmit} className="space-y-4">
        {isRegisterMode && <p className="p-3 rounded-xl bg-cyan-950/40 text-xs text-cyan-100">Your new account starts with {trialCredits} starter credits. Guest credits are separate and are not transferred.</p>}
        {errorMsg && <p role="alert" className="text-sm text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{errorMsg}</p>}
        <div><label htmlFor="auth-email" className="block text-sm mb-1">Email address</label><input ref={emailRef} id="auth-email" type="email" required autoComplete="username" disabled={loading} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700" /></div>
        <div><label htmlFor="auth-password" className="block text-sm mb-1">Password</label><div className="relative"><input id="auth-password" type={showPassword ? 'text' : 'password'} required minLength={isRegisterMode ? 6 : undefined} maxLength={1024} autoComplete={isRegisterMode ? 'new-password' : 'current-password'} disabled={loading} value={password} onChange={event => setPassword(event.target.value)} placeholder={isRegisterMode ? 'At least 6 characters' : 'Your password'} className="w-full p-3 pr-16 rounded-xl bg-slate-950 border border-slate-700" /><button type="button" disabled={loading} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="auth-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3 text-sm text-cyan-200">{showPassword ? 'Hide' : 'Show'}</button></div></div>
        {isRegisterMode && <details className="text-sm text-cyan-200"><summary className="cursor-pointer">Add a name (optional)</summary><label htmlFor="auth-name" className="block mt-2 mb-1">Name</label><input id="auth-name" maxLength={80} autoComplete="name" disabled={loading} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700" /></details>}
        <button type="submit" disabled={loading} className="w-full py-3 bg-cyan-300 rounded-xl font-bold text-slate-950 disabled:opacity-50">{loading ? isRegisterMode ? 'Creating account...' : 'Signing in...' : isRegisterMode ? continueToCheckout ? 'Create account & continue' : 'Create free account' : continueToCheckout ? 'Sign in & continue' : 'Sign in'}</button>
        {!isRegisterMode && <details className="text-xs text-cyan-200/75"><summary className="cursor-pointer">Trouble signing in?</summary><p className="pt-2">Check your email address and password. Self-service password reset is not available yet.</p></details>}
      </form>}
    </div>
  </dialog>;
}
