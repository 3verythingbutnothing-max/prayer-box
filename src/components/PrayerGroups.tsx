import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon, Modal } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { normalizeOrganizationWebsite } from '../organization';
import { applyGroupCommand, createPrayerGroup, groupIcons, groupPeople, isGroupAdmin, planGroupDeparture } from '../prayer-groups';
import type { GroupCommand, GroupIcon, GroupState, PrayerGroup } from '../prayer-groups';
import '../prayer-groups.css';

type Props = { standalone?: boolean; viewer: string; state: GroupState; onChange: (state: GroupState) => void; selectedHandle?: string; onNavigate?: (route: string) => void };
const date = (time: number) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(time);
function GroupPicture({ group }: { group: Pick<PrayerGroup, 'image' | 'icon' | 'name'> }) {
  return <span className="group-picture">{group.image ? <img src={group.image} alt="" /> : <Icon name={group.icon} size={32} />}</span>;
}

/** Decode and re-encode locally: original bytes/metadata never become the preview. */
export async function makeGroupImagePreview(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG, or WebP image smaller than 2 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('That file does not match a supported image format.');
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width > 8000 || image.height > 8000 || image.width * image.height > 24_000_000)
      throw new Error('Choose an image smaller than 8,000 pixels per side and 24 megapixels.');
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image preview is unavailable. Please choose an icon instead.');
    const edge = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, 256, 256);
    return canvas.toDataURL('image/png');
  } finally { image.close(); }
}

function GroupEditor({ group, onSave, onClose }: { group?: PrayerGroup; onSave: (values: { name: string; username: string; website: string; icon: GroupIcon; image?: string }) => void; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [username, setUsername] = useState(group?.username ?? '');
  const [website, setWebsite] = useState(group?.website ?? '');
  const [icon, setIcon] = useState<GroupIcon>(group?.icon ?? 'heart');
  const [image, setImage] = useState(group?.image);
  const [error, setError] = useState(''); const [reading, setReading] = useState(false);
  const imageSequence = useRef(0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = normalizeOrganizationWebsite(website);
    if (!result.valid) { setError(result.error); return; }
    try { onSave({ name, username, website: result.url, icon, image }); } catch (error) { setError(error instanceof Error ? error.message : 'Please check the details.'); }
  };
  return <Modal title={group ? 'Edit prayer group' : 'Create a prayer group'} onClose={onClose}>
    <form className="group-form" onSubmit={submit}>
      <p>A small place to pray together. Every person uses their own account, and members join only after approval.</p>
      <label>Group name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="off" /></label>
      <label>Unique username<input value={username} onChange={event => setUsername(event.target.value)} required disabled={Boolean(group)} maxLength={33} autoComplete="off" placeholder="@your-prayer-group" /></label>
      <p className="quiet-copy">{group ? 'Your username stays the same so shared links keep working.' : 'Use 3–32 letters, numbers, or hyphens. This is how others find your group.'}</p>
      <label>Website <span className="quiet-copy">(optional)</span><input value={website} onChange={event => setWebsite(event.target.value)} type="text" inputMode="url" maxLength={2048} placeholder="https://yourchurch.org" /></label>
      <fieldset className="group-icon-field"><legend>Choose a little picture</legend><div className="group-icons">
        {groupIcons.map(value => <button key={value} type="button" className={`group-picture ${!image && icon === value ? 'selected' : ''}`} aria-label={`${value} icon`} aria-pressed={!image && icon === value} onClick={() => { imageSequence.current++; setIcon(value); setImage(undefined); setReading(false); }}><Icon name={value} size={29} /></button>)}
      </div></fieldset>
      <label className="group-upload">Or choose your own image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        const sequence = ++imageSequence.current; setReading(true); setError('');
        try { const preview = await makeGroupImagePreview(file); if (sequence === imageSequence.current) setImage(preview); }
        catch (error) { if (sequence === imageSequence.current) setError(error instanceof Error ? error.message : 'That image could not be opened.'); }
        finally { if (sequence === imageSequence.current) setReading(false); event.target.value = ''; }
      }} /></label>
      <p className="quiet-copy">PNG, JPEG, or WebP, up to 2 MB. Custom pictures stay in this browser preview; publication will require screening.</p>
      {image && <div className="group-preview"><GroupPicture group={{ name, icon, image }} /><button type="button" className="text-link" onClick={() => { imageSequence.current++; setImage(undefined); setReading(false); }}>Remove custom picture</button></div>}
      {error && <p className="group-error" role="alert">{error}</p>}
      <div className="group-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={reading}>{reading ? 'Preparing picture…' : group ? 'Save changes' : 'Create prayer group'}<Icon name="check" /></button></div>
    </form>
  </Modal>;
}

