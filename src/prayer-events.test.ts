import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPrayerGroups } from './prayer-groups.ts';
import { canManageEvent, canViewEvent, cancelPrayerEvent, createPrayerEvent, dismissPrayerInvitation, disconnectPrayerConnection, eligibleEventHosts, initialPrayerConnections, invitationsForViewer, requestPrayerConnection, respondToPrayerConnection, revokePrayerEventShare, sharePrayerEvent, updatePrayerEvent, validateEventInput, visibleConnectionRequests, visibleManagedConnections, visiblePrayerConnections } from './prayer-events.ts';
import type { EventContext, EventHost, EventInput, PrayerConnection, PrayerEventState } from './prayer-events.ts';

const now = Date.UTC(2026, 9, 29, 12);
const p = (id: string): EventHost => ({ kind: 'person', id });
const g = (id = 'grace'): EventHost => ({ kind: 'group', id });
const people = ['elena', 'maria', 'daniel', 'jordan', 'member', 'owner', 'team'].map(id => ({ id, name: id, username: id, active: true }));
const context = (): EventContext => ({ people: structuredClone(people), groups: initialPrayerGroups(), connections: [], blocks: [] });
const empty = (): PrayerEventState => ({ events: [], shares: [], dismissals: [] });
const values = (changes: Partial<EventInput> = {}): EventInput => ({ title: 'Morning prayer', description: 'A quiet time to pray together.', format: 'virtual', meetingUrl: 'https://meet.example.org/morning', startsAt: '2026-11-10T13:00:00Z', endsAt: '2026-11-10T14:00:00Z', timeZone: 'America/New_York', audience: 'connections', shareable: true, ...changes });
function connect(ctx: EventContext, from: string, to: EventHost, acceptor = to.id): EventContext {
  const requested = requestPrayerConnection(ctx.connections, from, to, ctx, {}, now);
  const accepted = respondToPrayerConnection(requested, requested.at(-1)!.id, acceptor, 'accept', { ...ctx, connections: requested }, now + 1);
  return { ...ctx, connections: accepted };
}
function created(ctx: EventContext, host = p('elena'), input = values(), actor = 'elena'): PrayerEventState { return createPrayerEvent(empty(), actor, host, input, ctx, now, 'event-a'); }

