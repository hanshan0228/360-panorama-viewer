import { useState, useEffect } from 'react';
import { Check, Sparkles, Zap, Shield, ChevronDown, ChevronUp, User } from 'lucide-react';
import type { ManagedUser } from '../types/panorama';
import { getCurrentUser } from '../utils/adminStorage';
import { CheckoutModal } from './commercial/CheckoutModal';

export function PricingTab() {
  const [billingCycle, setBillingCycle] = useState<'yearly' | 'monthly'>('yearly');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Current session user state
  const [currentUser, setCurrentUser] = useState<ManagedUser>(() => getCurrentUser());

  // Checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutInitialPlan, setCheckoutInitialPlan] = useState<'pro' | 'enterprise'>('pro');

  useEffect(() => {
    const handleFocus = () => setCurrentUser(getCurrentUser());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleOpenCheckout = (plan: 'pro' | 'enterprise') => {
    setCheckoutInitialPlan(plan);
    setIsCheckoutOpen(true);
  };

  const handleCheckoutSuccess = (updatedUser: ManagedUser) => {
    setCurrentUser(updatedUser);
  };

  const FAQS = [
    {
      q: 'Can generated 360° panoramas be used commercially?',
      a: 'Yes, absolutely! All panoramas generated on the Pro and Studio plans include a full commercial license. You can use them directly in commercial games, VR real estate virtual tours, architectural client presentations, and marketing campaigns.',
    },
    {
      q: 'What resolutions and file formats are supported for export?',
      a: 'The Free Explorer tier supports standard 1K (1024×512) resolution. Pro and Studio tiers unlock up to 4K (3840×1920) lossless equirectangular PNG, as well as one-click export of industrial-standard Radiance .hdr high-dynamic-range environment maps.',
    },
    {
      q: 'How does the 360° Seam Healing algorithm work?',
      a: 'Standard AI generation models often leave a visible vertical seam where the 360° horizon wraps around. Our client-side blending algorithm uses symmetric 140-pixel progressive edge feathering and bi-directional interpolation to eliminate boundary seams completely for 100% seamless rotation.',
    },
    {
      q: 'Do you offer a REST API for automated batch generation?',
      a: 'Yes! Studio and Enterprise tiers include dedicated developer REST API keys with concurrent batch generation endpoints, webhook event callbacks, and structured Base64/JSON outputs.',
    },
  ];

  const isPro = currentUser.plan === 'pro';
  const isEnterprise = currentUser.plan === 'enterprise';

  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* Title & Billing Toggle */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/35 text-cyan-300 text-xs font-mono font-bold mb-1 shadow-[0_0_15px_rgba(0,242,254,0.15)]">
          <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" />
          <span>Flexible Productivity Plans</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p className="text-sm text-cyan-200/70 max-w-xl mx-auto">
          From indie game creators to commercial architectural visualization studios, pick the plan that fits your production pipeline.
        </p>

        {/* Current Account Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-slate-300">
          <User className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            Signed in as: <strong className="text-white">{currentUser.name}</strong> ({currentUser.email})
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 uppercase font-bold">
            {currentUser.plan} Plan
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-amber-300 font-mono font-bold">{currentUser.creditsBalance} credits left</span>
        </div>

        {/* Yearly vs Monthly Toggle */}
        <div className="flex items-center justify-center mt-2">
          <div className="inline-flex items-center gap-1.5 p-1.5 bg-[#030e20] border border-cyan-500/25 rounded-2xl text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-400/30'
                  : 'text-cyan-200/60 hover:text-white'
              }`}
            >
              Annual Billing <span className="text-[10px] text-cyan-300 font-extrabold ml-1.5 px-1.5 py-0.5 bg-cyan-950/80 rounded-full border border-cyan-400/40">Save 50%</span>
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-400/30'
                  : 'text-cyan-200/60 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Free Plan */}
        <div className="glass-panel border border-cyan-500/20 rounded-3xl p-7 space-y-6 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-bold text-cyan-200">Free Explorer</div>
              <div className="text-xs text-cyan-400/60 mt-0.5">For personal exploration &amp; 360° viewing</div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white">$0</span>
              <span className="text-xs text-cyan-300/60">/ Forever Free</span>
            </div>
            <ul className="space-y-3 text-xs text-cyan-100/90 pt-2 border-t border-cyan-500/15">
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>4 Free Trial Credits (1 Free 4K / 2x 2K Panoramas)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Unlimited 360° WebGL Viewer</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Cubemap Slicer (256px - 1024px)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Standard 1K Resolution</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            disabled={currentUser.plan === 'free'}
            className="w-full py-3 bg-cyan-950/40 text-cyan-200/80 font-bold text-xs rounded-xl border border-cyan-500/25 transition-colors disabled:opacity-50"
          >
            {currentUser.plan === 'free' ? 'Current Active Plan' : 'Downgrade to Free'}
          </button>
        </div>

        {/* Pro Plan (Highlighted Hero) */}
        <div className="glass-panel border-2 border-cyan-400 rounded-3xl p-7 space-y-6 relative flex flex-col justify-between shadow-[0_0_60px_rgba(0,242,254,0.35)] bg-gradient-to-b from-[#082245]/90 via-[#0a2952]/90 to-[#071d3a]/95 scale-105 z-10">
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 rounded-full text-[10px] font-black text-slate-950 uppercase tracking-wider shadow-lg shadow-cyan-400/50">
            MOST POPULAR
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400 fill-current" />
                <span>Pro Creator</span>
              </div>
              <div className="text-xs text-cyan-200/80 mt-0.5">Designed for indie game devs &amp; 3D artists</div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white">
                {billingCycle === 'yearly' ? '$9.9' : '$19.9'}
              </span>
              <span className="text-xs text-cyan-300/80">/ mo</span>
            </div>
            <ul className="space-y-3 text-xs text-cyan-50 pt-2 border-t border-cyan-400/25">
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-sm">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span>Monthly <strong>1,000 High-Speed AI Generations</strong></span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-sm">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span><strong>2K &amp; 4K Ultra HD</strong> Lossless Panoramas</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-sm">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span>Radiance <strong>.HDR</strong> Skybox Export</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-sm">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span>Full Commercial License</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-sm">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
                <span>Automatic 360° Seam Blending</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCheckout('pro')}
            className="shimmer-btn w-full py-3.5 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/40 transition-all cursor-pointer active:scale-95 tracking-wide"
          >
            {isPro ? 'Manage / Renew Pro' : isEnterprise ? 'Switch to Pro' : 'Upgrade to Pro'}
          </button>
        </div>

        {/* Studio / Enterprise */}
        <div className="glass-panel border border-cyan-500/20 rounded-3xl p-7 space-y-6 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400 fill-current" />
                <span>Studio &amp; Enterprise</span>
              </div>
              <div className="text-xs text-cyan-400/60 mt-0.5">For creative studios &amp; pipeline integration</div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white">
                {billingCycle === 'yearly' ? '$29.9' : '$49.9'}
              </span>
              <span className="text-xs text-cyan-300/60">/ mo</span>
            </div>
            <ul className="space-y-3 text-xs text-cyan-100/90 pt-2 border-t border-cyan-500/15">
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Monthly <strong>5,000 High-Volume Generations</strong></span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Full <strong>Developer REST API</strong> Access</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Batch Processing &amp; Priority Support</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="p-1 rounded-full bg-cyan-400/20 text-cyan-300">
                  <Check className="w-3 h-3" />
                </div>
                <span>Dedicated High-Priority GPU Cluster</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCheckout('enterprise')}
            className="w-full py-3 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 font-bold text-xs rounded-xl border border-cyan-500/25 transition-colors cursor-pointer"
          >
            {isEnterprise ? 'Current Active Plan' : 'Get Started with Studio'}
          </button>
        </div>
      </div>

      {/* Frequently Asked Questions Accordion */}
      <div className="space-y-4 pt-6 border-t border-cyan-500/20">
        <h2 className="text-lg font-black text-white text-center flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Frequently Asked Questions</span>
        </h2>

        <div className="space-y-3 max-w-2xl mx-auto">
          {FAQS.map((faq, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div
                key={faq.q}
                className="glass-card rounded-2xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  className="w-full px-5 py-4 text-left text-xs font-bold text-cyan-100 flex items-center justify-between gap-2 hover:text-white cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cyan-600 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-cyan-200/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        initialPlan={checkoutInitialPlan}
        initialCycle={billingCycle}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
}
