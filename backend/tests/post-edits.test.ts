import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { loadActor, primary } from '../src/data';
import type { Database } from '../src/data';
import { cancelOwnPostEdit, submitPostEdit, loadOwnPostEdits } from '../src/post-edits';
import { handleRequest } from '../src/index';
import { ORIGIN, resetDatabase, seedDelivery, seedUsers, session } from './fixtures';
const input = { title: 'A corrected title', body: 'Please pray for patience.', expectedRevision: 1 };
beforeEach(async () => { await resetDatabase(); await seedUsers(); await seedDelivery(); });
async function author() { const auth = await session('author'); return (await loadActor(primary(env.DB), auth.token))!; }

it('stores an immutable timestamped pending proposal without changing approved content or privacy', async () => {
  const actor = await author();
  const before = await env.DB.prepare("SELECT * FROM posts WHERE id='post-delivery-a'").first();
  const receipt = await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input);
  expect(receipt).toMatchObject({ status: 'pending', expectedRevision: 1, postId: 'post-delivery-a' });
  expect('submittedAt' in receipt && Number.isFinite(receipt.submittedAt)).toBe(true);
  expect(await env.DB.prepare("SELECT * FROM posts WHERE id='post-delivery-a'").first()).toEqual(before);
  const response = await handleRequest(new Request(`${ORIGIN}/api/deliveries/delivery-a`, { headers: (await session('recipient')).headers }), env);
  const payload = await response.text();
  expect(payload).toContain('Synthetic original prayer');
  expect(payload).not.toContain(input.body);
  expect(payload).not.toContain('author-handle');
});

it('rejects other writers, mismatched delivery IDs and stale revision', async () => {
  const outsider = await session('outsider');
  const actor = (await loadActor(primary(env.DB), outsider.token))!;
  await expect(submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input)).rejects.toMatchObject({ status: 404 });
  await expect(submitPostEdit(primary(env.DB), await author(), 'another-copy', 'post-delivery-a', input)).rejects.toMatchObject({ status: 404 });
  await expect(submitPostEdit(primary(env.DB), await author(), 'delivery-a', 'post-delivery-a', { ...input, expectedRevision: 2 })).rejects.toMatchObject({ status: 409 });
});

it('deduplicates retry and concurrent edits but conflicts rather than silently replacing another pending draft', async () => {
  const actor = await author();
  const receipts = await Promise.all([submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input), submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input)]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(1);
  await expect(submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', { ...input, body: 'A different draft.' })).rejects.toMatchObject({ status: 409 });
});

it('keeps own proposal history private and rejects revoked sessions', async () => {
  const actor = await author();
  await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input);
  expect((await loadOwnPostEdits(primary(env.DB), actor, 'delivery-a', 'post-delivery-a')).edits).toHaveLength(1);
  const recipient = (await loadActor(primary(env.DB), (await session('recipient')).token))!;
  await expect(loadOwnPostEdits(primary(env.DB), recipient, 'delivery-a', 'post-delivery-a')).rejects.toMatchObject({ status: 404 });
  await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(Date.now(), actor.sessionId).run();
  await expect(loadOwnPostEdits(primary(env.DB), actor, 'delivery-a', 'post-delivery-a')).rejects.toMatchObject({ status: 404 });
});

it.each([{ title: ' ' }, { body: 'a'.repeat(4001) }, { expectedRevision: -1 }, { anonymous: false }, { owner_id: 'outsider' }, { state: 'approved' }])('rejects invalid or authority-bearing fields %o', async change => {
  await expect(submitPostEdit(primary(env.DB), await author(), 'delivery-a', 'post-delivery-a', { ...input, ...change })).rejects.toMatchObject({ status: 400 });
});

