import { latLngToCell } from './h3';

export function rescueCell(lat, lng, resolution = 8) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return latLngToCell(lat, lng, resolution);
}

export function pickupDeadline(value) {
  if (value == null) return null;
  const ms = typeof value.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function rescueOfferDeadline(pickup) {
  const destination = pickup?.destination_confirmation;
  const pickupBy = pickupDeadline(destination?.pickup_by ?? pickup?.pickup_window_until);
  const arrivalBy = pickupDeadline(destination?.arrival_by);
  return pickupBy === null || arrivalBy === null ? null : Math.min(pickupBy, arrivalBy);
}

export function groupRescueCells(pickups, resolution, now) {
  const cells = new Map();
  for (const pickup of pickups) {
    if (pickup.status !== 'available') continue;
    const deadline = pickup.destination_confirmation ? rescueOfferDeadline(pickup) : pickupDeadline(pickup.pickup_window_until);
    if (deadline !== null && deadline <= now) continue;
    const id = rescueCell(pickup.restaurant_lat, pickup.restaurant_lng, resolution);
    if (!id) continue;
    const cell = cells.get(id) || { id, pickups: [], closingSoon: 0 };
    cell.pickups.push(pickup);
    const latestStart = pickupDeadline(pickup.latest_safe_start_at) ?? deadline;
    if (latestStart !== null && latestStart - now <= 30 * 60_000) cell.closingSoon++;
    cells.set(id, cell);
  }
  return [...cells.values()];
}
