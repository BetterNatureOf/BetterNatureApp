// Default site content — mirrors website/content.js so the in-app
// editor (WebsiteContent.js) shows the live homepage values as the
// starting point instead of empty fields.
//
// Edit → Save in the editor writes the user's overrides to
// Firestore (site_content/main). Both the marketing site and the
// app then deep-merge that doc over these defaults.
//
// Keep these aligned with website/content.js so the editor's
// starting state matches what visitors actually see.
export const DEFAULT_SITE_CONTENT = {
  sections: {
    mission: true, impact: true, programs: true, bnmap: true,
    how: true, chapters: true, partners: true, testimonials: true, team: true,
    events: true, press: true, donate: true, getapp: true, signup: true,
  },
  hero: {
    eyebrow: 'Food rescue · Reforestation · Waterways',
    headline: 'Feed people. Plant forests.',
    headlineItalic: 'Protect the water.',
    subhead: "BetterNature is a youth-led nonprofit rescuing surplus food, planting native trees, and cleaning the waterways that communities depend on — three programs, one mission.",
    primaryCta:   { text: 'Read our mission',       href: '#mission' },
    secondaryCta: { text: 'Partner your business',  href: '#signup'  },
    tickerStats: [
      { value: '2,780 lbs',   label: 'food rescued' },
      { value: '6,963',       label: 'individuals served' },
      { value: '10,564 lbs',  label: 'CO₂ avoided' },
      { value: '486,500 gal', label: 'water footprint reduced' },
    ],
  },
  impact: {
    eyebrow: 'The receipts',
    title: 'Real numbers. Real neighbors. Real forests.',
    stats: [
      { value: '2,780',   label: 'Pounds of food rescued', sublabel: 'Direct from partner kitchens to recipients' },
      { value: '6,963',   label: 'Individuals served',     sublabel: 'Across our active chapters' },
      { value: '10,564',  label: 'Pounds of CO₂ avoided',  sublabel: 'Emissions prevented by diverting food from landfills' },
      { value: '486,500', label: 'Gallons of water saved', sublabel: 'Embedded water footprint of the food we rescued' },
      { value: '6',       label: 'Chapters worldwide',     sublabel: 'Memphis, Santiago, Valparaíso, Guatemala City, Cuenca, Montevideo' },
    ],
  },
  chapters: {
    eyebrow: 'Find your chapter',
    title: 'Founded in Memphis. Now on three continents.',
    body: "Don't see your city? Start a chapter. We give you the playbook, the insurance, the partner introductions, and the onboarding — you give us the weekends.",
    startChapterUrl: '#signup',
  },
  programs: {
    eyebrow: 'Three programs. One mission.',
    title: 'How we work.',
    items: [
      {
        key: 'iris',
        code: '01 — IRIS',
        title: 'Food rescue.',
        blurb: 'Restaurant surplus, same-day pickup, direct delivery to shelters, community fridges, and families on our recipient list. Free for partners. Tax-deductible. Weighed, logged, reported.',
        stat: '',
        stats: [
          { value: '0',     label: 'meal kits delivered' },
          { value: '0 lbs', label: 'food rescued' },
          { value: '0 lbs', label: 'CO₂ avoided' },
        ],
      },
      {
        key: 'evergreen',
        code: '02 — EVERGREEN',
        title: 'Conservation & reforestation.',
        blurb: 'Native tree planting, urban canopy restoration, pollinator corridors, and invasive species removal — led by chapter volunteers in coordination with municipal parks and land trusts.',
        stat: '',
        stats: [
          { value: 'Launching', label: 'first planting day' },
          { value: 'Memphis',   label: 'founding chapter' },
        ],
      },
      {
        key: 'hydro',
        code: '03 — HYDRO',
        title: 'Waterway protection.',
        blurb: 'River, creek, and coastline cleanups. Microplastic surveys. Storm drain stenciling. Habitat restoration for the watersheds that feed our chapters.',
        stat: '',
        stats: [
          { value: '0 gal', label: 'water footprint reduced' },
          { value: '0',     label: 'cleanup events' },
        ],
      },
    ],
  },
  team:         { members: [] },
  testimonials: [],
  events:       [],
  partners:     { logos: [] },
  brand: {
    email: 'info@betternatureofficial.org',
    tagline: 'Food rescue · Conservation · Clean water',
    instagram: 'https://instagram.com/official.better.nature',
    twitter: '',
    facebook: '',
    donateUrl: '#donate',
    appLinks: {
      appStore: '',
      googlePlay: '',
      webApp: 'https://app.betternatureofficial.org',
    },
  },
};
