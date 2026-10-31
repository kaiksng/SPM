-- Upcoming events on the public main page, for visitors who have not signed
-- in. Not part of the project brief; it fills the page's "For you"
-- placeholder.
--
-- RLS gives anonymous visitors no access to events at all, and stays that
-- way. Instead this function returns only what the page shows, for the same
-- events an attendee can browse (confirmed, taking registrations) that have
-- not ended yet: title, period, location, banner, and the registration
-- window with whether it is full. No organiser, coordinator, planning detail
-- or live registration numbers reach a signed-out browser.

create or replace function public.list_public_events(p_limit integer default 6)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  banner_path text,
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
    rr.registration_opens_at,
    rr.registration_closes_at,
    rr.attendee_capacity is not null and (
      select count(*) from public.event_registrations r
      where r.event_id = e.id and r.status = 'registered'
    ) >= rr.attendee_capacity
  from public.events e
  join public.event_registration_requirements rr
    on rr.event_id = e.id and rr.registration_required
  left join public.event_venue_requirements vr on vr.event_id = e.id
  where e.status = 'confirmed'
    and (e.ends_at is null or e.ends_at > now())
  order by e.starts_at nulls last, e.title
  limit greatest(least(coalesce(p_limit, 6), 50), 1);
$$;

revoke all on function public.list_public_events(integer) from public;
grant execute on function public.list_public_events(integer) to anon, authenticated;
