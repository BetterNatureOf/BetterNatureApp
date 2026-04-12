import { supabase, isSupabaseConfigured } from '../config/supabase';
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

// ── Chapters ──
export async function fetchChapters() {
  if (!isSupabaseConfigured) return mockChapters;
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchChapterById(id) {
  if (!isSupabaseConfigured) return mockChapters.find((c) => c.id === id) || mockChapters[0];
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createChapter(chapter) {
  if (!isSupabaseConfigured) return { id: `ch-mock-${Date.now()}`, ...chapter };
  const { data, error } = await supabase
    .from('chapters')
    .insert(chapter)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChapter(id, updates) {
  if (!isSupabaseConfigured) return { id, ...updates };
  const { data, error } = await supabase
    .from('chapters')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Events ──
export async function fetchEvents(chapterId) {
  if (!isSupabaseConfigured) {
    return chapterId ? mockEvents.filter((e) => e.chapter_id === chapterId) : mockEvents;
  }
  let query = supabase
    .from('events')
    .select('*')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date');

  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchEventById(id) {
  if (!isSupabaseConfigured) return mockEvents.find((e) => e.id === id) || mockEvents[0];
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createEvent(event) {
  if (!isSupabaseConfigured) return { id: `ev-mock-${Date.now()}`, ...event };
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// In-memory signup list for mock mode.
const _mockSignups = [];

export async function signUpForEvent(eventId, userId) {
  if (!isSupabaseConfigured) {
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
  const { error: signupError } = await supabase
    .from('event_signups')
    .insert({ event_id: eventId, user_id: userId });
  if (signupError) throw signupError;

  const { error: updateError } = await supabase.rpc('increment_filled_spots', {
    event_id_input: eventId,
  });
  if (updateError) {
    const event = await fetchEventById(eventId);
    await supabase
      .from('events')
      .update({ filled_spots: (event.filled_spots || 0) + 1 })
      .eq('id', eventId);
  }
}

export async function cancelEventSignup(eventId, userId) {
  if (!isSupabaseConfigured) {
    const idx = _mockSignups.findIndex(
      (s) => s.event_id === eventId && s.user_id === userId
    );
    if (idx >= 0) _mockSignups.splice(idx, 1);
    const ev = mockEvents.find((e) => e.id === eventId);
    if (ev) ev.filled_spots = Math.max(0, (ev.filled_spots || 0) - 1);
    return;
  }
  const { error: deleteError } = await supabase
    .from('event_signups')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  const event = await fetchEventById(eventId);
  await supabase
    .from('events')
    .update({ filled_spots: Math.max(0, (event.filled_spots || 0) - 1) })
    .eq('id', eventId);
}

export async function getUserSignups(userId) {
  if (!isSupabaseConfigured) {
    return _mockSignups
      .filter((s) => s.user_id === userId && s.status !== 'cancelled')
      .map((s) => s.event_id);
  }
  const { data, error } = await supabase
    .from('event_signups')
    .select('event_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map((s) => s.event_id);
}

// Return all signups for an event with user names hydrated.
export async function fetchEventSignups(eventId) {
  if (!isSupabaseConfigured) {
    return _mockSignups
      .filter((s) => s.event_id === eventId && s.status !== 'cancelled')
      .map((s) => {
        const member = mockMembers.find((m) => m.id === s.user_id);
        return { ...s, user_name: member?.name || 'Volunteer' };
      });
  }
  const { data, error } = await supabase
    .from('event_signups')
    .select('*, users(name)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .order('created_at');
  if (error) throw error;
  return data.map((row) => ({
    ...row,
    user_name: row.users?.name || 'Volunteer',
  }));
}

// ── Check-in + auto-activity ──
// Called by pres/exec to confirm a volunteer actually showed up.
// Creates a member_activity row so the leaderboard updates instantly.
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

  if (!isSupabaseConfigured) {
    const su = _mockSignups.find((s) => s.id === signupId);
    if (su) {
      su.status = 'checked_in';
      su.checked_in_by = checkedInBy;
      su.checked_in_at = now;
    }
    // Auto-log activity
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
    // Update the user's running totals on the mock member
    const member = mockMembers.find((m) => m.id === userId);
    if (member) {
      member.events_attended = (member.events_attended || 0) + 1;
      member.hours_logged = (member.hours_logged || 0) + hours;
      member.meals_rescued = (member.meals_rescued || 0) + meals;
    }
    return;
  }

  // 1. Update signup status
  const { error: suError } = await supabase
    .from('event_signups')
    .update({ status: 'checked_in', checked_in_by: checkedInBy, checked_in_at: now })
    .eq('id', signupId);
  if (suError) throw suError;

  // 2. Insert activity row
  const { error: actError } = await supabase.from('member_activity').insert({
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
  if (actError) throw actError;

  // 3. Bump user running totals
  const { error: userError } = await supabase.rpc('increment_user_stats', {
    uid: userId,
    add_events: 1,
    add_hours: hours,
    add_meals: meals,
  });
  // If the RPC doesn't exist yet, do it manually
  if (userError) {
    const profile = await supabase
      .from('users')
      .select('events_attended, hours_logged, meals_rescued')
      .eq('id', userId)
      .single();
    if (profile.data) {
      await supabase
        .from('users')
        .update({
          events_attended: (profile.data.events_attended || 0) + 1,
          hours_logged: (profile.data.hours_logged || 0) + hours,
          meals_rescued: (profile.data.meals_rescued || 0) + meals,
        })
        .eq('id', userId);
    }
  }

  // 4. Send notification to the volunteer
  await supabase.from('notifications').insert({
    user_id: userId,
    title: 'Hours logged!',
    body: `You were checked in for ${hours}h` +
      (meals > 0 ? ` and ${meals} meals rescued` : '') +
      '. Keep it up!',
    data: { type: 'checkin_confirmed', eventId },
  });
}

export async function markNoShow(signupId) {
  if (!isSupabaseConfigured) {
    const su = _mockSignups.find((s) => s.id === signupId);
    if (su) su.status = 'no_show';
    return;
  }
  const { error } = await supabase
    .from('event_signups')
    .update({ status: 'no_show' })
    .eq('id', signupId);
  if (error) throw error;
}

// ── Pickups ──
// Create a new pickup and notify all volunteers in the chapter.
export async function createPickup(pickup) {
  if (!isSupabaseConfigured) {
    const newPk = {
      id: `pk-mock-${Date.now()}`,
      status: 'available',
      ...pickup,
    };
    mockPickups.push(newPk);
    // In mock mode we can't really push-notify, but we add a
    // mock in-app notification for each chapter member.
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

  const { data, error } = await supabase
    .from('pickups')
    .insert({ status: 'available', ...pickup })
    .select()
    .single();
  if (error) throw error;

  // Notify all volunteers in the chapter
  if (pickup.chapter_id) {
    const { data: members } = await supabase
      .from('users')
      .select('id')
      .eq('chapter_id', pickup.chapter_id)
      .in('role', ['member', 'chapter_president']);
    if (members?.length) {
      const notifs = members.map((m) => ({
        user_id: m.id,
        title: 'New pickup available!',
        body: `${pickup.restaurant_name} has food ready for rescue at ${pickup.address || 'their location'}.`,
        data: { type: 'new_pickup', pickupId: data.id },
      }));
      await supabase.from('notifications').insert(notifs);
    }
  }
  return data;
}

export async function fetchPickups(chapterId) {
  if (!isSupabaseConfigured) {
    return chapterId ? mockPickups.filter((p) => p.chapter_id === chapterId) : mockPickups;
  }
  let query = supabase
    .from('pickups')
    .select('*')
    .eq('status', 'available')
    .order('scheduled_date');

  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function claimPickup(pickupId, userId) {
  if (!isSupabaseConfigured) {
    const pk = mockPickups.find((p) => p.id === pickupId);
    return pk ? { ...pk, status: 'claimed', claimed_by: userId } : null;
  }
  const { data, error } = await supabase
    .from('pickups')
    .update({
      status: 'claimed',
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', pickupId)
    .eq('status', 'available')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Complete a pickup — marks it done and auto-logs the meals + 1 hour to
// the volunteer's activity. The volunteer gets a notification too.
export async function completePickup(pickupId, actualWeightLbs) {
  if (!isSupabaseConfigured) {
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

  // Fetch pickup to get volunteer + weight
  const { data: pk, error: fetchErr } = await supabase
    .from('pickups')
    .select('*')
    .eq('id', pickupId)
    .single();
  if (fetchErr) throw fetchErr;

  const weight = actualWeightLbs || pk.estimated_weight_lbs || 0;
  const meals = Math.round(weight * 1.2);
  const now = new Date().toISOString();

  // 1. Mark completed
  const { error } = await supabase
    .from('pickups')
    .update({
      status: 'completed',
      actual_weight_lbs: weight,
      completed_at: now,
    })
    .eq('id', pickupId);
  if (error) throw error;

  // 2. Log activity for the volunteer
  if (pk.claimed_by) {
    await supabase.from('member_activity').insert({
      user_id: pk.claimed_by,
      date: now.split('T')[0],
      project: 'iris',
      meals,
      hours: 1,
      events: 0,
      raised: 0,
      source_type: 'pickup_complete',
      source_id: pickupId,
    });

    // Bump user stats
    const { data: profile } = await supabase
      .from('users')
      .select('meals_rescued, hours_logged')
      .eq('id', pk.claimed_by)
      .single();
    if (profile) {
      await supabase
        .from('users')
        .update({
          meals_rescued: (profile.meals_rescued || 0) + meals,
          hours_logged: (profile.hours_logged || 0) + 1,
        })
        .eq('id', pk.claimed_by);
    }

    // Notify volunteer
    await supabase.from('notifications').insert({
      user_id: pk.claimed_by,
      title: 'Pickup complete!',
      body: `You rescued ~${meals} meals from ${pk.restaurant_name}. Amazing work!`,
      data: { type: 'pickup_complete', pickupId },
    });
  }
}

// ── Restaurants ──
export async function fetchRestaurants(status = 'approved') {
  if (!isSupabaseConfigured) return mockRestaurants.filter((r) => r.status === status);
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('status', status)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createRestaurant(restaurant) {
  if (!isSupabaseConfigured) return { id: `r-mock-${Date.now()}`, ...restaurant };
  const { data, error } = await supabase
    .from('restaurants')
    .insert(restaurant)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRestaurant(id, updates) {
  if (!isSupabaseConfigured) return { id, ...updates };
  const { data, error } = await supabase
    .from('restaurants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Donations ──
export async function recordDonation(donation) {
  if (!isSupabaseConfigured) return { id: `d-mock-${Date.now()}`, ...donation };
  const { data, error } = await supabase
    .from('donations')
    .insert(donation)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDonationHistory(userId) {
  if (!isSupabaseConfigured) {
    if (!userId) return mockDonations;
    return mockDonations.filter((d) => d.user_id === userId);
  }
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchAllDonations() {
  if (!isSupabaseConfigured) return mockDonations;
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Notifications ──
export async function fetchNotifications(userId) {
  if (!isSupabaseConfigured) return mockNotifications;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function markNotificationRead(notifId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId);
  if (error) throw error;
}

export async function createNotification(notif) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('notifications').insert(notif);
  if (error) throw error;
}

// ── Member of the Month ──
export async function fetchMemberOfMonth(chapterId) {
  if (!isSupabaseConfigured) return mockMemberOfMonth;
  const now = new Date();
  const { data, error } = await supabase
    .from('member_of_month')
    .select('*, users(name, avatar_url)')
    .eq('chapter_id', chapterId)
    .eq('month', now.getMonth() + 1)
    .eq('year', now.getFullYear())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ── Badges ──
export async function fetchUserBadges(userId) {
  if (!isSupabaseConfigured) return mockBadges;
  const { data, error } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Checklist ──
export async function fetchChecklistProgress(chapterId) {
  if (!isSupabaseConfigured) return mockChecklistProgress;
  const { data, error } = await supabase
    .from('checklist_progress')
    .select('*')
    .eq('chapter_id', chapterId);
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(chapterId, itemKey, status) {
  if (!isSupabaseConfigured) return;
  const { data: existing } = await supabase
    .from('checklist_progress')
    .select('id')
    .eq('chapter_id', chapterId)
    .eq('item_key', itemKey)
    .single();

  if (existing) {
    await supabase
      .from('checklist_progress')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('checklist_progress')
      .insert({ chapter_id: chapterId, item_key: itemKey, status });
  }
}

// ── Animals ──
export async function fetchAnimalsHelped(chapterId) {
  if (!isSupabaseConfigured) {
    return chapterId ? mockAnimalsHelped.filter((a) => a.chapter_id === chapterId) : mockAnimalsHelped;
  }
  let query = supabase.from('animals_helped').select('*');
  if (chapterId) query = query.eq('chapter_id', chapterId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Announcements ──
export async function fetchAnnouncements(target) {
  if (!isSupabaseConfigured) return mockAnnouncements;
  const { data, error } = await supabase
    .from('announcements')
    .select('*, users(name)')
    .or(`target.eq.all,target.eq.${target}`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function createAnnouncement(announcement) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('announcements').insert(announcement);
  if (error) throw error;
}

// ── Org / Chapter Metrics ──
// Computed metrics use a base value derived from source tables (pickups,
// events) plus a manual adjustment offset that exec/pres can edit. Manual
// metrics ignore the source and just expose the adjustment as the value.
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
  const rows = !isSupabaseConfigured
    ? mockOrgMetrics.filter((m) => {
        if (scope === 'chapter') return m.chapter_id === chapterId;
        return m.scope === 'org';
      })
    : await (async () => {
        let query = supabase.from('org_metrics').select('*').order('label');
        if (scope === 'chapter') query = query.eq('chapter_id', chapterId);
        else query = query.eq('scope', 'org');
        const { data, error } = await query;
        if (error) throw error;
        return data;
      })();

  const out = [];
  for (const row of rows) {
    const base = row.computed
      ? await computeBase(row.source, row.chapter_id)
      : 0;
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
  if (!isSupabaseConfigured) {
    const row = mockOrgMetrics.find((m) => m.id === id);
    if (!row) return null;
    if (adjustment !== undefined) row.adjustment = Number(adjustment) || 0;
    if (label !== undefined) row.label = label;
    row.updated_by = updated_by || row.updated_by;
    row.updated_at = new Date().toISOString();
    const base = row.computed ? await computeBase(row.source, row.chapter_id) : 0;
    return shapeMetric(row, base);
  }
  const updates = { updated_at: new Date().toISOString() };
  if (adjustment !== undefined) updates.adjustment = Number(adjustment) || 0;
  if (label !== undefined) updates.label = label;
  if (updated_by !== undefined) updates.updated_by = updated_by;
  const { data, error } = await supabase
    .from('org_metrics')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const base = data.computed ? await computeBase(data.source, data.chapter_id) : 0;
  return shapeMetric(data, base);
}

export async function createOrgMetric(metric) {
  const row = {
    id: `m-mock-${Date.now()}`,
    computed: false,
    source: null,
    adjustment: 0,
    updated_at: new Date().toISOString(),
    ...metric,
  };
  if (!isSupabaseConfigured) {
    mockOrgMetrics.push(row);
    return shapeMetric(row, 0);
  }
  const { data, error } = await supabase
    .from('org_metrics')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return shapeMetric(data, 0);
}

// ── Leaderboard ──
// Single source of truth for who's doing the most. Aggregates the
// member_activity log into per-volunteer totals, then sorts by the chosen
// metric. Filters: time window + project. The "overall" sort uses a simple
// weighted score so an all-rounder beats someone with one giant donation.
//
// Score weights — tunable in one place:
//   1 point per meal rescued
//   8 points per volunteer hour
//   25 points per event attended
//   1 point per dollar raised
const SCORE_WEIGHTS = { meals: 1, hours: 8, events: 25, raised: 1 };

function leaderboardCutoff(timeRange) {
  const now = new Date();
  if (timeRange === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (timeRange === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (timeRange === 'year') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return null; // 'all'
}

export async function fetchLeaderboard({
  timeRange = 'all',
  project = 'all',
  sortBy = 'overall',
  chapterId = null,
  limit = 50,
} = {}) {
  // Pull raw activity rows.
  let activities;
  if (!isSupabaseConfigured) {
    activities = mockMemberActivity;
  } else {
    const { data, error } = await supabase
      .from('member_activity')
      .select('*');
    if (error) throw error;
    activities = data || [];
  }

  // Apply filters before aggregation so totals match what's displayed.
  const cutoff = leaderboardCutoff(timeRange);
  const filtered = activities.filter((a) => {
    if (cutoff && new Date(a.date) < cutoff) return false;
    if (project !== 'all') {
      // 'general' rows belong to no specific project, so they're excluded
      // when the user picks a project filter — only matching project rows count.
      if (a.project !== project) return false;
    }
    return true;
  });

  // Aggregate per user.
  const byUser = new Map();
  for (const a of filtered) {
    const cur = byUser.get(a.user_id) || {
      user_id: a.user_id,
      meals: 0,
      hours: 0,
      events: 0,
      raised: 0,
      iris: 0,
      evergreen: 0,
      hydro: 0,
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

  // Hydrate with member name + chapter so the screen doesn't need a join.
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

  // Sort by chosen metric. 'overall' → composite score.
  const sortKey = sortBy === 'overall' ? 'score' : sortBy;
  rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  // Assign ranks based on the active sort.
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rows.slice(0, limit);
}

// Look up a single user's leaderboard standing under the given filters.
// Returns { rank, total, row } so the profile/impact screens can display
// "you're #4 of 12 this month" without re-implementing the aggregation.
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
  if (!isSupabaseConfigured) return mockMembers;
  const { data, error } = await supabase
    .from('users')
    .select('*, chapters(name)')
    .order('name');
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId, role) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}
