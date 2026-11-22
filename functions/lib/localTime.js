// Wall-clock helpers for IANA timezones (DST-aware). Shared by recurring
// donations, receiving-site hours and trip planning.

// Wall-clock parts of an instant in a timezone.
function zoned(atMs, timeZone = 'America/Chicago') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(atMs)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second,
    weekday: p.weekday.toLowerCase().slice(0, 3), date: `${p.year}-${p.month}-${p.day}` };
}

// The UTC instant of a local date + 'HH:MM' in a timezone.
function localToUtc(date, hhmm, timeZone = 'America/Chicago') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess, timeZone);
    guess += Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s);
  }
  return guess;
}

module.exports = { zoned, localToUtc };
