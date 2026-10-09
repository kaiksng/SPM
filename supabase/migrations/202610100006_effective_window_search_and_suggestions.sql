-- Both functions switch every overlap/operating-hours check to the
-- effective window (incoming search/event side always buffered via
-- venue_effective_window; the existing-booking side buffered via the same
-- venue; the block side stays raw — a block has no setup/turnaround of its
-- own). Both also start returning the venue's setup_time_minutes/
-- turnaround_time_minutes so the frontend can display them.
--
-- Adding output columns changes a RETURNS TABLE(...) function's return
-- type, which CREATE OR REPLACE refuses ("cannot change return type of
-- existing function") — both old signatures are dropped explicitly first,
-- same reasoning as submit_venue_booking_request's earlier parameter change.
drop function if exists public.search_available_venues(uuid, timestamp with time zone, timestamp with time zone, integer, text, text, text[], text);
drop function if exists public.find_matching_venues(uuid);

create or replace function public.search_available_venues(
  p_event_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_min_capacity integer,
  p_location text default null::text,
  p_layout text default null::text,
  p_facilities text[] default '{}'::text[],
  p_accessibility text default null::text
)
returns table(id uuid, name text, location text, capacity integer, operating_hours jsonb, description text, accessibility_notes text, updated_at timestamp with time zone, facilities text[], layouts text[], setup_time_minutes integer, turnaround_time_minutes integer)
language plpgsql
stable
set search_path to ''
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
      where vl.venue_id = v.id order by vl.layout_name::text),
    v.setup_time_minutes,
    v.turnaround_time_minutes
  from public.venues v
  where v.capacity >= p_min_capacity
    and public.venue_booking_fits_operating_hours(
      v.id,
      lower(public.venue_effective_window(v.id, p_starts_at, p_ends_at)),
      upper(public.venue_effective_window(v.id, p_starts_at, p_ends_at))
    )
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
      where b.venue_id = v.id
        and (
          b.status in ('pending', 'approved')
          or (b.status = 'on_hold' and b.expires_at > now())
        )
        and public.venue_effective_window(v.id, b.starts_at, b.ends_at)
          && public.venue_effective_window(v.id, p_starts_at, p_ends_at)
    )
    and not exists (
      select 1 from public.venue_unavailability u
      where u.venue_id = v.id and u.removed_at is null
        and tstzrange(u.starts_at, u.ends_at, '[)')
          && public.venue_effective_window(v.id, p_starts_at, p_ends_at)
    )
  order by v.name;
end;
$$;

-- find_matching_venues: an 'on_hold' tag joins the existing
-- confirmed/pending/blocked ones, shown only while the hold hasn't expired
-- — STABLE, same live-compute reasoning as search_available_venues above.
create or replace function public.find_matching_venues(p_event_id uuid)
returns table(id uuid, name text, location text, capacity integer, operating_hours jsonb, description text, accessibility_notes text, updated_at timestamp with time zone, facilities text[], availability_status text, setup_time_minutes integer, turnaround_time_minutes integer)
language plpgsql
stable
set search_path to ''
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
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'approved'
          and public.venue_effective_window(v.id, vb.starts_at, vb.ends_at)
            && public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at)
      ) then 'confirmed'
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'pending'
          and public.venue_effective_window(v.id, vb.starts_at, vb.ends_at)
            && public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at)
      ) then 'pending'
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'on_hold'
          and vb.expires_at > now()
          and public.venue_effective_window(v.id, vb.starts_at, vb.ends_at)
            && public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at)
      ) then 'on_hold'
      when exists (
        select 1
        from public.venue_unavailability vu
        where vu.venue_id = v.id and vu.removed_at is null
          and tstzrange(vu.starts_at, vu.ends_at)
            && public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at)
      ) then 'blocked'
      else 'available'
    end as availability_status,
    v.setup_time_minutes,
    v.turnaround_time_minutes
  from public.venues v
  left join public.venue_facilities vf on vf.venue_id = v.id
  where
    (v.capacity >= greatest(coalesce(v_event.expected_attendance, 1), coalesce(v_req.minimum_capacity, 1)))

    and (
      v_event.starts_at is null or v_event.ends_at is null
      or public.venue_booking_fits_operating_hours(
        v.id,
        lower(public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at)),
        upper(public.venue_effective_window(v.id, v_event.starts_at, v_event.ends_at))
      )
    )

    and public.venue_matches_area(v_req.preferred_location, v.area_tags, v.location)

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

    and (
      v_req.accessibility_notes is null
      or trim(v_req.accessibility_notes) = ''
      or v.accessibility_notes ilike '%' || v_req.accessibility_notes || '%'
    )

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

-- Both functions' grants are re-issued: the explicit DROPs above remove the
-- grants a prior migration had set (input argument types, i.e. identity for
-- privilege purposes, are unchanged, so these target the same functions).
revoke all on function public.search_available_venues(uuid, timestamp with time zone, timestamp with time zone, integer, text, text, text[], text) from public, anon;
grant execute on function public.search_available_venues(uuid, timestamp with time zone, timestamp with time zone, integer, text, text, text[], text) to authenticated, service_role;

revoke all on function public.find_matching_venues(uuid) from public, anon;
grant execute on function public.find_matching_venues(uuid) to authenticated, service_role;