it('rechecks the captured session inside the write after revocation races admission', async () => {
  const actor = await author();
  const db = primary(env.DB);
  let revoked = false;
  const wrapped: Database = {
    batch: db.batch.bind(db),
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!sql.startsWith('INSERT INTO post_edits')) return statement;
      return { ...statement, bind(...values: unknown[]) {
        const bound = statement.bind(...values);
        return { ...bound, async run() {
          if (!revoked) { revoked = true; await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(Date.now(), actor.sessionId).run(); }
          return bound.run();
        } };
      } } as D1PreparedStatement;
    },
  };
  await expect(submitPostEdit(wrapped, actor, 'delivery-a', 'post-delivery-a', input)).rejects.toMatchObject({ status: 404 });
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(0);
});

it('unchanged content creates no proposal or fabricated edit date', async () => {
  expect(await submitPostEdit(primary(env.DB), await author(), 'delivery-a', 'post-delivery-a', { title: 'Original title', body: 'Synthetic original prayer', expectedRevision: 1 })).toMatchObject({ status: 'unchanged' });
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(0);
  expect(await env.DB.prepare("SELECT edited_at FROM posts WHERE id='post-delivery-a'").first('edited_at')).toBeNull();
});

it('bounds concurrent edit intake to twenty proposals an hour', async () => {
  const actor = await author();
  await env.DB.batch(Array.from({ length: 21 }, (_, index) => env.DB.prepare("INSERT INTO posts(id,delivery_id,kind,title,body,status,created_at) VALUES(?,'delivery-a','update','Original title','Original words','approved',?)").bind(`burst-post-${index}`, Date.now()-1000)));
  const results = await Promise.allSettled(Array.from({ length: 21 }, (_, index) => submitPostEdit(primary(env.DB), actor, 'delivery-a', `burst-post-${index}`, input)));
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(20);
  expect(results.filter(row => row.status === 'rejected').map(row => row.status === 'rejected' && row.reason.status)).toEqual([429]);
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(20);
});

it('does not allow a manual review to rewrite the immutable proposal body or original edit time', async () => {
  const actor = await author();
  await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input);
  await expect(env.DB.prepare("UPDATE post_edits SET body='Unscreened replacement'").run()).rejects.toThrow();
  await expect(env.DB.prepare('UPDATE post_edits SET submitted_at=0').run()).rejects.toThrow();
  expect((await loadOwnPostEdits(primary(env.DB), actor, 'delivery-a', 'post-delivery-a')).edits[0].body).toBe(input.body);
});

it('lets an active author correct held text without exposing it or releasing its original moderation hold', async () => {
  await env.DB.prepare("UPDATE posts SET status='rejected' WHERE id='post-delivery-a'").run();
  await env.DB.prepare("UPDATE deliveries SET status='pending' WHERE id='delivery-a'").run();
  expect(await submitPostEdit(primary(env.DB), await author(), 'delivery-a', 'post-delivery-a', input)).toMatchObject({ status: 'pending' });
  expect(await env.DB.prepare("SELECT status FROM posts WHERE id='post-delivery-a'").first('status')).toBe('rejected');
  expect(await env.DB.prepare("SELECT status FROM deliveries WHERE id='delivery-a'").first('status')).toBe('pending');
  const response = await handleRequest(new Request(`${ORIGIN}/api/deliveries/delivery-a`, { headers: (await session('recipient')).headers }), env);
  expect(response.status).toBe(404);
});


it('only the author can withdraw a pending edit; retry is safe and a new proposal may then be sent', async () => {
  const actor = await author();
  const receipt = await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input);
  if (!('id' in receipt)) throw new Error('Expected a pending proposal');
  const recipient = (await loadActor(primary(env.DB), (await session('recipient')).token))!;
  await expect(cancelOwnPostEdit(primary(env.DB), recipient, 'delivery-a', 'post-delivery-a', receipt.id)).rejects.toMatchObject({ status: 404 });
  const cancelled = await cancelOwnPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', receipt.id);
  expect(cancelled.status).toBe('cancelled');
  expect(await cancelOwnPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', receipt.id)).toEqual(cancelled);
  const next = await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', { ...input, body: 'A revised proposal.' });
  expect(next).toMatchObject({ status: 'pending' });
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(2);
  expect(await env.DB.prepare("SELECT body FROM posts WHERE id='post-delivery-a'").first('body')).toBe('Synthetic original prayer');
});

