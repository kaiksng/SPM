-- Notifies every venue-staff profile when a coordinator submits a new venue
-- booking request. venue_staff is one undifferentiated pool (no per-venue
-- staff assignment exists anywhere in this schema), so "notify venue staff"
-- means every profile with that role — unlike every other notification in
-- this codebase, which resolves to one specific recipient.
--
-- Adding the notification insert means this function can no longer rely on
-- auth.uid() alone: it has to be callable from the backend's service-role
-- client now (no INSERT policy on notifications for regular users), where
-- auth.uid() is null. So this also adds the same p_actor_id fallback
-- parameter and resolution idiom decide_event_request already uses.
--
-- Adding a parameter changes the function's identity (Postgres overloads by
-- argument types) — CREATE OR REPLACE on a different signature would create
-- a second, separate overload rather than replacing this one, so the old
-- two-argument version is dropped explicitly first.
drop function if exists public.submit_venue_booking_request(uuid, uuid);

create or replace function public.submit_venue_booking_request(
  p_event_id uuid,
  p_venue_id uuid,
  p_actor_id uuid DEFAULT NULL::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  event_row public.events;
  venue_row public.venues;
  new_booking_id uuid;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit a venue booking request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id then
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
  values (p_event_id, p_venue_id, actor_id, event_row.starts_at, event_row.ends_at)
  returning id into new_booking_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    p.id,
    p_event_id,
    'venue_request'::public.notification_type,
    'New venue booking request',
    'A new venue booking request for "' || event_row.title || '" at ' || venue_row.name
      || ' is awaiting your review.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return new_booking_id;
end;
$$;

revoke all on function public.submit_venue_booking_request(uuid, uuid, uuid) from public, anon;
grant execute on function public.submit_venue_booking_request(uuid, uuid, uuid) to authenticated, service_role;
