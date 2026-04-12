-- ============================================================
-- Better Nature — Full Supabase schema
-- Paste this into Supabase → SQL Editor → Run once.
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Chapters (created first because users references it) ───
create table public.chapters (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text default '',
  state text default '',
  status text not null default 'active'
    check (status in ('active','inactive','pending')),
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Users ──────────────────────────────────────────────────
-- Extends Supabase Auth. Every signup creates a row here too.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default '',
  phone text default '',
  city text default '',
  zip text default '',
  role text not null default 'member'
    check (role in ('member','restaurant','chapter_president','executive')),
  chapter_id uuid references public.chapters(id) on delete set null,
  avatar_url text,
  push_token text,
  id_document_url text,
  events_attended int not null default 0,
  meals_rescued int not null default 0,
  hours_logged int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Events ─────────────────────────────────────────────────
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  title text not null,
  project text not null default 'iris'
    check (project in ('iris','evergreen','hydro','general')),
  date date not null,
  time text,
  location text,
  description text,
  spots int not null default 20,
  filled_spots int not null default 0,
  hours_per_volunteer numeric(4,1) not null default 3,
  meals_per_volunteer int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Event signups ──────────────────────────────────────────
create table public.event_signups (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'signed_up'
    check (status in ('signed_up','checked_in','no_show','cancelled')),
  checked_in_by uuid references public.users(id),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- ── Restaurants (before pickups, which references it) ──────
create table public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  contact_name text,
  email text,
  phone text,
  food_type text,
  frequency text,
  status text not null default 'pending'
    check (status in ('approved','pending','rejected')),
  user_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ── Pickups ────────────────────────────────────────────────
create table public.pickups (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id),
  restaurant_name text not null,
  address text,
  scheduled_date date not null,
  scheduled_time text,
  estimated_weight_lbs numeric(6,1) not null default 0,
  actual_weight_lbs numeric(6,1),
  status text not null default 'available'
    check (status in ('available','claimed','in_progress','completed','cancelled')),
  claimed_by uuid references public.users(id),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Donations ──────────────────────────────────────────────
create table public.donations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id),
  amount numeric(10,2) not null,
  recurring boolean default false,
  method text default 'apple_pay',
  source text,
  status text not null default 'succeeded',
  donor_name text,
  created_at timestamptz not null default now()
);

-- ── Member activity (leaderboard source of truth) ──────────
-- One row per logged action. Created automatically on check-in
-- or pickup completion. Also allows manual entries by exec/pres.
create table public.member_activity (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null default current_date,
  project text not null default 'general'
    check (project in ('iris','evergreen','hydro','general')),
  meals int not null default 0,
  hours numeric(5,1) not null default 0,
  events int not null default 0,
  raised numeric(10,2) not null default 0,
  source_type text not null default 'manual'
    check (source_type in ('event_checkin','pickup_complete','donation','manual')),
  source_id uuid,
  created_at timestamptz not null default now()
);

-- ── Org metrics (exec/pres editable impact numbers) ────────
create table public.org_metrics (
  id uuid primary key default uuid_generate_v4(),
  key text not null,
  label text not null,
  scope text not null default 'org'
    check (scope in ('org','chapter')),
  chapter_id uuid references public.chapters(id),
  project text,
  unit text,
  computed boolean not null default false,
  source text,
  adjustment numeric(12,2) not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ── Notifications ──────────────────────────────────────────
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text,
  read boolean not null default false,
  data jsonb default '{}',
  created_at timestamptz not null default now()
);

-- ── Announcements ──────────────────────────────────────────
create table public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text,
  target text not null default 'all',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ── Member of the month ────────────────────────────────────
create table public.member_of_month (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid not null references public.chapters(id),
  user_id uuid not null references public.users(id),
  month int not null,
  year int not null,
  reason text,
  unique(chapter_id, month, year)
);

-- ── Animals helped ─────────────────────────────────────────
create table public.animals_helped (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid references public.chapters(id),
  species text not null,
  count int not null default 0
);

-- ── Badges ─────────────────────────────────────────────────
create table public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  earned_at timestamptz not null default now()
);

