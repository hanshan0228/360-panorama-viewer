import { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, Lock } from 'lucide-react';
import type { ManagedUser } from '../../types/panorama';
import { paypalRequest, type PayPalConfig, type PayPalSubscription } from '../../utils/commercialApi';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: 'pro' | 'enterprise';
  initialCycle?: 'monthly' | 'yearly';
  currentUser: ManagedUser;
  onSignIn?: () => void;
}

export function CheckoutModal({ isOpen, onClose, initialPlan = 'pro', initialCycle = 'monthly', currentUser, onSignIn }: CheckoutModalProps) {
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);
  const [billingCycle, setBillingCycle] = useState(initialCycle);
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [subscription, setSubscription] = useState<PayPalSubscription | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sessionRef = useRef<{ token: string | null; active: boolean }>({ token: null, active: false });
  const needsSignIn = !currentUser || currentUser.id.startsWith('usr_guest') || (typeof localStorage !== 'undefined' && !localStorage.getItem('panorama_server_user_token'));

  const isCurrentSession = (session: typeof sessionRef.current) => session.active && session === sessionRef.current &&
    session.token === localStorage.getItem('panorama_server_user_token');

  const applySubscription = (value: PayPalSubscription | null) => {
    setSubscription(value);
    if (value && !['CANCELLED', 'EXPIRED'].includes(value.status)) {
      setSelectedPlan(value.plan);
      setBillingCycle(value.billingCycle);
    }
    setSubscriptionLoaded(true);
  };

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const session = { token: localStorage.getItem('panorama_server_user_token'), active: true };
    sessionRef.current = session;
    const checkSession = () => {
      if (!session.active || session !== sessionRef.current) return;
      if (isCurrentSession(session)) return;
      setSessionChanged(true);
      setSubscription(null);
      setSubscriptionLoaded(false);
      setError('Account changed. Close and reopen checkout.');
    };
    window.addEventListener('storage', checkSession);
    window.addEventListener('focus', checkSession);
    window.addEventListener('panorama-session-changed', checkSession);
    setSelectedPlan(initialPlan);
    setBillingCycle(initialCycle);
    setConfig(null);
    setSubscription(null);
    setSubscriptionLoaded(false);
    setSessionChanged(false);
    setIsProcessing(false);
    setError('');
    paypalRequest<PayPalConfig>('config', undefined, session.token).then(result => {
      if (!isCurrentSession(session)) { checkSession(); return; }
      setConfig(result);
      if (result.enabled && session.token && !needsSignIn) {
        return paypalRequest<{ subscription: PayPalSubscription | null }>('subscription', undefined, session.token).then(result => {
          if (isCurrentSession(session)) applySubscription(result.subscription);
          else checkSession();
        });
      }
      setSubscriptionLoaded(true);
    }).catch(error => { if (isCurrentSession(session)) setError(error instanceof Error ? error.message : 'Payment server unavailable'); });
    return () => {
      session.active = false;
      window.removeEventListener('storage', checkSession);
      window.removeEventListener('focus', checkSession);
      window.removeEventListener('panorama-session-changed', checkSession);
      dialog.close();
      previousFocus?.focus();
    };
  }, [isOpen, initialPlan, initialCycle, needsSignIn, currentUser?.id]);

  const handleSubscribe = async () => {
    if (needsSignIn) { onSignIn?.(); return; }
    if (isProcessing) return;
    const session = sessionRef.current;
    setIsProcessing(true);
    setError('');
    try {
      if (!isCurrentSession(session)) throw new Error('Account changed. Close and reopen checkout.');
      const result = await paypalRequest<{ approvalUrl: string }>('create-subscription', { plan: selectedPlan, billingCycle }, session.token);
      if (!isCurrentSession(session)) return;
      const destination = new URL(result.approvalUrl);
      if (destination.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(destination.hostname)) throw new Error('Invalid PayPal approval URL');
      window.location.assign(destination.href);
    } catch (error) { if (session.active && session === sessionRef.current) setError(error instanceof Error ? error.message : 'PayPal checkout failed'); }
    finally { if (session.active && session === sessionRef.current) setIsProcessing(false); }
  };

  const handleRefresh = async () => {
    if (needsSignIn) return;
    const session = sessionRef.current;
    setIsProcessing(true);
    setError('');
    try {
      if (!isCurrentSession(session)) throw new Error('Account changed. Close and reopen checkout.');
      const result = await paypalRequest<{ subscription: PayPalSubscription | null }>('subscription', undefined, session.token);
      if (!isCurrentSession(session)) return;
      applySubscription(result.subscription);
      window.dispatchEvent(new Event('panorama-payment-updated'));
    } catch (error) { if (session.active && session === sessionRef.current) setError(error instanceof Error ? error.message : 'Could not refresh subscription'); }
    finally { if (session.active && session === sessionRef.current) setIsProcessing(false); }
  };

  const handleCancel = async () => {
    if (isProcessing) return;
    const session = sessionRef.current;
    if (!isCurrentSession(session)) { setError('Account changed. Close and reopen checkout.'); return; }
    if (!subscription) return;
    if (!window.confirm(subscription.status === 'pending' ? 'Discard this unfinished checkout?' : 'Cancel PayPal automatic renewal? Already purchased credits will remain.')) return;
    setIsProcessing(true);
    setError('');
    try {
      await paypalRequest('cancel-subscription', { subscriptionId: subscription.id }, session.token);
      if (!isCurrentSession(session)) return;
      await handleRefresh();
    } catch (error) { if (session.active && session === sessionRef.current) setError(error instanceof Error ? error.message : 'Cancellation failed'); }
    finally { if (session.active && session === sessionRef.current) setIsProcessing(false); }
  };

  if (!isOpen) return null;
  const offer = config?.plans?.[selectedPlan]?.[billingCycle];
  const hasOpenSubscription = subscription && !['CANCELLED', 'EXPIRED'].includes(subscription.status);
  const canApprove = !hasOpenSubscription || ['pending', 'APPROVAL_PENDING'].includes(subscription!.status);

  return (
    <dialog ref={dialogRef} aria-labelledby="checkout-title" onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto p-0 w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto text-sky-100 bg-[#030d1d] border border-cyan-500/30 rounded-3xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-md">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 id="checkout-title" className="font-bold text-lg">{needsSignIn ? 'Sign in to subscribe' : hasOpenSubscription ? 'Manage your subscription' : 'Review your subscription'}</h2>
          <button type="button" aria-label="Close checkout" onClick={onClose} className="p-2 rounded-xl hover:bg-cyan-500/15"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-cyan-200/80">Approve automatic renewal securely on PayPal. No card details are entered or stored here.</p>
        {needsSignIn && <p className="text-sm text-cyan-100">Sign in or create a permanent account to keep payments and credits connected to you.</p>}
        {new URLSearchParams(window.location.search).get('paypal') === 'return' && <p role="status" className="text-sm text-amber-300">Approval is not a payment receipt. Credits appear only after PayPal confirms payment; use Refresh status below.</p>}
        {new URLSearchParams(window.location.search).get('paypal') === 'cancelled' && <p role="status" className="text-sm text-amber-300">PayPal approval was cancelled. No credits have been granted by this return page.</p>}
        {!hasOpenSubscription && <fieldset disabled={isProcessing || !subscriptionLoaded || sessionChanged || needsSignIn} className="space-y-3">
          <legend className="text-sm font-bold mb-2">Choose a plan</legend>
          <div className="flex gap-4">
            {(['pro', 'enterprise'] as const).map(plan => <label key={plan} className="flex items-center gap-2 text-sm capitalize">
              <input type="radio" name="paypal-plan" checked={selectedPlan === plan} onChange={() => setSelectedPlan(plan)} />{plan === 'pro' ? 'Pro Creator' : 'Studio & Enterprise'}
            </label>)}
          </div>
          <div className="flex gap-4">
            {(['monthly', 'yearly'] as const).map(cycle => <label key={cycle} className="flex items-center gap-2 text-sm capitalize">
              <input type="radio" name="paypal-cycle" checked={billingCycle === cycle} onChange={() => setBillingCycle(cycle)} />{cycle}
            </label>)}
          </div>
        </fieldset>}
        {offer && !hasOpenSubscription && <div className="rounded-xl border border-cyan-500/30 p-4 space-y-2">
          <p className="text-2xl font-bold">${(offer.amountCents / 100).toFixed(2)} USD / {billingCycle === 'yearly' ? 'year' : 'month'}</p>
          <p className="text-xs text-cyan-200">{offer.credits.toLocaleString()} credits per successful payment. {billingCycle === 'yearly' ? 'Twelve months of credits are issued together after the annual payment.' : 'Credits are added after each monthly payment.'}</p>
        </div>}
        {subscription && <div className="rounded-xl border border-cyan-500/30 p-4 space-y-2 text-sm">
          <p>{subscription.plan.toUpperCase()} · {subscription.billingCycle} · {subscription.status}</p>
          <p>Paid through: {subscription.paidThrough ? new Date(subscription.paidThrough).toLocaleDateString('en-US') : 'Awaiting confirmed payment'}</p>
          {subscription.status === 'ACTIVE' && <p className="text-xs text-teal-200">Automatic renewal is active. You do not need to subscribe again.</p>}
          {['APPROVED', 'APPROVAL_PENDING', 'pending'].includes(subscription.status) && <p className="text-xs text-amber-200">{subscription.status === 'APPROVED' ? 'PayPal approval is complete. Waiting for payment confirmation; credits have not been issued yet.' : 'Checkout is unfinished. Continue approval on PayPal, or refresh its status.'}</p>}
          {subscription.status === 'SUSPENDED' && <p className="text-xs text-amber-200">PayPal has paused this subscription. Check your payment method on PayPal, then refresh.</p>}
          {subscription.status === 'CANCELLED' && <p className="text-xs text-amber-200">Automatic renewal is cancelled. Purchased credits remain. Starting another subscription creates a new recurring charge.</p>}
          {hasOpenSubscription && <p className="text-xs text-slate-300">{['pending', 'APPROVAL_PENDING'].includes(subscription.status) ? 'This unfinished checkout keeps its selected plan. Resolve the approval on PayPal, then refresh before choosing another plan.' : 'To change plans or billing intervals, cancel the current renewal first. No automatic plan switch or prorated charge is applied here.'}</p>}
          {hasOpenSubscription && ['ACTIVE', 'SUSPENDED', 'APPROVED', 'pending'].includes(subscription.status) && <button type="button" disabled={isProcessing || sessionChanged} onClick={handleCancel} className="underline text-amber-300">{subscription.status === 'pending' ? 'Discard unfinished checkout' : 'Cancel automatic renewal'}</button>}
        </div>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {!config && !error && <p role="status">Loading payment configuration...</p>}
        {config && !needsSignIn && !subscriptionLoaded && !error && <p role="status">Checking your current subscription...</p>}
        {config && !config.enabled && <p role="status" className="text-amber-300 text-sm">PayPal is not configured on this server. No payment can be collected.</p>}
        <div className="flex gap-3 flex-wrap">
          {(canApprove || needsSignIn) && <button type="button" disabled={isProcessing || sessionChanged || (!needsSignIn && (!config?.enabled || !offer || !subscriptionLoaded))}
            onClick={handleSubscribe} className="px-5 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold disabled:opacity-40 flex gap-2 items-center">
            <Lock className="w-4 h-4" />{needsSignIn ? 'Sign in to continue' : isProcessing ? 'Processing...' : hasOpenSubscription ? 'Continue PayPal approval' : 'Subscribe with PayPal'}
          </button>}
          {!needsSignIn && <button type="button" disabled={!config?.enabled || isProcessing || sessionChanged} onClick={handleRefresh} className="px-4 py-3 rounded-xl border border-cyan-500/30">Refresh status</button>}
        </div>
        <p className="text-[11px] text-slate-400 flex gap-2 items-center"><ShieldCheck className="w-4 h-4" />{config?.mode === 'sandbox' ? 'Sandbox: test payments only.' : 'Recurring charges begin only after you approve on PayPal.'}</p>
      </div>
    </dialog>
  );
}
