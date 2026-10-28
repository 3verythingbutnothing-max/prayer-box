import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { hashSecret, loadActor, primary, type Database } from '../src/data';
import { handleGroupRoute } from '../src/groups';
import { errorResponse } from '../src/http';
import { NOW, ORIGIN, resetDatabase, seedDelivery, seedUsers, session, type USERS } from './fixtures';

type User = typeof USERS[number];
type Session = Awaited<ReturnType<typeof session>>;
type Command = { type: string; targetId?: string; successorId?: string; name?: string; website?: string; icon?: string; color?: string; allowed?: boolean; role?: string; proposalId?: string };

beforeEach(async () => { await resetDatabase(); await seedUsers(); });

async function signedIn(user: User = 'owner', mfa = true): Promise<Session> {
  const auth = await session(user);
  if (mfa) await env.DB.prepare("UPDATE sessions SET assurance='mfa',authenticated_at=? WHERE token_hash=?").bind(Date.now() - 100, await hashSecret(auth.token)).run();
  return auth;
}

async function request(path: string, auth: Session | null, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return handleRequest(new Request(`${ORIGIN}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: ORIGIN, ...(auth?.headers ?? {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}

async function create(auth: Session, username = 'test-prayer-group') {
  const response = await request('/api/groups', auth, { name: 'Test prayer group', username, website: '', icon: 'heart' });
  expect(response.status).toBe(201);
  const group = await env.DB.prepare('SELECT id FROM boxes WHERE slug=?').bind(username).first<{ id: string }>();
  expect(group).not.toBeNull();
  return group!.id;
}

async function version(id: string) {
  const row = await env.DB.prepare('SELECT version FROM group_settings WHERE box_id=?').bind(id).first<{ version: number }>();
  expect(row).not.toBeNull();
  return row!.version;
}

async function action(id: string, auth: Session, command: Command, expectedVersion?: number) {
  return request(`/api/groups/${id}/actions`, auth, { expectedVersion: expectedVersion ?? await version(id), command });
}

async function addMember(id: string, user: User, joinedAt = NOW - 10000, admin = false) {
  await env.DB.prepare(`INSERT INTO memberships(box_id,user_id,status,role,approved_by,approved_at,joined_at,is_admin)
    VALUES(?,?,'approved','member','owner',?,?,?)`).bind(id, user, joinedAt, joinedAt, admin ? 1 : 0).run();
}

async function membership(id: string, user: User) {
  return env.DB.prepare('SELECT status,is_admin,joined_at,revoked_at,official_reply FROM memberships WHERE box_id=? AND user_id=?').bind(id, user)
    .first<{ status: string; is_admin: number; joined_at: number; revoked_at: number | null; official_reply: number }>();
}

async function activeAdmins(id: string) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.box_id=? AND m.status='approved' AND m.revoked_at IS NULL AND m.is_admin=1 AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM box_blocks b WHERE b.box_id=m.box_id AND b.user_id=m.user_id)`).bind(id).first<{ count: number }>();
  return row!.count;
}

/** Execute an actual concurrent database change immediately before the guarded D1 commit. */
async function raceAtCommit(path: string, auth: Session, payload: unknown, concurrentChange: () => Promise<unknown>) {
  const database = primary(env.DB);
  const actor = await loadActor(database, auth.token);
  const racing: Database = {
    prepare: database.prepare.bind(database),
    batch: async statements => { await concurrentChange(); return database.batch(statements); },
  };
  try {
    return await handleGroupRoute(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env, actor, racing);
  } catch (error) { return errorResponse(error); }
}

describe('group lifecycle: real Workers/D1 routes', () => {
  it('requires a current signed-in session, CSRF, trusted Origin, and recent MFA for group creation', async () => {
    const payload = { name: 'Synthetic group', username: 'must-not-create', website: '', icon: 'heart' };
    expect((await request('/api/groups', null, payload)).status).toBe(401);
    const basic = await signedIn('owner', false);
    expect((await request('/api/groups', basic, payload)).status).toBe(403);
    const auth = await signedIn();
    expect((await request('/api/groups', auth, payload, { 'X-CSRF-Token': 'bad' })).status).toBe(403);
    expect((await request('/api/groups', auth, payload, { Origin: 'https://hostile.example' })).status).toBe(403);
    await env.DB.prepare('UPDATE sessions SET authenticated_at=? WHERE token_hash=?').bind(Date.now() - 600001, await hashSecret(auth.token)).run();
    expect((await request('/api/groups', auth, payload)).status).toBe(403);
    expect(await env.DB.prepare("SELECT id FROM boxes WHERE slug='must-not-create'").first()).toBeNull();
  });

  it('creates a distinct organization with an approved creator admin and no inherited personal prayers', async () => {
    const auth = await signedIn();
    await seedDelivery();
    const id = await create(auth);
    expect(await membership(id, 'owner')).toMatchObject({ status: 'approved', is_admin: 1 });
    expect(await env.DB.prepare('SELECT kind,owner_id FROM boxes WHERE id=?').bind(id).first()).toMatchObject({ kind: 'organization', owner_id: 'owner' });
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM deliveries WHERE box_id=?').bind(id).first<{ count: number }>())?.count).toBe(0);
  });

  it('rejects duplicate case-insensitive usernames and unsafe websites without creating partial groups', async () => {
    const auth = await signedIn();
    await create(auth, 'same-name');
    const duplicate = await request('/api/groups', auth, { name: 'Duplicate', username: 'SAME-NAME', website: '', icon: 'heart' });
    expect([400, 409]).toContain(duplicate.status);
    for (const website of ['javascript:alert(1)', 'https://user:secret@example.org', 'http://127.0.0.1']) {
      expect((await request('/api/groups', auth, { name: 'Bad link', username: 'unsafe-link', website, icon: 'heart' })).status).toBe(400);
    }
    expect(await env.DB.prepare("SELECT id FROM boxes WHERE slug='unsafe-link'").first()).toBeNull();
  });

  it('keeps ordinary member and outsider administrative operations denied', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member');
    for (const user of ['member', 'outsider'] as const) {
      const auth = await signedIn(user);
      for (const command of [{ type: 'edit', name: 'Unauthorized', website: '', icon: 'box' }, { type: 'promote', targetId: 'member' }, { type: 'invite', targetId: 'outsider' }]) {
        expect([403, 404]).toContain((await action(id, auth, command)).status);
      }
    }
    expect(await env.DB.prepare('SELECT display_name FROM boxes WHERE id=?').bind(id).first()).toEqual({ display_name: 'Test prayer group' });
  });

  it('allows an admin to edit the name, optional website, and icon without changing the stable username', async () => {
    const auth = await signedIn(); const id = await create(auth);
    expect((await action(id, auth, { type: 'edit', name: 'Tuesday Prayer', website: 'https://example.org', icon: 'sun' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT display_name,slug FROM boxes WHERE id=?').bind(id).first()).toEqual({ display_name: 'Tuesday Prayer', slug: 'test-prayer-group' });
    expect((await action(id, auth, { type: 'edit', name: 'Tuesday Prayer', website: '', icon: 'note' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT website,icon FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({ website: '', icon: 'note' });
  });

  it('promotes only an approved active member and does not implicitly grant official-reply permission', async () => {
    const auth = await signedIn(); const id = await create(auth);
    await addMember(id, 'member');
    expect((await action(id, auth, { type: 'promote', targetId: 'member' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ is_admin: 1, official_reply: 0 });
    expect([400, 403, 409]).toContain((await action(id, auth, { type: 'promote', targetId: 'outsider' })).status);
    await addMember(id, 'removed');
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='removed'").run();
    expect([400, 403, 409]).toContain((await action(id, auth, { type: 'promote', targetId: 'removed' })).status);
  });

  it('separately grants and revokes official replies with admin MFA and never restores permission through rejoin', async () => {
    const owner = await signedIn(); const basicOwner = await signedIn('owner', false); const member = await signedIn('member'); const id = await create(owner);
    await addMember(id, 'member');
    const command = { type: 'set_official_reply', targetId: 'member', allowed: true };
    expect((await action(id, basicOwner, command)).status).toBe(403);
    expect((await action(id, member, command)).status).toBe(403);
    expect((await action(id, owner, command)).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ official_reply: 1, is_admin: 0 });
    expect((await action(id, owner, { ...command, allowed: false })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ official_reply: 0 });
    expect((await action(id, owner, command)).status).toBe(200);
    expect((await action(id, member, { type: 'leave' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ official_reply: 0 });
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect((await action(id, owner, { type: 'approve', targetId: 'member' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ official_reply: 0 });
    expect((await action(id, owner, { type: 'leave' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ is_admin: 1, official_reply: 0 });
  });

  it('supports request, withdraw, approve, leave and reapplication without silently restoring membership', async () => {
    const owner = await signedIn(); const member = await signedIn('outsider', false); const id = await create(owner);
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect(await membership(id, 'outsider')).toMatchObject({ status: 'pending', is_admin: 0 });
    expect((await action(id, member, { type: 'withdraw' })).status).toBe(200);
    expect((await membership(id, 'outsider'))?.status).not.toBe('approved');
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect((await action(id, owner, { type: 'approve', targetId: 'outsider' })).status).toBe(200);
    expect((await action(id, member, { type: 'leave' })).status).toBe(200);
    expect(await membership(id, 'outsider')).toMatchObject({ status: 'revoked', is_admin: 0 });
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect(await membership(id, 'outsider')).toMatchObject({ status: 'pending', is_admin: 0 });
  });

  it('requires deliberate invitation acceptance and supports decline and administrator cancellation', async () => {
    const owner = await signedIn(); const member = await signedIn('outsider', false); const id = await create(owner);
    expect((await action(id, owner, { type: 'invite', targetId: 'outsider' })).status).toBe(200);
    expect(await membership(id, 'outsider')).toMatchObject({ status: 'invited' });
    expect((await action(id, member, { type: 'decline_invite' })).status).toBe(200);
    expect((await membership(id, 'outsider'))?.status).not.toBe('approved');
    expect((await action(id, owner, { type: 'invite', targetId: 'outsider' })).status).toBe(200);
    expect((await action(id, owner, { type: 'cancel_invite', targetId: 'outsider' })).status).toBe(200);
    expect([400, 403, 409]).toContain((await action(id, member, { type: 'accept_invite' })).status);
    expect((await action(id, owner, { type: 'invite', targetId: 'outsider' })).status).toBe(200);
    expect((await action(id, member, { type: 'accept_invite' })).status).toBe(200);
    expect(await membership(id, 'outsider')).toMatchObject({ status: 'approved', is_admin: 0 });
  });

  it('blocks group access and reapplication, while unblocking never silently rejoins', async () => {
    const owner = await signedIn(); const member = await signedIn('member', false); const id = await create(owner);
    await addMember(id, 'member');
    expect((await action(id, owner, { type: 'block', targetId: 'member' })).status).toBe(200);
    expect((await membership(id, 'member'))?.status).not.toBe('approved');
    expect([403, 404, 409]).toContain((await action(id, member, { type: 'request_join' })).status);
    expect((await action(id, owner, { type: 'unblock', targetId: 'member' })).status).toBe(200);
    expect((await membership(id, 'member'))?.status).not.toBe('approved');
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ status: 'pending' });
  });

  it('does not bypass a personal block when inviting someone who previously belonged to the group', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member');
    expect((await action(id, owner, { type: 'remove', targetId: 'member' })).status).toBe(200);
    await env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('member','owner',?)").bind(NOW).run();
    expect([403, 404, 409]).toContain((await action(id, owner, { type: 'invite', targetId: 'member' })).status);
    expect((await membership(id, 'member'))?.status).not.toBe('invited');
  });

  it('does not accept an invitation after its inviting admin is blocked by the invitee', async () => {
    const owner = await signedIn(); const invitee = await signedIn('outsider', false); const id = await create(owner);
    expect((await action(id, owner, { type: 'invite', targetId: 'outsider' })).status).toBe(200);
    await env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('outsider','owner',?)").bind(NOW).run();
    expect([403, 404, 409]).toContain((await action(id, invitee, { type: 'accept_invite' })).status);
    expect((await membership(id, 'outsider'))?.status).not.toBe('approved');
  });

  it('transfers the only admin role to the explicitly selected active member before departure', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member', NOW - 9000); await addMember(id, 'newmember', NOW - 1000);
    expect((await action(id, owner, { type: 'leave', successorId: 'newmember' })).status).toBe(200);
    expect(await membership(id, 'owner')).toMatchObject({ status: 'revoked', is_admin: 0 });
    expect(await membership(id, 'newmember')).toMatchObject({ status: 'approved', is_admin: 1 });
    expect(await membership(id, 'member')).toMatchObject({ is_admin: 0 });
    expect(await activeAdmins(id)).toBe(1);
    expect(await env.DB.prepare('SELECT owner_id,status FROM boxes WHERE id=?').bind(id).first()).toEqual({ owner_id: 'newmember', status: 'active' });
  });

  it('automatically promotes the oldest active eligible member and excludes inactive, pending and blocked people', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'removed', NOW - 30000); await addMember(id, 'recipient', NOW - 20000);
    await addMember(id, 'member', NOW - 10000); await addMember(id, 'newmember', NOW - 1000);
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='removed'").run();
    await env.DB.prepare('INSERT INTO box_blocks(box_id,user_id,created_at) VALUES(?,?,?)').bind(id, 'recipient', NOW).run();
    await env.DB.prepare("INSERT INTO memberships(box_id,user_id,status) VALUES(?,'pending','pending')").bind(id).run();
    expect((await action(id, owner, { type: 'leave' })).status).toBe(200);
    expect(await membership(id, 'member')).toMatchObject({ is_admin: 1 });
    for (const user of ['removed', 'recipient', 'newmember', 'pending'] as const) expect((await membership(id, user))?.is_admin).toBe(0);
    expect(await activeAdmins(id)).toBe(1);
  });

  it('keeps the stored owner role aligned when an existing co-admin inherits ownership', async () => {
    const owner = await signedIn(); const coadmin = await signedIn('member'); const id = await create(owner);
    await addMember(id, 'member', NOW - 10000, true);
    const before = await env.DB.prepare("SELECT approved_at,approved_by,joined_at FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first();
    expect((await action(id, owner, { type: 'leave' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT owner_id FROM boxes WHERE id=?').bind(id).first()).toEqual({ owner_id: 'member' });
    expect(await env.DB.prepare("SELECT role,is_admin,status FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first()).toEqual({ role: 'owner', is_admin: 1, status: 'approved' });
    expect(await env.DB.prepare("SELECT role,is_admin,status FROM memberships WHERE box_id=? AND user_id='owner'").bind(id).first()).toEqual({ role: 'member', is_admin: 0, status: 'revoked' });
    expect(await env.DB.prepare("SELECT approved_at,approved_by,joined_at FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first()).toEqual(before);
    expect((await action(id, coadmin, { type: 'edit', name: 'After handoff', website: '', icon: 'heart' })).status).toBe(200);
  });

  it('rejects invalid named successors without removing the current admin', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member');
    for (const successorId of ['outsider', 'owner']) {
      expect([400, 403, 409]).toContain((await action(id, owner, { type: 'leave', successorId })).status);
      expect(await membership(id, 'owner')).toMatchObject({ status: 'approved', is_admin: 1 });
    }
  });

  it('archives a group when its last admin leaves with no eligible successor without deleting its content', async () => {
    const owner = await signedIn(); const id = await create(owner);
    expect((await action(id, owner, { type: 'leave' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({ status: 'deleted' });
    expect((await env.DB.prepare('SELECT archived_at FROM group_settings WHERE box_id=?').bind(id).first<{ archived_at: number }>())?.archived_at).toBeGreaterThan(0);
    const outsider = await signedIn('outsider', false);
    expect([403, 404, 409]).toContain((await action(id, outsider, { type: 'request_join' })).status);
    expect(await env.DB.prepare('SELECT id FROM boxes WHERE id=?').bind(id).first()).not.toBeNull();
  });

  it('cannot demote or remove the only admin using a membership command', async () => {
    const owner = await signedIn(); const id = await create(owner);
    for (const type of ['demote', 'remove', 'block']) {
      expect([400, 403, 409]).toContain((await action(id, owner, { type, targetId: 'owner' })).status);
      expect(await activeAdmins(id)).toBe(1);
    }
  });

  it('uses compare-and-swap to reject stale settings and concurrent admin departures', async () => {
    const owner = await signedIn(); const member = await signedIn('member'); const id = await create(owner);
    await addMember(id, 'member', NOW - 10000, true); await addMember(id, 'newmember', NOW - 1000);
    const before = await version(id);
    const results = await Promise.all([action(id, owner, { type: 'leave' }, before), action(id, member, { type: 'leave' }, before)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(await activeAdmins(id)).toBeGreaterThanOrEqual(1);
    expect((await action(id, await signedIn('newmember'), { type: 'edit', name: 'Stale write', website: '', icon: 'heart' }, before)).status).not.toBe(200);
  });

  it('rechecks MFA at the create commit rather than trusting an earlier authenticated snapshot', async () => {
    const owner = await signedIn();
    const tokenHash = await hashSecret(owner.token);
    const response = await raceAtCommit('/api/groups', owner,
      { name: 'Race group', username: 'race-group', website: '', icon: 'heart' },
      () => env.DB.prepare("UPDATE sessions SET assurance='basic' WHERE token_hash=?").bind(tokenHash).run());
    expect([401, 403, 409]).toContain(response?.status);
    expect(await env.DB.prepare("SELECT id FROM boxes WHERE slug='race-group'").first()).toBeNull();
  });

  it('rejects an automatic succession if the oldest member becomes suspended before commit', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member', NOW - 10000); await addMember(id, 'newmember', NOW - 1000);
    const response = await raceAtCommit(`/api/groups/${id}/actions`, owner,
      { expectedVersion: await version(id), command: { type: 'leave' } },
      () => env.DB.prepare("UPDATE users SET status='suspended' WHERE id='member'").run());
    expect(response?.status).toBe(409);
    expect(await membership(id, 'owner')).toMatchObject({ status: 'approved', is_admin: 1 });
    expect((await membership(id, 'member'))?.is_admin).toBe(0);
  });

  it('rejects a privileged action when that administrator is revoked before commit', async () => {
    const owner = await signedIn(); const id = await create(owner);
    const response = await raceAtCommit(`/api/groups/${id}/actions`, owner,
      { expectedVersion: await version(id), command: { type: 'edit', name: 'Unauthorized race', website: '', icon: 'note' } },
      () => env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE box_id=? AND user_id='owner'").bind(Date.now(), id).run());
    expect(response?.status).toBe(409);
    expect(await env.DB.prepare('SELECT display_name FROM boxes WHERE id=?').bind(id).first()).toEqual({ display_name: 'Test prayer group' });
  });

  it('does not expose the administrative roster in public or ordinary-member group responses', async () => {
    const owner = await signedIn(); const id = await create(owner);
    await addMember(id, 'member'); await addMember(id, 'newmember');
    for (const auth of [null, await signedIn('outsider', false), await signedIn('member', false)]) {
      const response = await request(`/api/groups/${id}`, auth);
      if (response.status === 200) {
        const text = await response.text();
        expect(text).not.toContain('newmember-handle');
        expect(text).not.toContain('newmember fixture');
        expect(text).not.toContain('csrf_hash');
      } else expect([401, 404]).toContain(response.status);
    }
  });

  it('revokes delivery reads immediately after leaving and requires approved rejoin', async () => {
    const owner = await signedIn(); const member = await signedIn('member', false); const id = await create(owner);
    await addMember(id, 'member', NOW - 10000);
    const delivery = await seedDelivery({ organization: true, history: 'retained' });
    await env.DB.prepare('UPDATE deliveries SET box_id=? WHERE id=?').bind(id, delivery.id).run();
    expect((await request(`/api/deliveries/${delivery.id}`, member)).status).toBe(200);
    expect((await action(id, member, { type: 'leave' })).status).toBe(200);
    expect((await request(`/api/deliveries/${delivery.id}`, member)).status).toBe(404);
    expect((await action(id, member, { type: 'request_join' })).status).toBe(200);
    expect((await request(`/api/deliveries/${delivery.id}`, member)).status).toBe(404);
  });
});


describe('moderator roles and unanimous group deletion', () => {
  it('persists moderator role/tenure and allows admission and ordinary-member removal without assigning roles', async () => {
    const owner=await signedIn();const mod=await signedIn('member');const applicant=await signedIn('outsider',false);const id=await create(owner);
    await addMember(id,'member');await addMember(id,'newmember');
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'moderator'})).status).toBe(200);
    const saved=await env.DB.prepare("SELECT is_admin,is_moderator,moderator_since FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first();
    expect(saved).toMatchObject({is_admin:0,is_moderator:1,moderator_since:expect.any(Number)});
    const roster=await (await request(`/api/groups/${id}`,mod)).json() as {membership:{role:string};members:Array<{id:string}>};
    expect(roster.membership.role).toBe('moderator');expect(roster.members.some(member=>member.id==='newmember')).toBe(true);
    for(const command of [{type:'set_role',targetId:'newmember',role:'admin'},{type:'set_role',targetId:'newmember',role:'moderator'},
      {type:'promote',targetId:'newmember'},{type:'edit',name:'No',website:'',icon:'heart'},{type:'invite',targetId:'outsider'},
      {type:'block',targetId:'newmember'},{type:'set_official_reply',targetId:'newmember',allowed:true},{type:'request_deletion'}]) {
      expect((await action(id,mod,command)).status).toBe(403);
    }
    expect((await action(id,applicant,{type:'request_join'})).status).toBe(200);
    expect((await action(id,mod,{type:'deny',targetId:'outsider'})).status).toBe(200);
    expect((await action(id,applicant,{type:'request_join'})).status).toBe(200);
    expect((await action(id,mod,{type:'approve',targetId:'outsider'})).status).toBe(200);
    expect((await action(id,mod,{type:'remove',targetId:'outsider'})).status).toBe(200);
    expect((await action(id,mod,{type:'remove',targetId:'owner'})).status).toBe(409);
    expect((await action(id,owner,{type:'set_role',targetId:'newmember',role:'moderator'})).status).toBe(200);
    expect((await action(id,mod,{type:'remove',targetId:'newmember'})).status).toBe(409);
    expect(await env.DB.prepare("SELECT is_moderator,moderator_since FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first()).toMatchObject({is_moderator:1,moderator_since:(saved as {moderator_since:number}).moderator_since});
  });
  it('keeps role/removal notices private and readable after being kicked or blocked',async()=>{
    const owner=await signedIn();const member=await signedIn('member');const id=await create(owner);await addMember(id,'member');
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'moderator'})).status).toBe(200);
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'member'})).status).toBe(200);
    expect((await action(id,owner,{type:'remove',targetId:'member'})).status).toBe(200);
    expect((await action(id,owner,{type:'block',targetId:'member'})).status).toBe(200);
    const notices=await (await request('/api/group-notices',member)).json() as {notices:Array<{id:string;kind:string}>};
    expect(notices.notices.map(notice=>notice.kind)).toEqual(expect.arrayContaining(['role_moderator','role_member','removed','blocked']));
    const own=await (await request('/api/group-notices',owner)).text();expect(own).not.toContain('role_moderator');
    const path=`/api/group-notices/${encodeURIComponent(notices.notices[0].id)}/read`;
    expect((await request(path,member,{})).status).toBe(200);
    expect((await request(path,owner,{})).status).toBe(404);
  });
  it('automatically hands off to the longest-serving active moderator ahead of older ordinary members',async()=>{
    const owner=await signedIn();const id=await create(owner);
    await addMember(id,'recipient',NOW-40000);await addMember(id,'member',NOW-20000);await addMember(id,'newmember',NOW-10000);await addMember(id,'removed',NOW-30000);
    await env.DB.prepare("UPDATE memberships SET is_moderator=1,moderator_since=CASE user_id WHEN 'member' THEN ? WHEN 'newmember' THEN ? ELSE ? END WHERE box_id=? AND user_id IN ('member','newmember','removed')").bind(NOW-1000,NOW-5000,NOW-15000,id).run();
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='removed'").run();
    expect((await action(id,owner,{type:'leave'})).status).toBe(200);
    expect(await env.DB.prepare('SELECT owner_id FROM boxes WHERE id=?').bind(id).first()).toEqual({owner_id:'newmember'});
    expect(await env.DB.prepare("SELECT is_admin,is_moderator,moderator_since FROM memberships WHERE box_id=? AND user_id='newmember'").bind(id).first()).toEqual({is_admin:1,is_moderator:0,moderator_since:null});
    expect(await env.DB.prepare("SELECT kind FROM group_notices WHERE recipient_id='newmember'").first()).toEqual({kind:'role_admin'});
  });
  it('clears moderator tenure on demotion/removal and starts a fresh tenure after reappointment',async()=>{
    const owner=await signedIn();const member=await signedIn('member');const id=await create(owner);await addMember(id,'member');
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'moderator'})).status).toBe(200);
    await env.DB.prepare("UPDATE memberships SET moderator_since=? WHERE box_id=? AND user_id='member'").bind(NOW-10000,id).run();
    expect((await action(id,owner,{type:'remove',targetId:'member'})).status).toBe(200);
    expect(await env.DB.prepare("SELECT is_moderator,moderator_since FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first()).toEqual({is_moderator:0,moderator_since:null});
    expect((await action(id,member,{type:'request_join'})).status).toBe(200);
    expect((await action(id,owner,{type:'approve',targetId:'member'})).status).toBe(200);
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'moderator'})).status).toBe(200);
    expect((await env.DB.prepare("SELECT moderator_since FROM memberships WHERE box_id=? AND user_id='member'").bind(id).first<number>('moderator_since'))!).toBeGreaterThan(NOW-10000);
  });
  it('atomically rejects a moderator admission when their role is revoked before commit',async()=>{
    const owner=await signedIn();const mod=await signedIn('member');const outsider=await signedIn('outsider',false);const id=await create(owner);await addMember(id,'member');
    expect((await action(id,owner,{type:'set_role',targetId:'member',role:'moderator'})).status).toBe(200);
    expect((await action(id,outsider,{type:'request_join'})).status).toBe(200);
    const before=await env.DB.prepare('SELECT COUNT(*) count FROM group_notices').first<number>('count');
    const response=await raceAtCommit(`/api/groups/${id}/actions`,mod,{expectedVersion:await version(id),command:{type:'approve',targetId:'outsider'}},()=>env.DB.prepare("UPDATE memberships SET is_moderator=0 WHERE box_id=? AND user_id='member'").bind(id).run());
    expect(response?.status).toBe(409);expect((await membership(id,'outsider'))?.status).toBe('pending');
    expect(await env.DB.prepare('SELECT COUNT(*) count FROM group_notices').first<number>('count')).toBe(before);
  });
  it('allows a sole admin to delete the group and revokes memberships, prayer reads and pending edits',async()=>{
    const owner=await signedIn();const member=await signedIn('member');const author=await signedIn('author');const id=await create(owner);await addMember(id,'member');
    const delivery=await seedDelivery({organization:true,history:'retained'});await env.DB.prepare('UPDATE deliveries SET box_id=? WHERE id=?').bind(id,delivery.id).run();
    expect((await request(`/api/deliveries/${delivery.id}`,member)).status).toBe(200);
    expect((await request(`/api/deliveries/${delivery.id}/posts/${delivery.postId}/edits`,author,{title:'Correction',body:'Synthetic edit',expectedRevision:1})).status).toBe(202);
    expect((await action(id,owner,{type:'request_deletion'})).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'deleted'});
    expect((await membership(id,'owner'))?.status).toBe('revoked');expect((await membership(id,'member'))?.status).toBe('revoked');
    expect((await request(`/api/deliveries/${delivery.id}`,member)).status).toBe(404);
    expect((await request(`/api/deliveries/${delivery.id}`,author)).status).toBe(404);
    expect(await env.DB.prepare('SELECT state FROM post_edits').first()).toEqual({state:'cancelled'});
    expect((await (await request('/api/group-notices',member)).json() as {notices:Array<{kind:string}>}).notices.map(notice=>notice.kind)).toContain('group_deleted');
    expect(await env.DB.prepare("SELECT status FROM users WHERE id='member'").first()).toEqual({status:'active'});
  });
  it('requires every current admin, hides the proposal from non-admins, and does not close on the first vote',async()=>{
    const owner=await signedIn();const coadmin=await signedIn('member');const viewer=await signedIn('newmember');const id=await create(owner);await addMember(id,'member',NOW-9000,true);await addMember(id,'newmember');
    const first=await action(id,owner,{type:'request_deletion'});expect(first.status).toBe(200);const value=await first.json() as {deletionProposal:{id:string;approvedBy:string[]}};
    expect(value.deletionProposal.approvedBy).toEqual(['owner']);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'active'});
    expect(await (await request(`/api/groups/${id}`,viewer)).text()).not.toContain('deletionProposal');
    expect((await action(id,viewer,{type:'approve_deletion',proposalId:value.deletionProposal.id})).status).toBe(403);
    expect((await action(id,owner,{type:'approve_deletion',proposalId:value.deletionProposal.id})).status).toBe(409);
    expect((await action(id,coadmin,{type:'approve_deletion',proposalId:value.deletionProposal.id})).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'deleted'});
  });
  it('invalidates old deletion approvals whenever the admin roster changes',async()=>{
    const owner=await signedIn();const coadmin=await signedIn('member');const id=await create(owner);await addMember(id,'member',NOW-9000,true);await addMember(id,'newmember');
    const first=await (await action(id,owner,{type:'request_deletion'})).json() as {deletionProposal:{id:string}};
    expect((await action(id,owner,{type:'set_role',targetId:'newmember',role:'admin'})).status).toBe(200);
    expect(await env.DB.prepare('SELECT deletion_proposal FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({deletion_proposal:null});
    expect((await action(id,coadmin,{type:'approve_deletion',proposalId:first.deletionProposal.id})).status).toBe(409);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'active'});
    const second=await (await action(id,owner,{type:'request_deletion'})).json() as {deletionProposal:{id:string}};
    expect(second.deletionProposal.id).not.toBe(first.deletionProposal.id);
    expect((await action(id,coadmin,{type:'cancel_deletion',proposalId:second.deletionProposal.id})).status).toBe(200);
    expect((await action(id,owner,{type:'approve_deletion',proposalId:second.deletionProposal.id})).status).toBe(409);
  });
  it('keeps inactive admins in the unanimous quorum and denies retired admin votes',async()=>{
    const owner=await signedIn();const coadmin=await signedIn('member');const id=await create(owner);await addMember(id,'member',NOW-9000,true);
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='member'").run();
    const first=await action(id,owner,{type:'request_deletion'});expect(first.status).toBe(200);const value=await first.json() as {deletionProposal:{id:string;adminIds:string[]}};
    expect(value.deletionProposal.adminIds).toEqual(['member','owner']);
    expect((await action(id,coadmin,{type:'approve_deletion',proposalId:value.deletionProposal.id})).status).toBe(401);
    expect((await action(id,owner,{type:'leave'})).status).toBe(409);
    expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'active'});
    await env.DB.prepare("UPDATE users SET status='active' WHERE id='member'").run();
    expect((await action(id,coadmin,{type:'leave'})).status).toBe(200);
    expect((await action(id,coadmin,{type:'approve_deletion',proposalId:value.deletionProposal.id})).status).toBe(403);
  });
  it('aborts the final deletion vote if an admin is revoked or another admin appears during commit',async()=>{
    const owner=await signedIn();const coadmin=await signedIn('member');const id=await create(owner);await addMember(id,'member',NOW-9000,true);await addMember(id,'newmember');
    const value=await (await action(id,owner,{type:'request_deletion'})).json() as {deletionProposal:{id:string}};
    const response=await raceAtCommit(`/api/groups/${id}/actions`,coadmin,{expectedVersion:await version(id),command:{type:'approve_deletion',proposalId:value.deletionProposal.id}},()=>env.DB.prepare("UPDATE memberships SET is_admin=1 WHERE box_id=? AND user_id='newmember'").bind(id).run());
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT status FROM boxes WHERE id=?').bind(id).first()).toEqual({status:'active'});
    expect(await env.DB.prepare("SELECT id FROM group_notices WHERE kind='group_deleted'").first()).toBeNull();
  });
  it('persists the expanded icon palette and bounded gradients without changing roles', async () => {
    const auth=await signedIn();
    const created=await request('/api/groups',auth,{name:'Prayer night',username:'prayer-night',icon:'cross',color:'sky',website:''});
    expect(created.status).toBe(201);
    const id=(await env.DB.prepare("SELECT id FROM boxes WHERE slug='prayer-night'").first<{id:string}>())!.id;
    expect(await env.DB.prepare('SELECT icon,color FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({icon:'cross',color:'sky'});
    expect((await action(id,auth,{type:'edit',name:'Prayer night',website:'',icon:'prayer-hands',color:'peach'})).status).toBe(200);
    expect(await env.DB.prepare('SELECT icon,color FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({icon:'prayer-hands',color:'peach'});
    expect((await action(id,auth,{type:'edit',name:'Prayer night',website:'',icon:'heart'})).status).toBe(200);
    expect(await env.DB.prepare('SELECT color FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({color:'peach'});
    expect((await membership(id,'owner'))?.is_admin).toBe(1);
    expect((await action(id,auth,{type:'edit',name:'Prayer night',website:'',icon:'heart',color:'url(https://unsafe.example)'})).status).toBe(400);
    expect(await env.DB.prepare('SELECT color FROM group_settings WHERE box_id=?').bind(id).first()).toEqual({color:'peach'});
  });

});
