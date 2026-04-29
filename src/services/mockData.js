// Mock data used when Supabase isn't configured yet.
// Lets the full app be browsable for design/UX review.

export const mockChapters = [
  {
    id: 'ch-memphis',
    name: 'Memphis Chapter',
    city: 'Memphis',
    state: 'TN',
    status: 'active',
    member_count: 42,
  },
  {
    id: 'ch-collierville',
    name: 'Collierville Chapter',
    city: 'Collierville',
    state: 'TN',
    status: 'active',
    member_count: 18,
  },
  {
    id: 'ch-nashville',
    name: 'Nashville Chapter',
    city: 'Nashville',
    state: 'TN',
    status: 'active',
    member_count: 67,
  },
  {
    id: 'ch-atlanta',
    name: 'Atlanta Chapter',
    city: 'Atlanta',
    state: 'GA',
    status: 'active',
    member_count: 93,
  },
];

export const mockEvents = [
  {
    id: 'ev-1',
    chapter_id: 'ch-memphis',
    title: 'Saturday Food Rescue',
    project: 'iris',
    date: '2026-04-18',
    time: '9:00 AM',
    location: 'Kroger Union Ave',
    spots: 8,
    filled_spots: 3,
    description: 'Join us to rescue surplus produce and bakery items.',
  },
  {
    id: 'ev-2',
    chapter_id: 'ch-memphis',
    title: 'Shelby Farms Cleanup',
    project: 'evergreen',
    date: '2026-04-20',
    time: '10:00 AM',
    location: 'Shelby Farms Park',
    spots: 20,
    filled_spots: 12,
    description: 'Trash cleanup and native plant restoration.',
  },
  {
    id: 'ev-3',
    chapter_id: 'ch-memphis',
    title: 'Wolf River Water Testing',
    project: 'hydro',
    date: '2026-04-25',
    time: '11:00 AM',
    location: 'Wolf River Greenway',
    spots: 6,
    filled_spots: 2,
    description: 'Collect water samples for quality analysis.',
  },
];

export const mockPickups = [
  {
    id: 'pk-1',
    chapter_id: 'ch-memphis',
    restaurant_name: 'Local Bistro',
    address: '123 Main St',
    scheduled_date: '2026-04-15',
    scheduled_time: '8:00 PM',
    estimated_weight_lbs: 25,
    status: 'available',
  },
  {
    id: 'pk-2',
    chapter_id: 'ch-memphis',
    restaurant_name: 'Green Garden Cafe',
    address: '456 Poplar Ave',
    scheduled_date: '2026-04-16',
    scheduled_time: '9:30 PM',
    estimated_weight_lbs: 40,
    status: 'available',
  },
];

export const mockRestaurants = [
  {
    id: 'r-1',
    name: 'Local Bistro',
    address: '123 Main St, Memphis, TN',
    contact_name: 'Maria Alvarez',
    email: 'info@localbistro.com',
    phone: '(901) 555-0142',
    food_type: 'Italian, bakery',
    frequency: '3x/week',
    status: 'approved',
  },
  {
    id: 'r-2',
    name: 'Green Garden Cafe',
    address: '456 Poplar Ave, Memphis, TN',
    contact_name: 'Daniel Kim',
    email: 'hello@greengardencafe.com',
    phone: '(901) 555-0188',
    food_type: 'Vegetarian, salads',
    frequency: 'Daily',
    status: 'approved',
  },
  {
    id: 'r-3',
    name: 'Riverbend Pizza Co.',
    address: '801 Riverside Dr, Memphis, TN',
    contact_name: 'Sam Patel',
    email: 'sam@riverbendpizza.com',
    phone: '(901) 555-0199',
    food_type: 'Pizza, pasta',
    frequency: '2x/week',
    status: 'pending',
  },
  {
    id: 'r-4',
    name: 'Sunrise Bagels',
    address: '212 Cooper St, Memphis, TN',
    contact_name: 'Priya Shah',
    email: 'priya@sunrisebagels.com',
    phone: '(901) 555-0114',
    food_type: 'Bakery, breakfast',
    frequency: 'Daily',
    status: 'pending',
  },
  {
    id: 'r-5',
    name: 'Old Forest Tavern',
    address: '77 Madison Ave, Memphis, TN',
    contact_name: 'Marcus Lee',
    email: 'marcus@oldforesttavern.com',
    phone: '(901) 555-0177',
    food_type: 'Pub food',
    frequency: 'Weekly',
    status: 'rejected',
  },
];

