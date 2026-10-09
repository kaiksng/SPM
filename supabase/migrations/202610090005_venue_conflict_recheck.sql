-- recheck_venue_conflicts / recheck_all_venue_conflicts: the actual
-- "existing bookings that now conflict" scan described in
-- 202610090004_venue_booking_conflicts.sql's header comment.
--
-- Three passes, in this order:
--   1. Clear any currently-unresolved conflict whose underlying overlap is
--      gone (buffer reduced, or either side no longer Pending/Approved) —
--      notify that booking's coordinator it's cleared.
--   2. Booking-vs-booking: every pair of this venue's Pending/Approved
--      bookings whose effective windows (period expanded by the venue's
--      own setup/turnaround minutes) now overlap gets a conflict row on
--      EACH booking (so both show up as "Needs Review"), but only the
--      later-created booking's row is_responsible — "the coordinator of
--      the later-created booking is expected to resolve it."
--   3. Booking-vs-block: a block isn't expanded by buffers (it's a fixed
--      unavailable period, not an event needing its own setup/teardown);
--      only the booking side is responsible, there being no coordinator on
--      a block to share it with.
--
-- A row already present and unresolved for the same pair is left alone —
-- "running the re-check twice does not duplicate flags or notifications."
create or replace function public.recheck_venue_conflicts(
  p_venue_id uuid,
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
  v_setup integer;
  v_turnaround integer;
  flagged_count integer := 0;
  cleared_count integer := 0;
  conflict_row record;
  still_overlaps boolean;
  b1 record;
  b2 record;
  blk record;
  b1_start timestamptz;
  b1_end timestamptz;
  b2_start timestamptz;
  b2_end timestamptz;
  later_booking_id uuid;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot re-check conflicts on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to re-check conflicts'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;
  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can re-check conflicts'
      using errcode = 'insufficient_privilege';
  end if;

  select setup_time_minutes, turnaround_time_minutes
  into v_setup, v_turnaround
  from public.venues
  where id = p_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- Pass 1: clear resolved conflicts.
  for conflict_row in
    select c.id, c.booking_id, c.conflicting_booking_id, c.conflicting_block_id
    from public.venue_booking_conflicts c
    join public.venue_bookings vb on vb.id = c.booking_id
    where vb.venue_id = p_venue_id and c.resolved_at is null
  loop
    select vb.starts_at - make_interval(mins => v_setup), vb.ends_at + make_interval(mins => v_turnaround)
    into b1_start, b1_end
    from public.venue_bookings vb
    where vb.id = conflict_row.booking_id and vb.status in ('pending', 'approved');

    still_overlaps := false;

    if b1_start is not null then
      if conflict_row.conflicting_booking_id is not null then
        select vb2.starts_at - make_interval(mins => v_setup), vb2.ends_at + make_interval(mins => v_turnaround)
        into b2_start, b2_end
        from public.venue_bookings vb2
        where vb2.id = conflict_row.conflicting_booking_id and vb2.status in ('pending', 'approved');

        if b2_start is not null and tstzrange(b1_start, b1_end) && tstzrange(b2_start, b2_end) then
          still_overlaps := true;
        end if;
      elsif conflict_row.conflicting_block_id is not null then
        still_overlaps := exists (
          select 1 from public.venue_unavailability vu
          where vu.id = conflict_row.conflicting_block_id
            and vu.removed_at is null
            and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(b1_start, b1_end)
        );
      end if;
    end if;

    if not still_overlaps then
      update public.venue_booking_conflicts
      set resolved_at = now(), resolved_by = actor_id
      where id = conflict_row.id;

      cleared_count := cleared_count + 1;

      insert into public.notifications (recipient_id, event_id, type, title, message)
      select vb.requested_by, vb.event_id,
        'venue_conflict_resolved'::public.notification_type,
        'Venue conflict cleared',
        'The scheduling conflict flagged on your booking is no longer active.'
      from public.venue_bookings vb
      where vb.id = conflict_row.booking_id;
    end if;
  end loop;

  -- Pass 2: booking-vs-booking.
  for b1 in
    select id, event_id, requested_by, requested_at,
      starts_at - make_interval(mins => v_setup) as eff_start,
      ends_at + make_interval(mins => v_turnaround) as eff_end
    from public.venue_bookings
    where venue_id = p_venue_id and status in ('pending', 'approved')
  loop
    for b2 in
      select id, event_id, requested_by, requested_at,
        starts_at - make_interval(mins => v_setup) as eff_start,
        ends_at + make_interval(mins => v_turnaround) as eff_end
      from public.venue_bookings
      where venue_id = p_venue_id and status in ('pending', 'approved')
        and id > b1.id
    loop
      if tstzrange(b1.eff_start, b1.eff_end) && tstzrange(b2.eff_start, b2.eff_end)
        and not exists (
          select 1 from public.venue_booking_conflicts
          where booking_id = b1.id and conflicting_booking_id = b2.id and resolved_at is null
        )
      then
        later_booking_id := case when b2.requested_at > b1.requested_at then b2.id else b1.id end;

        insert into public.venue_booking_conflicts
          (booking_id, conflicting_booking_id, cause, is_responsible, flagged_by)
        values
          (b1.id, b2.id, 'Overlaps another booking once setup/turnaround time is applied',
           b1.id = later_booking_id, actor_id),
          (b2.id, b1.id, 'Overlaps another booking once setup/turnaround time is applied',
           b2.id = later_booking_id, actor_id);

        flagged_count := flagged_count + 1;

        insert into public.notifications (recipient_id, event_id, type, title, message)
        values
          (b1.requested_by, b1.event_id, 'venue_conflict_flagged'::public.notification_type,
           'Venue booking conflict',
           'Your booking now overlaps another booking once setup/turnaround time is applied. ' ||
             case when b1.id = later_booking_id then 'Please resolve this.'
               else 'The other coordinator has been asked to resolve it.' end),
          (b2.requested_by, b2.event_id, 'venue_conflict_flagged'::public.notification_type,
           'Venue booking conflict',
           'Your booking now overlaps another booking once setup/turnaround time is applied. ' ||
             case when b2.id = later_booking_id then 'Please resolve this.'
               else 'The other coordinator has been asked to resolve it.' end);
      end if;
    end loop;
  end loop;

  -- Pass 3: booking-vs-block.
  for b1 in
    select id, event_id, requested_by,
      starts_at - make_interval(mins => v_setup) as eff_start,
      ends_at + make_interval(mins => v_turnaround) as eff_end
    from public.venue_bookings
    where venue_id = p_venue_id and status in ('pending', 'approved')
  loop
    for blk in
      select id
      from public.venue_unavailability
      where venue_id = p_venue_id and removed_at is null
        and tstzrange(starts_at, ends_at) && tstzrange(b1.eff_start, b1.eff_end)
    loop
      if not exists (
        select 1 from public.venue_booking_conflicts
        where booking_id = b1.id and conflicting_block_id = blk.id and resolved_at is null
      ) then
        insert into public.venue_booking_conflicts
          (booking_id, conflicting_block_id, cause, is_responsible, flagged_by)
        values
          (b1.id, blk.id, 'Overlaps a venue block once setup/turnaround time is applied', true, actor_id);

        flagged_count := flagged_count + 1;

        insert into public.notifications (recipient_id, event_id, type, title, message)
        values
          (b1.requested_by, b1.event_id, 'venue_conflict_flagged'::public.notification_type,
           'Venue booking conflict',
           'Your booking now overlaps a venue block once setup/turnaround time is applied. Please resolve this.');
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'venueId', p_venue_id,
    'flaggedCount', flagged_count,
    'clearedCount', cleared_count
  );
