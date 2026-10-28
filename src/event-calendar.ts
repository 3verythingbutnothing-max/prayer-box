import { PrayerEventError } from './prayer-events.ts';
import type { PrayerEvent } from './prayer-events.ts';

/** Calendar exports are user-initiated copies, not calendar subscriptions or email invitations. */
const stamp = (value: string | number): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new PrayerEventError('This event has an invalid calendar date.');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};
const plain = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
/** RFC 5545 TEXT escaping prevents CRLF properties from being injected through user content. */
export const escapeCalendarText = (value: string): string => plain(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string): string {
  const lines: string[] = []; let current = ''; let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += character; bytes += length;
  }
  lines.push(current); return lines.join('\r\n');
}
function check(event: PrayerEvent) {
  if (event.cancelledAt != null) throw new PrayerEventError('This event was cancelled. Remove any saved calendar copy.');
  if (!event.id || !Number.isSafeInteger(event.version) || event.version < 1 || Date.parse(event.endsAt) <= Date.parse(event.startsAt)) throw new PrayerEventError('This event is not ready for your calendar.');
  stamp(event.startsAt); stamp(event.endsAt);
}
function details(event: PrayerEvent): string {
  return [event.description, event.meetingUrl ? `Join: ${event.meetingUrl}` : '', event.website ? `Event information: ${event.website}` : '', `Event time zone: ${event.timeZone}`, 'Saved from Prayer Box. This calendar copy does not update automatically; check the invitation for changes or cancellation.'].filter(Boolean).join('\n\n');
}
export function googleCalendarUrl(event: PrayerEvent): string {
  check(event);
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE'); url.searchParams.set('text', event.title);
  url.searchParams.set('dates', `${stamp(event.startsAt)}/${stamp(event.endsAt)}`);
  url.searchParams.set('details', details(event)); url.searchParams.set('location', event.format === 'virtual' ? event.meetingUrl ?? '' : event.address ?? '');
  url.searchParams.set('ctz', event.timeZone);
  return url.href;
}
export function prayerEventIcs(event: PrayerEvent, now = Date.now()): string {
  check(event);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prayer Box//Prayer Invitations//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(event.id)}@prayerbox.local`, `DTSTAMP:${stamp(now)}`, `CREATED:${stamp(event.createdAt)}`,
    `LAST-MODIFIED:${stamp(event.updatedAt)}`, `SEQUENCE:${event.version - 1}`, `DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`, `DESCRIPTION:${escapeCalendarText(details(event))}`,
    `LOCATION:${escapeCalendarText(event.format === 'virtual' ? event.meetingUrl ?? '' : event.address ?? '')}`,
    'CLASS:PRIVATE', 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Display/edit the wall-clock time in the event's named zone, independent of the device zone. */
export function eventLocalDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new PrayerEventError('Choose a valid event date.');
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
  } catch { throw new PrayerEventError('Choose a valid event time zone.'); }
}
/** Reject missing/repeated DST wall times instead of silently moving the meeting. */
export function eventLocalToIso(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new PrayerEventError('Choose a date and time.');
  const wall = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== local) throw new PrayerEventError('Choose a valid date and time.');
  const candidates: string[] = [];
  for (let minutes = -14 * 60; minutes <= 14 * 60; minutes += 15) {
    const candidate = new Date(wall + minutes * 60_000).toISOString();
    if (eventLocalDateTime(candidate, timeZone) === local) candidates.push(candidate);
  }
  if (candidates.length !== 1) throw new PrayerEventError(candidates.length ? 'That time occurs twice during a clock change. Please choose an unambiguous time.' : 'That time is skipped during a clock change. Please choose another time.');
  return candidates[0];
}