export function PrayerGroups({ standalone = false, viewer, state, onChange, selectedHandle, onNavigate }: Props) {
  const feedback = useActionFeedback();
  const Heading = standalone ? 'h1' : 'h2';
  const actor = groupPeople.find(person => person.id === viewer);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<PrayerGroup | 'new' | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const [successor, setSuccessor] = useState('');
  const [invite, setInvite] = useState('');
  const [confirmation, setConfirmation] = useState<{ group: PrayerGroup; command: GroupCommand; title: string } | null>(null);
  const selected = selectedHandle ? state.find(group => group.username === selectedHandle.replace(/^@/, '') && !group.archivedAt) : undefined;
  const managed = state.find(group => group.id === manageId && !group.archivedAt);
  const leaving = state.find(group => group.id === leaveId && !group.archivedAt);
  const send = (group: PrayerGroup, command: GroupCommand, message: string) => {
    if (!actor) return;
    feedback.prepare();
    try {
      const current = state.find(value => value.id === group.id); if (!current) throw new Error('This group is no longer available.');
      const next = applyGroupCommand(current, actor, command, group.version, groupPeople);
      onChange(state.map(value => value.id === next.id ? next : value));
      feedback.respond({ tone: 'success', title: message });
      setConfirmation(null);
      return next;
    } catch (error) { feedback.respond({ tone: 'error', title: error instanceof Error ? error.message : 'This change could not be saved.' }); }
  };
  const myGroups = actor ? state.filter(group => !group.archivedAt && group.members.some(member => member.id === actor.id && ['approved', 'invited', 'pending'].includes(member.status))) : [];
  const query = search.trim().replace(/^@/, '').toLowerCase();
  const found = query ? state.filter(group => !group.archivedAt && group.username === query && !myGroups.some(mine => mine.id === group.id)) : [];
  const action = (group: PrayerGroup) => {
    const membership = group.members.find(member => member.id === viewer);
    if (!actor) return <button className="button secondary" onClick={() => onNavigate?.('signup')}>Sign in to join</button>;
    if (membership?.status === 'blocked') return <p className="quiet-copy">This group is unavailable.</p>;
    if (membership?.status === 'invited') return <div className="group-actions"><button className="button primary" onClick={() => send(group, { type: 'accept_invite' }, 'You have joined this prayer group.')}>Accept invitation</button><button className="button secondary" onClick={() => send(group, { type: 'decline_invite' }, 'Invitation declined.')}>Decline</button></div>;
    if (membership?.status === 'pending') return <div className="group-actions"><span className="group-status">Awaiting approval</span><button className="text-link" onClick={() => send(group, { type: 'withdraw' }, 'Your join request was withdrawn.')}>Withdraw request</button></div>;
    if (membership?.status === 'approved') return <div className="group-actions">
      {isGroupAdmin(group, viewer) && <><button className="button secondary" onClick={() => { setManageId(group.id); setInvite(''); }}>Members & invitations</button><button className="icon-button" aria-label={`Edit ${group.name}`} onClick={() => setEditor(group)}><Icon name="edit" /></button></>}
      <button className="text-link" onClick={() => { setLeaveId(group.id); setSuccessor(''); }}>Leave group</button>
    </div>;
    return <button className="button secondary" onClick={() => send(group, { type: 'request_join' }, 'Your request to join is awaiting admin approval.')}>Request to join<Icon name="plus" /></button>;
  };
  const card = (group: PrayerGroup) => <article className="panel group-card" key={group.id}>
    <div className="group-card-heading"><GroupPicture group={group} /><div><h3>{group.name}</h3><p>@{group.username}</p></div></div>
    {isGroupAdmin(group, viewer) && <span className="group-status"><Icon name="shield" size={17} />You are an admin</span>}
    {group.website && <a className="text-link" href={group.website} target="_blank" rel="noopener noreferrer nofollow">Visit website<Icon name="arrow" size={17} /></a>}
    <p className="quiet-copy">A prayer group with its own box. Personal requests and friendships stay separate.</p>
    {action(group)}
    {!selectedHandle && <button className="text-link" onClick={() => onNavigate?.(`group/${group.username}`)}>View prayer group<Icon name="arrow" size={17} /></button>}
  </article>;
  let departure: ReturnType<typeof planGroupDeparture> | undefined;
  if (leaving && actor) { try { departure = planGroupDeparture(leaving, actor.id, successor || undefined); } catch { /* stale membership: confirmation remains unavailable */ } }
  return <section className="prayer-groups" aria-labelledby="prayer-groups-title">
    <div className="group-section-heading"><div><p className="eyebrow">Your organizations</p><Heading id="prayer-groups-title" tabIndex={-1}>{selected ? selected.name : 'A little community for prayer.'}</Heading></div>{actor && !selectedHandle && <button className="button primary" onClick={() => setEditor('new')}><Icon name="plus" />Create prayer group</button>}</div>
    {!actor && <p className="quiet-copy">Sign in to create a group, manage memberships, or accept an invitation.</p>}
    {selectedHandle ? selected ? <>{card(selected)}<div className="group-inbox panel"><Icon name="box" size={32} /><h3>Room for prayer, together.</h3><p>Approved members share this group’s prayer inbox. Personal deliveries stay in each person’s own box.</p>{selected.id === 'grace' ? <button className="button secondary" onClick={() => onNavigate?.('box/grace')}>Open prayer inbox<Icon name="arrow" /></button> : <p className="quiet-copy">This new group has no prayer requests yet. Request delivery for newly created groups is still being connected.</p>}</div></> : <p role="status">This group is not available.</p> : <>
      <label className="group-search"><Icon name="search" /><span className="sr-only">Find a prayer group by its exact username</span><input type="search" placeholder="Find a group by @username" value={search} onChange={event => setSearch(event.target.value)} maxLength={33} /></label>
      <p className="quiet-copy">Use the group’s exact username, such as @grace-church. Joining always needs approval.</p>
      <div className="group-grid">{myGroups.filter(group => !query || group.username.includes(query)).map(card)}{found.map(card)}</div>
      {query && !found.length && !myGroups.some(group => group.username.includes(query)) && <p role="status">No available group matches that username.</p>}
      {!myGroups.length && !query && <p className="group-empty">You have no prayer groups yet. Create a small group, search its username, or accept an invitation here.</p>}
    </>}
    {editor && actor && <GroupEditor group={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSave={values => {
      feedback.prepare();
      if (editor === 'new') { const next = createPrayerGroup(state, actor, values); onChange([...state, next]); feedback.respond({ tone: 'success', title: 'Your prayer group is ready.', message: 'You are its first admin. Invite someone to pray with you.' }); setEditor(null); }
      else if (send(editor, { type: 'edit', ...values }, 'Your prayer group has been updated.')) setEditor(null);
    }} />}
    {managed && actor && isGroupAdmin(managed, actor.id) && <Modal title={`${managed.name} · Members`} wide onClose={() => setManageId(null)}>
      <div className="group-form"><p>Approval grants access to organization-addressed requests under their disclosed history policy. Admin access also allows membership and group settings changes.</p>
        <form className="group-invite" onSubmit={event => { event.preventDefault(); const person = groupPeople.find(person => person.username === invite.trim().replace(/^@/, '').toLowerCase()); if (!person) { feedback.respond({ tone: 'error', title: 'Enter the exact username of an available account.' }); return; } if (send(managed, { type: 'invite', targetId: person.id }, 'Invitation added. They can accept or decline.')) setInvite(''); }}>
          <label>Invite by @username<input value={invite} onChange={event => setInvite(event.target.value)} placeholder="@daniel" required autoComplete="off" /></label><button className="button primary">Invite<Icon name="mail" /></button>
        </form>
        <div className="group-member-list">{managed.members.filter(member => member.status !== 'left' && member.status !== 'declined').map(member => <article className="group-member" key={member.id}>
          <div><h3>{member.name}</h3><p>@{member.username} · {member.status === 'approved' ? member.role === 'admin' ? 'Admin' : 'Approved member' : member.status}</p>{member.joinedAt && <p className="quiet-copy">Joined <time dateTime={new Date(member.joinedAt).toISOString()}>{date(member.joinedAt)}</time></p>}</div>
          <div className="group-actions">{member.status === 'pending' && <><button className="button secondary" onClick={() => send(managed, { type: 'approve', targetId: member.id }, 'Membership approved.')}>Approve</button><button className="text-link" onClick={() => send(managed, { type: 'deny', targetId: member.id }, 'Join request denied.')}>Deny</button></>}
          {member.status === 'invited' && <button className="text-link" onClick={() => send(managed, { type: 'cancel_invite', targetId: member.id }, 'Invitation cancelled.')}>Cancel invitation</button>}
          {member.status === 'approved' && <><button className="text-link" onClick={() => setConfirmation({ group: managed, command: { type: member.role === 'admin' ? 'demote' : 'promote', targetId: member.id }, title: member.role === 'admin' ? `Remove ${member.name}’s admin access?` : `Give ${member.name} admin access?` })}>{member.role === 'admin' ? 'Remove admin access' : 'Make admin'}</button><button className="text-link" onClick={() => setConfirmation({ group: managed, command: { type: 'set_official_reply', targetId: member.id, allowed: !member.officialReply }, title: member.officialReply ? `Remove ${member.name}’s group reply permission?` : `Allow ${member.name} to reply as ${managed.name}?` })}>{member.officialReply ? 'Remove group reply permission' : 'Allow replies as group'}</button>{member.id !== viewer && member.role !== 'admin' && <button className="text-link" onClick={() => setConfirmation({ group: managed, command: { type: 'remove', targetId: member.id }, title: `Remove ${member.name} from this group?` })}>Remove member</button>}</>}
          {member.id !== viewer && member.role !== 'admin' && (member.status === 'blocked' ? <button className="text-link" onClick={() => send(managed, { type: 'unblock', targetId: member.id }, 'Group block removed. A new join request still needs approval.')}>Unblock</button> : <button className="text-link" onClick={() => setConfirmation({ group: managed, command: { type: 'block', targetId: member.id }, title: `Block ${member.name} from this group?` })}>Block from group</button>)}</div>
        </article>)}</div>
      </div>
    </Modal>}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.command.type === 'promote' ? 'This person can edit the group, approve or remove members, and manage admin access. This does not reveal anonymous identities or private personal prayers.' : confirmation.command.type === 'set_official_reply' ? confirmation.command.allowed ? 'They may deliberately choose the group’s name when replying. This is separate from admin access, and every reply still needs screening. Their own account remains recorded internally.' : 'They may still reply personally, but cannot use the group’s name. Their membership and admin role stay the same.' : confirmation.command.type === 'block' ? 'They will lose membership access and cannot request to join again until an admin unblocks them.' : confirmation.command.type === 'remove' ? 'Their membership access ends immediately. They may request to join again, subject to approval.' : 'They will remain an approved member. Every group needs at least one active admin.'}</p><div className="group-actions"><button className="button secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="button primary" onClick={() => send(confirmation.group, confirmation.command, 'Group membership updated.')}>Confirm change<Icon name="check" /></button></div></Modal>}
    {leaving && departure && <Modal title={`Leave ${leaving.name}?`} onClose={() => setLeaveId(null)}><div className="group-form">
      <p>Your access to this group’s private prayers, replies, pictures, and future notifications will end. Your personal box and friends stay separate.</p>
      {departure.successor && <><label>Next admin<select value={successor} onChange={event => setSuccessor(event.target.value)}><option value="">Automatic</option>{departure.eligible.map(member => <option key={member.id} value={member.id}>{member.name} (@{member.username})</option>)}</select></label><p className="group-transfer"><Icon name="shield" /><span>{departure.successor.name} will become an admin when you leave.{!successor && ' They have the longest active membership.'}</span></p></>}
      {departure.archive && <p className="group-transfer">There is no other active approved member. This group will be archived when you leave; no outsider will be appointed.</p>}
      <div className="group-actions"><button className="button secondary" onClick={() => setLeaveId(null)}>Stay in group</button><button className="button primary" onClick={() => { if (send(leaving, { type: 'leave', successorId: successor || undefined }, departure.archive ? 'You have left. The group is now archived.' : 'You have left the prayer group.')) { setLeaveId(null); setManageId(null); requestAnimationFrame(() => document.getElementById('prayer-groups-title')?.focus({ preventScroll: true })); } }}>Confirm and leave<Icon name="exit" /></button></div>
    </div></Modal>}
  </section>;
}
