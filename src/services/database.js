// Firestore data layer — same exports as the old Supabase version so all
// screens keep working. When Firebase isn't configured (or a collection is
// empty) we fall back to mock data so the app demos cleanly.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { bumpOrgStats } from './orgStats';
import {
  mockChapters,
  mockEvents,
  mockPickups,
  mockRestaurants,
  mockNotifications,
  mockMemberOfMonth,
  mockAnimalsHelped,
  mockAnnouncements,
  mockBadges,
  mockChecklistProgress,
  mockMembers,
  mockUserSignups,
  mockDonations,
  mockOrgMetrics,
  mockMemberActivity,
} from './mockData';

// ── helpers ──
const useMock = () => !isFirebaseConfigured;
const snapToList = (snap) =>
  snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const snapToOne = (snap) =>
  snap.exists() ? { id: snap.id, ...snap.data() } : null;

// We used to fall back to mock data when a Firestore collection was empty.
// Now that we're shipping to real restaurants & volunteers, an empty
// collection means "no data yet" — we return empty so the UI shows zeroes
// or empty states instead of fake numbers. Mocks only apply when Firebase
// is unconfigured entirely (local dev w/o creds).
function withMockFallback(list /* , mock */) {
  return list;
}

// ── Chapters ──
export async function fetchChapters() {
  if (useMock()) return mockChapters;
  // We used to do where(status=='active')+orderBy('name'), but that
  // compound query needs a composite index in Firestore — if the
  // index isn't built (common during development) the query throws
  // and the caller's catch swallows it, leaving the exec with an
  // empty list and no clue why. Pull everything, filter + sort
  // client-side. Chapter count is small (dozens), not millions.
  const snap = await getDocs(collection(db, 'chapters'));
  let list = snapToList(snap);
  // Strict: only status==='active'. Members browsing chapters
  // should never see deactivated ones. Execs who need the full
  // list (to reactivate or audit) use fetchAllChapters() below.
  list = list.filter((c) => c.status === 'active' && !c.deleted_at);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return withMockFallback(list, mockChapters);
}

// Exec-only helper: returns active + inactive chapters so the
// Manage Chapters screen can show deactivated ones with a
// reactivate button. Soft-deleted (deleted_at) docs are still
// hidden because there's no UX path to undelete them.
export async function fetchAllChapters() {
  if (useMock()) return mockChapters;
  const snap = await getDocs(collection(db, 'chapters'));
  let list = snapToList(snap).filter((c) => !c.deleted_at);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return list;
}

export async function fetchChapterById(id) {
  if (useMock()) return mockChapters.find((c) => c.id === id) || mockChapters[0];
  const snap = await getDoc(doc(db, 'chapters', id));
  return snapToOne(snap);
}

