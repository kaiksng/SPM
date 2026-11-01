-- A coordinator replaces a conflicted venue booking the way they replace a
-- disrupted one (SPM-82), instead of booking another venue and cancelling.
--
-- 1. request_replacement_venue also accepts a booking that has to move
--    because of a conflict: requested after the booking it overlaps, or
--    overlapping a venue block (is_responsible, 202611010013). Disrupted
--    bookings are handled exactly as before.
-- 2. decide_venue_booking_request: approving the replacement already
--    cancels the original, and the replacement takes over its main-venue
--    role. Now the original's conflicts are resolved too, on both sides, so
--    the event booked first is not left waiting for a re-check. A rejected
--    replacement says the original still clashes, rather than "disrupted".

create or replace function public.request_replacement_venue(p_booking_id uuid, p_venue_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  original public.venue_bookings;
  event_row public.events;
  venue_row public.venues;
  original_venue_name text;
  new_booking_id uuid;
  v_availability jsonb;
  v_missing text;
  v_advisory text := '';
  v_disrupted boolean;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot request a replacement venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to request a replacement venue'
      using errcode = 'insufficient_privilege';
  end if;

  select * into original from public.venue_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Venue booking not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = original.event_id;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can request a replacement venue for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status not in ('planning', 'confirmed') then
    raise exception 'A replacement venue can only be requested for a Planning or Confirmed event'
      using errcode = 'check_violation';
  end if;

  -- A stale hold stops being active the moment anyone next acts on it.
  perform public.expire_stale_event_hold(original.event_id);
  select * into original from public.venue_bookings where id = p_booking_id;

  if original.status not in ('pending', 'approved', 'on_hold') then
    raise exception 'Only an active venue booking can be replaced'
      using errcode = 'check_violation';
  end if;

  v_disrupted := exists (
    select 1 from public.venue_booking_disruptions d
    where d.booking_id = original.id and d.cleared_at is null
  );

  -- A booking that has to move because of a conflict (booked after the one
  -- it overlaps, or over a venue block) is replaced the same way.
  if not v_disrupted and not exists (
    select 1 from public.venue_booking_conflicts c
    where c.booking_id = original.id and c.resolved_at is null and c.is_responsible
  ) then
    raise exception 'This venue booking is not disrupted, so it does not need a replacement'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings r
    where r.replaces_booking_id = original.id
      and r.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This venue booking already has a pending replacement request'
      using errcode = 'check_violation';
  end if;

  if p_venue_id is null then
    raise exception 'Select a venue before submitting'
      using errcode = 'check_violation';
  end if;
  if p_venue_id = original.venue_id then
    raise exception 'Choose a different venue from the one that is unavailable'
      using errcode = 'check_violation';
  end if;

  -- The replacement covers the same period; a different date or time is a
  -- change request (SPM-38), not a replacement.
  if original.starts_at < event_row.starts_at or original.ends_at > event_row.ends_at then
    raise exception 'This booking no longer matches the event''s schedule. Submit a change request to change the date or time'
      using errcode = 'check_violation';
  end if;

  select * into venue_row from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.expire_stale_venue_holds(p_venue_id);

  if original.expected_headcount is not null
    and venue_row.capacity < original.expected_headcount then
    raise exception 'This venue''s capacity (%) is below this booking''s expected headcount (%)',
      venue_row.capacity, original.expected_headcount
      using errcode = 'check_violation';
  end if;

  -- A required facility the venue lacks makes it unsuitable, the same rule
  -- the venue search and suggestions use (case-insensitive name match). The
  -- brief names this alongside capacity as the case where a venue should not
  -- normally be treated as suitable.
  select string_agg(rf.facility_name, ', ' order by rf.facility_name)
  into v_missing
  from unnest(original.required_facilities) as rf(facility_name)
  where not exists (
    select 1 from public.venue_facilities vf
    where vf.venue_id = p_venue_id
      and lower(vf.facility_name) = lower(rf.facility_name)
  );
  if v_missing is not null then
    raise exception 'This venue is missing required facilities: %', v_missing
      using errcode = 'check_violation';
  end if;

  -- Layout and accessibility are guidance, not blocks (they are search
  -- filters, and the Safety Officer reviews them later). A mismatch is
  -- recorded on the request so Venue Staff see it when they decide.
  if nullif(trim(coalesce(original.layout_notes, '')), '') is not null
    and not exists (
      select 1 from public.venue_layouts vl
      where vl.venue_id = p_venue_id
        and vl.layout_name::text ilike '%' || original.layout_notes || '%'
    ) then
    v_advisory := v_advisory || 'Layout: the booking asked for "' || trim(original.layout_notes)
      || '" but this venue lists no matching layout. ';
  end if;
  if nullif(trim(coalesce(original.accessibility_notes, '')), '') is not null
    and not (coalesce(venue_row.accessibility_notes, '') ilike '%' || original.accessibility_notes || '%') then
    v_advisory := v_advisory || 'Accessibility: the booking asked for "' || trim(original.accessibility_notes)
      || '" but this venue''s notes do not mention it. ';
  end if;

  v_availability := public.check_venue_booking_availability(
    p_venue_id, original.event_id, original.starts_at, original.ends_at, original.id
  );
  if not (v_availability ->> 'available')::boolean then
    raise exception '%', (v_availability ->> 'reason')
      using errcode = 'check_violation';
  end if;

  insert into public.venue_bookings (
    event_id, venue_id, requested_by, starts_at, ends_at, replaces_booking_id, is_main_venue,
    advisory_notes, label, expected_headcount, layout_notes, accessibility_notes, required_facilities
  )
  values (
    original.event_id, p_venue_id, actor_id, original.starts_at, original.ends_at,
    original.id, original.is_main_venue, nullif(trim(v_advisory), ''),
    original.label, original.expected_headcount, original.layout_notes,
    original.accessibility_notes, original.required_facilities
  )
  returning id into new_booking_id;

  select name into original_venue_name from public.venues where id = original.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    original.event_id,
    new_booking_id,
    'venue_request'::public.notification_type,
    'New replacement venue booking request',
    'A replacement venue booking request for "' || event_row.title || '" at ' || venue_row.name
      || case when v_disrupted then ' (replacing its disrupted booking at ' else ' (replacing its conflicting booking at ' end
      || original_venue_name
      || ') is awaiting your review.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return new_booking_id;
end;
$function$;

create or replace function public.decide_venue_booking_request(p_booking_id uuid, p_decision venue_booking_decision_type, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  booking_row public.venue_bookings;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  new_status public.request_status;
  v_availability jsonb;
  v_event public.events;
  v_original public.venue_bookings;
  v_original_venue_name text;
  v_is_replacement boolean;
  v_venue_name text;
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

  v_is_replacement := booking_row.replaces_booking_id is not null;

  if p_decision = 'approved' then
    perform 1 from public.venues where id = booking_row.venue_id for update;

    v_availability := public.check_venue_booking_availability(
      booking_row.venue_id, booking_row.event_id,
      booking_row.starts_at, booking_row.ends_at, booking_row.id
    );
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

  if v_is_replacement then
    select * into v_original from public.venue_bookings where id = booking_row.replaces_booking_id for update;
    select name into v_original_venue_name from public.venues where id = v_original.venue_id;
  end if;

  if v_is_replacement and p_decision = 'approved' then
    -- The replaced booking is cancelled (only that one; the event's other
    -- bookings are untouched) and its disruption is resolved.
    update public.venue_bookings
    set status = 'cancelled'
    where id = v_original.id
      and status in ('pending', 'approved', 'on_hold');

    update public.venue_booking_disruptions
    set cleared_at = now(), cleared_by = actor_id
    where booking_id = v_original.id and cleared_at is null;

    -- Its conflicts end with it, on both sides: the event booked first no
    -- longer waits for Venue Staff's re-check (202611010015).
    update public.venue_booking_conflicts
    set resolved_at = now(), resolved_by = actor_id
    where (booking_id = v_original.id or conflicting_booking_id = v_original.id)
      and resolved_at is null;

    select * into v_event from public.events where id = booking_row.event_id;
    if v_event.status in ('confirmed', 'pending_safety_check') then
      update public.events set status = 'planning' where id = v_event.id;

      if v_event.assigned_coordinator_id is not null then
        insert into public.notifications (recipient_id, event_id, type, title, message)
        values (
          v_event.assigned_coordinator_id,
          v_event.id,
          'status_change'::public.notification_type,
          'Event returned to Planning',
          '"' || v_event.title || '" returned to Planning because its venue changed. It needs to go through readiness and the safety check again.'
        );
      end if;
    end if;
  end if;

  -- AC04: the event's coordinator is notified either way: whoever is
  -- assigned now, so a reassignment since the request doesn't send it to
  -- someone no longer on the event (the requester if none is assigned).
  select * into v_event from public.events where id = booking_row.event_id;
  select name into v_venue_name from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    coalesce(v_event.assigned_coordinator_id, booking_row.requested_by),
    booking_row.event_id,
    'venue_decision'::public.notification_type,
    case
      when v_is_replacement and p_decision = 'approved' then 'Replacement venue approved'
      when v_is_replacement then 'Replacement venue rejected'
      when p_decision = 'approved' then 'Venue booking approved'
      else 'Venue booking rejected'
    end,
    case
      when v_is_replacement and p_decision = 'approved'
        then 'The replacement venue booking at ' || v_venue_name || ' for "' || v_event.title
          || '" has been approved. The earlier booking at ' || v_original_venue_name || ' has been cancelled.'
      when v_is_replacement
        then 'The replacement venue booking request at ' || v_venue_name || ' for "' || v_event.title
          || '" was rejected. The booking at ' || v_original_venue_name
          || case when exists (
               select 1 from public.venue_booking_disruptions d
               where d.booking_id = v_original.id and d.cleared_at is null
             ) then ' is still disrupted; you can request another venue.'
             else ' still clashes with another booking; you can request another venue.' end
      when p_decision = 'approved'
        then 'The venue booking request at ' || v_venue_name || ' for "' || v_event.title
          || '" has been approved. It is now a confirmed booking for this period.'
      else 'The venue booking request at ' || v_venue_name || ' for "' || v_event.title || '" was rejected.'
    end
  );

  return jsonb_build_object('bookingId', p_booking_id, 'status', new_status::text, 'decidedAt', now());
end;
$function$;
