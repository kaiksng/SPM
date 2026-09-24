-- Two schema cleanups:
--
-- 1. venue_layouts.layout_name becomes an enum (public.room_layout) matching
--    packages/shared's ROOM_LAYOUT_TYPES, so the fixed list is enforced by the
--    table itself, not only by create_venue/update_venue and the frontend.
--    Adding a layout later = `alter type public.room_layout add value ...`
--    plus the shared constant.
--
-- 2. venues.operating_hours_legacy_text is dropped: kept by
--    202609220011 only so pre-restructure free text wasn't lost, and nothing
--    reads it.
--
-- The three functions that touch layout_name are re-created because text no
-- longer assigns/compares to the enum implicitly (insert needs a cast; ilike
-- needs layout_name::text).
create type public.room_layout as enum (
  'Theatre', 'Classroom', 'Boardroom', 'Banquet',
  'Open Floor', 'Auditorium', 'Exhibition'
);

-- The old "not blank" check calls btrim() on the column, which doesn't exist
-- for an enum, and is redundant now (an enum value can't be blank).
alter table public.venue_layouts
  drop constraint venue_layouts_layout_name_check;

alter table public.venue_layouts
  alter column layout_name type public.room_layout
  using layout_name::public.room_layout;

alter table public.venues drop column operating_hours_legacy_text;

create or replace function public.find_matching_venues(p_event_id uuid)
returns table (
  id uuid,
  name text,
  location text,
  capacity integer,
  operating_hours jsonb,
  description text,
  accessibility_notes text,
  updated_at timestamptz,
  facilities text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_event public.events;
  v_req public.event_venue_requirements;
begin
  select * into v_event from public.events e where e.id = p_event_id;

  if not found then
    raise exception 'Event not found or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  -- No row is a valid state (an event can reach Planning before venue
  -- requirements are ever saved) — v_req's fields all read as null then, so
  -- every optional filter below is skipped, same as an explicitly blank
  -- requirement would be.
  select * into v_req from public.event_venue_requirements r where r.event_id = p_event_id;

  return query
  select
    v.id,
    v.name,
    v.location,
    v.capacity,
    v.operating_hours,
    v.description,
    v.accessibility_notes,
    v.updated_at,
    coalesce(
      array_agg(distinct vf.facility_name) filter (where vf.facility_name is not null),
      '{}'
    ) as facilities
  from public.venues v
  left join public.venue_facilities vf on vf.venue_id = v.id
  where
    -- Capacity: always mandatory. A null expected_attendance (shouldn't
    -- normally happen for a Planning-stage event) defensively means "any
    -- capacity qualifies" rather than excluding every venue.
    (v_event.expected_attendance is null or v.capacity >= v_event.expected_attendance)

    -- Date/time availability: always mandatory. A null starts_at/ends_at
    -- (shouldn't normally happen for a Planning-stage event) defensively
    -- skips both overlap checks rather than excluding every venue.
    and (
      v_event.starts_at is null or v_event.ends_at is null
      or not exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status in ('approved', 'pending')
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      )
    )
    and (
      v_event.starts_at is null or v_event.ends_at is null
      or not exists (
        select 1
        from public.venue_unavailability vu
        where vu.venue_id = v.id
          and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      )
    )

    -- Location: mandatory only when the event specifies a preferred_location.
    and (
      v_req.preferred_location is null
      or trim(v_req.preferred_location) = ''
      or v.location ilike '%' || v_req.preferred_location || '%'
    )

    -- Room layout: mandatory only when the event specifies layout_notes.
    -- Passes if the venue has at least one layout whose name contains the
    -- requested text (case-insensitive).
    and (
      v_req.layout_notes is null
      or trim(v_req.layout_notes) = ''
      or exists (
        select 1
        from public.venue_layouts vl
        where vl.venue_id = v.id
          and vl.layout_name::text ilike '%' || v_req.layout_notes || '%'
      )
    )

    -- Accessibility: mandatory only when the event specifies
    -- accessibility_notes.
    and (
      v_req.accessibility_notes is null
      or trim(v_req.accessibility_notes) = ''
      or v.accessibility_notes ilike '%' || v_req.accessibility_notes || '%'
    )

    -- Facilities: mandatory only when the event has required-facility rows.
    -- Every required facility name must exist on the venue (case-insensitive
    -- exact match). Vacuously true when the event has none.
    and not exists (
      select 1
      from public.event_required_facilities erf
      where erf.event_id = p_event_id
        and not exists (
          select 1
          from public.venue_facilities vf2
          where vf2.venue_id = v.id
            and lower(vf2.facility_name) = lower(erf.facility_name)
        )
    )
  group by v.id
  order by v.name;
end;
$$;

revoke all on function public.find_matching_venues(uuid) from public;
revoke all on function public.find_matching_venues(uuid) from anon;
grant execute on function public.find_matching_venues(uuid) to authenticated;
grant execute on function public.find_matching_venues(uuid) to service_role;

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

  if v_layouts is null or array_length(v_layouts, 1) <> 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
  elsif v_layouts[1] not in (
    'Theatre', 'Classroom', 'Boardroom', 'Banquet',
    'Open Floor', 'Auditorium', 'Exhibition'
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

  if v_layouts is null or array_length(v_layouts, 1) <> 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
  elsif v_layouts[1] not in (
    'Theatre', 'Classroom', 'Boardroom', 'Banquet',
    'Open Floor', 'Auditorium', 'Exhibition'
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
    raise exception 'A venue named "%" already exists', v_name
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists.'
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
$$;

revoke all on function public.create_venue(jsonb, uuid) from public;
revoke all on function public.create_venue(jsonb, uuid) from anon;
grant execute on function public.create_venue(jsonb, uuid) to authenticated;
grant execute on function public.create_venue(jsonb, uuid) to service_role;

revoke all on function public.update_venue(uuid, jsonb, uuid) from public;
revoke all on function public.update_venue(uuid, jsonb, uuid) from anon;
grant execute on function public.update_venue(uuid, jsonb, uuid) to authenticated;
grant execute on function public.update_venue(uuid, jsonb, uuid) to service_role;