export async function createChapter(chapter) {
  if (useMock()) return { id: `ch-mock-${Date.now()}`, ...chapter };
  const ref = await addDoc(collection(db, 'chapters'), {
    ...chapter,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...chapter };
}

export async function updateChapter(id, updates) {
  if (useMock()) return { id, ...updates };
  await updateDoc(doc(db, 'chapters', id), {
    ...updates,
    updated_at: serverTimestamp(),
  });
  return { id, ...updates };
}

// Hard-delete a chapter. Removes the doc entirely so it never
// reappears anywhere — Manage Chapters, the website grid, the BN
// Map presence rollup, FindChapter, none of them. Use this only
// for test chapters / mistaken creates; for real chapters that
// just need to step back from the public site, deactivate instead.
export async function deleteChapter(id) {
  if (useMock()) return;
  await deleteDoc(doc(db, 'chapters', id));
}

// ── Events ──
export async function fetchEvents(chapterId) {
  if (useMock()) {
    return chapterId ? mockEvents.filter((e) => e.chapter_id === chapterId) : mockEvents;
  }
  // Same composite-index pitfall — fetch all + filter client-side.
  const today = new Date().toISOString().split('T')[0];
  const snap = await getDocs(collection(db, 'events'));
  let list = snapToList(snap);
  if (chapterId) list = list.filter((e) => e.chapter_id === chapterId);
  list = list.filter((e) => !e.date || e.date >= today);
  list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return list;
}

export async function fetchEventById(id) {
  if (useMock()) return mockEvents.find((e) => e.id === id) || mockEvents[0];
  const snap = await getDoc(doc(db, 'events', id));
  return snapToOne(snap);
}

export async function createEvent(event) {
  if (useMock()) return { id: `ev-mock-${Date.now()}`, ...event };
  const ref = await addDoc(collection(db, 'events'), {
    filled_spots: 0,
    ...event,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...event };
}

// Recurring-event helper: clones a template event into N occurrences.
// We materialize each occurrence as its own doc instead of carrying a
// rrule string because (a) RSVPs, signups, and stats all key off
// event_id and would have to handle 'which occurrence?' otherwise,
// and (b) presidents need to be able to cancel an individual week
// without unwinding the series.
export async function createRecurringEvents(template, { every = 'week', count = 8 } = {}) {
  if (!template || !template.date) throw new Error('Template needs a base date');
  const made = [];
  const seriesId = `series-${Date.now().toString(36)}`;
  const stepMs = every === 'week' ? 7 * 86400000
                : every === 'biweek' ? 14 * 86400000
                : 86400000; // daily fallback
  const baseDate = new Date(template.date);
  for (let i = 0; i < count; i++) {
    const occDate = new Date(baseDate.getTime() + i * stepMs);
    const isoDate = occDate.toISOString().slice(0, 10);
    const ev = await createEvent({
      ...template,
      date: isoDate,
      series_id: seriesId,
      occurrence: i + 1,
      occurrence_total: count,
    });
    made.push(ev);
  }
  return { seriesId, count: made.length, events: made };
}

// In-memory signup list for mock mode.
const _mockSignups = [];

export async function signUpForEvent(eventId, userId) {
  if (useMock()) {
    _mockSignups.push({
      id: `su-${Date.now()}`,
      event_id: eventId,
      user_id: userId,
      status: 'signed_up',
      created_at: new Date().toISOString(),
    });
    const ev = mockEvents.find((e) => e.id === eventId);
    if (ev) ev.filled_spots = (ev.filled_spots || 0) + 1;
    return;
  }
  await addDoc(collection(db, 'event_signups'), {
    event_id: eventId,
    user_id: userId,
    status: 'signed_up',
    created_at: serverTimestamp(),
  });
  const ev = await fetchEventById(eventId);
  await updateDoc(doc(db, 'events', eventId), {
    filled_spots: (ev.filled_spots || 0) + 1,
  });
}

export async function cancelEventSignup(eventId, userId) {
  if (useMock()) {
    const idx = _mockSignups.findIndex(
      (s) => s.event_id === eventId && s.user_id === userId
    );
    if (idx >= 0) _mockSignups.splice(idx, 1);
    const ev = mockEvents.find((e) => e.id === eventId);
    if (ev) ev.filled_spots = Math.max(0, (ev.filled_spots || 0) - 1);
    return;
  }
  const snap = await getDocs(
    query(
      collection(db, 'event_signups'),
      where('event_id', '==', eventId),
      where('user_id', '==', userId)
    )
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));

  const ev = await fetchEventById(eventId);
  await updateDoc(doc(db, 'events', eventId), {
    filled_spots: Math.max(0, (ev.filled_spots || 0) - 1),
  });
}

export async function getUserSignups(userId) {
  if (useMock()) {
    return _mockSignups
      .filter((s) => s.user_id === userId && s.status !== 'cancelled')
      .map((s) => s.event_id);
  }
  const snap = await getDocs(
    query(collection(db, 'event_signups'), where('user_id', '==', userId))
  );
  return snapToList(snap)
    .filter((s) => s.status !== 'cancelled')
    .map((s) => s.event_id);
}

// Return all signups for an event with user names hydrated.
export async function fetchEventSignups(eventId) {
  if (useMock()) {
    return _mockSignups
      .filter((s) => s.event_id === eventId && s.status !== 'cancelled')
      .map((s) => {
        const member = mockMembers.find((m) => m.id === s.user_id);
        return { ...s, user_name: member?.name || 'Volunteer' };
      });
  }
  const snap = await getDocs(
    query(collection(db, 'event_signups'), where('event_id', '==', eventId))
  );
  const rows = snapToList(snap).filter((s) => s.status !== 'cancelled');
  // Hydrate user names
  const out = [];
  for (const r of rows) {
    let user_name = 'Volunteer';
    try {
      const u = await getDoc(doc(db, 'users', r.user_id));
      if (u.exists()) user_name = u.data().name || 'Volunteer';
    } catch {}
    out.push({ ...r, user_name });
  }
  return out;
}

// ── Check-in + auto-activity ──
export async function checkInVolunteer({
  signupId,
  eventId,
  userId,
  checkedInBy,
  project = 'general',
  hours = 3,
  meals = 0,
}) {
  const now = new Date().toISOString();

  if (useMock()) {
    const su = _mockSignups.find((s) => s.id === signupId);
    if (su) {
      su.status = 'checked_in';
      su.checked_in_by = checkedInBy;
      su.checked_in_at = now;
    }
    mockMemberActivity.push({
      id: `a-ci-${Date.now()}`,
      user_id: userId,
      date: now.split('T')[0],
      project,
      meals,
      hours,
      events: 1,
      raised: 0,
      source_type: 'event_checkin',
      source_id: eventId,
    });
    const member = mockMembers.find((m) => m.id === userId);
    if (member) {
      member.events_attended = (member.events_attended || 0) + 1;
      member.hours_logged = (member.hours_logged || 0) + hours;
      member.meals_rescued = (member.meals_rescued || 0) + meals;
    }
    return;
  }

  // 1. Update signup status
  if (signupId) {
    await updateDoc(doc(db, 'event_signups', signupId), {
      status: 'checked_in',
      checked_in_by: checkedInBy,
      checked_in_at: now,
    });
  }

  // 2. Insert activity row
  await addDoc(collection(db, 'member_activity'), {
    user_id: userId,
    date: now.split('T')[0],
    project,
    meals,
    hours,
    events: 1,
    raised: 0,
    source_type: 'event_checkin',
    source_id: eventId,
    created_at: serverTimestamp(),
  });

  // 3. Bump user running totals
  try {
    const userRef = doc(db, 'users', userId);
    const profile = await getDoc(userRef);
    if (profile.exists()) {
      const p = profile.data();
      await updateDoc(userRef, {
        events_attended: (p.events_attended || 0) + 1,
        hours_logged: (p.hours_logged || 0) + hours,
        meals_rescued: (p.meals_rescued || 0) + meals,
      });
    }
  } catch (e) { console.warn('user stats bump failed', e); }

  // 3b. Bump the org-wide live counters
  try {
    await bumpOrgStats({ events: 1, hours, meals });
  } catch (e) { console.warn('org stats bump (checkin)', e); }

  // 4. Notification
  await addDoc(collection(db, 'notifications'), {
    user_id: userId,
    title: 'Hours logged!',
    body:
      `You were checked in for ${hours}h` +
      (meals > 0 ? ` and ${meals} meals rescued` : '') +
      '. Keep it up!',
    data: { type: 'checkin_confirmed', eventId },
    read: false,
    created_at: serverTimestamp(),
  });
}

export async function markNoShow(signupId) {
  if (useMock()) {
    const su = _mockSignups.find((s) => s.id === signupId);
    if (su) su.status = 'no_show';
    return;
  }
  await updateDoc(doc(db, 'event_signups', signupId), { status: 'no_show' });
}

// ── Pickups ──
export async function createPickup(pickup) {
  if (useMock()) {
    const newPk = {
      id: `pk-mock-${Date.now()}`,
      status: 'available',
      ...pickup,
    };
    mockPickups.push(newPk);
    const chapterMembers = mockMembers.filter(
      (m) =>
        (m.chapters?.name || '').toLowerCase().includes('memphis') &&
        m.role !== 'chapter_pres'
    );
    chapterMembers.forEach((m) => {
      mockNotifications.unshift({
        id: `n-pk-${Date.now()}-${m.id}`,
        user_id: m.id,
        title: 'New pickup available!',
        body: `${pickup.restaurant_name} has food ready for rescue.`,
        read: false,
        created_at: new Date().toISOString(),
      });
    });
    return newPk;
  }

  // Validation — block the obviously broken cases before they reach
  // Firestore. A 0-lb pickup wastes a volunteer's run; a pickup with
  // no chapter goes to nobody's feed; a pickup without a restaurant
  // can't be verified end-to-end.
  if (!pickup.restaurant_id) throw new Error('Restaurant id is required.');
  if (!pickup.chapter_id) throw new Error('Chapter assignment is required — contact info@betternatureofficial.org.');
  const w = Number(pickup.estimated_weight_lbs);
  if (!Number.isFinite(w) || w <= 0) {
    throw new Error('Estimated weight must be at least 1 lb.');
  }

  // Enrich the pickup with the restaurant's address + coordinates so the
  // volunteer's PickupCard can render "Open in Maps" without a second
  // Firestore fetch per pickup. We snapshot at create time, which means
  // address edits to the restaurant doc later won't retro-rewrite old
  // pickups (intended — historical pickups should keep the address they
  // were actually picked up from).
  let address = pickup.restaurant_address || pickup.address || '';
  let restLat = pickup.restaurant_lat;
  let restLng = pickup.restaurant_lng;
  // Snapshot restaurant contact so the volunteer can call when they
  // arrive and the doors are locked, AND so the restaurant can call
  // the volunteer if they don't show up. These are the safety
  // valves that keep a run from silently failing.
  let restPhone = pickup.restaurant_phone || '';
  let restContact = pickup.restaurant_contact_name || '';
  if (pickup.restaurant_id) {
    try {
      const rSnap = await getDoc(doc(db, 'restaurants', pickup.restaurant_id));
      if (rSnap.exists()) {
        const r = rSnap.data();
        if (!address) {
          const line1 = r.address || r.street || '';
          const tail = [r.city, r.state].filter(Boolean).join(', ') + (r.zip ? ' ' + r.zip : '');
          address = [line1, tail].filter(Boolean).join(', ').trim();
        }
        if (r.lat != null) restLat = r.lat;
        if (r.lng != null) restLng = r.lng;
        if (!restPhone) restPhone = r.phone || '';
        if (!restContact) restContact = r.contact_name || r.name || '';
      }
    } catch (e) { console.warn('pickup enrich (restaurant)', e); }
  }
  // Same for the fridge — copy address/coords so the drop-off row in the
  // PickupCard can launch Maps too.
  let fridgeAddr = pickup.fridge_address || '';
  let fridgeLat = pickup.fridge_lat;
  let fridgeLng = pickup.fridge_lng;
  let fridgeName = pickup.fridge_name || '';
  if (pickup.fridge_id && !fridgeAddr) {
    try {
      const fSnap = await getDoc(doc(db, 'fridges', pickup.fridge_id));
      if (fSnap.exists()) {
        const f = fSnap.data();
        fridgeAddr = f.address || [f.city, f.state].filter(Boolean).join(', ');
        if (f.lat != null) fridgeLat = f.lat;
        if (f.lng != null) fridgeLng = f.lng;
        if (!fridgeName) fridgeName = f.name || '';
      }
    } catch (e) { console.warn('pickup enrich (fridge)', e); }
  }

  const enriched = {
    status: 'available',
    ...pickup,
    restaurant_address: address,
    restaurant_lat: restLat ?? null,
    restaurant_lng: restLng ?? null,
    restaurant_phone: restPhone,
    restaurant_contact_name: restContact,
    fridge_address: fridgeAddr,
    fridge_lat: fridgeLat ?? null,
    fridge_lng: fridgeLng ?? null,
    fridge_name: fridgeName,
    created_at: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'pickups'), enriched);
  const newPk = { id: ref.id, ...enriched };

  // Notify chapter members
  if (pickup.chapter_id) {
    try {
      const memSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('chapter_id', '==', pickup.chapter_id)
        )
      );
      const targets = snapToList(memSnap)
        .filter((m) => ['member', 'chapter_president', 'volunteer'].includes(m.role))
        .map((m) => m.id);
      const { enqueueNotification } = await import('./notify');
      await enqueueNotification({
        recipients: targets,
        kind: 'pickup',
        title: 'New pickup available!',
        body: `${pickup.restaurant_name || 'A partner restaurant'} has food ready for rescue${pickup.address ? ' at ' + pickup.address : ''}.`,
        url: `https://app.betternatureofficial.org/#/pickup/${ref.id}`,
        data: { type: 'new_pickup', pickupId: ref.id },
        skipInApp: false,
      });
    } catch (e) { console.warn('pickup notify failed', e); }
  }
  return newPk;
}

export async function fetchPickups(chapterId) {
  if (useMock()) {
    return chapterId ? mockPickups.filter((p) => p.chapter_id === chapterId) : mockPickups;
  }
  const constraints = [where('status', '==', 'available')];
  if (chapterId) constraints.push(where('chapter_id', '==', chapterId));
  const snap = await getDocs(query(collection(db, 'pickups'), ...constraints));
  return snapToList(snap);
}

