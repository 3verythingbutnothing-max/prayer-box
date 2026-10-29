import { useState } from 'react';
import type { PrayerRequest } from '../domain';
import { getAudienceLabel } from '../domain';

export type StoryUpdateDraft = { text: string; kind: 'update' | 'testimony'; destinations: string[] };

export function StoryUpdateForm({ deliveries, names, defaultDestination, restricted, onPublish, onCancel }: {
  deliveries: PrayerRequest[];
  names: Readonly<Record<string, string>>;
  defaultDestination?: string;
  restricted: boolean;
  onPublish: (draft: StoryUpdateDraft) => boolean;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<'update' | 'testimony'>('update');
  const [text, setText] = useState('');
  const [destinations, setDestinations] = useState<string[]>(defaultDestination ? [defaultDestination] : []);
  const available = destinations.filter(id => deliveries.some(row => row.id === id));
  return <form className="story-update-form" onSubmit={event => {
    event.preventDefault();
    if (restricted || !text.trim() || !available.length) return;
    if (onPublish({ text, kind, destinations: available })) setText('');
  }}>
    <label className="field">Post type<select value={kind} onChange={event => setKind(event.target.value as 'update' | 'testimony')}><option value="update">Update</option><option value="testimony">Testimony</option></select></label>
    <label className="field">Your {kind}<textarea value={text} onChange={event => setText(event.target.value)} rows={5} maxLength={5000} required placeholder="Share how things are going…" /></label>
    <fieldset className="destination-fieldset"><legend>Share with these prayer boxes</legend>{deliveries.map(row => <label className="check-row" key={row.id}>
      <input type="checkbox" checked={available.includes(row.id)} onChange={event => setDestinations(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} />
      <span><strong>{names[row.recipient]}</strong><small>{row.anonymous ? 'Anonymous' : 'Name shown'} · {getAudienceLabel(row.audience, row.recipient)}</small></span>
    </label>)}</fieldset>
    {!deliveries.length && <p role="status">No delivered prayer requests are available to update.</p>}
    <div className="modal-actions">{onCancel && <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>}<button className="button" disabled={restricted || !available.length || !text.trim()}>Share {kind}</button></div>
  </form>;
}
