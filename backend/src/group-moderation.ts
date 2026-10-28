import type { BackendEnv } from './env.ts';
import { loadDeliveryContext, loadPosts, loadReplies, type Database } from './data.ts';
import type { Actor } from './policy.ts';
import { HttpError, jsonResponse, readJsonObject } from './http.ts';

const reasons = {
  harassment: 'harassment or unwanted negative attention',
  hate: 'hate speech',
  solicitation: 'fundraising or financial solicitation',
  privacy: 'someone’s privacy',
  trinitarian: 'the community’s Trinitarian foundation',
  other: 'the group’s prayer guidelines',
} as const;
type RemovalReason = keyof typeof reasons;
type RemovalInput = { deliveryId: string; postId: string; replyId?: string; expectedRevision: number; reason: RemovalReason };
const identifier = /^[A-Za-z0-9_:-]{1,160}$/;
const unavailable = () => new HttpError(404, 'not_found', 'This group item is not available.');
const sessionSql = `EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
  WHERE s.id=? AND s.user_id=? AND s.session_epoch=? AND s.csrf_hash=?
  AND s.session_epoch=u.session_epoch AND s.revoked_at IS NULL AND s.expires_at>?
  AND s.created_at<=? AND s.authenticated_at<=? AND u.status='active')`;
const sessionArgs = (actor: Actor, now: number) => [actor.sessionId,actor.id,actor.sessionEpoch,actor.csrfHash,now,now,now];
const staffSql = `FROM memberships m JOIN boxes b ON b.id=m.box_id JOIN group_settings g ON g.box_id=b.id
  JOIN users u ON u.id=m.user_id JOIN sessions s ON s.user_id=u.id
  WHERE b.id=? AND b.kind='organization' AND b.status='active' AND g.archived_at IS NULL
  AND m.user_id=? AND m.status='approved' AND m.approved_at<=? AND m.revoked_at IS NULL
  AND (m.is_admin=1 OR m.role='owner' OR m.is_moderator=1) AND u.status='active'
  AND NOT EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id=b.id AND x.user_id=m.user_id)
  AND s.id=? AND s.session_epoch=? AND s.csrf_hash=? AND s.session_epoch=u.session_epoch
  AND s.revoked_at IS NULL AND s.expires_at>? AND s.created_at<=? AND s.authenticated_at<=?
  AND s.assurance='mfa' AND s.authenticated_at>=?`;
const staffArgs = (actor: Actor, groupId: string, now: number) => [groupId,actor.id,now,actor.sessionId,actor.sessionEpoch,actor.csrfHash,now,now,now,now-300_000];

async function requireStaff(db: Database, actor: Actor, groupId: string, now = Date.now()) {
  const staff = await db.prepare(`SELECT CASE WHEN m.is_admin=1 OR m.role='owner' THEN 'admin' ELSE 'moderator' END AS role,b.display_name AS name ${staffSql}`)
    .bind(...staffArgs(actor,groupId,now)).first<{role:'admin'|'moderator';name:string}>();
  if (!staff) throw new HttpError(403,'group_staff_required','An active group admin or moderator must verify their sign-in again before removing content.',true);
  return staff;
}

