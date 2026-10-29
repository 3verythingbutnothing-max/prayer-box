import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Icon, Modal } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { screenText } from '../domain';
import {
  canManageEvent, canViewEvent, cancelPrayerEvent, createPrayerEvent, dismissPrayerInvitation,
  eligibleEventHosts, invitationsForViewer, invitePrayerEventToPerson,
  sharePrayerEvent, revokePrayerEventShare, updatePrayerEvent, requestPrayerConnection, respondToPrayerConnection,
  disconnectPrayerConnection, visibleManagedConnections, visibleConnectionRequests,
} from '../prayer-events';
import { eventLocalDateTime, eventLocalToIso, googleCalendarUrl, prayerEventIcs } from '../event-calendar';
import type { EventContext, EventHost, EventInput, PrayerConnection, PrayerEvent, PrayerEventState } from '../prayer-events';
import '../prayer-events.css';

export interface PrayerEventsProps {
  viewer: string;
  state: PrayerEventState;
  context: EventContext;
  onChange: (state: PrayerEventState) => void;
  onNavigate?: (route: string) => void;
  mode?: 'invitations' | 'events';
}
export interface ConnectionsPanelProps {
  additionalRequests?: ReactNode;
  directorySearch?: string;
  onDirectorySearch?: (value: string) => void;
  directoryFilter?: 'all' | 'groups' | 'people';
  onDirectoryFilter?: (value: 'all' | 'groups' | 'people') => void;
  view?: 'all' | 'directory' | 'groups' | 'people';
  hiddenPersonIds?: readonly string[];
  hiddenSearchIds?: readonly string[];
  viewer: string;
  connections: PrayerConnection[];
  context: EventContext;
  onChange: (connections: PrayerConnection[]) => void;
  onNavigate?: (route: string) => void;
}
const hostKey = (host: EventHost) => `${host.kind}:${host.id}`;
function hostLabel(host: EventHost, context: EventContext) {
  return host.kind === 'group' ? context.groups.find(group => group.id === host.id)?.name ?? 'Prayer group'
    : context.people.find(person => person.id === host.id)?.name ?? (host.id === 'team' ? 'Prayer Box' : 'Prayer Box member');
}
function hostUsername(host: EventHost, context: EventContext) {
  return host.kind === 'group' ? context.groups.find(group => group.id === host.id)?.username ?? ''
    : context.people.find(person => person.id === host.id)?.username ?? (host.id === 'team' ? 'prayerbox' : '');
}
function EventEditor({ event, hosts, context, onSave, onClose }: {
  event?: PrayerEvent; hosts: EventHost[]; context: EventContext;
  onSave: (host: EventHost, input: EventInput) => void; onClose: () => void;
}) {
  const feedback = useActionFeedback();
  const timeZone = event?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedHost, setSelectedHost] = useState(hostKey(event?.host ?? hosts[0]));
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [format, setFormat] = useState<'virtual' | 'in_person'>(event?.format ?? 'virtual');
  const [starts, setStarts] = useState(event ? eventLocalDateTime(event.startsAt, timeZone) : '');
  const [ends, setEnds] = useState(event ? eventLocalDateTime(event.endsAt, timeZone) : '');
  const [website, setWebsite] = useState(event?.website ?? '');
  const [meetingUrl, setMeetingUrl] = useState(event?.meetingUrl ?? '');
  const [address, setAddress] = useState(event?.address ?? '');
  const [audience, setAudience] = useState<'connections' | 'members'>(event?.audience ?? 'connections');
  const [shareable, setShareable] = useState(event?.shareable ?? false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<ReturnType<typeof screenText> | null>(null);
  const host = hosts.find(value => hostKey(value) === selectedHost) ?? event?.host;
  const submit = (submission: FormEvent) => {
    submission.preventDefault(); feedback.prepare(); setError(''); setReview(null);
    if (!host) { setError('Choose an available organizer.'); feedback.respond({ tone: 'error', title: 'Choose an available organizer.' }); return; }
    try {
      const startsAt = eventLocalToIso(starts, timeZone), endsAt = eventLocalToIso(ends, timeZone);
      // Match the prototype's review path for all invitation content. Keeping a
      // flagged draft here never mutates the existing event or widens its audience.
      const screening = screenText([title, description, website, format === 'virtual' ? meetingUrl : address].join('\n'));
      if (screening.state !== 'approved') {
        setReview(screening);
        feedback.respond({ tone: screening.state === 'pending' ? 'pending' : 'error',
          title: screening.state === 'pending' ? 'Your event needs a little review.' : 'Please revise your invitation.',
          message: event ? 'Your draft is still here. The shared invitation has not changed.' : 'Your draft is still here and has not been shared.' });
        return;
      }
      onSave(host, {
        title, description, format, startsAt, endsAt, timeZone,
        website: website.trim() || undefined, meetingUrl: format === 'virtual' ? meetingUrl.trim() || undefined : undefined,
        address: format === 'in_person' ? address.trim() || undefined : undefined,
        audience: host.kind === 'person' ? 'connections' : audience,
        shareable: (host.kind === 'person' || audience === 'connections') && shareable,
      });
    } catch (failure) { const message = failure instanceof Error ? failure.message : 'Please check the event details.'; setError(message); feedback.respond({ tone: 'error', title: message, message: 'Your event draft is still here.' }); }
  };
  return <Modal title={event ? 'Edit prayer event' : 'Invite others to pray'} onClose={onClose}>
    <form className="prayer-event-form" onSubmit={submit} onChange={() => setReview(null)}>
      <p>A prayer call, livestream, or time together. Keep the invitation clear, welcoming, and focused on prayer.</p>
      <label>Organized by<select value={selectedHost} disabled={Boolean(event)} onChange={change => { setSelectedHost(change.target.value); setAudience('connections'); setShareable(false); }}>{hosts.map(value => <option key={hostKey(value)} value={hostKey(value)}>{hostLabel(value, context)}</option>)}</select></label>
      <label>Event title<input value={title} onChange={change => setTitle(change.target.value)} maxLength={120} required placeholder="Morning prayer together" /></label>
      <label>A little information<textarea value={description} onChange={change => setDescription(change.target.value)} rows={4} maxLength={4000} required placeholder="Let people know what to expect and how they can join." /></label>
      <div className="prayer-event-times"><label>Starts<input type="datetime-local" value={starts} onChange={change => setStarts(change.target.value)} required /></label><label>Ends<input type="datetime-local" value={ends} onChange={change => setEnds(change.target.value)} required /></label></div>
      <p className="quiet-copy">Times are entered in {timeZone.replaceAll('_', ' ')}. Each person sees the event in their own local time.</p>
      <label>Where will you gather?<select value={format} onChange={change => setFormat(change.target.value as 'virtual' | 'in_person')}><option value="virtual">Online</option><option value="in_person">In person</option></select></label>
      {format === 'virtual' ? <label>Meeting or livestream link<input type="url" value={meetingUrl} onChange={change => setMeetingUrl(change.target.value)} maxLength={2048} required placeholder="https://…" /><span className="quiet-copy">Use the full link. Only invited audiences can see it here.</span></label> : <label>Meeting address<textarea value={address} onChange={change => setAddress(change.target.value)} maxLength={500} rows={3} required placeholder="Venue name and full address" /><span className="quiet-copy">Share an address you have permission to use. Attending is always optional.</span></label>}
      <label>More information link <span className="quiet-copy">(optional)</span><input type="url" value={website} onChange={change => setWebsite(change.target.value)} maxLength={2048} placeholder="https://…" /></label>
      {host?.kind === 'group' && <label>Send invitations to<select value={audience} disabled={Boolean(event)} onChange={change => { setAudience(change.target.value as 'connections' | 'members'); if (change.target.value === 'members') setShareable(false); }}><option value="connections">This group’s accepted connections</option><option value="members">This group’s approved members</option></select></label>}
      {host?.kind === 'person' && <p className="prayer-event-audience"><Icon name="people" /><span>This invitation goes to your accepted connections. Creating an event does not add anyone to your connections.</span></p>}
      {host?.kind === 'group' && audience === 'members' ? <p className="prayer-event-audience"><Icon name="lock" /><span>Only current approved members receive this event. They cannot share it with a wider audience.</span></p> : <label className="prayer-event-check"><input type="checkbox" disabled={Boolean(event && !event.shareable)} checked={shareable} onChange={change => setShareable(change.target.checked)} /><span>Let recipients share this invitation with their own connections or a group they administer.<small>The original organizer stays visible. Shared invitations keep the same event details.</small></span></label>}
      {event && <p className="quiet-copy">To invite a wider audience or turn on sharing, create a new event. You can turn sharing off here.</p>}
      {review && <div className="prayer-event-review" role="status"><h3>{review.category}</h3><p>{review.reason}</p><p>{event ? 'Your existing invitation is unchanged.' : 'This draft has not been shared.'} You can revise the details above. Human review for event drafts is not connected yet.</p></div>}
      {error && <p className="prayer-event-error" role="alert">{error}</p>}
      <div className="prayer-event-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{event ? 'Save event changes' : 'Share invitation'}<Icon name="check" /></button></div>
    </form>
  </Modal>;
}