// The signed-in volunteer's own claimed + enroute pickups. fetchPickups
// returns only `available` for the chapter feed, so without this the
// MyPickups dashboard widget went empty the moment a volunteer claimed
// a run — and stayed empty until they delivered it.
export async function fetchMyActivePickups(userId) {
  if (!userId) return [];
  if (useMock()) {
    return (mockPickups || []).filter(
      (p) => p.claimed_by === userId && ['claimed', 'enroute'].includes(p.status)
    );
  }
  try {
    // Single-key where + client filter — avoids the
    // composite-index requirement of (claimed_by, status) which
    // would silently return [] in prod until the index was built.
    const snap = await getDocs(query(
      collection(db, 'pickups'),
      where('claimed_by', '==', userId)
    ));
    return snapToList(snap).filter((p) => ['claimed', 'enroute'].includes(p.status));
  } catch (e) {
    console.warn('fetchMyActivePickups failed', e);
    return [];
  }
}

// All in-flight pickups org-wide (or scoped to a chapter). "In-flight"
// = a volunteer has claimed it but hasn't dropped it off yet. Used by
// the exec + chapter-pres live-ops dashboard to see who's out doing
// runs right now.
export async function fetchActivePickups({ chapterId } = {}) {
  if (useMock()) {
    const all = mockPickups || [];
    return all.filter((p) =>
      ['claimed', 'enroute'].includes(p.status)
      && (!chapterId || p.chapter_id === chapterId)
    );
  }
  try {
    const constraints = [where('status', 'in', ['claimed', 'enroute'])];
    if (chapterId) constraints.push(where('chapter_id', '==', chapterId));
    const snap = await getDocs(query(collection(db, 'pickups'), ...constraints));
    return snapToList(snap);
  } catch (e) {
    console.warn('fetchActivePickups failed', e);
    return [];
  }
}

// Pickups completed in the last N hours (default 24). Used on the
// leader dashboards so execs + chapter presidents see proof of drops
// the moment volunteers mark them delivered.
export async function fetchRecentlyCompletedPickups({ chapterId = null, hours = 24 } = {}) {
  if (useMock()) {
    const all = mockPickups || [];
    const cutoff = Date.now() - hours * 3600 * 1000;
    return all.filter((p) =>
      p.status === 'completed'
      && (!chapterId || p.chapter_id === chapterId)
      && p.completed_at && new Date(p.completed_at).getTime() >= cutoff
    );
  }
  try {
    const constraints = [where('status', '==', 'completed')];
    if (chapterId) constraints.push(where('chapter_id', '==', chapterId));
    const snap = await getDocs(query(collection(db, 'pickups'), ...constraints));
    const cutoff = Date.now() - hours * 3600 * 1000;
    return snapToList(snap).filter((p) => {
      const t = p.completed_at?.toDate ? p.completed_at.toDate().getTime()
              : p.completed_at ? new Date(p.completed_at).getTime() : 0;
      return t >= cutoff;
    }).sort((a, b) => {
      const ta = a.completed_at?.toDate ? a.completed_at.toDate().getTime() : new Date(a.completed_at || 0).getTime();
      const tb = b.completed_at?.toDate ? b.completed_at.toDate().getTime() : new Date(b.completed_at || 0).getTime();
      return tb - ta;
    });
  } catch (e) {
    console.warn('fetchRecentlyCompletedPickups failed', e);
    return [];
  }
}

// Pickups posted by a specific restaurant, newest first. Used by the
// restaurant dashboard so partners see real-time status of their own
// donations (available → claimed → enroute → completed) without having
// to dig into a separate history screen.
export async function fetchPickupsByRestaurant(restaurantId, max = 8) {
  if (!restaurantId) return [];
  if (useMock()) {
    return mockPickups.filter((p) => p.restaurant_id === restaurantId).slice(0, max);
  }
  try {
    // We index by restaurant_id alone (without orderBy) so this query
    // works even without a composite index — sort client-side.
    const snap = await getDocs(query(
      collection(db, 'pickups'),
      where('restaurant_id', '==', restaurantId),
    ));
    const list = snapToList(snap);
    list.sort((a, b) => {
      const tA = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime();
      const tB = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime();
      return tB - tA;
    });
    return list.slice(0, max);
  } catch (e) {
    console.warn('fetchPickupsByRestaurant failed', e);
    return [];
  }
}

export async function claimPickup(pickupId, userId) {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    return pk ? { ...pk, status: 'claimed', claimed_by: userId } : null;
  }
  const ref = doc(db, 'pickups', pickupId);
  const claimedAt = new Date().toISOString();
  // ATOMIC claim — without this, two volunteers tapping "Claim" at
  // the same moment both succeed; both drive to the restaurant; the
  // restaurant fields two confused volunteers. A Firestore
  // transaction reads + writes in one round-trip, so the second
  // claimant lands in the `pk.status !== 'available'` branch and
  // gets a friendly error instead of stomping the first volunteer.
  // Snapshot the volunteer's contact so the restaurant can call
  // them if they don't show up. Reads from the user doc outside
  // the transaction because get() inside a transaction on a
  // different doc requires read+write pairs and complicates
  // things — the volunteer's phone/name is a snapshot, not a
  // race-sensitive value.
  let claimantPhone = '';
  let claimantName = '';
  try {
    const uSnap = await getDoc(doc(db, 'users', userId));
    if (uSnap.exists()) {
      const u = uSnap.data();
      claimantPhone = u.phone || '';
      claimantName = u.name || u.full_name || '';
    }
  } catch {}
  const pk = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pickup not found');
    const data = snap.data();
    if (data.status === 'claimed' && data.claimed_by && data.claimed_by !== userId) {
      throw new Error('Another volunteer just claimed this pickup. Try a different one.');
    }
    if (data.status === 'completed') throw new Error('That pickup has already been delivered.');
    if (data.status === 'cancelled') throw new Error('That pickup was cancelled by the restaurant.');
    tx.update(ref, {
      status: 'claimed',
      claimed_by: userId,
      claimed_at: claimedAt,
      claimant_phone: claimantPhone,
      claimant_name: claimantName,
    });
    return {
      id: snap.id, ...data,
      status: 'claimed', claimed_by: userId, claimed_at: claimedAt,
      claimant_phone: claimantPhone, claimant_name: claimantName,
    };
  });

  // Smart reminder: confirmation push + email so the volunteer has
  // the pickup details in their inbox. Pre-arrival scheduled reminders
  // will be added once the dispatcher supports send_at — for now we
  // queue an immediate confirmation only.
  try {
    const { enqueueNotification } = await import('./notify');
    await enqueueNotification({
      recipients: [userId],
      kind: 'pickup',
      title: 'You claimed a pickup',
      body: `Pickup at ${pk.restaurant_name || 'the restaurant'}. Address: ${pk.restaurant_address || 'see app'}. Open the app for the route.`,
      url: `https://app.betternatureofficial.org/#/pickup/${pickupId}`,
      data: { type: 'pickup_claimed', pickupId },
    });
  } catch (e) { console.warn('claim notify', e); }

  return pk;
}

