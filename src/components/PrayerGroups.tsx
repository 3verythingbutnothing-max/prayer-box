import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon, Modal } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { normalizeOrganizationWebsite } from '../organization';
import { applyGroupCommand, canModerateGroup, createPrayerGroup, groupColors, groupIcons, groupNoticesForCommand, groupPeople, isGroupAdmin, isGroupModerator, planGroupDeparture } from '../prayer-groups';
import type { GroupCommand, GroupColor, GroupIcon, GroupPerson, GroupNotice, GroupState, PrayerGroup } from '../prayer-groups';
import '../prayer-groups.css';
import { makePicturePreview } from '../picture-preview';

type Props = { descriptions?: Readonly<Record<string,string>>; onEditDescription?: (groupId:string) => void; people?: readonly GroupPerson[]; standalone?: boolean; directorySearch?: string; viewer: string; state: GroupState; onChange: (state: GroupState, notices?: GroupNotice[]) => void; selectedHandle?: string; onNavigate?: (route: string) => void };
const date = (time: number) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(time);
function GroupPicture({ group }: { group: Pick<PrayerGroup, 'image' | 'icon' | 'name' | 'color'> }) {
  return <span className={`group-picture group-tone-${group.color ?? "lavender"}`}>{group.image ? <img src={group.image} alt="" /> : <Icon name={group.icon} size={32} />}</span>;
}

function describeChange(group: PrayerGroup, command: GroupCommand): string {
  if (command.type === 'set_role') {
    if (command.role === 'admin') return 'They can manage roles, group settings and invitations, approve or remove members, and moderate this group’s posts. Anonymous identities and personal prayer boxes remain private. They will receive a notice about their new role.';
    if (command.role === 'moderator') return 'They can approve or deny join requests, remove ordinary members, and remove inappropriate posts in this group. They cannot change roles, remove other moderators or admins, or edit group settings. They will receive a notice about their new role.';
    return 'They will stay an approved member and can continue to pray with the group. Their admin or moderator controls will be removed, and they will receive a notice. Every group needs at least one active admin.';
  }
  if (command.type === 'set_official_reply') return command.allowed
    ? 'They may deliberately choose the group’s name when replying. This is separate from their role, and every reply still needs screening. Their own account remains recorded internally.'
    : 'They may still reply personally, but cannot use the group’s name. Their membership and role stay the same.';
  if (command.type === 'block') return 'Their membership access ends immediately, and they cannot request to join again until an admin unblocks them. They will receive a private notice. Their personal box and deliveries to other boxes are unaffected.';
  if (command.type === 'remove') return 'Their membership access ends immediately. They will receive a private notice and may request to join again, subject to approval. Their personal box and deliveries to other boxes are unaffected.';
  if (command.type === 'request_deletion') return group.members.filter(member => member.status === 'approved' && member.role === 'admin').length === 1
    ? 'You are the only admin. Confirming will close this group and its prayer box, end group access, and notify its members. Personal boxes and separate deliveries elsewhere are unaffected. This does not promise erasure of every stored record.'
    : 'This starts a private deletion proposal and records your approval. The group stays open until every admin agrees. Once all agree, the group and its prayer box close and members are notified. Personal boxes and separate deliveries elsewhere are unaffected. Any admin can cancel the proposal.';
  if (command.type === 'approve_deletion') return 'Your approval applies to this deletion proposal. If every admin has now agreed, the group and its prayer box will close immediately and members will be notified. Personal boxes and separate deliveries elsewhere are unaffected. This does not promise erasure of every stored record.';
  return 'This change applies only to this prayer group.';
}


