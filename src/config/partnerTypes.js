// Partner (food donor) types. Every /restaurants doc stores a
// `partner_type` field so the UI can adapt labels + copy to what
// the partner actually is. A church with a community garden should
// never see "Restaurant Dashboard" or "your restaurant" in any
// message — it feels off and hurts trust with the org.
//
// The identifier stays 'restaurants' at the collection level (too
// many downstream reads to rename) but everything user-facing keys
// off partner_type.

export const PARTNER_TYPES = [
  {
    key: 'restaurant',
    label: 'Restaurant',
    // singular / plural / possessive forms so we can compose copy
    // without conditionals at every callsite.
    singular: 'restaurant',
    plural:   'restaurants',
    possessive: 'restaurant',
    dashboard: 'Restaurant Dashboard',
    icon: '🍽',
  },
  {
    key: 'church',
    label: 'Church / place of worship',
    singular: 'church',
    plural: 'churches',
    possessive: 'church',
    dashboard: 'Church Dashboard',
    icon: '⛪',
  },
  {
    key: 'community_garden',
    label: 'Community garden',
    singular: 'community garden',
    plural: 'community gardens',
    possessive: 'garden',
    dashboard: 'Community Garden Dashboard',
    icon: '🌱',
  },
  {
    key: 'school',
    label: 'School / university kitchen',
    singular: 'school kitchen',
    plural: 'school kitchens',
    possessive: 'school',
    dashboard: 'School Dashboard',
    icon: '🏫',
  },
  {
    key: 'grocer',
    label: 'Grocer / market',
    singular: 'grocer',
    plural: 'grocers',
    possessive: 'grocery',
    dashboard: 'Grocer Dashboard',
    icon: '🛒',
  },
  {
    key: 'cafe',
    label: 'Café / bakery',
    singular: 'café',
    plural: 'cafés',
    possessive: 'café',
    dashboard: 'Café Dashboard',
    icon: '☕',
  },
  {
    key: 'caterer',
    label: 'Caterer',
    singular: 'catering business',
    plural: 'caterers',
    possessive: 'catering',
    dashboard: 'Catering Dashboard',
    icon: '🥘',
  },
  {
    key: 'corporate_kitchen',
    label: 'Corporate kitchen',
    singular: 'corporate kitchen',
    plural: 'corporate kitchens',
    possessive: 'kitchen',
    dashboard: 'Kitchen Dashboard',
    icon: '🏢',
  },
  {
    key: 'food_bank',
    label: 'Food bank / pantry',
    singular: 'food bank',
    plural: 'food banks',
    possessive: 'food bank',
    dashboard: 'Food Bank Dashboard',
    icon: '📦',
  },
  {
    key: 'hotel',
    label: 'Hotel',
    singular: 'hotel',
    plural: 'hotels',
    possessive: 'hotel',
    dashboard: 'Hotel Dashboard',
    icon: '🏨',
  },
  {
    key: 'other',
    label: 'Other partner',
    singular: 'organization',
    plural: 'partners',
    possessive: 'organization',
    dashboard: 'Partner Dashboard',
    icon: '🤝',
  },
];

// Everywhere we don't know the type yet, fall back to 'other' so
// copy reads as neutral ("your organization", "Partner Dashboard").
const OTHER = PARTNER_TYPES.find((t) => t.key === 'other');

export function partnerTypeFor(key) {
  if (!key) return OTHER;
  return PARTNER_TYPES.find((t) => t.key === key) || OTHER;
}

// Convenience — the display label used on tabs, table columns, etc.
export function partnerTypeLabel(key) {
  return partnerTypeFor(key).label;
}

// Convenience for tax receipts + generic org-facing copy — reads
// "your restaurant" / "your church" / "your organization".
export function possessiveFor(user) {
  const key = user?.partner_type || user?.restaurant_type;
  return `your ${partnerTypeFor(key).possessive}`;
}
