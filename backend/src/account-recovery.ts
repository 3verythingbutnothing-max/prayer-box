import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BackendEnv } from './env.ts';
import type { Database } from './data.ts';
import { HttpError, jsonResponse, readJsonObject, requireTrustedOrigin } from './http.ts';
import { verifyTurnstile } from './turnstile.ts';

type Delivery = { channel:'email'|'phone'; destination:string; code:string; expiresAt:number; requestId:string };
export type RecoveryDependencies = {
  siteverifyFetch?: Parameters<typeof verifyTurnstile>[0]['fetcher'];
  waitUntil?: (task:Promise<unknown>)=>void;
  // Test seam only, never accepted through a request or public configuration.
  deliverRecoveryCode?: (input:Delivery)=>Promise<void>;
};
const generic='If an eligible account has that verified recovery method, a code is on its way. Check your messages, including spam, and try again later if needed.';
const unavailable=()=>new HttpError(503,'recovery_unavailable','Password recovery is not available yet. Please use the help options or try again later.',true);
const invalid=()=>new HttpError(400,'invalid_recovery','This code is invalid, expired or already used. Request a new code.',true);
const ttl=10*60_000;
const maxAttempts=5;

export function recoveryAvailable(env:BackendEnv) {
  if (env.APP_ENV !== 'local' || env.AUTH_PROVIDER === 'cognito' || env.COGNITO_USER_POOL_ID) return false;
  return Boolean(env.RECOVERY_CODE_SECRET && env.RECOVERY_CODE_SECRET.length>=32 && env.RECOVERY_DELIVERY && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY);
}
async function digest(env:BackendEnv,value:string) {
  if(!env.RECOVERY_CODE_SECRET || env.RECOVERY_CODE_SECRET.length<32) throw unavailable();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RECOVERY_CODE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function limit(db:Database,key:string,count:number,windowMs:number,now:number) {
  const start=Math.floor(now/windowMs)*windowMs;
  const row=await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count=MIN(count+1,1000000) RETURNING count`).bind(key,start).first<{count:number}>();
  if(!row || row.count>count) throw new HttpError(429,'rate_limited','Please wait before trying recovery again.',true);
}
function validatePassword(password:unknown):asserts password is string {
  // No silent trim/truncation or arbitrary composition requirements.
  if(typeof password!=='string' || [...password].length<15 || new TextEncoder().encode(password).length>1024)
    throw new HttpError(400,'invalid_password','Use a new password with at least 15 characters and no more than 1,024 bytes.');
}
function derive(password:string,salt:Uint8Array):Promise<Buffer> {
  return new Promise((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
/** Maintained runtime primitive; production CPU/memory capacity must be measured in staging. */
export async function hashRecoveryPassword(password:string) {
  validatePassword(password);
  const salt=randomBytes(16); const result=await derive(password,salt);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${result.toString('hex')}`;
}
export async function verifyRecoveryPassword(password:string,encoded:string) {
  const match=/^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded);
  if(!match || new TextEncoder().encode(password).length>1024)return false;
  const actual=await derive(password,Buffer.from(match[1],'hex'));
  return timingSafeEqual(actual,Buffer.from(match[2],'hex'));
}
async function sendCode(env:BackendEnv,input:Delivery,deps:RecoveryDependencies) {
  if(deps.deliverRecoveryCode) return deps.deliverRecoveryCode(input);
  if(!env.RECOVERY_DELIVERY) throw unavailable();
  // Private service binding: no arbitrary URL, credentials or contact supplied by caller.
  const response=await env.RECOVERY_DELIVERY.fetch('https://recovery-delivery.internal/code',{
    method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':input.requestId},body:JSON.stringify(input),signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw new Error('Recovery delivery unavailable');
}

export async function handleRecoveryRoute(request:Request,env:BackendEnv,db:Database,deps:RecoveryDependencies={}):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(!['/api/recovery/start','/api/recovery/complete'].includes(path))return null;
  if(env.APP_ENV !== 'local' || env.AUTH_PROVIDER === 'cognito' || env.COGNITO_USER_POOL_ID) throw unavailable();
  if(request.method!=='POST')throw new HttpError(405,'method_not_allowed','Use the recovery form.');
  requireTrustedOrigin(request,[env.APP_ORIGIN]);
  if(!env.RECOVERY_CODE_SECRET || env.RECOVERY_CODE_SECRET.length<32 || (!env.RECOVERY_DELIVERY && !deps.deliverRecoveryCode) || !env.TURNSTILE_SECRET || !deps.waitUntil)throw unavailable();
  const now=Date.now();
  const ip=request.headers.get('CF-Connecting-IP')??'local-unknown';
  const ipKey=await digest(env,`ip:${ip}`);
  // Trusted Cloudflare IP in production; missing header shares a conservative bucket.
  await limit(db,`recovery-ip:${ipKey}`,30,15*60_000,now);
  const input=await readJsonObject(request,{maxBytes:4096});
  if(path.endsWith('/start')) {
    if(Object.keys(input).some(key=>!['username','channel','turnstileToken'].includes(key)) || typeof input.username!=='string'
      || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.username) || !['email','phone'].includes(String(input.channel)))throw new HttpError(400,'invalid_recovery','Enter your username and choose email or phone.');
    const username=input.username.normalize('NFKC').toLowerCase();
    await verifyTurnstile({token:input.turnstileToken,secret:env.TURNSTILE_SECRET,expectedAction:'recovery',allowedHostnames:env.TURNSTILE_HOSTNAMES.split(','),fetcher:deps.siteverifyFetch});
    await limit(db,`recovery-user:${await digest(env,username)}`,3,15*60_000,now);
    const contact=await db.prepare(`SELECT c.id,c.user_id,c.destination,c.version,u.session_epoch FROM recovery_contacts c JOIN users u ON u.id=c.user_id JOIN account_credentials a ON a.user_id=u.id
      WHERE u.username=? COLLATE NOCASE AND u.status='active' AND c.channel=? AND c.revoked_at IS NULL AND c.verified_at<=?`)
      .bind(username,input.channel,now).first<{id:string;user_id:string;destination:string;version:number;session_epoch:number}>();
    const challengeId=crypto.randomUUID();
    // Uniform 8-digit random code without modulo bias. It is never logged or returned.
    const bytes=new Uint32Array(1); let random:number;
    do { crypto.getRandomValues(bytes); random=bytes[0]; } while(random>=4_200_000_000);
    const code=String(random%100_000_000).padStart(8,'0');
    await db.prepare(`INSERT INTO recovery_challenges(id,user_id,contact_id,contact_version,session_epoch,code_hash,state,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,?)`)
      .bind(challengeId,contact?.user_id??null,contact?.id??null,contact?.version??null,contact?.session_epoch??null,await digest(env,`${challengeId}:${code}`),now,now+ttl).run();
    // Delivery is off the response path so provider latency/outages do not expose
    // account existence. An interrupted send leaves an unusable, expiring code;
    // the user can explicitly request another. No code is logged or returned.
    deps.waitUntil((async()=>{
      let delivered=false;
      if(contact)try {
        const eligible=await db.prepare(`SELECT c.destination FROM recovery_challenges r
          JOIN users u ON u.id=r.user_id JOIN recovery_contacts c ON c.id=r.contact_id
          JOIN account_credentials a ON a.user_id=u.id
          WHERE r.id=? AND r.state='pending' AND r.expires_at>? AND u.status='active'
            AND u.session_epoch=r.session_epoch AND c.user_id=u.id
            AND c.version=r.contact_version AND c.revoked_at IS NULL AND c.verified_at<=?`)
          .bind(challengeId,Date.now(),Date.now()).first<{destination:string}>();
        if(eligible) {
          await sendCode(env,{channel:input.channel as 'email'|'phone',destination:eligible.destination,code,expiresAt:now+ttl,requestId:challengeId},deps);
          delivered=true;
        }
      } catch { /* Private provider failure. */ }
      await db.prepare("UPDATE recovery_challenges SET state=? WHERE id=? AND state='pending'").bind(delivered?'ready':'failed',challengeId).run();
    })());
    return jsonResponse({challengeId,message:generic},202);
  }
  if(Object.keys(input).some(key=>!['challengeId','code','newPassword'].includes(key)) || typeof input.challengeId!=='string' || !/^[a-f0-9-]{36}$/.test(input.challengeId)
    || typeof input.code!=='string' || !/^\d{8}$/.test(input.code))throw invalid();
  validatePassword(input.newPassword);
  const codeHash=await digest(env,`${input.challengeId}:${input.code}`);
  const challenge=await db.prepare(`UPDATE recovery_challenges SET attempts=attempts+1 WHERE id=? AND state='ready' AND expires_at>? AND attempts<?
    RETURNING user_id,contact_id,contact_version,session_epoch,code_hash,attempts`)
    .bind(input.challengeId,now,maxAttempts).first<{user_id:string;contact_id:string;contact_version:number;session_epoch:number;code_hash:string;attempts:number}>();
  if(!challenge || !timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(codeHash,'hex')))throw invalid();
  const passwordHash=await hashRecoveryPassword(input.newPassword);
  const at=Date.now(); const commit=crypto.randomUUID();
  const guard=`EXISTS(SELECT 1 FROM recovery_challenges r WHERE r.id=? AND r.consume_token=? AND r.state='consumed')`;
  const result=await db.batch([
    db.prepare(`UPDATE recovery_challenges SET state='consumed',consumed_at=?,consume_token=? WHERE id=? AND state='ready' AND expires_at>? AND attempts<=? AND code_hash=?
      AND EXISTS(SELECT 1 FROM users u JOIN recovery_contacts c ON c.user_id=u.id JOIN account_credentials a ON a.user_id=u.id
        WHERE u.id=recovery_challenges.user_id AND u.status='active' AND u.session_epoch=recovery_challenges.session_epoch
        AND c.id=recovery_challenges.contact_id AND c.version=recovery_challenges.contact_version AND c.revoked_at IS NULL AND c.verified_at<=?)`)
      .bind(at,commit,input.challengeId,at,maxAttempts,codeHash,at),
    db.prepare(`UPDATE account_credentials SET password_hash=?,version=version+1,updated_at=? WHERE user_id=? AND ${guard}`).bind(passwordHash,at,challenge.user_id,input.challengeId,commit),
    db.prepare(`UPDATE users SET session_epoch=session_epoch+1 WHERE id=? AND ${guard}`).bind(challenge.user_id,input.challengeId,commit),
    db.prepare(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND ${guard}`).bind(at,challenge.user_id,input.challengeId,commit),
    db.prepare(`UPDATE recovery_challenges SET state='failed' WHERE user_id=? AND id!=? AND state IN ('pending','ready') AND ${guard}`).bind(challenge.user_id,input.challengeId,input.challengeId,commit),
  ]);
  if(result[0].meta.changes!==1 || result[1].meta.changes!==1)throw invalid();
  return jsonResponse({reset:true,message:'Your password has been changed. Sign in again on each device.'},200,{'Set-Cookie':`${new URL(request.url).protocol==='https:'?'__Host-pb_session=; Secure':'pb_session='}; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`});
}