it('preserves cancellation audit time on retries and cannot revive a terminal proposal', async () => {
  const actor = await author();
  const proposal = await submitPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', input);
  if (!('id' in proposal)) throw new Error('Expected a proposal');
  const first = await cancelOwnPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', proposal.id);
  expect(Number.isFinite(first.cancelledAt)).toBe(true);
  expect(await cancelOwnPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', proposal.id)).toEqual(first);
  await expect(env.DB.prepare("UPDATE post_edits SET state='approved',cancelled_at=NULL WHERE id=?").bind(proposal.id).run()).rejects.toThrow();
  await expect(env.DB.prepare('UPDATE post_edits SET cancelled_at=0 WHERE id=?').bind(proposal.id).run()).rejects.toThrow();
  expect((await loadOwnPostEdits(primary(env.DB), actor, 'delivery-a', 'post-delivery-a')).edits[0].submittedAt).toBe(proposal.submittedAt);
  await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(Date.now(), actor.sessionId).run();
  await expect(cancelOwnPostEdit(primary(env.DB), actor, 'delivery-a', 'post-delivery-a', proposal.id)).rejects.toMatchObject({ status: 404 });
});

it('mounted edit routes enforce session, origin and CSRF and return one private history list', async () => {
  const auth = await session('author');
  const path = `${ORIGIN}/api/deliveries/delivery-a/posts/post-delivery-a/edits`;
  const post = (headers: Record<string, string>) => handleRequest(new Request(path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), env);
  expect((await post({ Origin: ORIGIN })).status).toBe(401);
  expect((await post({ ...auth.headers, 'X-CSRF-Token': '' })).status).toBe(403);
  expect((await post({ ...auth.headers, Origin: 'https://attacker.invalid' })).status).toBe(403);
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM post_edits').first('count')).toBe(0);
  const result = await post(auth.headers);
  expect(result.status).toBe(202);
  const proposal = await result.json() as { id: string; submittedAt: number };
  const history = await handleRequest(new Request(path, { headers: auth.headers }), env);
  expect(history.headers.get('Cache-Control')).toContain('no-store');
  expect(await history.json()).toMatchObject({ edits: [{ id: proposal.id, status: 'pending', submittedAt: proposal.submittedAt }] });
  expect((await handleRequest(new Request(path), env)).status).toBe(401);
  expect((await handleRequest(new Request(path, { headers: (await session('recipient')).headers }), env)).status).toBe(404);
  const cancelPath = `${path}/${proposal.id}/cancel`;
  expect((await handleRequest(new Request(cancelPath, { method: 'POST', headers: { ...auth.headers, 'X-CSRF-Token': '' } }), env)).status).toBe(403);
  expect((await handleRequest(new Request(cancelPath, { method: 'POST', headers: { ...auth.headers, Origin: 'https://attacker.invalid' } }), env)).status).toBe(403);
  expect((await handleRequest(new Request(cancelPath, { method: 'POST', headers: (await session('recipient')).headers }), env)).status).toBe(404);
  const cancelled = await handleRequest(new Request(cancelPath, { method: 'POST', headers: auth.headers }), env);
  expect(cancelled.status).toBe(200);
  const receipt = await cancelled.json();
  expect(receipt).toMatchObject({ id: proposal.id, status: 'cancelled' });
  expect(await (await handleRequest(new Request(cancelPath, { method: 'POST', headers: auth.headers }), env)).json()).toEqual(receipt);
  const original = await env.DB.prepare("SELECT body,edited_at FROM posts WHERE id='post-delivery-a'").first();
  expect(original).toEqual({ body: 'Synthetic original prayer', edited_at: null });
});
