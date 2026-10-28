import type { Database } from './data.ts';
import type { BackendEnv } from './env.ts';
import type { Actor } from './policy.ts';
import { HttpError, jsonResponse, readJsonObject } from './http.ts';
import { applyGroupCommand, createPrayerGroup, GroupError, groupIcons, isGroupAdmin, canModerateGroup, groupNoticesForCommand, normalizeGroupUsername } from '../../src/prayer-groups.ts';
import type { GroupCommand, GroupIcon, GroupMember, GroupPerson, PrayerGroup } from '../../src/prayer-groups.ts';

const sessionSql = `EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.session_epoch = u.session_epoch
  AND s.session_epoch = ? AND s.csrf_hash = ? AND s.expires_at > ? AND s.created_at <= ?
  AND s.authenticated_at <= ? AND u.status = 'active')`;
const sessionValues = (actor: Actor, now: number) => [actor.sessionId, actor.id, actor.sessionEpoch, actor.csrfHash, now, now, now];
const person = (actor: Actor): GroupPerson => ({ id: actor.id, username: actor.username, name: actor.displayName, active: true });
const unavailable = () => new HttpError(404, 'group_unavailable', 'This prayer group is not available.');

// Includes account availability and block rows, which can change outside group administration.
// Captured before policy evaluation and compared in the same transaction as the CAS update.
const fingerprintSql = `(SELECT COALESCE(group_concat(fact,'|'),'') FROM (
  SELECT json_array(m.user_id,m.status,m.role,m.is_admin,m.approved_at,m.revoked_at,m.joined_at,m.invited_by,m.version,u.status,
    m.official_reply,m.is_moderator,m.moderator_since,EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id=m.box_id AND x.user_id=m.user_id),
    (SELECT COALESCE(group_concat(blockfact,'|'),'') FROM (
      SELECT json_array(x.blocker_id,x.blocked_id) AS blockfact FROM blocks x
      WHERE x.blocker_id=m.user_id OR x.blocked_id=m.user_id ORDER BY x.blocker_id,x.blocked_id))) AS fact
  FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.box_id=? ORDER BY m.user_id))`;

