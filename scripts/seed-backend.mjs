import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 2) throw new Error('This helper accepts no remote target or arguments.');
const config = readFileSync(resolve(root, 'backend/wrangler.jsonc'), 'utf8');
if (!config.includes('"APP_ENV": "local"') || !config.includes('00000000-0000-0000-0000-000000000001')) {
  throw new Error('Synthetic seeding is restricted to the checked-in local configuration.');
}
const run = (file) => execFileSync(process.execPath,
  [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--local',
    '--config', 'backend/wrangler.jsonc', '--file', file], { cwd: root, stdio: 'inherit' });
run('backend/seed.sql');
const token = randomBytes(32).toString('hex');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const csrf = hash(`csrf:${token}`);
const now = Date.now();
mkdirSync(resolve(root, 'output/backend-local'), { recursive: true });
const sql = resolve(root, 'output/backend-local/session.sql');
writeFileSync(sql, `INSERT INTO sessions(id,token_hash,csrf_hash,user_id,session_epoch,assurance,authenticated_at,expires_at,created_at)
VALUES('${randomUUID()}','${hash(token)}','${hash(csrf)}','fixture-author',0,'basic',${now},${now + 3600000},${now});`, { mode: 0o600 });
try { run(sql); } finally { unlinkSync(sql); }
writeFileSync(resolve(root, 'output/backend-local/session.json'), JSON.stringify({
  note: 'Synthetic localhost session, expires in one hour. Never use for a real account.',
  cookie: `pb_session=${token}`, csrfToken: csrf, expiresAt: now + 3600000,
}, null, 2), { mode: 0o600 });
console.log('Local fictional fixtures ready. Session stored privately in output/backend-local/session.json; no sign-in endpoint was created.');
