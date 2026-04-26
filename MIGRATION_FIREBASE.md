# Supabase → Firebase Migration

## Status
- [x] Firebase project created (`better-nature-app`)
- [x] Firestore database provisioned (`us-central1`, production mode)
- [x] Firebase config baked into `app.json` + `src/config/firebase.js`
- [x] New Firebase auth service at `src/services/authFirebase.js`
- [x] Firestore security rules at `firestore.rules`
- [x] Composite indexes at `firestore.indexes.json`
- [ ] Install `firebase` npm package
- [ ] Migrate `src/services/database.js` → Firestore (in progress)
- [ ] Migrate `src/services/notifications.js` → FCM
- [ ] Data seed / migrate existing Supabase rows
- [ ] Swap screens from `./services/auth` → `./services/authFirebase`
- [ ] Deploy rules + indexes via Firebase CLI
- [ ] Delete `src/config/supabase.js`, `src/services/auth.js`, `supabase/` folder

## Install

```bash
# Firebase SDK
npm install firebase

# Firebase CLI (global, for deploying rules + indexes)
npm install -g firebase-tools

# Login with your @betternatureofficial.org Workspace account
firebase login

# Link the project
firebase use better-nature-app
```

## Deploy Firestore rules & indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## Collections created by the new auth service

- `users/{uid}` — created on signUp, fields: id, email, name, phone, city, zip, role, chapter_id, events_attended, hours_logged, meals_rescued, created_at

## Firestore collections you'll need (to match old Postgres tables)

| Supabase table | Firestore collection | Notes |
|---|---|---|
| users | users | Doc ID = auth uid |
| chapters | chapters | |
| events | events | |
| event_signups | event_signups | |
| pickups | pickups | |
| restaurants | restaurants | |
| donations | donations | |
| notifications | notifications | |
| member_activity | member_activity | |
| announcements | announcements | |
| org_metrics | org_metrics | scope: 'org' \| 'chapter' |
| animals_helped | animals_helped | |
| badges | badges | |
| user_badges | user_badges | |
| member_of_month | member_of_month | |
| checklist_progress | checklist_progress | |

## What changed in the auth API

The public API of `authFirebase.js` mirrors `auth.js` — same function names,
same return shapes. Screens only need to change the import path:

```js
// Before
import { signIn, signUp, signOut } from '../services/auth';

// After
import { signIn, signUp, signOut } from '../services/authFirebase';
```

## Known Firestore-vs-Postgres differences to watch

1. **No joins.** Old `.select('*, users(name)')` becomes a second `getDoc` call
   or denormalized field copies.
2. **No raw SQL.** `.rpc('increment_filled_spots')` becomes `updateDoc` with
   `increment(1)` from `firebase/firestore`.
3. **Composite queries need indexes.** First query that needs one will log a
   helpful link in the console — click it to auto-create the index.
4. **Timestamps.** Use `serverTimestamp()` for created_at/updated_at, not
   `new Date().toISOString()`.
5. **Geo queries.** For food-rescue radius search, use `geofire-common`:
   ```bash
   npm install geofire-common
   ```