-- ── Checklist progress ─────────────────────────────────────
create table public.checklist_progress (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  item_key text not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','done')),
  updated_at timestamptz default now(),
  unique(chapter_id, item_key)
);

-- ============================================================
-- Indexes for common queries
-- ============================================================
create index idx_events_chapter on public.events(chapter_id, date);
create index idx_event_signups_event on public.event_signups(event_id);
create index idx_event_signups_user on public.event_signups(user_id);
create index idx_pickups_chapter on public.pickups(chapter_id, status);
create index idx_pickups_claimed on public.pickups(claimed_by);
create index idx_member_activity_user on public.member_activity(user_id, date);
create index idx_member_activity_project on public.member_activity(project, date);
create index idx_notifications_user on public.notifications(user_id, read);
create index idx_org_metrics_scope on public.org_metrics(scope, chapter_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.users enable row level security;
alter table public.chapters enable row level security;
alter table public.events enable row level security;
alter table public.event_signups enable row level security;
alter table public.pickups enable row level security;
alter table public.restaurants enable row level security;
alter table public.donations enable row level security;
alter table public.member_activity enable row level security;
alter table public.org_metrics enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;

-- Users can read all profiles, update their own; executives can update anyone
create policy "Anyone can read users" on public.users for select using (true);
create policy "Users update own profile" on public.users for update using (auth.uid() = id);
create policy "Exec can manage users" on public.users for update
  using (exists (select 1 from public.users where id = auth.uid() and role = 'executive'));
create policy "Exec can delete users" on public.users for delete
  using (exists (select 1 from public.users where id = auth.uid() and role = 'executive'));

-- Chapters are public
create policy "Anyone can read chapters" on public.chapters for select using (true);
create policy "Exec can manage chapters" on public.chapters for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'executive'));

-- Events are public to read
create policy "Anyone can read events" on public.events for select using (true);
create policy "Pres/exec can manage events" on public.events for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('chapter_president','executive')));

-- Event signups
create policy "Anyone can read signups" on public.event_signups for select using (true);
create policy "Users manage own signups" on public.event_signups for insert with check (auth.uid() = user_id);
create policy "Users cancel own signups" on public.event_signups for delete using (auth.uid() = user_id);
create policy "Pres/exec can check in" on public.event_signups for update
  using (exists (select 1 from public.users where id = auth.uid() and role in ('chapter_president','executive')));

-- Pickups
create policy "Anyone can read pickups" on public.pickups for select using (true);
create policy "Users claim pickups" on public.pickups for update using (true);
create policy "Pres/exec can manage pickups" on public.pickups for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('chapter_president','executive','restaurant')));

-- Restaurants
create policy "Anyone can read restaurants" on public.restaurants for select using (true);
create policy "Exec can manage restaurants" on public.restaurants for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'executive'));

-- Donations
create policy "Users read own donations" on public.donations for select using (auth.uid() = user_id);
create policy "Exec reads all donations" on public.donations for select
  using (exists (select 1 from public.users where id = auth.uid() and role = 'executive'));
create policy "Anyone can donate" on public.donations for insert with check (true);

-- Activity
create policy "Anyone can read activity" on public.member_activity for select using (true);
create policy "System inserts activity" on public.member_activity for insert with check (true);

-- Metrics
create policy "Anyone can read metrics" on public.org_metrics for select using (true);
create policy "Pres/exec can edit metrics" on public.org_metrics for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('chapter_president','executive')));

-- Notifications
create policy "Users read own notifs" on public.notifications for select using (auth.uid() = user_id);
create policy "System inserts notifs" on public.notifications for insert with check (true);
create policy "Users mark own read" on public.notifications for update using (auth.uid() = user_id);

-- Announcements are public
create policy "Anyone can read announcements" on public.announcements for select using (true);
create policy "Pres/exec can post" on public.announcements for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role in ('chapter_president','executive')));

-- ============================================================
-- Helper function: increment filled_spots
-- ============================================================
create or replace function public.increment_filled_spots(event_id_input uuid)
returns void as $$
begin
  update public.events
  set filled_spots = filled_spots + 1
  where id = event_id_input;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Trigger: auto-create user profile row on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count int;
begin
  select count(*) into user_count from public.users;

  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when user_count = 0 then 'executive' else 'member' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
