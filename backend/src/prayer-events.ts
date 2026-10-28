import type { BackendEnv } from './env.ts';
import type { Database } from './data.ts';
import type { Actor } from './policy.ts';
import { HttpError, jsonResponse, readJsonObject } from './http.ts';
import { createPrayerEvent, updatePrayerEvent, cancelPrayerEvent, sharePrayerEvent, dismissPrayerInvitation,
  canViewEvent, canManageEvent, invitationsForViewer, visibleConnectionRequests, visiblePrayerConnections, visibleManagedConnections, revokePrayerEventShare, requestPrayerConnection, respondToPrayerConnection, disconnectPrayerConnection } from '../../src/prayer-events.ts';
import type { EventHost, EventInput, EventContext, PrayerConnection, PrayerEvent, PrayerEventShare, PrayerEventState } from '../../src/prayer-events.ts';
import type { PrayerGroup, GroupIcon } from '../../src/prayer-groups.ts';

const ID=/^[A-Za-z0-9_:-]{1,160}$/;
const unavailable=()=>new HttpError(404,'event_unavailable','This prayer event or connection is not available.');
const conflict=()=>new HttpError(409,'event_changed','This item or your access changed. Refresh it before trying again.',true);
const sessionSql=`EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=?
  AND s.session_epoch=? AND s.csrf_hash=? AND s.session_epoch=u.session_epoch AND s.revoked_at IS NULL
  AND s.expires_at>? AND s.created_at<=? AND s.authenticated_at<=? AND u.status='active')`;
