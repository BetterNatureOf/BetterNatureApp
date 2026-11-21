// Evaluates trusted road estimates for coordinator review. All times are
// epoch milliseconds and all durations are minutes. Missing operational
// data makes a candidate ineligible rather than an optimistic estimate.
const MINUTE = 60_000;

function evaluateRescue({ rescue, site, volunteer, travel, now }) {
  if (rescue.status !== 'available' || volunteer.chapterId !== rescue.chapterId ||
      site.chapterId !== rescue.chapterId || !site.approved ||
      volunteer.activeRescue || volunteer.eligible !== true) return { reason: 'not_assignable' };

  const deadlines = [now, rescue.readyAt, rescue.pickupBy, site.opensAt, site.closesAt, volunteer.availableUntil];
  const durations = [travel?.toPickup, travel?.toSite, rescue.loadingMinutes, site.unloadingMinutes, travel?.buffer];
  if (deadlines.some((value) => !Number.isFinite(value)) ||
      durations.some((value) => !Number.isFinite(value) || value < 0) ||
      !rescue.foodCategory || !Number.isInteger(rescue.packages) || rescue.packages < 1 ||
      !Number.isInteger(volunteer.packageCapacity) || volunteer.packageCapacity < 0 ||
      !Number.isFinite(rescue.weight) || rescue.weight <= 0 ||
      !Number.isFinite(volunteer.weightCapacity) || volunteer.weightCapacity < 0 ||
      !Array.isArray(rescue.requiredEquipment) ||
      !Array.isArray(rescue.transportModes) || !rescue.transportModes.length ||
      !Array.isArray(volunteer.equipment) || !Array.isArray(site.foodCategories) ||
      !Object.hasOwn(rescue, 'handlingMinutes') || !Object.hasOwn(site, 'remainingPackages')) {
    return { reason: 'missing_route_data' };
  }

  if (!site.foodCategories.includes(rescue.foodCategory) ||
      (site.remainingPackages !== null &&
        (!Number.isInteger(site.remainingPackages) || site.remainingPackages < rescue.packages))) {
    return { reason: 'site_cannot_accept' };
  }
  if (volunteer.packageCapacity < rescue.packages || volunteer.weightCapacity < rescue.weight ||
      !rescue.transportModes.includes(volunteer.transportMode) ||
      rescue.requiredEquipment.some((item) => !volunteer.equipment.includes(item))) {
    return { reason: 'cargo_requirements' };
  }
  if (rescue.handlingMinutes !== null &&
      (!Number.isFinite(rescue.handlingMinutes) || rescue.handlingMinutes <= 0)) {
    return { reason: 'missing_route_data' };
  }

  const arrivesPickupAt = now + travel.toPickup * MINUTE;
  const loadedAt = Math.max(arrivesPickupAt, rescue.readyAt) + rescue.loadingMinutes * MINUTE;
  if (loadedAt > rescue.pickupBy) return { reason: 'pickup_deadline' };

  const arrivesSiteAt = loadedAt + travel.toSite * MINUTE;
  const finishAt = Math.max(arrivesSiteAt, site.opensAt) + (site.unloadingMinutes + travel.buffer) * MINUTE;
  const handlingDeadline = rescue.handlingMinutes === null ? Infinity : loadedAt + rescue.handlingMinutes * MINUTE;
  const margin = Math.min(rescue.pickupBy - loadedAt, site.closesAt - finishAt,
    volunteer.availableUntil - finishAt, handlingDeadline - finishAt);
  if (margin < 0) return { reason: 'delivery_deadline' };

  return {
    finishAt,
    marginMinutes: margin / MINUTE,
    driveMinutes: travel.toPickup + travel.toSite,
    waitMinutes: (Math.max(rescue.readyAt - arrivesPickupAt, 0) + Math.max(site.opensAt - arrivesSiteAt, 0)) / MINUTE,
  };
}

// This ranks one approved site per rescue. It never claims a pickup or
// sends a notification. Reserve volunteers and site capacity in this
// suggestion batch so a coordinator doesn't get contradictory options.
function suggestRescues(candidates, now) {
  const rescues = new Map();
  for (const candidate of candidates) {
    const { rescue, site, volunteer } = candidate;
    const options = rescues.get(rescue.id) || { id: rescue.id, options: [], reasons: new Set() };
    const result = evaluateRescue({ ...candidate, now });
    if (result.reason) options.reasons.add(result.reason);
    else options.options.push({ rescue, site, volunteer, ...result });
    rescues.set(rescue.id, options);
  }

  const used = new Set();
  const reservedPackages = new Map();
  const suggestions = [];
  const needsCoverage = [];
  function remaining(option) {
    const { site, rescue, volunteer } = option;
    return !used.has(volunteer.id) && (site.remainingPackages === null ||
      (reservedPackages.get(site.id) || 0) + rescue.packages <= site.remainingPackages);
  }

  while (rescues.size) {
    const [next] = [...rescues.values()].map((route) => {
      const options = route.options.filter(remaining);
      return { ...route, options, urgency: Math.min(...options.map((option) => option.marginMinutes)) };
    }).sort((a, b) =>
      a.options.length - b.options.length || a.urgency - b.urgency || a.id.localeCompare(b.id)
    );
    rescues.delete(next.id);
    if (!next.options.length) {
      needsCoverage.push({ rescueId: next.id, reasons: next.reasons.size ? [...next.reasons] : ['no_remaining_match'] });
      continue;
    }
    next.options.sort((a, b) => b.marginMinutes - a.marginMinutes ||
      a.driveMinutes - b.driveMinutes || a.waitMinutes - b.waitMinutes ||
      (a.volunteer.recentOffers ?? 0) - (b.volunteer.recentOffers ?? 0) ||
      a.volunteer.id.localeCompare(b.volunteer.id));
    const { rescue, volunteer, site, finishAt, marginMinutes } = next.options[0];
    used.add(volunteer.id);
    reservedPackages.set(site.id, (reservedPackages.get(site.id) || 0) + rescue.packages);
    suggestions.push({ rescueId: rescue.id, volunteerId: volunteer.id, siteId: site.id, finishAt, marginMinutes });
  }

  return { suggestions, needsCoverage };
}

module.exports = { evaluateRescue, suggestRescues };

// Local shadow runs accept a JSON snapshot on stdin. No Firebase reads or
// writes are made and the output includes IDs and timings only.
if (require.main === module) {
  try {
    const { candidates, now } = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    if (!Array.isArray(candidates) || !Number.isFinite(now)) {
      throw new Error('Provide a candidates array and an epoch-millisecond now value.');
    }
    console.log(JSON.stringify(suggestRescues(candidates, now), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