function stepUp(actor: Actor, now: number) {
  if (actor.assurance !== 'mfa' || actor.authenticatedAt > now || now - actor.authenticatedAt > 300_000)
    throw new HttpError(403, 'step_up_required', 'Please verify your sign-in again before changing group administration.', true);
}
function website(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new HttpError(400, 'invalid_website', 'Enter an optional public website address.');
  if (!value.trim()) return '';
  const raw = value.trim();
  if (/[\s\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(raw) || raw.startsWith('/')) throw new HttpError(400, 'invalid_website', 'Use a public http or https website without login details.');
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.hostname.includes(':') || /^[\d.]+$/.test(url.hostname) || /(?:^|\.)(localhost|local|internal|lan|home)\.?$/i.test(url.hostname) || /(?:^|\.)(cash\.app|paypal\.me|gofundme\.com|venmo\.com)$/i.test(url.hostname)) throw new Error();
    return url.href;
  } catch { throw new HttpError(400, 'invalid_website', 'Use your group’s public website, without login details or fundraising links.'); }
}
function details(input: Record<string, unknown>) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80 || typeof input.icon !== 'string' || !groupIcons.includes(input.icon as GroupIcon))
    throw new HttpError(400, 'invalid_group', 'Enter a group name of up to 80 characters and choose an icon.');
  return { name: input.name.trim(), website: website(input.website ?? ''), icon: input.icon as GroupIcon };
}
async function rateLimit(db: Database, actor: Actor, action: string, now: number) {
  const window = Math.floor(now / 3_600_000) * 3_600_000;
  const row = await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count = MIN(count + 1,1000000) RETURNING count`)
    .bind(`group:${action}:${actor.id}`, window).first<{ count: number }>();
  if (!row || row.count > (action === 'create' ? 5 : 60)) throw new HttpError(429, 'rate_limited', 'Please wait before making more group changes.', true);
}

async function loadGroup(db: Database, id: string): Promise<PrayerGroup | null> {
  const row = await db.prepare(`SELECT b.id,b.owner_id,b.slug,b.display_name,b.status,b.created_at,
    g.website,g.icon,g.version,g.archived_at,g.updated_at,g.deletion_proposal FROM boxes b JOIN group_settings g ON g.box_id = b.id
    WHERE b.id = ? AND b.kind = 'organization' AND b.status = 'active' AND g.archived_at IS NULL`).bind(id)
    .first<{ id: string; owner_id: string; slug: string; display_name: string; created_at: number; website: string; icon: GroupIcon; version: number; archived_at: number | null; updated_at: number; deletion_proposal: string | null }>();
  if (!row) return null;
  const members = await db.prepare(`SELECT m.*,u.username,u.display_name,u.status AS user_status,
    EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id = m.box_id AND x.user_id = m.user_id) AS blocked
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.box_id = ? ORDER BY m.user_id LIMIT 501`).bind(id)
    .all<{ user_id: string; status: string; role: string; is_admin: number; is_moderator: number; moderator_since: number | null; official_reply: number; joined_at: number | null; approved_at: number | null; revoked_at: number | null; invited_at: number | null; invited_by: string | null; username: string; display_name: string; user_status: string; blocked: number }>();
  if (members.results.length > 500) throw new HttpError(409, 'group_capacity', 'This group needs an administrator review before further membership changes.');
  const now = Date.now();
  return { id: row.id, ownerId: row.owner_id, username: row.slug, name: row.display_name, website: row.website, icon: row.icon, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at, deletionProposal: row.deletion_proposal ? JSON.parse(row.deletion_proposal) as PrayerGroup['deletionProposal'] : undefined,
    members: members.results.map(member => ({ id: member.user_id, name: member.display_name, username: member.username,
      active: member.user_status === 'active' && (member.status !== 'approved' || member.revoked_at === null && member.approved_at !== null && member.approved_at <= now),
      status: member.blocked ? 'blocked' : member.status === 'revoked' ? 'left' : member.status as GroupMember['status'],
      role: member.is_admin || member.role === 'owner' ? 'admin' : member.is_moderator ? 'moderator' : 'member', moderatorSince: member.moderator_since, joinedAt: member.joined_at ?? member.approved_at,
      updatedAt: member.revoked_at ?? member.approved_at ?? member.invited_at ?? row.updated_at, invitedBy: member.invited_by ?? undefined, officialReply: member.official_reply === 1 })) };
}
function dto(group: PrayerGroup, actor: Actor) {
  const self = group.members.find(member => member.id === actor.id);
  const staff = canModerateGroup(group, actor.id);
  return { id: group.id, name: group.name, username: group.username, website: group.website, icon: group.icon,
    version: group.version, createdAt: group.createdAt, updatedAt: group.updatedAt, archivedAt: group.archivedAt,
    ...(isGroupAdmin(group, actor.id) && group.deletionProposal ? { deletionProposal: group.deletionProposal } : {}),
    verifiedOrganization: false, membership: self ? { status: self.status, role: self.role, moderatorSince: self.moderatorSince, joinedAt: self.joinedAt, officialReply: self.officialReply === true } : null,
    ...(staff ? { members: group.members.map(member => ({ id: member.id, username: member.username, name: member.name, active: member.active, status: member.status, role: member.role, moderatorSince: member.moderatorSince, joinedAt: member.joinedAt, officialReply: member.officialReply === true })) } : {}) };
}
async function safeDto(db: Database, group: PrayerGroup, actor: Actor) {
  const now = Date.now();
  const fresh = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM memberships m WHERE m.box_id=? AND m.user_id=? AND m.status='approved'
      AND m.approved_at<=? AND m.revoked_at IS NULL AND (m.is_admin=1 OR m.role='owner' OR m.is_moderator=1)) AS staff,
    EXISTS(SELECT 1 FROM memberships m WHERE m.box_id=? AND m.user_id=? AND m.status='approved'
      AND m.approved_at<=? AND m.revoked_at IS NULL AND (m.is_admin=1 OR m.role='owner')) AS admin,
    EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id=? AND x.user_id=?) AS blocked
    WHERE ${sessionSql}`).bind(group.id,actor.id,now,group.id,actor.id,now,group.id,actor.id,...sessionValues(actor,now)).first<{staff:number;admin:number;blocked:number}>();
  if (!fresh) throw new HttpError(401,'session_expired','Please sign in again.');
  if (fresh.blocked) throw unavailable();
  const value = dto(group,actor);
  if (!fresh.staff) delete value.members;
  if (!fresh.admin) delete value.deletionProposal;
  return value;
}

