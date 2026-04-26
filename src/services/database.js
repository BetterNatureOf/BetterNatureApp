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
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
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

// If a Firestore collection is empty, fall back to mock data so demos
// keep working until real records exist.
function withMockFallback(list, mock) {
  return list.length ? list : mock;
}

// ── Chapters ──
export async function fetchChapters() {
  if (useMock()) return mockChapters;
  const snap = await getDocs(
    query(collection(db, 'chapters'), where('status', '==', 'active'), orderBy('name'))
  );
  return withMockFallback(snapToList(snap), mockChapters);
}

export async function fetchChapterById(id) {
  if (useMock()) return mockChapters.find((c) => c.id === id) || mockChapters[0];
  const snap = await getDoc(doc(db, 'chapters', id));
  return snapToOne(snap) || mockChapters.find((c) => c.id === id) || mockChapters[0];
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

// ── Events ──
export async function fetchEvents(chapterId) {
  if (useMock()) {
    return chapterId ? mockEvents.filter((e) => e.chapter_id === chapterId) : mockEvents;
  }
  const today = new Date().toISOString().split('T')[0];
  const constraints = [where('date', '>=', today), orderBy('date')];
  if (chapterId) constraints.unshift(where('chapter_id', '==', chapterId));
  const snap = await getDocs(query(collection(db, 'events'), ...constraints));
  const list = snapToList(snap);
  if (list.length) return list;
  return chapterId ? mockEvents.filter((e) => e.chapter_id === chapterId) : mockEvents;
}

export async function fetchEventById(id) {
  if (useMock()) return mockEvents.find((e) => e.id === id) || mockEvents[0];
  const snap = await getDoc(doc(db, 'events', id));
  return snapToOne(snap) || mockEvents.find((e) => e.id === id) || mockEvents[0];
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

  const ref = await addDoc(collection(db, 'pickups'), {
    status: 'available',
    ...pickup,
    created_at: serverTimestamp(),
  });
  const newPk = { id: ref.id, status: 'available', ...pickup };

  // Notify chapter members
  if (pickup.chapter_id) {
    try {
      const memSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('chapter_id', '==', pickup.chapter_id)
        )
      );
      const targets = snapToList(memSnap).filter((m) =>
        ['member', 'chapter_president', 'volunteer'].includes(m.role)
      );
      await Promise.all(
        targets.map((m) =>
          addDoc(collection(db, 'notifications'), {
            user_id: m.id,
            title: 'New pickup available!',
            body: `${pickup.restaurant_name} has food ready for rescue at ${pickup.address || 'their location'}.`,
            data: { type: 'new_pickup', pickupId: ref.id },
            read: false,
            created_at: serverTimestamp(),
          })
        )
      );
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
  const list = snapToList(snap);
  if (list.length) return list;
  return chapterId ? mockPickups.filter((p) => p.chapter_id === chapterId) : mockPickups;
}

export async function claimPickup(pickupId, userId) {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    return pk ? { ...pk, status: 'claimed', claimed_by: userId } : null;
  }
  const ref = doc(db, 'pickups', pickupId);
  await updateDoc(ref, {
    status: 'claimed',
    claimed_by: userId,
    claimed_at: new Date().toISOString(),
  });
  const snap = await getDoc(ref);
  return snapToOne(snap);
}

