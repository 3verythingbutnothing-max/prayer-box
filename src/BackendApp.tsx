import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useActionFeedback } from './action-feedback';
import FeedbackBug from './components/FeedbackBug';
import { Icon, PrayerBoxMark } from './ui';
import { BackendError, getBackendNotifications, getBackendSession, sendBackendFeedback, uploadBackendPicture } from './backend-client';
import type { BackendNotification, BackendSession } from './backend-client';
import './backend.css';
import RegistrationServices, { RecoveryKitSettings } from './components/RegistrationServices';
import { signOutAccount } from './registration-client';

import BotCheck from './components/BackendBotCheck';

type Picture = { key: string; file: File; state: 'waiting' | 'sending' | 'saved' | 'failed'; error?: string };

function FeedbackForm({ session, refreshSession }: { session: BackendSession; refreshSession: () => void }) {
  const { prepare, respond } = useActionFeedback();
  const [category, setCategory] = useState('bug');
  const [body, setBody] = useState('');
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [token, setToken] = useState('');
  const onToken = useCallback((value: string) => setToken(value), []);
  const [botAttempt, setBotAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState('');
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canVerify = !!session.capabilities.feedback && !!session.capabilities.turnstileSiteKey;

  function choosePictures(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (selected.length + pictures.length > 3 || selected.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) {
      setMessage('Choose up to three PNG, JPEG, or WebP pictures, each smaller than 5 MiB.');
    } else {
      setPictures(previous => [...previous, ...selected.map(file => ({ key: crypto.randomUUID(), file, state: 'waiting' as const }))]);
      setMessage('');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !session.csrfToken) return;
    prepare();
    if (!reportId && (!canVerify || !token)) {
      setMessage('Complete bot verification before submitting. Your draft stays on this page.');
      respond({ tone: 'info', title: 'A little check before sending', message: 'Complete verification, or use Try again below.' });
      return;
    }
    setBusy(true);
    setLocked(true);
    setMessage('');
    let savedId = reportId;
    try {
      if (!savedId) {
        const payload = JSON.stringify([category, body.trim()]);
        if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
        try {
          const result = await sendBackendFeedback({ category, body: body.trim(), turnstileToken: token }, session.csrfToken, attempt.current.key);
          savedId = result.id;
          setReportId(savedId);
        } finally { setToken(''); setBotAttempt(value => value + 1); }
      }
      const updated = pictures.map(item => ({ ...item }));
      for (const picture of updated) {
        if (picture.state === 'saved') continue;
        picture.state = 'sending'; picture.error = undefined; setPictures(updated.map(item => ({ ...item })));
        try {
          await uploadBackendPicture(savedId, picture.file, session.csrfToken, picture.key);
          picture.state = 'saved';
        } catch (error) {
          picture.state = 'failed'; picture.error = error instanceof Error ? error.message : 'Please retry this picture.';
        }
        setPictures(updated.map(item => ({ ...item })));
      }
      const failures = updated.filter(item => item.state === 'failed').length;
      if (failures) {
        const detail = `Your report was saved. ${failures === 1 ? 'One picture still needs' : `${failures} pictures still need`} uploading. Retry to send only the remaining pictures.`;
        setMessage(detail);
        respond({ tone: 'pending', title: 'Your report is saved', message: detail });
      } else {
        setComplete(true);
        setMessage('Thank you for helping make Prayer Box better! Your report was saved. Pictures stay private while awaiting review.');
        respond({ tone: 'success', title: 'Thank you for helping make Prayer Box better!', message: 'Your report was saved for review.' });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again. Your draft is still here.';
      setMessage(detail);
      // A lost response may still have committed: keep its body and retry key stable.
      if (error instanceof BackendError && error.status >= 400 && error.status < 500 && error.status !== 409) setLocked(false);
      respond({ tone: 'info', title: 'We could not confirm your submission', message: detail });
    } finally { setBusy(false); }
  }

  function newReport() {
    setCategory('bug'); setBody(''); setPictures([]); setReportId(null); setComplete(false);
    setLocked(false); setMessage(''); attempt.current = null; setToken(''); setBotAttempt(value => value + 1);
  }

  return <section className="backend-card backend-feedback" aria-labelledby="backend-feedback-title">
    <div className="backend-card-heading"><div><p className="eyebrow">A little help goes a long way</p>
      <h2 id="backend-feedback-title">Help our little box grow.</h2>
      <p>Tell us about a bug, a feature idea, or something else that could make Prayer Box better.</p></div><FeedbackBug /></div>
    <form onSubmit={submit}>
      <label htmlFor="backend-category">What would you like to share?</label>
      <select id="backend-category" value={category} disabled={locked || busy} onChange={event => setCategory(event.target.value)}>
        <option value="bug">Report a bug</option><option value="feature">Request a new feature</option><option value="other">Other</option>
      </select>
      <label htmlFor="backend-description">Tell us a little more</label>
      <textarea id="backend-description" value={body} disabled={locked || busy} onChange={event => setBody(event.target.value)}
        required minLength={1} maxLength={3000} rows={6} placeholder="What happened, or what would you like to see?" aria-describedby="backend-details-help" />
      <p id="backend-details-help" className="backend-helper">Please leave out passwords, contact details, and private prayer content. Your draft stays on this page while you work.</p>
      <label htmlFor="backend-pictures">Add pictures <span className="backend-optional">(optional)</span></label>
      <input ref={fileInput} id="backend-pictures" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked || busy}
        onChange={event => choosePictures(event.target.files)} aria-describedby="backend-picture-help" />
      <p id="backend-picture-help" className="backend-helper">Up to three pictures, 5 MiB each. They stay private and unavailable until review is complete.</p>
      {pictures.length > 0 && <ul className="backend-picture-list">{pictures.map(picture => <li key={picture.key}>
        <div><strong>{picture.file.name}</strong><span>{picture.state === 'saved' ? 'Saved · awaiting review' : picture.state === 'sending' ? 'Uploading…' : picture.state === 'failed' ? picture.error : 'Ready to upload'}</span></div>
        {!locked && <button type="button" className="icon-button" aria-label={`Remove ${picture.file.name}`} onClick={() => setPictures(items => items.filter(item => item.key !== picture.key))}><Icon name="close" /></button>}
      </li>)}</ul>}
      {!reportId && <div className="backend-verification" aria-labelledby="backend-verification-title">
        <h3 id="backend-verification-title"><Icon name="shield" /> A little protection for our community</h3>
        {canVerify ? <BotCheck siteKey={session.capabilities.turnstileSiteKey!} attempt={botAttempt} onToken={onToken} />
          : <p>Bot verification is not connected yet, so sending is unavailable. You can keep your draft here and try again once it is ready.</p>}
        <div className="backend-inline-actions"><button type="button" className="button secondary compact" disabled={busy} onClick={() => { setToken(''); setBotAttempt(value => value + 1); refreshSession(); }}>Try again</button><a href="#help">Get help</a></div>
      </div>}
      {message && <p className={`backend-result ${complete ? 'backend-result-success' : ''}`} role="status">{complete && <Icon name="check" />}{message}</p>}
      {reportId && <p className="backend-helper">Report reference: <span className="backend-reference">{reportId}</span></p>}
      {complete ? <button type="button" className="button secondary" onClick={newReport}>Write another report</button>
        : <button type="submit" className="button primary backend-submit" disabled={busy || !session.authenticated || !session.csrfToken || (!reportId && (!canVerify || !token)) || !body.trim()}>
          {busy ? 'Saving…' : reportId ? 'Retry remaining pictures' : locked ? 'Retry submission' : 'Submit'}<Icon name={busy ? 'shield' : 'arrow'} /></button>}
    </form>
  </section>;
}

export default function BackendApp() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1));
  useEffect(() => { const changed = () => setRoute(window.location.hash.slice(1)); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  const [session, setSession] = useState<BackendSession | null>(null);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [notifications, setNotifications] = useState<BackendNotification[]>([]);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const sessionRequest = useRef(0);
  const currentActor = useRef<string | null>(null);
  const notificationRequest = useRef(0);
  const { prepare, respond } = useActionFeedback();
  const refreshSession = useCallback(() => {
    const sequence = ++sessionRequest.current;
    setSessionError('');
    void getBackendSession().then(next => {
      if (sequence !== sessionRequest.current) return;
      const nextActor = next.authenticated ? next.actor?.id ?? null : null;
      if (nextActor !== currentActor.current) {
        notificationRequest.current++;
        setNotifications([]); setNotificationMessage(''); setRefreshing(false);
      }
      currentActor.current = nextActor;
      setSession(next);
      if (next.authenticated && next.actor) setDraftOwner(next.actor.id);
    }).catch(error => {
      if (sequence === sessionRequest.current) setSessionError(error instanceof Error ? error.message : 'Could not connect. Please retry.');
    });
  }, []);
  useEffect(refreshSession, [refreshSession]);

  async function refreshNotifications() {
    if (refreshing || !currentActor.current) return;
    const owner = currentActor.current;
    const sequence = ++notificationRequest.current;
    prepare(); setRefreshing(true);
    try {
      const result = await getBackendNotifications();
      if (sequence !== notificationRequest.current || currentActor.current !== owner) return;
      setNotifications(result.notifications);
      setNotificationMessage(result.notifications.length ? '' : 'No updates just yet.');
      respond({ tone: 'info', title: 'Your updates are refreshed' });
    } catch (error) {
      if (sequence !== notificationRequest.current || currentActor.current !== owner) return;
      const detail = error instanceof Error ? error.message : 'Could not load updates. Please retry.';
      setNotificationMessage(detail); respond({ tone: 'info', title: 'Updates could not be loaded', message: detail });
    } finally { if (sequence === notificationRequest.current) setRefreshing(false); }
  }

  function recoveryCompleted() {
    sessionRequest.current++; notificationRequest.current++;
    currentActor.current = null;
    setSession(null); setDraftOwner(null); setNotifications([]);
    setNotificationMessage(''); setSessionError(''); setRefreshing(false);
    refreshSession();
  }
  async function signOut() {
    if (signingOutRef.current || !session?.csrfToken) return;
    signingOutRef.current = true; setSigningOut(true); prepare();
    try {
      await signOutAccount(session.csrfToken);
      recoveryCompleted(); window.location.hash = 'signin';
      respond({ tone: 'success', title: 'You’re signed out.' });
    } catch (failure) {
      respond({ tone: 'info', title: 'Sign-out could not be confirmed.', message: failure instanceof Error ? failure.message : 'Please try again.' });
    } finally { signingOutRef.current = false; setSigningOut(false); }
  }
  const explicitAccountRoute = ['signup', 'signin', 'recovery'].includes(route);
  const accountMode = route === 'signin' ? 'signin' : route === 'recovery' ? 'recovery' : 'signup';
  const showAccounts = explicitAccountRoute || !!session && !session.authenticated && !draftOwner;

  return <div className="backend-app">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="backend-header"><a href="#main-content" className="brand"><PrayerBoxMark size={42} /><span>Prayer Box</span></a>
      <nav aria-label="Main navigation">{!session?.authenticated && <><a href="#signup">Create account</a><a href="#signin">Sign in</a></>}<a href="#help">Get help</a>{session?.authenticated && <button type="button" className="text-link" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button>}<span className="backend-stage">Local integration</span></nav></header>
    <main id="main-content" tabIndex={-1} className="backend-main">
      {!showAccounts && <section className="backend-intro"><p className="eyebrow">A little space, built with care</p><h1>Keeping prayer at the heart.</h1>
        <p>The next chapter of Prayer Box is taking shape, with private accounts and a safer place to share.</p></section>}
      {showAccounts ? <RegistrationServices key={accountMode} mode={accountMode} onNavigate={destination => {window.location.hash = destination;}} onReset={recoveryCompleted} onAuthenticated={() => {setSession(null);window.location.hash='';refreshSession();}} /> : <>
      {sessionError && <section className="backend-card backend-connection" role="status"><h2>Let’s reconnect.</h2><p>{sessionError}</p><button className="button secondary" onClick={refreshSession}>Try again</button></section>}
      {!session ? !sessionError && <p role="status">Connecting to Prayer Box…</p>
          : <>
            <p className="backend-signed-in">{session.authenticated ? <>Connected as <strong>{session.actor?.displayName}</strong>.</>
              : 'Your session has ended. Your draft remains below, and sending is unavailable until your connection is restored.'}</p>
            <FeedbackForm key={draftOwner} session={session} refreshSession={refreshSession} />
            {session.authenticated && <RecoveryKitSettings key={session.actor?.id} csrfToken={session.csrfToken} />}
            <section className="backend-card" aria-labelledby="backend-notifications-title"><div className="backend-section-top"><h2 id="backend-notifications-title"><Icon name="bell" size={24} /> Your updates</h2>
              <button className="button secondary compact" disabled={refreshing || !session.authenticated} onClick={refreshNotifications}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
              <p className="backend-helper">Updates are saved to your account. Refresh to check for new ones.</p>
              {notificationMessage && <p role="status">{notificationMessage}</p>}
              {notifications.length > 0 && <ul className="backend-notifications">{notifications.map(notification => <li key={notification.id}><p>{notification.message}</p><time dateTime={new Date(notification.createdAt).toISOString()}>{new Date(notification.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time></li>)}</ul>}
            </section>
          </>}
      </>}
      <section id="help" className="backend-card backend-help" aria-labelledby="backend-help-title"><p className="eyebrow">We can take it one step at a time</p>
        <h2 id="backend-help-title">A little help getting connected.</h2><p>If verification is unavailable, keep your draft on this page and choose <strong>Try again</strong>. Check your connection and allow the verification frame if your browser blocks it.</p>
        <p>Verification never grants church membership or changes who can see a prayer. If it still cannot connect, sending stays unavailable until the service is restored.</p>
        <p className="backend-helper">Registration remains invitation only and depends on the account services being ready. This integration is not an emergency service or continuous crisis monitoring.</p></section>
    </main><footer className="backend-footer"><PrayerBoxMark size={30} /><p>A small space for prayer, encouragement, and hope.</p></footer>
  </div>;
}
