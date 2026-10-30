import { useTranslation } from '../../utils/i18n';
import { generatorMessages } from '../../utils/generatorTranslations';
import { useEffect, useRef, useState } from 'react';
import { X, User, AlertCircle, LogOut, Coins } from 'lucide-react';
import { authServerUser, paypalRequest, fetchAuthConfiguration, emailVerificationRequest, type AuthConfiguration, type PayPalConfig } from '../../utils/commercialApi';
import { VerificationChallenge } from './VerificationChallenge';
import { registrationAgeError, AGE_SCREEN_DENIED, AGE_BLOCK_STORAGE_KEY } from '../../utils/registrationAge.mjs';
import type { ManagedUser } from '../../types/panorama';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorks: () => void;
  currentUser: ManagedUser;
  onAuthSuccess: (user: ManagedUser, action?: 'login' | 'register') => void;
  initialMode?: 'login' | 'register';
  trialCredits?: number;
  continueToCheckout?: boolean;
  checkoutIntent?: { plan: 'pro' | 'enterprise'; cycle: 'monthly' | 'yearly' } | null;
  initialNotice?: string;
  verificationToken?: string;
  onVerificationComplete?: () => void;
}

export function UserAuthModal({ isOpen, onClose, onOpenWorks, currentUser, onAuthSuccess, initialMode = 'login', initialNotice = '', trialCredits = 8, continueToCheckout = false, checkoutIntent = null, verificationToken = '', onVerificationComplete }: UserAuthModalProps) {
  const t = useTranslation(generatorMessages);
  const [isRegisterMode, setIsRegisterMode] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [ageChecked, setAgeChecked] = useState(false);
  const [ageScreenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [registrationBlocked, setRegistrationBlocked] = useState(() => {
    try { return Date.now() < Number(localStorage.getItem(AGE_BLOCK_STORAGE_KEY)); } catch { return false; }
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pricing, setPricing] = useState<PayPalConfig | null>(null);
  const [pricingError, setPricingError] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfiguration | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [challengeRevision, setChallengeRevision] = useState(0);
  const [notice, setNotice] = useState(initialNotice);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const isGuest = currentUser.id.startsWith('usr_guest');
  const isLoggedIn = !isGuest && typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('panorama_server_user_token'));

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchAuthConfiguration(controller.signal).then(config => {
      if (!controller.signal.aborted) setAuthConfig(config);
    }).catch(() => {
      if (!controller.signal.aborted) setAuthConfig({ registrationAvailable: false, turnstileSiteKey: '' });
    });
    return () => controller.abort();
  }, [isOpen]);

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
    setBirthDate('');
    setAgeChecked(false);
    setShowPassword(false);
    setErrorMsg(null);
    setLoading(false);
    onClose();
  };

  const switchMode = (register: boolean) => {
    setIsRegisterMode(register);
    setAgeChecked(false);
    setBirthDate('');
    setNotice('');
    setTurnstileToken('');
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
    if (isRegisterMode) {
      if (registrationBlocked) { setErrorMsg(t(AGE_SCREEN_DENIED)); return; }
      const ageError = registrationAgeError(birthDate);
      if (ageError) {
        if (ageError === AGE_SCREEN_DENIED) {
          const until = Date.now() + 86400000;
          setRegistrationBlocked(true);
          try { localStorage.setItem(AGE_BLOCK_STORAGE_KEY, String(until)); } catch { /* In-memory block still applies when storage is unavailable. */ }
          setBirthDate('');
          setEmail(''); setName(''); setPassword('');
        }
        setErrorMsg(t(ageError));
        return;
      }
      if (!ageChecked) {
        setAgeChecked(true);
        requestAnimationFrame(() => emailRef.current?.focus());
        return;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErrorMsg(t("Enter a valid email address.")); return; }
    if (!password || password.length > 1024 || (isRegisterMode && password.length < 6)) { setErrorMsg(isRegisterMode ? t("Use a password between 6 and 1024 characters.") : t("Enter your account password (up to 1024 characters).")); return; }
    if (isRegisterMode && (!authConfig?.registrationAvailable || !turnstileToken)) { setErrorMsg(t('Complete the security check and try again.')); return; }
    const request = new AbortController();
    requestRef.current?.abort();
    requestRef.current = request;
    setLoading(true);
    try {
      const result = await authServerUser(email.trim(), isRegisterMode ? name.trim() || undefined : undefined, password, { mode: isRegisterMode ? 'register' : 'login', signal: request.signal, turnstileToken, birthDate: isRegisterMode ? birthDate : undefined });
      if (request.signal.aborted) return;
      if (!result.success || !result.user) { setErrorMsg(result.error || (isRegisterMode ? t("Unable to create your account. Please try again.") : t("Unable to sign in. Check your credentials."))); return; }
      setPassword('');
      setBirthDate('');
      setAgeChecked(false);
      setLoading(false);
      if (isRegisterMode) setNotice(result.verificationSent ? 'Verification email sent. Check your inbox and spam folder.' : 'Your account was created, but the verification email could not be sent. Please try resending it.');
      onAuthSuccess({ ...result.user, joinedAt: result.user.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0], lastActiveAt: 'Just now', apiCallsCount: result.user.apiCallsCount || 0 }, isRegisterMode ? 'register' : 'login');
      if (!isRegisterMode || continueToCheckout) closeDialog();
      window.dispatchEvent(new Event('panorama-session-changed'));
    } catch (error) {
      if (!request.signal.aborted) setErrorMsg(error instanceof Error ? error.message : t("Unable to reach the sign-in service."));
    } finally {
      if (!request.signal.aborted) setLoading(false);
      setTurnstileToken('');
      setChallengeRevision(value => value + 1);
    }
  };

  const handleVerification = async () => {
    if (loading) return;
    const request = new AbortController();
    requestRef.current?.abort();
    requestRef.current = request;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await emailVerificationRequest(verificationToken ? { token: verificationToken } : { turnstileToken }, request.signal);
      if (request.signal.aborted) return;
      if (verificationToken || result.alreadyVerified) {
        setNotice(result.creditsGranted ? t('Email verified. {credits} starter credits have been added.').replace('{credits}', String(result.creditsGranted)) : t('Email verified. You can sign in to use your account.'));
        onVerificationComplete?.();
      } else setNotice('Verification email sent. Check your inbox and spam folder.');
    } catch (error) {
      if (!request.signal.aborted) setErrorMsg(error instanceof Error ? error.message : 'Verification is temporarily unavailable. Please try again later.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
      setTurnstileToken('');
      setChallengeRevision(value => value + 1);
    }
  };

  if (!isOpen) return null;
  const offer = checkoutIntent ? pricing?.plans?.[checkoutIntent.plan]?.[checkoutIntent.cycle] : null;
  return <dialog ref={dialogRef} aria-labelledby="auth-title" aria-describedby="auth-description" onCancel={event => { event.preventDefault(); closeDialog(); }}
    className="app-dialog p-0 max-w-md bg-[#030d1d] border border-cyan-500/30 rounded-3xl text-sky-100 backdrop:bg-slate-950/80 backdrop:backdrop-blur-md">
    <div className="auth-dialog-content p-6 space-y-5">
      <div className="flex justify-between items-start gap-3">
        <div><User className="w-6 h-6 text-cyan-300 mb-3" /><h2 id="auth-title" className="font-bold text-xl">{verificationToken ? t('Verify your email') : isLoggedIn ? t("Your account") : isRegisterMode ? t("Create your account") : t("Sign in to 360 Panorama Viewer")}</h2>
          <p id="auth-description" className="text-sm text-cyan-200/75 mt-2">{verificationToken ? t('Confirm your email address to activate your account.') : isLoggedIn ? t("Your account, plan access and available credits.") : continueToCheckout ? t("Continue with the plan below. No payment is taken when you create an account or sign in.") : isRegisterMode ? t("Start creating panoramas with a free account. No subscription required.") : t("Welcome back. Sign in to use your account credits.")}</p></div>
        <button type="button" aria-label={t("Close account dialog")} onClick={closeDialog} className="p-2 rounded-xl hover:bg-cyan-500/15"><X className="w-5 h-5" /></button>
      </div>
      {!isLoggedIn && !verificationToken && <div role="group" aria-label={t("Account access")} className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-cyan-500/20">
        <button type="button" disabled={loading} aria-pressed={!isRegisterMode} onClick={() => switchMode(false)} className={`py-2 rounded-lg text-sm font-bold ${!isRegisterMode ? 'bg-cyan-300 text-slate-950' : 'text-cyan-200'}`}>{t("Sign in")}</button>
        <button type="button" disabled={loading} aria-pressed={isRegisterMode} onClick={() => switchMode(true)} className={`py-2 rounded-lg text-sm font-bold ${isRegisterMode ? 'bg-cyan-300 text-slate-950' : 'text-cyan-200'}`}>{t("Create account")}</button>
      </div>}
      {!isLoggedIn && !verificationToken && checkoutIntent && <section aria-label={t("Selected plan")} className="rounded-xl border border-cyan-500/25 bg-cyan-950/30 p-3 space-y-1 text-sm">
        <p className="font-bold">{checkoutIntent.plan === 'pro' ? 'Pro Creator' : 'Studio'} · {checkoutIntent.cycle === 'yearly' ? t("Annual billing") : t("Monthly billing")}</p>
        <p>{offer ? t("{amount} USD charged {cycle} · {credits} credits per payment").replace("{amount}", () => `$${(offer.amountCents / 100).toFixed(2)}`).replace("{cycle}", () => String(checkoutIntent.cycle === 'yearly' ? t('each year') : t('each month'))).replace("{credits}", () => String(offer.credits.toLocaleString())) : pricingError || pricing ? t("Price will be confirmed in checkout. Signing in does not start a subscription.") : t("Loading the selected plan price...")}</p>
        {offer && <p className="text-xs text-cyan-200/75">{t("Automatically renews until cancelled. You approve payment on PayPal after signing in.")}</p>}
      </section>}
      {notice && <p role="status" className="text-sm text-cyan-100">{t(notice)}</p>}
      {errorMsg && <p role="alert" className="text-sm text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{t(errorMsg)}</p>}
      {verificationToken ? <button type="button" disabled={loading} onClick={handleVerification} className="w-full py-3 rounded-xl bg-cyan-300 text-slate-950 font-bold disabled:opacity-50">{loading ? t('Verifying…') : t('Verify email')}</button> : isLoggedIn ? <div className="space-y-4">
        {!currentUser.emailVerified && <section className="rounded-xl border border-cyan-500/25 p-4 space-y-3">
          <p className="text-sm">{t('Verify your email before using free AI generation. Existing credits will be kept.')}</p>
          {authConfig?.registrationAvailable ? <>
            <VerificationChallenge key={challengeRevision} siteKey={authConfig.turnstileSiteKey} action="verify-email" onToken={setTurnstileToken} />
            <button type="button" onClick={handleVerification} disabled={loading || !turnstileToken} className="min-h-11 w-full rounded-xl bg-cyan-300 p-3 font-bold text-slate-950 disabled:opacity-50">{loading ? t('Sending…') : t('Resend verification email')}</button>
            <p className="text-xs text-cyan-200/75">{t('You can request another email after 60 seconds.')}</p>
          </> : <p className="text-sm">{t('Account verification is temporarily unavailable. Please try again later.')}</p>}
        </section>}

        <dl className="rounded-2xl border border-cyan-500/25 bg-slate-950 p-4 space-y-3 text-sm">
          <div><dt className="text-slate-400">{t("Name")}</dt><dd className="text-white break-words">{currentUser.name}</dd></div>
          <div><dt className="text-slate-400">{t("Email")}</dt><dd className="text-white break-all">{currentUser.email}</dd></div>
          <div><dt className="text-slate-400">{t("Plan access")}</dt><dd className="text-cyan-300 capitalize">{currentUser.plan === 'enterprise' ? 'Studio' : t(currentUser.plan)}</dd></div>
          <div><dt className="text-slate-400">{t("Available credits")}</dt><dd className="text-amber-300 flex items-center gap-2"><Coins className="w-4 h-4" />{currentUser.creditsBalance.toLocaleString('en-US')} {t("credits")}</dd></div>
        </dl>
        <button type="button" onClick={onOpenWorks} className="w-full min-h-11 rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">{t('My works')}</button>
        <button type="button" onClick={handleLogout} className="w-full py-3 rounded-xl border border-rose-500/40 text-rose-200 flex justify-center items-center gap-2"><LogOut className="w-4 h-4" />{t("Sign out")}</button>
      </div> : isRegisterMode && registrationBlocked ? <p role="status">{t(AGE_SCREEN_DENIED)}</p> : <form onSubmit={handleSubmit} className="space-y-4">
        {isRegisterMode && !ageChecked ? <>
          <div><label htmlFor="auth-birth-date" className="block text-sm mb-1">{t('Date of birth')}</label><input id="auth-birth-date" type="date" required min="1900-01-01" max={ageScreenDate} autoComplete="bday" value={birthDate} onChange={event => setBirthDate(event.target.value)} aria-describedby="auth-age-description" className="w-full min-w-0 p-3 rounded-xl bg-slate-950 border border-slate-700" /></div>
          <p id="auth-age-description" className="text-sm text-cyan-200">{t('We check registration eligibility before asking for account details. Your date of birth is checked again when you register and is not saved in your account.')}</p>
          <button type="submit" className="w-full py-3 bg-cyan-300 rounded-xl font-bold text-slate-950">{t('Continue')}</button>
        </> : <>
        {isRegisterMode && <p className="p-3 rounded-xl bg-cyan-950/40 text-xs text-cyan-100">{t("Register and verify your email to receive {credits} starter credits once. Network and daily trial limits apply.").replace("{credits}", () => String(trialCredits))}</p>}
        <div><label htmlFor="auth-email" className="block text-sm mb-1">{t("Email address")}</label><input ref={emailRef} id="auth-email" type="email" required autoComplete="username" disabled={loading} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700" /></div>
        <div><label htmlFor="auth-password" className="block text-sm mb-1">{t("Password")}</label><div className="relative"><input id="auth-password" type={showPassword ? 'text' : 'password'} required minLength={isRegisterMode ? 6 : undefined} maxLength={1024} autoComplete={isRegisterMode ? 'new-password' : 'current-password'} disabled={loading} value={password} onChange={event => setPassword(event.target.value)} placeholder={isRegisterMode ? t("At least 6 characters") : t("Your password")} className="w-full p-3 pr-16 rounded-xl bg-slate-950 border border-slate-700" /><button type="button" disabled={loading} aria-label={showPassword ? t("Hide password") : t("Show password")} aria-controls="auth-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-1 bottom-1 min-w-14 px-2 text-sm text-cyan-200">{showPassword ? t("Hide") : t("Show")}</button></div></div>
        {isRegisterMode && <details className="text-sm text-cyan-200"><summary className="cursor-pointer">{t("Add a name (optional)")}</summary><label htmlFor="auth-name" className="block mt-2 mb-1">{t("Name")}</label><input id="auth-name" maxLength={80} autoComplete="name" disabled={loading} value={name} onChange={event => setName(event.target.value)} placeholder={t("Your name")} className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700" /></details>}
        {isRegisterMode && (authConfig?.registrationAvailable
          ? <VerificationChallenge key={challengeRevision} siteKey={authConfig.turnstileSiteKey} action="register" onToken={setTurnstileToken} />
          : <p role="status" className="text-sm text-cyan-200">{t('Account verification is temporarily unavailable. Please try again later.')}</p>)}
        <button type="submit" disabled={loading || (isRegisterMode && (!authConfig?.registrationAvailable || !turnstileToken))} className="w-full py-3 bg-cyan-300 rounded-xl font-bold text-slate-950 disabled:opacity-50">{loading ? isRegisterMode ? t("Creating account...") : t("Signing in...") : isRegisterMode ? continueToCheckout ? t("Create account & continue") : t("Create free account") : continueToCheckout ? t("Sign in & continue") : t("Sign in")}</button>
        {isRegisterMode && <p className="text-[11px] text-cyan-200/60 pt-1 text-center"><a href="/terms/" target="_blank" rel="noopener noreferrer" className="underline text-cyan-300 hover:text-white">{t("Terms of Service")}</a>{" · "}<a href="/privacy/" target="_blank" rel="noopener noreferrer" className="underline text-cyan-300 hover:text-white">{t("Privacy Policy")}</a></p>}
        {!isRegisterMode && <details className="text-xs text-cyan-200/75"><summary className="cursor-pointer">{t("Trouble signing in?")}</summary><p className="pt-2">{t("Check your email address and password. Self-service password reset is not available yet.")} <a href="mailto:support@360panoramaviewer.com?subject=Account%20Recovery" className="underline text-cyan-200">{'support@360panoramaviewer.com'}</a></p></details>}
        </>}
      </form>}
    </div>
  </dialog>;
}
