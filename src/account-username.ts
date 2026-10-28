export function normalizeAccountUsername(value: string, occupied: readonly string[], current: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(username) || /[-_]$/.test(username)) throw new Error('Use 3–32 letters, numbers, underscores or hyphens, starting with a letter and ending with a letter or number.');
  if (username !== current.toLowerCase() && [...occupied, 'prayerbox','admin','support','api','settings','signin','signup','recovery'].some(item => item.toLowerCase() === username)) throw new Error('That username is already in use or reserved. Please choose another.');
  return username;
}
