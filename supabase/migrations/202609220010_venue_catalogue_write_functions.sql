-- Venue Catalogue: create/update a venue entry.
--
-- AC01 Venue Staff can create and update a venue catalogue entry.
-- AC03 Missing or invalid mandatory information prevents saving and
--      identifies the affected field.
-- AC05 Reducing capacity below the expected attendance of a confirmed
--      booking displays a warning before saving.
-- AC06 If that capacity change is saved, the affected venue arrangement
--      becomes "Needs Review" and the assigned coordinator is notified.
-- AC07 Reducing capacity below a Pending booking's expected attendance
--      triggers the same warning.
-- AC08 Submitting a venue name that already exists is rejected and
--      identified as a duplicate.
-- AC09 Each update records the staff member and time.
--
-- AC05 is a frontend pre-check (apps/frontend calls listAtRiskBookings
-- before saving); this function is the authoritative server-side version of
-- AC06/AC07 regardless of whether the frontend warning ran.

-- Shared by create_venue/update_venue. operating_hours is an
-- OperatingHoursPeriod[] ({ days: DayCode[], opensAt: "HH:MM",
-- closesAt: "HH:MM" }); a day absent from every period is closed that day.
-- Returns the first problem found as a message, or null when the shape is
-- valid.
create or replace function public.validate_operating_hours(p_operating_hours jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  period jsonb;
  day_value text;
  opens text;
  closes text;
  seen_days text[] := '{}';
begin
  if jsonb_typeof(p_operating_hours) is distinct from 'array'
     or jsonb_array_length(p_operating_hours) = 0 then
    return 'Enter the venue''s operating days and hours';
  end if;

  for period in select * from jsonb_array_elements(p_operating_hours)
  loop
    if jsonb_typeof(period -> 'days') is distinct from 'array'
       or jsonb_array_length(period -> 'days') = 0 then
      return 'Each operating hours period needs at least one day selected';
    end if;

    for day_value in select value #>> '{}' from jsonb_array_elements(period -> 'days')
    loop
      if day_value not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then
        return 'Each operating hours period must use valid days';
      end if;
      if day_value = any(seen_days) then
        return 'A day cannot belong to more than one operating hours period';
      end if;
      seen_days := array_append(seen_days, day_value);
    end loop;

    opens := period ->> 'opensAt';
    closes := period ->> 'closesAt';

    if opens is null or closes is null
       or opens !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or closes !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      return 'Enter valid opening and closing times (HH:MM) for each period';
    end if;

    if opens >= closes then
      return 'Each period''s opening time must be earlier than its closing time';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.validate_operating_hours(jsonb) from public;
revoke all on function public.validate_operating_hours(jsonb) from anon;
grant execute on function public.validate_operating_hours(jsonb) to authenticated;
grant execute on function public.validate_operating_hours(jsonb) to service_role;

create or replace function public.create_venue(
  p_venue jsonb,
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
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
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

  if actor_role not in ('venue_staff', 'administrator') then
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
    raise exception 'A venue named "%" already exists', v_name
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists.'
        )::text;
  end;

  insert into public.venue_facilities (venue_id, facility_name)
  select venue_row.id, facility
  from unnest(v_facilities) as facility;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at
  );
end;
$$;

create or replace function public.update_venue(
  p_venue_id uuid,
  p_venue jsonb,
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
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
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

  if actor_role not in ('venue_staff', 'administrator') then
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
    raise exception 'A venue named "%" already exists', v_name
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists.'
        )::text;
  end;

  -- AC04: facilities are catalogue metadata, not booking history — replacing
  -- them here never touches venue_bookings.
  delete from public.venue_facilities where venue_id = p_venue_id;
  insert into public.venue_facilities (venue_id, facility_name)
  select p_venue_id, facility
  from unnest(v_facilities) as facility;

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
$$;

revoke all on function public.create_venue(jsonb, uuid) from public;
revoke all on function public.create_venue(jsonb, uuid) from anon;
grant execute on function public.create_venue(jsonb, uuid) to authenticated;
grant execute on function public.create_venue(jsonb, uuid) to service_role;

revoke all on function public.update_venue(uuid, jsonb, uuid) from public;
revoke all on function public.update_venue(uuid, jsonb, uuid) from anon;
grant execute on function public.update_venue(uuid, jsonb, uuid) to authenticated;
grant execute on function public.update_venue(uuid, jsonb, uuid) to service_role;