// Policy facts are captured before reading the target and compared inside the removal
// transaction. This protects against membership, privacy, block, and content changes
// while asynchronous permission checks are running. No text is duplicated here.
const snapshotSql = `(SELECT json_array(d.box_id,d.source_id,d.status,d.deleted_at,d.version,d.audience,d.author_ceiling,d.box_ceiling,d.anonymous,d.history_policy,d.history_notice_version,d.group_block_policy,d.created_at,
  a.author_id,a.deleted_at,au.status,au.visibility,b.owner_id,b.status,b.visibility,ou.status,g.version,g.archived_at,
  p.id,p.kind,p.status,p.deleted_at,p.revision,r.id,r.actor_id,r.identity_mode,r.status,r.deleted_at,r.revision,r.parent_id,ru.status,
  parent.status,parent.deleted_at,parent.revision,parent.actor_id,parent.identity_mode,pu.status,
  (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(m.user_id,m.status,m.role,m.is_admin,m.is_moderator,m.moderator_since,m.approved_at,m.revoked_at,m.official_reply,mu.status) AS fact FROM memberships m JOIN users mu ON mu.id=m.user_id WHERE m.box_id=b.id ORDER BY m.user_id)),
  (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(x.blocker_id,x.blocked_id) AS fact FROM blocks x WHERE x.blocker_id IN (a.author_id,?1,r.actor_id,parent.actor_id,b.owner_id) OR x.blocked_id IN (a.author_id,?1,r.actor_id,parent.actor_id,b.owner_id) ORDER BY x.blocker_id,x.blocked_id)),
  (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(x.user_id,x.created_at) AS fact FROM box_blocks x WHERE x.box_id=b.id ORDER BY x.user_id)),
  (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(f.user_a,f.user_b,f.status) AS fact FROM friendships f WHERE f.user_a=?1 OR f.user_b=?1 ORDER BY f.user_a,f.user_b)),
  (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(c.user_id,c.status) AS fact FROM box_circle c WHERE c.box_id=b.id ORDER BY c.user_id)))
  FROM deliveries d JOIN authored_sources a ON a.id=d.source_id JOIN users au ON au.id=a.author_id
  JOIN boxes b ON b.id=d.box_id JOIN users ou ON ou.id=b.owner_id JOIN group_settings g ON g.box_id=b.id
  JOIN posts p ON p.delivery_id=d.id AND p.id=?3 LEFT JOIN replies r ON r.id=?4 AND r.delivery_id=d.id AND r.post_id=p.id
  LEFT JOIN users ru ON ru.id=r.actor_id LEFT JOIN replies parent ON parent.id=r.parent_id AND parent.delivery_id=d.id AND parent.post_id=p.id
  LEFT JOIN users pu ON pu.id=parent.actor_id WHERE d.id=?2 AND b.id=?5)`;
const snapshotArgs = (actor: Actor, groupId: string, input: RemovalInput) => [actor.id,input.deliveryId,input.postId,input.replyId ?? '',groupId];

function parseInput(value: Record<string,unknown>): RemovalInput {
  if (Object.keys(value).some(key=>!['deliveryId','postId','replyId','expectedRevision','reason'].includes(key))
    || typeof value.deliveryId!=='string' || !identifier.test(value.deliveryId) || typeof value.postId!=='string' || !identifier.test(value.postId)
    || value.replyId!==undefined && (typeof value.replyId!=='string' || !identifier.test(value.replyId))
    || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision)<1
    || typeof value.reason!=='string' || !Object.hasOwn(reasons,value.reason))
    throw new HttpError(400,'invalid_removal','Choose the current group post or prayer and a reason for removing it.');
  return value as RemovalInput;
}

type StoredRemoval = { id:string;actor_id:string;reason:string;expected_revision:number;created_at:number;post_id:string;reply_id:string|null;delivery_id:string };
async function replay(db: Database, actor: Actor, groupId: string, input: RemovalInput) {
  await requireStaff(db,actor,groupId);
  const row = await db.prepare('SELECT id,actor_id,reason,expected_revision,created_at,post_id,reply_id,delivery_id FROM group_content_removals WHERE box_id=? AND target_key=?')
    .bind(groupId,input.replyId ? `reply:${input.replyId}` : `post:${input.postId}`).first<StoredRemoval>();
  if (!row) return null;
  if (row.actor_id!==actor.id || row.post_id!==input.postId || row.reply_id!==(input.replyId??null) || row.delivery_id!==input.deliveryId) throw unavailable();
  if (row.reason!==input.reason || row.expected_revision!==input.expectedRevision) throw new HttpError(409,'removal_conflict','This item was already removed with another version or reason. Refresh the group.',true);
  await requireStaff(db,actor,groupId);
  return jsonResponse({removed:true,removalId:row.id,createdAt:row.created_at,duplicate:true});
}