function GroupEditor({ group, onSave, onClose }: { group?: PrayerGroup; onSave: (values: { name: string; username: string; website: string; icon: GroupIcon; image?: string; color?: GroupColor }) => void; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [username, setUsername] = useState(group?.username ?? '');
  const [website, setWebsite] = useState(group?.website ?? '');
  const [icon, setIcon] = useState<GroupIcon>(group?.icon ?? 'heart');
  const [image, setImage] = useState(group?.image);
  const [color, setColor] = useState<GroupColor>(group?.color ?? 'lavender');
  const [error, setError] = useState(''); const [reading, setReading] = useState(false);
  const imageSequence = useRef(0);
  const initial = useRef({ name: group?.name ?? '', username: group?.username ?? '', website: group?.website ?? '', icon: group?.icon ?? 'heart', image: group?.image, color: group?.color ?? 'lavender' });
  const form = useRef<HTMLFormElement>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousScroll = useRef(0);
  const submitFrame = useRef<number | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const changed = name !== initial.current.name || username !== initial.current.username || website !== initial.current.website || icon !== initial.current.icon || image !== initial.current.image || color !== initial.current.color;
  useEffect(() => () => {
    imageSequence.current++;
    if (submitFrame.current !== null) cancelAnimationFrame(submitFrame.current);
  }, []);
  useEffect(() => {
    if (confirmExit) keepEditingButton.current?.focus();
    else if (previousFocus.current?.isConnected) {
      if (form.current?.parentElement) form.current.parentElement.scrollTop = previousScroll.current;
      previousFocus.current.focus({ preventScroll: true });
    }
  }, [confirmExit]);
  const requestClose = () => {
    if (confirmExit) { setConfirmExit(false); return; }
    if (!changed && !reading) { onClose(); return; }
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousScroll.current = form.current?.parentElement?.scrollTop ?? 0;
    setConfirmExit(true);
  };
  const saveAndExit = () => {
    setConfirmExit(false);
    // Restore the form before native validation, so invalid fields stay visible.
    submitFrame.current = requestAnimationFrame(() => { submitFrame.current = null; form.current?.requestSubmit(); });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = normalizeOrganizationWebsite(website);
    if (!result.valid) { setError(result.error); return; }
    try { onSave({ name, username, website: result.url, icon, image, color }); } catch (error) { setError(error instanceof Error ? error.message : 'Please check the details.'); }
  };
  return <Modal title={confirmExit ? 'Save your changes?' : group ? 'Edit prayer group' : 'Create a prayer group'} onClose={requestClose} closeOnBackdrop className="group-editor-dialog">
    {confirmExit && <div className="group-exit-confirmation">
      <p>You have unsaved changes to this prayer group. Would you like to save them before leaving?</p>
      {reading && <p className="quiet-copy" role="status">Your picture is still being prepared. You can keep editing or discard these changes.</p>}
      <div className="group-actions"><button className="button primary" disabled={reading} onClick={saveAndExit}>Save changes</button><button className="button secondary" onClick={onClose}>Discard changes</button><button ref={keepEditingButton} className="text-link" onClick={() => setConfirmExit(false)}>Keep editing</button></div>
    </div>}
    <form ref={form} hidden={confirmExit} className="group-form" onSubmit={submit}>
      <p>A small place to pray together. Every person uses their own account, and members join only after approval.</p>
      <label>Group name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="off" /></label>
      <label>Unique username<input value={username} onChange={event => setUsername(event.target.value)} required disabled={Boolean(group)} maxLength={33} autoComplete="off" placeholder="@your-prayer-group" /></label>
      <p className="quiet-copy">{group ? 'Your username stays the same so shared links keep working.' : 'Use 3–32 letters, numbers, or hyphens. This is how others find your group.'}</p>
      <label>Website <span className="quiet-copy">(optional)</span><input value={website} onChange={event => setWebsite(event.target.value)} type="text" inputMode="url" maxLength={2048} placeholder="https://yourchurch.org" /></label>
      <div className="group-preview group-live-preview" role="group" aria-label="Live group picture preview">
        <GroupPicture group={{name,icon,image,color}} />
        <div><strong>Your group picture</strong><p className="quiet-copy" aria-live="polite">{image ? 'Uploaded picture' : `${icon === 'prayer-hands' ? 'Praying hands' : icon.charAt(0).toUpperCase() + icon.slice(1)} icon`} · {color} background</p>
        {image && <button type="button" className="text-link" onClick={() => { imageSequence.current++; setImage(undefined); setReading(false); }}>Remove custom picture</button>}</div>
      </div>
      <fieldset className="group-icon-field"><legend>Choose a little picture</legend><div className="group-icons">
        <label className={`group-picture group-upload-tile ${image ? 'selected' : ''}`}><Icon name="upload" size={26}/><span>Upload</span><input className="sr-only" aria-label="Upload group image" type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        const sequence = ++imageSequence.current; setReading(true); setError('');
        try { const preview = await makePicturePreview(file); if (sequence === imageSequence.current) setImage(preview); }
        catch (error) { if (sequence === imageSequence.current) setError(error instanceof Error ? error.message : 'That image could not be opened.'); }
        finally { if (sequence === imageSequence.current) setReading(false); event.target.value = ''; }
      }} /></label>
        {groupIcons.map(value => <button key={value} type="button" className={`group-picture group-tone-${color} ${!image && icon === value ? 'selected' : ''}`} aria-label={value === "prayer-hands" ? "Praying hands icon" : `${value} icon`} aria-pressed={!image && icon === value} onClick={() => { imageSequence.current++; setIcon(value); setImage(undefined); setReading(false); }}><Icon name={value} size={29} /></button>)}
      </div></fieldset>

      <fieldset className="group-color-field"><legend>Icon background</legend><div className="group-color-options">{groupColors.map(value => <button type="button" key={value} className={`group-color-swatch group-tone-${value}`} aria-label={`${value} gradient background`} aria-pressed={color === value} onClick={() => setColor(value)}>{color === value && <Icon name="check" size={18}/>}</button>)}</div></fieldset>
      <p className="quiet-copy">PNG, JPEG, or WebP, up to 2 MB. Custom pictures stay in this browser preview; publication will require screening.</p>
      {error && <p className="group-error" role="alert">{error}</p>}
      <div className="group-actions"><button type="button" className="button secondary" onClick={requestClose}>Cancel</button><button className="button primary" disabled={reading}>{reading ? 'Preparing picture…' : group ? 'Save changes' : 'Create prayer group'}</button></div>
    </form>
  </Modal>;
}

