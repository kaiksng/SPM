-- Venue Booking Request/Approval + Booking Conflict Detection.
create extension if not exists btree_gist;

create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id uuid not null references public.venues (id),
  requested_by uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decision_notes text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint venue_bookings_time_order check (ends_at > starts_at),
  -- Booking Conflict Detection: no two pending/approved bookings for the
  -- same venue may overlap in time. Rejected/cancelled bookings are excluded
  -- so a prior rejection never blocks a later request for the same slot.
  constraint venue_bookings_no_overlap exclude using gist (
    venue_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'approved'))
);

create index venue_bookings_event_idx on public.venue_bookings (event_id);
create index venue_bookings_venue_idx on public.venue_bookings (venue_id, status);

alter table public.venue_bookings enable row level security;

create policy "venue bookings visible to participants" on public.venue_bookings
for select to authenticated
using (public.can_view_event(event_id) or public.current_user_role() in ('venue_staff', 'administrator'));

-- Mirrors decide_event_request's shape: coordinators create booking requests
-- for events they're assigned to (or an administrator, same as every other
-- coordinator-authored write in this schema).
create policy "coordinators request venue bookings" on public.venue_bookings
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() in ('event_coordinator', 'administrator')
  and public.can_view_event(event_id)
);

create policy "venue staff decide venue bookings" on public.venue_bookings
for update to authenticated
using (public.current_user_role() in ('venue_staff', 'administrator'))
with check (public.current_user_role() in ('venue_staff', 'administrator'));