async function removeContent(db: Database, actor: Actor, groupId: string, input: RemovalInput) {
  const prior = await replay(db,actor,groupId,input); if(prior) return prior;
  const snapshot = await db.prepare(`SELECT ${snapshotSql} AS value`).bind(...snapshotArgs(actor,groupId,input)).first<{value:string|null}>();
  if (!snapshot?.value) throw unavailable();
  const context = await loadDeliveryContext(db,input.deliveryId,actor);
  if (!context || context.box_id!==groupId || context.box_kind!=='organization') throw unavailable();
  const posts = await loadPosts(db,context,actor);
  const post = posts.find(post=>post.id===input.postId); if(!post) throw unavailable();
  const reply = input.replyId ? (await loadReplies(db,context,post,actor)).find(reply=>reply.id===input.replyId) : undefined;
  if (input.replyId && !reply) throw unavailable();
  if ((reply?.revision??post.revision)!==input.expectedRevision) throw new HttpError(409,'removal_conflict','This item changed. Review the current version before removing it.',true);
  const now=Date.now(); const staff=await requireStaff(db,actor,groupId,now);
  const rate = await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count=MIN(count+1,1000000) RETURNING count`)
    .bind(`group-removal:${actor.id}`,Math.floor(now/3_600_000)*3_600_000).first<number>('count');
  if (rate===null || rate>60) throw new HttpError(429,'rate_limited','Please wait before making more group moderation changes.',true);
  const id=crypto.randomUUID();
  const recipient=reply?.actor_id??context.author_id;
  if(recipient===actor.id) throw new HttpError(403,'own_content','Use your own edit or delete controls for your words.');
  const original=!reply && post.kind==='request';
  const guard='EXISTS(SELECT 1 FROM group_content_removals WHERE id=?)';
  // The first five numbered parameters are reserved by snapshotSql. Subsequent
  // placeholders use sequential bindings, preventing mixing target and actor IDs.
  const statements=[db.prepare(`INSERT INTO group_content_removals(id,box_id,delivery_id,post_id,reply_id,target_key,actor_id,actor_role,recipient_id,reason,expected_revision,created_at)
    SELECT ?6,?5,?2,?3,?,?,?1,?,?,?,?,? WHERE ${snapshotSql}=? AND EXISTS(SELECT 1 ${staffSql})
    AND NOT EXISTS(SELECT 1 FROM group_content_removals WHERE box_id=?5 AND target_key=?)`)
    .bind(...snapshotArgs(actor,groupId,input),id,input.replyId??null,input.replyId?`reply:${input.replyId}`:`post:${input.postId}`,staff.role,recipient,input.reason,input.expectedRevision,now,snapshot.value,...staffArgs(actor,groupId,now),input.replyId?`reply:${input.replyId}`:`post:${input.postId}`)];
  if (reply) statements.push(db.prepare(`UPDATE replies SET status='deleted',deleted_at=? WHERE id=? AND delivery_id=? AND post_id=? AND ${guard}`).bind(now,reply.id,input.deliveryId,post.id,id));
  else {
    statements.push(db.prepare(`UPDATE posts SET status='deleted',deleted_at=? WHERE delivery_id=? ${original?'':'AND id=?'} AND ${guard}`).bind(now,input.deliveryId,...(original?[]:[post.id]),id));
    if(original) statements.push(db.prepare(`UPDATE deliveries SET status='deleted',deleted_at=?,version=version+1 WHERE id=? AND box_id=? AND ${guard}`).bind(now,input.deliveryId,groupId,id));
    statements.push(db.prepare(`UPDATE media SET state='deleted',deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE delivery_id=? ${original?'':'AND post_id=?'} AND ${guard}`).bind(now,now,input.deliveryId,...(original?[]:[post.id]),id));
    statements.push(db.prepare(`UPDATE post_edits SET state='cancelled',cancelled_at=? WHERE state='pending' AND delivery_id=? ${original?'':'AND post_id=?'} AND ${guard}`).bind(now,input.deliveryId,...(original?[]:[post.id]),id));
  }
  const kind=reply?'prayer_removed':'post_removed';
  const message=`Your ${reply?'prayer or encouragement':'story post'} was removed from ${staff.name} by a group ${staff.role}. Reason: ${reasons[input.reason]}. This applies only to this group’s copy. Your personal account and copies in other boxes are unchanged.`;
  statements.push(db.prepare(`INSERT INTO group_notices(id,recipient_id,box_id,group_name,kind,title,message,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(`removal:${id}`,recipient,groupId,staff.name,kind,reply?'Your prayer or encouragement was removed.':'Your post was removed.',message,now,id));
  let changed=false;
  try { const results=await db.batch(statements);changed=results[0].meta.changes===1; }
  catch(error) { const duplicate=await replay(db,actor,groupId,input);if(duplicate) return duplicate;throw error; }
  if (!changed) { const duplicate=await replay(db,actor,groupId,input);if(duplicate) return duplicate;throw new HttpError(409,'group_changed','Your access or this group item changed. Refresh it before trying again.',true); }
  return jsonResponse({removed:true,removalId:id,createdAt:now,duplicate:false});
}

