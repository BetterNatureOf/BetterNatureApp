// Food-insecurity rate by US state, with a tilegram-style hex layout
// so we can render every state as an equal-size cell in roughly its
// geographic position. Sources:
//   - Insecurity rates: Feeding America's "Map the Meal Gap" 2022
//     (statewide percentage of people experiencing food insecurity)
//   - Tilegram layout: simplified from the NPR / Wall Street Journal
//     hex layouts commonly used for US state choropleths.
//
// Coordinate system: (col, row) where col grows east and row grows
// south. Empty cells are gaps in the hex grid (e.g. Atlantic/Pacific).
//
// Honest data: I'm not auto-fetching this. If you want fresher rates,
// drop in the latest CSV and re-run the import.

export const STATES = [
  // West
  { code: 'AK', name: 'Alaska',         rate: 14.5, col: 0,  row: 0  },
  { code: 'WA', name: 'Washington',     rate: 10.7, col: 1,  row: 1  },
  { code: 'OR', name: 'Oregon',         rate: 11.0, col: 1,  row: 2  },
  { code: 'CA', name: 'California',     rate:  9.7, col: 1,  row: 3  },
  { code: 'HI', name: 'Hawaii',         rate: 10.5, col: 0,  row: 5  },

  // Mountain
  { code: 'ID', name: 'Idaho',          rate: 11.6, col: 2,  row: 1  },
  { code: 'MT', name: 'Montana',        rate: 12.0, col: 3,  row: 1  },
  { code: 'WY', name: 'Wyoming',        rate:  9.4, col: 3,  row: 2  },
  { code: 'NV', name: 'Nevada',         rate: 11.3, col: 2,  row: 2  },
  { code: 'UT', name: 'Utah',           rate:  9.6, col: 2,  row: 3  },
  { code: 'CO', name: 'Colorado',       rate: 10.0, col: 3,  row: 3  },
  { code: 'AZ', name: 'Arizona',        rate: 13.0, col: 2,  row: 4  },
  { code: 'NM', name: 'New Mexico',     rate: 14.6, col: 3,  row: 4  },

  // Plains
  { code: 'ND', name: 'North Dakota',   rate:  9.0, col: 4,  row: 1  },
  { code: 'SD', name: 'South Dakota',   rate: 11.0, col: 4,  row: 2  },
  { code: 'NE', name: 'Nebraska',       rate: 10.0, col: 4,  row: 3  },
  { code: 'KS', name: 'Kansas',         rate: 11.5, col: 4,  row: 4  },
  { code: 'OK', name: 'Oklahoma',       rate: 16.0, col: 4,  row: 5  },
  { code: 'TX', name: 'Texas',          rate: 14.0, col: 4,  row: 6  },

  // Midwest
  { code: 'MN', name: 'Minnesota',      rate:  8.7, col: 5,  row: 1  },
  { code: 'IA', name: 'Iowa',           rate:  9.9, col: 5,  row: 3  },
  { code: 'MO', name: 'Missouri',       rate: 13.0, col: 5,  row: 4  },
  { code: 'AR', name: 'Arkansas',       rate: 17.2, col: 5,  row: 5  },
  { code: 'LA', name: 'Louisiana',      rate: 18.6, col: 5,  row: 6  },

  { code: 'WI', name: 'Wisconsin',      rate:  9.6, col: 6,  row: 2  },
  { code: 'IL', name: 'Illinois',       rate: 11.7, col: 6,  row: 3  },
  { code: 'MS', name: 'Mississippi',    rate: 19.5, col: 6,  row: 5  },

  { code: 'MI', name: 'Michigan',       rate: 12.8, col: 7,  row: 2  },
  { code: 'IN', name: 'Indiana',        rate: 13.0, col: 7,  row: 3  },
  { code: 'TN', name: 'Tennessee',      rate: 13.7, col: 7,  row: 4  },
  { code: 'AL', name: 'Alabama',        rate: 16.5, col: 7,  row: 5  },

  { code: 'OH', name: 'Ohio',           rate: 13.7, col: 8,  row: 3  },
  { code: 'KY', name: 'Kentucky',       rate: 14.2, col: 8,  row: 4  },
  { code: 'GA', name: 'Georgia',        rate: 13.6, col: 8,  row: 5  },
  { code: 'FL', name: 'Florida',        rate: 13.6, col: 9,  row: 6  },

  // East
  { code: 'WV', name: 'West Virginia',  rate: 14.0, col: 9,  row: 4  },
  { code: 'VA', name: 'Virginia',       rate:  9.8, col: 9,  row: 4 },
  { code: 'NC', name: 'North Carolina', rate: 13.6, col: 9,  row: 5  },
  { code: 'SC', name: 'South Carolina', rate: 13.7, col: 10, row: 5  },

  { code: 'PA', name: 'Pennsylvania',   rate: 11.2, col: 9,  row: 3  },
  { code: 'MD', name: 'Maryland',       rate: 11.6, col: 10, row: 4  },
  { code: 'DE', name: 'Delaware',       rate: 12.5, col: 11, row: 4  },
  { code: 'DC', name: 'D.C.',           rate: 12.5, col: 10, row: 4.5 },

  { code: 'NJ', name: 'New Jersey',     rate:  9.5, col: 11, row: 3  },
  { code: 'NY', name: 'New York',       rate: 11.5, col: 10, row: 2  },
  { code: 'CT', name: 'Connecticut',    rate: 11.3, col: 11, row: 2  },
  { code: 'RI', name: 'Rhode Island',   rate: 11.4, col: 12, row: 2  },
  { code: 'MA', name: 'Massachusetts',  rate:  9.6, col: 11, row: 1  },
  { code: 'NH', name: 'New Hampshire',  rate:  9.6, col: 10, row: 1  },
  { code: 'VT', name: 'Vermont',        rate: 10.2, col:  9, row: 1  },
  { code: 'ME', name: 'Maine',          rate: 12.6, col: 12, row: 0  },
];

// Quick lookups
export const STATE_BY_CODE = STATES.reduce((m, s) => { m[s.code] = s; return m; }, {});

// Color ramp: light cream → deep BetterNature pink as rate climbs.
// Hand-tuned breakpoints so the visual map is readable at a glance:
// anything ≥15% reads as "high priority". Tweak in one place.
export function colorForRate(rate) {
  if (rate == null) return '#E9E4D4';
  if (rate >= 18) return '#9D174D';     // deepest pink
  if (rate >= 15) return '#DB2777';
  if (rate >= 13) return '#EC4899';
  if (rate >= 11) return '#F472B6';
  if (rate >=  9) return '#FBCFE8';
  return '#FDF2F8';
}

// Top-N most insecure for the "where the gap is" rail.
export function topInsecure(n = 10) {
  return [...STATES].sort((a, b) => b.rate - a.rate).slice(0, n);
}
