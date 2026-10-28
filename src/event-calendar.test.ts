import test from 'node:test';
import assert from 'node:assert/strict';
import { eventLocalDateTime, eventLocalToIso, googleCalendarUrl, prayerEventIcs } from './event-calendar.ts';
import type { PrayerEvent } from './prayer-events.ts';

const now = Date.UTC(2026, 9, 29, 12);
const event = (): PrayerEvent => ({ id: 'event-one', host: { kind: 'person', id: 'elena' }, title: 'Morning prayer', description: 'Pray together in Jesus’ name.', format: 'virtual', meetingUrl: 'https://meet.example.org/prayer', website: 'https://example.org/event', startsAt: '2026-11-10T13:00:00.000Z', endsAt: '2026-11-10T14:00:00.000Z', timeZone: 'America/New_York', audience: 'connections', shareable: true, createdAt: now, updatedAt: now, version: 1 });
const unfolded = (value: string) => value.replace(/\r\n[ \t]/g, '');

test('calendar output is one private UTC event with stable UID, correct end and no mail attendees or alarms', () => {
  const ics = prayerEventIcs(event(), now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.match(ics, /UID:event-one@prayerbox\.local\r\n/);
  assert.match(ics, /DTSTART:20261110T130000Z\r\nDTEND:20261110T140000Z/);
  assert.match(ics, /CLASS:PRIVATE\r\nSTATUS:CONFIRMED/);
  assert.equal(ics.includes('ATTENDEE'), false); assert.equal(ics.includes('ORGANIZER'), false); assert.equal(ics.includes('VALARM'), false);
  assert.match(unfolded(ics), /does not update automatically/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});
test('RFC5545 escaping prevents CRLF and delimiter content from creating calendar properties', () => {
  const input = event(); input.title = 'Prayer, together; safely\\today\r\nBEGIN:VALARM';
  input.description = 'Line one\nATTENDEE:mailto:unwanted@example.org\rEND:VEVENT';
  input.id = 'id\r\nBEGIN:VEVENT';
  const value = prayerEventIcs(input, now); const lines = value.split('\r\n');
  assert.equal(lines.some(line => line.startsWith('ATTENDEE:')), false);
  assert.equal(lines.some(line => line === 'BEGIN:VALARM'), false);
  assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(lines.filter(line => line === 'END:VEVENT').length, 1);
  assert.match(unfolded(value), /Prayer\\, together\\; safely\\\\today\\nBEGIN:VALARM/);
});
test('folded UTF8 lines stay at most 75 octets without splitting multibyte characters', () => {
  const input = event(); input.title = 'Prayer 🌿 together '.repeat(20); input.description = 'Encouragement é '.repeat(80);
  const result = prayerEventIcs(input, now);
  for (const line of result.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(unfolded(result), /SUMMARY:Prayer 🌿 together/);
  assert.equal(result.includes('\ufffd'), false);
});
test('Google opens only its compose URL and encodes user content into fixed parameters', () => {
  const input = event(); input.title = 'Prayer &add=unwanted@example.org';
  const link = new URL(googleCalendarUrl(input));
  assert.equal(link.origin, 'https://calendar.google.com'); assert.equal(link.pathname, '/calendar/render');
  assert.equal(link.searchParams.get('action'), 'TEMPLATE'); assert.equal(link.searchParams.get('text'), input.title);
  assert.equal(link.searchParams.get('dates'), '20261110T130000Z/20261110T140000Z');
  assert.equal(link.searchParams.get('ctz'), 'America/New_York');
  assert.equal(link.searchParams.has('add'), false);
});
test('calendar date conversion follows the chosen zone, including quarter-hour offsets', () => {
  assert.equal(eventLocalDateTime('2026-11-10T13:00:00Z', 'America/New_York'), '2026-11-10T08:00');
  assert.equal(eventLocalToIso('2026-11-10T08:00', 'America/New_York'), '2026-11-10T13:00:00.000Z');
  assert.equal(eventLocalToIso('2026-11-10T08:00', 'Asia/Kathmandu'), '2026-11-10T02:15:00.000Z');
});
test('skipped or ambiguous daylight-saving wall times and malformed dates are rejected', () => {
  assert.throws(() => eventLocalToIso('2027-03-14T02:30', 'America/New_York'), /skipped/);
  assert.throws(() => eventLocalToIso('2026-11-01T01:30', 'America/New_York'), /twice/);
  assert.throws(() => eventLocalToIso('2026-02-30T08:00', 'America/New_York'));
  assert.throws(() => eventLocalToIso('2026-11-10T08:00', 'Unknown/Zone'));
});
test('cancelled or invalid events cannot be added as new calendar copies', () => {
  const cancelled = { ...event(), cancelledAt: now };
  assert.throws(() => prayerEventIcs(cancelled)); assert.throws(() => googleCalendarUrl(cancelled));
  assert.throws(() => prayerEventIcs({ ...event(), startsAt: 'invalid' }));
  assert.throws(() => googleCalendarUrl({ ...event(), endsAt: '2020-01-01T00:00:00Z' }));
});
test('updated exports keep the same canonical UID while recording their newer version', () => {
  const before = prayerEventIcs(event(), now);
  const next = prayerEventIcs({ ...event(), title: 'Corrected title', version: 2, updatedAt: now + 1000 }, now + 2000);
  assert.equal(before.match(/UID:[^\r]+/)?.[0], next.match(/UID:[^\r]+/)?.[0]);
  assert.match(next, /SEQUENCE:1\r\n/); assert.match(next, /LAST-MODIFIED:20261029T120001Z/);
});