end;
$$;

revoke all on function public.recheck_venue_conflicts(uuid, uuid) from public, anon;
grant execute on function public.recheck_venue_conflicts(uuid, uuid) to authenticated, service_role;

-- "Venue Staff can run a conflict re-check for a venue or all venues."
create or replace function public.recheck_all_venue_conflicts(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  result jsonb;
  total_flagged integer := 0;
  total_cleared integer := 0;
begin
  for v in select id from public.venues loop
    result := public.recheck_venue_conflicts(v.id, p_actor_id);
    total_flagged := total_flagged + coalesce((result ->> 'flaggedCount')::integer, 0);
    total_cleared := total_cleared + coalesce((result ->> 'clearedCount')::integer, 0);
  end loop;

  return jsonb_build_object('flaggedCount', total_flagged, 'clearedCount', total_cleared);
end;
$$;

revoke all on function public.recheck_all_venue_conflicts(uuid) from public, anon;
grant execute on function public.recheck_all_venue_conflicts(uuid) to authenticated, service_role;

-- update_venue: re-check this venue's conflicts whenever setup/turnaround
-- time actually changes — "the re-check also runs automatically when a
-- venue's setup or turnaround time is saved."
create or replace function public.update_venue(
  p_venue_id uuid, p_venue jsonb, p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
  v_area_tags text[];
  v_layouts text[];
  v_setup_time_minutes integer;
  v_turnaround_time_minutes integer;
  old_venue public.venues;
  venue_row public.venues;
  issues jsonb := '[]'::jsonb;
  booking record;
  flagged_count integer := 0;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot update a venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to update a venue'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role <> 'venue_staff' then
    raise exception 'Only Venue Staff can update venues'
      using errcode = 'insufficient_privilege';
  end if;

  select * into old_venue
  from public.venues
  where id = p_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  begin
    v_capacity := (p_venue ->> 'capacity')::integer;
  exception when others then
    v_capacity := null;
  end;

  select array_agg(distinct trim(facility))
  into v_facilities
  from jsonb_array_elements_text(coalesce(p_venue -> 'facilities', '[]'::jsonb)) as facility
  where trim(facility) <> '';

  select array(select distinct trim(area)
    from jsonb_array_elements_text(coalesce(p_venue -> 'area_tags', '[]'::jsonb)) as area
    where trim(area) <> '') into v_area_tags;
  if not (p_venue ? 'area_tags') then
    v_area_tags := old_venue.area_tags;
  end if;

  select array_agg(distinct trim(layout))
  into v_layouts
  from jsonb_array_elements_text(coalesce(p_venue -> 'layouts', '[]'::jsonb)) as layout
  where trim(layout) <> '';

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    issues := issues || jsonb_build_object(
      'field', 'name',
      'message', 'Venue name must contain between 2 and 160 characters');
  end if;

  if v_location is null then
    issues := issues || jsonb_build_object(
      'field', 'location',
      'message', 'Enter the venue location');
  end if;

  if v_capacity is null or v_capacity <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'capacity',
      'message', 'Enter capacity as a positive whole number');
  end if;

  v_operating_hours_error := public.validate_operating_hours(v_operating_hours);
  if v_operating_hours_error is not null then
    issues := issues || jsonb_build_object(
      'field', 'operatingHours',
      'message', v_operating_hours_error);
  end if;

  if (p_venue ? 'area_tags' and cardinality(v_area_tags) = 0) or exists (
    select 1 from unnest(v_area_tags) as tag(name)
    where not exists (select 1 from public.venue_area_options option where option.name = tag.name)
  ) then
    issues := issues || jsonb_build_object(
      'field', 'areaTags',
      'message', 'Select at least one area from the standard list');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select at least one supported room layout');
  elsif exists (
    select 1 from unnest(v_layouts) as layout
    where char_length(layout) > 120
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Room layout names must contain at most 120 characters');
  end if;

  if p_venue ? 'setup_time_minutes' then
    begin
      v_setup_time_minutes := (p_venue ->> 'setup_time_minutes')::integer;
    exception when others then
      v_setup_time_minutes := null;
    end;
    if v_setup_time_minutes is null or v_setup_time_minutes < 0 then
      issues := issues || jsonb_build_object(
        'field', 'setupTimeMinutes',
        'message', 'Enter setup time as 0 or a positive whole number');
    end if;
  else
    v_setup_time_minutes := old_venue.setup_time_minutes;
  end if;

  if p_venue ? 'turnaround_time_minutes' then
    begin
      v_turnaround_time_minutes := (p_venue ->> 'turnaround_time_minutes')::integer;
    exception when others then
      v_turnaround_time_minutes := null;
    end;
    if v_turnaround_time_minutes is null or v_turnaround_time_minutes < 0 then
      issues := issues || jsonb_build_object(
        'field', 'turnaroundTimeMinutes',
        'message', 'Enter turnaround time as 0 or a positive whole number');
    end if;
  else
    v_turnaround_time_minutes := old_venue.turnaround_time_minutes;
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    update public.venues
    set name = v_name,
        location = v_location,
        area_tags = v_area_tags,
        capacity = v_capacity,
        operating_hours = v_operating_hours,
        description = v_description,
        accessibility_notes = v_accessibility_notes,
        setup_time_minutes = v_setup_time_minutes,
        turnaround_time_minutes = v_turnaround_time_minutes,
        updated_by = actor_id
    where id = p_venue_id
    returning * into venue_row;
  exception when unique_violation then
    raise exception 'A venue named "%" already exists at "%"', v_name, v_location
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists at "' || v_location || '".'
        )::text;
  end;

  if v_setup_time_minutes is distinct from old_venue.setup_time_minutes then
    insert into public.venue_buffer_time_changes
      (venue_id, field_name, previous_value, new_value, changed_by)
    values
      (p_venue_id, 'setup_time_minutes', old_venue.setup_time_minutes, v_setup_time_minutes, actor_id);
  end if;

  if v_turnaround_time_minutes is distinct from old_venue.turnaround_time_minutes then
    insert into public.venue_buffer_time_changes
      (venue_id, field_name, previous_value, new_value, changed_by)
    values
      (p_venue_id, 'turnaround_time_minutes', old_venue.turnaround_time_minutes, v_turnaround_time_minutes, actor_id);
  end if;

  if v_setup_time_minutes is distinct from old_venue.setup_time_minutes
    or v_turnaround_time_minutes is distinct from old_venue.turnaround_time_minutes
  then
    perform public.recheck_venue_conflicts(p_venue_id, actor_id);
  end if;

  delete from public.venue_facilities where venue_id = p_venue_id;
  insert into public.venue_facilities (venue_id, facility_name)
  select p_venue_id, facility
  from unnest(v_facilities) as facility;

  delete from public.venue_layouts where venue_id = p_venue_id;
  insert into public.venue_layouts (venue_id, layout_name)
  select p_venue_id, layout
  from unnest(v_layouts) as layout;

  if old_venue.capacity is not null and v_capacity < old_venue.capacity then
    for booking in
      select vb.id, vb.event_id, e.title, e.expected_attendance, e.assigned_coordinator_id
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id
        and vb.status in ('approved', 'pending', 'on_hold')
        and e.expected_attendance is not null
        and e.expected_attendance > v_capacity
    loop
      update public.venue_bookings
      set needs_review = true,
          needs_review_reason =
            'Venue capacity reduced to ' || v_capacity ||
            ', below this booking''s expected attendance of ' ||
            booking.expected_attendance || '.'
      where id = booking.id;

      flagged_count := flagged_count + 1;

      if booking.assigned_coordinator_id is not null then
        insert into public.notifications (recipient_id, event_id, type, title, message)
        values (
          booking.assigned_coordinator_id,
          booking.event_id,
          'venue_capacity_review'::public.notification_type,
          'Venue capacity change needs review',
          'The venue for "' || booking.title || '" reduced its capacity to ' ||
            v_capacity || ', below the expected attendance of ' ||
            booking.expected_attendance || '. This booking now needs review.'
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at,
    'flaggedBookingsCount', flagged_count
  );
end;
$$;

revoke all on function public.update_venue(uuid, jsonb, uuid) from public, anon;
grant execute on function public.update_venue(uuid, jsonb, uuid) to authenticated, service_role;
