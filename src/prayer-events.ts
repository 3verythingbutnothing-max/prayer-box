/** Invitation-only relationships and canonical prayer events. No prayer-reading permission is granted here. */
import { isGroupAdmin } from './prayer-groups.ts';
import type { GroupPerson, PrayerGroup } from './prayer-groups.ts';

export type EventHost = { kind: 'person' | 'group'; id: string };
export type PrayerConnection = {
  id: string; personId: string; target: EventHost; status: 'pending' | 'active' | 'disconnected' | 'declined';
  requestedBy: string; source: 'manual' | 'platform'; createdAt: number; updatedAt: number; disconnectedBy?: string;
};
export type EventContext = {
  people: readonly GroupPerson[]; groups: readonly PrayerGroup[]; connections: readonly PrayerConnection[];
  blocks?: readonly { blockerId: string; blockedId: string }[];
};
export type PrayerEvent = {
  id: string; host: EventHost; title: string; description: string; format: 'virtual' | 'in_person';
  website?: string; meetingUrl?: string; address?: string; startsAt: string; endsAt: string; timeZone: string;
  audience: 'connections' | 'members'; shareable: boolean; createdAt: number; updatedAt: number;
  version: number; cancelledAt?: number;
};
export type EventInput = Pick<PrayerEvent, 'title' | 'description' | 'format' | 'website' | 'meetingUrl' | 'address' | 'startsAt' | 'endsAt' | 'timeZone' | 'audience' | 'shareable'>;
export type PrayerEventShare = { id: string; eventId: string; host: EventHost; sharedBy: string; createdAt: number; viaShareId?: string; revokedAt?: number };
export type PrayerEventState = { events: PrayerEvent[]; shares: PrayerEventShare[]; dismissals: { eventId: string; viewerId: string; dismissedAt: number }[] };
export type PrayerInvitation = { event: PrayerEvent; viaHost: EventHost; shareId?: string };
export class PrayerEventError extends Error {}

export const eventHostKey = (host: EventHost): string => `${host.kind}:${host.id}`;
const sameHost = (a: EventHost, b: EventHost) => eventHostKey(a) === eventHostKey(b);
const personHost = (id: string): EventHost => ({ kind: 'person', id });
const activePerson = (id: string, context: EventContext) => context.people.some(person => person.id === id && person.active);
const pairBlocked = (a: string, b: string, context: EventContext) => context.blocks?.some(pair => pair.blockerId === a && pair.blockedId === b || pair.blockerId === b && pair.blockedId === a) ?? false;
const validHost = (host: EventHost, context: EventContext) => host.kind === 'person' ? activePerson(host.id, context) : host.kind === 'group' && context.groups.some(group => group.id === host.id && !group.archivedAt);
function canActAs(host: EventHost, actorId: string, context: EventContext): boolean {
  return activePerson(actorId, context) && (host.kind === 'person' ? host.id === actorId : context.groups.some(group => group.id === host.id && isGroupAdmin(group, actorId)));
}
function hostAvailableTo(host: EventHost, viewerId: string, context: EventContext): boolean {
  if (!activePerson(viewerId, context) || !validHost(host, context)) return false;
  if (host.kind === 'person') return !pairBlocked(host.id, viewerId, context);
  const group = context.groups.find(group => group.id === host.id)!;
  return !group.members.some(member => member.id === viewerId && member.status === 'blocked') && !pairBlocked(viewerId, group.ownerId, context);
}
function connectionEnds(connection: PrayerConnection): [EventHost, EventHost] { return [personHost(connection.personId), connection.target]; }
function connectionId(first: EventHost, second: EventHost): string { return [eventHostKey(first), eventHostKey(second)].sort().join('/'); }
function hasConnection(host: EventHost, viewerId: string, context: EventContext): boolean {
  return hostAvailableTo(host, viewerId, context) && context.connections.some(connection => connection.status === 'active' && connectionId(...connectionEnds(connection)) === connectionId(host, personHost(viewerId)));
}
function ownPrincipal(connection: PrayerConnection, actorId: string, context: EventContext): EventHost | undefined {
  // A person's own endpoint takes precedence if they also administer the opposite group.
  return connectionEnds(connection).find(host => host.kind === 'person' && host.id === actorId && canActAs(host, actorId, context))
    ?? connectionEnds(connection).find(host => canActAs(host, actorId, context));
}
function connectionAvailable(connection: PrayerConnection, context: EventContext): boolean { return hostAvailableTo(connection.target, connection.personId, context); }
function clock(now: number) { if (!Number.isFinite(now) || now < 0) throw new PrayerEventError('The date could not be recorded. Please try again.'); }

