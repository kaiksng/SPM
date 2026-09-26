-- Venue Catalogue: uniqueness moves from name alone to the (name, location)
-- pair. Two venues can now share a name if they're at different locations
-- (e.g. "Auditorium" at both "Campus" and "Expo Hall") — only the exact same
-- name at the exact same location is rejected as a duplicate.
--
-- create_venue/update_venue are re-created in full from
-- 202609260007_venue_layouts_allow_multiple.sql with only the
-- unique_violation exception handler's message changed to name the
-- location too, since it's now part of what made the insert/update conflict.

alter table public.venues
  drop constraint venues_name_unique;

alter table public.venues
  add constraint venues_name_location_unique unique (name, location);

create or replace function public.create_venue(p_venue jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_layouts text[];
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

  if v_facilities is null or array_length(v_facilities, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'facilities',
      'message', 'Add at least one facility');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select at least one supported room layout');
  elsif exists (
    select 1
    from unnest(v_layouts) as layout
    where layout not in (
      'Theatre', 'Classroom', 'Boardroom', 'Banquet',
      'Open Floor', 'Auditorium', 'Exhibition'
    )
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select a layout from the standard list only');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    insert into public.venues (
      name, location, capacity, operating_hours, description,
      accessibility_notes, updated_by
    )
    values (
      v_name, v_location, v_capacity, v_operating_hours, v_description,
      v_accessibility_notes, actor_id
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
  select venue_row.id, layout::public.room_layout
  from unnest(v_layouts) as layout;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at
  );
end;
$function$;

create or replace function public.update_venue(p_venue_id uuid, p_venue jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_layouts text[];
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

  -- Row lock: a concurrent capacity edit on the same venue is serialised, so
  -- the "did capacity decrease" comparison below always reads a consistent
  -- old_venue.capacity.
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

  if v_facilities is null or array_length(v_facilities, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'facilities',
      'message', 'Add at least one facility');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select at least one supported room layout');
  elsif exists (
    select 1
    from unnest(v_layouts) as layout
    where layout not in (
      'Theatre', 'Classroom', 'Boardroom', 'Banquet',
      'Open Floor', 'Auditorium', 'Exhibition'
    )
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select a layout from the standard list only');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    update public.venues
    set name = v_name,
        location = v_location,
        capacity = v_capacity,
        operating_hours = v_operating_hours,
        description = v_description,
        accessibility_notes = v_accessibility_notes,
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

  -- AC04: facilities are catalogue metadata, not booking history — replacing
  -- them here never touches venue_bookings. Layouts are the same kind of
  -- metadata.
  delete from public.venue_facilities where venue_id = p_venue_id;
  insert into public.venue_facilities (venue_id, facility_name)
  select p_venue_id, facility
  from unnest(v_facilities) as facility;

  delete from public.venue_layouts where venue_id = p_venue_id;
  insert into public.venue_layouts (venue_id, layout_name)
  select p_venue_id, layout::public.room_layout
  from unnest(v_layouts) as layout;

  -- AC06/AC07: a capacity decrease can leave an already-decided or still
  -- pending booking over-capacity. rejected/cancelled bookings never count.
  if old_venue.capacity is not null and v_capacity < old_venue.capacity then
    for booking in
      select vb.id, vb.event_id, e.title, e.expected_attendance, e.assigned_coordinator_id
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id
        and vb.status in ('approved', 'pending')
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
$function$;
