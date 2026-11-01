-- SPM-46 AC01/AC02: an event can be completed once its scheduled end time
-- plus its venue's turnaround has passed. event_completion_available_at
-- (202610210001) took each Approved booking's own end plus turnaround, so a
-- booking left at an old date after the event's time changed (bookings are
-- never moved automatically, SPM-39 AC11) held completion back to that old
-- date. Each booking now counts only up to the event's end: the event is
-- over when its last room is free, no later than its scheduled end, plus
-- that venue's turnaround. A venue with no turnaround adds nothing, and an
-- event with no Approved booking still uses its own end time. Otherwise
-- unchanged (still security invoker).
create or replace function public.event_completion_available_at(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    e.ends_at,
    (
      select max(least(vb.ends_at, e.ends_at) + make_interval(mins => v.turnaround_time_minutes))
      from public.venue_bookings vb
      join public.venues v on v.id = vb.venue_id
      where vb.event_id = e.id and vb.status = 'approved'
    )
  )
  from public.events e
  where e.id = p_event_id;
$$;