/** Only account creation calls this exception. Re-rendering or a prayer submission must never restore it. */
export function initialPrayerConnections(userId: string, teamId = 'team', now = Date.now()): PrayerConnection[] {
  clock(now); if (!userId || !teamId || userId === teamId) return [];
  return [{ id: connectionId(personHost(userId), personHost(teamId)), personId: userId, target: personHost(teamId), status: 'active', requestedBy: eventHostKey(personHost(teamId)), source: 'platform', createdAt: now, updatedAt: now }];
}
/** Requests contain only the two profiles; they carry no prayer ID, text, anonymity or interaction provenance. */
export function requestPrayerConnection(connections: readonly PrayerConnection[], actorId: string, target: EventHost, context: EventContext, options: { from?: EventHost } = {}, now = Date.now()): PrayerConnection[] {
  clock(now); const from = options.from ?? personHost(actorId);
  if (!canActAs(from, actorId, context) || !validHost(target, context) || sameHost(from, target) || from.kind === 'group' && target.kind === 'group') throw new PrayerEventError('Choose an available person or prayer group.');
  const person = from.kind === 'person' ? from : target;
  const other = from.kind === 'person' ? target : from;
  if (!hostAvailableTo(other, person.id, context)) throw new PrayerEventError('This connection is not available.');
  const pairId = connectionId(from, target); const existing = connections.find(connection => connectionId(...connectionEnds(connection)) === pairId); const id = existing?.id ?? pairId;
  if (existing?.status === 'active') return [...connections];
  if (existing?.status === 'pending') throw new PrayerEventError('A connection request is already pending. Review it in My Church.');
  if (existing?.disconnectedBy && existing.disconnectedBy !== eventHostKey(from)) throw new PrayerEventError('The other side ended this connection. They can choose to request a new one.');
  const connection: PrayerConnection = { id, personId: person.id, target: { kind: other.kind, id: other.id }, status: 'pending', requestedBy: eventHostKey(from), source: 'manual', createdAt: now, updatedAt: now };
  return [...connections.filter(row => row.id !== id), connection];
}
export function respondToPrayerConnection(connections: readonly PrayerConnection[], id: string, actorId: string, action: 'accept' | 'decline' | 'withdraw', context: EventContext, now = Date.now()): PrayerConnection[] {
  clock(now); const connection = connections.find(row => row.id === id); const principal = connection && ownPrincipal(connection, actorId, context);
  if (!connection || connection.status !== 'pending' || !principal || !connectionAvailable(connection, context)) throw new PrayerEventError('This connection request is no longer available.');
  const requester = connection.requestedBy === eventHostKey(principal);
  if (action === 'withdraw' ? !requester : requester) throw new PrayerEventError(action === 'withdraw' ? 'Only the requester can withdraw this invitation.' : 'The other side must accept or decline this request.');
  if (!['accept', 'decline', 'withdraw'].includes(action)) throw new PrayerEventError('Choose an available connection action.');
  return connections.map(row => row.id === id ? { ...row, status: action === 'accept' ? 'active' : 'declined', updatedAt: now } : row);
}
export function disconnectPrayerConnection(connections: readonly PrayerConnection[], id: string, actorId: string, context: EventContext, now = Date.now()): PrayerConnection[] {
  clock(now); const connection = connections.find(row => row.id === id); const principal = connection && ownPrincipal(connection, actorId, context);
  if (!connection || !principal) throw new PrayerEventError('This connection is not available.');
  if (connection.status === 'disconnected') return [...connections];
  if (connection.status !== 'active') throw new PrayerEventError('Accept, decline, or withdraw the pending request instead.');
  return connections.map(row => row.id === id ? { ...row, status: 'disconnected', disconnectedBy: eventHostKey(principal), updatedAt: now } : row);
}
export function otherConnectionHost(connection: PrayerConnection, viewerId: string): EventHost | null {
  if (connection.personId === viewerId) return connection.target;
  return connection.target.kind === 'person' && connection.target.id === viewerId ? personHost(connection.personId) : null;
}
export function visiblePrayerConnections(connections: readonly PrayerConnection[], viewerId: string, context: EventContext): PrayerConnection[] {
  return activePerson(viewerId, context) ? connections.filter(connection => connection.status === 'active' && otherConnectionHost(connection, viewerId) && connectionAvailable(connection, context)) : [];
}
export function visibleManagedConnections(connections: readonly PrayerConnection[], viewerId: string, context: EventContext): { connection: PrayerConnection; as: EventHost; other: EventHost }[] {
  return connections.flatMap(connection => {
    const principal = ownPrincipal(connection, viewerId, context);
    if (connection.status !== 'active' || !principal || !connectionAvailable(connection, context)) return [];
    return [{ connection, as: principal, other: connectionEnds(connection).find(host => !sameHost(host, principal))! }];
  });
}
export function visibleConnectionRequests(connections: readonly PrayerConnection[], viewerId: string, context: EventContext): { connection: PrayerConnection; direction: 'incoming' | 'outgoing'; as: EventHost; other: EventHost }[] {
  return connections.flatMap(connection => {
    const principal = ownPrincipal(connection, viewerId, context);
    if (connection.status !== 'pending' || !principal || !connectionAvailable(connection, context)) return [];
    return [{ connection, direction: connection.requestedBy === eventHostKey(principal) ? 'outgoing' as const : 'incoming' as const, as: principal, other: connectionEnds(connection).find(host => !sameHost(host, principal))! }];
  });
}
export function eligibleEventHosts(actorId: string, context: EventContext): EventHost[] {
  return activePerson(actorId, context) ? [personHost(actorId), ...context.groups.filter(group => isGroupAdmin(group, actorId)).map(group => ({ kind: 'group' as const, id: group.id }))] : [];
}
export function canManageEvent(event: PrayerEvent, actorId: string, context: EventContext): boolean { return canActAs(event.host, actorId, context); }

