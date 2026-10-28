import {env} from 'cloudflare:workers';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {handleRequest} from '../src/index';
import {handlePrayerEventRoute} from '../src/prayer-events';
import {hashSecret,loadActor,primary,type Database} from '../src/data';
import {errorResponse} from '../src/http';
import {NOW,ORIGIN,resetDatabase,seedUsers,seedDelivery,session,type USERS} from './fixtures';
import type {EventInput,EventHost,PrayerEvent,PrayerConnection,PrayerEventShare} from '../../src/prayer-events';

type User=typeof USERS[number];type Auth=Awaited<ReturnType<typeof session>>;
async function auth(user:User,mfa=false){const value=await session(user);if(mfa)await env.DB.prepare("UPDATE sessions SET assurance='mfa',authenticated_at=? WHERE token_hash=?").bind(Date.now()-100,await hashSecret(value.token)).run();return value;}
async function request(path:string,actor:Auth|null,body?:unknown,headers:Record<string,string>={}){return handleRequest(new Request(`${ORIGIN}${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:ORIGIN,...actor?.headers,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);}
const person=(id:string):EventHost=>({kind:'person',id});const group:EventHost={kind:'group',id:'church-box'};
const details=(changes:Partial<EventInput>={}):EventInput=>({title:'Prayer together',description:'Synthetic prayer event details.',format:'virtual',meetingUrl:'https://example.org/meeting',website:'https://example.org/info',startsAt:new Date(NOW+86400000).toISOString(),endsAt:new Date(NOW+90000000).toISOString(),timeZone:'America/New_York',audience:'connections',shareable:true,...changes});
async function event(actor:Auth,host:EventHost,input=details()){const response=await request('/api/prayer-events',actor,{host,event:input});expect(response.status,await response.clone().text()).toBe(201);return (await response.json() as {event:PrayerEvent}).event;}
async function connect(first:User,second:User){const from=await auth(first);const to=await auth(second);const sent=await request('/api/connections/request',from,{target:person(second)});expect(sent.status,await sent.clone().text()).toBe(202);const data=await sent.json() as {connection:PrayerConnection;version:number};const accepted=await action(to,data.connection.id,'accept',data.version);expect(accepted.status,await accepted.clone().text()).toBe(200);return {from,to,id:data.connection.id,version:2};}
async function action(actor:Auth,id:string,type:string,version:number){return request(`/api/connections/${encodeURIComponent(id)}/actions`,actor,{action:type,expectedVersion:version});}
async function race(path:string,actor:Auth,body:unknown,change:()=>Promise<unknown>){const db=primary(env.DB);const user=await loadActor(db,actor.token);const racing:Database={prepare:db.prepare.bind(db),batch:async statements=>{await change();return db.batch(statements);}};try{return await handlePrayerEventRoute(new Request(`${ORIGIN}${path}`,{method:'POST',headers:{...actor.headers,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,user,racing);}catch(error){return errorResponse(error);}}
beforeEach(async()=>{await resetDatabase();await seedUsers();await env.DB.prepare("INSERT INTO group_settings(box_id,updated_at) VALUES('church-box',?)").bind(NOW).run();});

describe('consented prayer connections and canonical event invitations',()=>{
  it('requires sign-in, CSRF, exact Origin and the person’s own host',async()=>{
    const author=await auth('author');const body={host:person('author'),event:details()};
    expect((await request('/api/prayer-events',null,body)).status).toBe(401);
    expect((await request('/api/prayer-events',author,body,{'X-CSRF-Token':'wrong'})).status).toBe(403);
    expect((await request('/api/prayer-events',author,body,{Origin:'https://hostile.example'})).status).toBe(403);
    expect((await request('/api/prayer-events',author,{...body,host:person('recipient')})).status).toBe(409);
    expect((await event(author,person('author'))).host).toEqual(person('author'));
  });
  it('keeps connections pending until the other person accepts and never grants prayer-reading permission',async()=>{
    const author=await auth('author');const recipient=await auth('recipient');const created=await event(author,person('author'));await seedDelivery({organization:true});
    const sent=await request('/api/connections/request',author,{target:person('recipient')});expect(sent.status).toBe(202);const data=await sent.json() as {connection:PrayerConnection;version:number};
    expect(data.connection.status).toBe('pending');expect((await request(`/api/prayer-events/${created.id}`,recipient)).status).toBe(404);
    expect((await action(author,data.connection.id,'accept',data.version)).status).toBe(409);
    expect((await action(recipient,data.connection.id,'accept',data.version)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,recipient)).status).toBe(200);
    expect((await request('/api/deliveries/delivery-a',recipient)).status).toBe(404);
    expect(await env.DB.prepare("SELECT user_id FROM memberships WHERE box_id='church-box' AND user_id='recipient'").first()).toBeNull();
    expect((await request('/api/prayer-invitations',recipient)).status).toBe(200);
  });
  it('rejects prayer/anonymity/automatic-source metadata on an ordinary request',async()=>{
    const author=await auth('author');
    for(const extra of [{prayerId:'secret'},{anonymous:true},{source:'prayer'},{source:'platform'}])expect((await request('/api/connections/request',author,{target:person('recipient'),...extra})).status).toBe(400);
    expect(await env.DB.prepare('SELECT id FROM prayer_connections').first()).toBeNull();
  });
  it('supports decline, withdraw and deliberate re-request with no automatic admission',async()=>{
    const author=await auth('author');const recipient=await auth('recipient');
    const data=await (await request('/api/connections/request',author,{target:person('recipient')})).json() as {connection:PrayerConnection;version:number};
    expect((await action(recipient,data.connection.id,'withdraw',1)).status).toBe(409);
    expect((await action(recipient,data.connection.id,'decline',1)).status).toBe(200);
    const again=await request('/api/connections/request',author,{target:person('recipient')});expect(again.status).toBe(202);
    const next=await again.json() as {version:number;connection:PrayerConnection};expect(next.connection.status).toBe('pending');
    expect((await action(author,next.connection.id,'withdraw',next.version)).status).toBe(200);
    expect(await env.DB.prepare('SELECT status FROM prayer_connections').first()).toEqual({status:'declined'});
  });
  it('allows either side to end, suppresses the other side’s reconnect, and requires fresh acceptance',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    expect((await action(connection.to,connection.id,'end',2)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,connection.to)).status).toBe(404);
    expect((await request('/api/connections/request',connection.from,{target:person('recipient')})).status).toBe(409);
    const again=await request('/api/connections/request',connection.to,{target:person('author')});expect(again.status).toBe(202);
    expect((await request(`/api/prayer-events/${created.id}`,connection.to)).status).toBe(404);
    const data=await again.json() as {connection:PrayerConnection;version:number};expect((await action(connection.from,data.connection.id,'accept',data.version)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,connection.to)).status).toBe(200);
  });
  it('requires current admin MFA to host or accept connections for a group and never grants group membership',async()=>{
    const owner=await auth('owner',true);const basic=await auth('owner');const outsider=await auth('outsider');const member=await auth('member',true);
    await env.DB.prepare("UPDATE memberships SET is_moderator=1 WHERE box_id='church-box' AND user_id='member'").run();
    expect((await request('/api/prayer-events',basic,{host:group,event:details()})).status).toBe(403);
    expect((await request('/api/prayer-events',member,{host:group,event:details()})).status).toBe(409);
    const created=await event(owner,group);const sent=await request('/api/connections/request',outsider,{target:group});expect(sent.status).toBe(202);const data=await sent.json() as {connection:PrayerConnection;version:number};
    expect((await action(basic,data.connection.id,'accept',1)).status).toBe(403);
    expect((await action(member,data.connection.id,'accept',1)).status).toBe(409);
    expect((await action(owner,data.connection.id,'accept',1)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,outsider)).status).toBe(200);
    expect(await env.DB.prepare("SELECT user_id FROM memberships WHERE user_id='outsider' AND box_id='church-box'").first()).toBeNull();
    const feed=await (await request('/api/connections',owner)).text();expect(feed).toContain(data.connection.id);
  });
  it('keeps members-only event details within approved members and never allows repost broadening',async()=>{
    const owner=await auth('owner',true);const member=await auth('member');const pending=await auth('pending');const created=await event(owner,group,details({audience:'members',shareable:false,format:'in_person',meetingUrl:undefined,address:'Synthetic community room'}));
    expect((await request(`/api/prayer-events/${created.id}`,member)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,pending)).status).toBe(404);
    expect((await request(`/api/prayer-events/${created.id}/repost`,member,{host:person('member')})).status).toBe(409);
    expect((await request(`/api/prayer-events/${created.id}/edit`,owner,{expectedVersion:1,event:details({audience:'connections'})})).status).toBe(409);
    await env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE box_id='church-box' AND user_id='member'").bind(Date.now()).run();
    expect((await request(`/api/prayer-events/${created.id}`,member)).status).toBe(404);
  });
  it('preserves canonical origin through deduplicated reposts and revokes downstream access on disconnect',async()=>{
    const first=await connect('author','recipient');const second=await connect('recipient','outsider');const third=await connect('outsider','newmember');
    const created=await event(first.from,person('author'));
    const shared=await request(`/api/prayer-events/${created.id}/repost`,first.to,{host:person('recipient')});expect(shared.status).toBe(201);
    expect((await request(`/api/prayer-events/${created.id}/repost`,first.to,{host:person('recipient')})).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,second.to)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}/repost`,second.to,{host:person('outsider')})).status).toBe(201);
    expect((await request(`/api/prayer-events/${created.id}`,third.to)).status).toBe(200);
    expect(await env.DB.prepare('SELECT COUNT(*) n FROM prayer_events').first<number>('n')).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) n FROM prayer_event_shares').first<number>('n')).toBe(2);
    expect((await action(first.to,first.id,'end',2)).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,second.to)).status).toBe(404);expect((await request(`/api/prayer-events/${created.id}`,third.to)).status).toBe(404);
  });
  it('supports withdrawing a repost and retains its revoked lineage when reshared deliberately',async()=>{
    const first=await connect('author','recipient');const second=await connect('recipient','outsider');const created=await event(first.from,person('author'));
    const data=await (await request(`/api/prayer-events/${created.id}/repost`,first.to,{host:person('recipient')})).json() as {share:PrayerEventShare};
    expect((await request(`/api/prayer-events/${created.id}/shares/${data.share.id}/revoke`,second.to,{})).status).toBe(409);
    expect((await request(`/api/prayer-events/${created.id}/shares/${data.share.id}/revoke`,first.to,{})).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}`,second.to)).status).toBe(404);
    expect((await request(`/api/prayer-events/${created.id}/repost`,first.to,{host:person('recipient')})).status).toBe(201);
    expect((await request(`/api/prayer-events/${created.id}`,second.to)).status).toBe(200);
  });
  it('propagates edits and cancellation to every invitation and omits meeting details after cancellation',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    expect((await request(`/api/prayer-events/${created.id}/edit`,connection.to,{expectedVersion:1,event:details({title:'Forged'})})).status).toBe(409);
    expect((await request(`/api/prayer-events/${created.id}/edit`,connection.from,{expectedVersion:1,event:details({title:'Updated prayer time'})})).status).toBe(200);
    const read=await request(`/api/prayer-events/${created.id}`,connection.to);expect(await read.text()).toContain('Updated prayer time');
    expect((await request(`/api/prayer-events/${created.id}/cancel`,connection.from,{expectedVersion:1})).status).toBe(409);
    expect((await request(`/api/prayer-events/${created.id}/cancel`,connection.from,{expectedVersion:2})).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}/cancel`,connection.from,{expectedVersion:2})).status).toBe(200);
    const cancelled=await (await request(`/api/prayer-events/${created.id}`,connection.to)).json() as {event:PrayerEvent};expect(cancelled.event.cancelledAt).toBeTypeOf('number');expect(cancelled.event.meetingUrl).toBeUndefined();
  });
  it('keeps dismissal private and stable through canonical updates',async()=>{
    const first=await connect('author','recipient');const second=await connect('author','outsider');const created=await event(first.from,person('author'));
    expect((await request(`/api/prayer-events/${created.id}/dismiss`,first.to,{})).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}/dismiss`,first.to,{})).status).toBe(200);
    expect((await request(`/api/prayer-events/${created.id}/edit`,first.from,{expectedVersion:1,event:details({title:'A new time'})})).status).toBe(200);
    expect(await (await request('/api/prayer-invitations',first.to)).text()).not.toContain(created.id);
    expect(await (await request('/api/prayer-invitations',second.to)).text()).toContain(created.id);
    expect(await env.DB.prepare('SELECT COUNT(*) n FROM prayer_event_dismissals').first<number>('n')).toBe(1);
  });
  it('revokes access after a block, group deletion or inactive host',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    await env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('author','recipient',?)").bind(Date.now()).run();
    expect((await request(`/api/prayer-events/${created.id}`,connection.to)).status).toBe(404);
    expect((await request('/api/connections/request',connection.to,{target:person('author')})).status).toBe(409);
    const owner=await auth('owner',true);const grouped=await event(owner,group,details({audience:'members',shareable:false}));
    expect((await request(`/api/prayer-events/${grouped.id}`,await auth('member'))).status).toBe(200);
    expect((await request('/api/groups/church-box/actions',owner,{expectedVersion:1,command:{type:'request_deletion'}})).status).toBe(200);
    expect((await request(`/api/prayer-events/${grouped.id}`,await auth('member'))).status).toBe(404);
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='author'").run();
    expect((await request(`/api/prayer-events/${created.id}`,connection.to)).status).toBe(404);
  });
  it('validates HTTPS links, timezone, ordering, audience and bounded text',async()=>{
    const author=await auth('author');
    for(const changes of [{meetingUrl:'javascript:alert(1)'},{meetingUrl:'https://user:pass@example.org'},{meetingUrl:'http://example.org'},{meetingUrl:'https://127.0.0.1'},{endsAt:new Date(NOW-1000).toISOString()},{timeZone:'Invalid/Place'},{description:'x'.repeat(4001)},{audience:'members',shareable:false}]) {
      expect([400,409]).toContain((await request('/api/prayer-events',author,{host:person('author'),event:details(changes as Partial<EventInput>)})).status);
    }
    expect(await env.DB.prepare('SELECT id FROM prayer_events').first()).toBeNull();
  });
  it('rejects creation if the session is revoked before commit',async()=>{
    const author=await auth('author');const response=await race('/api/prayer-events',author,{host:person('author'),event:details()},async()=>env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(Date.now(),await hashSecret(author.token)).run());
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT id FROM prayer_events').first()).toBeNull();
  });
  it('rejects group publishing after a concurrent admin demotion',async()=>{
    const owner=await auth('owner',true);const response=await race('/api/prayer-events',owner,{host:group,event:details()},()=>env.DB.prepare("UPDATE memberships SET role='member',is_admin=0 WHERE box_id='church-box' AND user_id='owner'").run());
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT id FROM prayer_event_actions').first()).toBeNull();
  });
  it('rejects connection acceptance if a block arrives at commit',async()=>{
    const author=await auth('author');const recipient=await auth('recipient');const data=await (await request('/api/connections/request',author,{target:person('recipient')})).json() as {connection:PrayerConnection;version:number};
    const response=await race(`/api/connections/${encodeURIComponent(data.connection.id)}/actions`,recipient,{action:'accept',expectedVersion:1},()=>env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('author','recipient',?)").bind(Date.now()).run());
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT status FROM prayer_connections').first()).toEqual({status:'pending'});
  });
  it('deduplicates concurrent reposts to the same audience',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    const results=await Promise.all([request(`/api/prayer-events/${created.id}/repost`,connection.to,{host:person('recipient')}),request(`/api/prayer-events/${created.id}/repost`,connection.to,{host:person('recipient')})]);
    expect(results.every(result=>[200,201,409].includes(result.status))).toBe(true);
    expect(await env.DB.prepare('SELECT COUNT(*) n FROM prayer_event_shares').first<number>('n')).toBe(1);
  });
  it('withholds meeting bytes when a connection ends during a read',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    const database=primary(env.DB);const viewer=await loadActor(database,connection.to.token);const originalPrepare=database.prepare.bind(database);let changed=false;
    vi.spyOn(database,'prepare').mockImplementation(query=>{
      const statement=originalPrepare(query);
      if(query.includes('SELECT id,username,display_name,status FROM users')) {
        const originalBind=statement.bind.bind(statement);
        vi.spyOn(statement,'bind').mockImplementation((...values)=>{
          const bound=originalBind(...values);const originalAll=bound.all.bind(bound);
          vi.spyOn(bound,'all').mockImplementationOnce(async <T>()=>{
            const result=await originalAll<T>();if(!changed){changed=true;await env.DB.prepare("UPDATE prayer_connections SET status='disconnected',version=version+1 WHERE id=?").bind(connection.id).run();}return result;
          });return bound;
        });
      }return statement;
    });
    await expect(handlePrayerEventRoute(new Request(`${ORIGIN}/api/prayer-events/${created.id}`),env,viewer,database)).rejects.toMatchObject({status:409});
  });
  it('rejects a repost when the source connection ends at commit',async()=>{
    const connection=await connect('author','recipient');const created=await event(connection.from,person('author'));
    const response=await race(`/api/prayer-events/${created.id}/repost`,connection.to,{host:person('recipient')},async()=>{
      const row=await env.DB.prepare('SELECT record FROM prayer_connections WHERE id=?').bind(connection.id).first<{record:string}>();const value=JSON.parse(row!.record) as PrayerConnection;value.status='disconnected';value.disconnectedBy='person:author';
      return env.DB.prepare("UPDATE prayer_connections SET status='disconnected',record=?,version=version+1 WHERE id=?").bind(JSON.stringify(value),connection.id).run();
    });
    expect(response?.status).toBe(409);expect(await env.DB.prepare('SELECT id FROM prayer_event_shares').first()).toBeNull();
  });
});
