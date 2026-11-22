// Plain-language summaries of a receiving site for coordinators.
// Mirrors the hours logic in functions/receivingSites.js (site-local time).
import { categoryOf } from '../../functions/lib/rescueCargo';

export const SITE_TYPES = {
  staffed_center: 'Staffed center',
  steward_fridge: 'Community fridge (steward)',
  outreach_partner: 'Outreach partner',
};
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function local(atMs, timeZone = 'America/Chicago') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(atMs)).map((x) => [x.type, x.value]));
  return { day: p.weekday.toLowerCase().slice(0, 3), minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

export function siteOpenAt(site, atMs) {
  if (!site?.hours) return null;
  const { day, minutes } = local(atMs, site.timezone);
  return (site.hours[day] || []).some((s) => minutes >= toMin(s.open) && minutes < toMin(s.close));
}

function hoursText(site) {
  if (!site.hours) return 'Hours unknown';
  const days = DAY_KEYS.filter((d) => site.hours[d]?.length);
  if (!days.length) return 'Hours unknown';
  const slot = site.hours[days[0]][0];
  const label = (d) => d[0].toUpperCase() + d.slice(1);
  const span = days.length > 2 && DAY_KEYS.indexOf(days.at(-1)) - DAY_KEYS.indexOf(days[0]) === days.length - 1
    ? `${label(days[0])}–${label(days.at(-1))}` : days.map(label).join(', ');
  return `${span} ${slot.open}–${slot.close}`;
}

export function describeSiteNow(site, now = Date.now()) {
  const paused = site.status === 'paused' && !(site.paused_until?.toMillis?.() <= now);
  const open = siteOpenAt(site, now);
  const cap = site.capacity || {};
  const capText = [cap.packages_per_day ? `${cap.packages_per_day} items/day` : null,
    cap.weight_lbs_per_day ? `${cap.weight_lbs_per_day} lb/day` : null].filter(Boolean).join(' · ') || 'No daily limit set';
  const foods = site.food_categories?.length ? site.food_categories.map((k) => categoryOf(k)?.label || k).join(', ') : 'Accepted food not listed';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone || 'America/Chicago' }).format(new Date(now));
  const closedToday = (site.closures || []).some((c) => c.date === today);
  const upcoming = (site.closures || []).filter((c) => c.date > today).map((c) => c.date).sort().slice(0, 2);
  const storage = site.storage?.length ? `Storage: ${site.storage.join(', ').replace('hot_holding', 'hot holding')}` : 'Storage not listed';
  return {
    label: paused ? 'Paused' : closedToday ? 'Closed today' : open === null ? 'Hours unknown' : open ? 'Open now' : 'Closed now',
    tone: paused || closedToday || open === false ? 'warn' : 'ok',
    detail: `${hoursText(site)} · ${capText} · ${foods} · ${storage}${upcoming.length ? ` · Closed ${upcoming.join(', ')}` : ''}`,
  };
}
