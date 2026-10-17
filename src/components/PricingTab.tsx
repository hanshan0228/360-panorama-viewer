import { useEffect, useState } from 'react';
import { Check, Sparkles, Shield, User } from 'lucide-react';
import type { ManagedUser, SystemBillingConfig } from '../types/panorama';
import { paypalRequest, type PayPalConfig } from '../utils/commercialApi';

interface PricingTabProps {
  currentUser: ManagedUser;
  billingConfig: SystemBillingConfig;
  onChoosePlan: (plan: 'pro' | 'enterprise', cycle: 'monthly' | 'yearly') => void;
  onOpenStudio: () => void;
}

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function PricingTab({ currentUser, billingConfig, onChoosePlan, onOpenStudio }: PricingTabProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const guest = currentUser.id.startsWith('usr_guest');

  useEffect(() => {
    let active = true;
    paypalRequest<PayPalConfig>('config').then(result => {
      if (active) setConfig(result);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Pricing is unavailable. Please try again.');
    });
    return () => { active = false; };
  }, [reload]);

  const faqs = [
    ['How do credits work?', `Each successful generation costs ${billingConfig.creditCostPer1K} credits at 1K, ${billingConfig.creditCostPer2K} at 2K, or ${billingConfig.creditCostPer4K} at 4K. A credit is not the same as one image. Failed model requests release their reserved credits.`],
    ['When are subscription credits added?', 'Monthly subscriptions add credits after each confirmed payment. Annual subscriptions add twelve months of credits together after the annual payment. PayPal approval alone does not grant credits.'],
    ['Can I cancel or change plans?', 'Open Manage subscription to check your status or cancel automatic renewal. Purchased credits remain. Plan changes are not automatic: review and cancel the existing renewal before starting another subscription.'],
    ['What can I try for free?', `New accounts receive ${billingConfig.freeMonthlyCredits} trial credits. You can use the panorama viewer and local conversion tools without a paid subscription. Generation sizes depend on the selected model; exported images are resized to your chosen tier.`],
  ];

  return (
    <div className="space-y-9 max-w-5xl mx-auto">
      <header className="text-center space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Plans &amp; credits</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white">Choose a plan. Know what you pay.</h1>
        <p className="text-sm text-cyan-200/75 max-w-2xl mx-auto">Credit-based panorama generation with monthly or annual automatic renewal. See your total charge and credit allowance before you subscribe.</p>
        <div className="inline-flex flex-wrap justify-center items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 border border-cyan-500/20 text-xs">
          <User className="w-4 h-4 text-cyan-300" />
          <span>{guest ? 'Guest session' : currentUser.name}</span>
          <span className="uppercase text-cyan-300">{currentUser.plan === 'enterprise' ? 'Studio' : currentUser.plan} access</span>
          <span className="text-amber-300">{currentUser.creditsBalance.toLocaleString('en-US')} credits available</span>
          {currentUser.plan !== 'free' && <button type="button" className="underline text-white" onClick={() => onChoosePlan(currentUser.plan === 'enterprise' ? 'enterprise' : 'pro', billingCycle)}>Manage subscription</button>}
        </div>
        <div className="flex justify-center gap-2" role="group" aria-label="Billing interval">
          {(['monthly', 'yearly'] as const).map(cycle => <button type="button" key={cycle} aria-pressed={billingCycle === cycle}
            onClick={() => setBillingCycle(cycle)}
            className={`px-5 py-2 rounded-xl border text-sm font-bold ${billingCycle === cycle ? 'bg-cyan-300 border-cyan-300 text-slate-950' : 'border-cyan-500/30 text-cyan-100'}`}>
            {cycle === 'monthly' ? 'Monthly billing' : 'Annual billing'}
          </button>)}
        </div>
      </header>

      {error && <div role="alert" className="p-4 rounded-2xl border border-red-500/40 text-red-200 text-sm">{error} <button type="button" className="underline" onClick={() => { setConfig(null); setError(''); setReload(value => value + 1); }}>Retry pricing</button></div>}
      {!config && !error && <p role="status" className="text-center text-cyan-200">Loading current prices...</p>}
      {config && !config.enabled && <p role="status" className="text-center text-amber-200">Subscriptions are temporarily unavailable. Free tools are still available.</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        <section aria-labelledby="free-plan-title" className="glass-panel rounded-3xl border border-cyan-500/20 p-6 flex flex-col gap-5">
          <h2 id="free-plan-title" className="text-xl font-bold text-white">Free Explorer</h2>
          <p className="text-3xl font-black text-white">$0</p>
          <p className="text-sm text-cyan-200">No subscription required.</p>
          <ul className="space-y-3 text-sm text-sky-100 flex-1">
            {[`${billingConfig.freeMonthlyCredits} starter credits for new accounts`, '360° panorama viewer', 'Local cubemap and metadata tools', 'Try any supported generation tier using your credits'].map(feature => <li key={feature} className="flex gap-2"><Check className="w-4 h-4 shrink-0 text-cyan-300" />{feature}</li>)}
          </ul>
          <button type="button" onClick={onOpenStudio} className="w-full py-3 border border-cyan-500/30 rounded-xl text-cyan-100 font-bold">Open free tools</button>
        </section>

        {(['pro', 'enterprise'] as const).map(plan => {
          const offer = config?.plans?.[plan]?.[billingCycle];
          const monthly = config?.plans?.[plan]?.monthly;
          const savings = offer && monthly && billingCycle === 'yearly' && monthly.amountCents > 0 ? Math.max(0, Math.round((1 - offer.amountCents / (monthly.amountCents * 12)) * 100)) : 0;
          const title = plan === 'pro' ? 'Pro Creator' : 'Studio';
          const current = currentUser.plan === plan;
          return <section key={plan} aria-labelledby={`${plan}-plan-title`} className={`glass-panel rounded-3xl border p-6 flex flex-col gap-5 ${plan === 'pro' ? 'border-cyan-300 bg-cyan-950/25' : 'border-cyan-500/20'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`${plan}-plan-title`} className="text-xl font-bold text-white">{title}</h2>
              {current && <span className="text-xs rounded-full px-2 py-1 bg-cyan-400/20 text-cyan-200">Current access</span>}
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-black text-white">{offer ? money(offer.amountCents) : '—'} <span className="text-xs font-normal text-cyan-200">USD / {billingCycle === 'yearly' ? 'year' : 'month'}</span></p>
              <p className="text-xs text-cyan-200 min-h-8">{offer ? billingCycle === 'yearly' ? `${money(offer.amountCents)} charged once each year · ${money(offer.amountCents / 12)}/month equivalent` : `${money(offer.amountCents)} charged each month` : 'Prices are loaded from the payment server.'}</p>
              {savings > 0 && <p className="text-xs text-teal-300">Save {savings}% compared with 12 monthly payments</p>}
            </div>
            <ul className="space-y-3 text-sm text-sky-100 flex-1">
              {[offer ? `${offer.credits.toLocaleString('en-US')} credits per ${billingCycle === 'yearly' ? 'annual' : 'monthly'} payment` : 'Credits shown after pricing loads', '1K, 2K and 4K output options', 'PNG and HDR export tools', 'Commercial usage rights', 'Cancel automatic renewal from your account'].map(feature => <li key={feature} className="flex gap-2"><Check className="w-4 h-4 shrink-0 text-cyan-300" />{feature}</li>)}
            </ul>
            <p className="text-xs text-cyan-200/75">{offer && billingConfig.creditCostPer2K > 0 && billingConfig.creditCostPer4K > 0 ? `About ${Math.floor(offer.credits / billingConfig.creditCostPer2K).toLocaleString('en-US')} images at 2K, or ${Math.floor(offer.credits / billingConfig.creditCostPer4K).toLocaleString('en-US')} at 4K, if all credits use that tier.` : 'Generation costs depend on resolution.'}</p>
            <button type="button" disabled={!config?.enabled || !offer || Boolean(error)} onClick={() => onChoosePlan(plan, billingCycle)} className="w-full py-3 rounded-xl bg-cyan-300 text-slate-950 font-bold disabled:opacity-40">
              {current ? 'Manage subscription' : currentUser.plan !== 'free' ? 'Review plan options' : guest ? `Sign in to choose ${title}` : `Choose ${title}`}
            </button>
          </section>;
        })}
      </div>
      <p className="text-center text-xs text-slate-300"><Sparkles className="inline w-4 h-4 mr-1" />Payments are approved on PayPal. Credits arrive only after payment confirmation.</p>
      <section className="space-y-3 border-t border-cyan-500/20 pt-7" aria-labelledby="pricing-faq-title">
        <h2 id="pricing-faq-title" className="font-bold text-lg text-white flex gap-2 items-center"><Shield className="w-4 h-4 text-cyan-300" />Before you subscribe</h2>
        {faqs.map(([question, answer]) => <details key={question} className="rounded-2xl border border-cyan-500/20 p-4 text-sm text-cyan-100"><summary className="font-bold cursor-pointer">{question}</summary><p className="pt-3 text-cyan-200/80">{answer}</p></details>)}
      </section>
    </div>
  );
}
