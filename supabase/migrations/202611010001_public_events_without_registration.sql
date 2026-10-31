-- The public main page lists every upcoming confirmed event, including ones
-- that don't take registrations (last 202610310001, which listed only events
-- taking registrations). Each row now says whether the event takes
-- registrations, so the page can show "No registration needed" for the rest.
-- Still only what the page shows; still no live registration numbers.

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
  is_full boolean
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
      ) >= rr.attendee_capacity
  from public.events e
  left join public.event_registration_requirements rr on rr.event_id = e.id
  left join public.event_venue_requirements vr on vr.event_id = e.id
  where e.status = 'confirmed'
    and (e.ends_at is null or e.ends_at > now())
  order by e.starts_at nulls last, e.title
  limit greatest(least(coalesce(p_limit, 6), 50), 1);
$$;

revoke all on function public.list_public_events(integer) from public;
grant execute on function public.list_public_events(integer) to anon, authenticated;