const urlText = (value: string | undefined, label: string): string | undefined => {
  if (value != null && typeof value !== 'string') throw new PrayerEventError(`Use a complete public https address for ${label}.`);
  if (value == null || !value.trim()) return undefined;
  const raw = value.trim();
  if (raw.length > 2048 || /[\s\\\u0000-\u001f\u007f-\u009f]/u.test(raw)) throw new PrayerEventError(`Use a complete public https address for ${label}.`);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || url.hostname.includes(':') || /^[\d.]+$/.test(url.hostname) || /(?:^|\.)(localhost|local|internal|lan|home)\.?$/i.test(url.hostname)) throw new Error();
    return url.href;
  } catch { throw new PrayerEventError(`Use a complete public https address for ${label}.`); }
};
const text = (value: string, label: string, max: number, required = true): string => {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new PrayerEventError(`Check the ${label}.`);
  const clean = value.trim(); if (clean.length > max || required && !clean) throw new PrayerEventError(`Add ${label} up to ${max} characters.`); return clean;
};
export function validateEventInput(input: EventInput, host: EventHost, now = Date.now(), existingStart?: string): EventInput {
  clock(now);
  if (!['virtual', 'in_person'].includes(input.format) || !['connections', 'members'].includes(input.audience) || typeof input.shareable !== 'boolean') throw new PrayerEventError('Choose an event format and invitation audience.');
  if (input.audience === 'members' && (host.kind !== 'group' || input.shareable)) throw new PrayerEventError('Members-only events stay within that group and cannot be reposted.');
  const validDate = (value: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const [year, month, day, hour, minute] = value.slice(0, 16).split(/[-T:]/).map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60;
  };
  if (!validDate(input.startsAt) || !validDate(input.endsAt)) throw new PrayerEventError('Choose a start and end time with a time zone.');
  const start = Date.parse(input.startsAt); const end = Date.parse(input.endsAt);
  if (start <= now && start !== Date.parse(existingStart ?? '') || end <= start || end - start > 7 * 86_400_000) throw new PrayerEventError('Choose a future start and an end within seven days.');
  try { if (typeof input.timeZone !== 'string' || input.timeZone.length > 80 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(input.timeZone)) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format(start); } catch { throw new PrayerEventError('Choose a valid time zone.'); }
  const meetingUrl = input.format === 'virtual' ? urlText(input.meetingUrl, 'the meeting') : undefined;
  const address = input.format === 'in_person' ? text(input.address ?? '', 'meeting place or address', 500) : undefined;
  if (input.format === 'virtual' && !meetingUrl) throw new PrayerEventError('Add the virtual meeting link.');
  return { title: text(input.title, 'title', 120), description: text(input.description, 'event details', 4000), format: input.format,
    website: urlText(input.website, 'event information'), meetingUrl, address, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), timeZone: input.timeZone,
    audience: input.audience, shareable: input.shareable };
}
function directAccess(event: PrayerEvent, viewerId: string, context: EventContext): boolean {
  if (!hostAvailableTo(event.host, viewerId, context)) return false;
  if (canManageEvent(event, viewerId, context)) return true;
  if (event.audience === 'members') return event.host.kind === 'group' && context.groups.some(group => group.id === event.host.id && group.members.some(member => member.id === viewerId && member.active && member.status === 'approved'));
  return hasConnection(event.host, viewerId, context);
}
function validShare(state: PrayerEventState, event: PrayerEvent, share: PrayerEventShare, context: EventContext, seen = new Set<string>()): boolean {
  if (!event.shareable || event.audience === 'members' || share.eventId !== event.id || share.revokedAt != null || !validHost(share.host, context) || !canActAs(share.host, share.sharedBy, context) || sameHost(share.host, event.host) || seen.has(share.id)) return false;
  const visited = new Set(seen); visited.add(share.id);
  if (!share.viaShareId) return directAccess(event, share.sharedBy, context);
  const parent = state.shares.find(row => row.id === share.viaShareId && row.eventId === event.id);
  if (!parent || sameHost(parent.host, share.host) || !hostAvailableTo(event.host, share.sharedBy, context)) return false;
  return validShare(state, event, parent, context, visited) && hasConnection(parent.host, share.sharedBy, context);
}
function eventAccess(state: PrayerEventState, event: PrayerEvent, viewerId: string, context: EventContext): PrayerInvitation | null {
  if (!hostAvailableTo(event.host, viewerId, context)) return null;
  if (directAccess(event, viewerId, context)) return { event, viaHost: event.host };
  const share = state.shares.find(row => row.eventId === event.id && validShare(state, event, row, context) && hasConnection(row.host, viewerId, context));
  return share ? { event, viaHost: share.host, shareId: share.id } : null;
}
export function canViewEvent(state: PrayerEventState, eventId: string, viewerId: string, context: EventContext): boolean {
  const event = state.events.find(row => row.id === eventId); return Boolean(event && eventAccess(state, event, viewerId, context));
}
export function invitationsForViewer(state: PrayerEventState, viewerId: string, context: EventContext): PrayerInvitation[] {
  return state.events.flatMap(event => {
    if (canManageEvent(event, viewerId, context) || state.dismissals.some(row => row.eventId === event.id && row.viewerId === viewerId)) return [];
    const invitation = eventAccess(state, event, viewerId, context); return invitation ? [invitation] : [];
  }).sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.event.id.localeCompare(b.event.id));
}
export function createPrayerEvent(state: PrayerEventState, actorId: string, host: EventHost, input: EventInput, context: EventContext, now = Date.now(), id = crypto.randomUUID()): PrayerEventState {
  if (!canActAs(host, actorId, context)) throw new PrayerEventError('Only this person or a current group admin can host an event.');
  if (!id || state.events.some(event => event.id === id)) throw new PrayerEventError('This event already exists.');
  const values = validateEventInput(input, host, now);
  return { ...state, events: [...state.events, { id, host: { ...host }, ...values, createdAt: now, updatedAt: now, version: 1 }] };
}
export function updatePrayerEvent(state: PrayerEventState, eventId: string, actorId: string, input: EventInput, expectedVersion: number, context: EventContext, now = Date.now()): PrayerEventState {
  const event = state.events.find(row => row.id === eventId);
  if (!event || !canManageEvent(event, actorId, context) || event.cancelledAt != null) throw new PrayerEventError('This event is not available to edit.');
  if (event.version !== expectedVersion) throw new PrayerEventError('This event changed. Refresh it before editing.');
  // Audience changes can expand a meeting's private details. Use a new event instead.
  if (input.audience !== event.audience || input.shareable && !event.shareable) throw new PrayerEventError('Create a new event to broaden its invitation audience or allow reposting.');
  const values = validateEventInput(input, event.host, now, event.startsAt);
  return { ...state, events: state.events.map(row => row.id === eventId ? { ...row, ...values, updatedAt: now, version: row.version + 1 } : row) };
}
export function cancelPrayerEvent(state: PrayerEventState, eventId: string, actorId: string, expectedVersion: number, context: EventContext, now = Date.now()): PrayerEventState {
  clock(now); const event = state.events.find(row => row.id === eventId);
  if (!event || !canManageEvent(event, actorId, context)) throw new PrayerEventError('This event is not available to cancel.');
  if (event.cancelledAt != null) return state;
  if (event.version !== expectedVersion) throw new PrayerEventError('This event changed. Refresh it before cancelling.');
  return { ...state, events: state.events.map(row => row.id === eventId ? { ...row, cancelledAt: now, updatedAt: now, version: row.version + 1 } : row) };
}
export function sharePrayerEvent(state: PrayerEventState, eventId: string, actorId: string, host: EventHost, context: EventContext, now = Date.now(), id = crypto.randomUUID()): PrayerEventState {
  clock(now); const event = state.events.find(row => row.id === eventId); const access = event && eventAccess(state, event, actorId, context);
  if (!event || !access || event.cancelledAt != null || Date.parse(event.endsAt) <= now || !event.shareable || event.audience === 'members' || !canActAs(host, actorId, context) || sameHost(host, event.host)) throw new PrayerEventError('This event is not available to repost to that audience.');
  if (state.shares.some(share => share.eventId === eventId && sameHost(share.host, host) && share.revokedAt == null)) return state;
  // No repeating a host anywhere in the source chain, even when records were imported.
  let parent = access.shareId ? state.shares.find(row => row.id === access.shareId) : undefined;
  const visited = new Set<string>();
  while (parent) { if (visited.has(parent.id) || sameHost(parent.host, host)) throw new PrayerEventError('This event is already part of that invitation chain.'); visited.add(parent.id); parent = parent.viaShareId ? state.shares.find(row => row.id === parent!.viaShareId) : undefined; }
  if (!id || state.shares.some(row => row.id === id)) throw new PrayerEventError('This repost already exists.');
  return { ...state, shares: [...state.shares, { id, eventId, host: { ...host }, sharedBy: actorId, createdAt: now, ...(access.shareId ? { viaShareId: access.shareId } : {}) }] };
}
export function dismissPrayerInvitation(state: PrayerEventState, eventId: string, viewerId: string, context: EventContext, now = Date.now()): PrayerEventState {
  clock(now); if (!canViewEvent(state, eventId, viewerId, context)) throw new PrayerEventError('This invitation is no longer available.');
  if (state.dismissals.some(row => row.eventId === eventId && row.viewerId === viewerId)) return state;
  return { ...state, dismissals: [...state.dismissals, { eventId, viewerId, dismissedAt: now }] };
}
export function revokePrayerEventShare(state: PrayerEventState, shareId: string, actorId: string, context: EventContext, now = Date.now()): PrayerEventState {
  clock(now); const share = state.shares.find(row => row.id === shareId);
  if (!share || !canActAs(share.host, actorId, context)) throw new PrayerEventError('This repost is not yours to remove.');
  if (share.revokedAt != null) return state;
  return { ...state, shares: state.shares.map(row => row.id === shareId ? { ...row, revokedAt: now } : row) };
}