// Volunteer changes their mind after claiming. Pickup goes back to
// 'available' and clears the assignment so another volunteer can grab
// it. Restaurant gets notified that they need someone else. We don't
// allow cancel after 'enroute' — at that point the food is already
// out of the kitchen and the restaurant needs a human conversation,
// not a tap.
export async function cancelClaim(pickupId, reason = '') {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    if (pk) { pk.status = 'available'; delete pk.claimed_by; delete pk.claimed_at; }
    return pk;
  }
  const ref = doc(db, 'pickups', pickupId);
  // Atomic release — refuses to revert anything past 'claimed' and
  // returns the previous claimant id + restaurant id so downstream
  // penalty / notification target the right users.
  const { releasedBy, pk } = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pickup not found');
    const data = snap.data();
    if (data.status !== 'claimed') {
      throw new Error('You can only release a pickup before you’ve hit the road.');
    }
    tx.update(ref, {
      status: 'available',
      claimed_by: null,
      claimed_at: null,
      cancel_reason: reason || null,
      cancelled_at: new Date().toISOString(),
    });
    return { releasedBy: data.claimed_by || null, pk: data };
  });
  // Reliability penalty — dropping a claimed pickup costs the
  // volunteer 5 leaderboard points and bumps a `pickups_dropped`
  // counter so chapters can see who keeps abandoning runs. We use
  // a delta so concurrent score updates from event check-ins don't
  // race with this one.
  if (releasedBy) {
    try {
      const uRef = doc(db, 'users', releasedBy);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const u = uSnap.data();
        await updateDoc(uRef, {
          leaderboard_score: Math.max(0, (u.leaderboard_score || 0) - 5),
          pickups_dropped:   (u.pickups_dropped || 0) + 1,
          last_drop_at:      serverTimestamp(),
        });
      }
      // Audit row for transparency (the volunteer can see this
      // when we surface a 'dropped runs' tab on the profile).
      await addDoc(collection(db, 'member_activity'), {
        user_id:     releasedBy,
        date:        new Date().toISOString().split('T')[0],
        project:     'iris',
        meals:       0,
        hours:       0,
        events:      0,
        points:      -5,
        raised:      0,
        source_type: 'pickup_dropped',
        source_id:   pickupId,
        notes:       reason || null,
        created_at:  serverTimestamp(),
      });
    } catch (e) { console.warn('drop penalty failed', e); }
  }
  // Tell the restaurant — best-effort.
  try {
    if (pk.restaurant_id) {
      await addDoc(collection(db, 'notifications'), {
        user_id: pk.restaurant_id,
        title: 'Pickup released',
        body: `Your pickup is back on the board — looking for another volunteer.${reason ? ' Reason: ' + reason : ''}`,
        data: { type: 'pickup_released', pickupId },
        read: false,
        created_at: serverTimestamp(),
      });
    }
  } catch (e) { console.warn('cancel-claim notify', e); }
  return { ...pk, status: 'available' };
}

// Restaurant cancels a pickup they posted (e.g. surplus got eaten, no
// longer available). Marks the pickup cancelled and tells anyone who
// already claimed it.
export async function cancelPickup(pickupId, reason = '') {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    if (pk) pk.status = 'cancelled';
    return pk;
  }
  const ref = doc(db, 'pickups', pickupId);
  // Atomic cancel — also blocks cancelling an `enroute` pickup
  // (food is already in the volunteer's car) so a partner can't
  // accidentally "cancel" a run that's halfway to the drop. They
  // need a human conversation at that point, not a tap.
  const pk = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pickup not found');
    const data = snap.data();
    if (data.status === 'completed') throw new Error('That pickup is already delivered.');
    if (data.status === 'cancelled') return data; // idempotent
    if (data.status === 'enroute') {
      throw new Error('A volunteer already picked up the food. Call them on the contact in the app — don\'t cancel here.');
    }
    tx.update(ref, {
      status: 'cancelled',
      cancel_reason: reason || null,
      cancelled_at: new Date().toISOString(),
    });
    return data;
  });
  // If a volunteer had claimed it, let them know.
  try {
    if (pk.claimed_by) {
      await addDoc(collection(db, 'notifications'), {
        user_id: pk.claimed_by,
        title: 'Pickup cancelled',
        body: `${pk.restaurant_name || 'The restaurant'} cancelled their pickup.${reason ? ' Reason: ' + reason : ''}`,
        data: { type: 'pickup_cancelled', pickupId },
        read: false,
        created_at: serverTimestamp(),
      });
    }
  } catch (e) { console.warn('cancel-pickup notify', e); }
  return { ...pk, status: 'cancelled' };
}

// Volunteer flips the pickup to "en route" once they have the food in
// hand and are headed to the fridge. Used by the PickupDetail screen.
// Also lets the volunteer pick a fridge if the restaurant didn't
// Restaurant verifies that the volunteer is on-site picking up the
// food. Sets verified_by_restaurant_at and stamps which restaurant
// user account did the verification. Used by the restaurant's
// pickup detail screen — they tap "Verify volunteer is here" once
// the volunteer arrives.
export async function verifyPickupByRestaurant(pickupId, verifierUid) {
  if (useMock()) return;
  const ref = doc(db, 'pickups', pickupId);
  // Guard: only verifiable when a volunteer has actually claimed
  // and not yet delivered. Stops accidental re-verifies on a
  // completed / cancelled pickup that would confuse downstream
  // queries.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pickup not found');
    const data = snap.data();
    if (!['claimed', 'enroute'].includes(data.status)) {
      throw new Error('This pickup can only be confirmed while a volunteer is on the way.');
    }
    if (data.verified_by_restaurant_at) {
      // Already verified — silent no-op so a double-tap doesn't
      // re-fire the volunteer notification.
      return;
    }
    tx.update(ref, {
      verified_by_restaurant_at: serverTimestamp(),
      verified_by_restaurant_uid: verifierUid || null,
    });
  });
  // Ping the volunteer that the restaurant confirmed pickup. Gives
  // them a visible "half-way" milestone — the restaurant has signed
  // off, all that's left is the drop.
  try {
    const snap = await getDoc(ref);
    const pk = snap.exists() ? snap.data() : null;
    if (pk?.claimed_by) {
      await addDoc(collection(db, 'notifications'), {
        user_id: pk.claimed_by,
        title: 'Pickup confirmed by restaurant',
        body: `${pk.restaurant_name || 'The restaurant'} just confirmed you picked up the food. Drop it off to finish the run.`,
        data: { type: 'pickup_verified', pickupId },
        read: false,
        created_at: serverTimestamp(),
      });
    }
  } catch (e) { console.warn('verify notify volunteer', e); }
}

// pre-select one — we copy the fridge's address/coords onto the pickup
// so the "Open in Maps" deep link works without an extra fetch.
export async function setPickupEnroute(pickupId, { fridgeId } = {}) {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    if (pk) pk.status = 'enroute';
    return pk;
  }
  const ref = doc(db, 'pickups', pickupId);
  const updates = {
    status: 'enroute',
    enroute_at: new Date().toISOString(),
  };
  if (fridgeId) {
    try {
      const fSnap = await getDoc(doc(db, 'fridges', fridgeId));
      if (fSnap.exists()) {
        const f = fSnap.data();
        updates.fridge_id = fridgeId;
        updates.fridge_name = f.name || '';
        updates.fridge_address = f.address ||
          [f.city, f.state].filter(Boolean).join(', ');
        updates.fridge_lat = f.lat ?? null;
        updates.fridge_lng = f.lng ?? null;
      }
    } catch (e) { console.warn('enroute fridge enrich', e); }
  }
  // Atomic status transition — refuses if the pickup isn't currently
  // 'claimed' (already cancelled, already completed, never claimed).
  // Without this, a stale tap on a phone that lost connection could
  // resurrect a cancelled run to 'enroute' and confuse the restaurant.
  const fresh = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Pickup not found');
    const data = snap.data();
    if (data.status === 'enroute') return { id: snap.id, ...data }; // idempotent
    if (data.status !== 'claimed') {
      throw new Error('This pickup isn\'t in a claimed state — nothing to mark en route.');
    }
    tx.update(ref, updates);
    return { id: snap.id, ...data, ...updates };
  });

  // Notify the restaurant that someone is on the way. Restaurants are user
  // docs with role='restaurant', so we route the notification to
  // pk.restaurant_id (which is also the restaurant user's uid in our schema).
  // Best-effort — never blocks the status change.
  try {
    const pk = fresh || {};
    if (pk.restaurant_id) {
      let volunteerName = '';
      if (pk.claimed_by) {
        try {
          const vSnap = await getDoc(doc(db, 'users', pk.claimed_by));
          if (vSnap.exists()) volunteerName = vSnap.data().name || '';
        } catch {}
      }
      const dropOff = pk.fridge_name ? ` and dropping at ${pk.fridge_name}` : '';
      await addDoc(collection(db, 'notifications'), {
        user_id: pk.restaurant_id,
        title: 'Volunteer is on the way',
        body: `${volunteerName || 'A volunteer'} is heading to your restaurant${dropOff}.`,
        data: { type: 'pickup_enroute', pickupId },
        read: false,
        created_at: serverTimestamp(),
      });
    }
  } catch (e) { console.warn('restaurant enroute notify', e); }

  return fresh;
}

