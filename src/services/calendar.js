// Calendar export helper. Generates an RFC 5545 .ics file in memory
// and either downloads it (web) or opens the device share sheet
// (native, via expo-sharing if available — we degrade to a copy of
// the raw text into the OS share menu otherwise).
//
// Used by EventDetailScreen so volunteers can drop the event on
// their personal calendar in one tap after RSVPing.
import { Platform, Share, Linking } from 'react-native';

function pad(n) { return n < 10 ? `0${n}` : String(n); }

function toIcsDate(date) {
  const d = new Date(date);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  );
}

function escapeIcs(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function eventToIcs(event) {
  // Pick a sensible start/end. Events in our schema can carry either
  // ISO timestamps or a date + time string; fall back to the date if
  // there's no explicit start. Default duration is 2 hours.
  const startStr = event.starts_at || event.start || event.date;
  const start = startStr ? new Date(startStr) : new Date();
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const uid = `${event.id || Math.random().toString(36).slice(2)}@betternatureofficial.org`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BetterNature//Events//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.title || 'BetterNature event')}`,
    event.location ? `LOCATION:${escapeIcs(event.location)}` : null,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

export async function exportEventToCalendar(event) {
  const ics = eventToIcs(event);
  const filename = `${(event.title || 'betternature-event').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'event'}.ics`;

  if (Platform.OS === 'web') {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a);
    a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  // Native: open the device share sheet with the raw ics. iOS Calendar
  // and Google Calendar both accept this; if neither is installed the
  // user gets the text and can save manually.
  try {
    await Share.share({ message: ics, title: filename });
  } catch {
    // Last-ditch fallback — open the calendar's URL scheme.
    Linking.openURL(`data:text/calendar;base64,${global.btoa ? global.btoa(ics) : ics}`).catch(() => {});
  }
}
