-- Venue Catalogue: location, capacity, facilities, accessibility, supported
-- layouts, operating information and recorded periods of unavailability
-- (Venue Catalogue + Venue Availability Calendar).
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  location text,
  capacity integer check (capacity is null or capacity > 0),
  description text,
  operating_hours text,
  accessibility_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venue_facilities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  facility_name text not null check (char_length(trim(facility_name)) > 0),
  unique (venue_id, facility_name)
);

create table public.venue_layouts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  layout_name text not null check (char_length(trim(layout_name)) > 0),
  max_capacity integer check (max_capacity is null or max_capacity > 0),
  unique (venue_id, layout_name)
);

-- Recorded periods a venue is unavailable outside of confirmed bookings
-- (maintenance, closures, etc.) — venue_bookings (202609220004) covers
-- unavailability caused by an actual booking.
create table public.venue_unavailability (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  constraint venue_unavailability_time_order check (ends_at > starts_at)
);

create index venue_facilities_venue_idx on public.venue_facilities (venue_id);
create index venue_layouts_venue_idx on public.venue_layouts (venue_id);
create index venue_unavailability_venue_idx on public.venue_unavailability (venue_id, starts_at);

create trigger venues_set_updated_at before update on public.venues
for each row execute function public.set_updated_at();

alter table public.venues enable row level security;
alter table public.venue_facilities enable row level security;
alter table public.venue_layouts enable row level security;
alter table public.venue_unavailability enable row level security;

-- Catalogue data is non-sensitive and every staff role needs to browse it
-- (coordinators searching/booking, venue staff managing, organisers seeing
-- what's available) — readable by any authenticated user, writable only by
-- venue staff and administrators.
create policy "venues readable by authenticated users" on public.venues
for select to authenticated using (true);
create policy "venues managed by venue staff" on public.venues
for all to authenticated
using (public.current_user_role() in ('venue_staff', 'administrator'))
with check (public.current_user_role() in ('venue_staff', 'administrator'));

create policy "venue facilities readable by authenticated users" on public.venue_facilities
for select to authenticated using (true);
create policy "venue facilities managed by venue staff" on public.venue_facilities
for all to authenticated
using (public.current_user_role() in ('venue_staff', 'administrator'))
with check (public.current_user_role() in ('venue_staff', 'administrator'));

create policy "venue layouts readable by authenticated users" on public.venue_layouts
for select to authenticated using (true);
create policy "venue layouts managed by venue staff" on public.venue_layouts
for all to authenticated
using (public.current_user_role() in ('venue_staff', 'administrator'))
with check (public.current_user_role() in ('venue_staff', 'administrator'));

create policy "venue unavailability readable by authenticated users" on public.venue_unavailability
for select to authenticated using (true);
create policy "venue unavailability managed by venue staff" on public.venue_unavailability
for all to authenticated
using (public.current_user_role() in ('venue_staff', 'administrator'))
with check (public.current_user_role() in ('venue_staff', 'administrator'));
