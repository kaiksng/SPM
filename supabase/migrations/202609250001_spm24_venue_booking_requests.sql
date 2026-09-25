-- SPM-24: Submit a Venue Booking Request.
--
-- "As an Event Coordinator, I want to submit a venue booking request for a
-- specific Planning event, so that Venue Staff can decide whether the venue
-- should be committed."
--
-- AC01 Given the required information is complete and the venue is
--      available, when the coordinator submits the request, then its status
--      becomes Pending and the period appears as Pending Booking.
-- AC02 Given mandatory information is missing, when submission is
--      attempted, then the request is blocked and the missing information
--      is identified.
-- AC03 Given the venue is blocked or has an overlapping Pending or
--      Confirmed booking, when submission is attempted, then the request is
--      rejected and the conflict is identified.
-- AC04 Given an event already has a Pending or Confirmed venue booking
--      request, when the coordinator attempts to submit another for that
--      same event, then the request is rejected and the existing booking is
--      identified as the conflict.
-- AC05 Given a coordinator withdraws a Pending request before it is
--      confirmed, when the withdrawal is submitted, then the request is
--      withdrawn and the venue period is released back to Available.
-- AC06 A booking request references a specific Planning event, venue,
--      requested period, expected attendance, and the venue requirements
--      Venue Staff need to assess it.
-- AC07 The requested period must fall within the venue's operating days and
--      hours.
-- AC08 A venue period is always in exactly one of these states: Available,
--      Pending Booking, Confirmed, Blocked.
--
-- Scope, per the refinement: this story owns submit + withdraw only.
-- Venue Staff's decide action (confirm/reject) is a separate, unbuilt
-- story — venue_bookings.status already includes 'confirmed'/'rejected' so
-- that story only needs to add its own write path, not new schema. Same for
-- venue management (creating venues, blocking a venue): venues and
-- venue_blocks exist here only as the minimal supporting structure AC03/AC07
-- need to be real and testable; neither table has an INSERT/UPDATE/DELETE
-- policy for any role yet, and no UI creates venues or blocks. A few sample
-- venues are seeded below purely so this story is exercisable end-to-end —
-- clearly test/seed data, not a venue-management feature.
--
-- AC08's four states are never a stored column: "Available" is simply the
-- absence of an active (pending/confirmed) booking or block for a given
-- period. Storing it separately would let it drift from the bookings/blocks
-- that actually determine it.
--
-- AC06's "expected attendance" and "venue requirements" are read from the
-- referenced event (events.expected_attendance, event_venue_requirements)
-- rather than duplicated onto venue_bookings — one source of truth.
-- submit_event_request already guarantees expected_attendance is non-null
-- before an event can ever reach Planning, so AC02's "mandatory information
-- missing" below only needs to check the booking request's own inputs
-- (venue, period) — the event side is already guaranteed complete by the
-- time this RPC can be reached.

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  capacity integer not null check (capacity > 0),
  -- ISO 8601 weekday numbers the venue operates on: 1 = Monday .. 7 = Sunday.
  operating_days smallint[] not null check (
    operating_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and cardinality(operating_days) > 0
  ),
  operating_starts_time time not null,
  operating_ends_time time not null check (operating_ends_time > operating_starts_time),
  created_at timestamptz not null default now()
);

alter table public.venues enable row level security;

-- Read-only for now: any authenticated user can see the venue directory
-- (matches VenuesPage, already visible to organiser/coordinator/admin).
-- No write policy — venue management is a separate, unbuilt story.
create policy "venues visible to authenticated users" on public.venues
for select to authenticated using (true);

-- Explicit blocks a member of Venue Staff has placed on a venue (maintenance,
-- closures, etc.) — the write side (who can create one, from what UI) is
-- deliberately left to whichever story builds venue management. This table
-- exists now only so AC03's "the venue is blocked" clause has something real
-- to check against; RLS enables no policy at all, so nothing can read or
-- write it through PostgREST yet — only a SECURITY DEFINER function (like
-- submit_venue_booking_request below) can see it.
create table public.venue_blocks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.venue_blocks enable row level security;

create index venue_blocks_venue_period_idx on public.venue_blocks (venue_id, starts_at, ends_at);

create type public.venue_booking_status as enum ('pending', 'confirmed', 'rejected', 'withdrawn');

create table public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id uuid not null references public.venues (id),
  requested_by uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status public.venue_booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id)
);

alter table public.venue_bookings enable row level security;

create index venue_bookings_venue_period_idx on public.venue_bookings (venue_id, starts_at, ends_at)
  where status in ('pending', 'confirmed');
create index venue_bookings_event_idx on public.venue_bookings (event_id)
  where status in ('pending', 'confirmed');

-- Narrow by default, the same way event_field_changes started (PB-07): the
-- assigned coordinator and an administrator only. Venue Staff have no read
-- access yet — their own decide-the-booking story adds it when it exists,
-- the same way this story's own submit/withdraw RPCs are the only write
-- path (no direct-table policy at all, mirroring update_event_as_coordinator
-- rather than a plain RLS insert/update policy, so every business rule
-- funnels through one place).
create policy "assigned coordinator views own venue bookings" on public.venue_bookings
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = venue_bookings.event_id
      and (
        e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() = 'administrator'::public.user_role
      )
  )
);