export async function completePickup(pickupId, actualWeightLbs) {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    if (pk) {
      pk.status = 'completed';
      pk.completed_at = new Date().toISOString();
      const weight = actualWeightLbs || pk.estimated_weight_lbs || 0;
      const meals = Math.round(weight * 1.2);
      const claimedAtMs = pk.claimed_at ? new Date(pk.claimed_at).getTime() : Date.now();
      const elapsedH = (Date.now() - claimedAtMs) / 3600000;
      const hoursEarned = Math.max(0.25, Math.min(3, +elapsedH.toFixed(2)));
      if (pk.claimed_by) {
        mockMemberActivity.push({
          id: `a-pk-${Date.now()}`,
          user_id: pk.claimed_by,
          date: new Date().toISOString().split('T')[0],
          project: 'iris',
          meals,
          hours: hoursEarned,
          events: 0,
          raised: 0,
          source_type: 'pickup_complete',
          source_id: pickupId,
        });
        const member = mockMembers.find((m) => m.id === pk.claimed_by);
        if (member) {
          member.meals_rescued = (member.meals_rescued || 0) + meals;
          member.hours_logged = (member.hours_logged || 0) + hoursEarned;
        }
      }
    }
    return;
  }

  const pkRef = doc(db, 'pickups', pickupId);

  // IDEMPOTENT completion via transaction. Without this, a flaky
  // connection or fast double-tap can trigger completePickup twice:
  // two member_activity rows, doubled user stats, doubled org_stats,
  // and TWO tax receipts to the partner — which destroys partner
  // trust. The transaction reads first and bails if the doc is
  // already 'completed', so concurrent calls produce one bump max.
  const now = new Date().toISOString();
  let pk;
  let hoursEarned;
  let weight;
  try {
    pk = await runTransaction(db, async (tx) => {
      const snap = await tx.get(pkRef);
      if (!snap.exists()) throw new Error('Pickup not found');
      const data = snap.data();
      if (data.status === 'completed') {
        const err = new Error('ALREADY_COMPLETED');
        err.code = 'already_completed';
        throw err;
      }
      if (data.status === 'cancelled') throw new Error('That pickup was cancelled.');
      const claimedAtMs = data.claimed_at?.toDate
        ? data.claimed_at.toDate().getTime()
        : data.claimed_at ? new Date(data.claimed_at).getTime() : Date.now();
      const elapsedH = (Date.now() - claimedAtMs) / 3600000;
      hoursEarned = Math.max(0.25, Math.min(3, +elapsedH.toFixed(2)));
      weight = (actualWeightLbs || data.estimated_weight_lbs || 0);
      tx.update(pkRef, {
        status: 'completed',
        actual_weight_lbs: weight,
        completed_at: now,
        hours_earned: hoursEarned,
      });
      return data;
    });
  } catch (e) {
    if (e?.code === 'already_completed') return; // silent no-op
    throw e;
  }
  const meals = Math.round(weight * 1.2);

  if (pk.claimed_by) {
    const mealBonusForLog = Math.min(50, meals);
    await addDoc(collection(db, 'member_activity'), {
      user_id: pk.claimed_by,
      date: now.split('T')[0],
      project: 'iris',
      meals,
      lbs: weight,
      hours: hoursEarned,
      events: 1, // a completed pickup counts as an activity event
      points: 10 + mealBonusForLog,
      raised: 0,
      source_type: 'pickup_complete',
      source_id: pickupId,
      created_at: serverTimestamp(),
    });

    try {
      const userRef = doc(db, 'users', pk.claimed_by);
      const profile = await getDoc(userRef);
      if (profile.exists()) {
        const p = profile.data();
        // Award 10 leaderboard points per completed pickup, plus
        // a 1-point-per-meal bonus capped at 50. So a tiny salad
        // is +10 and a 50lb load of produce is +60 — proportionate
        // to impact without snowballing into runaway leaders.
        const mealBonus = Math.min(50, meals);
        const points = 10 + mealBonus;
        await updateDoc(userRef, {
          meals_rescued: (p.meals_rescued || 0) + meals,
          lbs_rescued:   (p.lbs_rescued   || 0) + weight,
          hours_logged:  (p.hours_logged  || 0) + hoursEarned,
          events_attended: (p.events_attended || 0) + 1,
          leaderboard_score: (p.leaderboard_score || 0) + points,
          pickups_completed: (p.pickups_completed || 0) + 1,
        });
        // Mirror the points into the activity row so the
        // leaderboard's points view picks them up too.
      }
    } catch (e) { console.warn('user stat bump', e); }

    // Bump the org-wide live counters that drive the website ticker,
    // the Welcome screen on the app, and the Exec dashboard.
    // bumpOrgStats derives meals/co2/water from lbs automatically, so
    // every completed pickup propagates everywhere those numbers are
    // read. We also bump events:1 so the 'events run' counter ticks
    // forward per rescue.
    try {
      await bumpOrgStats({ lbs: weight, hours: hoursEarned, events: 1 });
    } catch (e) { console.warn('org stats bump (pickup)', e); }

    await addDoc(collection(db, 'notifications'), {
      user_id: pk.claimed_by,
      title: 'Pickup complete!',
      body: `You rescued ~${meals} meals from ${pk.restaurant_name}. Amazing work!`,
      data: { type: 'pickup_complete', pickupId },
      read: false,
      created_at: serverTimestamp(),
    });

    // Mirror the win to the restaurant so they see real-time proof their
    // surplus made it to a fridge. Best-effort — never blocks completion
    // (volunteer's activity log is already written by this point).
    if (pk.restaurant_id) {
      try {
        const dropOff = pk.fridge_name ? ` at ${pk.fridge_name}` : '';
        await addDoc(collection(db, 'notifications'), {
          user_id: pk.restaurant_id,
          title: 'Your surplus made it',
          body: `Your donation is delivered${dropOff}. ~${meals} meals (${weight} lbs). Your tax receipt is on the way.`,
          data: { type: 'pickup_delivered_restaurant', pickupId, meals, lbs: weight },
          read: false,
          created_at: serverTimestamp(),
        });
        // Push + email the restaurant too (best-effort).
        try {
          const { enqueueNotification } = await import('./notify');
          // Restaurant docs may store the linked user_id; if so, use it.
          const linkedUid = pk.restaurant_user_id || pk.restaurant_id;
          await enqueueNotification({
            recipients: [linkedUid],
            kind: 'general',
            title: 'Your donation just landed',
            body: `Your donation just landed${dropOff}. ~${meals} meals rescued. Your tax receipt is on the way.`,
            data: { type: 'restaurant_delivered', pickupId },
          });
        } catch {}
      } catch (e) { console.warn('restaurant delivered notify', e); }
    }

    // Mint the restaurant's tax receipt and surface the link to them
    // through every channel: app bell, push, email. Never blocks
    // completion if any one channel fails.
    try {
      const { issueReceiptForPickup, receiptUrl } = await import('./taxReceipts');
      // Pull volunteer name for the receipt body.
      let volunteerName = '';
      try {
        const vSnap = await getDoc(doc(db, 'users', pk.claimed_by));
        if (vSnap.exists()) volunteerName = vSnap.data().name || '';
      } catch {}
      // Resolve the restaurant email + linked user uid. Try the
      // restaurants doc first; fall back to the linked user's email
      // if the restaurants doc has no email field.
      let restaurantEmail = '';
      let restaurantUserUid = pk.restaurant_user_id || null;
      if (pk.restaurant_id) {
        try {
          const rSnap = await getDoc(doc(db, 'restaurants', pk.restaurant_id));
          if (rSnap.exists()) {
            const r = rSnap.data();
            restaurantEmail = r.email || r.contact_email || '';
            restaurantUserUid = restaurantUserUid || r.user_id || null;
          }
        } catch {}
      }
      if (!restaurantEmail && restaurantUserUid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', restaurantUserUid));
          if (uSnap.exists()) restaurantEmail = uSnap.data().email || '';
        } catch {}
      }

      const receipt = await issueReceiptForPickup({
        pickupId,
        restaurantId: pk.restaurant_id || null,
        restaurantName: pk.restaurant_name || '',
        restaurantEmail,
        weightLbs: weight,
        mealsEquivalent: meals,
        pickedUpAt: now,
        volunteerName,
        chapterName: pk.chapter_name || '',
      });

      // Stamp the receipt id back onto the pickup doc so the
      // restaurant dashboard can deep-link without a join.
      if (receipt?.id) {
        try {
          await updateDoc(doc(db, 'pickups', pickupId), {
            tax_receipt_id: receipt.id,
            tax_receipt_url: receiptUrl(receipt.id),
            delivered_visible_to_restaurant: true,
          });
        } catch {}
      }

      // Send the receipt through the unified notification dispatcher.
      // Drops an in-app bell + queues an email via Resend (once the
      // dispatcher worker is deployed). Replaces the old FormSubmit
      // hop, which was rate-limited and silently failing.
      if (receipt?.id && restaurantUserUid) {
        try {
          const { enqueueNotification } = await import('./notify');
          await enqueueNotification({
            recipients: [restaurantUserUid],
            kind: 'general',
            title: `Your tax receipt for ${weight} lbs is ready`,
            body: `BetterNature has minted receipt #${receipt.receipt_no || '0001'} for your donation. Open it to print or save as PDF for your records.`,
            url: receiptUrl(receipt.id),
            data: { type: 'tax_receipt', pickupId, receiptId: receipt.id },
          });
        } catch (e) { console.warn('receipt notify failed', e); }
      }
    } catch (e) { console.warn('tax receipt issue failed', e); }
  }
}

