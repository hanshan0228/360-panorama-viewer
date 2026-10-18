import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createPayPalApi, paypalCatalog, validatePayPalPlan } from '../server/paypal.mjs';

const args = process.argv.slice(2);
const source = args[args.indexOf('--source') + 1];
const originArg = args[args.indexOf('--origin') + 1];
if (!args.includes('--source') || !source || source.startsWith('--')) throw new Error('Specify --source /absolute/path/to/credentials.env');
const origin = new URL(args.includes('--origin') ? originArg : 'https://panorama-generator.pages.dev').origin;
if (!origin.startsWith('https://')) throw new Error('A public HTTPS origin is required for PayPal webhooks');
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, '.env.paypal.local');
const credentials = parseEnv(fs.readFileSync(source, 'utf8'));
const mode = credentials.PAYPAL_MODE || credentials.PAYPAL_ENV;
if (!['live', 'sandbox'].includes(mode) || !credentials.PAYPAL_CLIENT_ID || !credentials.PAYPAL_CLIENT_SECRET) throw new Error('Incomplete PayPal credentials');
const stored = fs.existsSync(target) ? parseEnv(fs.readFileSync(target, 'utf8')) : {};
if (stored.PAYPAL_CLIENT_ID && (stored.PAYPAL_CLIENT_ID !== credentials.PAYPAL_CLIENT_ID || stored.PAYPAL_MODE !== mode)) throw new Error('Destination already uses another PayPal account or environment');
const env = { ...stored, PAYPAL_MODE: mode, PAYPAL_CLIENT_ID: credentials.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: credentials.PAYPAL_CLIENT_SECRET, PAYPAL_RETURN_ORIGIN: origin };
const api = createPayPalApi(env);
const requestId = purpose => createHash('sha256').update(`${origin}:${mode}:${purpose}`).digest('hex').slice(0, 32);
const save = () => {
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, Object.entries(env).filter(([key]) => key.startsWith('PAYPAL_'))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, target);
};

try {
  await api('/v1/catalogs/products?page_size=1');
  console.log(`PayPal ${mode}: credentials verified (values redacted).`);
  if (args.includes('--save-credentials')) {
    save();
    console.log(`Credentials saved to ${target} (owner-only, Git-ignored). No remote configuration changed.`);
  }
  if (!args.includes('--configure')) {
    console.log('Read-only check complete. Use --configure to create project-specific plans and webhook.');
  } else {
    const response = await fetch(`${origin}/api/billing`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not read server billing configuration');
    const billing = (await response.json()).config;
    if (!billing) throw new Error('Missing server billing configuration');
    if (!env.PAYPAL_PRODUCT_ID) {
      const product = await api('/v1/catalogs/products', { name: '360 Panorama Viewer', description: 'AI panorama generation credits',
        type: 'SERVICE', category: 'SOFTWARE', home_url: origin }, requestId('product'));
      if (!product.id) throw new Error('PayPal product ID missing');
      env.PAYPAL_PRODUCT_ID = product.id;
      save();
    }
    const catalog = paypalCatalog(env, billing);
    for (const [plan, cycles] of Object.entries(catalog)) {
      for (const [cycle, offer] of Object.entries(cycles)) {
        const key = `PAYPAL_${plan.toUpperCase()}_${cycle.toUpperCase()}_PLAN_ID`;
        if (!env[key]) {
          const created = await api('/v1/billing/plans', { product_id: env.PAYPAL_PRODUCT_ID,
            name: `360 Panorama Viewer ${plan} ${cycle}`, status: 'ACTIVE',
            billing_cycles: [{ frequency: { interval_unit: cycle === 'yearly' ? 'YEAR' : 'MONTH', interval_count: 1 },
              tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
              pricing_scheme: { fixed_price: { value: (offer.amountCents / 100).toFixed(2), currency_code: 'USD' } } }],
            payment_preferences: { auto_bill_outstanding: false, payment_failure_threshold: 1 } }, requestId(`${key}:${offer.amountCents}`));
          if (!created.id) throw new Error('PayPal plan ID missing');
          env[key] = created.id;
          save();
        }
        validatePayPalPlan(await api(`/v1/billing/plans/${env[key]}`), offer, cycle);
        console.log(`Verified ${plan} ${cycle}: $${(offer.amountCents / 100).toFixed(2)} USD, ${offer.credits} credits per payment.`);
      }
    }
    const webhookUrl = `${origin}/api/paypal/webhook`;
    const eventNames = ['PAYMENT.SALE.COMPLETED', 'BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.CANCELLED',
      'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'];
    const existing = (await api('/v1/notifications/webhooks')).webhooks?.find(webhook => webhook.url === webhookUrl);
    const webhook = existing || await api('/v1/notifications/webhooks', {
      url: webhookUrl, event_types: eventNames.map(name => ({ name })),
    });
    if (!webhook.id || eventNames.some(name => !webhook.event_types?.some(event => event.name === name || event.name === '*'))) throw new Error('Webhook event configuration is incomplete');
    env.PAYPAL_WEBHOOK_ID = webhook.id;
    save();
    console.log(`Project configuration saved to ${target} (owner-only, Git-ignored). No customer subscription or charge was created.`);
  }
} catch (error) {
  console.error(`PayPal setup failed: ${error.message}`);
  process.exitCode = 1;
}
