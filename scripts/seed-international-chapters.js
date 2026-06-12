/*
 * Seeds the 5 international chapters as real Firestore /chapters docs
 * so they show up in:
 *   - Restaurant signup chapter picker
 *   - FindChapter "request to join" list
 *   - ManageChapters exec view
 *   - The website /chapters grid (which reads /chapters live)
 *
 * Idempotent: matches existing chapters by (city, country) and skips
 * if found. Safe to re-run.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const KEY = path.join(__dirname, 'serviceAccount.json');
if (fs.existsSync(KEY)) {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
} else {
  admin.initializeApp({ projectId: 'better-nature-app' });
}
const db = admin.firestore();

const CHAPTERS = [
  { city: 'Santiago',       state: 'RM',         country: 'CHL', lat: -33.4489, lng: -70.6693 },
  { city: 'Valparaíso',     state: 'Valparaíso', country: 'CHL', lat: -33.0472, lng: -71.6127 },
  { city: 'Guatemala City', state: 'Guatemala',  country: 'GTM', lat:  14.6349, lng: -90.5069 },
  { city: 'Cuenca',         state: 'Azuay',      country: 'ECU', lat:  -2.9001, lng: -79.0059 },
  { city: 'Montevideo',     state: 'Montevideo', country: 'URY', lat: -34.9011, lng: -56.1645 },
];

(async () => {
  const existing = await db.collection('chapters').get();
  const byCityCountry = new Map(
    existing.docs.map((d) => {
      const c = d.data();
      return [`${(c.city || '').toLowerCase()}|${(c.country || '').toUpperCase()}`, d.id];
    })
  );

  for (const ch of CHAPTERS) {
    const key = `${ch.city.toLowerCase()}|${ch.country.toUpperCase()}`;
    if (byCityCountry.has(key)) {
      console.log(`↻ Skipping ${ch.city}, ${ch.country} — already exists (${byCityCountry.get(key)})`);
      continue;
    }
    const doc = {
      name: `BetterNature ${ch.city}`,
      city: ch.city,
      state: ch.state,
      country: ch.country,
      lat: ch.lat,
      lng: ch.lng,
      status: 'active',
      member_count: 0,
      founded_at: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('chapters').add(doc);
    console.log(`✔ Created BetterNature ${ch.city} (${ref.id})`);
  }
  console.log('done.');
  process.exit(0);
})().catch((e) => {
  console.error('seed failed', e);
  process.exit(1);
});
