-- Conflict re-check: "existing bookings that now conflict because of setup
-- or turnaround time ... identified, so that they can be resolved instead
-- of silently removed."
--
-- A booking's "effective window" is its requested period expanded by the
-- venue's own setup_time_minutes before and turnaround_time_minutes after.
-- The exclusion constraints on venue_bookings (venue_bookings_no_overlap)
-- only ever compare raw starts_at/ends_at, so two Pending/Approved bookings
-- that were valid when requested can become conflicting purely because a
-- buffer was increased afterwards — this table is the record of that,
-- deliberately separate from venue_bookings.needs_review (the existing
-- capacity-reduction flag): that one is a single boolean/reason with no
-- "which other booking" and no clearing, neither of which fits a conflict,
-- which always involves a second booking or block, and which a later
-- re-check must be able to clear automatically.
create table public.venue_booking_conflicts (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.venue_bookings (id) on delete cascade,
  -- Exactly one of these is set — the other side of the conflict.
  conflicting_booking_id uuid references public.venue_bookings (id) on delete cascade,
  conflicting_block_id uuid references public.venue_unavailability (id) on delete cascade,
  cause text not null,
  -- Booking-vs-booking conflicts insert one row per booking, each pointing
  -- at the other; only the later-created booking's row is responsible —
  -- "the coordinator of the later-created booking is expected to resolve
  -- it." A booking-vs-block conflict only ever has one row (a block has no
  -- coordinator to make responsible instead), always responsible.
  is_responsible boolean not null default true,
  flagged_at timestamptz not null default now(),
  flagged_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  constraint venue_booking_conflicts_one_other_side check (
    (conflicting_booking_id is not null) <> (conflicting_block_id is not null)
  )
);

create index venue_booking_conflicts_booking_idx
  on public.venue_booking_conflicts (booking_id) where resolved_at is null;
create index venue_booking_conflicts_conflicting_booking_idx
  on public.venue_booking_conflicts (conflicting_booking_id) where resolved_at is null;
create index venue_booking_conflicts_conflicting_block_idx
  on public.venue_booking_conflicts (conflicting_block_id) where resolved_at is null;

alter table public.venue_booking_conflicts enable row level security;

-- No insert/update/delete policy for authenticated users — only
-- recheck_venue_conflicts (security definer) writes here.
create policy "venue staff view conflicts" on public.venue_booking_conflicts
for select to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role);

-- A coordinator sees conflicts on their own bookings too — "a booking
-- flagged Conflict - Needs Review" is something they need to act on, not
-- just something Venue Staff tracks.
create policy "coordinator views conflicts on their own bookings" on public.venue_booking_conflicts
for select to authenticated
using (
  exists (
    select 1 from public.venue_bookings vb
    where vb.id = venue_booking_conflicts.booking_id
      and vb.requested_by = auth.uid()
  )
);
