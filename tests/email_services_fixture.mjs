import crypto from 'node:crypto';

export const emailTestEnv = {
  APP_ORIGIN: 'https://review.example', RESEND_API_KEY: 'synthetic-resend-key',
  VERIFICATION_FROM_EMAIL: 'verify@review.example', TURNSTILE_SITE_KEY: 'synthetic-site-key',
  TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret',
};
export const challengeToken = (action = 'register') => action + ':' + crypto.randomUUID();

const defaultReview = (_url, options) => {
  const payload = JSON.parse(options.body);
  const text = JSON.stringify({ passed: true, issues: [], explanation: 'Synthetic review passed.' });
  return Response.json(payload.generationConfig
    ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
    : { choices: [{ finish_reason: 'stop', message: { content: text } }] });
};

export function emailServicesFixture(upstream = () => Response.json({ error: 'No model configured' }, { status: 503 }), review = defaultReview) {
  const mails = [];
  const used = new Set();
  return {
    mails,
    latestToken(email) {
      const mail = mails.findLast(value => value.to.includes(email));
      return mail?.text.match(/#verify-email=([a-f0-9]{64})/)?.[1];
    },
    async fetch(url, options) {
      if (String(url) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        const body = JSON.parse(options.body);
        const success = !used.has(body.response) && /^(register|verify-email):/.test(body.response);
        used.add(body.response);
        return Response.json({ success, action: body.response.split(':')[0], hostname: 'review.example' });
      }
      if (String(url) === 'https://api.resend.com/emails') {
        mails.push(JSON.parse(options.body));
        return Response.json({ id: 'synthetic-email-' + mails.length });
      }
      if (typeof options?.body === 'string') {
        try {
          const parsed = JSON.parse(options.body);
          if (parsed?.response_format?.type === 'json_object' || parsed?.generationConfig?.responseMimeType === 'application/json') {
            return review(url, options);
          }
        } catch {}
      }
      return upstream(url, options);
    },
  };
}