export const mockNotifications = [
  {
    id: 'n-1',
    user_id: 'u-1',
    title: 'New event near you',
    body: 'Saturday Food Rescue is happening this weekend!',
    read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'n-2',
    user_id: 'u-1',
    title: 'Welcome to BetterNature',
    body: 'Thanks for joining the movement.',
    read: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const mockMemberOfMonth = {
  id: 'mom-1',
  chapter_id: 'ch-memphis',
  month: 4,
  year: 2026,
  reason: 'Rescued over 200 lbs of food this month!',
  users: { name: 'Jordan Rivers', avatar_url: null },
};

export const mockAnimalsHelped = [
  { id: 'a-1', species: 'Sea Turtle', count: 12, chapter_id: 'ch-memphis' },
  { id: 'a-2', species: 'Songbird', count: 48, chapter_id: 'ch-memphis' },
  { id: 'a-3', species: 'Honeybee Colony', count: 3, chapter_id: 'ch-memphis' },
];

export const mockAnnouncements = [
  {
    id: 'an-1',
    title: 'Monthly all-hands Sunday',
    body: 'Join us on Zoom this Sunday at 7pm to hear chapter updates.',
    target: 'all',
    created_at: new Date().toISOString(),
    users: { name: 'Satvik K.' },
  },
];

export const mockDonations = [
  {
    id: 'd-1',
    user_id: 'mock-restaurant',
    amount: 50,
    recurring: false,
    method: 'apple_pay',
    source: 'restaurant_sponsorship',
    status: 'succeeded',
    donor_name: 'Local Bistro',
    created_at: '2026-04-08T17:23:00.000Z',
  },
  {
    id: 'd-2',
    user_id: 'u-3',
    amount: 25,
    recurring: true,
    method: 'apple_pay',
    source: 'monthly_donation',
    status: 'succeeded',
    donor_name: 'Avery Thompson',
    created_at: '2026-04-05T12:14:00.000Z',
  },
  {
    id: 'd-3',
    user_id: 'u-7',
    amount: 100,
    recurring: false,
    method: 'apple_pay',
    source: 'one_time_donation',
    status: 'succeeded',
    donor_name: 'Jordan Rivers',
    created_at: '2026-04-02T09:45:00.000Z',
  },
  {
    id: 'd-4',
    user_id: 'mock-restaurant',
    amount: 75,
    recurring: false,
    method: 'apple_pay',
    source: 'restaurant_sponsorship',
    status: 'succeeded',
    donor_name: 'Green Garden Cafe',
    created_at: '2026-03-29T15:02:00.000Z',
  },
  {
    id: 'd-5',
    user_id: 'u-12',
    amount: 10,
    recurring: true,
    method: 'apple_pay',
    source: 'monthly_donation',
    status: 'succeeded',
    donor_name: 'Riley Park',
    created_at: '2026-03-22T18:30:00.000Z',
  },
];

export const mockUserSignups = [];

export const mockBadges = [
  { id: 'b-1', user_id: 'u-1', name: 'First Rescue', earned_at: new Date().toISOString() },
];

export const mockChecklistProgress = [
  { id: 'cp-1', chapter_id: 'ch-memphis', item_key: 'register_chapter', status: 'done' },
  { id: 'cp-2', chapter_id: 'ch-memphis', item_key: 'recruit_officers', status: 'done' },
  { id: 'cp-3', chapter_id: 'ch-memphis', item_key: 'first_event', status: 'done' },
  { id: 'cp-4', chapter_id: 'ch-memphis', item_key: 'partner_restaurant', status: 'in_progress' },
  { id: 'cp-5', chapter_id: 'ch-memphis', item_key: 'monthly_meeting', status: 'pending' },
];

// Org-wide and chapter-scoped impact metrics. Some are auto-computed from
// source tables (pickups, events) and stored as a base value plus a manual
// adjustment offset; others are pure manual entries (hygiene kits, trees, etc).
// Both exec and chapter pres can edit these — pres only sees their own chapter.
export const mockOrgMetrics = [
  {
    id: 'm-1',
    key: 'meals_rescued_org',
    label: 'Meals Rescued',
    scope: 'org',
    chapter_id: null,
    project: 'iris',
    unit: 'meals',
    computed: true,
    source: 'pickups_meals',
    adjustment: 3836,
    updated_by: 'System',
    updated_at: '2026-04-10T12:00:00.000Z',
  },
  {
    id: 'm-2',
    key: 'volunteer_hours_org',
    label: 'Volunteer Hours',
    scope: 'org',
    chapter_id: null,
    project: null,
    unit: 'hours',
    computed: true,
    source: 'events_hours',
    adjustment: 240,
    updated_by: 'System',
    updated_at: '2026-04-10T12:00:00.000Z',
  },
  {
    id: 'm-3',
    key: 'hygiene_kits',
    label: 'Hygiene Kits Donated',
    scope: 'org',
    chapter_id: null,
    project: null,
    unit: 'kits',
    computed: false,
    source: null,
    adjustment: 412,
    updated_by: 'Satvik K.',
    updated_at: '2026-04-08T14:30:00.000Z',
  },
  {
    id: 'm-4',
    key: 'trees_planted',
    label: 'Trees Planted',
    scope: 'org',
    chapter_id: null,
    project: 'evergreen',
    unit: 'trees',
    computed: false,
    source: null,
    adjustment: 87,
    updated_by: 'Satvik K.',
    updated_at: '2026-04-07T10:15:00.000Z',
  },
  {
    id: 'm-5',
    key: 'water_sites_tested',
    label: 'Water Sites Tested',
    scope: 'chapter',
    chapter_id: 'ch-memphis',
    project: 'hydro',
    unit: 'sites',
    computed: false,
    source: null,
    adjustment: 2,
    updated_by: 'Jordan Rivers',
    updated_at: '2026-04-06T09:00:00.000Z',
  },
  {
    id: 'm-6',
    key: 'meals_rescued_memphis',
    label: 'Meals Rescued (Memphis)',
    scope: 'chapter',
    chapter_id: 'ch-memphis',
    project: 'iris',
    unit: 'meals',
    computed: true,
    source: 'pickups_meals',
    adjustment: 0,
    updated_by: 'System',
    updated_at: '2026-04-10T12:00:00.000Z',
  },
];

// Per-volunteer activity log. Each row records one logged action and is the
// single source of truth for the leaderboard. Fields not relevant to a row
// are simply 0. Project is one of: 'iris' | 'evergreen' | 'hydro' | 'general'.
// 'general' rows (e.g. unrestricted donations, training hours) are excluded
// when the leaderboard is filtered to a specific project.
export const mockMemberActivity = [
  // Jordan Rivers — IRIS-heavy chapter pres
  { id: 'a-1', user_id: 'u-1', date: '2026-01-18', project: 'iris', meals: 60, hours: 4, events: 1, raised: 0 },
  { id: 'a-2', user_id: 'u-1', date: '2026-02-08', project: 'iris', meals: 84, hours: 5, events: 1, raised: 0 },
  { id: 'a-3', user_id: 'u-1', date: '2026-02-22', project: 'evergreen', meals: 0, hours: 6, events: 1, raised: 0 },
  { id: 'a-4', user_id: 'u-1', date: '2026-03-14', project: 'iris', meals: 96, hours: 5, events: 1, raised: 0 },
  { id: 'a-5', user_id: 'u-1', date: '2026-04-05', project: 'iris', meals: 72, hours: 4, events: 1, raised: 50 },

  // Avery Thompson — fundraiser
  { id: 'a-6', user_id: 'u-2', date: '2026-01-25', project: 'general', meals: 0, hours: 2, events: 1, raised: 100 },
  { id: 'a-7', user_id: 'u-2', date: '2026-02-12', project: 'iris', meals: 30, hours: 3, events: 1, raised: 50 },
  { id: 'a-8', user_id: 'u-2', date: '2026-03-08', project: 'hydro', meals: 0, hours: 2, events: 0, raised: 250 },
  { id: 'a-9', user_id: 'u-2', date: '2026-04-02', project: 'evergreen', meals: 0, hours: 3, events: 1, raised: 75 },

  // Riley Park — Hydro lead
  { id: 'a-10', user_id: 'u-3', date: '2026-02-01', project: 'hydro', meals: 0, hours: 5, events: 1, raised: 0 },
  { id: 'a-11', user_id: 'u-3', date: '2026-02-28', project: 'hydro', meals: 0, hours: 6, events: 1, raised: 25 },
  { id: 'a-12', user_id: 'u-3', date: '2026-03-21', project: 'hydro', meals: 0, hours: 4, events: 1, raised: 0 },
  { id: 'a-13', user_id: 'u-3', date: '2026-04-04', project: 'hydro', meals: 0, hours: 5, events: 1, raised: 0 },

  // Sam Patel — donations + IRIS
  { id: 'a-14', user_id: 'u-4', date: '2026-01-30', project: 'iris', meals: 24, hours: 2, events: 1, raised: 0 },
  { id: 'a-15', user_id: 'u-4', date: '2026-03-02', project: 'general', meals: 0, hours: 0, events: 0, raised: 500 },
  { id: 'a-16', user_id: 'u-4', date: '2026-03-19', project: 'iris', meals: 36, hours: 3, events: 1, raised: 0 },

  // Casey Nguyen — IRIS workhorse
  { id: 'a-17', user_id: 'u-5', date: '2026-01-20', project: 'iris', meals: 48, hours: 4, events: 1, raised: 0 },
  { id: 'a-18', user_id: 'u-5', date: '2026-02-06', project: 'iris', meals: 60, hours: 5, events: 1, raised: 0 },
  { id: 'a-19', user_id: 'u-5', date: '2026-02-20', project: 'iris', meals: 72, hours: 6, events: 1, raised: 0 },
  { id: 'a-20', user_id: 'u-5', date: '2026-03-08', project: 'iris', meals: 60, hours: 5, events: 1, raised: 0 },
  { id: 'a-21', user_id: 'u-5', date: '2026-03-22', project: 'iris', meals: 84, hours: 5, events: 1, raised: 0 },
  { id: 'a-22', user_id: 'u-5', date: '2026-04-05', project: 'iris', meals: 96, hours: 6, events: 1, raised: 0 },

  // Morgan Lee — Evergreen
  { id: 'a-23', user_id: 'u-6', date: '2026-02-14', project: 'evergreen', meals: 0, hours: 5, events: 1, raised: 0 },
  { id: 'a-24', user_id: 'u-6', date: '2026-03-12', project: 'evergreen', meals: 0, hours: 7, events: 1, raised: 30 },
  { id: 'a-25', user_id: 'u-6', date: '2026-04-08', project: 'evergreen', meals: 0, hours: 6, events: 1, raised: 0 },

  // Taylor Brooks — Nashville Hydro
  { id: 'a-26', user_id: 'u-7', date: '2026-02-04', project: 'hydro', meals: 0, hours: 4, events: 1, raised: 0 },
  { id: 'a-27', user_id: 'u-7', date: '2026-03-15', project: 'hydro', meals: 0, hours: 5, events: 1, raised: 100 },

  // Jamie Cruz — Atlanta all-rounder
  { id: 'a-28', user_id: 'u-8', date: '2026-01-22', project: 'iris', meals: 36, hours: 3, events: 1, raised: 0 },
  { id: 'a-29', user_id: 'u-8', date: '2026-02-19', project: 'evergreen', meals: 0, hours: 4, events: 1, raised: 0 },
  { id: 'a-30', user_id: 'u-8', date: '2026-03-10', project: 'hydro', meals: 0, hours: 3, events: 1, raised: 200 },
  { id: 'a-31', user_id: 'u-8', date: '2026-04-01', project: 'iris', meals: 48, hours: 4, events: 1, raised: 0 },

  // Drew Walker — Atlanta Evergreen
  { id: 'a-32', user_id: 'u-9', date: '2026-03-08', project: 'evergreen', meals: 0, hours: 5, events: 1, raised: 0 },
  { id: 'a-33', user_id: 'u-9', date: '2026-04-03', project: 'evergreen', meals: 0, hours: 4, events: 1, raised: 50 },

  // Quinn Harper — Collierville donor
  { id: 'a-34', user_id: 'u-10', date: '2026-02-15', project: 'iris', meals: 24, hours: 2, events: 1, raised: 150 },
  { id: 'a-35', user_id: 'u-10', date: '2026-03-30', project: 'general', meals: 0, hours: 0, events: 0, raised: 300 },
];

export const mockMembers = [
  { id: 'u-1', name: 'Jordan Rivers', email: 'jordan@betternature.app', role: 'chapter_pres', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-2', name: 'Avery Thompson', email: 'avery@betternature.app', role: 'chapter_vp', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-3', name: 'Riley Park', email: 'riley@betternature.app', role: 'chapter_sec', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-4', name: 'Sam Patel', email: 'sam@betternature.app', role: 'chapter_treas', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-5', name: 'Casey Nguyen', email: 'casey@betternature.app', role: 'volunteer', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-6', name: 'Morgan Lee', email: 'morgan@betternature.app', role: 'volunteer', chapters: { name: 'Memphis Chapter' } },
  { id: 'u-7', name: 'Taylor Brooks', email: 'taylor@betternature.app', role: 'volunteer', chapters: { name: 'Nashville Chapter' } },
  { id: 'u-8', name: 'Jamie Cruz', email: 'jamie@betternature.app', role: 'chapter_pres', chapters: { name: 'Atlanta Chapter' } },
  { id: 'u-9', name: 'Drew Walker', email: 'drew@betternature.app', role: 'volunteer', chapters: { name: 'Atlanta Chapter' } },
  { id: 'u-10', name: 'Quinn Harper', email: 'quinn@betternature.app', role: 'volunteer', chapters: { name: 'Collierville Chapter' } },
];
