-- Fixes a gap in 202610060004: submit_venue_booking_request only swept the
-- NEWLY requested venue's stale On Hold rows before its "one active
-- booking per event" check. If an event's hold was on a DIFFERENT venue
-- than the one now being requested, that stale row never got swept, so
-- the check (and the venue_bookings_one_active_per_event exclusion
-- constraint behind it) kept seeing it as still occupying the event and
-- wrongly blocked a legitimately new request. Sweeping by event_id
-- directly, right where that check happens, closes it regardless of which
-- venue the lapsed hold was on.
create or replace function public.expire_stale_event_hold(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_bookings
  set status = 'expired'
  where event_id = p_event_id
    and status = 'on_hold'
    and expires_at <= now();
end;
$$;

revoke all on function public.expire_stale_event_hold(uuid) from public, anon;
grant execute on function public.expire_stale_event_hold(uuid) to authenticated, service_role;

create or replace function public.submit_venue_booking_request(p_event_id uuid, p_venue_id uuid)
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

  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can have a venue booking request submitted'
      using errcode = 'check_violation';
  end if;

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

  -- Clears a stale On Hold row for THIS event (whatever venue it was on)
  -- before the one-active-per-event check below, and separately for the
  -- venue now being requested, before the overlap check further down.
  perform public.expire_stale_event_hold(p_event_id);
  perform public.expire_stale_venue_holds(p_venue_id);

  if not public.venue_booking_fits_operating_hours(p_venue_id, event_row.starts_at, event_row.ends_at) then
    raise exception 'This event''s schedule falls outside the venue''s operating days or hours'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This event already has an active venue booking request'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings vb
    where vb.venue_id = p_venue_id
      and vb.status in ('pending', 'approved', 'on_hold')
      and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(event_row.starts_at, event_row.ends_at)
  ) then
    raise exception 'This venue already has a Pending or Approved booking for part of this event''s schedule'
      using errcode = 'check_violation';
  end if;

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
