import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  CreditCard,
  Lock,
  Sparkles,
  Zap,
  Tag,
  AlertCircle,
} from 'lucide-react';
// Collection remains disabled until server-side identity and subscription lifecycle are connected.
const PAYMENT_COLLECTION_ENABLED = false;
import type { ManagedUser, PaymentGatewayConfig } from '../../types/panorama';
import {
  getCurrentUser,
  getStoredPaymentConfig,
  getStoredBillingConfig,
} from '../../utils/adminStorage';
import { loadPayPalSdk } from '../../utils/paypalLoader';
import { probeBackendHealth, createServerStripeCheckout } from '../../utils/commercialApi';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: 'pro' | 'enterprise';
  initialCycle?: 'monthly' | 'yearly';
  onSuccess?: (updatedUser: ManagedUser) => void;
}

export function CheckoutModal({
  isOpen,
  onClose,
  initialPlan = 'pro',
  initialCycle = 'yearly',
}: CheckoutModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'enterprise'>(initialPlan);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(initialCycle);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'gpay'>('card');
  const [couponCode, setCouponCode] = useState('');
  const [isCouponApplied, setIsCouponApplied] = useState(false);
  const [couponDiscountPercent, setCouponDiscountPercent] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Payment configuration from Admin storage
  const [paymentConfig] = useState<PaymentGatewayConfig>(() => getStoredPaymentConfig());
  const [isPayPalSdkLoaded, setIsPayPalSdkLoaded] = useState(false);
  const paypalButtonRenderedRef = useRef(false);

  // Card Form State
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [cardName, setCardName] = useState(() => getCurrentUser()?.name || 'Alex Vance');

  // Checkout Processing & Success State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedDetails, setCompletedDetails] = useState<{
    plan: string;
    creditsAdded: number;
    amountPaid: number;
    nextBillingDate: string;
    method: string;
  } | null>(null);

  // Dynamic Plan Pricing Data linked with Admin Billing Configuration
  const billingConfig = getStoredBillingConfig();
  const proMonthly = billingConfig.proMonthlyPriceUsd || 19;
  const proYearlyPerMonth = 9.9;
  const proYearlyTotal = 118.8;
  const proCredits = billingConfig.proMonthlyCredits || 1000;

  const PRICING = {
    pro: {
      monthly: proMonthly,
      yearlyPerMonth: proYearlyPerMonth,
      yearlyTotal: proYearlyTotal,
      name: 'Pro Creator Plan',
      credits: proCredits,
    },
    enterprise: {
      monthly: 49,
      yearlyPerMonth: 29,
      yearlyTotal: 348,
      name: 'Studio & Enterprise Plan',
      credits: 5000,
    },
  };

  const planInfo = PRICING[selectedPlan];
  const rawTotal =
    billingCycle === 'yearly'
      ? planInfo.yearlyTotal
      : planInfo.monthly;

  const discountAmount = isCouponApplied
    ? (rawTotal * couponDiscountPercent) / 100
    : 0;

  const finalTotal = Math.max(0, rawTotal - discountAmount);

  // A browser callback is never evidence of a verified payment.
  const handleFinalizeSubscription = useCallback(() => {
    setIsProcessing(false);
    setIsCompleted(false);
    setCompletedDetails(null);
    setCouponError('支付与权益同步尚未完成，当前不收款，也不发放模拟积分。');
  }, []);

  // Active PayPal Plan ID for current selection
  const activePayPalPlanId =
    selectedPlan === 'enterprise'
      ? billingCycle === 'yearly'
        ? paymentConfig.paypalEnterpriseYearlyPlanId
        : paymentConfig.paypalEnterpriseMonthlyPlanId
      : billingCycle === 'yearly'
      ? paymentConfig.paypalProYearlyPlanId
      : paymentConfig.paypalProMonthlyPlanId;

  // Load and render official PayPal SDK buttons if Client ID is configured
  useEffect(() => {
    if (!PAYMENT_COLLECTION_ENABLED || !isOpen || paymentMethod !== 'paypal' || !paymentConfig.paypalClientId) {
      return;
    }

    let isMounted = true;
    paypalButtonRenderedRef.current = false;

    loadPayPalSdk({
      clientId: paymentConfig.paypalClientId,
      vault: true,
      intent: 'subscription',
    }).then((loaded) => {
      if (!isMounted) return;
      setIsPayPalSdkLoaded(loaded);

      if (loaded && window.paypal?.Buttons && !paypalButtonRenderedRef.current) {
        const container = document.getElementById('paypal-button-container');
        if (container) {
          container.innerHTML = '';
          paypalButtonRenderedRef.current = true;
          window.paypal
            .Buttons({
              style: {
                shape: 'rect',
                color: 'gold',
                layout: 'vertical',
                label: 'subscribe',
              },
              createSubscription: (_data, actions) => {
                if (!activePayPalPlanId) {
                  alert(
                    'PayPal Subscription Plan ID is not configured for this tier. Please configure Plan ID in Admin Ops.'
                  );
                  return Promise.reject(new Error('Plan ID missing'));
                }
                return actions.subscription.create({
                  plan_id: activePayPalPlanId,
                });
              },
              onApprove: () => {
                handleFinalizeSubscription();
              },
              onError: (err) => {
                console.error('PayPal Subscription error:', err);
                alert('PayPal authorization failed. Please try again or use Sandbox test mode.');
              },
            })
            .render('#paypal-button-container');
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    paymentMethod,
    paymentConfig.paypalClientId,
    activePayPalPlanId,
    handleFinalizeSubscription,
  ]);

  if (!isOpen) return null;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    const code = couponCode.trim().toUpperCase();
    if (code === 'VR2026' || code === 'LAUNCH50' || code === 'AI360') {
      setIsCouponApplied(true);
      setCouponDiscountPercent(20);
      setCouponError(null);
    } else {
      setCouponError('Invalid coupon code. Try code "VR2026" for 20% off.');
    }
  };

  const handleCompleteSandboxPayment = async () => {
    if (!PAYMENT_COLLECTION_ENABLED) {
      handleFinalizeSubscription();
      return;
    }
    setIsProcessing(true);

    // 1. If credit card is selected and backend commercial service has Stripe configured:
    if (paymentMethod === 'card') {
      const health = await probeBackendHealth();
      if (health.isOnline && health.stripeConfigured) {
        const currentUser = getCurrentUser();
        const checkoutRes = await createServerStripeCheckout({
          plan: selectedPlan,
          billingCycle,
          userEmail: currentUser.email,
        });

        if (checkoutRes.success && checkoutRes.checkoutUrl) {
          // Redirect safely to official Stripe Hosted Checkout!
          window.location.href = checkoutRes.checkoutUrl;
          return;
        }

        // STRICT GATE: If real Stripe was targeted and failed, ABORT immediately! Never silently fall back to mock credit grant!
        setIsProcessing(false);
        alert(`Stripe 官方收银台会话创建失败：${checkoutRes.error || '未知网络错误'}。已终止支付流程，未发放任何权益。`);
        return;
      }
    }

    // Offline/unconfigured never means payment succeeded.
    handleFinalizeSubscription();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#030d1d] border border-cyan-500/30 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl relative flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-r from-[#061838] via-[#04122c] to-[#020917] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-xl text-slate-950 shadow-md shadow-cyan-400/25">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                PanoramaAI Studio · Checkout &amp; Subscription
              </h3>
              <p className="text-[11px] text-cyan-300/70">
                Unlock commercial usage, 4K HDR export &amp; high-volume generations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <div role="alert" className="p-3 rounded-xl bg-amber-950/40 text-amber-200 border border-amber-500/40">
            当前仅展示套餐预览。真实订阅和权益同步尚未接通，支付已禁用；请勿输入真实银行卡信息。
          </div>
          {isCompleted && completedDetails ? (
            /* Success Celebration Card */
            <div className="py-8 px-6 text-center space-y-5 bg-gradient-to-b from-cyan-950/40 to-slate-950 rounded-2xl border border-cyan-400/40">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-cyan-400 to-emerald-400 flex items-center justify-center text-slate-950 shadow-[0_0_30px_rgba(0,242,254,0.4)] animate-bounce">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <h4 className="text-xl font-black text-white tracking-tight">
                  Subscription Activated Successfully!
                </h4>
                <p className="text-cyan-200/80 max-w-md mx-auto text-xs leading-relaxed">
                  Welcome to <strong>{completedDetails.plan} Tier</strong>! Your account has been upgraded with{' '}
                  <strong className="text-cyan-300">+{completedDetails.creditsAdded} Free AI Generation Credits</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto p-3.5 bg-slate-900/80 rounded-xl border border-cyan-500/20 text-left font-mono">
                <div>
                  <div className="text-[10px] text-slate-400">Total Billed</div>
                  <div className="text-white font-bold text-sm">${completedDetails.amountPaid} USD</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Payment Gateway</div>
                  <div className="text-cyan-300 font-bold text-xs truncate">{completedDetails.method}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shimmer-btn px-8 py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/35 transition-all cursor-pointer"
              >
                Start Generating 4K Panoramas Now
              </button>
            </div>
          ) : (
            <>
              {/* Step 1: Select Plan Tier & Billing Cycle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">1. Select Membership Plan</span>
                  {/* Billing Cycle Switch */}
                  <div className="flex items-center gap-1 bg-[#020814] p-1 border border-cyan-500/20 rounded-xl text-[11px]">
                    <button
                      type="button"
                      onClick={() => setBillingCycle('yearly')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        billingCycle === 'yearly'
                          ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 font-extrabold shadow-sm'
                          : 'text-cyan-200/60 hover:text-white'
                      }`}
                    >
                      Yearly (Save 50%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle('monthly')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        billingCycle === 'monthly'
                          ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 font-extrabold shadow-sm'
                          : 'text-cyan-200/60 hover:text-white'
                      }`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Pro Plan Choice */}
                  <div
                    onClick={() => setSelectedPlan('pro')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative space-y-2 ${
                      selectedPlan === 'pro'
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_20px_rgba(0,242,254,0.25)] ring-1 ring-cyan-400'
                        : 'bg-[#04122c]/50 border-cyan-500/15 hover:border-cyan-400/40 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 fill-current" />
                        Pro Creator
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 font-bold">
                        Most Popular
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">
                        ${billingCycle === 'yearly' ? PRICING.pro.yearlyPerMonth : PRICING.pro.monthly}
                      </span>
                      <span className="text-slate-400 text-[10px]">/ month</span>
                    </div>
                    <p className="text-[11px] text-cyan-200/70">
                      {proCredits} monthly credits · 4K lossless export · Full commercial license
                    </p>
                  </div>

                  {/* Enterprise Plan Choice */}
                  <div
                    onClick={() => setSelectedPlan('enterprise')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative space-y-2 ${
                      selectedPlan === 'enterprise'
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_20px_rgba(0,242,254,0.25)] ring-1 ring-cyan-400'
                        : 'bg-[#04122c]/50 border-cyan-500/15 hover:border-cyan-400/40 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" />
                        Studio Enterprise
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-300 font-bold">
                        High Capacity
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">
                        ${billingCycle === 'yearly' ? PRICING.enterprise.yearlyPerMonth : PRICING.enterprise.monthly}
                      </span>
                      <span className="text-slate-400 text-[10px]">/ month</span>
                    </div>
                    <p className="text-[11px] text-cyan-200/70">
                      5,000 monthly credits · Dedicated GPU queue · Full REST API Access
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2: Payment Method Choice */}
              <div className="space-y-3">
                <span className="font-bold text-slate-200">2. Select Payment Method</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
                      paymentMethod === 'card'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-cyan-400" />
                    <span>Credit Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('paypal')}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
                      paymentMethod === 'paypal'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-black italic text-blue-400">P</span>
                    <span>PayPal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('gpay')}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
                      paymentMethod === 'gpay'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-black text-amber-400">G</span>
                    <span>Google Pay</span>
                  </button>
                </div>

                {/* Credit Card / Stripe View */}
                {paymentMethod === 'card' && (
                  <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-2">
                      <span>Card Details (信用卡信息)</span>
                      <span className="text-amber-400 font-mono text-[10px] bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                        Payment unavailable · Preview only
                      </span>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Name on Card</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Card Number (Sandbox Ready)</label>
                      <input
                        type="text"
                        disabled
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">MM/YY</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">CVC / CVV</label>
                        <input
                          type="password"
                          disabled
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PayPal View */}
                {paymentMethod === 'paypal' && (
                  <div className="p-4 bg-slate-950/70 border border-blue-500/30 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-blue-300/80 border-b border-slate-800/80 pb-2">
                      <span className="font-bold">PayPal Automatic Subscriptions</span>
                      <span className="font-mono text-cyan-400">
                        {paymentConfig.paypalClientId
                          ? isPayPalSdkLoaded
                            ? 'Official Button Loaded'
                            : 'Loading SDK...'
                          : 'Client ID Blank (Sandbox Mode)'}
                      </span>
                    </div>

                    {paymentConfig.paypalClientId ? (
                      /* Live PayPal SDK Official Button Container */
                      <div className="space-y-2 pt-1">
                        <div id="paypal-button-container" className="min-h-[44px]" />
                        <p className="text-[10px] text-slate-400 text-center">
                          Powered by PayPal Vault · Billed automatically each {billingCycle === 'yearly' ? 'year' : 'month'}
                        </p>
                      </div>
                    ) : (
                      /* Informative Sandbox Fallback Box */
                      <div className="space-y-3 pt-1">
                        <div className="p-3 bg-blue-950/40 border border-blue-500/25 rounded-xl flex items-start gap-2 text-[11px] text-blue-200">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="font-bold text-white">PayPal Live Client ID is currently blank</span>
                            <p className="text-slate-300 leading-relaxed text-[11px]">
                              To enable the official PayPal yellow subscription button, paste your PayPal Client ID and Plan IDs in <strong>Admin Ops &gt; Payment Gateways</strong>.
                            </p>
                            <p className="text-cyan-300 text-[11px]">
                              For now, you can click the button below to test complete the PayPal subscription workflow in sandbox mode.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleCompleteSandboxPayment}
                          disabled={isProcessing}
                          className="w-full py-3 bg-[#ffc439] hover:bg-[#f4b82d] text-[#111] font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="font-black italic">PayPal</span>
                          <span>Payment unavailable · Preview only</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Coupon Code & Order Summary */}
              <div className="p-4 bg-[#020b18] border border-cyan-500/20 rounded-2xl space-y-3">
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Enter promo coupon (e.g. VR2026)"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white uppercase font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 font-bold rounded-xl cursor-pointer"
                  >
                    Apply
                  </button>
                </form>

                {isCouponApplied && (
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3.5 h-3.5" />
                    <span>Coupon applied! 20% discount granted.</span>
                  </div>
                )}

                {couponError && (
                  <div className="text-[11px] text-rose-400">{couponError}</div>
                )}

                <div className="pt-2 border-t border-cyan-500/15 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span>Selected Plan</span>
                    <span className="font-bold text-white">{planInfo.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Billing Frequency</span>
                    <span className="text-cyan-300 font-medium capitalize">{billingCycle}</span>
                  </div>
                  {isCouponApplied && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Promo Discount (20%)</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                    <span>Due Today (USD)</span>
                    <span className="text-cyan-400 font-mono text-base font-black">
                      ${finalTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security & Guarantee Note */}
              <div className="flex items-center gap-2 text-[10px] text-slate-400 justify-center">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Preview only · No payment collected · No credits granted</span>
              </div>
            </>
          )}
        </div>

        {/* Modal Bottom Actions */}
        {!isCompleted && paymentMethod !== 'paypal' && (
          <div className="px-6 py-4 border-t border-cyan-500/20 bg-[#020917] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCompleteSandboxPayment}
              disabled={isProcessing}
              className="shimmer-btn px-6 py-2.5 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? 'Verifying Authorization...'
                  : 'Payment unavailable · Preview only'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