const sessionArgs=(actor:Actor,now:number)=>[actor.sessionId,actor.id,actor.sessionEpoch,actor.csrfHash,now,now,now];
async function requireSession(db:Database,actor:Actor) {
  if(!await db.prepare(`SELECT 1 WHERE ${sessionSql}`).bind(...sessionArgs(actor,Date.now())).first()) throw new HttpError(401,'session_expired','Please sign in again.');
}
function host(value:unknown):EventHost {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new HttpError(400,'invalid_host','Choose a person or a prayer group.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(key=>!['kind','id'].includes(key)) || !['person','group'].includes(String(v.kind)) || typeof v.id!=='string' || !ID.test(v.id)) throw new HttpError(400,'invalid_host','Choose a person or a prayer group.');
  return v as EventHost;
}
function strict(value:Record<string,unknown>,keys:string[]) {
  if(Object.keys(value).some(key=>!keys.includes(key))) throw new HttpError(400,'invalid_event','Please check these event details.');
}
function input(value:unknown):EventInput {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new HttpError(400,'invalid_event','Add the prayer event details.');
  const v=value as Record<string,unknown>;
  strict(v,['title','description','format','website','meetingUrl','address','startsAt','endsAt','timeZone','audience','shareable']);
  if(typeof v.title!=='string' || v.title.length>120 || typeof v.description!=='string' || v.description.length>4000
    || !['virtual','in_person'].includes(String(v.format)) || !['connections','members'].includes(String(v.audience))
    || typeof v.shareable!=='boolean' || typeof v.startsAt!=='string' || typeof v.endsAt!=='string' || typeof v.timeZone!=='string'
    || v.timeZone.length>100 || v.startsAt.length>40 || v.endsAt.length>40
    || ['website','meetingUrl','address'].some(key=>v[key]!==undefined && (typeof v[key]!=='string' || String(v[key]).length>(key==='address'?500:2048)))) throw new HttpError(400,'invalid_event','Check the event text, format, audience, and dates.');
  for(const key of ['website','meetingUrl']) if(v[key]) {
    try {const u=new URL(String(v[key]));if(u.protocol!=='https:' || u.username || u.password || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || /(?:^|\.)(localhost|local|internal|lan|home)\.?$/i.test(u.hostname)) throw Error();}
    catch {throw new HttpError(400,'invalid_link','Use a public HTTPS link without login details.');}
  }
  return v as EventInput;
}
const hostKey=(host:EventHost)=>`${host.kind}:${host.id}`;
const relationKey=(connection:PrayerConnection)=>[hostKey({kind:'person',id:connection.personId}),hostKey(connection.target)].sort().join('|');
type Scope={people:string[];groups:string[]};
function scope(actor:Actor,hosts:EventHost[]):Scope {return {people:[...new Set([actor.id,...hosts.filter(h=>h.kind==='person').map(h=>h.id)])],groups:[...new Set(hosts.filter(h=>h.kind==='group').map(h=>h.id))]};}

// A scoped policy snapshot catches concurrent membership, connection, block,
// account, group, or canonical-event changes at commit without trusting the UI.
const relevantConnections=`(person_id IN (SELECT value FROM json_each(?1,'$.people')) OR (target_kind='person' AND target_id IN (SELECT value FROM json_each(?1,'$.people'))) OR (target_kind='group' AND target_id IN (SELECT value FROM json_each(?1,'$.groups'))))`;
const snapshotSql=`(SELECT json_array(
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(c.id,c.record,c.version) fact FROM prayer_connections c WHERE ${relevantConnections} ORDER BY c.id)),
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(b.id,b.owner_id,b.status,b.visibility,g.version,g.archived_at) fact FROM boxes b LEFT JOIN group_settings g ON g.box_id=b.id WHERE b.id IN (SELECT value FROM json_each(?1,'$.groups')) ORDER BY b.id)),
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(m.box_id,m.user_id,m.status,m.role,m.is_admin,m.is_moderator,m.approved_at,m.revoked_at,m.joined_at,m.moderator_since) fact FROM memberships m WHERE m.box_id IN (SELECT value FROM json_each(?1,'$.groups')) ORDER BY m.box_id,m.user_id)),
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(x.box_id,x.user_id) fact FROM box_blocks x WHERE x.box_id IN (SELECT value FROM json_each(?1,'$.groups')) ORDER BY x.box_id,x.user_id)),
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(u.id,u.status,u.visibility) fact FROM users u WHERE u.id IN (SELECT value FROM json_each(?1,'$.people')) OR u.id IN (SELECT user_id FROM memberships WHERE box_id IN (SELECT value FROM json_each(?1,'$.groups'))) OR u.id IN (SELECT person_id FROM prayer_connections WHERE ${relevantConnections}) OR u.id IN (SELECT target_id FROM prayer_connections WHERE target_kind='person' AND ${relevantConnections}) ORDER BY u.id)),
 (SELECT COALESCE(group_concat(fact,'|'),'') FROM (SELECT json_array(x.blocker_id,x.blocked_id) fact FROM blocks x WHERE x.blocker_id IN (SELECT value FROM json_each(?1,'$.people')) OR x.blocked_id IN (SELECT value FROM json_each(?1,'$.people')) OR x.blocker_id IN (SELECT user_id FROM memberships WHERE box_id IN (SELECT value FROM json_each(?1,'$.groups'))) OR x.blocked_id IN (SELECT user_id FROM memberships WHERE box_id IN (SELECT value FROM json_each(?1,'$.groups'))) ORDER BY x.blocker_id,x.blocked_id)),
 (SELECT record FROM prayer_events WHERE id=?2),
 (SELECT COALESCE(group_concat(record,'|'),'') FROM (SELECT record FROM prayer_event_shares WHERE event_id=?2 ORDER BY id))))`;
async function fingerprint(db:Database,scope:Scope,eventId='') {
  return (await db.prepare(`SELECT ${snapshotSql} value`).bind(JSON.stringify(scope),eventId).first<{value:string}>())!.value;
}
async function context(db:Database,s:Scope):Promise<EventContext> {
  const scopeJson=JSON.stringify(s);
  const connections=await db.prepare(`SELECT record FROM prayer_connections WHERE ${relevantConnections} ORDER BY id LIMIT 2001`).bind(scopeJson).all<{record:string}>();
  if(connections.results.length>2000) throw new HttpError(409,'connection_capacity','This invitation list needs a review before another change.');
  const groupRows=await db.prepare(`SELECT b.*,g.icon,g.website,g.version,g.updated_at,g.archived_at FROM boxes b JOIN group_settings g ON g.box_id=b.id WHERE b.kind='organization' AND b.id IN (SELECT value FROM json_each(?,'$.groups')) LIMIT 41`).bind(scopeJson).all<{id:string;owner_id:string;slug:string;display_name:string;status:string;icon:GroupIcon;website:string;version:number;created_at:number;updated_at:number;archived_at:number|null}>();
  if(groupRows.results.length>40) throw unavailable();
  const members=await db.prepare(`SELECT m.*,u.username,u.display_name,u.status user_status,EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id=m.box_id AND x.user_id=m.user_id) blocked FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.box_id IN (SELECT value FROM json_each(?,'$.groups')) ORDER BY m.box_id,m.user_id LIMIT 2001`).bind(scopeJson).all<{box_id:string;user_id:string;status:string;role:string;is_admin:number;is_moderator:number;moderator_since:number|null;joined_at:number|null;approved_at:number|null;revoked_at:number|null;username:string;display_name:string;user_status:string;blocked:number}>();
  if(members.results.length>2000) throw unavailable();
  const parsedConnections=connections.results.map(row=>JSON.parse(row.record) as PrayerConnection);
  const ids=[...new Set([...s.people,...members.results.map(m=>m.user_id),...parsedConnections.flatMap(c=>[c.personId,...(c.target.kind==='person'?[c.target.id]:[])])])];
  const people=await db.prepare('SELECT id,username,display_name,status FROM users WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;username:string;display_name:string;status:string}>();
  const blocked=await db.prepare('SELECT blocker_id,blocked_id FROM blocks WHERE blocker_id IN (SELECT value FROM json_each(?)) OR blocked_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids),JSON.stringify(ids)).all<{blocker_id:string;blocked_id:string}>();
  const now=Date.now();
  const groups:PrayerGroup[]=groupRows.results.map(g=>({id:g.id,ownerId:g.owner_id,name:g.display_name,username:g.slug,website:g.website,icon:g.icon,version:g.version,createdAt:g.created_at,updatedAt:g.updated_at,archivedAt:g.status==='active'?g.archived_at:now,
    members:members.results.filter(m=>m.box_id===g.id).map(m=>({id:m.user_id,name:m.display_name,username:m.username,active:m.user_status==='active' && (m.status!=='approved'||m.approved_at!==null&&m.approved_at<=now&&m.revoked_at===null),status:m.blocked?'blocked':m.status==='revoked'?'left':m.status as 'approved'|'pending'|'invited'|'declined',role:m.is_admin||m.role==='owner'?'admin':m.is_moderator?'moderator':'member',moderatorSince:m.moderator_since,joinedAt:m.joined_at??m.approved_at,updatedAt:m.approved_at??g.updated_at}))}));
  return {people:people.results.map(p=>({id:p.id,username:p.username,name:p.display_name,active:p.status==='active'})),groups,connections:parsedConnections,blocks:blocked.results.map(b=>({blockerId:b.blocker_id,blockedId:b.blocked_id}))};
}
function stepUp(actor:Actor,group:boolean) {
  const now=Date.now();if(group&&(actor.assurance!=='mfa'||actor.authenticatedAt>now||now-actor.authenticatedAt>300_000)) throw new HttpError(403,'step_up_required','Verify your sign-in again before acting for a prayer group.',true);
}
function mfaSql(group:boolean) {return group?` AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND assurance='mfa' AND authenticated_at>=?)`:'';}
function mfaArgs(actor:Actor,group:boolean,now:number) {return group?[actor.sessionId,now-300_000]:[];}
async function rate(db:Database,actor:Actor,action:string,limit:number) {const now=Date.now();const count=await db.prepare('INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key,window_start) DO UPDATE SET count=MIN(count+1,1000000) RETURNING count').bind(`prayer-event:${action}:${actor.id}`,Math.floor(now/3_600_000)*3_600_000).first<number>('count');if(count===null||count>limit) throw new HttpError(429,'event_rate_limit','Please wait before sending more requests or invitations.',true);}
function fromModel<T>(fn:()=>T):T {try{return fn();}catch(error){throw new HttpError(409,'event_not_allowed',error instanceof Error?error.message:'This change is not available.');}}
async function loadEvent(db:Database,id:string,actor:Actor) {
  const row=await db.prepare('SELECT record FROM prayer_events WHERE id=?').bind(id).first<{record:string}>();if(!row) throw unavailable();
  const event=JSON.parse(row.record) as PrayerEvent;
  const shares=await db.prepare('SELECT record FROM prayer_event_shares WHERE event_id=? ORDER BY created_at,id LIMIT 41').bind(id).all<{record:string}>();if(shares.results.length>40) throw unavailable();
  const dismissals=await db.prepare('SELECT event_id,viewer_id,dismissed_at FROM prayer_event_dismissals WHERE event_id=? AND viewer_id=?').bind(id,actor.id).all<{event_id:string;viewer_id:string;dismissed_at:number}>();
  const parsed=shares.results.map(row=>JSON.parse(row.record) as PrayerEventShare);
  return {event,state:{events:[event],shares:parsed,dismissals:dismissals.results.map(row=>({eventId:row.event_id,viewerId:row.viewer_id,dismissedAt:row.dismissed_at}))} satisfies PrayerEventState,scope:scope(actor,[event.host,...parsed.map(share=>share.host)])};
}
function audit(db:Database,actor:Actor,action:string,id:string,at:number,guard:string,args:(string|number)[]) {return db.prepare(`INSERT INTO prayer_event_actions(id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),actor.id,action,id,at,...args);}

async function connectionRows(db:Database,actor:Actor) {
  return db.prepare(`SELECT c.record,c.version FROM prayer_connections c WHERE c.person_id=? OR (c.target_kind='person' AND c.target_id=?)
    OR (c.target_kind='group' AND EXISTS(SELECT 1 FROM memberships m WHERE m.box_id=c.target_id AND m.user_id=? AND m.status='approved' AND m.revoked_at IS NULL AND (m.is_admin=1 OR m.role='owner')))
    ORDER BY c.updated_at DESC,c.id LIMIT 201`).bind(actor.id,actor.id,actor.id).all<{record:string;version:number}>();
}
async function mutateConnection(request:Request,db:Database,actor:Actor,id?:string) {
  const body=await readJsonObject(request,{maxBytes:4096});
  let existing:{record:string;version:number}|null=null;
  let target:EventHost;let from:EventHost|undefined;let action:string;
  if(id) {
    strict(body,['action','expectedVersion']);
    if(!Number.isSafeInteger(body.expectedVersion)||!['accept','decline','withdraw','end'].includes(String(body.action))) throw new HttpError(400,'invalid_connection','Choose an available connection action and current version.');
    existing=await db.prepare('SELECT record,version FROM prayer_connections WHERE id=?').bind(id).first<{record:string;version:number}>();if(!existing) throw unavailable();
    const value=JSON.parse(existing.record) as PrayerConnection;target=value.target;from={kind:'person',id:value.personId};action=String(body.action);
  } else {strict(body,['target','from']);target=host(body.target);from=body.from===undefined?{kind:'person',id:actor.id}:host(body.from);action='request';}
  const scopeValue=scope(actor,[target,from]);
  const before=await fingerprint(db,scopeValue);
  const ctx=await context(db,scopeValue);
  const old=id?ctx.connections.find(c=>c.id===id):undefined;
  const groupActing=id?Boolean(old && old.personId!==actor.id && !(old.target.kind==='person'&&old.target.id===actor.id) && old.target.kind==='group'):from.kind==='group';
  stepUp(actor,groupActing);
  if(existing&&body.expectedVersion!==existing.version) throw conflict();
  const now=Date.now();
  const next=fromModel(()=>id?action==='end'?disconnectPrayerConnection(ctx.connections,id,actor.id,ctx,now):respondToPrayerConnection(ctx.connections,id,actor.id,action as 'accept'|'decline'|'withdraw',ctx,now):requestPrayerConnection(ctx.connections,actor.id,target,ctx,{from},now));
  const changed=next.find(c=>JSON.stringify(c)!==JSON.stringify(ctx.connections.find(old=>old.id===c.id)));
  if(!changed) {await requireSession(db,actor);return jsonResponse({unchanged:true});}
  await rate(db,actor,action==='request'?'connection-request':'connection-action',action==='request'?12:60);
  const stored=await db.prepare('SELECT version FROM prayer_connections WHERE id=?').bind(changed.id).first<{version:number}>();
  const version=(stored?.version??0)+1;const token=crypto.randomUUID();const at=Date.now();
  const result=await db.batch([
    db.prepare(`INSERT INTO prayer_connections(id,relation_key,person_id,target_kind,target_id,status,requested_by,disconnected_by,source,version,created_at,updated_at,mutation_token,record)
      SELECT ?3,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${snapshotSql}=? AND ${sessionSql}${mfaSql(groupActing)}
      ON CONFLICT(id) DO UPDATE SET person_id=excluded.person_id,target_kind=excluded.target_kind,target_id=excluded.target_id,status=excluded.status,requested_by=excluded.requested_by,disconnected_by=excluded.disconnected_by,
      source=excluded.source,version=excluded.version,created_at=excluded.created_at,updated_at=excluded.updated_at,mutation_token=excluded.mutation_token,record=excluded.record
      WHERE prayer_connections.version=? AND prayer_connections.relation_key=excluded.relation_key`)
      .bind(JSON.stringify(scopeValue),'',changed.id,relationKey(changed),changed.personId,changed.target.kind,changed.target.id,changed.status,changed.requestedBy,changed.disconnectedBy??null,changed.source,version,changed.createdAt,changed.updatedAt,token,JSON.stringify(changed),before,...sessionArgs(actor,at),...mfaArgs(actor,groupActing,at),stored?.version??0),
    audit(db,actor,`connection_${action}`,changed.id,at,'EXISTS(SELECT 1 FROM prayer_connections WHERE id=? AND mutation_token=?)',[changed.id,token]),
  ]);
  if(result[0].meta.changes!==1) throw conflict();
  return jsonResponse({connection:changed,version},action==='request'?202:200);
}

const safeEvent=(event:PrayerEvent)=>event.cancelledAt==null?event:((({meetingUrl:_meeting,address:_address,...remaining})=>remaining)(event));
async function readable(db:Database,actor:Actor,id:string) {
  const loaded=await loadEvent(db,id,actor);const before=await fingerprint(db,loaded.scope,id);
  if(JSON.stringify((await loadEvent(db,id,actor)).state)!==JSON.stringify(loaded.state)) throw conflict();
  const ctx=await context(db,loaded.scope);
  if(!canViewEvent(loaded.state,id,actor.id,ctx)) throw unavailable();
  if(before!==await fingerprint(db,loaded.scope,id)) throw conflict();
  await requireSession(db,actor);
  return {event:safeEvent(loaded.event),invitation:invitationsForViewer(loaded.state,actor.id,ctx)[0] ? {viaHost:invitationsForViewer(loaded.state,actor.id,ctx)[0].viaHost,shareId:invitationsForViewer(loaded.state,actor.id,ctx)[0].shareId}:undefined,canManage:canManageEvent(loaded.event,actor.id,ctx)};
}
async function eventList(db:Database,actor:Actor,invitationsOnly:boolean) {
  const candidates=await db.prepare(`WITH reachable(kind,id) AS (
    SELECT 'person',?1 UNION SELECT 'group',m.box_id FROM memberships m WHERE m.user_id=?1 AND m.status='approved' AND m.approved_at<=?2 AND m.revoked_at IS NULL
    UNION SELECT c.target_kind,c.target_id FROM prayer_connections c WHERE c.person_id=?1 AND c.status='active'
    UNION SELECT 'person',c.person_id FROM prayer_connections c WHERE c.target_kind='person' AND c.target_id=?1 AND c.status='active')
    SELECT DISTINCT e.id,e.starts_at FROM prayer_events e LEFT JOIN prayer_event_shares s ON s.event_id=e.id AND s.revoked_at IS NULL
    WHERE EXISTS(SELECT 1 FROM reachable h WHERE (h.kind=e.host_kind AND h.id=e.host_id) OR (h.kind=s.host_kind AND h.id=s.host_id))
    ORDER BY e.starts_at,e.id LIMIT 61`).bind(actor.id,Date.now()).all<{id:string}>();
  const events=[];
  for(const row of candidates.results.slice(0,60)) {
    try {const item=await readable(db,actor,row.id);if(!invitationsOnly||item.invitation) events.push(item);}
    catch(error) {if(error instanceof HttpError&&(error.status===404||error.status===409)) continue;throw error;}
  }
  await requireSession(db,actor);return jsonResponse({events,hasMore:candidates.results.length>60});
}
async function createEvent(request:Request,db:Database,actor:Actor) {
  const raw=await readJsonObject(request,{maxBytes:16384});strict(raw,['host','event']);const hostValue=host(raw.host);const values=input(raw.event);stepUp(actor,hostValue.kind==='group');
  const s=scope(actor,[hostValue]);const before=await fingerprint(db,s);const ctx=await context(db,s);const now=Date.now();
  const event=fromModel(()=>createPrayerEvent({events:[],shares:[],dismissals:[]},actor.id,hostValue,values,ctx,now)).events[0];
  await rate(db,actor,'create',10);const token=crypto.randomUUID();const at=Date.now();
  const results=await db.batch([
    db.prepare(`INSERT INTO prayer_events(id,host_kind,host_id,created_by,version,starts_at,created_at,updated_at,record,mutation_token)
      SELECT ?3,?,?,?,?,?,?,?,?,? WHERE ${snapshotSql}=? AND ${sessionSql}${mfaSql(hostValue.kind==='group')}`)
      .bind(JSON.stringify(s),'',event.id,event.host.kind,event.host.id,actor.id,event.version,event.startsAt,now,now,JSON.stringify(event),token,before,...sessionArgs(actor,at),...mfaArgs(actor,hostValue.kind==='group',at)),
    audit(db,actor,'event_create',event.id,at,'EXISTS(SELECT 1 FROM prayer_events WHERE id=? AND mutation_token=?)',[event.id,token]),
  ]);
  if(results[0].meta.changes!==1) throw conflict();return jsonResponse({event},201);
}
async function mutateEvent(request:Request,db:Database,actor:Actor,id:string,action:string,shareId?:string) {
  const raw=await readJsonObject(request,{maxBytes:16384});strict(raw,action==='edit'?['expectedVersion','event']:action==='repost'?['host']:action==='dismiss'||action==='revoke'?[]:['expectedVersion']);
  const loaded=await loadEvent(db,id,actor);const shareHost=action==='repost'?host(raw.host):undefined;
  if(shareHost) loaded.scope=scope(actor,[loaded.event.host,...loaded.state.shares.map(s=>s.host),shareHost]);
  const before=await fingerprint(db,loaded.scope,id);
  if(JSON.stringify((await loadEvent(db,id,actor)).state)!==JSON.stringify(loaded.state)) throw conflict();
  const ctx=await context(db,loaded.scope);const revoking=shareId?loaded.state.shares.find(share=>share.id===shareId):undefined;
  const groupAction=(revoking?.host??shareHost??loaded.event.host).kind==='group'&&action!=='dismiss';stepUp(actor,groupAction);
  if(['edit','cancel'].includes(action)&&(!Number.isSafeInteger(raw.expectedVersion)||(action!=='cancel'||loaded.event.cancelledAt==null)&&raw.expectedVersion!==loaded.event.version)) throw conflict();
  const now=Date.now();
  if(action==='dismiss') {
    const next=fromModel(()=>dismissPrayerInvitation(loaded.state,id,actor.id,ctx,now));
    const dismissal=next.dismissals.find(d=>d.eventId===id&&d.viewerId===actor.id)!;
    const result=await db.prepare(`INSERT INTO prayer_event_dismissals(event_id,viewer_id,dismissed_at)
      SELECT ?3,?,? WHERE ${snapshotSql}=? AND ${sessionSql} ON CONFLICT(event_id,viewer_id) DO NOTHING`)
      .bind(JSON.stringify(loaded.scope),id,id,actor.id,dismissal.dismissedAt,before,...sessionArgs(actor,Date.now())).run();
    if(result.meta.changes!==1&&before!==await fingerprint(db,loaded.scope,id)) throw conflict();await requireSession(db,actor);return jsonResponse({dismissed:true});
  }
  await rate(db,actor,action,30);
  if(action==='revoke') {
    const next=fromModel(()=>revokePrayerEventShare(loaded.state,shareId!,actor.id,ctx,now));
    const share=next.shares.find(share=>share.id===shareId)!;
    if(share.revokedAt===revoking?.revokedAt) {await requireSession(db,actor);return jsonResponse({unchanged:true});}
    const token=crypto.randomUUID();const at=Date.now();
    const result=await db.batch([
      db.prepare(`UPDATE prayer_event_shares SET revoked_at=?3,record=?,mutation_token=? WHERE id=? AND event_id=? AND revoked_at IS NULL AND ${snapshotSql}=? AND ${sessionSql}${mfaSql(groupAction)}`)
        .bind(JSON.stringify(loaded.scope),id,share.revokedAt!,JSON.stringify(share),token,share.id,id,before,...sessionArgs(actor,at),...mfaArgs(actor,groupAction,at)),
      audit(db,actor,'event_revoke',id,at,'EXISTS(SELECT 1 FROM prayer_event_shares WHERE id=? AND mutation_token=?)',[share.id,token]),
    ]);
    if(result[0].meta.changes!==1) throw conflict();return jsonResponse({share});
  }
  if(action==='repost') {
    if(loaded.state.shares.length>=40) throw new HttpError(409,'event_capacity','This event has reached its invitation sharing limit.');
    const next=fromModel(()=>sharePrayerEvent(loaded.state,id,actor.id,shareHost!,ctx,now));
    const share=next.shares.find(s=>!loaded.state.shares.some(old=>old.id===s.id));
    if(!share) {await requireSession(db,actor);return jsonResponse({unchanged:true});}
    const token=crypto.randomUUID();const at=Date.now();
    let result:D1Result[];
    try { result=await db.batch([
      db.prepare(`INSERT INTO prayer_event_shares(id,event_id,host_kind,host_id,via_share_id,shared_by,created_at,record,mutation_token)
        SELECT ?3,?,?,?,?,?,?,?,? WHERE ${snapshotSql}=? AND ${sessionSql}${mfaSql(groupAction)} AND EXISTS(SELECT 1 FROM prayer_events WHERE id=? AND version=? AND cancelled_at IS NULL)`)
        .bind(JSON.stringify(loaded.scope),id,share.id,id,share.host.kind,share.host.id,share.viaShareId??null,share.sharedBy,share.createdAt,JSON.stringify(share),token,before,...sessionArgs(actor,at),...mfaArgs(actor,groupAction,at),id,loaded.event.version),
      audit(db,actor,'event_repost',id,at,'EXISTS(SELECT 1 FROM prayer_event_shares WHERE id=? AND mutation_token=?)',[share.id,token]),
    ]); } catch(error) {
      // A concurrent identical repost may win the unique active-host slot. Recheck
      // current access and policy before acknowledging its existing canonical copy.
      const current=await loadEvent(db,id,actor);const currentContext=await context(db,current.scope);
      const replay=fromModel(()=>sharePrayerEvent(current.state,id,actor.id,shareHost!,currentContext,Date.now()));
      if(replay===current.state && current.state.shares.some(item=>item.host.kind===shareHost!.kind&&item.host.id===shareHost!.id&&item.revokedAt==null)) {
        await requireSession(db,actor);return jsonResponse({unchanged:true});
      }
      throw error;
    }
    if(result[0].meta.changes!==1) throw conflict();return jsonResponse({share},201);
  }
  const next=fromModel(()=>action==='edit'?updatePrayerEvent(loaded.state,id,actor.id,input(raw.event),Number(raw.expectedVersion),ctx,now):cancelPrayerEvent(loaded.state,id,actor.id,Number(raw.expectedVersion),ctx,now));
  const event=next.events[0];if(event===loaded.event) {await requireSession(db,actor);return jsonResponse({event:safeEvent(event),unchanged:true});}
  const token=crypto.randomUUID();const at=Date.now();
  const result=await db.batch([
    db.prepare(`UPDATE prayer_events SET version=?3,starts_at=?,cancelled_at=?,updated_at=?,record=?,mutation_token=?
      WHERE id=? AND version=? AND ${snapshotSql}=? AND ${sessionSql}${mfaSql(groupAction)}`)
      .bind(JSON.stringify(loaded.scope),id,event.version,event.startsAt,event.cancelledAt??null,event.updatedAt,JSON.stringify(event),token,id,loaded.event.version,before,...sessionArgs(actor,at),...mfaArgs(actor,groupAction,at)),
    audit(db,actor,`event_${action}`,id,at,'EXISTS(SELECT 1 FROM prayer_events WHERE id=? AND mutation_token=?)',[id,token]),
  ]);
  if(result[0].meta.changes!==1) throw conflict();return jsonResponse({event:safeEvent(event)});
}

/** The root router applies exact Origin and CSRF validation before every POST. */
export async function handlePrayerEventRoute(request:Request,_env:BackendEnv,actor:Actor|null,db:Database):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(!/^\/api\/(connections|prayer-events|prayer-invitations)(?:\/|$)/.test(path)) return null;
  if(!actor) throw new HttpError(401,'sign_in_required','Please sign in to see your prayer events and connections.');
  await requireSession(db,actor);
  if(path==='/api/connections'&&request.method==='GET') {
    const rows=await connectionRows(db,actor);const all=rows.results.slice(0,200).map(row=>({...JSON.parse(row.record) as PrayerConnection,version:row.version}));
    const s=scope(actor,all.flatMap(c=>[{kind:'person',id:c.personId} as EventHost,c.target]));
    const before=await fingerprint(db,s);const ctx=await context(db,s);
    const current=await connectionRows(db,actor);if(JSON.stringify(current.results)!==JSON.stringify(rows.results)) throw conflict();
    const visible=new Set([...visiblePrayerConnections(all,actor.id,ctx).map(c=>c.id),...visibleManagedConnections(all,actor.id,ctx).map(c=>c.connection.id),...visibleConnectionRequests(all,actor.id,ctx).map(c=>c.connection.id)]);
    // Ended entries let their own endpoint deliberately request a new connection.
    const groups=new Set(ctx.groups.filter(g=>g.members.some(m=>m.id===actor.id&&m.active&&m.status==='approved'&&m.role==='admin')).map(g=>g.id));
    const own=all.filter(c=>visible.has(c.id)||(['disconnected','declined'].includes(c.status)&&(c.personId===actor.id||c.target.kind==='person'&&c.target.id===actor.id||c.target.kind==='group'&&groups.has(c.target.id))));
    if(before!==await fingerprint(db,s)) throw conflict();await requireSession(db,actor);return jsonResponse({connections:own,requests:visibleConnectionRequests(all,actor.id,ctx),hasMore:rows.results.length>200});
  }
  if(path==='/api/connections/request'&&request.method==='POST') return mutateConnection(request,db,actor);
  const connection=path.match(/^\/api\/connections\/([^/]{1,1000})\/actions$/);
  if(connection&&request.method==='POST') {let id:string;try{id=decodeURIComponent(connection[1]);}catch{throw unavailable();}return mutateConnection(request,db,actor,id);}
  if((path==='/api/prayer-events'||path==='/api/prayer-invitations')&&request.method==='GET') return eventList(db,actor,path==='/api/prayer-invitations');
  if(path==='/api/prayer-events'&&request.method==='POST') return createEvent(request,db,actor);
  const revocation=path.match(/^\/api\/prayer-events\/([A-Za-z0-9_:-]{1,160})\/shares\/([A-Za-z0-9_:-]{1,160})\/revoke$/);
  if(revocation&&request.method==='POST') return mutateEvent(request,db,actor,revocation[1],'revoke',revocation[2]);
  const event=path.match(/^\/api\/prayer-events\/([A-Za-z0-9_:-]{1,160})(?:\/(edit|cancel|repost|dismiss))?$/);
  if(event&&request.method==='GET'&&!event[2]) return jsonResponse(await readable(db,actor,event[1]));
  if(event&&request.method==='POST'&&event[2]) return mutateEvent(request,db,actor,event[1],event[2]);
  return null;
}