export async function completePickup(pickupId, actualWeightLbs) {
  if (useMock()) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    if (pk) {
      pk.status = 'completed';
      pk.completed_at = new Date().toISOString();
      const weight = actualWeightLbs || pk.estimated_weight_lbs || 0;
      const meals = Math.round(weight * 1.2);
      if (pk.claimed_by) {
        mockMemberActivity.push({
          id: `a-pk-${Date.now()}`,
          user_id: pk.claimed_by,
          date: new Date().toISOString().split('T')[0],
          project: 'iris',
          meals,
          hours: 1,
          events: 0,
          raised: 0,
          source_type: 'pickup_complete',
          source_id: pickupId,
        });
        const member = mockMembers.find((m) => m.id === pk.claimed_by);
        if (member) {
          member.meals_rescued = (member.meals_rescued || 0) + meals;
          member.hours_logged = (member.hours_logged || 0) + 1;
        }
      }
    }
    return;
  }

  const pkRef = doc(db, 'pickups', pickupId);
  const pkSnap = await getDoc(pkRef);
  if (!pkSnap.exists()) throw new Error('Pickup not found');
  const pk = pkSnap.data();

  const weight = actualWeightLbs || pk.estimated_weight_lbs || 0;
  const meals = Math.round(weight * 1.2);
  const now = new Date().toISOString();

  await updateDoc(pkRef, {
    status: 'completed',
    actual_weight_lbs: weight,
    completed_at: now,
  });

  if (pk.claimed_by) {
    await addDoc(collection(db, 'member_activity'), {
      user_id: pk.claimed_by,
      date: now.split('T')[0],
      project: 'iris',
      meals,
      hours: 1,
      events: 0,
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
        await updateDoc(userRef, {
          meals_rescued: (p.meals_rescued || 0) + meals,
          hours_logged: (p.hours_logged || 0) + 1,
        });
      }
    } catch (e) { console.warn('user stat bump', e); }

    await addDoc(collection(db, 'notifications'), {
      user_id: pk.claimed_by,
      title: 'Pickup complete!',
      body: `You rescued ~${meals} meals from ${pk.restaurant_name}. Amazing work!`,
      data: { type: 'pickup_complete', pickupId },
      read: false,
      created_at: serverTimestamp(),
    });
  }
}

// ── Restaurants ──
export async function fetchRestaurants(status = 'approved') {
  if (useMock()) return mockRestaurants.filter((r) => r.status === status);
  const snap = await getDocs(
    query(
      collection(db, 'restaurants'),
      where('status', '==', status),
      orderBy('name')
    )
  );
  return withMockFallback(
    snapToList(snap),
    mockRestaurants.filter((r) => r.status === status)
  );
}

export async function createRestaurant(restaurant) {
  if (useMock()) return { id: `r-mock-${Date.now()}`, ...restaurant };
  const ref = await addDoc(collection(db, 'restaurants'), {
    ...restaurant,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...restaurant };
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
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      fbLimit(50)
    )
  );
  return withMockFallback(snapToList(snap), mockNotifications);
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
    if (!list.length) return mockMemberOfMonth;
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
    return mockMemberOfMonth;
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
  const list = snapToList(snap);
  if (list.length) return list;
  return chapterId ? mockAnimalsHelped.filter((a) => a.chapter_id === chapterId) : mockAnimalsHelped;
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
    return withMockFallback(merged, mockAnnouncements);
  } catch {
    return mockAnnouncements;
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
    if (!rows.length) {
      rows = mockOrgMetrics.filter((m) =>
        scope === 'chapter' ? m.chapter_id === chapterId : m.scope === 'org'
      );
    }
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
const SCORE_WEIGHTS = { meals: 1, hours: 8, events: 25, raised: 1 };

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
    if (!activities.length) activities = mockMemberActivity;
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
      meals: 0, hours: 0, events: 0, raised: 0,
      iris: 0, evergreen: 0, hydro: 0,
    };
    cur.meals += a.meals || 0;
    cur.hours += a.hours || 0;
    cur.events += a.events || 0;
    cur.raised += a.raised || 0;
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
      stats.meals * SCORE_WEIGHTS.meals +
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
  const snap = await getDocs(query(collection(db, 'users'), orderBy('name')));
  let list = snapToList(snap);
  if (!list.length) return mockMembers;

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

export async function updateUserRole(userId, role) {
  if (useMock()) {
    const m = mockMembers.find((u) => u.id === userId);
    if (m) m.role = role;
    return;
  }
  await updateDoc(doc(db, 'users', userId), { role });
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
