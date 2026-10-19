-- Caps a venue back to exactly one supported room layout.
-- 202609260007_venue_layouts_allow_multiple.sql deliberately widened this
-- from "exactly 1" to "at least 1" (a hall set up as a Theatre for one
-- event may work as a Banquet for another). Reverting that call: every
-- venue should have exactly one layout again.
--
-- venue_layouts stays a join table -- no schema change -- it's just capped
-- to one row per venue going forward. Existing venues with more than one
-- row keep their lowest-id row and lose the rest; there's no created_at on
-- venue_layouts to establish a true "first added" order, so this is a
-- deterministic but arbitrary tie-break, not a chronological one.
--
-- find_matching_venues, search_available_venues, and the replacement-venue
-- suitability check all query venue_layouts via EXISTS/set semantics and
-- need no change -- they work the same whether a venue has one row or
-- several. custom_room_layouts.sql's free-text layout naming (as opposed
-- to the fixed enum list) is untouched; only the count reverts.

delete from public.venue_layouts
where id not in (
  select distinct on (venue_id) id
  from public.venue_layouts
  order by venue_id, id
);

create or replace function public.create_venue(p_venue jsonb, p_actor_id uuid default null)
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
  venue_row public.venues;
  issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot create a venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to create a venue'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role <> 'venue_staff' then
    raise exception 'Only Venue Staff can create venues'
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

  select array_agg(distinct trim(layout))
  into v_layouts
  from jsonb_array_elements_text(coalesce(p_venue -> 'layouts', '[]'::jsonb)) as layout
  where trim(layout) <> '';

  -- AC03. Every failure is collected before any is reported, matching
  -- submit_event_request's shape so the frontend can highlight every
  -- affected field at once with the same FieldErrors map.
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

  if v_layouts is null or array_length(v_layouts, 1) is distinct from 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
  elsif exists (
    select 1 from unnest(v_layouts) as layout
    where char_length(layout) > 120
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Room layout names must contain at most 120 characters');
  end if;

  -- Both default to 0 when omitted; an explicitly provided value must be a
  -- non-negative whole number, same collect-and-report shape as capacity.
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
    v_setup_time_minutes := 0;
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
    v_turnaround_time_minutes := 0;
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    insert into public.venues (
      name, location, area_tags, capacity, operating_hours, description,
      accessibility_notes, setup_time_minutes, turnaround_time_minutes, updated_by
    )
    values (
      v_name, v_location, v_area_tags, v_capacity, v_operating_hours, v_description,
      v_accessibility_notes, v_setup_time_minutes, v_turnaround_time_minutes, actor_id
    )
    returning * into venue_row;
  exception when unique_violation then
    raise exception 'A venue named "%" already exists at "%"', v_name, v_location
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists at "' || v_location || '".'
        )::text;
  end;

  insert into public.venue_facilities (venue_id, facility_name)
  select venue_row.id, facility
  from unnest(v_facilities) as facility;

  insert into public.venue_layouts (venue_id, layout_name)
  select venue_row.id, layout
  from unnest(v_layouts) as layout;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at
  );
end;
$$;

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

  if v_layouts is null or array_length(v_layouts, 1) is distinct from 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
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
      select vb.id, vb.event_id, e.title, coalesce(vb.expected_headcount, e.expected_attendance) as expected_attendance, e.assigned_coordinator_id
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id
        and vb.status in ('approved', 'pending', 'on_hold')
        and coalesce(vb.expected_headcount, e.expected_attendance) is not null
        and coalesce(vb.expected_headcount, e.expected_attendance) > v_capacity
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
