-- Attendees see where a Confirmed event takes place: the booked venue's name
-- and location, not just the organiser's preferred area.
--
--   * attendee_event_venues: for events attendees can follow (Confirmed or
--     Completed), each approved venue booking's venue name, location, label
--     and whether it is the main venue. Only those fields: no booking notes,
--     setup times, other bookings or anything else about venues (SPM-49).
--     Nothing while an event is being updated: its venue is to be confirmed.
--   * list_public_events (last 202611010011) also returns the main venue.

create or replace function public.attendee_event_venues(p_event_ids uuid[])
returns table (
  event_id uuid,
  venue_name text,
  venue_location text,
  label text,
  is_main_venue boolean
)
language sql stable security definer set search_path = ''
as $$
  select b.event_id, v.name, v.location, b.label, b.is_main_venue
  from public.venue_bookings b
  join public.venues v on v.id = b.venue_id
  join public.events e on e.id = b.event_id
  where auth.uid() is not null
    and b.event_id = any (p_event_ids)
    and b.status = 'approved'
    and e.status in ('confirmed', 'completed')
  order by b.event_id, b.is_main_venue desc, b.requested_at;
$$;

revoke all on function public.attendee_event_venues(uuid[]) from public, anon;
grant execute on function public.attendee_event_venues(uuid[]) to authenticated;

drop function public.list_public_events(integer);

create function public.list_public_events(p_limit integer default 6)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  banner_path text,
  registration_required boolean,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  is_full boolean,
  being_updated boolean,
  venue_name text,
  venue_location text
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    vr.preferred_location,
    e.banner_path,
    coalesce(rr.registration_required, false),
    case when rr.registration_required then rr.registration_opens_at end,
    case when rr.registration_required then rr.registration_closes_at end,
    coalesce(rr.registration_required, false)
      and rr.attendee_capacity is not null
      and (
        select count(*) from public.event_registrations r
        where r.event_id = e.id and r.status = 'registered'
      ) >= rr.attendee_capacity,
    e.status <> 'confirmed',
    main_venue.name,
    main_venue.location
  from public.events e
  left join public.event_registration_requirements rr on rr.event_id = e.id
  left join public.event_venue_requirements vr on vr.event_id = e.id
  -- The booked main venue, once the event is Confirmed; none while it is
  -- being updated ("venue to be confirmed").
  left join lateral (
    select v.name, v.location
    from public.venue_bookings b
    join public.venues v on v.id = b.venue_id
    where b.event_id = e.id and b.status = 'approved' and b.is_main_venue and e.status = 'confirmed'
    order by b.requested_at
    limit 1
  ) main_venue on true
  where (e.status = 'confirmed' or public.event_is_being_updated(e.id))
    and (e.ends_at is null or e.ends_at > now())
  order by e.starts_at nulls last, e.title
  limit greatest(least(coalesce(p_limit, 6), 50), 1);
$$;

revoke all on function public.list_public_events(integer) from public;
grant execute on function public.list_public_events(integer) to anon, authenticated;