/** Called only after the router checks origin and CSRF for POSTs. Every commit rechecks the session. */
export async function handleGroupRoute(request: Request, _env: BackendEnv, actor: Actor | null, db: Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/api\/groups(?:\/|$)/.test(url.pathname)) return null;
  if (!actor) throw new HttpError(401, 'sign_in_required', 'Please sign in to manage prayer groups.');
  const now = Date.now();
  const current = await db.prepare(`SELECT 1 AS ok WHERE ${sessionSql}`).bind(...sessionValues(actor, now)).first();
  if (!current) throw new HttpError(401, 'session_expired', 'Please sign in again.');
  if (request.method === 'GET' && url.pathname === '/api/groups') {
    const rows = await db.prepare(`SELECT b.id FROM boxes b JOIN group_settings g ON g.box_id = b.id
      JOIN memberships m ON m.box_id = b.id WHERE m.user_id = ? AND m.status IN ('approved','pending','invited')
      AND b.status = 'active' AND g.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id = b.id AND x.user_id = ?)
      ORDER BY b.created_at,b.id LIMIT 100`).bind(actor.id, actor.id).all<{ id: string }>();
    const loaded = (await Promise.all(rows.results.map(row => loadGroup(db, row.id)))).filter((group): group is PrayerGroup => Boolean(group));
    const groups = await Promise.all(loaded.map(group => safeDto(db,group,actor)));
    const username = url.searchParams.get('username');
    if (username) {
      let normalized: string; try { normalized = normalizeGroupUsername(username); } catch { return jsonResponse({ groups, found: [] }); }
      const found = await db.prepare(`SELECT b.id FROM boxes b JOIN group_settings g ON g.box_id = b.id
        WHERE b.slug = ? COLLATE NOCASE AND b.visibility = 'everyone' AND b.status = 'active' AND g.archived_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id = b.id AND x.user_id = ?)`).bind(normalized, actor.id).first<{ id: string }>();
      const group = found ? await loadGroup(db, found.id) : null;
      return jsonResponse({ groups, found: group ? [await safeDto(db,group,actor)] : [] });
    }
    return jsonResponse({ groups });
  }
  if (request.method === 'POST' && url.pathname === '/api/groups') {
    stepUp(actor, now); await rateLimit(db, actor, 'create', now);
    const input = await readJsonObject(request);
    if (Object.keys(input).some(key => !['name', 'username', 'website', 'icon'].includes(key)) || typeof input.username !== 'string') throw new HttpError(400, 'invalid_group', 'Choose a name, username, optional website, and icon.');
    const values = { ...details(input), username: input.username };
    let group: PrayerGroup;
    try { group = createPrayerGroup([], person(actor), values, now); } catch (error) { throw new HttpError(400, 'invalid_group', error instanceof Error ? error.message : 'Check the group details.'); }
    const duplicate = await db.prepare('SELECT id FROM boxes WHERE slug = ? COLLATE NOCASE').bind(group.username).first();
    if (duplicate) throw new HttpError(409, 'username_taken', 'That username is already in use. Choose another.');
    try {
      const result = await db.batch([
        db.prepare(`INSERT INTO boxes(id,kind,owner_id,slug,display_name,visibility,created_at)
          SELECT ?,'organization',?,?,?,'everyone',? WHERE ${sessionSql}
          AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND assurance='mfa' AND authenticated_at>=?)`)
          .bind(group.id, actor.id, group.username, group.name, now, ...sessionValues(actor, now),actor.sessionId,now-300_000),
        db.prepare(`INSERT INTO group_settings(box_id,website,icon,updated_at) SELECT id,?,?,? FROM boxes WHERE id = ?`).bind(group.website, group.icon, now, group.id),
        db.prepare(`INSERT INTO memberships(box_id,user_id,status,role,approved_by,approved_at,is_admin,joined_at)
          SELECT id,?,'approved','owner',?,?,1,? FROM boxes WHERE id = ?`).bind(actor.id, actor.id, now, now, group.id),
        db.prepare(`INSERT INTO group_events(id,box_id,actor_id,action,previous_version,version,created_at)
          SELECT ?,id,?,'create',0,1,? FROM boxes WHERE id = ?`).bind(crypto.randomUUID(), actor.id, now, group.id),
      ]);
      if (result[0].meta.changes !== 1) throw new HttpError(401, 'session_expired', 'Please sign in again.');
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (await db.prepare('SELECT id FROM boxes WHERE slug = ? COLLATE NOCASE').bind(group.username).first()) throw new HttpError(409, 'username_taken', 'That username is already in use. Choose another.');
      throw error;
    }
    return jsonResponse(await safeDto(db,group,actor), 201);
  }
  const match = url.pathname.match(/^\/api\/groups\/([A-Za-z0-9_-]{1,160})(\/actions)?$/);
  if (!match) return null;
  const fingerprint = await db.prepare(`SELECT ${fingerprintSql} AS value`).bind(match[1]).first<{value:string}>();
  const group = await loadGroup(db, match[1]); if (!group) throw unavailable();
  const self = group.members.find(member => member.id === actor.id);
  if (self?.status === 'blocked' || await db.prepare('SELECT 1 FROM box_blocks WHERE box_id=? AND user_id=?').bind(group.id,actor.id).first()) throw unavailable();
  const box = await db.prepare('SELECT visibility,owner_id FROM boxes WHERE id = ?').bind(group.id).first<{ visibility: string; owner_id: string }>();
  if (box?.visibility !== 'everyone' && (!self || !['approved','invited','pending'].includes(self.status))) throw unavailable();
  if (request.method === 'GET' && !match[2]) return jsonResponse(await safeDto(db,group,actor));
  if (request.method !== 'POST' || !match[2]) return null;
  const input = await readJsonObject(request);
  if (Object.keys(input).some(key => !['expectedVersion', 'command'].includes(key)) || !Number.isSafeInteger(input.expectedVersion) || !input.command || typeof input.command !== 'object' || Array.isArray(input.command)) throw new HttpError(400, 'invalid_group_action', 'Refresh the group and try the action again.');
  if (input.expectedVersion !== group.version) throw new HttpError(409, 'group_changed', 'This group changed. Refresh it before trying again.', true);
  const raw = input.command as Record<string, unknown>;
  const kinds = ['edit','request_join','withdraw','invite','accept_invite','decline_invite','cancel_invite','approve','deny','remove','block','unblock','promote','demote','leave','set_official_reply','set_role','request_deletion','approve_deletion','cancel_deletion'];
  if (typeof raw.type !== 'string' || !kinds.includes(raw.type)) throw new HttpError(400, 'invalid_group_action', 'Choose an available group action.');
  const own = ['request_join','withdraw','accept_invite','decline_invite','leave'].includes(raw.type);
  if (!own || raw.type === 'leave' && isGroupAdmin(group, actor.id)) stepUp(actor, now);
  const moderatorAction = ['approve','deny','remove'].includes(raw.type);
  if (!own && !(moderatorAction ? canModerateGroup(group, actor.id) : isGroupAdmin(group, actor.id))) throw new HttpError(403, 'admin_required', 'Only active group admins can make that change.');
  const deletionAction = ['request_deletion','approve_deletion','cancel_deletion'].includes(raw.type);
  const fields = deletionAction ? (raw.type === 'request_deletion' ? ['type'] : ['type','proposalId']) : raw.type === 'edit' ? ['type','name','website','icon'] : raw.type === 'leave' ? ['type','successorId'] : raw.type === 'set_role' ? ['type','targetId','role'] : raw.type === 'set_official_reply' ? ['type','targetId','allowed'] : own ? ['type'] : ['type','targetId'];
  if (Object.keys(raw).some(key => !fields.includes(key)) || (!own && !deletionAction && raw.type !== 'edit' && typeof raw.targetId !== 'string') || (raw.successorId !== undefined && typeof raw.successorId !== 'string') || raw.type === 'set_official_reply' && typeof raw.allowed !== 'boolean' || raw.type === 'set_role' && !['admin','moderator','member'].includes(String(raw.role)) || deletionAction && raw.type !== 'request_deletion' && (typeof raw.proposalId !== 'string' || raw.proposalId.length > 250)) throw new HttpError(400, 'invalid_group_action', 'Check this group action and try again.');
  const command = (raw.type === 'edit' ? { type: 'edit', ...details(raw) } : raw) as GroupCommand;
  await rateLimit(db, actor, command.type === 'invite' || command.type === 'request_join' ? 'invitation' : 'change', now);
  const people: GroupPerson[] = group.members.map(member => ({ id: member.id, username: member.username, name: member.name, active: member.active }));
  const invitePeer = command.type === 'invite' ? command.targetId : command.type === 'accept_invite' ? self?.invitedBy : undefined;
  if (invitePeer && await db.prepare(`SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)
    UNION ALL SELECT 1 FROM box_blocks WHERE box_id=? AND user_id=? LIMIT 1`).bind(actor.id,invitePeer,invitePeer,actor.id,group.id,invitePeer).first()) throw unavailable();
  if (command.type === 'invite' && !people.some(member => member.id === command.targetId)) {
    const target = await db.prepare(`SELECT u.id,u.username,u.display_name FROM users u WHERE u.id = ? AND u.status = 'active' AND u.visibility = 'everyone'
      AND NOT EXISTS(SELECT 1 FROM blocks x WHERE (x.blocker_id = ? AND x.blocked_id = u.id) OR (x.blocker_id = u.id AND x.blocked_id = ?))`)
      .bind(command.targetId, actor.id, actor.id).first<{ id: string; username: string; display_name: string }>();
    if (!target) throw unavailable();
    people.push({ id: target.id, name: target.display_name, username: target.username, active: true });
  }
  let next: PrayerGroup;
  try { next = applyGroupCommand(group, person(actor), command, group.version, people, now); }
  catch (error) { if (error instanceof GroupError) throw new HttpError(409, 'invalid_membership_transition', error.message); throw error; }
  if (next.members.length > 500) throw new HttpError(409, 'group_capacity', 'This group needs an administrator review before adding more members.');
  const mutation = crypto.randomUUID();
  const guard = `EXISTS(SELECT 1 FROM group_settings g WHERE g.box_id = ? AND g.mutation_token = ? AND g.version = ?)`;
  const guardValues = [group.id, mutation, next.version];
  const activeAdmin = next.members.find(member => member.id === next.ownerId && member.active && member.status === 'approved' && member.role === 'admin');
  // Membership/privilege mutations serialize through the group version in this same D1 transaction.
  const statements = [
    db.prepare(`UPDATE group_settings SET website = ?,icon = ?,version = ?,mutation_token = ?,archived_at = ?,updated_at = ?,deletion_proposal = ?
      WHERE box_id = ? AND version = ? AND archived_at IS NULL AND ${sessionSql} AND ${fingerprintSql} = ?
      ${!own || command.type === 'leave' && isGroupAdmin(group, actor.id) ? `AND EXISTS(SELECT 1 FROM memberships m JOIN sessions s ON s.user_id = m.user_id WHERE m.box_id = group_settings.box_id AND m.user_id = ? AND m.status = 'approved' AND m.revoked_at IS NULL AND (m.is_admin = 1 OR m.role = 'owner' ${moderatorAction ? 'OR m.is_moderator = 1' : ''}) AND s.id = ? AND s.assurance = 'mfa' AND s.authenticated_at >= ?)` : ''}
      ${invitePeer ? `AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')
        AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))
        AND NOT EXISTS(SELECT 1 FROM box_blocks WHERE box_id=? AND user_id=?)` : ''}`)
      .bind(next.website, next.icon, next.version, mutation, next.archivedAt, now, next.deletionProposal ? JSON.stringify(next.deletionProposal) : null, group.id, group.version, ...sessionValues(actor, now), group.id, fingerprint?.value ?? '', ...(!own || command.type === 'leave' && isGroupAdmin(group, actor.id) ? [actor.id, actor.sessionId, now - 300_000] : []), ...(invitePeer ? [invitePeer,actor.id,invitePeer,invitePeer,actor.id,group.id,invitePeer] : [])),
    db.prepare(`UPDATE boxes SET display_name = ?,owner_id = COALESCE(?,owner_id),status = ? WHERE id = ? AND ${guard}`)
      .bind(next.name, activeAdmin?.id ?? null, next.archivedAt ? 'deleted' : 'active', group.id, ...guardValues),
  ];
  for (const member of next.members) {
    const previous = group.members.find(value => value.id === member.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(member)) continue;
    const status = ['left','blocked'].includes(member.status) ? 'revoked' : member.status;
    const approved = member.status === 'approved';
    statements.push(db.prepare(`INSERT INTO memberships(box_id,user_id,status,role,approved_by,approved_at,revoked_at,is_admin,joined_at,invited_by,invited_at,official_reply,is_moderator,moderator_since)
      SELECT ?,?,?,?, ?,?,?,?,?,?,?,?,?,? WHERE ${guard}
      ON CONFLICT(box_id,user_id) DO UPDATE SET status=excluded.status,role=excluded.role,
      approved_by=CASE WHEN memberships.status='approved' AND excluded.status='approved' THEN memberships.approved_by ELSE excluded.approved_by END,
      approved_at=CASE WHEN memberships.status='approved' AND excluded.status='approved' THEN memberships.approved_at ELSE excluded.approved_at END,
      revoked_at=excluded.revoked_at,is_admin=excluded.is_admin,joined_at=excluded.joined_at,
      invited_by=excluded.invited_by,invited_at=excluded.invited_at,version=memberships.version+1,
      official_reply=CASE WHEN excluded.status='approved' THEN excluded.official_reply ELSE 0 END,
      is_moderator=excluded.is_moderator,moderator_since=excluded.moderator_since`)
      .bind(group.id, member.id, status, member.id === activeAdmin?.id ? 'owner' : 'member', approved ? (previous?.status === 'approved' ? actor.id : command.type === 'accept_invite' ? previous?.invitedBy ?? actor.id : actor.id) : null,
        approved ? member.joinedAt : null, status === 'revoked' ? now : null, member.role === 'admin' ? 1 : 0, member.joinedAt, member.invitedBy ?? null, member.status === 'invited' ? member.updatedAt : null, approved && member.officialReply ? 1 : 0, approved && member.role === 'moderator' ? 1 : 0, approved && member.role === 'moderator' ? member.moderatorSince ?? null : null, ...guardValues));
    if (member.status === 'blocked') statements.push(db.prepare(`INSERT INTO box_blocks(box_id,user_id,created_at) SELECT ?,?,? WHERE ${guard} ON CONFLICT(box_id,user_id) DO NOTHING`).bind(group.id,member.id,now,...guardValues));
    else if (previous?.status === 'blocked') statements.push(db.prepare(`DELETE FROM box_blocks WHERE box_id=? AND user_id=? AND ${guard}`).bind(group.id,member.id,...guardValues));
  }
  // An existing co-admin may inherit box ownership without changing their model
  // role. Keep the legacy owner marker aligned in the same atomic transaction.
  statements.push(db.prepare(`UPDATE memberships SET role=CASE WHEN user_id=? AND status='approved' THEN 'owner' ELSE 'member' END,
    version=version+1 WHERE box_id=? AND role!=CASE WHEN user_id=? AND status='approved' THEN 'owner' ELSE 'member' END AND ${guard}`)
    .bind(activeAdmin?.id ?? '',group.id,activeAdmin?.id ?? '',...guardValues));
  statements.push(db.prepare(`INSERT INTO group_events(id,box_id,actor_id,action,target_id,previous_version,version,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),group.id,actor.id,command.type,'targetId' in command ? command.targetId : null,group.version,next.version,now,...guardValues));
  for (const notice of groupNoticesForCommand(group, next, actor.id, command)) {
    statements.push(db.prepare(`INSERT INTO group_notices(id,recipient_id,box_id,group_name,kind,title,message,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(notice.id,notice.recipientId,notice.groupId,notice.groupName,notice.kind,notice.title,notice.message,notice.createdAt,...guardValues));
  }
  if (next.archivedAt) {
    statements.push(db.prepare(`UPDATE media SET state='deleted',deleted_at=COALESCE(deleted_at,?),updated_at=?
      WHERE delivery_id IN (SELECT id FROM deliveries WHERE box_id=?) AND ${guard}`).bind(now,now,group.id,...guardValues));
    statements.push(db.prepare(`UPDATE post_edits SET state='cancelled',cancelled_at=? WHERE state='pending'
      AND delivery_id IN (SELECT id FROM deliveries WHERE box_id=?) AND ${guard}`).bind(now,group.id,...guardValues));
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1) throw new HttpError(409, 'group_changed', 'Your access or this group changed. Refresh it before trying again.', true);
  return jsonResponse(await safeDto(db,next,actor));
}
