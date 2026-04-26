// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — IMPACT MAP DATA
//  One dataset, two consumers: the website Leaflet map and the Expo app.
//
//  Each point: { kind, city, state, lat, lng, ...stats }
//  kind: 'chapter' | 'gap' | 'partner' | 'planting' | 'cleanup'
//
//  'gap' = high food insecurity AND no chapter within ~80mi. These are the
//  cities we're recruiting for — every gap pin becomes a "Start a chapter"
//  call to action. That's the twist: the map isn't a brag sheet, it's a
//  recruiting tool.
// ═══════════════════════════════════════════════════════════════════════════

window.IMPACT_MAP = {
  // Toggleable layers — the UI generates pills from this
  layers: [
    { key: 'chapter',  label: 'Chapters',        color: '#1B3A2D', icon: '◆', defaultOn: true },
    { key: 'gap',      label: 'The Gap',         color: '#FF4D8D', icon: '✱', defaultOn: true },
    { key: 'partner',  label: 'Partner kitchens',color: '#D4A017', icon: '●', defaultOn: true },
    { key: 'planting', label: 'Tree plantings',  color: '#2E7D32', icon: '▲', defaultOn: true },
    { key: 'cleanup',  label: 'Water cleanups',  color: '#1E88E5', icon: '~', defaultOn: true },
  ],

  // Copy
  copy: {
    eyebrow: 'Where we work. Where we don\'t.',
    title: 'The impact map.',
    body: 'Every green pin is a living chapter. Every pink pin is a city where 1 in 6 people are food insecure — and we haven\'t shown up yet. That\'s the gap. Click any pin to see the story, meet the team, or start your own chapter.',
  },

  points: [
    // ── CHAPTERS (chapterIndex references chapters.featured order in content.js)
    { kind: 'chapter', city: 'Memphis',   state: 'TN', lat: 35.1495, lng: -90.0490, members: 80, meals: 412000, trees: 3400, gallons: 28000, chapterIndex: 0 },
    { kind: 'chapter', city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816, members: 42, meals: 186000, trees: 1240, gallons:  9500, chapterIndex: 1 },
    { kind: 'chapter', city: 'Atlanta',   state: 'GA', lat: 33.7490, lng: -84.3880, members: 56, meals: 241000, trees: 1820, gallons: 11200, chapterIndex: 2 },
    { kind: 'chapter', city: 'Austin',    state: 'TX', lat: 30.2672, lng: -97.7431, members: 38, meals: 148000, trees:  980, gallons:  7600, chapterIndex: 3 },
    { kind: 'chapter', city: 'Chicago',   state: 'IL', lat: 41.8781, lng: -87.6298, members: 64, meals: 312000, trees: 2100, gallons: 18400, chapterIndex: 4 },
    { kind: 'chapter', city: 'Brooklyn',  state: 'NY', lat: 40.6782, lng: -73.9442, members: 72, meals: 356000, trees: 3100, gallons: 22100, chapterIndex: 5 },

    // ── THE GAP — high insecurity, no chapter yet. These drive recruitment.
    { kind: 'gap', city: 'Detroit',       state: 'MI', lat: 42.3314, lng: -83.0458, insecurity: 21.4, population: 639000 },
    { kind: 'gap', city: 'Cleveland',     state: 'OH', lat: 41.4993, lng: -81.6944, insecurity: 20.8, population: 372000 },
    { kind: 'gap', city: 'Baltimore',     state: 'MD', lat: 39.2904, lng: -76.6122, insecurity: 19.2, population: 585000 },
    { kind: 'gap', city: 'Milwaukee',     state: 'WI', lat: 43.0389, lng: -87.9065, insecurity: 18.7, population: 577000 },
    { kind: 'gap', city: 'St. Louis',     state: 'MO', lat: 38.6270, lng: -90.1994, insecurity: 19.9, population: 301000 },
    { kind: 'gap', city: 'Jackson',       state: 'MS', lat: 32.2988, lng: -90.1848, insecurity: 23.1, population: 150000 },
    { kind: 'gap', city: 'Birmingham',    state: 'AL', lat: 33.5186, lng: -86.8104, insecurity: 21.6, population: 200000 },
    { kind: 'gap', city: 'Fresno',        state: 'CA', lat: 36.7378, lng: -119.7871,insecurity: 17.3, population: 542000 },
    { kind: 'gap', city: 'Albuquerque',   state: 'NM', lat: 35.0844, lng: -106.6504,insecurity: 16.9, population: 564000 },
    { kind: 'gap', city: 'Philadelphia',  state: 'PA', lat: 39.9526, lng: -75.1652, insecurity: 18.4, population:1584000 },
    { kind: 'gap', city: 'New Orleans',   state: 'LA', lat: 29.9511, lng: -90.0715, insecurity: 22.3, population: 383000 },
    { kind: 'gap', city: 'Tucson',        state: 'AZ', lat: 32.2226, lng: -110.9747,insecurity: 15.8, population: 542000 },

    // ── PARTNER KITCHENS (placeholders; replace with real partners)
    { kind: 'partner', city: 'Memphis',   state: 'TN', lat: 35.1395, lng: -90.0390, name: 'Sample Bistro',          meals: 18400 },
    { kind: 'partner', city: 'Memphis',   state: 'TN', lat: 35.1590, lng: -90.0650, name: 'Sample Co-op',           meals:  9200 },
    { kind: 'partner', city: 'Atlanta',   state: 'GA', lat: 33.7600, lng: -84.3980, name: 'Sample Grocer',          meals: 12800 },
    { kind: 'partner', city: 'Brooklyn',  state: 'NY', lat: 40.6882, lng: -73.9542, name: 'Sample Deli',            meals: 15600 },
    { kind: 'partner', city: 'Chicago',   state: 'IL', lat: 41.8881, lng: -87.6398, name: 'Sample Bakery',          meals:  7400 },

    // ── TREE PLANTINGS
    { kind: 'planting', city: 'Memphis',   state: 'TN', lat: 35.1590, lng: -90.0290, site: 'Overton Park',           trees: 1240, date: '2026-04-12' },
    { kind: 'planting', city: 'Memphis',   state: 'TN', lat: 35.0895, lng: -89.9890, site: 'South Memphis Canopy',   trees:  680, date: '2026-03-08' },
    { kind: 'planting', city: 'Atlanta',   state: 'GA', lat: 33.7720, lng: -84.3720, site: 'Piedmont Park',          trees:  940, date: '2026-02-15' },
    { kind: 'planting', city: 'Chicago',   state: 'IL', lat: 41.8881, lng: -87.6098, site: 'Humboldt Park',          trees: 1100, date: '2026-01-21' },

    // ── WATER CLEANUPS
    { kind: 'cleanup', city: 'Memphis',   state: 'TN', lat: 35.1890, lng: -90.0190, site: 'Wolf River',              gallons: 12400, date: '2026-04-05' },
    { kind: 'cleanup', city: 'Brooklyn',  state: 'NY', lat: 40.6982, lng: -73.9342, site: 'Gowanus Canal cleanup',   gallons:  8600, date: '2026-03-22' },
    { kind: 'cleanup', city: 'Austin',    state: 'TX', lat: 30.2772, lng: -97.7531, site: 'Lady Bird Lake',          gallons:  5200, date: '2026-02-08' },
  ],
};
