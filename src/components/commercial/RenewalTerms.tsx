import { useTranslation } from '../../utils/i18n';
import { commerceMessages } from '../../utils/commerceTranslations';

export function RenewalTerms({ amountCents, cycle, id }: { amountCents: number; cycle: 'monthly' | 'yearly'; id?: string }) {
  const t = useTranslation(commerceMessages);
  return <div id={id} className="space-y-2 text-sm text-cyan-100">
    <p>{t('{amount} USD {interval}. Automatically renews until cancelled.')
      .replace('{amount}', `$${(amountCents / 100).toFixed(2)}`)
      .replace('{interval}', t(cycle === 'yearly' ? 'each year' : 'each month'))}</p>
    <p>{t('Review the first charge date on PayPal before approval. Cancel before your next billing date from Pricing → Manage subscription or PayPal Automatic Payments. Purchased credits remain.')}</p>
  </div>;
}