test('connection requests need the other side to accept and do not grant invitations while pending', () => {
  const ctx = context(); const state = created(ctx);
  const connections = requestPrayerConnection([], 'maria', p('elena'), ctx, {}, now);
  assert.equal(connections[0].status, 'pending');
  assert.equal(canViewEvent(state, 'event-a', 'maria', { ...ctx, connections }), false);
  assert.throws(() => respondToPrayerConnection(connections, connections[0].id, 'maria', 'accept', ctx, now));
  const accepted = respondToPrayerConnection(connections, connections[0].id, 'elena', 'accept', ctx, now + 1);
  assert.equal(canViewEvent(state, 'event-a', 'maria', { ...ctx, connections: accepted }), true);
  assert.equal(visiblePrayerConnections(accepted, 'maria', ctx).length, 1);
});
test('pending requests are private to endpoints and each side has the appropriate accept or withdraw controls', () => {
  const ctx = context(); const rows = requestPrayerConnection([], 'maria', p('elena'), ctx, {}, now);
  assert.equal(visibleConnectionRequests(rows, 'maria', ctx)[0].direction, 'outgoing');
  assert.equal(visibleConnectionRequests(rows, 'elena', ctx)[0].direction, 'incoming');
  assert.deepEqual(visibleConnectionRequests(rows, 'daniel', ctx), []);
  assert.throws(() => respondToPrayerConnection(rows, rows[0].id, 'elena', 'withdraw', ctx));
  assert.equal(respondToPrayerConnection(rows, rows[0].id, 'maria', 'withdraw', ctx)[0].status, 'declined');
  const declined = respondToPrayerConnection(rows, rows[0].id, 'elena', 'decline', ctx);
  assert.throws(() => respondToPrayerConnection(declined, rows[0].id, 'elena', 'accept', ctx));
});
test('connection data never stores an anonymous prayer reference or interaction provenance', () => {
  const ctx = context();
  const target = { kind: 'person' as const, id: 'elena', requestId: 'anonymous-secret', anonymous: true };
  const rows = requestPrayerConnection([], 'maria', target, ctx, {}, now);
  assert.equal(rows[0].source, 'manual');
  assert.equal(JSON.stringify(rows).includes('anonymous'), false);
  assert.equal(JSON.stringify(rows).includes('secret'), false);
  assert.equal(rows[0].status, 'pending');
  assert.deepEqual(ctx.connections, []);
});
test('a reversed duplicate request cannot auto-accept the existing pending request', () => {
  const ctx = context(); const rows = requestPrayerConnection([], 'maria', p('elena'), ctx, {}, now);
  assert.throws(() => requestPrayerConnection(rows, 'elena', p('maria'), ctx));
  assert.equal(rows[0].status, 'pending');
  const accepted = respondToPrayerConnection(rows, rows[0].id, 'elena', 'accept', ctx);
  assert.deepEqual(requestPrayerConnection(accepted, 'elena', p('maria'), ctx), accepted);
});
test('either party can disconnect; only the ending party can request reconnection, which needs fresh acceptance', () => {
  const ctx = connect(context(), 'maria', p('elena'));
  const ended = disconnectPrayerConnection(ctx.connections, ctx.connections[0].id, 'elena', ctx, now + 2);
  assert.equal(ended[0].status, 'disconnected'); assert.equal(ended[0].disconnectedBy, 'person:elena');
  assert.throws(() => requestPrayerConnection(ended, 'maria', p('elena'), ctx));
  const requested = requestPrayerConnection(ended, 'elena', p('maria'), ctx);
  assert.equal(requested[0].status, 'pending');
  assert.equal(canViewEvent(created(ctx), 'event-a', 'maria', { ...ctx, connections: requested }), false);
  assert.equal(respondToPrayerConnection(requested, requested[0].id, 'maria', 'accept', ctx)[0].status, 'active');
});
test('blocking and inactive accounts hide active connections and prevent request acceptance', () => {
  const ctx = connect(context(), 'maria', p('elena'));
  const blocked = { ...ctx, blocks: [{ blockerId: 'elena', blockedId: 'maria' }] };
  assert.deepEqual(visiblePrayerConnections(ctx.connections, 'maria', blocked), []);
  assert.equal(canViewEvent(created(ctx), 'event-a', 'maria', blocked), false);
  assert.throws(() => requestPrayerConnection([], 'maria', p('elena'), blocked));
  const pending = requestPrayerConnection([], 'maria', p('elena'), context());
  assert.throws(() => respondToPrayerConnection(pending, pending[0].id, 'elena', 'accept', blocked));
  const inactive = { ...ctx, people: ctx.people.map(person => person.id === 'maria' ? { ...person, active: false } : person) };
  assert.deepEqual(visiblePrayerConnections(ctx.connections, 'maria', inactive), []);
});
test('group connection approval and disconnection require a current admin, with group-side opt-out surviving admin handoff', () => {
  const ctx = context(); const rows = requestPrayerConnection([], 'elena', g(), ctx, {}, now);
  assert.deepEqual(visibleConnectionRequests(rows, 'member', ctx), []);
  assert.throws(() => respondToPrayerConnection(rows, rows[0].id, 'member', 'accept', ctx));
  const accepted = respondToPrayerConnection(rows, rows[0].id, 'owner', 'accept', ctx);
  assert.equal(visibleManagedConnections(accepted, 'owner', ctx)[0].other.id, 'elena');
  const ended = disconnectPrayerConnection(accepted, rows[0].id, 'owner', ctx);
  assert.equal(ended[0].disconnectedBy, 'group:grace');
  assert.throws(() => requestPrayerConnection(ended, 'elena', g(), ctx));
  const next = context(); next.groups[0].members.find(member => member.id === 'maria')!.role = 'admin';
  assert.equal(requestPrayerConnection(ended, 'maria', p('elena'), next, { from: g() })[0].status, 'pending');
});
test('a group can request a connection, but only the person can approve it', () => {
  const ctx = context(); const rows = requestPrayerConnection([], 'owner', p('elena'), ctx, { from: g() }, now);
  assert.equal(rows[0].requestedBy, 'group:grace');
  assert.equal(visibleConnectionRequests(rows, 'elena', ctx)[0].direction, 'incoming');
  assert.throws(() => respondToPrayerConnection(rows, rows[0].id, 'owner', 'accept', ctx));
  assert.equal(respondToPrayerConnection(rows, rows[0].id, 'elena', 'accept', ctx)[0].status, 'active');
});
test('Prayer Box is an explicit signup-only exception and user disconnection persists', () => {
  const ctx = context(); const rows = initialPrayerConnections('elena', 'team', now);
  assert.equal(rows[0].source, 'platform'); assert.equal(rows[0].status, 'active');
  const ended = disconnectPrayerConnection(rows, rows[0].id, 'elena', ctx);
  assert.deepEqual(visiblePrayerConnections(ended, 'elena', ctx), []);
  assert.equal(ended[0].status, 'disconnected');
});
test('personal events are visible only to accepted connections and creation does not change prayer permissions', () => {
  const ctx = connect(context(), 'maria', p('elena')); const state = created(ctx);
  assert.equal(canViewEvent(state, 'event-a', 'maria', ctx), true);
  assert.equal(canViewEvent(state, 'event-a', 'daniel', ctx), false);
  assert.equal(canViewEvent(state, 'event-a', 'guest', ctx), false);
  assert.deepEqual(invitationsForViewer(state, 'elena', ctx), []);
  assert.equal(invitationsForViewer(state, 'maria', ctx).length, 1);
  assert.equal(Object.hasOwn(ctx, 'prayers'), false);
});
test('only personal owner or group admin can create, edit, cancel and host a repost', () => {
  const ctx = context(); const state = created(ctx, g(), values(), 'owner');
  assert.equal(canManageEvent(state.events[0], 'owner', ctx), true);
  assert.equal(canManageEvent(state.events[0], 'member', ctx), false);
  assert.throws(() => created(ctx, g(), values(), 'member'));
  assert.throws(() => created(ctx, p('maria'), values(), 'elena'));
  assert.throws(() => updatePrayerEvent(state, 'event-a', 'member', values(), 1, ctx, now));
  assert.throws(() => cancelPrayerEvent(state, 'event-a', 'member', 1, ctx, now));
  assert.deepEqual(eligibleEventHosts('owner', ctx), [p('owner'), g()]);
});
test('members-only events stay within current approved membership and can never be reposted', () => {
  const ctx = connect(context(), 'elena', g(), 'owner');
  const state = created(ctx, g(), values({ audience: 'members', shareable: false }), 'owner');
  assert.equal(canViewEvent(state, 'event-a', 'member', ctx), true);
  assert.equal(canViewEvent(state, 'event-a', 'elena', ctx), false);
  assert.throws(() => created(ctx, g(), values({ audience: 'members', shareable: true }), 'owner'));
  assert.throws(() => sharePrayerEvent(state, 'event-a', 'member', p('member'), ctx, now));
  const removed = context(); removed.groups[0].members.find(member => member.id === 'member')!.status = 'left';
  assert.equal(canViewEvent(state, 'event-a', 'member', removed), false);
});
test('group connections do not implicitly grant members-only events or group administration', () => {
  const ctx = connect(context(), 'elena', g(), 'owner'); const state = created(ctx, g(), values(), 'owner');
  assert.equal(canViewEvent(state, 'event-a', 'elena', ctx), true);
  assert.equal(canManageEvent(state.events[0], 'elena', ctx), false);
  assert.equal(ctx.groups[0].members.some(member => member.id === 'elena'), false);
});
test('edits preserve canonical identity and timestamps, reject stale versions and prevent audience broadening', () => {
  const ctx = context(); const state = created(ctx);
  const next = updatePrayerEvent(state, 'event-a', 'elena', values({ title: 'Corrected title' }), 1, ctx, now + 1);
  assert.equal(next.events[0].createdAt, now); assert.equal(next.events[0].updatedAt, now + 1); assert.equal(next.events[0].version, 2);
  assert.equal(state.events[0].title, 'Morning prayer');
  assert.throws(() => updatePrayerEvent(next, 'event-a', 'elena', values(), 1, ctx, now + 2));
  const privateState = created(ctx, g(), values({ audience: 'members', shareable: false }), 'owner');
  assert.throws(() => updatePrayerEvent(privateState, 'event-a', 'owner', values(), 1, ctx, now));
});
test('ongoing event metadata can be corrected without silently moving its past start', () => {
  const ctx = context(); const state = created(ctx); const later = Date.parse(state.events[0].startsAt) + 1000;
  assert.equal(updatePrayerEvent(state, 'event-a', 'elena', values({ title: 'Correction' }), 1, ctx, later).events[0].title, 'Correction');
  assert.throws(() => updatePrayerEvent(state, 'event-a', 'elena', values({ startsAt: '2026-11-09T13:00:00Z' }), 1, ctx, later));
});
test('reposting preserves one canonical event and invitation, propagates edits, and does not give editing rights', () => {
  let ctx = connect(context(), 'maria', p('elena')); ctx = connect(ctx, 'daniel', p('maria'));
  const original = created(ctx); const shared = sharePrayerEvent(original, 'event-a', 'maria', p('maria'), ctx, now + 2, 'share-a');
  assert.equal(shared.events.length, 1); assert.equal(Object.hasOwn(shared.shares[0], 'title'), false);
  assert.equal(canViewEvent(shared, 'event-a', 'daniel', ctx), true);
  assert.equal(canManageEvent(shared.events[0], 'daniel', ctx), false);
  assert.equal(sharePrayerEvent(shared, 'event-a', 'maria', p('maria'), ctx, now + 3), shared);
  const revised = updatePrayerEvent(shared, 'event-a', 'elena', values({ title: 'New time of prayer' }), 1, ctx, now + 4);
  assert.equal(invitationsForViewer(revised, 'daniel', ctx)[0].event.title, 'New time of prayer');
  assert.equal(invitationsForViewer(revised, 'daniel', ctx).length, 1);
});
test('reposts chain through accepted connections and disappear after source disconnection or repost revocation', () => {
  let ctx = connect(context(), 'maria', p('elena')); ctx = connect(ctx, 'daniel', p('maria')); ctx = connect(ctx, 'jordan', p('daniel'));
  let state = sharePrayerEvent(created(ctx), 'event-a', 'maria', p('maria'), ctx, now, 'share-a');
  state = sharePrayerEvent(state, 'event-a', 'daniel', p('daniel'), ctx, now, 'share-b');
  assert.equal(state.shares[1].viaShareId, 'share-a'); assert.equal(canViewEvent(state, 'event-a', 'jordan', ctx), true);
  const ended = disconnectPrayerConnection(ctx.connections, ctx.connections[0].id, 'maria', ctx);
  assert.equal(canViewEvent(state, 'event-a', 'jordan', { ...ctx, connections: ended }), false);
  const revoked = revokePrayerEventShare(state, 'share-a', 'maria', ctx, now + 1);
  assert.equal(canViewEvent(revoked, 'event-a', 'jordan', ctx), false);
  assert.throws(() => revokePrayerEventShare(state, 'share-a', 'daniel', ctx));
});
test('forged cycles and same-host re-share chains fail closed', () => {
  let ctx = connect(context(), 'maria', p('elena')); ctx = connect(ctx, 'daniel', p('maria'));
  const state = sharePrayerEvent(created(ctx), 'event-a', 'maria', p('maria'), ctx, now, 'share-a');
  const cyclic = { ...state, shares: [{ ...state.shares[0], viaShareId: 'share-a' }] };
  assert.equal(canViewEvent(cyclic, 'event-a', 'daniel', ctx), false);
  assert.throws(() => sharePrayerEvent(state, 'event-a', 'elena', p('elena'), ctx));
  assert.throws(() => sharePrayerEvent(state, 'event-a', 'jordan', p('jordan'), ctx));
});
test('a block against original host also hides downstream reposts without exposing meeting details', () => {
  let ctx = connect(context(), 'maria', p('elena')); ctx = connect(ctx, 'daniel', p('maria'));
  const state = sharePrayerEvent(created(ctx), 'event-a', 'maria', p('maria'), ctx, now, 'share-a');
  const blocked = { ...ctx, blocks: [{ blockerId: 'elena', blockedId: 'daniel' }] };
  assert.deepEqual(invitationsForViewer(state, 'daniel', blocked), []);
});
test('dismissal remains private and stable across edits, duplicate shares and cancellation', () => {
  const ctx = connect(context(), 'maria', p('elena')); const state = created(ctx);
  const dismissed = dismissPrayerInvitation(state, 'event-a', 'maria', ctx, now + 1);
  assert.deepEqual(invitationsForViewer(dismissed, 'maria', ctx), []);
  assert.equal(dismissPrayerInvitation(dismissed, 'event-a', 'maria', ctx, now + 2), dismissed);
  const edited = updatePrayerEvent(dismissed, 'event-a', 'elena', values({ title: 'Revised' }), 1, ctx, now + 3);
  assert.deepEqual(invitationsForViewer(edited, 'maria', ctx), []);
  assert.throws(() => dismissPrayerInvitation(state, 'event-a', 'jordan', ctx));
});
test('cancellation propagates to all invitations without sending mail or changing other events', () => {
  const ctx = connect(context(), 'maria', p('elena')); const original = created(ctx);
  const cancelled = cancelPrayerEvent(original, 'event-a', 'elena', 1, ctx, now + 1);
  assert.equal(invitationsForViewer(cancelled, 'maria', ctx)[0].event.cancelledAt, now + 1);
  assert.equal(cancelPrayerEvent(cancelled, 'event-a', 'elena', 1, ctx, now + 2), cancelled);
  assert.throws(() => sharePrayerEvent(cancelled, 'event-a', 'maria', p('maria'), ctx, now + 2));
  assert.throws(() => updatePrayerEvent(cancelled, 'event-a', 'elena', values(), 2, ctx, now + 2));
});
test('event fields reject malformed dates, unknown zones, unsafe links and invalid audience choices', () => {
  const bad: Partial<EventInput>[] = [
    { startsAt: '2026-02-30T12:00:00Z' }, { startsAt: '2026-11-10T24:00:00Z' }, { startsAt: '2026-11-10T12:00' },
    { endsAt: '2026-11-10T12:00:00Z' }, { endsAt: '2026-12-10T14:00:00Z' }, { timeZone: 'Invalid/Zone' },
    { meetingUrl: 'javascript:alert(1)' }, { meetingUrl: 'https://user:password@example.org' }, { meetingUrl: 'https://localhost/test' },
    { meetingUrl: 'https://127.0.0.1/' }, { meetingUrl: 'https://example.org/\nBEGIN:VALARM' }, { title: '\u0000' },
    { format: 'in_person', address: '' }, { audience: 'members', shareable: false },
  ];
  for (const input of bad) assert.throws(() => validateEventInput(values(input), p('elena'), now), undefined, JSON.stringify(input));
  const physical = validateEventInput(values({ format: 'in_person', address: 'Community hall', meetingUrl: 'https://ignored.example.org' }), p('elena'), now);
  assert.equal(physical.meetingUrl, undefined); assert.equal(physical.address, 'Community hall');
});
