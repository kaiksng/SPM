-- SPM-19: booking submission must ignore retained blocks after removal.
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
    where vu.venue_id = p_venue_id and vu.removed_at is null
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

