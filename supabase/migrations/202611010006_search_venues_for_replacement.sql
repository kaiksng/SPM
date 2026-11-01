-- SPM-82: a Confirmed event whose booked venue was disrupted must be able to
-- search for a replacement venue. search_available_venues only accepted
-- Planning events, so the coordinator's "Search venues" failed with "Planning
-- event not found or not assigned to you" even though request_replacement_venue
-- already accepts a Confirmed event. Only the status guard changes: Confirmed
-- is allowed while the event has an uncleared venue disruption.
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
    or not (
      v_event.status = 'planning'
      or (
        v_event.status = 'confirmed'
        and exists (
          select 1
          from public.venue_booking_disruptions d
          join public.venue_bookings b on b.id = d.booking_id
          where b.event_id = p_event_id and d.cleared_at is null
        )
      )
    ) then
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
