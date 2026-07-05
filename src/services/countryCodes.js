// Country name → ISO 3166-1 alpha-3 code normalization.
//
// The world choropleth and impact-map rollup both key on alpha-3
// codes (USA, IND, CHL, ...). When an exec types "India" or
// "United Kingdom" in Manage Chapters we want to accept the full
// name AND stamp the alpha-3 code on the doc so the map still
// works.
//
// Not exhaustive — covers the countries we're most likely to have
// chapters in plus common aliases. Add rows as needed; unknown
// inputs pass through unchanged so a manually-typed alpha-3 still
// lands correctly.

const MAP = {
  // Americas
  'united states':          'USA',
  'united states of america':'USA',
  'us':                     'USA',
  'usa':                    'USA',
  'canada':                 'CAN',
  'mexico':                 'MEX',
  'guatemala':              'GTM',
  'honduras':               'HND',
  'el salvador':            'SLV',
  'nicaragua':              'NIC',
  'costa rica':             'CRI',
  'panama':                 'PAN',
  'cuba':                   'CUB',
  'haiti':                  'HTI',
  'dominican republic':     'DOM',
  'jamaica':                'JAM',
  'colombia':               'COL',
  'venezuela':              'VEN',
  'ecuador':                'ECU',
  'peru':                   'PER',
  'brazil':                 'BRA',
  'chile':                  'CHL',
  'bolivia':                'BOL',
  'paraguay':               'PRY',
  'uruguay':                'URY',
  'argentina':              'ARG',
  // Europe
  'united kingdom':         'GBR',
  'uk':                     'GBR',
  'britain':                'GBR',
  'england':                'GBR',
  'ireland':                'IRL',
  'france':                 'FRA',
  'germany':                'DEU',
  'spain':                  'ESP',
  'portugal':               'PRT',
  'italy':                  'ITA',
  'netherlands':            'NLD',
  'belgium':                'BEL',
  'switzerland':            'CHE',
  'austria':                'AUT',
  'poland':                 'POL',
  'sweden':                 'SWE',
  'norway':                 'NOR',
  'denmark':                'DNK',
  'finland':                'FIN',
  'greece':                 'GRC',
  'ukraine':                'UKR',
  'russia':                 'RUS',
  // Africa
  'nigeria':                'NGA',
  'kenya':                  'KEN',
  'south africa':           'ZAF',
  'egypt':                  'EGY',
  'ethiopia':               'ETH',
  'morocco':                'MAR',
  'ghana':                  'GHA',
  'tanzania':               'TZA',
  'uganda':                 'UGA',
  'rwanda':                 'RWA',
  // Middle East
  'israel':                 'ISR',
  'saudi arabia':           'SAU',
  'united arab emirates':   'ARE',
  'uae':                    'ARE',
  'turkey':                 'TUR',
  'iran':                   'IRN',
  'iraq':                   'IRQ',
  'jordan':                 'JOR',
  'lebanon':                'LBN',
  'yemen':                  'YEM',
  // Asia
  'india':                  'IND',
  'pakistan':               'PAK',
  'bangladesh':             'BGD',
  'sri lanka':              'LKA',
  'nepal':                  'NPL',
  'china':                  'CHN',
  'japan':                  'JPN',
  'south korea':            'KOR',
  'korea':                  'KOR',
  'north korea':            'PRK',
  'vietnam':                'VNM',
  'thailand':               'THA',
  'malaysia':               'MYS',
  'singapore':              'SGP',
  'indonesia':              'IDN',
  'philippines':            'PHL',
  'cambodia':               'KHM',
  'laos':                   'LAO',
  'myanmar':                'MMR',
  'afghanistan':            'AFG',
  // Oceania
  'australia':              'AUS',
  'new zealand':            'NZL',
};

// Turn whatever the user typed into a { code, name } pair.
// - Empty/undefined → { code: '', name: '' }
// - A recognized full name ("India", "united kingdom", "USA") →
//   { code: 'IND', name: 'India' } (canonical display name)
// - A raw 3-letter code we don't map back → { code: 'XYZ', name: 'XYZ' }
// - Anything else → { code: uppercase first 3 letters, name: original }
export function normalizeCountry(input) {
  const raw = String(input || '').trim();
  if (!raw) return { code: '', name: '' };
  const lower = raw.toLowerCase();
  if (MAP[lower]) {
    // Prefer canonical display name from the key rather than what
    // the user typed so "united states of america" saves as
    // "United States".
    const code = MAP[lower];
    const canonicalDisplay = CODE_TO_DISPLAY[code] || raw;
    return { code, name: canonicalDisplay };
  }
  // Maybe they typed a raw ISO3 code.
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const code = raw.toUpperCase();
    return { code, name: CODE_TO_DISPLAY[code] || code };
  }
  // Unknown — best-effort code from the first 3 chars, keep the
  // typed name for display.
  return { code: raw.slice(0, 3).toUpperCase(), name: raw };
}

// Reverse lookup — friendly display name for a stored code. Built
// lazily from MAP.
const CODE_TO_DISPLAY = (() => {
  const out = {};
  for (const [name, code] of Object.entries(MAP)) {
    // Prefer the shortest canonical name per code
    if (!out[code] || name.length < out[code].length) {
      out[code] = name.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return out;
})();
