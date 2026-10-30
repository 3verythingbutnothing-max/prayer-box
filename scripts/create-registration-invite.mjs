// Creates private files only. Never applies SQL, sends an invitation or calls a provider.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
let age = 'adult'; let hours = 24;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--age-band') age = args[++i];
  else if (args[i] === '--hours') hours = Number(args[++i]);
  else throw new Error('Use --age-band adult|teen and --hours 1–168. This command only creates private files.');
}
if (!['adult', 'teen'].includes(age) || !Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('Invalid invite eligibility or lifetime.');
const id = randomUUID(); const code = randomBytes(32).toString('base64url');
const digest = createHash('sha256').update(code).digest('hex'); const now = Date.now();
const directory = resolve('output/registration-invites');
await mkdir(directory, { recursive: true, mode: 0o700 });
const sqlFile = resolve(directory, `${id}.sql`); const privateFile = resolve(directory, `${id}.txt`);
await writeFile(sqlFile, `INSERT INTO auth_invites(id,token_hash,age_band,expires_at,created_at) VALUES('${id}','${digest}','${age}',${now + hours * 3600000},${now});\n`, { mode: 0o600, flag: 'wx' });
await writeFile(privateFile, `Private Prayer Box pilot invitation\nAge band: ${age}\nExpires: ${new Date(now + hours * 3600000).toISOString()}\nCode: ${code}\nNever commit, log publicly or attach this file to support.\n`, { mode: 0o600, flag: 'wx' });
console.log(`Private invitation files created in ${directory}. No database or provider was changed. Apply the SQL only to your verified isolated staging database; retrieve the code privately from the matching .txt file.`);
