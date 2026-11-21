// Reconciles a volunteer's impact from the activity ledger, counting each
// underlying activity once, and explains how it differs from the running
// totals on their profile (which older app versions incremented directly
// and which may overlap or predate the ledger). Profile totals are never
// added on top of ledger totals.
//
// Inputs:
//   profile:  users/{uid} fields (lbs_rescued, meals_rescued, hours_logged,
//             events_attended, pickups_completed)
//   activity: member_activity rows [{ id, source_type, source_id, lbs, meals, hours, events, voided }]
//   manual:   users/{uid}/manual_volunteer_work entries [{ id, minutes, voided }]

const round = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function keyFor(row) {
  switch (row.source_type) {
    case 'pickup_complete': return `pickup:${row.source_id}`;
    case 'pickup_spoiled': return `pickup:${row.source_id}`;
    case 'event_checkin': return `event:${row.source_id}`;
    default: return `${row.source_type || 'other'}:${row.source_id || row.id}`;
  }
}

function reconcile({ profile = {}, activity = [], manual = [] }) {
  const seen = new Map();
  const audit = { duplicates: [], voided: [], excluded: [] };
  const deliveries = { count: 0, lbs: 0, meals: 0, hours: 0 };
  const events = { count: 0, meals: 0, hours: 0 };
  const other = { count: 0, hours: 0 };

  // Deterministic order so the same row always wins a duplicate pair.
  for (const row of [...activity].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (row.voided) { audit.voided.push({ id: row.id, source: keyFor(row) }); continue; }
    const key = keyFor(row);
    if (seen.has(key)) { audit.duplicates.push({ id: row.id, duplicate_of: seen.get(key), source: key }); continue; }
    seen.set(key, row.id);
    if (row.source_type === 'pickup_complete') {
      deliveries.count += 1; deliveries.lbs += num(row.lbs); deliveries.meals += num(row.meals); deliveries.hours += num(row.hours);
    } else if (row.source_type === 'event_checkin') {
      events.count += 1; events.meals += num(row.meals); events.hours += num(row.hours);
    } else if (row.source_type === 'pickup_spoiled' || row.source_type === 'pickup_release' || row.source_type === 'pickup_dropped') {
      audit.excluded.push({ id: row.id, source: key, reason: row.source_type === 'pickup_spoiled' ? 'spoiled, no impact' : 'release, points only' });
    } else if (num(row.hours) > 0) {
      other.count += 1; other.hours += num(row.hours);
    }
  }
  const manualHours = { count: 0, hours: 0 };
  for (const entry of manual) {
    if (entry.voided) { audit.voided.push({ id: entry.id, source: 'manual' }); continue; }
    manualHours.count += 1; manualHours.hours += num(entry.minutes) / 60;
  }

  const verified = {
    lbs: round(deliveries.lbs), meals: Math.round(deliveries.meals + events.meals),
    hours: round(deliveries.hours + events.hours + manualHours.hours + other.hours),
    deliveries: deliveries.count, events: events.count,
  };
  // What the profile counters are supposed to mirror (they never include manual work).
  const comparable = {
    lbs_rescued: deliveries.lbs, meals_rescued: deliveries.meals + events.meals,
    hours_logged: deliveries.hours + events.hours + other.hours,
    events_attended: deliveries.count + events.count, pickups_completed: deliveries.count,
  };
  const differences = [];
  for (const [field, ledgerValue] of Object.entries(comparable)) {
    const profileValue = num(profile[field]);
    const diff = round(profileValue - ledgerValue);
    if (Math.abs(diff) < 0.01) continue;
    differences.push({
      field, profile: round(profileValue), ledger: round(ledgerValue), difference: diff,
      explanation: diff > 0
        ? 'The profile counter is higher than the activity on record — likely work logged before the activity ledger, or a double count. Not included in verified totals.'
        : 'The activity on record is higher than the profile counter — the counter missed some recorded work. Verified totals use the activity.',
    });
  }
  return {
    verified,
    breakdown: { deliveries: { ...deliveries, lbs: round(deliveries.lbs), hours: round(deliveries.hours) },
      events: { ...events, hours: round(events.hours) }, manual: { ...manualHours, hours: round(manualHours.hours) },
      other: { ...other, hours: round(other.hours) } },
    differences,
    audit,
  };
}

// Chapter roll-up: verified totals add up; differences are listed per
// member so nobody's legacy counter is silently folded in.
function rollUp(members) {
  const totals = { lbs: 0, meals: 0, hours: 0, deliveries: 0, events: 0 };
  const flagged = [];
  for (const m of members) {
    for (const k of Object.keys(totals)) totals[k] += num(m.result.verified[k]);
    if (m.result.differences.length || m.result.audit.duplicates.length) {
      flagged.push({ id: m.id, name: m.name, differences: m.result.differences, duplicates: m.result.audit.duplicates.length });
    }
  }
  return { totals: { ...totals, lbs: round(totals.lbs), hours: round(totals.hours) }, members: members.length, flagged };
}

module.exports = { reconcile, rollUp, keyFor };