/** GETs authenticate privately. Root must require exact Origin and CSRF before POSTs. */
export async function handleGroupModerationRoute(request: Request,_env: BackendEnv,actor: Actor|null,db: Database):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  const removal=path.match(/^\/api\/groups\/([A-Za-z0-9_-]{1,160})\/removals$/);
  const mark=path.match(/^\/api\/group-notices\/([^/]{1,1000})\/read$/);
  if(!removal && !mark && path!=='/api/group-notices') return null;
  if(!actor) throw new HttpError(401,'sign_in_required','Please sign in to see your group notices.');
  const now=Date.now();
  const current=await db.prepare(`SELECT 1 WHERE ${sessionSql}`).bind(...sessionArgs(actor,now)).first();
  if(!current) throw new HttpError(401,'session_expired','Please sign in again.');
  if(removal && request.method==='POST') return removeContent(db,actor,removal[1],parseInput(await readJsonObject(request)));
  if(path==='/api/group-notices' && request.method==='GET') {
    const rows=await db.prepare(`SELECT id,box_id,group_name,kind,title,message,created_at,read_at FROM group_notices WHERE recipient_id=? AND ${sessionSql} ORDER BY created_at DESC,id DESC LIMIT 100`)
      .bind(actor.id,...sessionArgs(actor,Date.now())).all<{id:string;box_id:string;group_name:string;kind:string;title:string;message:string;created_at:number;read_at:number|null}>();
    const stillCurrent=await db.prepare(`SELECT 1 WHERE ${sessionSql}`).bind(...sessionArgs(actor,Date.now())).first();
    if(!stillCurrent) throw new HttpError(401,'session_expired','Please sign in again.');
    return jsonResponse({notices:rows.results.map(row=>({id:row.id,groupId:row.box_id,groupName:row.group_name,kind:row.kind,title:row.title,message:row.message,createdAt:row.created_at,readAt:row.read_at}))});
  }
  if(mark && request.method==='POST') {
    let noticeId:string;try{noticeId=decodeURIComponent(mark[1]);}catch{throw unavailable();}
    const body=await readJsonObject(request);if(Object.keys(body).length) throw new HttpError(400,'invalid_notice','This action takes no notice content.');
    const at=Date.now();
    const updated=await db.prepare(`UPDATE group_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=? AND ${sessionSql} RETURNING id,read_at`)
      .bind(at,noticeId,actor.id,...sessionArgs(actor,at)).first<{id:string;read_at:number}>();
    if(!updated) throw unavailable();
    return jsonResponse({id:updated.id,readAt:updated.read_at});
  }
  return null;
}
