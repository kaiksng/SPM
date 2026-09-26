-- find_matching_venues used to silently drop a venue that matched every
-- stated requirement (capacity, location, layout, accessibility, facilities)
-- but happened to be busy for the event's exact schedule — a coordinator had
-- no way to tell "this venue doesn't fit" from "this venue fits but is
-- booked right now". Requirement mismatches still exclude a venue outright
-- (there's no useful way to book a venue that's too small or missing a
-- mandatory facility), but schedule conflicts now surface as an
-- availability_status on an otherwise-matching venue instead of removing it
-- from the list. Precedence when more than one applies: an actual booking
-- ('booked') outranks an operational block ('blocked'), which outranks
-- merely being closed for part of the window ('outside_hours') — the most
-- specific, actionable reason wins.
-- Postgres refuses `create or replace` when the return row shape changes
-- (adding availability_status here) — the function must be dropped first.
drop function public.find_matching_venues(uuid);

create function public.find_matching_venues(p_event_id uuid)
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
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status in ('approved', 'pending')
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'booked'
      when exists (
        select 1
        from public.venue_unavailability vu
        where vu.venue_id = v.id
          and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'blocked'
      when not public.venue_booking_fits_operating_hours(v.id, v_event.starts_at, v_event.ends_at)
        then 'outside_hours'
      else 'available'
    end as availability_status
  from public.venues v
  left join public.venue_facilities vf on vf.venue_id = v.id
  where
    -- Capacity: always mandatory. A null expected_attendance (shouldn't
    -- normally happen for a Planning-stage event) defensively means "any
    -- capacity qualifies" rather than excluding every venue.
    (v_event.expected_attendance is null or v.capacity >= v_event.expected_attendance)

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
