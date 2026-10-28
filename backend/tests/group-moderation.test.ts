import { env } from 'cloudflare:workers';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { consumeJobBatch } from '../src/jobs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/index';
import { hashSecret, loadActor, primary, type Database } from '../src/data';
import { handleGroupModerationRoute } from '../src/group-moderation';
import { handleRead } from '../src/reads';
import { errorResponse } from '../src/http';
import { NOW, ORIGIN, resetDatabase, seedDelivery, seedUsers, session, type USERS } from './fixtures';

type User=typeof USERS[number];
type Auth=Awaited<ReturnType<typeof session>>;
async function signedIn(user:User='member',mfa=true) {
  const auth=await session(user);
  if(mfa) await env.DB.prepare("UPDATE sessions SET assurance='mfa',authenticated_at=? WHERE token_hash=?").bind(Date.now()-100,await hashSecret(auth.token)).run();
  return auth;
}
async function request(path:string,auth:Auth|null,body?:unknown,headers:Record<string,string>={}) {
  return handleRequest(new Request(`${ORIGIN}${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:ORIGIN,...auth?.headers,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
}
const payload=(changes:Record<string,unknown>={})=>({deliveryId:'delivery-a',postId:'update-delivery-a',expectedRevision:1,reason:'harassment',...changes});
async function remove(auth:Auth|null,changes:Record<string,unknown>={},headers:Record<string,string>={}) {return request('/api/groups/church-box/removals',auth,payload(changes),headers);}
async function race(auth:Auth,input:unknown,change:()=>Promise<unknown>) {
  const database=primary(env.DB);const actor=await loadActor(database,auth.token);
  const racing:Database={prepare:database.prepare.bind(database),batch:async statements=>{await change();return database.batch(statements);}};
  try{return await handleGroupModerationRoute(new Request(`${ORIGIN}/api/groups/church-box/removals`,{method:'POST',headers:{...auth.headers,'Content-Type':'application/json'},body:JSON.stringify(input)}),env,actor,racing);}
  catch(error){return errorResponse(error);}
}
async function notices(auth:Auth) {
  const response=await request('/api/group-notices',auth);expect(response.status).toBe(200);
  return response.json() as Promise<{notices:Array<{id:string;title:string;message:string;readAt:number|null}>}>;
}
async function addReply(id:string,postId='post-delivery-a',parent:string|null=null) {
  await env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,parent_id,actor_id,identity_mode,body,status,created_at) VALUES(?,'delivery-a',?,?,'recipient','personal',?,'approved',?)")
    .bind(id,postId,parent,`Synthetic ${id} encouragement`,NOW-1000).run();
}
async function media(postId='update-delivery-a') {
  await env.MEDIA.put('normalized/group-test',new Uint8Array([1,2,3]));
  await env.DB.prepare(`INSERT INTO media(id,owner_id,delivery_id,post_id,revision,storage_key,normalized_key,content_type,byte_size,sha256,state,created_at,updated_at)
    VALUES('group-media','author','delivery-a',?,1,'quarantine/group-test','normalized/group-test','image/png',3,'fixture','approved',?,?)`).bind(postId,NOW,NOW).run();
}
beforeEach(async()=>{
  await resetDatabase();await seedUsers();
  await env.DB.prepare("INSERT INTO group_settings(box_id,updated_at) VALUES('church-box',?)").bind(NOW).run();
  await env.DB.prepare("UPDATE memberships SET is_moderator=1,moderator_since=?,joined_at=approved_at WHERE box_id='church-box' AND user_id='member'").bind(NOW-8000).run();
  await seedDelivery({organization:true,history:'retained'});
});

describe('group moderation and private durable notices',()=>{
  it('requires active group staff, recent MFA, exact Origin and CSRF',async()=>{
    expect((await remove(null)).status).toBe(401);
    for(const user of ['author','newmember','outsider'] as const) expect((await remove(await signedIn(user))).status).toBe(403);
    expect((await remove(await signedIn('member',false))).status).toBe(403);
    const auth=await signedIn();
    expect((await remove(auth,{}, {'X-CSRF-Token':'wrong'})).status).toBe(403);
    expect((await remove(auth,{}, {Origin:'https://hostile.example'})).status).toBe(403);
    await env.DB.prepare('UPDATE sessions SET authenticated_at=? WHERE token_hash=?').bind(Date.now()-600001,await hashSecret(auth.token)).run();
    expect((await remove(auth)).status).toBe(403);
    expect(await env.DB.prepare('SELECT id FROM group_content_removals').first()).toBeNull();
  });
  it('allows moderators to remove one update without altering the original or another delivery',async()=>{
    const auth=await signedIn();await seedDelivery({id:'personal-copy'});await media();
    const response=await remove(auth);expect(response.status).toBe(200);
    const text=await response.text();expect(text).not.toContain('author');expect(text).not.toContain('Synthetic');
    const view=await request('/api/deliveries/delivery-a',auth);expect(view.status).toBe(200);
    const data=await view.json() as {posts:Array<{id:string}>};expect(data.posts.map(post=>post.id)).toEqual(['post-delivery-a']);
    expect((await request('/api/deliveries/personal-copy',await signedIn('author'))).status).toBe(200);
    expect((await request('/media/group-media',auth)).status).toBe(404);
    const message=(await notices(await signedIn('author'))).notices[0];expect(message.message).toContain('moderator');expect(message.message).toContain('harassment');
    expect((await notices(auth)).notices).toEqual([]);
  });
  it('lets admins remove a prayer reply and keeps its sibling and story posts',async()=>{
    await addReply('reply-a');await addReply('reply-b');await addReply('child-a','post-delivery-a','reply-a');
    const response=await remove(await signedIn('owner'),{postId:'post-delivery-a',replyId:'reply-a'});expect(response.status).toBe(200);
    const view=await request('/api/deliveries/delivery-a/posts/post-delivery-a/replies',await signedIn());
    expect(view.status).toBe(200);const data=await view.json() as {replies:Array<{id:string}>};expect(data.replies.map(reply=>reply.id)).toEqual(['reply-b']);
    expect(await env.DB.prepare("SELECT status FROM posts WHERE id='post-delivery-a'").first()).toEqual({status:'approved'});
    const message=(await notices(await signedIn('recipient'))).notices[0];expect(message.message).toContain('admin');expect(message.message).not.toContain('recipient');
    expect((await notices(await signedIn('author'))).notices).toEqual([]);
    expect(await env.DB.prepare("SELECT status FROM replies WHERE id='child-a'").first()).toEqual({status:'approved'});
  });
  it('removes an original only from its group copy, cancels pending edits and revokes media',async()=>{
    const auth=await signedIn();const author=await signedIn('author');await media('post-delivery-a');await seedDelivery({id:'personal-copy'});
    await env.DB.prepare("UPDATE deliveries SET source_id='source-delivery-a' WHERE id='personal-copy'").run();
    expect((await request('/api/deliveries/delivery-a/posts/post-delivery-a/edits',author,{title:'Corrected',body:'Synthetic revised prayer',expectedRevision:1})).status).toBe(202);
    expect((await remove(auth,{postId:'post-delivery-a'})).status).toBe(200);
    expect((await request('/api/deliveries/delivery-a',author)).status).toBe(404);
    expect((await request('/media/group-media',auth)).status).toBe(404);
    expect((await request('/api/deliveries/delivery-a/posts/post-delivery-a/edits',author)).status).toBe(404);
    expect((await request('/api/deliveries/delivery-a/posts/post-delivery-a/edits',author,{title:'Try again',body:'Synthetic',expectedRevision:1})).status).toBe(404);
    expect(await env.DB.prepare('SELECT state FROM post_edits').first()).toEqual({state:'cancelled'});
    expect((await request('/api/deliveries/personal-copy',author)).status).toBe(200);
    expect(await env.DB.prepare("SELECT deleted_at FROM authored_sources WHERE id='source-delivery-a'").first()).toEqual({deleted_at:null});
  });
  it('cannot resurrect group media through a queued job after unanimous deletion',async()=>{
    await media();
    await env.DB.prepare("UPDATE media SET state='quarantined' WHERE id='group-media'").run();
    await env.DB.prepare("INSERT INTO jobs(id,kind,resource_id,recipient_id,state,next_attempt_at,next_dispatch_at,created_at,updated_at) VALUES('group-scan','media_screen','group-media','author','pending',?,?,?,?)").bind(NOW,NOW,NOW,NOW).run();
    const owner=await signedIn('owner');
    expect((await request('/api/groups/church-box/actions',owner,{expectedVersion:1,command:{type:'request_deletion'}})).status).toBe(200);
    const batch=createMessageBatch('prayer-box-jobs-local',[{id:'transport-group-scan',timestamp:new Date(NOW),attempts:1,body:{jobId:'group-scan'}}]);
    const context=createExecutionContext();await consumeJobBatch(batch,env.DB,{now:()=>Date.now()});getQueueResult(batch,context);
    expect(await env.DB.prepare("SELECT state FROM media WHERE id='group-media'").first()).toEqual({state:'deleted'});
    expect(await env.DB.prepare("SELECT state FROM jobs WHERE id='group-scan'").first()).toEqual({state:'cancelled'});
    expect((await request('/media/group-media',await signedIn('author'))).status).toBe(404);
    expect(await env.DB.prepare("SELECT id FROM review_cases WHERE subject_id='group-media'").first()).toBeNull();
  });
  it('requires the owner edit/delete controls for staff’s own words',async()=>{
    const auth=await signedIn();
    await env.DB.prepare("UPDATE authored_sources SET author_id='member' WHERE id='source-delivery-a'").run();
    expect((await remove(auth)).status).toBe(403);
    expect((await remove(auth,{postId:'post-delivery-a'})).status).toBe(403);
    await addReply('own-reply');await env.DB.prepare("UPDATE replies SET actor_id='member' WHERE id='own-reply'").run();
    expect((await remove(auth,{postId:'post-delivery-a',replyId:'own-reply'})).status).toBe(403);
    expect(await env.DB.prepare('SELECT id FROM group_content_removals').first()).toBeNull();
  });
  it('makes retries idempotent with one notice, immutable reason and current staff authorization',async()=>{
    const auth=await signedIn();const first=await remove(auth);expect(first.status).toBe(200);const initial=await first.json() as {removalId:string;createdAt:number};
    const replay=await remove(auth);expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({...initial,duplicate:true});
    expect((await notices(await signedIn('author'))).notices).toHaveLength(1);
    expect((await remove(auth,{reason:'privacy'})).status).toBe(409);
    await env.DB.prepare("UPDATE memberships SET is_moderator=0 WHERE box_id='church-box' AND user_id='member'").run();
    expect((await remove(auth)).status).toBe(403);
  });
  it('rejects stale revisions, unknown reasons and forged anonymous recipient IDs',async()=>{
    const auth=await signedIn();expect((await remove(auth,{expectedRevision:2})).status).toBe(409);
    expect((await remove(auth,{reason:'dont-like-them'})).status).toBe(400);
    expect((await remove(auth,{recipientId:'outsider'})).status).toBe(400);
    expect(await env.DB.prepare('SELECT id FROM group_content_removals').first()).toBeNull();
  });
  it('rejects cross-group, cross-delivery, and cross-post targets',async()=>{
    const auth=await signedIn();await seedDelivery({id:'personal-copy'});await addReply('reply-a');
    expect((await remove(auth,{deliveryId:'personal-copy',postId:'post-personal-copy'})).status).toBe(404);
    expect((await remove(auth,{postId:'post-personal-copy'})).status).toBe(404);
    expect((await remove(auth,{replyId:'reply-a'})).status).toBe(404);
    expect((await request('/api/groups/personal-box/removals',auth,payload())).status).toBe(403);
  });
  it('rechecks a moderator demotion at the atomic commit',async()=>{
    const response=await race(await signedIn(),payload(),()=>env.DB.prepare("UPDATE memberships SET is_moderator=0 WHERE box_id='church-box' AND user_id='member'").run());
    expect(response?.status).toBe(403);expect(await env.DB.prepare('SELECT id FROM group_content_removals').first()).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM posts WHERE id='update-delivery-a'").first()).toEqual({status:'approved'});
  });
  it('rechecks revoked membership at the atomic commit',async()=>{
    const response=await race(await signedIn(),payload(),()=>env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE box_id='church-box' AND user_id='member'").bind(Date.now()).run());
    expect(response?.status).toBe(403);expect(await env.DB.prepare('SELECT id FROM group_notices').first()).toBeNull();
  });
  it('rejects a target revision race without a notice or removal',async()=>{
    const response=await race(await signedIn(),payload(),()=>env.DB.prepare("UPDATE posts SET revision=2 WHERE id='update-delivery-a'").run());
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT id FROM group_content_removals').first()).toBeNull();
  });
  it('rejects a concurrent anonymous author block without exposing their identity',async()=>{
    const response=await race(await signedIn(),payload(),()=>env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('author','member',?)").bind(Date.now()).run());
    expect(response?.status).toBe(409);expect(await response?.text()).not.toContain('author');
    expect(await env.DB.prepare('SELECT id FROM group_notices').first()).toBeNull();
  });
  it('rejects a session revocation before commit',async()=>{
    const auth=await signedIn();const response=await race(auth,payload(),async()=>env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(Date.now(),await hashSecret(auth.token)).run());
    expect(response?.status).toBe(403);expect(await env.DB.prepare('SELECT id FROM group_notices').first()).toBeNull();
  });
  it.each(['reply','post'])('suppresses stale reply bytes after a concurrent %s removal',async kind=>{
    await addReply('reply-race');const auth=await signedIn();const database=primary(env.DB);const actor=await loadActor(database,auth.token);
    const originalPrepare=database.prepare.bind(database);let raced=false;
    vi.spyOn(database,'prepare').mockImplementation(query=>{
      const statement=originalPrepare(query);
      if(query.includes('FROM replies r')) {
        const originalBind=statement.bind.bind(statement);
        vi.spyOn(statement,'bind').mockImplementation((...values)=>{
          const bound=originalBind(...values);const originalAll=bound.all.bind(bound);
          vi.spyOn(bound,'all').mockImplementationOnce(async <T>()=>{
            const result=await originalAll<T>();
            if(!raced) {raced=true;await env.DB.prepare(kind==='reply' ? "UPDATE replies SET status='deleted',deleted_at=? WHERE id='reply-race'" : "UPDATE posts SET status='deleted',deleted_at=? WHERE id='post-delivery-a'").bind(Date.now()).run();}
            return result;
          });return bound;
        });
      }return statement;
    });
    const pending=handleRead(new Request(`${ORIGIN}/api/deliveries/delivery-a/posts/post-delivery-a/replies`),database,env,actor);
    if(kind==='post') await expect(pending).rejects.toMatchObject({status:404});
    else expect(await (await pending)!.json()).toEqual({replies:[]});
  });
  it('keeps a recipient notice available after group removal/block, private to the account, and read marking idempotent',async()=>{
    const auth=await signedIn();const author=await signedIn('author');expect((await remove(auth)).status).toBe(200);
    await env.DB.prepare("INSERT INTO box_blocks(box_id,user_id,created_at) VALUES('church-box','author',?)").bind(Date.now()).run();
    const notice=(await notices(author)).notices[0];expect(notice).toBeDefined();
    const path=`/api/group-notices/${encodeURIComponent(notice.id)}/read`;
    expect((await request(path,auth,{})).status).toBe(404);
    const first=await request(path,author,{});expect(first.status).toBe(200);const data=await first.json();
    expect(await (await request(path,author,{})).json()).toEqual(data);
    expect((await notices(author)).notices[0].readAt).toBeTypeOf('number');
    expect((await request('/api/group-notices',null)).status).toBe(401);
  });
});