// ── Restaurants ──
// Find users whose role is 'restaurant' but have no /restaurants
// doc and create the missing partner record. Heals existing
// accounts promoted before updateUserRole started spinning the
// doc up automatically (commit ea8fefe). Safe to run on every
// ManageRestaurants load — exits in a single users scan when
// everything is already in sync.
export async function backfillRestaurantDocs() {
  if (useMock()) return { created: 0 };
  let created = 0;
  try {
    const usnap = await getDocs(query(
      collection(db, 'users'),
      where('role', '==', 'restaurant')
    ));
    const restUsers = usnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!restUsers.length) return { created };

    // Pull the restaurants collection ONCE and index by user_id so
    // we can detect which users are already wired up.
    const rsnap = await getDocs(collection(db, 'restaurants'));
    const linkedUids = new Set(
      rsnap.docs.map((d) => d.data()?.user_id).filter(Boolean)
    );

    for (const u of restUsers) {
      if (u.restaurant_id) continue;        // already linked
      if (linkedUids.has(u.id)) continue;   // restaurants doc exists, just relink
      const ref = await addDoc(collection(db, 'restaurants'), {
        user_id: u.id,
        name: u.business_name || u.name || u.email || 'Partner',
        email: u.email || '',
        phone: u.phone || '',
        address: u.address || '',
        chapter_id: u.chapter_id || null,
        chapter_name: u.chapter_name || '',
        status: 'approved',
        promoted_from_member: true,
        backfilled: true,
        created_at: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', u.id), {
        restaurant_id: ref.id,
        restaurant_status: 'approved',
      });
      created++;
    }
  } catch (e) { console.warn('backfillRestaurantDocs failed', e); }
  return { created };
}

// Delete a /restaurants doc entirely. Exec-only per rules. Also
// clears restaurant_id + restaurant_status off the linked user
// doc so the church's device doesn't stay pointed at a
// tombstone. Idempotent — safe to re-run.
export async function deleteRestaurant(restaurantId) {
  if (useMock()) return;
  if (!restaurantId) return;
  const ref = doc(db, 'restaurants', restaurantId);
  const snap = await getDoc(ref);
  const userId = snap.exists() ? snap.data().user_id : null;
  await deleteDoc(ref);
  if (userId) {
    try {
      await updateDoc(doc(db, 'users', userId), {
        restaurant_id: null,
        restaurant_status: null,
      });
    } catch {}
  }
}

// Find /restaurants docs that share a user_id (duplicates) and
// keep only the first, deleting the rest. Runs on Manage
// Restaurants load so accidental dupes clean up on the exec's
// next visit. The kept doc is the earliest by created_at (or the
// first one Firestore returns if no timestamp).
export async function dedupeRestaurantsByUser() {
  if (useMock()) return { removed: 0 };
  let removed = 0;
  try {
    const rsnap = await getDocs(collection(db, 'restaurants'));
    const byUser = new Map();
    for (const d of rsnap.docs) {
      const data = d.data();
      const uid = data.user_id;
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push({ id: d.id, ...data });
    }
    for (const [uid, docs] of byUser.entries()) {
      if (docs.length < 2) continue;
      // Prefer the approved one; else earliest by created_at.
      docs.sort((a, b) => {
        if ((a.status === 'approved') !== (b.status === 'approved')) {
          return a.status === 'approved' ? -1 : 1;
        }
        const ta = a.created_at?.toMillis?.() || 0;
        const tb = b.created_at?.toMillis?.() || 0;
        return ta - tb;
      });
      const keep = docs[0];
      for (let i = 1; i < docs.length; i++) {
        try {
          await deleteDoc(doc(db, 'restaurants', docs[i].id));
          removed++;
        } catch (e) { console.warn('dedupe delete', e); }
      }
      // Re-link the user to the surviving doc.
      try {
        await updateDoc(doc(db, 'users', uid), {
          restaurant_id: keep.id,
          restaurant_status: keep.status || 'approved',
        });
      } catch {}
    }
  } catch (e) { console.warn('dedupeRestaurantsByUser', e); }
  return { removed };
}

// Find users tagged as partners (role==='restaurant' OR roles[]
// contains 'partner') who have no /restaurants doc yet. The write
// that would have created one is silently rejected by the current
// firestore rule (user_id must equal auth.uid), so the church /
// community garden shows up here as a diagnostic instead of just
// vanishing off Manage Restaurants.
export async function fetchOrphanedPartners() {
  if (useMock()) return [];
  try {
    const usnap = await getDocs(collection(db, 'users'));
    const partners = usnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => !u.deleted_at)
      .filter((u) =>
        u.role === 'restaurant'
        || (Array.isArray(u.roles) && u.roles.includes('partner'))
      );
    // Dedupe against actual /restaurants docs by user_id.
    const rsnap = await getDocs(collection(db, 'restaurants'));
    const linkedUids = new Set(
      rsnap.docs.map((d) => d.data()?.user_id).filter(Boolean)
    );
    return partners.filter((u) => !u.restaurant_id && !linkedUids.has(u.id));
  } catch (e) {
    console.warn('fetchOrphanedPartners failed', e);
    return [];
  }
}

export async function fetchRestaurants(status = 'approved') {
  if (useMock()) {
    return status === 'all' || !status
      ? mockRestaurants
      : mockRestaurants.filter((r) => r.status === status);
  }
  const snap = await getDocs(collection(db, 'restaurants'));
  let list = snapToList(snap);
  if (status && status !== 'all') list = list.filter((r) => r.status === status);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return withMockFallback(
    list,
    status === 'all' || !status
      ? mockRestaurants
      : mockRestaurants.filter((r) => r.status === status)
  );
}

export async function createRestaurant(restaurant) {
  if (useMock()) return { id: `r-mock-${Date.now()}`, ...restaurant, status: 'pending' };
  // Every new restaurant lands in 'pending' until an exec approves
  // them in Manage Restaurants. The caller can override (e.g. when
  // an exec adds a partner directly) by passing an explicit status.
  const payload = {
    status: 'pending',
    ...restaurant,
    created_at: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'restaurants'), payload);
  return { id: ref.id, ...payload };
}

export async function updateRestaurant(id, updates) {
  if (useMock()) return { id, ...updates };
  await updateDoc(doc(db, 'restaurants', id), {
    ...updates,
    updated_at: serverTimestamp(),
  });
  return { id, ...updates };
}

// ── Donations ──
export async function recordDonation(donation) {
  if (useMock()) return { id: `d-mock-${Date.now()}`, ...donation };
  const ref = await addDoc(collection(db, 'donations'), {
    ...donation,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...donation };
}

export async function fetchDonationHistory(userId) {
  if (useMock()) {
    if (!userId) return mockDonations;
    return mockDonations.filter((d) => d.user_id === userId);
  }
  const snap = await getDocs(
    query(
      collection(db, 'donations'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc')
    )
  );
  return snapToList(snap);
}

export async function fetchAllDonations() {
  if (useMock()) return mockDonations;
  const snap = await getDocs(
    query(collection(db, 'donations'), orderBy('created_at', 'desc'))
  );
  return withMockFallback(snapToList(snap), mockDonations);
}

// ── Notifications ──
export async function fetchNotifications(userId) {
  if (useMock()) return mockNotifications;
  // where()+orderBy() needs composite index; do single-field where
  // and sort + slice client-side.
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('user_id', '==', userId))
  );
  let list = snapToList(snap);
  list.sort((a, b) => {
    const ta = a.created_at?.toMillis?.() || 0;
    const tb = b.created_at?.toMillis?.() || 0;
    return tb - ta;
  });
  return withMockFallback(list.slice(0, 50), mockNotifications);
}

export async function markNotificationRead(notifId) {
  if (useMock()) return;
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}

export async function createNotification(notif) {
  if (useMock()) return;
  await addDoc(collection(db, 'notifications'), {
    read: false,
    ...notif,
    created_at: serverTimestamp(),
  });
}

