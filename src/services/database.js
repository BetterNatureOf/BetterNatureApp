import { supabase } from '../config/supabase';

// ── Chapters ──
export async function fetchChapters() {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchChapterById(id) {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createChapter(chapter) {
  const { data, error } = await supabase
    .from('chapters')
    .insert(chapter)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChapter(id, updates) {
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
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createEvent(event) {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function signUpForEvent(eventId, userId) {
  const { error: signupError } = await supabase
    .from('event_signups')
    .insert({ event_id: eventId, user_id: userId });
  if (signupError) throw signupError;

  const { error: updateError } = await supabase.rpc('increment_filled_spots', {
    event_id_input: eventId,
  });
  if (updateError) {
    // Fallback: manual increment
    const event = await fetchEventById(eventId);
    await supabase
      .from('events')
      .update({ filled_spots: (event.filled_spots || 0) + 1 })
      .eq('id', eventId);
  }
}

export async function cancelEventSignup(eventId, userId) {
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
  const { data, error } = await supabase
    .from('event_signups')
    .select('event_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map((s) => s.event_id);
}

// ── Pickups ──
export async function fetchPickups(chapterId) {
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

export async function completePickup(pickupId) {
  const { error } = await supabase
    .from('pickups')
    .update({ status: 'completed' })
    .eq('id', pickupId);
  if (error) throw error;
}

// ── Restaurants ──
export async function fetchRestaurants(status = 'approved') {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('status', status)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createRestaurant(restaurant) {
  const { data, error } = await supabase
    .from('restaurants')
    .insert(restaurant)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRestaurant(id, updates) {
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
  const { data, error } = await supabase
    .from('donations')
    .insert(donation)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDonationHistory(userId) {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Notifications ──
export async function fetchNotifications(userId) {
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
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId);
  if (error) throw error;
}

export async function createNotification(notif) {
  const { error } = await supabase.from('notifications').insert(notif);
  if (error) throw error;
}

// ── Member of the Month ──
export async function fetchMemberOfMonth(chapterId) {
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
  const { data, error } = await supabase
    .from('checklist_progress')
    .select('*')
    .eq('chapter_id', chapterId);
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(chapterId, itemKey, status) {
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
  let query = supabase.from('animals_helped').select('*');
  if (chapterId) query = query.eq('chapter_id', chapterId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Announcements ──
export async function fetchAnnouncements(target) {
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
  const { error } = await supabase.from('announcements').insert(announcement);
  if (error) throw error;
}

// ── Admin: Members ──
export async function fetchAllMembers() {
  const { data, error } = await supabase
    .from('users')
    .select('*, chapters(name)')
    .order('name');
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}