export function PrayerGroups({ descriptions = {}, onEditDescription, standalone = false, directorySearch, people = groupPeople, viewer, state, onChange, selectedHandle, onNavigate }: Props) {
  const feedback = useActionFeedback();
  const Heading = standalone ? 'h1' : 'h2';
  const actor = people.find(person => person.id === viewer);
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
      const next = applyGroupCommand(current, actor, command, group.version, people);
      onChange(state.map(value => value.id === next.id ? next : value), groupNoticesForCommand(current, next, actor.id, command));
      feedback.respond({ tone: 'success', title: next.archivedAt ? 'This prayer group is now closed.' : message });
      setConfirmation(null);
      if (next.archivedAt) { setManageId(null); setLeaveId(null); setEditor(null); onNavigate?.('groups'); }
      return next;
    } catch (error) { feedback.respond({ tone: 'error', title: error instanceof Error ? error.message : 'This change could not be saved.' }); }
  };
  const myGroups = actor ? state.filter(group => !group.archivedAt && group.members.some(member => member.id === actor.id && ['approved', 'invited', 'pending'].includes(member.status))) : [];
  const query = (directorySearch ?? search).trim().replace(/^@/, '').toLowerCase();
  const matches = (group: PrayerGroup) => `${group.name} ${group.username}`.toLowerCase().includes(query);
  const found = query ? state.filter(group => !group.archivedAt && matches(group) && !myGroups.some(mine => mine.id === group.id) && !group.members.some(member => member.id === viewer && member.status === 'blocked')) : [];
  const action = (group: PrayerGroup) => {
    const membership = group.members.find(member => member.id === viewer);
    if (!actor) return <button className="button secondary" onClick={() => onNavigate?.('signup')}>Sign in to join</button>;
    if (membership?.status === 'blocked') return <p className="quiet-copy">This group is unavailable.</p>;
    if (membership?.status === 'invited') return <div className="group-actions"><button className="button primary" onClick={() => send(group, { type: 'accept_invite' }, 'You have joined this prayer group.')}>Accept invitation</button><button className="button secondary" onClick={() => send(group, { type: 'decline_invite' }, 'Invitation declined.')}>Decline</button></div>;
    if (membership?.status === 'pending') return <div className="group-actions"><span className="group-status">Awaiting approval</span><button className="text-link" onClick={() => send(group, { type: 'withdraw' }, 'Your join request was withdrawn.')}>Withdraw request</button></div>;
    if (membership?.status === 'approved') return <div className="group-actions community-card-actions">
      {!selectedHandle && <button className="button secondary" onClick={() => onNavigate?.(group.id === 'grace' ? 'box/grace' : `group/${group.username}`)} aria-label={`View prayer box for ${group.name}`}>View prayer box</button>}
      <button className="text-link" onClick={() => { setLeaveId(group.id); setSuccessor(''); }}>Leave community</button>
      {canModerateGroup(group, viewer) && <button className="button secondary community-manage-action" onClick={() => { setManageId(group.id); setInvite(''); }}>{isGroupAdmin(group, viewer) ? 'Members & invitations' : 'Members & join requests'}</button>}
    </div>;
    return <button className="button secondary" onClick={() => send(group, { type: 'request_join' }, 'Your request to join is awaiting approval.')}>Request to join<Icon name="plus" /></button>;
  };
  const card = (group: PrayerGroup) => <article className="panel group-card" key={group.id}>
    <div className="group-card-heading"><GroupPicture group={group} /><div className="group-card-name"><h3>{group.name}</h3><p>@{group.username}</p></div><div className="group-card-role">{isGroupAdmin(group, viewer) && <><span className="group-status">You are an admin</span><button className="icon-button" aria-label={`Edit ${group.name}`} onClick={() => setEditor(group)}><Icon name="edit" /></button></>}{isGroupModerator(group, viewer) && <span className="group-status moderator">You are a moderator</span>}</div></div>
    {isGroupAdmin(group, viewer) && group.deletionProposal && <button className="text-link group-caution-action" onClick={() => setManageId(group.id)}>Review group deletion proposal<Icon name="arrow" size={17} /></button>}
    {group.website && <a className="text-link" href={group.website} target="_blank" rel="noopener noreferrer nofollow">Visit website<Icon name="arrow" size={17} /></a>}
    {selectedHandle && descriptions[`group:${group.id}`] && <p className="group-box-description">{descriptions[`group:${group.id}`]}</p>}
    {selectedHandle && isGroupAdmin(group, viewer) && onEditDescription && <button className="text-link" onClick={() => onEditDescription(group.id)}><Icon name="edit" size={17}/>Edit description</button>}
    {action(group)}
    {!selectedHandle && !group.members.some(member => member.id === viewer && member.status === 'approved') && <button className="button secondary" onClick={() => onNavigate?.(group.id === 'grace' ? 'box/grace' : `group/${group.username}`)}>View prayer box</button>}
  </article>;
  let departure: ReturnType<typeof planGroupDeparture> | undefined;
  let departureError = '';
  if (leaving && actor) { try { departure = planGroupDeparture(leaving, actor.id, successor || undefined); } catch (error) { departureError = error instanceof Error ? error.message : 'Your membership changed. Reopen the group before trying again.'; } }
  return <section className="prayer-groups" aria-labelledby="prayer-groups-title">
    <div className="group-section-heading"><div><p className="eyebrow">Your organizations</p><Heading id="prayer-groups-title" tabIndex={-1}>{selected ? selected.name : 'A little community for prayer.'}</Heading></div>{actor && !selectedHandle && <button className="button primary" onClick={() => setEditor('new')}><Icon name="plus" />Create prayer group</button>}</div>
    {!actor && <p className="quiet-copy">Sign in to create a group, manage memberships, or accept an invitation.</p>}
    {selectedHandle ? selected ? <>{card(selected)}<div className="group-inbox panel"><Icon name="box" size={32} /><h3>Room for prayer, together.</h3><p>Approved members share this group’s prayer inbox. Personal deliveries stay in each person’s own box.</p>{selected.id === 'grace' ? <button className="button secondary" onClick={() => onNavigate?.('box/grace')}>Open prayer inbox<Icon name="arrow" /></button> : <p className="quiet-copy">This new group has no prayer requests yet. Request delivery for newly created groups is still being connected.</p>}</div></> : <p role="status">This group is not available.</p> : <>
      {directorySearch === undefined && <label className="group-search"><Icon name="search" /><span className="sr-only">Find a prayer group by name or username</span><input type="search" placeholder="Find a group by name or @username" value={search} onChange={event => setSearch(event.target.value)} maxLength={80} /></label>}
      <div className="group-grid">{myGroups.filter(group => !query || matches(group)).map(card)}{found.map(card)}</div>
      {query && !found.length && !myGroups.some(matches) && <p role="status">No available group matches your search.</p>}
      {!myGroups.length && !query && <p className="group-empty">You have no prayer groups yet. Create a small group, search its username, or accept an invitation here.</p>}
    </>}
    {editor && actor && <GroupEditor group={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSave={values => {
      feedback.prepare();
      if (editor === 'new') { const next = createPrayerGroup(state, actor, values); onChange([...state, next]); feedback.respond({ tone: 'success', title: 'Your prayer group is ready.', message: 'You are its first admin. Invite someone to pray with you.' }); setEditor(null); }
      else if (send(editor, { type: 'edit', ...values }, 'Your prayer group has been updated.')) setEditor(null);
    }} />}
    {managed && actor && canModerateGroup(managed, actor.id) && <Modal title={`${managed.name} · Members`} wide onClose={() => setManageId(null)}>
      <div className="group-form">
        <p>Approval opens this group’s prayer inbox under each request’s disclosed history policy. Personal boxes and anonymous identities stay private.</p>
        <dl className="group-role-guide">
          <div><dt><Icon name="shield" size={18} />Admins</dt><dd>Manage roles, invitations and settings, plus all moderator actions.</dd></div>
          <div><dt><Icon name="heart" size={18} />Moderators</dt><dd>Review join requests, remove ordinary members, and remove inappropriate posts. They cannot change roles or remove other staff.</dd></div>
        </dl>
        <p className="quiet-copy">Keep this space welcoming and rooted in the Father, Son, and Holy Spirit. Address harassment, hate and scams; sincere questions or requests for help are welcome. Unclear doctrinal concerns need thoughtful human review.</p>
        {isGroupAdmin(managed, actor.id) && <form className="group-invite" onSubmit={event => { event.preventDefault(); const person = people.find(person => person.username === invite.trim().replace(/^@/, '').toLowerCase()); if (!person) { feedback.respond({ tone: 'error', title: 'Enter the exact username of an available account.' }); return; } if (send(managed, { type: 'invite', targetId: person.id }, 'Invitation added. They can accept or decline.')) setInvite(''); }}>
          <label>Invite by @username<input value={invite} onChange={event => setInvite(event.target.value)} placeholder="@daniel" required autoComplete="off" /></label><button className="button primary">Invite<Icon name="mail" /></button>
        </form>}
        <p className="quiet-copy group-reply-help">“Reply under group name” lets a member choose the organization’s name on a prayer or encouragement instead of their own. It does not grant admin or moderator rights.</p><div className="group-member-list">{managed.members.filter(member => member.status !== 'left' && member.status !== 'declined' && (isGroupAdmin(managed, actor.id) || member.status === 'approved' || member.status === 'pending')).map(member => {
          const admin = isGroupAdmin(managed, actor.id);
          const onlyAdmin = member.role === 'admin' && member.active && !managed.members.some(other => other.id !== member.id && other.active && other.status === 'approved' && other.role === 'admin');
          const canRemove = member.status === 'approved' && member.id !== actor.id && member.role !== 'admin' && (admin || member.role === 'member');
          return <article className="group-member" key={member.id}>
            <div className="group-member-heading"><h3>{member.name}{member.id === actor.id && <span className="quiet-copy"> (you)</span>}</h3><p>@{member.username} · {member.status === 'approved' ? member.role === 'admin' ? 'Admin' : member.role === 'moderator' ? 'Moderator' : 'Approved member' : member.status === 'pending' ? 'Awaiting approval' : member.status === 'invited' ? 'Invited' : 'Blocked'}{!member.active && ' · Inactive account'}</p>{member.joinedAt && <p className="quiet-copy">Joined <time dateTime={new Date(member.joinedAt).toISOString()}>{date(member.joinedAt)}</time></p>}{member.role === 'moderator' && member.moderatorSince != null && <p className="quiet-copy">Moderator since <time dateTime={new Date(member.moderatorSince).toISOString()}>{date(member.moderatorSince)}</time></p>}</div>
            {admin && member.status === 'approved' && member.active && <div className="group-role-control">
              <label>Group role<span className="sr-only"> for {member.name}</span><select value={member.role} disabled={onlyAdmin} aria-describedby={onlyAdmin ? `last-admin-${member.id}` : undefined} onChange={event => {
                const role = event.target.value as 'admin' | 'moderator' | 'member';
                if (role === member.role) return;
                setConfirmation({ group: managed, command: { type: 'set_role', targetId: member.id, role }, title: role === 'member' ? `Return ${member.name} to member access?` : `Make ${member.name} ${role === 'admin' ? 'an admin' : 'a moderator'}?` });
              }}><option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label>
              {onlyAdmin && <p className="quiet-copy" id={`last-admin-${member.id}`}>Add another admin before changing the last admin’s role. Leaving can transfer the role automatically.</p>}
            </div>}
            <div className="group-actions group-member-actions">
              {member.status === 'pending' && member.active && <><button className="button secondary" onClick={() => send(managed, { type: 'approve', targetId: member.id }, 'Membership approved.')}>Approve</button><button className="text-link" onClick={() => send(managed, { type: 'deny', targetId: member.id }, 'Join request denied.')}>Deny</button></>}
              {admin && member.status === 'invited' && <button className="text-link" onClick={() => send(managed, { type: 'cancel_invite', targetId: member.id }, 'Invitation cancelled.')}>Cancel invitation</button>}
              {admin && member.status === 'approved' && member.active && <button className="text-link" onClick={() => setConfirmation({ group: managed, command: { type: 'set_official_reply', targetId: member.id, allowed: !member.officialReply }, title: member.officialReply ? `Remove ${member.name}’s group reply permission?` : `Allow ${member.name} to reply as ${managed.name}?` })}>{member.officialReply ? 'Remove group reply permission' : 'Allow replies under group name'}</button>}
              {canRemove && <button className="text-link group-caution-action" onClick={() => setConfirmation({ group: managed, command: { type: 'remove', targetId: member.id }, title: `Remove ${member.name} from this group?` })}>Remove member</button>}
              {admin && member.id !== viewer && member.role !== 'admin' && (member.status === 'blocked' ? <button className="text-link" onClick={() => send(managed, { type: 'unblock', targetId: member.id }, 'Group block removed. A new join request still needs approval.')}>Unblock</button> : <button className="text-link group-caution-action" onClick={() => setConfirmation({ group: managed, command: { type: 'block', targetId: member.id }, title: `Block ${member.name} from this group?` })}>Block from group</button>)}
            </div>
          </article>;
        })}</div>
        {isGroupAdmin(managed, actor.id) && <section className="group-deletion" aria-labelledby="group-deletion-title">
          <h3 id="group-deletion-title">Close this prayer group</h3>
          {managed.deletionProposal ? <>
            <p>A deletion proposal is awaiting every admin’s agreement. The group stays open until all admins approve.</p>
            <p className="quiet-copy">Started <time dateTime={new Date(managed.deletionProposal.createdAt).toISOString()}>{date(managed.deletionProposal.createdAt)}</time>. Changing the admin team cancels these approvals.</p>
            <ul className="group-deletion-votes">{managed.deletionProposal.adminIds.map(id => {
              const member = managed.members.find(value => value.id === id);
              return <li key={id}><span>{member?.name ?? 'Admin'}{id === actor.id && ' (you)'}</span><span>{managed.deletionProposal!.approvedBy.includes(id) ? 'Approved' : 'Awaiting approval'}{member && !member.active && ' · Inactive account'}</span></li>;
            })}</ul>
            <div className="group-actions">{!managed.deletionProposal.approvedBy.includes(actor.id) && <button className="button secondary" onClick={() => setConfirmation({ group: managed, command: { type: 'approve_deletion', proposalId: managed.deletionProposal!.id }, title: `Approve deleting ${managed.name}?` })}>Review and approve deletion</button>}<button className="text-link" onClick={() => send(managed, { type: 'cancel_deletion', proposalId: managed.deletionProposal!.id }, 'Group deletion cancelled. The group stays open.')}>Cancel deletion</button></div>
          </> : <>
            <p>Deleting closes the group and its prayer box. Every admin must agree. Personal boxes and separate deliveries elsewhere are unaffected.</p>
            <button className="button secondary group-caution-action" onClick={() => setConfirmation({ group: managed, command: { type: 'request_deletion' }, title: `Delete ${managed.name}?` })}>Delete group<Icon name="close" /></button>
          </>}
        </section>}
      </div>
    </Modal>}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><div className="group-form"><p>{describeChange(confirmation.group, confirmation.command)}</p><div className="group-actions"><button className="button secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="button primary" onClick={() => send(confirmation.group, confirmation.command, confirmation.command.type === 'request_deletion' || confirmation.command.type === 'approve_deletion' ? 'Your approval is saved. The group stays open until every admin agrees.' : 'Group membership updated.')}>{confirmation.command.type === 'request_deletion' ? confirmation.group.members.filter(member => member.status === 'approved' && member.role === 'admin').length === 1 ? 'Delete group' : 'Start deletion proposal' : confirmation.command.type === 'approve_deletion' ? 'Approve deletion' : 'Confirm change'}<Icon name="check" /></button></div></div></Modal>}
    {leaving && <Modal title={`Leave ${leaving.name}?`} onClose={() => setLeaveId(null)}><div className="group-form">
      <p>Your access to this group’s private prayers, replies, pictures, and future notifications will end. Your personal box and friends stay separate.</p>
      {departureError && <p className="group-error" role="alert">{departureError}</p>}
      {departure?.successor && <><label>Next admin<select value={successor} onChange={event => setSuccessor(event.target.value)}><option value="">Automatic</option>{departure.eligible.map(member => <option key={member.id} value={member.id}>{member.name} (@{member.username})</option>)}</select></label><p className="group-transfer"><Icon name="shield" /><span>{departure.successor.name} will become an admin when you leave.{!successor && (departure.successor.role === 'moderator' ? ' They are the longest-serving active moderator.' : ' No active moderator is available, so the longest-serving active member is next.')}</span></p></>}
      {departure?.archive && <p className="group-transfer">There is no other active approved member. This group will be archived when you leave; no outsider will be appointed.</p>}
      <div className="group-actions"><button className="button secondary" onClick={() => setLeaveId(null)}>Stay in group</button><button className="button primary" disabled={!departure} onClick={() => { if (departure && send(leaving, { type: 'leave', successorId: successor || undefined }, departure.archive ? 'You have left. The group is now archived.' : 'You have left the prayer group.')) { setLeaveId(null); setManageId(null); requestAnimationFrame(() => document.getElementById('prayer-groups-title')?.focus({ preventScroll: true })); } }}>Confirm and leave<Icon name="exit" /></button></div>
    </div></Modal>}
  </section>;
}
