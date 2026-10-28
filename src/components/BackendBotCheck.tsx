import { useEffect, useRef, useState } from 'react';
type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; theme: string; size: string;
    callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }
let turnstileScript: Promise<void> | undefined;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScript) {
    turnstileScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Verification unavailable')); }, 15_000);
      script.onload = () => {
        window.clearTimeout(timeout);
        if (window.turnstile) resolve();
        else { script.remove(); reject(new Error('Verification unavailable')); }
      };
      script.onerror = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('Verification unavailable')); };
      document.head.appendChild(script);
    }).catch(error => { turnstileScript = undefined; throw error; });
  }
  return turnstileScript;
}

export default function BotCheck({ siteKey, attempt, onToken, action = 'feedback' }: { siteKey: string; attempt: number; onToken: (value: string) => void; action?: 'feedback' | 'recovery' }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let widget: string | undefined;
    setError('');
    onToken('');
    void loadTurnstile().then(() => {
      if (stopped || !target.current) return;
      if (!window.turnstile) throw new Error('Verification unavailable');
      widget = window.turnstile.render(target.current, { sitekey: siteKey, action, theme: 'light', size: 'compact',
        callback: token => { if (!stopped) { setError(''); onToken(token); } },
        'expired-callback': () => { if (!stopped) { onToken(''); setError('Verification expired. Please try again below.'); } },
        'error-callback': () => { if (!stopped) { onToken(''); setError('Verification is unavailable. Your draft stays here while you retry.'); } },
      });
    }).catch(() => { if (!stopped) setError('Verification could not connect. Your draft stays here while you retry.'); });
    return () => { stopped = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [siteKey, attempt, onToken, action]);
  return <div className="backend-bot-check"><div ref={target} aria-label="Bot verification" />
    {error && <p role="status">{error}</p>}</div>;
}

