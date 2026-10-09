-- submit_venue_booking_request: its own inline operating-hours/overlap/
-- block checks are replaced by one call to check_venue_booking_availability
-- (the new shared source of truth), so submission and the frontend's
-- proactive pre-check can never drift apart. The venue-row lookup becomes
-- `for update`, serializing concurrent submissions against the same venue —
-- tightening the race window the (deliberately unbuffered) EXCLUDE
-- constraint no longer fully covers once conflicts depend on a live,
-- cross-table setup/turnaround lookup.
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
  v_availability jsonb;
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

  select * into venue_row from public.venues where id = p_venue_id for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- Clears a stale On Hold row for THIS event (whatever venue it was on)
  -- before the one-active-per-event check below, and separately for the
  -- venue now being requested, before the availability check further down.
  perform public.expire_stale_event_hold(p_event_id);
  perform public.expire_stale_venue_holds(p_venue_id);

  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This event already has an active venue booking request'
      using errcode = 'check_violation';
  end if;

  v_availability := public.check_venue_booking_availability(p_venue_id, p_event_id);
  if not (v_availability ->> 'available')::boolean then
    raise exception '%', (v_availability ->> 'reason')
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

-- decide_venue_booking_request: on the approved path only, a new buffered
-- availability re-check before confirming. This function previously had no
-- overlap check at all (it trusted submission-time prevention) — closing
-- this gap matters because a booking can sit Pending for a while, during
-- which another booking's setup/turnaround (or a new block, or the venue's
-- own buffer values changing) could make this one's effective window
-- conflict even though it didn't at submission time. Rejection needs no
-- such check — it only ever releases a slot, never claims one.
create or replace function public.decide_venue_booking_request(
  p_booking_id uuid,
  p_decision public.venue_booking_decision_type,
  p_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  booking_row public.venue_bookings;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  new_status public.request_status;
  v_availability jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide a venue booking request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can decide a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC02: only rejection requires a reason.
  if p_decision = 'rejected' and reason_value is null then
    raise exception 'Explain the reason for rejecting this venue booking request'
      using errcode = 'check_violation';
  end if;

  select * into booking_row
  from public.venue_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be approved or rejected'
      using errcode = 'check_violation';
  end if;

  if p_decision = 'approved' then
    perform 1 from public.venues where id = booking_row.venue_id for update;

    v_availability := public.check_venue_booking_availability(booking_row.venue_id, booking_row.event_id);
    if not (v_availability ->> 'available')::boolean then
      raise exception '%', (v_availability ->> 'reason')
        using errcode = 'check_violation';
    end if;
  end if;

  new_status := case p_decision when 'approved' then 'approved' else 'rejected' end;

  -- AC01/AC02/AC03: record the outcome, the decider, the reason (if any),
  -- and the timestamp in one place, same columns either way.
  update public.venue_bookings
  set status = new_status,
      decided_by = actor_id,
      decision_notes = reason_value,
      decided_at = now()
  where id = p_booking_id;

  -- AC04: the requesting coordinator is notified either way.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    booking_row.requested_by,
    booking_row.event_id,
    'venue_decision'::public.notification_type,
    case p_decision when 'approved' then 'Venue booking approved' else 'Venue booking rejected' end,
    case p_decision
      when 'approved' then 'Your venue booking request has been approved. The venue is now a confirmed booking for this period.'
      else 'Your venue booking request was rejected. ' || coalesce(reason_value, '')
    end
  );

  return jsonb_build_object('bookingId', p_booking_id, 'status', new_status::text, 'decidedAt', now());
end;
$$;

revoke all on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) from public;
revoke all on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) from anon;
grant execute on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) to authenticated;
grant execute on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) to service_role;
