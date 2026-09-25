-- SPM-24: Submit a Venue Booking Request — the missing coordinator-facing
-- write path on top of the venue catalogue/booking schema this builds on
-- (202609220002/202609220004 and friends).
--
-- What already existed before this migration:
--   * public.venues, public.venue_bookings (with a gist exclusion
--     constraint preventing two Pending/Approved bookings from overlapping
--     for the same venue), public.venue_unavailability.
--   * "coordinators request venue bookings": a raw RLS INSERT policy any
--     assigned... actually any event_coordinator can already insert through
--     (it checks can_view_event, not "assigned to this event" — see below).
--   * SuggestedVenuesPanel/SuggestedVenueCard on the frontend, whose
--     "Select venue" button is an explicit, deliberate stub
--     (aria-disabled, "Selecting a venue is not available yet") — booking a
--     venue for an event was never wired up to anything.
--
-- What this migration adds (SPM-24's own confirmed scope):
--   AC04 One event may have at most one active (Pending/Approved) venue
--        booking request — enforced here the same way the existing
--        venue-side conflict is (a gist exclusion constraint), not just an
--        application check, so it holds regardless of write path.
--   AC07 The requested period must fall within the venue's operating days
--        and hours (public.venues.operating_hours, Asia/Singapore local
--        time — the zone the rest of the app already displays in).
--   A submit_venue_booking_request RPC that is the actual "Select venue"
--   write path: narrows "coordinators request venue bookings" to the
--   *assigned* coordinator specifically (matching every other
--   coordinator-authored write in this schema — update_event_as_coordinator,
--   decide_event_request, etc.), and raises a specific, identifiable error
--   for each rule (AC02/AC03/AC04/AC07) instead of a generic RLS denial.
--   A withdraw_venue_booking_request RPC for the requesting coordinator
--   (AC05) — no coordinator-facing update path existed before this; the
--   existing UPDATE policy is venue-staff-only (their decide action).

-- AC04.
alter table public.venue_bookings
  add constraint venue_bookings_one_active_per_event
  exclude using gist (
    event_id with =
  ) where (status in ('pending', 'approved'));

-- AC07. operating_hours is an OperatingHoursPeriod[] ({ days: DayCode[],
-- opensAt: "HH:MM", closesAt: "HH:MM" }, packages/shared's OperatingHours) —
-- a day absent from every period is closed that day. Checked per calendar
-- day the period touches (Asia/Singapore local time), so a multi-day
-- request must keep to operating hours on every one of those days; each
-- day's own start/end-of-day boundary is compared against that same day's
-- period, not the whole event's start/end time, so only the first and last
-- day are ever bounded by the actual booked times.
create or replace function public.venue_booking_fits_operating_hours(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_periods jsonb;
  v_local_start timestamp;
  v_local_end timestamp;
  v_day date;
  v_day_code text;
  v_day_start time;
  v_day_end time;
  v_period jsonb;
  v_day_ok boolean;
begin
  select operating_hours into v_periods from public.venues where id = p_venue_id;

  if v_periods is null or jsonb_array_length(v_periods) = 0 then
    return false;
  end if;

  v_local_start := p_starts_at at time zone 'Asia/Singapore';
  v_local_end := p_ends_at at time zone 'Asia/Singapore';

  for v_day in select generate_series(v_local_start::date, v_local_end::date, interval '1 day')::date
  loop
    v_day_code := (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[extract(isodow from v_day)::int];
    v_day_start := case when v_day = v_local_start::date then v_local_start::time else '00:00'::time end;
    v_day_end := case when v_day = v_local_end::date then v_local_end::time else '23:59:59'::time end;
    v_day_ok := false;

    for v_period in select * from jsonb_array_elements(v_periods)
    loop
      if (v_period -> 'days') ? v_day_code
        and v_day_start >= (v_period ->> 'opensAt')::time
        and v_day_end <= (v_period ->> 'closesAt')::time
      then
        v_day_ok := true;
      end if;
    end loop;

    if not v_day_ok then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.submit_venue_booking_request(
  p_event_id uuid,
  p_venue_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  venue_row public.venues;
  new_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to submit a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the assigned coordinator can submit a venue booking request for this event'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC06 (this story's own scope note): a booking request is only ever
  -- against a specific Planning event.
  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can have a venue booking request submitted'
      using errcode = 'check_violation';
  end if;

  -- AC02: missing mandatory information. The booking's period comes from
  -- the event's own schedule (the same design SuggestedVenuesPanel/
  -- find_matching_venues already use — a coordinator doesn't re-enter
  -- dates, they book the event's own window) rather than being entered
  -- here, and submit_event_request already guarantees a non-null schedule
  -- before an event can reach Planning at all — so the schedule check below
  -- is a defensive belt-and-braces guard, not something a real submission
  -- can actually trigger. p_venue_id is the one input this RPC genuinely
  -- requires that a caller could omit (bypassing the UI, which never sends
  -- one blank).
  if event_row.starts_at is null or event_row.ends_at is null then
    raise exception 'Set this event''s schedule before requesting a venue'
      using errcode = 'check_violation';
  end if;
  if p_venue_id is null then
    raise exception 'Select a venue before submitting'
      using errcode = 'check_violation';
  end if;

  select * into venue_row from public.venues where id = p_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC07.
  if not public.venue_booking_fits_operating_hours(p_venue_id, event_row.starts_at, event_row.ends_at) then
    raise exception 'This event''s schedule falls outside the venue''s operating days or hours'
      using errcode = 'check_violation';
  end if;

  -- AC04: one event may have at most one active (Pending/Approved) venue
  -- booking request, regardless of venue. Also enforced by
  -- venue_bookings_one_active_per_event as a defense-in-depth guarantee;
  -- checked explicitly here first so the coordinator gets this specific
  -- message rather than a raw constraint-violation error.
  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved')
  ) then
    raise exception 'This event already has an active venue booking request'
      using errcode = 'check_violation';
  end if;

  -- AC03: the venue already has an overlapping Pending/Approved booking.
  -- Also backed by venue_bookings_no_overlap (202609220004) the same way.
  if exists (
    select 1 from public.venue_bookings vb
    where vb.venue_id = p_venue_id
      and vb.status in ('pending', 'approved')
      and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(event_row.starts_at, event_row.ends_at)
  ) then
    raise exception 'This venue already has a Pending or Approved booking for part of this event''s schedule'
      using errcode = 'check_violation';
  end if;

  -- AC03: an operational block (maintenance, closures, etc.).
  if exists (
    select 1 from public.venue_unavailability vu
    where vu.venue_id = p_venue_id
      and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(event_row.starts_at, event_row.ends_at)
  ) then
    raise exception 'This venue is unavailable for part of this event''s schedule'
      using errcode = 'check_violation';
  end if;

  insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at)
  values (p_event_id, p_venue_id, auth.uid(), event_row.starts_at, event_row.ends_at)
  returning id into new_booking_id;

  return new_booking_id;
end;
$$;

revoke all on function public.submit_venue_booking_request(uuid, uuid) from public;
revoke all on function public.submit_venue_booking_request(uuid, uuid) from anon;
grant execute on function public.submit_venue_booking_request(uuid, uuid) to authenticated;
grant execute on function public.submit_venue_booking_request(uuid, uuid) to service_role;

-- AC05: only the requesting coordinator may withdraw, and only while
-- Pending — an Approved/Rejected/already-Cancelled request has left
-- Pending, so there's nothing left to withdraw either way.
create or replace function public.withdraw_venue_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.venue_bookings;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to withdraw a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row from public.venue_bookings where id = p_booking_id;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.requested_by is distinct from auth.uid() then
    raise exception 'Only the coordinator who submitted this request can withdraw it'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be withdrawn'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'cancelled'
  where id = p_booking_id;

  return p_booking_id;
end;
$$;

revoke all on function public.withdraw_venue_booking_request(uuid) from public;
revoke all on function public.withdraw_venue_booking_request(uuid) from anon;
grant execute on function public.withdraw_venue_booking_request(uuid) to authenticated;
grant execute on function public.withdraw_venue_booking_request(uuid) to service_role;
