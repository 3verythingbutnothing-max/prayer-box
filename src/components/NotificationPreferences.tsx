import { useEffect, useState } from 'react';
import { Icon, PrayerBoxMark, PreferenceSwitch } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { prayerReadings, validReminderTime } from '../widgets';
import { nivReadingUrl } from '../localization';
import '../notification-preferences.css';

export type NotificationChoices = {
  enabled: boolean;
  prayersEncouragement: boolean;
  incomingPrayers: boolean;
  communityEvents: boolean;
  generalInfo: boolean;
  prayerReminders: boolean;
  reminderTime: string;
};
export const defaultNotificationChoices: NotificationChoices = {
  enabled: false, prayersEncouragement: false, incomingPrayers: false,
  communityEvents: false, generalInfo: false, prayerReminders: false, reminderTime: '08:00',
};
type Category = Exclude<keyof NotificationChoices, 'enabled' | 'reminderTime'>;
const categories: { key: Category; title: string; text: string; icon: string }[] = [
  { key: 'prayersEncouragement', title: 'Prayers & encouragement', text: 'When someone responds to a prayer you shared.', icon: 'heart' },
  { key: 'incomingPrayers', title: 'Incoming prayer requests', text: 'When a new request arrives in a box you receive.', icon: 'box' },
  { key: 'communityEvents', title: 'Community prayer events', text: 'Invitations, changed details, and cancellations.', icon: 'people' },
  { key: 'generalInfo', title: 'Prayer Box information', text: 'Useful product and community updates.', icon: 'info' },
  { key: 'prayerReminders', title: 'A gentle reminder to pray', text: 'An optional moment for prayer, gratitude, or a Bible reading.', icon: 'sun' },
];
const reminders = [
  { title: 'A little room for prayer', text: 'Do you need prayer today? Take a moment to pray for someone else, too.' },
  { title: 'A quiet moment', text: 'Did you pray today?' },
  { title: 'Good morning', text: 'You’re awake! We thank God for that.' },
  { title: 'A moment of gratitude', text: 'What can you thank God for today? Bring one small gratitude to Him.' },
  { title: `A prayer reading · ${prayerReadings[0].reference}`, text: prayerReadings[0].encouragement },
];
export function NotificationPreferences({ viewer, value, onChange }: {
  viewer: string; value: NotificationChoices; onChange: (choices: NotificationChoices) => void;
}) {
  const feedback = useActionFeedback();
  const [draft, setDraft] = useState(value);
  const [preview, setPreview] = useState(0);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission);
  const [asking, setAsking] = useState(false);
  useEffect(() => { setDraft(value); setError(''); }, [viewer, value]);
  const change = (key: keyof NotificationChoices, next: boolean | string) => setDraft(previous => ({ ...previous, [key]: next }));
  async function requestBrowserPermission() {
    feedback.prepare(); setError('');
    if (permission === 'unsupported' || permission === 'denied' || asking) return;
    setAsking(true);
    try {
      const result = await Notification.requestPermission(); setPermission(result);
      feedback.respond({ tone: result === 'granted' ? 'success' : 'info', title: result === 'granted' ? 'Browser permission enabled.' : 'Your choice is saved by this browser.', message: 'Notification delivery still needs setup. No alerts have been scheduled.' });
    } catch { setError('This browser could not open its permission request. You can keep using Prayer Box without notifications.'); }
    finally { setAsking(false); }
  }
  return <section className="notification-preferences" aria-labelledby="notification-preferences-title">
    <header className="notification-preferences-heading"><p className="eyebrow">Your own quiet rhythm</p><h1 id="notification-preferences-title">A little encouragement, on your terms.</h1><p className="page-intro">Choose what you would like to hear about. Every option is optional, and you can change your mind.</p></header>
    <div className="notification-preferences-layout"><form className="panel notification-choices" onSubmit={event => { event.preventDefault(); feedback.prepare(); if (draft.prayerReminders && !validReminderTime(draft.reminderTime)) { setError('Choose a valid reminder time.'); return; } onChange({ ...draft }); setError(''); feedback.respond({ tone: 'success', title: 'Your notification choices are saved.', message: 'Delivery setup is still in progress. No alerts are scheduled from this page.' }); }}>
      <label className="notification-choice notification-master"><span><strong>Allow optional notifications</strong><small>Turning this off pauses all optional categories below.</small></span><PreferenceSwitch checked={draft.enabled} onChange={checked => change('enabled', checked)} /></label>
      <fieldset disabled={!draft.enabled}><legend className="sr-only">Notification categories</legend>{categories.map(category => <label className="notification-choice" key={category.key}><span className="notification-category-icon"><Icon name={category.icon} /></span><span><strong>{category.title}</strong><small>{category.text}</small></span><PreferenceSwitch checked={draft[category.key]} onChange={checked => change(category.key, checked)} disabled={!draft.enabled} /></label>)}</fieldset>
      {draft.prayerReminders && <label className="notification-time">Preferred reminder time<input type="time" value={draft.reminderTime} disabled={!draft.enabled} onChange={event => change('reminderTime', event.target.value)} required /><span className="quiet-copy">Your local time · {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}</span></label>}
      <p className="notification-privacy"><Icon name="lock" /><span>Phone previews keep prayer details and anonymous identities private. These choices do not sign you up for marketing.</span></p>
      <div className="notification-browser-permission"><h2>Browser permission</h2><p>{permission === 'unsupported' ? 'This browser does not support notification permission here. Your choices can still be saved.' : permission === 'granted' ? 'This browser allows notifications. Delivery setup is still in progress.' : permission === 'denied' ? 'Notifications are blocked in this browser. You can change that in its site settings if you wish.' : 'You decide whether to open your browser’s permission request.'}</p>{permission === 'default' && <button className="button secondary" type="button" disabled={!draft.enabled || asking} onClick={() => void requestBrowserPermission()}>{asking ? 'Waiting for your choice…' : 'Enable browser permission'}<Icon name="bell" /></button>}<p className="quiet-copy">No phone alerts or recurring reminders are scheduled from this page yet.</p></div>
      {error && <p className="notification-preference-error" role="alert">{error}</p>}
      <button className="button primary" type="submit">Save my choices<Icon name="check" /></button>
    </form>
    <aside className="notification-preview-panel" aria-labelledby="notification-preview-title"><p className="eyebrow">A small look ahead</p><h2 id="notification-preview-title">Gentle phone reminders</h2><p className="quiet-copy">Design previews · these are examples, not delivered notifications.</p><div className="notification-phone" aria-label="Example phone notification"><div className="notification-phone-camera" aria-hidden="true" /><p className="notification-phone-time" aria-hidden="true">8:00</p><p className="notification-phone-day" aria-hidden="true">A new day, a little grace</p><div className="notification-phone-banner" aria-live="polite"><div className="notification-banner-app"><PrayerBoxMark size={26} /><strong>Prayer Box</strong><span>now</span></div><h3>{reminders[preview].title}</h3><p>{reminders[preview].text}</p></div><div className="notification-phone-bottom" aria-hidden="true" /></div>
      <div className="notification-preview-controls" aria-label="Choose a notification preview">{reminders.map((reminder, index) => <button key={reminder.title} className={preview === index ? 'selected' : ''} aria-label={`Preview: ${reminder.title}`} aria-pressed={preview === index} onClick={() => setPreview(index)}>{index + 1}</button>)}</div>
      {preview === reminders.length - 1 && <p className="quiet-copy">Original encouragement, with a Bible reading reference. <a className="text-link" href={nivReadingUrl(prayerReadings[0].reference)} target="_blank" rel="noopener noreferrer">Read {prayerReadings[0].reference} in the NIV<Icon name="arrow" size={15} /></a></p>}
    </aside></div>
  </section>;
}
