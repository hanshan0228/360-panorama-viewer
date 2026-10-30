import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../utils/i18n';
import { generatorMessages } from '../../utils/generatorTranslations';

interface Turnstile {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widget: string) => void;
}
declare global { interface Window { turnstile?: Turnstile; } }

export function VerificationChallenge({ siteKey, action, onToken }: { siteKey: string; action: 'register' | 'verify-email'; onToken: (token: string) => void }) {
  const t = useTranslation(generatorMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let widget: string | undefined;
    let active = true;
    onToken('');
    const mount = () => {
      if (!active || !containerRef.current || !window.turnstile) return;
      try {
        widget = window.turnstile.render(containerRef.current, {
          // ponytail: The native compact widget also fits nested panels on 320px screens.
          sitekey: siteKey, action, theme: 'dark', size: 'compact',
          callback: (token: string) => { if (active) { setFailed(false); onToken(token); } },
          'expired-callback': () => { if (active) onToken(''); },
          'error-callback': () => { if (active) { onToken(''); setFailed(true); } },
        });
      } catch { if (active) { onToken(''); setFailed(true); } }
    };
    const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    const isNew = !script;
    if (!script) { script = document.createElement('script'); script.src = scriptUrl; script.async = true; }
    const onError = () => { script?.remove(); if (active) setFailed(true); };
    if (window.turnstile) mount();
    else script.addEventListener('load', mount);
    script.addEventListener('error', onError);
    if (isNew) document.head.append(script);
    return () => {
      active = false;
      script.removeEventListener('load', mount);
      script.removeEventListener('error', onError);
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [siteKey, action, onToken]);
  return <div>
    <div ref={containerRef} aria-label={t('Security check')} />
    {failed && <p role="alert" className="text-sm text-rose-200">{t('The security check is unavailable. Please try again.')}</p>}
  </div>;
}