// ── Member of the Month ──
export async function fetchMemberOfMonth(chapterId) {
  if (useMock()) return mockMemberOfMonth;
  const now = new Date();
  try {
    const snap = await getDocs(
      query(
        collection(db, 'member_of_month'),
        where('chapter_id', '==', chapterId),
        where('month', '==', now.getMonth() + 1),
        where('year', '==', now.getFullYear()),
        fbLimit(1)
      )
    );
    const list = snapToList(snap);
    if (!list.length) return null;
    const row = list[0];
    if (row.user_id) {
      const u = await getDoc(doc(db, 'users', row.user_id));
      if (u.exists()) {
        const ud = u.data();
        row.users = { name: ud.name, avatar_url: ud.avatar_url };
      }
    }
    return row;
  } catch {
    return null;
  }
}

// ── Badges ──
export async function fetchUserBadges(userId) {
  if (useMock()) return mockBadges;
  const snap = await getDocs(
    query(
      collection(db, 'user_badges'),
      where('user_id', '==', userId),
      orderBy('earned_at', 'desc')
    )
  );
  return withMockFallback(snapToList(snap), mockBadges);
}

// ── Checklist ──
export async function fetchChecklistProgress(chapterId) {
  if (useMock()) return mockChecklistProgress;
  const snap = await getDocs(
    query(
      collection(db, 'checklist_progress'),
      where('chapter_id', '==', chapterId)
    )
  );
  return withMockFallback(snapToList(snap), mockChecklistProgress);
}

export async function updateChecklistItem(chapterId, itemKey, status) {
  if (useMock()) return;
  const snap = await getDocs(
    query(
      collection(db, 'checklist_progress'),
      where('chapter_id', '==', chapterId),
      where('item_key', '==', itemKey),
      fbLimit(1)
    )
  );
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      status,
      updated_at: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, 'checklist_progress'), {
      chapter_id: chapterId,
      item_key: itemKey,
      status,
      updated_at: serverTimestamp(),
    });
  }
}

// ── Animals ──
export async function fetchAnimalsHelped(chapterId) {
  if (useMock()) {
    return chapterId ? mockAnimalsHelped.filter((a) => a.chapter_id === chapterId) : mockAnimalsHelped;
  }
  const constraints = [];
  if (chapterId) constraints.push(where('chapter_id', '==', chapterId));
  const snap = await getDocs(query(collection(db, 'animals_helped'), ...constraints));
  return snapToList(snap);
}

// ── Announcements ──
export async function fetchAnnouncements(target) {
  if (useMock()) return mockAnnouncements;
  // Firestore can't OR across fields easily; run two queries and merge.
  try {
    const [allSnap, tgtSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'announcements'),
          where('target', '==', 'all'),
          orderBy('created_at', 'desc'),
          fbLimit(20)
        )
      ),
      target
        ? getDocs(
            query(
              collection(db, 'announcements'),
              where('target', '==', target),
              orderBy('created_at', 'desc'),
              fbLimit(20)
            )
          )
        : Promise.resolve({ docs: [] }),
    ]);
    const merged = [...snapToList(allSnap), ...snapToList(tgtSnap)]
      .sort((a, b) => {
        const ta = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime();
        const tb = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime();
        return tb - ta;
      })
      .slice(0, 20);
    return merged;
  } catch {
    return [];
  }
}

export async function createAnnouncement(announcement) {
  if (useMock()) return;
  await addDoc(collection(db, 'announcements'), {
    ...announcement,
    created_at: serverTimestamp(),
  });
}

// ── Org / Chapter Metrics ──
async function computeBase(source, chapterId) {
  if (!source) return 0;
  if (source === 'pickups_meals') {
    const pickups = await fetchPickups(chapterId);
    return pickups.reduce(
      (sum, p) => sum + Math.round((p.estimated_weight_lbs || 0) * 1.2),
      0
    );
  }
  if (source === 'events_hours') {
    const events = await fetchEvents(chapterId);
    return events.reduce((sum, e) => sum + (e.filled_spots || 0) * 3, 0);
  }
  return 0;
}

function shapeMetric(row, base) {
  const adjustment = Number(row.adjustment) || 0;
  return {
    ...row,
    base,
    value: row.computed ? base + adjustment : adjustment,
  };
}

export async function fetchOrgMetrics({ scope = 'org', chapterId = null } = {}) {
  let rows;
  if (useMock()) {
    rows = mockOrgMetrics.filter((m) => {
      if (scope === 'chapter') return m.chapter_id === chapterId;
      return m.scope === 'org';
    });
  } else {
    const constraints =
      scope === 'chapter'
        ? [where('chapter_id', '==', chapterId)]
        : [where('scope', '==', 'org')];
    const snap = await getDocs(
      query(collection(db, 'org_metrics'), ...constraints, orderBy('label'))
    );
    rows = snapToList(snap);
  }

  const out = [];
  for (const row of rows) {
    const base = row.computed ? await computeBase(row.source, row.chapter_id) : 0;
    out.push(shapeMetric(row, base));
  }
  return out;
}

export async function fetchOrgMetricByKey(key, chapterId = null) {
  const all = await fetchOrgMetrics({
    scope: chapterId ? 'chapter' : 'org',
    chapterId,
  });
  return all.find((m) => m.key === key) || null;
}

export async function updateOrgMetric(id, { adjustment, label, updated_by }) {
  if (useMock()) {
    const row = mockOrgMetrics.find((m) => m.id === id);
    if (!row) return null;
    if (adjustment !== undefined) row.adjustment = Number(adjustment) || 0;
    if (label !== undefined) row.label = label;
    row.updated_by = updated_by || row.updated_by;
    row.updated_at = new Date().toISOString();
    const base = row.computed ? await computeBase(row.source, row.chapter_id) : 0;
    return shapeMetric(row, base);
  }
  const updates = { updated_at: serverTimestamp() };
  if (adjustment !== undefined) updates.adjustment = Number(adjustment) || 0;
  if (label !== undefined) updates.label = label;
  if (updated_by !== undefined) updates.updated_by = updated_by;
  const ref = doc(db, 'org_metrics', id);
  await updateDoc(ref, updates);
  const snap = await getDoc(ref);
  const data = { id: snap.id, ...snap.data() };
  const base = data.computed ? await computeBase(data.source, data.chapter_id) : 0;
  return shapeMetric(data, base);
}

export async function createOrgMetric(metric) {
  const row = {
    computed: false,
    source: null,
    adjustment: 0,
    ...metric,
  };
  if (useMock()) {
    const r = { id: `m-mock-${Date.now()}`, ...row, updated_at: new Date().toISOString() };
    mockOrgMetrics.push(r);
    return shapeMetric(r, 0);
  }
  const ref = await addDoc(collection(db, 'org_metrics'), {
    ...row,
    updated_at: serverTimestamp(),
  });
  return shapeMetric({ id: ref.id, ...row }, 0);
}

// ── Leaderboard ──
// Overall leaderboard score formula. We track impact in pounds now
// (not meals), so every lb rescued = 1 point. Hours/events keep their
// historical weights so a single big-haul pickup doesn't drown out
// volunteers who show up every weekend.
const SCORE_WEIGHTS = { lbs: 1, hours: 8, events: 25, raised: 1 };

function leaderboardCutoff(timeRange) {
  const now = new Date();
  if (timeRange === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d;
  }
  if (timeRange === 'month') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1); return d;
  }
  if (timeRange === 'year') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d;
  }
  return null;
}

export async function fetchLeaderboard({
  timeRange = 'all',
  project = 'all',
  sortBy = 'overall',
  chapterId = null,
  limit = 50,
} = {}) {
  let activities;
  if (useMock()) {
    activities = mockMemberActivity;
  } else {
    const snap = await getDocs(collection(db, 'member_activity'));
    activities = snapToList(snap);
  }

  const cutoff = leaderboardCutoff(timeRange);
  const filtered = activities.filter((a) => {
    if (cutoff && new Date(a.date) < cutoff) return false;
    if (project !== 'all' && a.project !== project) return false;
    return true;
  });

  const byUser = new Map();
  for (const a of filtered) {
    const cur = byUser.get(a.user_id) || {
      user_id: a.user_id,
      meals: 0, lbs: 0, hours: 0, events: 0, raised: 0, points: 0,
      iris: 0, evergreen: 0, hydro: 0,
    };
    cur.meals += a.meals || 0;
    cur.lbs   += a.lbs   || (a.meals ? Math.round((a.meals || 0) / 1.2) : 0);
    cur.hours += a.hours || 0;
    cur.events += a.events || 0;
    cur.raised += a.raised || 0;
    cur.points += a.points || 0;
    if (a.project === 'iris') cur.iris += (a.meals || 0) + (a.hours || 0);
    if (a.project === 'evergreen') cur.evergreen += a.hours || 0;
    if (a.project === 'hydro') cur.hydro += a.hours || 0;
    byUser.set(a.user_id, cur);
  }

  const members = await fetchAllMembers();
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const rows = [];
  for (const stats of byUser.values()) {
    const member = memberMap.get(stats.user_id);
    if (!member) continue;
    if (chapterId && member.chapter_id && member.chapter_id !== chapterId) continue;
    const score =
      stats.lbs   * SCORE_WEIGHTS.lbs +
      stats.hours * SCORE_WEIGHTS.hours +
      stats.events * SCORE_WEIGHTS.events +
      stats.raised * SCORE_WEIGHTS.raised;
    rows.push({
      ...stats,
      name: member.name,
      avatar_url: member.avatar_url || null,
      chapter: member.chapters?.name || '—',
      role: member.role,
      score,
    });
  }

  const sortKey = sortBy === 'overall' ? 'score' : sortBy;
  rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows.slice(0, limit);
}