export function PrayerEvents({ viewer, state, context, onChange, onNavigate, mode = 'invitations' }: PrayerEventsProps) {
  const feedback = useActionFeedback();
  const [editor, setEditor] = useState<PrayerEvent | 'new' | null>(null);
  const [share, setShare] = useState<PrayerEvent | null>(null);
  const [shareHost, setShareHost] = useState('');
  const [shareAudience, setShareAudience] = useState('connections');
  const [shareRecipient, setShareRecipient] = useState('');
  const [cancel, setCancel] = useState<PrayerEvent | null>(null);
  const [error, setError] = useState('');
  const hosts = eligibleEventHosts(viewer, context);
  const invitations = invitationsForViewer(state, viewer, context);
  const sharedInvitations = state.shares.filter(item => item.revokedAt == null && hosts.some(host => hostKey(host) === hostKey(item.host)) && canViewEvent(state, item.eventId, viewer, context));
  const selectedShareHost = hosts.find(host => hostKey(host) === shareHost);
  const directRecipients = selectedShareHost ? visibleManagedConnections(context.connections, viewer, context).filter(item => hostKey(item.as) === hostKey(selectedShareHost) && item.other.kind === 'person' && item.other.id !== viewer).map(item => item.other) : [];
  const owned = state.events.filter(event => canManageEvent(event, viewer, context)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const apply = (operation: () => PrayerEventState, message: string) => {
    feedback.prepare(); setError('');
    try { onChange(operation()); feedback.respond({ tone: 'success', title: message }); return true; }
    catch (failure) { const message = failure instanceof Error ? failure.message : 'This change could not be saved.'; setError(message); feedback.respond({ tone: 'error', title: message }); return false; }
  };
  const downloadCalendar = (event: PrayerEvent) => {
    feedback.prepare();
    try {
      const blob = new Blob([prayerEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'prayer-box-event.ics'; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback.respond({ tone: 'success', title: 'Your calendar file is ready.', message: 'Open the file to add it in Apple Calendar or another calendar app.' });
    } catch (failure) { feedback.respond({ tone: 'error', title: failure instanceof Error ? failure.message : 'This calendar file could not be prepared.' }); }
  };
  const eventCard = (event: PrayerEvent, via?: EventHost) => {
    const own = canManageEvent(event, viewer, context), cancelled = event.cancelledAt != null;
    const starts = new Date(event.startsAt), ends = new Date(event.endsAt), past = ends.getTime() < Date.now();
    return <article className={`panel prayer-event-card${cancelled ? ' cancelled' : ''}`} key={event.id}>
      <div className="prayer-event-heading"><div className="prayer-event-date" aria-hidden="true"><span>{starts.toLocaleDateString('en', { month: 'short' })}</span><strong>{starts.getDate()}</strong></div><div className="prayer-event-title"><p className="eyebrow">{cancelled ? 'Event cancelled' : past ? 'Past event' : event.format === 'virtual' ? 'Online prayer' : 'Prayer in person'}</p><h3>{event.title}</h3><p className="quiet-copy">Organized by {hostLabel(event.host, context)}</p>{via && <p className="event-invited-by">Invited by {hostLabel(via, context)}</p>}</div></div>
      <p className="prayer-event-description">{event.description}</p>
      <div className="prayer-event-details"><p><Icon name="sun" /><span><time dateTime={event.startsAt}>{starts.toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</time><br /><time dateTime={event.startsAt}>{starts.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</time> – <time dateTime={event.endsAt}>{starts.toDateString() === ends.toDateString() ? '' : `${ends.toLocaleDateString('en', { month: 'short', day: 'numeric' })}, `}{ends.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time></span></p>
        {!cancelled && (event.format === 'virtual' ? <p><Icon name="video" /><a className="text-link" href={event.meetingUrl} target="_blank" rel="noopener noreferrer nofollow">Open meeting or livestream<Icon name="arrow" size={17} /></a></p> : <p><Icon name="people" /><span className="prayer-event-address">{event.address}</span></p>)}
        {!cancelled && event.website && <p><Icon name="link" /><a className="text-link" href={event.website} target="_blank" rel="noopener noreferrer nofollow">More information<Icon name="arrow" size={17} /></a></p>}
      </div>
      {event.audience === 'members' && <p className="prayer-event-scope"><Icon name="lock" size={17} />For approved members · sharing is off</p>}
      {event.updatedAt > event.createdAt && <p className="quiet-copy">Updated <time dateTime={new Date(event.updatedAt).toISOString()}>{new Date(event.updatedAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</time></p>}
      {cancelled ? <p className="prayer-event-status">The organizer cancelled this event. If you saved it to a calendar, remove that copy there too.</p> : !past && <div className="prayer-event-actions prayer-event-calendar"><a className="button secondary" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">Google Calendar<Icon name="arrow" size={17} /></a><button className="button secondary" onClick={() => downloadCalendar(event)}>Apple / other calendar<Icon name="download" size={17} /></button></div>}
      {!cancelled && !past && <p className="quiet-copy prayer-event-calendar-help">Adding to a calendar copies these details outside Prayer Box. Saved calendar copies do not update automatically.</p>}
      <div className="prayer-event-actions prayer-event-footer">
        {own ? !cancelled && <><button className="text-link" onClick={() => { setError(''); setEditor(event); }}>Edit event<Icon name="edit" size={17} /></button>{event.audience !== 'members' && !past && <button className="text-link" onClick={() => { setError(''); setShare(event); setShareHost(hostKey(event.host)); setShareAudience('person'); setShareRecipient(''); }}>Invite a person</button>}<button className="text-link prayer-event-caution" onClick={() => { setError(''); setCancel(event); }}>Cancel event</button></> : <>
          {!cancelled && !past && event.shareable && event.audience !== 'members' && hosts.length > 0 && <button className="text-link" onClick={() => { setError(''); setShare(event); setShareHost(hostKey(hosts[0])); setShareAudience(hostKey(hosts[0])); setShareRecipient(''); }}>Share invitation<Icon name="arrow" size={17} /></button>}
          <button className="text-link" onClick={() => apply(() => dismissPrayerInvitation(state, event.id, viewer, context), 'Invitation dismissed.')}>Dismiss invitation<Icon name="close" size={17} /></button>
        </>}
      </div>
    </article>;
  };
  return <section className="prayer-events" aria-labelledby="prayer-events-title">
    <header className="prayer-events-heading"><div><p className="eyebrow">Prayer invitations</p><h1 id="prayer-events-title">A little time to pray together.</h1><p className="page-intro">Invitations from your connections and prayer groups, gathered in one quiet place.</p></div>{hosts.length > 0 && <button className="button primary" onClick={() => { setError(''); setEditor('new'); }}><Icon name="plus" />Create prayer event</button>}</header>
    {error && !share && !cancel && <p className="prayer-event-error" role="alert">{error}</p>}
    {!hosts.length && <div className="prayer-event-empty panel"><Icon name="mail" size={34} /><h2>Your invitations belong here.</h2><p>Sign in to connect with others, receive invitations, or create a prayer event.</p>{onNavigate && <button className="button secondary" onClick={() => onNavigate('signup')}>Create your prayer box<Icon name="arrow" /></button>}</div>}
    {hosts.length > 0 && <><section className="prayer-event-section" aria-labelledby="incoming-events-title"><div className="prayer-event-section-heading"><h2 id="incoming-events-title">Invitations for you</h2>{onNavigate && <button className="text-link" onClick={() => onNavigate('church')}>Manage connections<Icon name="people" size={18} /></button>}</div>{invitations.length ? <div className="prayer-event-grid">{invitations.map(invitation => eventCard(invitation.event, invitation.viaHost))}</div> : <div className="prayer-event-empty"><Icon name="mail" size={32} /><p>No invitations waiting right now. Accepted connections and approved groups can invite you to pray.</p></div>}</section>
      {sharedInvitations.length > 0 && <section className="prayer-event-section" aria-labelledby="shared-events-title"><h2 id="shared-events-title">Invitations you shared</h2>{sharedInvitations.map(item => {
        const event = state.events.find(value => value.id === item.eventId); if (!event) return null;
        return <article className="prayer-connection-row" key={item.id}><div><h3>{event.title}</h3><p className="quiet-copy">{item.recipientId ? `Invited ${hostLabel({kind:'person',id:item.recipientId}, context)}` : `Shared with ${hostLabel(item.host, context)}’s connections`} · originally from {hostLabel(event.host, context)}</p></div><button className="text-link prayer-event-caution" onClick={() => apply(() => revokePrayerEventShare(state, item.id, viewer, context), 'Your shared invitation was removed.')}>Remove shared invitation</button></article>;
      })}</section>}
      <section className="prayer-event-section" aria-labelledby="your-events-title"><h2 id="your-events-title">Events you organize</h2>{owned.length ? <div className="prayer-event-grid">{owned.map(event => eventCard(event))}</div> : <p className="quiet-copy">When you create an event, you can edit its details or cancel it here.</p>}</section>
    </>}
    {editor && hosts.length > 0 && <EventEditor key={editor === 'new' ? 'new' : editor.id} event={editor === 'new' ? undefined : editor} hosts={hosts} context={context} onClose={() => setEditor(null)} onSave={(host, input) => {
      feedback.prepare();
      const next = editor === 'new' ? createPrayerEvent(state, viewer, host, input, context) : updatePrayerEvent(state, editor.id, viewer, input, editor.version, context);
      onChange(next); setEditor(null); feedback.respond({ tone: 'success', title: editor === 'new' ? 'Your prayer invitation has been shared.' : 'Your event details have been updated.' });
    }} />}
    {share && <Modal title="Share this prayer invitation" onClose={() => setShare(null)}><div className="prayer-event-form">
      <label>Share with<select value={shareAudience} onChange={change => { setShareAudience(change.target.value); setShareRecipient(''); setError(''); }}>
        <option value="person">A specific person</option>
        {hosts.filter(host => hostKey(host) !== hostKey(share.host)).map(host => <option key={hostKey(host)} value={hostKey(host)}>{host.kind === 'person' ? 'My connections' : `${hostLabel(host, context)}’s connections`}</option>)}
        {shareAudience === 'connections' && <option value="connections" disabled>Choose an audience</option>}
      </select></label>
      {shareAudience === 'person' && <>
        {hosts.length > 1 && <label>Send as<select value={shareHost} onChange={event => {setShareHost(event.target.value);setShareRecipient('');}}>{hosts.map(host => <option key={hostKey(host)} value={hostKey(host)}>{hostLabel(host,context)}</option>)}</select></label>}
        <label>Person<select value={shareRecipient} onChange={event => setShareRecipient(event.target.value)}><option value="">Choose an accepted connection</option>{directRecipients.map(person => <option key={person.id} value={person.id}>{hostLabel(person,context)} · @{hostUsername(person,context)}</option>)}</select></label>
        {!directRecipients.length && <p className="quiet-copy">No accepted connections are available for this profile yet.</p>}
      </>}
      {error && <p className="prayer-event-error" role="alert">{error}</p>}
      <div className="prayer-event-actions"><button className="button secondary" onClick={() => setShare(null)}>Cancel</button><button className="button primary" disabled={shareAudience === 'person' ? !shareRecipient : shareAudience === 'connections'} onClick={() => {
        if (shareAudience === 'person' && selectedShareHost) {
          if (apply(() => invitePrayerEventToPerson(state,share.id,viewer,selectedShareHost,shareRecipient,context),'Invitation sent to your selected person.')) setShare(null);
        } else { const host = hosts.find(value => hostKey(value) === shareAudience); if (host && apply(() => sharePrayerEvent(state, share.id, viewer, host, context), 'Invitation shared with your selected connections.')) setShare(null); }
      }}>Share invitation</button></div>
    </div></Modal>}
    {cancel && <Modal title={`Cancel ${cancel.title}?`} onClose={() => setCancel(null)}><div className="prayer-event-form"><p>People who can still access the event will see that it was cancelled, including on shared invitations. Copies already saved in a calendar must be removed there separately.</p>{error && <p className="prayer-event-error" role="alert">{error}</p>}<div className="prayer-event-actions"><button className="button secondary" onClick={() => setCancel(null)}>Keep event</button><button className="button primary" onClick={() => { if (apply(() => cancelPrayerEvent(state, cancel.id, viewer, cancel.version, context), 'Your prayer event has been cancelled.')) setCancel(null); }}>Cancel event<Icon name="check" /></button></div></div></Modal>}
    {mode === 'events' && <span className="sr-only">Your invitations and organized events are shown together.</span>}
  </section>;
}

export function ConnectionsPanel({ viewer, connections, context, onChange, onNavigate, additionalRequests, directorySearch, onDirectorySearch, directoryFilter = 'all', onDirectoryFilter, view = 'all', hiddenPersonIds = [], hiddenSearchIds = [] }: ConnectionsPanelProps) {
  const feedback = useActionFeedback();
  const [search, setSearch] = useState('');
  const [fromHost, setFromHost] = useState(`person:${viewer}`);
  const [disconnect, setDisconnect] = useState<PrayerConnection | null>(null);
  const [connectTarget, setConnectTarget] = useState<EventHost | null>(null);
  const [error, setError] = useState('');
  const hosts = eligibleEventHosts(viewer, context);
  const active = visibleManagedConnections(connections, viewer, context);
  const pending = visibleConnectionRequests(connections, viewer, context);
  const requestRows = pending.filter(row => directoryFilter === 'all' || directoryFilter === 'groups' && row.other.kind === 'group' || directoryFilter === 'people' && row.other.kind === 'person');
  const extraRequests = directoryFilter === 'groups' ? null : additionalRequests;
  const sourceHost = hosts.find(host => hostKey(host) === fromHost) ?? hosts[0];
  const query = directorySearch ?? search;
  const needle = query.trim().replace(/^@/, '').toLowerCase();
  const matches = (host: EventHost) => `${hostLabel(host, context)} ${hostUsername(host, context)}`.toLowerCase().includes(needle);
  const targets: EventHost[] = needle ? [
    ...context.people.filter(person => person.active && person.id !== viewer && !hiddenSearchIds.includes(person.id)).map(person => ({ kind: 'person' as const, id: person.id })),
    ...(view === 'all' ? context.groups.filter(group => !group.archivedAt).map(group => ({ kind: 'group' as const, id: group.id })) : []),
  ].filter(target => matches(target) && !(view === 'directory' && sourceHost?.kind === 'person' && target.kind === 'person' && hiddenPersonIds.includes(target.id)) && directoryFilter !== 'groups' && !hosts.some(host => hostKey(host) === hostKey(target)) && !(sourceHost?.kind === 'group' && target.kind === 'group') && !context.blocks?.some(pair => target.kind === 'person' && (pair.blockerId === viewer && pair.blockedId === target.id || pair.blockerId === target.id && pair.blockedId === viewer))) : [];
  const listed = active.filter(item => matches(item.other) && (view === 'all' || (view === 'groups' ? item.other.kind === 'group' || item.other.id === 'team' : item.other.kind === 'person' && item.other.id !== 'team' && !hiddenPersonIds.includes(item.other.id)))).sort((a,b) => Number(a.other.id === 'team') - Number(b.other.id === 'team'));
  const act = (operation: () => PrayerConnection[], title: string) => {
    feedback.prepare(); setError('');
    try { onChange(operation()); feedback.respond({ tone: 'success', title }); return true; }
    catch (failure) { const message = failure instanceof Error ? failure.message : 'This connection could not be changed.'; setError(message); feedback.respond({ tone: 'error', title: message }); return false; }
  };
  const routeFor = (host: EventHost) => host.kind === 'group' ? `group/${hostUsername(host, context)}` : `box/${host.id === 'elena' ? 'mine' : host.id === 'team' ? 'prayerbox' : host.id}`;
  return <section className={`prayer-connections connection-view-${view}`} aria-label={view === 'directory' ? 'Find people and groups' : view === 'groups' ? 'Connected organizations' : 'Your connections'}>
    {(view === 'all' || view === 'directory') && <>
      <header className="prayer-event-section-heading"><div><p className="eyebrow">My Church</p><h1>People to pray with.</h1></div></header>
      <div className="church-directory-toolbar">
        <label className="prayer-connection-input"><Icon name="search" /><span className="sr-only">Find a person or group by name or username</span><input type="search" value={query} onChange={change => onDirectorySearch ? onDirectorySearch(change.target.value) : setSearch(change.target.value)} placeholder="Search names or @usernames" autoComplete="off" maxLength={80} /></label>
        {onDirectoryFilter && <label className="church-directory-filter"><span className="sr-only">Show people or groups</span><select value={directoryFilter} onChange={event => onDirectoryFilter(event.target.value as 'all' | 'groups' | 'people')}><option value="all">Everyone</option><option value="groups">Groups & organizations</option><option value="people">Friends & people</option></select></label>}
      </div>
      {hosts.length > 0 && <section className="prayer-connection-requests" aria-labelledby="connection-requests-title"><h2 id="connection-requests-title">New connection requests</h2>{extraRequests}{requestRows.map(request => <article className="prayer-connection-row" key={request.connection.id}><div><h3>{hostLabel(request.other, context)}</h3><p>{request.direction === 'incoming' ? 'Wants to connect with' : 'Request sent from'} {hostLabel(request.as, context)}.</p><p className="quiet-copy">@{hostUsername(request.other, context)}</p></div><div className="prayer-event-actions">{request.direction === 'incoming' ? <><button className="button primary" onClick={() => act(() => respondToPrayerConnection(connections, request.connection.id, viewer, 'accept', context), 'Connection accepted.')}>Accept</button><button className="text-link" onClick={() => act(() => respondToPrayerConnection(connections, request.connection.id, viewer, 'decline', context), 'Connection request declined.')}>Decline</button></> : <button className="text-link" onClick={() => act(() => respondToPrayerConnection(connections, request.connection.id, viewer, 'withdraw', context), 'Connection request withdrawn.')}>Withdraw request</button>}</div></article>)}{!requestRows.length && !extraRequests && <p className="quiet-copy">No connection requests waiting right now.</p>}</section>}
      {needle && hosts.length > 1 && <label className="connection-source">Connect as<select value={sourceHost ? hostKey(sourceHost) : ''} onChange={change => setFromHost(change.target.value)}>{hosts.map(host => <option key={hostKey(host)} value={hostKey(host)}>{hostLabel(host, context)}</option>)}</select></label>}
      {needle && targets.length > 0 && <section className="church-directory-results" aria-label="Matching people and groups"><h2>Search results</h2>
        {targets.map(target => {
          const already = active.some(item => sourceHost && hostKey(item.as) === hostKey(sourceHost) && hostKey(item.other) === hostKey(target));
          const waiting = pending.some(request => sourceHost && hostKey(request.as) === hostKey(sourceHost) && hostKey(request.other) === hostKey(target));
          return <article className="prayer-connection-row" key={hostKey(target)}><div><h3>{hostLabel(target, context)}</h3><p>@{hostUsername(target, context)}</p></div><div className="prayer-event-actions"><button className="button secondary" onClick={() => onNavigate?.(routeFor(target))}>View prayer box</button>{already ? <span className="prayer-connection-status">Connected</span> : waiting ? <span className="prayer-connection-status">Request sent!</span> : <button className="button secondary" onClick={() => { if (!sourceHost) { onNavigate?.('signup'); return; } setError(''); setConnectTarget(target); }}>Connect</button>}</div></article>;
        })}
      </section>}
      {needle && !targets.length && directoryFilter === 'people' && !context.people.some(person => hiddenPersonIds.includes(person.id) && `${person.name} ${person.username}`.toLowerCase().includes(needle)) && <p role="status">No available person matches your search.</p>}
    </>}
    {view !== 'directory' && <div className="prayer-connection-list">{listed.map(item => <article className="prayer-connection-row" key={item.connection.id}><div className="prayer-connection-identity"><span className="prayer-connection-icon"><Icon name={item.other.id === 'team' ? 'box' : item.other.kind === 'group' ? 'people' : 'heart'} /></span><div><h3>{hostLabel(item.other, context)}</h3><p>@{hostUsername(item.other, context)}</p>{item.as.kind === 'group' && <p className="quiet-copy">Connected with {hostLabel(item.as, context)}</p>}</div></div><div className="prayer-event-actions"><button className="button secondary" onClick={() => onNavigate?.(routeFor(item.other))}>View prayer box</button><button className="text-link prayer-event-caution" onClick={() => { setError(''); setDisconnect(item.connection); }}>{view === 'groups' ? 'Leave community' : 'Disconnect'}</button></div></article>)}</div>}
    {error && !connectTarget && !disconnect && <p className="prayer-event-error" role="alert">{error}</p>}
    {connectTarget && sourceHost && <Modal title={`Connect with ${hostLabel(connectTarget, context)}?`} onClose={() => setConnectTarget(null)}><div className="prayer-event-form"><p>This shares {hostLabel(sourceHost, context)}’s profile name and username with {hostLabel(connectTarget, context)}. They must accept before the connection starts.</p><p className="quiet-copy">No prayer text, anonymous identity, or link to prayer activity is included.</p>{error && <p role="alert">{error}</p>}<div className="prayer-event-actions"><button className="button secondary" onClick={() => setConnectTarget(null)}>Cancel</button><button className="button primary" onClick={() => { if (act(() => requestPrayerConnection(connections, viewer, connectTarget, context, { from: sourceHost }), 'Connection request sent.')) setConnectTarget(null); }}>Send connection request</button></div></div></Modal>}
    {disconnect && <Modal title="Disconnect?" onClose={() => setDisconnect(null)}><div className="prayer-event-form"><p>If you want to reconnect later, you will need to send a new connection request and the other person or group will need to accept it again.</p>{error && <p role="alert">{error}</p>}<div className="prayer-event-actions"><button className="button secondary" onClick={() => setDisconnect(null)}>Keep connection</button><button className="button primary" onClick={() => { if (act(() => disconnectPrayerConnection(connections, disconnect.id, viewer, context), 'Connection removed.')) setDisconnect(null); }}>Disconnect</button></div></div></Modal>}
  </section>;
}
