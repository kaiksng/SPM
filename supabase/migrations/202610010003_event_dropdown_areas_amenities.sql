-- Canonical areas for venue search and amenity-only facility selection.
-- Existing venues retain an empty tag array until Venue Staff review them.
create table public.venue_area_options (name text primary key);
insert into public.venue_area_options (name) values
  ('Central Area'),
  ('North'),
  ('East'),
  ('West'),
  ('South'),
  ('Alexandra'),
  ('Ang Mo Kio'),
  ('Balestier'),
  ('Beach Road'),
  ('Beauty World'),
  ('Bendemeer'),
  ('Boon Keng'),
  ('Boon Lay'),
  ('Bras Basah'),
  ('Bugis'),
  ('Bukit Timah'),
  ('Buona Vista'),
  ('Changi'),
  ('Chinatown'),
  ('City Hall'),
  ('Clarke Quay'),
  ('Clementi'),
  ('Dempsey'),
  ('Dhoby Ghaut'),
  ('Esplanade'),
  ('Farrer Park'),
  ('Fort Canning'),
  ('Geylang'),
  ('HarbourFront'),
  ('Havelock'),
  ('Holland Village'),
  ('Jalan Besar'),
  ('Joo Chiat'),
  ('Jurong West'),
  ('Kallang'),
  ('Kampong Glam'),
  ('Katong'),
  ('Keppel Bay'),
  ('King Albert Park'),
  ('Lavender'),
  ('Little India'),
  ('Marina Bay'),
  ('Marine Parade'),
  ('Mount Faber'),
  ('Mountbatten'),
  ('Newton'),
  ('Orchard'),
  ('Outram'),
  ('Paya Lebar'),
  ('Pioneer'),
  ('Promenade'),
  ('Queenstown'),
  ('Raffles Place'),
  ('River Valley'),
  ('Robertson Quay'),
  ('Sentosa'),
  ('Shenton Way'),
  ('Somerset'),
  ('Tai Seng'),
  ('Tampines'),
  ('Tanjong Pagar'),
  ('Telok Ayer'),
  ('Tiong Bahru'),
  ('Toa Payoh'),
  ('Tuas'),
  ('West Coast'),
  ('Yishun');
alter table public.venue_area_options enable row level security;
create policy "venue areas readable by authenticated users" on public.venue_area_options
  for select to authenticated using (true);
grant select on public.venue_area_options to authenticated, service_role;

alter table public.venues add column area_tags text[] not null default '{}';

create or replace function public.venue_matches_area(
  p_requested text, p_tags text[], p_address text
) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select case
    when nullif(trim(p_requested), '') is null then true
    when exists (select 1 from public.venue_area_options a
                 where lower(a.name) = lower(trim(p_requested))) then
      exists (select 1 from unnest(p_tags) tag where lower(tag) = lower(trim(p_requested)))
      or (cardinality(p_tags) = 0 and p_address ilike '%' || trim(p_requested) || '%')
    else p_address ilike '%' || trim(p_requested) || '%'
  end;
$$;
revoke all on function public.venue_matches_area(text, text[], text) from public, anon;
grant execute on function public.venue_matches_area(text, text[], text) to authenticated, service_role;

-- Catalogue RPCs keep their existing actor checks, capacity-review logic and
-- return shapes. Area tags are validated and saved in the same transaction.