create or replace function public.submit_venue_booking_request(
  p_event_id uuid,
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  event_row public.events;
  venue_row public.venues;
  new_booking_id uuid;
  local_starts_at timestamp;
  local_ends_at timestamp;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to submit a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  select * into event_row from public.events where id = p_event_id;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid()
    and actor_role <> 'administrator'::public.user_role
  then
    raise exception 'Only the assigned coordinator can submit a venue booking request for this event'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC06: a booking request is against a specific Planning event.
  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can have a venue booking request submitted'
      using errcode = 'check_violation';
  end if;

  -- AC02: missing mandatory information — the booking request's own
  -- required inputs. (The event's expected attendance, the other piece
  -- AC06 lists, is already guaranteed non-null by submit_event_request
  -- before an event can reach Planning at all.)
  if p_venue_id is null then
    raise exception 'Select a venue before submitting'
      using errcode = 'check_violation';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Enter the requested period before submitting'
      using errcode = 'check_violation';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'The requested period''s end must be after its start'
      using errcode = 'check_violation';
  end if;

  select * into venue_row from public.venues where id = p_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC07: the requested period must fall within the venue's operating days
  -- and hours, read in Asia/Singapore local time — the zone the rest of the
  -- app already displays every date/time in (see e.g. EventDetailPage's
  -- dateTimeFormatter). `::date`/`::time` on a timestamptz directly would
  -- instead convert through the database session's own timezone (UTC here),
  -- silently checking the wrong wall-clock hours. Checked per calendar day
  -- the period touches, so a multi-day request must keep to operating hours
  -- on every one of those days.
  local_starts_at := p_starts_at at time zone 'Asia/Singapore';
  local_ends_at := p_ends_at at time zone 'Asia/Singapore';

  if exists (
    select 1
    from generate_series(local_starts_at::date, local_ends_at::date, interval '1 day') as day
    where extract(isodow from day)::smallint <> all (venue_row.operating_days)
  ) then
    raise exception 'The requested period falls outside the venue''s operating days'
      using errcode = 'check_violation';
  end if;
  if local_starts_at::time < venue_row.operating_starts_time
    or local_ends_at::time > venue_row.operating_ends_time
  then
    raise exception 'The requested period falls outside the venue''s operating hours'
      using errcode = 'check_violation';
  end if;

  -- AC04: one event may have at most one active (Pending or Confirmed)
  -- venue booking request, regardless of venue.
  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'confirmed')
  ) then
    raise exception 'This event already has an active venue booking request'
      using errcode = 'check_violation';
  end if;

  -- AC03: the venue is blocked for an overlapping period.
  if exists (
    select 1 from public.venue_blocks vbl
    where vbl.venue_id = p_venue_id
      and vbl.starts_at < p_ends_at
      and vbl.ends_at > p_starts_at
  ) then
    raise exception 'This venue is blocked for part of the requested period'
      using errcode = 'check_violation';
  end if;

  -- AC03: the venue already has an overlapping Pending or Confirmed booking.
  if exists (
    select 1 from public.venue_bookings vb
    where vb.venue_id = p_venue_id
      and vb.status in ('pending', 'confirmed')
      and vb.starts_at < p_ends_at
      and vb.ends_at > p_starts_at
  ) then
    raise exception 'This venue already has a Pending or Confirmed booking for part of the requested period'
      using errcode = 'check_violation';
  end if;

  -- AC01: previous value/new value style history isn't relevant here (this
  -- is a new row, not a field edit) — the row itself, with its status and
  -- created_at, is the record of what was requested and when.
  insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at)
  values (p_event_id, p_venue_id, auth.uid(), p_starts_at, p_ends_at)
  returning id into new_booking_id;

  return new_booking_id;
end;
$$;

revoke all on function public.submit_venue_booking_request(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.submit_venue_booking_request(uuid, uuid, timestamptz, timestamptz) from anon;
grant execute on function public.submit_venue_booking_request(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.submit_venue_booking_request(uuid, uuid, timestamptz, timestamptz) to service_role;

create or replace function public.withdraw_venue_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  booking_row public.venue_bookings;
  event_row public.events;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to withdraw a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  select * into booking_row from public.venue_bookings where id = p_booking_id;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = booking_row.event_id;

  if event_row.assigned_coordinator_id is distinct from auth.uid()
    and actor_role <> 'administrator'::public.user_role
  then
    raise exception 'Only the assigned coordinator can withdraw this venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC05: only while Pending — a Confirmed or already-Rejected request has
  -- left Pending, so there is nothing left to withdraw either way.
  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be withdrawn'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'withdrawn'
  where id = p_booking_id;

  return p_booking_id;
end;
$$;

revoke all on function public.withdraw_venue_booking_request(uuid) from public;
revoke all on function public.withdraw_venue_booking_request(uuid) from anon;
grant execute on function public.withdraw_venue_booking_request(uuid) to authenticated;
grant execute on function public.withdraw_venue_booking_request(uuid) to service_role;

-- Sample venues so the feature is exercisable end-to-end — test/seed data,
-- not a venue-management feature (nothing else creates a venue yet).
insert into public.venues (name, capacity, operating_days, operating_starts_time, operating_ends_time)
values
  ('Main Auditorium', 500, array[1, 2, 3, 4, 5]::smallint[], '08:00', '22:00'),
  ('Conference Room A', 40, array[1, 2, 3, 4, 5]::smallint[], '08:00', '18:00'),
  ('Outdoor Pavilion', 200, array[1, 2, 3, 4, 5, 6, 7]::smallint[], '09:00', '21:00');
