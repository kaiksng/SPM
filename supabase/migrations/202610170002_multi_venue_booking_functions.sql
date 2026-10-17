-- SPM-85: multiple venue bookings per event.
--   * check_venue_booking_availability can check a booking's own period (inside
--     the event's period) and skip the booking being decided, instead of
--     skipping every booking of the event. Another booking of the same event
--     at the same venue now counts as a conflict.
--   * submit_venue_booking_request creates the event's first booking (main
--     venue, defaults from the event) or an additional one (own label, period,
--     headcount and needs, never main). Capacity must cover the headcount.
--   * decide_venue_booking_request and request_replacement_venue work from the
--     booking's own period, headcount and needs.
drop function if exists public.check_venue_booking_availability(uuid, uuid);

create or replace function public.check_venue_booking_availability(
  p_venue_id uuid,
  p_event_id uuid,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_exclude_booking_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  event_row public.events;
  v_start timestamptz;
  v_end timestamptz;
  v_effective tstzrange;
  v_conflict_window tstzrange;
begin
  select * into event_row from public.events where id = p_event_id;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'Event not found.');
  end if;

  if event_row.starts_at is null or event_row.ends_at is null then
    return jsonb_build_object('available', false, 'reason', 'This event does not have a schedule set yet.');
  end if;

  if not exists (select 1 from public.venues where id = p_venue_id) then
    return jsonb_build_object('available', false, 'reason', 'Venue not found.');
  end if;

  v_start := coalesce(p_starts_at, event_row.starts_at);
  v_end := coalesce(p_ends_at, event_row.ends_at);

  if v_end <= v_start then
    return jsonb_build_object('available', false, 'reason', 'The end must be after the start.');
  end if;

  if v_start < event_row.starts_at or v_end > event_row.ends_at then
    return jsonb_build_object(
      'available', false,
      'reason', 'This booking''s period must fall within the event''s start and end time.'
    );
  end if;

  v_effective := public.venue_effective_window(p_venue_id, v_start, v_end);

  if not public.venue_booking_fits_operating_hours(p_venue_id, lower(v_effective), upper(v_effective)) then
    return jsonb_build_object(
      'available', false,
      'reason', 'This booking''s period, including setup and turnaround time, falls outside the venue''s operating days or hours.'
    );
  end if;

  select public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)
  into v_conflict_window
  from public.venue_bookings vb
  where vb.venue_id = p_venue_id
    and vb.status in ('pending', 'approved', 'on_hold')
    and vb.id is distinct from p_exclude_booking_id
    and public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at) && v_effective
  limit 1;

  if v_conflict_window is not null then
    return jsonb_build_object(
      'available', false,
      'reason', format(
        'This venue is already occupied from %s to %s (including setup and turnaround), which overlaps your requested period.',
        to_char(lower(v_conflict_window) at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon'),
        to_char(upper(v_conflict_window) at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
      )
    );
  end if;

  if exists (
    select 1 from public.venue_unavailability vu
    where vu.venue_id = p_venue_id and vu.removed_at is null
      and tstzrange(vu.starts_at, vu.ends_at) && v_effective
  ) then
    return jsonb_build_object(
      'available', false,
      'reason', 'This venue is unavailable for part of this booking''s period, including setup and turnaround time.'
    );
  end if;

  return jsonb_build_object('available', true, 'reason', null);
end;
$$;

revoke all on function public.check_venue_booking_availability(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.check_venue_booking_availability(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;

drop function if exists public.submit_venue_booking_request(uuid, uuid, uuid);

create or replace function public.submit_venue_booking_request(
  p_event_id uuid,
  p_venue_id uuid,
  p_actor_id uuid default null,
  p_label text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_expected_headcount integer default null,
  p_layout_notes text default null,
  p_accessibility_notes text default null,
  p_required_facilities text[] default null
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
  req_row public.event_venue_requirements;
  new_booking_id uuid;
  v_availability jsonb;
  v_is_first boolean;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_start timestamptz;
  v_end timestamptz;
  v_headcount integer;
  v_layout text;
  v_access text;
  v_facilities text[];
  v_main_location text;
  v_advisory text;
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

  -- A stale hold stops being active the moment anyone next acts on it: this
  -- event's own, and any on the venue now being requested.
  perform public.expire_stale_event_hold(p_event_id);
  perform public.expire_stale_venue_holds(p_venue_id);

  -- The event's first booking is its main venue and starts from the event's
  -- own details. Every later booking describes its own room.
  v_is_first := not exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.replaces_booking_id is null
      and vb.status in ('pending', 'approved', 'on_hold')
  );

  if v_is_first then
    select * into req_row from public.event_venue_requirements where event_id = p_event_id;
    v_label := coalesce(v_label, 'Main Programme');
    v_start := coalesce(p_starts_at, event_row.starts_at);
    v_end := coalesce(p_ends_at, event_row.ends_at);
    v_headcount := coalesce(p_expected_headcount, event_row.expected_attendance);
    v_layout := coalesce(p_layout_notes, req_row.layout_notes);
    v_access := coalesce(p_accessibility_notes, req_row.accessibility_notes);
    v_facilities := coalesce(
      p_required_facilities,
      array(select erf.facility_name from public.event_required_facilities erf
            where erf.event_id = p_event_id order by erf.facility_name)
    );
  else
    if v_label is null then
      raise exception 'Give this booking a label, for example Breakout 1'
        using errcode = 'check_violation';
    end if;
    if p_starts_at is null or p_ends_at is null then
      raise exception 'Enter the period this booking needs'
        using errcode = 'check_violation';
    end if;
    if p_expected_headcount is null then
      raise exception 'Enter how many people this venue must hold'
        using errcode = 'check_violation';
    end if;
    v_start := p_starts_at;
    v_end := p_ends_at;
    v_headcount := p_expected_headcount;
    v_layout := p_layout_notes;
    v_access := p_accessibility_notes;
    v_facilities := coalesce(p_required_facilities, '{}'::text[]);
  end if;

  v_layout := nullif(trim(coalesce(v_layout, '')), '');
  v_access := nullif(trim(coalesce(v_access, '')), '');

  if v_headcount is not null and v_headcount < 1 then
    raise exception 'The expected headcount must be at least 1'
      using errcode = 'check_violation';
  end if;

  if v_end <= v_start then
    raise exception 'The end must be after the start'
      using errcode = 'check_violation';
  end if;
  if v_start < event_row.starts_at or v_end > event_row.ends_at then
    raise exception 'This booking''s period must fall within the event''s start and end time'
      using errcode = 'check_violation';
  end if;

  if v_headcount is not null and venue_row.capacity < v_headcount then
    raise exception 'This venue''s capacity (%) is below this booking''s expected headcount (%)',
      venue_row.capacity, v_headcount
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.venue_id = p_venue_id
      and vb.status in ('pending', 'approved', 'on_hold')
      and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_start, v_end)
  ) then
    raise exception 'This event already has an active booking or hold for this venue during an overlapping period'
      using errcode = 'check_violation';
  end if;

  v_availability := public.check_venue_booking_availability(p_venue_id, p_event_id, v_start, v_end);
  if not (v_availability ->> 'available')::boolean then
    raise exception '%', (v_availability ->> 'reason')
      using errcode = 'check_violation';
  end if;

  -- Guidance for Venue Staff, not a block: breakout rooms are expected to be
  -- at the same location as the main venue.
  if not v_is_first then
    select v.location into v_main_location
    from public.venue_bookings vb
    join public.venues v on v.id = vb.venue_id
    where vb.event_id = p_event_id
      and vb.is_main_venue
      and vb.replaces_booking_id is null
      and vb.status in ('pending', 'approved', 'on_hold')
    limit 1;

    if v_main_location is not null
      and lower(trim(coalesce(venue_row.location, ''))) <> lower(trim(v_main_location)) then
      v_advisory := 'Location: this venue is at ' || coalesce(venue_row.location, 'an unlisted location')
        || ', but the event''s main venue is at ' || v_main_location || '.';
    end if;
  end if;

  insert into public.venue_bookings (
    event_id, venue_id, requested_by, starts_at, ends_at,
    label, expected_headcount, layout_notes, accessibility_notes, required_facilities,
    is_main_venue, advisory_notes
  )
  values (
    p_event_id, p_venue_id, actor_id, v_start, v_end,
    v_label, v_headcount, v_layout, v_access, v_facilities,
    v_is_first, v_advisory
  )
  returning id into new_booking_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    p_event_id,
    new_booking_id,
    'venue_request'::public.notification_type,
    'New venue booking request',
    'A new venue booking request for "' || event_row.title || '"'
      || case when v_is_first then '' else ' (' || v_label || ')' end
      || ' at ' || venue_row.name || ' is awaiting your review.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return new_booking_id;
end;
$$;

revoke all on function public.submit_venue_booking_request(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, text, text, text[]) from public, anon;
grant execute on function public.submit_venue_booking_request(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, text, text, text[]) to authenticated, service_role;

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
  v_event public.events;
  v_original public.venue_bookings;
  v_original_venue_name text;
  v_is_replacement boolean;
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

  -- AC04: the requesting coordinator is notified either way.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    booking_row.requested_by,
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
        then 'Your replacement venue booking has been approved. The earlier booking at '
          || v_original_venue_name || ' has been cancelled.'
      when v_is_replacement
        then 'Your replacement venue booking request was rejected. ' || coalesce(reason_value, '')
          || ' The booking at ' || v_original_venue_name
          || ' is still disrupted; you can request another venue.'
      when p_decision = 'approved'
        then 'Your venue booking request has been approved. The venue is now a confirmed booking for this period.'
      else 'Your venue booking request was rejected. ' || coalesce(reason_value, '')
    end
  );

  return jsonb_build_object('bookingId', p_booking_id, 'status', new_status::text, 'decidedAt', now());
end;
$$;

revoke all on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) from public, anon;
grant execute on function public.decide_venue_booking_request(uuid, public.venue_booking_decision_type, text, uuid) to authenticated, service_role;

create or replace function public.request_replacement_venue(
  p_booking_id uuid,
  p_venue_id uuid,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  if not exists (
    select 1 from public.venue_booking_disruptions d
    where d.booking_id = original.id and d.cleared_at is null
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
      || ' (replacing its disrupted booking at ' || original_venue_name
      || ') is awaiting your review.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return new_booking_id;
end;
$$;

revoke all on function public.request_replacement_venue(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_replacement_venue(uuid, uuid, uuid) to authenticated, service_role;