-- Venue Catalogue: uniqueness moves from name alone to the (name, location)
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
  v_area_tags text[];
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
      name, location, area_tags, capacity, operating_hours, description,
      accessibility_notes, updated_by
    )
    values (
      v_name, v_location, v_area_tags, v_capacity, v_operating_hours, v_description,
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
  v_area_tags text[];
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
        area_tags = v_area_tags,
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

-- Apply area matching to both coordinator search and automatic suggestions.
-- SPM-21: coordinator-controlled search; unlike SPM-72 suggestions, only
-- venues available for the chosen period are returned.
create or replace function public.search_available_venues(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_min_capacity integer,
  p_location text default null,
  p_layout text default null,
  p_facilities text[] default '{}',
  p_accessibility text default null
) returns table (
  id uuid, name text, location text, capacity integer,
  operating_hours jsonb, description text, accessibility_notes text,
  updated_at timestamptz, facilities text[], layouts text[]
)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_event public.events;
begin
  if auth.uid() is null or public.current_user_role() <> 'event_coordinator'::public.user_role then
    raise exception 'Only Event Coordinators can search venues for an event'
      using errcode = '42501';
  end if;
  select * into v_event from public.events e where e.id = p_event_id;
  if not found or v_event.assigned_coordinator_id is distinct from auth.uid()
    or v_event.status <> 'planning' then
    raise exception 'Planning event not found or not assigned to you'
      using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Enter a valid start and end time' using errcode = '23514';
  end if;
  if p_min_capacity is null or p_min_capacity < 1 then
    raise exception 'Enter a positive minimum capacity' using errcode = '23514';
  end if;

  return query
  select v.id, v.name, v.location, v.capacity, v.operating_hours,
    v.description, v.accessibility_notes, v.updated_at,
    array(select vf.facility_name from public.venue_facilities vf
      where vf.venue_id = v.id order by vf.facility_name),
    array(select vl.layout_name::text from public.venue_layouts vl
      where vl.venue_id = v.id order by vl.layout_name::text)
  from public.venues v
  where v.capacity >= p_min_capacity
    and public.venue_booking_fits_operating_hours(v.id, p_starts_at, p_ends_at)
    and public.venue_matches_area(p_location, v.area_tags, v.location)
    and (nullif(trim(p_layout), '') is null or exists (
      select 1 from public.venue_layouts vl
      where vl.venue_id = v.id and lower(vl.layout_name::text) = lower(trim(p_layout))
    ))
    and (nullif(trim(p_accessibility), '') is null
      or v.accessibility_notes ilike '%' || trim(p_accessibility) || '%')
    and not exists (
      select 1 from unnest(coalesce(p_facilities, '{}'::text[])) requested(facility)
      where nullif(trim(requested.facility), '') is not null
        and not exists (
          select 1 from public.venue_facilities vf
          where vf.venue_id = v.id
            and lower(vf.facility_name) = lower(trim(requested.facility))
        )
    )
    and not exists (
      select 1 from public.venue_bookings b
      where b.venue_id = v.id and b.status in ('pending', 'approved')
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1 from public.venue_unavailability u
      where u.venue_id = v.id and u.removed_at is null
        and tstzrange(u.starts_at, u.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by v.name;
end;
$$;

revoke all on function public.search_available_venues(uuid, timestamptz, timestamptz, integer, text, text, text[], text) from public, anon;
grant execute on function public.search_available_venues(uuid, timestamptz, timestamptz, integer, text, text, text[], text) to authenticated;

-- Keep SPM-72 suggestions aligned with active blocks and stricter capacity.
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
  facilities text[],
  availability_status text
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
    ) as facilities,
    case
      when v_event.starts_at is null or v_event.ends_at is null then 'available'
      -- venue_bookings_no_overlap already guarantees at most one
      -- pending/approved booking can overlap a given venue+period, so
      -- 'confirmed' and 'pending' are mutually exclusive here.
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'approved'
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'confirmed'
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'pending'
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'pending'
      when exists (
        select 1
        from public.venue_unavailability vu
        where vu.venue_id = v.id and vu.removed_at is null
          and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'blocked'
      else 'available'
    end as availability_status
  from public.venues v
  left join public.venue_facilities vf on vf.venue_id = v.id
  where
    -- Capacity: always mandatory. A null expected_attendance (shouldn't
    -- normally happen for a Planning-stage event) defensively means "any
    -- capacity qualifies" rather than excluding every venue.
    (v.capacity >= greatest(coalesce(v_event.expected_attendance, 1), coalesce(v_req.minimum_capacity, 1)))

    -- Operating hours: always mandatory, and a hard exclusion (not merely a
    -- tag) — a venue that's structurally closed for part of the event's
    -- window can never actually host it, unlike a competing booking/block.
    and (
      v_event.starts_at is null or v_event.ends_at is null
      or public.venue_booking_fits_operating_hours(v.id, v_event.starts_at, v_event.ends_at)
    )

    -- Location: mandatory only when the event specifies a preferred_location.
    and public.venue_matches_area(v_req.preferred_location, v.area_tags, v.location)

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
