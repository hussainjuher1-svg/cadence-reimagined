import { fail } from './errors.mjs';

export function validTimeZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0); return true; } catch { return false; }
}
function partsAt(epoch, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
function sameMinute(parts, target) {
  return parts.year === target.year && parts.month === target.month && parts.day === target.day && parts.hour === target.hour && parts.minute === target.minute;
}
function offsetAt(epoch, timezone) {
  const p = partsAt(epoch, timezone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
}

export function localDateTimeToUtc(local, timezone) {
  if (!validTimeZone(timezone)) fail(400, 'INVALID_TIMEZONE', 'Choose a valid IANA time zone.', { timezone: 'Choose a valid time zone.' });
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ''));
  if (!match) fail(400, 'INVALID_SCHEDULE', 'Enter a valid scheduled date and time.', { scheduledStartLocal: 'Enter a valid date and time.' });
  const target = { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5] };
  const naive = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const dateCheck = new Date(naive);
  if (dateCheck.getUTCFullYear() !== target.year || dateCheck.getUTCMonth() + 1 !== target.month || dateCheck.getUTCDate() !== target.day || target.hour > 23 || target.minute > 59) {
    fail(400, 'INVALID_SCHEDULE', 'Enter a valid scheduled date and time.', { scheduledStartLocal: 'Enter a valid date and time.' });
  }
  const candidates = new Set();
  for (const deltaHours of [-24, -18, -12, -6, 0, 6, 12, 18, 24]) {
    const sample = naive + deltaHours * 60 * 60 * 1000;
    const candidate = naive - offsetAt(sample, timezone);
    if (sameMinute(partsAt(candidate, timezone), target)) candidates.add(candidate);
  }
  if (!candidates.size) fail(400, 'NONEXISTENT_LOCAL_TIME', 'That local time does not exist because of a daylight-saving clock change. Choose another time.', { scheduledStartLocal: 'This local time does not exist in the selected time zone.' });
  return new Date(Math.min(...candidates)).toISOString();
}
export function formatZoned(iso, timezone) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone, timeZoneName: 'short' }).format(new Date(iso)); }
  catch { return new Date(iso).toISOString(); }
}