export async function fetchUserLeaderboardStanding(userId, opts = {}) {
  const rows = await fetchLeaderboard({ ...opts, limit: 1000 });
  const idx = rows.findIndex((r) => r.user_id === userId);
  return {
    rank: idx >= 0 ? idx + 1 : null,
    total: rows.length,
    row: idx >= 0 ? rows[idx] : null,
  };
}

// ── Admin: Members ──
export async function fetchAllMembers() {
  if (useMock()) return mockMembers;
  // Don't orderBy name on the server — Firestore silently excludes
  // docs that are missing the field, so a brand-new signup that
  // hasn't completed profile yet would be invisible to execs. Sort
  // client-side instead and tolerate empty names.
  const snap = await getDocs(collection(db, 'users'));
  let list = snapToList(snap);
  // Hide tombstoned (deleted) accounts.
  list = list.filter((u) => !u.deleted_at);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!list.length) return [];

  // Hydrate chapter name like the old `users(*, chapters(name))` join did.
  const chapIds = [...new Set(list.map((u) => u.chapter_id).filter(Boolean))];
  const chapMap = new Map();
  await Promise.all(
    chapIds.map(async (cid) => {
      try {
        const c = await getDoc(doc(db, 'chapters', cid));
        if (c.exists()) chapMap.set(cid, c.data().name || '');
      } catch {}
    })
  );
  list = list.map((u) => ({
    ...u,
    chapters: u.chapter_id ? { name: chapMap.get(u.chapter_id) || '' } : null,
  }));
  return list;
}

// Idempotent: ensure a user has a /restaurants/{id} doc so they
// can post food donations. Used for two flows:
//   1. Primary role flip to 'restaurant' (updateUserRole below)
//   2. 'partner' added as a supplemental role (churches, community
//      gardens, dual-role accounts that also volunteer)
// Skips if the user already has restaurant_id stamped.
// Self-heal for the current user: creates their own
// /restaurants/{id} if it doesn't exist. Passes the strict
// user_id == auth.uid rule because the writer IS the user —
// works even before the exec-friendly rules deploy lands.
// Called from DashboardScreen on mount for any user with
// 'partner' in roles[] or role=='restaurant' who has no
// restaurant_id yet.
export async function ensureMyPartnerRecord(user) {
  if (!user?.id || useMock()) return null;
  if (user.restaurant_id) return user.restaurant_id;
  try {
    // Double-check Firestore for the restaurant_id in case the
    // local auth store is stale.
    const usnap = await getDoc(doc(db, 'users', user.id));
    if (!usnap.exists()) return null;
    const u = usnap.data();
    if (u.restaurant_id) return u.restaurant_id;

    // Belt-and-suspenders: an earlier flow (exec promotion, church
    // sign-in on another device, etc.) might already have created
    // a /restaurants doc for this user without stamping
    // restaurant_id back onto the user doc. Look for it before
    // minting a duplicate.
    const existing = await getDocs(query(
      collection(db, 'restaurants'),
      where('user_id', '==', user.id)
    ));
    if (!existing.empty) {
      const found = existing.docs[0];
      await updateDoc(doc(db, 'users', user.id), {
        restaurant_id: found.id,
        restaurant_status: found.data().status || 'pending',
      });
      return found.id;
    }

    const r = {
      user_id: user.id, // MUST equal auth.uid for the rule
      name: u.business_name || u.name || u.email || 'Partner',
      email: u.email || '',
      phone: u.phone || '',
      address: u.address || '',
      chapter_id: u.chapter_id || null,
      chapter_name: u.chapter_name || '',
      status: 'pending', // MUST be pending for the current rule
      self_created: true,
      created_at: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'restaurants'), r);
    await updateDoc(doc(db, 'users', user.id), {
      restaurant_id: ref.id,
      restaurant_status: 'pending',
    });
    return ref.id;
  } catch (e) {
    console.warn('ensureMyPartnerRecord', e);
    return null;
  }
}

export async function ensurePartnerRecordForUser(userId) {
  if (!userId) return null;
  if (useMock()) return null;
  try {
    const usnap = await getDoc(doc(db, 'users', userId));
    if (!usnap.exists()) return null;
    const u = usnap.data();
    if (u.restaurant_id) return u.restaurant_id;

    // Guard against duplicates — another flow (self-heal from the
    // church's own device, prior promotion attempt, etc.) might
    // already have created a doc for this user without stamping
    // restaurant_id back onto their user record. Link to it instead
    // of minting a duplicate. This is why Manage Restaurants was
    // showing Collierville / Emirates twice.
    const existing = await getDocs(query(
      collection(db, 'restaurants'),
      where('user_id', '==', userId)
    ));
    if (!existing.empty) {
      const found = existing.docs[0];
      await updateDoc(doc(db, 'users', userId), {
        restaurant_id: found.id,
        restaurant_status: found.data().status || 'approved',
      });
      return found.id;
    }
    const r = {
      user_id: userId,
      name: u.business_name || u.name || u.email || 'Partner',
      email: u.email || '',
      phone: u.phone || '',
      address: u.address || '',
      chapter_id: u.chapter_id || null,
      chapter_name: u.chapter_name || '',
      status: 'approved',
      promoted_from_member: true,
      created_at: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'restaurants'), r);
    await updateDoc(doc(db, 'users', userId), {
      restaurant_id: ref.id,
      restaurant_status: 'approved',
    });
    return ref.id;
  } catch (e) {
    console.warn('ensurePartnerRecordForUser', e);
    return null;
  }
}

export async function updateUserRole(userId, role) {
  if (useMock()) {
    const m = mockMembers.find((u) => u.id === userId);
    if (m) m.role = role;
    return;
  }
  await updateDoc(doc(db, 'users', userId), { role });

  // Role promoted TO restaurant: spin up a real /restaurants/{id}
  // doc so the partner shows up on Manage Restaurants. Without
  // this, flipping a user's role to 'restaurant' in Manage Members
  // only updates the user doc — Manage Restaurants reads from the
  // /restaurants collection and would skip them. Skip if the user
  // already has a restaurant_id (idempotent re-promotion).
  if (role === 'restaurant') {
    try {
      const usnap = await getDoc(doc(db, 'users', userId));
      if (!usnap.exists()) return;
      const u = usnap.data();
      if (u.restaurant_id) return; // already linked
      const r = {
        user_id: userId,
        name: u.business_name || u.name || u.email || 'Partner',
        email: u.email || '',
        phone: u.phone || '',
        address: u.address || '',
        chapter_id: u.chapter_id || null,
        chapter_name: u.chapter_name || '',
        status: 'approved', // promoted by an exec — already vetted
        promoted_from_member: true,
        created_at: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'restaurants'), r);
      await updateDoc(doc(db, 'users', userId), {
        restaurant_id: ref.id,
        restaurant_status: 'approved',
      });
    } catch (e) { console.warn('restaurant promotion sync', e); }
  }
}

export async function updateUserChapter(userId, chapterId) {
  if (useMock()) {
    const m = mockMembers.find((u) => u.id === userId);
    if (m) {
      m.chapter_id = chapterId;
      const ch = mockChapters.find((c) => c.id === chapterId);
      m.chapters = ch ? { name: ch.name } : { name: '' };
    }
    return;
  }
  await updateDoc(doc(db, 'users', userId), { chapter_id: chapterId });
}

export async function removeUser(userId) {
  if (useMock()) {
    const idx = mockMembers.findIndex((u) => u.id === userId);
    if (idx >= 0) mockMembers.splice(idx, 1);
    return;
  }
  // Profile only — auth deletion needs admin SDK / Firebase console.
  await deleteDoc(doc(db, 'users', userId));
}
