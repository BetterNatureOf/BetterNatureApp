// What a rescue needs to carry and what a volunteer can carry.
// Shared by the app (src/ imports this CommonJS module, like
// pickupEligibility) and by Cloud Functions (dispatch filtering,
// coordinator suggestions, rescueMatching).
//
// Missing data is reported as `unknown`, never guessed as a fit.

const FOOD_CATEGORIES = [
  { key: 'prepared_hot', label: 'Hot prepared food', equipment: ['insulated_bags'] },
  { key: 'prepared_cold', label: 'Cold prepared food', equipment: ['cooler'] },
  { key: 'produce', label: 'Produce', equipment: [] },
  { key: 'bakery', label: 'Bread & bakery', equipment: [] },
  { key: 'dairy', label: 'Dairy & eggs', equipment: ['cooler'] },
  { key: 'meat', label: 'Meat & fish', equipment: ['cooler'] },
  { key: 'packaged', label: 'Packaged / shelf-stable', equipment: [] },
  { key: 'mixed', label: 'Mixed', equipment: ['cooler'] },
];

const EQUIPMENT = [
  { key: 'cooler', label: 'Cooler or ice packs' },
  { key: 'insulated_bags', label: 'Insulated bags' },
  { key: 'hand_truck', label: 'Hand truck or dolly' },
];

// Defaults are only suggestions in the form; the saved numbers are what count.
const VEHICLES = [
  { key: 'car', label: 'Car', packages: 6, weight: 150 },
  { key: 'suv', label: 'SUV / hatchback', packages: 12, weight: 300 },
  { key: 'van', label: 'Van / pickup truck', packages: 30, weight: 800 },
  { key: 'bike', label: 'Bike / cargo bike', packages: 2, weight: 25 },
  { key: 'walk', label: 'On foot', packages: 1, weight: 15 },
];
const MOTOR = ['car', 'suv', 'van'];
const BIKE_MAX_LBS = 25;
const WALK_MAX_LBS = 15;
// Heavier loads need a hand truck regardless of vehicle.
const HAND_TRUCK_LBS = 150;

const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : null);
const posNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function categoryOf(key) { return FOOD_CATEGORIES.find((c) => c.key === key) || null; }

// What the rescue needs. Fields stay null when the donor didn't say.
function rescueCargo(pickup) {
  const weight = posNum(Number(pickup?.estimated_weight_lbs));
  const category = categoryOf(pickup?.food_category);
  const equipment = new Set(category ? category.equipment : []);
  if (weight && weight >= HAND_TRUCK_LBS) equipment.add('hand_truck');
  const modes = [...MOTOR];
  if (weight && weight <= BIKE_MAX_LBS) modes.push('bike');
  if (weight && weight <= WALK_MAX_LBS) modes.push('walk');
  return {
    weight,
    packages: posInt(Number(pickup?.packages)),
    foodCategory: category ? category.key : null,
    requiredEquipment: [...equipment].sort(),
    transportModes: modes,
  };
}

// What the volunteer can carry, from users/{uid}.vehicle.
function volunteerCargo(user) {
  const v = user?.vehicle || {};
  return {
    transportMode: VEHICLES.some((x) => x.key === v.type) ? v.type : null,
    packageCapacity: posInt(v.package_capacity),
    weightCapacity: posNum(v.weight_capacity_lbs),
    equipment: Array.isArray(v.equipment) ? v.equipment.filter((e) => EQUIPMENT.some((x) => x.key === e)) : null,
  };
}

// fits | does_not_fit | unknown, with the specific gaps either way.
function cargoFit(pickup, user) {
  const r = rescueCargo(pickup);
  const v = volunteerCargo(user);
  const problems = [];
  const unknown = [];
  if (!v.transportMode) unknown.push('vehicle');
  else if (!r.transportModes.includes(v.transportMode)) problems.push('vehicle');
  if (r.weight == null) unknown.push('rescue_weight');
  else if (v.weightCapacity == null) unknown.push('weight_capacity');
  else if (v.weightCapacity < r.weight) problems.push('weight');
  if (r.packages == null) unknown.push('rescue_packages');
  else if (v.packageCapacity == null) unknown.push('package_capacity');
  else if (v.packageCapacity < r.packages) problems.push('packages');
  if (r.foodCategory == null) unknown.push('food_category');
  if (r.requiredEquipment.length) {
    if (v.equipment == null) unknown.push('equipment');
    else {
      const missing = r.requiredEquipment.filter((e) => !v.equipment.includes(e));
      if (missing.length) problems.push(...missing.map((e) => `equipment:${e}`));
    }
  }
  return { status: problems.length ? 'does_not_fit' : unknown.length ? 'unknown' : 'fits', problems, unknown };
}

const FIT_TEXT = {
  vehicle: 'this load needs a car, SUV or van',
  weight: 'more weight than your vehicle carries',
  packages: 'more packages than you have room for',
  'equipment:cooler': 'needs a cooler',
  'equipment:insulated_bags': 'needs insulated bags',
  'equipment:hand_truck': 'needs a hand truck',
};
function describeFit(fit) {
  if (fit.status === 'fits') return 'Fits your vehicle';
  if (fit.status === 'does_not_fit') return `Doesn't fit: ${fit.problems.map((p) => FIT_TEXT[p] || p).join(', ')}`;
  const own = fit.unknown.filter((u) => ['vehicle', 'weight_capacity', 'package_capacity', 'equipment'].includes(u));
  return own.length ? 'Add your vehicle details to check the fit' : 'Load details missing — check with the donor';
}

module.exports = {
  FOOD_CATEGORIES, EQUIPMENT, VEHICLES, HAND_TRUCK_LBS,
  rescueCargo, volunteerCargo, cargoFit, describeFit, categoryOf,
};
