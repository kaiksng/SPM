-- Hold expiry AC03: read-only availability must release past-deadline holds
-- before submission can sweep their stored status to Expired. Keep active
-- holds, including legacy holds without a deadline, and all other checks.
create or replace function public.check_venue_booking_availability(
  p_venue_id uuid,
  p_event_id uuid,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_exclude_booking_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  event_row public.events;
  v_start timestamptz;
  v_end timestamptz;
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

  v_start := coalesce(p_starts_at, event_row.starts_at);
  v_end := coalesce(p_ends_at, event_row.ends_at);

  if v_end <= v_start then
    return jsonb_build_object('available', false, 'reason', 'The end must be after the start.');
  end if;

  if v_start < event_row.starts_at or v_end > event_row.ends_at then
    return jsonb_build_object(
      'available', false,
      'reason', 'This booking''s period must fall within the event''s start and end time.'
    );
  end if;

  v_effective := public.venue_effective_window(p_venue_id, v_start, v_end);

  if not public.venue_booking_fits_operating_hours(p_venue_id, lower(v_effective), upper(v_effective)) then
    return jsonb_build_object(
      'available', false,
      'reason', 'This booking''s period, including setup and turnaround time, falls outside the venue''s operating days or hours.'
    );
  end if;

  select public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)
  into v_conflict_window
  from public.venue_bookings vb
  where vb.venue_id = p_venue_id
    and (
      vb.status in ('pending', 'approved')
      or (vb.status = 'on_hold' and (vb.expires_at is null or vb.expires_at > now()))
    )
    and vb.id is distinct from p_exclude_booking_id
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
      'reason', 'This venue is unavailable for part of this booking''s period, including setup and turnaround time.'
    );
  end if;

  return jsonb_build_object('available', true, 'reason', null);
end;
$$;

revoke all on function public.check_venue_booking_availability(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.check_venue_booking_availability(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;

