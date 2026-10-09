-- The single source of truth for "would this event conflict with this
-- venue, once setup/turnaround time is applied" — read-only, no writes.
-- Called three ways: directly from the frontend (to grey out the "Request
-- venue" button before the coordinator even clicks it, rather than only
-- erroring after a failed submission), and internally by
-- submit_venue_booking_request and decide_venue_booking_request, so the
-- frontend's pre-check and the server's real enforcement can never drift
-- apart — they're the same function.
--
-- Excludes the event's OWN booking row from the overlap scan
-- (vb.event_id <> p_event_id): when called from decide_venue_booking_request,
-- the booking being decided already exists as a 'pending' row for this
-- exact event/venue, and would otherwise always match itself as a false
-- "conflict." Harmless when called from submit_venue_booking_request, since
-- no row exists yet for that event at that point.
create or replace function public.check_venue_booking_availability(
  p_venue_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  event_row public.events;
  v_effective tstzrange;
  v_conflict_window tstzrange;
begin
  select * into event_row from public.events where id = p_event_id;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'Event not found.');
  end if;

  if event_row.starts_at is null or event_row.ends_at is null then
    return jsonb_build_object('available', false, 'reason', 'This event does not have a schedule set yet.');
  end if;

  if not exists (select 1 from public.venues where id = p_venue_id) then
    return jsonb_build_object('available', false, 'reason', 'Venue not found.');
  end if;

  v_effective := public.venue_effective_window(p_venue_id, event_row.starts_at, event_row.ends_at);

  if not public.venue_booking_fits_operating_hours(p_venue_id, lower(v_effective), upper(v_effective)) then
    return jsonb_build_object(
      'available', false,
      'reason', 'This event''s schedule, including setup and turnaround time, falls outside the venue''s operating days or hours.'
    );
  end if;

  select public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)
  into v_conflict_window
  from public.venue_bookings vb
  where vb.venue_id = p_venue_id
    and vb.status in ('pending', 'approved', 'on_hold')
    and vb.event_id <> p_event_id
    and public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at) && v_effective
  limit 1;

  if v_conflict_window is not null then
    return jsonb_build_object(
      'available', false,
      'reason', format(
        'This venue is already occupied from %s to %s (including setup and turnaround), which overlaps your requested period.',
        to_char(lower(v_conflict_window) at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon'),
        to_char(upper(v_conflict_window) at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
      )
    );
  end if;

  if exists (
    select 1 from public.venue_unavailability vu
    where vu.venue_id = p_venue_id and vu.removed_at is null
      and tstzrange(vu.starts_at, vu.ends_at) && v_effective
  ) then
    return jsonb_build_object(
      'available', false,
      'reason', 'This venue is unavailable for part of this event''s schedule, including setup and turnaround time.'
    );
  end if;

  return jsonb_build_object('available', true, 'reason', null);
end;
$$;

revoke all on function public.check_venue_booking_availability(uuid, uuid) from public, anon;
grant execute on function public.check_venue_booking_availability(uuid, uuid) to authenticated, service_role;
