-- SPM-82: suitability checks for a replacement venue.
--   * Required facilities the venue lacks now refuse the request (hard check,
--     same match rule as search/suggestions), alongside the capacity check.
--   * Layout and accessibility mismatches do not refuse it; they are saved on
--     the booking as advisory notes for Venue Staff to see when they decide.
alter table public.venue_bookings add column advisory_notes text;
comment on column public.venue_bookings.advisory_notes is
  'SPM-82: requirements (layout, accessibility) the replacement venue does not appear to meet, for Venue Staff.';

create or replace function public.request_replacement_venue(
  p_booking_id uuid,
  p_venue_id uuid,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  original public.venue_bookings;
  event_row public.events;
  venue_row public.venues;
  original_venue_name text;
  new_booking_id uuid;
  v_availability jsonb;
  v_req public.event_venue_requirements;
  v_missing text;
  v_advisory text := '';
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot request a replacement venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to request a replacement venue'
      using errcode = 'insufficient_privilege';
  end if;

  select * into original from public.venue_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Venue booking not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = original.event_id;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can request a replacement venue for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status not in ('planning', 'confirmed') then
    raise exception 'A replacement venue can only be requested for a Planning or Confirmed event'
      using errcode = 'check_violation';
  end if;

  -- A stale hold stops being active the moment anyone next acts on it.
  perform public.expire_stale_event_hold(original.event_id);
  select * into original from public.venue_bookings where id = p_booking_id;

  if original.status not in ('pending', 'approved', 'on_hold') then
    raise exception 'Only an active venue booking can be replaced'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.venue_booking_disruptions d
    where d.booking_id = original.id and d.cleared_at is null
  ) then
    raise exception 'This venue booking is not disrupted, so it does not need a replacement'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings r
    where r.replaces_booking_id = original.id
      and r.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This venue booking already has a pending replacement request'
      using errcode = 'check_violation';
  end if;

  if p_venue_id is null then
    raise exception 'Select a venue before submitting'
      using errcode = 'check_violation';
  end if;
  if p_venue_id = original.venue_id then
    raise exception 'Choose a different venue from the one that is unavailable'
      using errcode = 'check_violation';
  end if;

  -- The replacement covers the same period; a different date or time is a
  -- change request (SPM-38), not a replacement.
  if event_row.starts_at is distinct from original.starts_at
    or event_row.ends_at is distinct from original.ends_at then
    raise exception 'This booking no longer matches the event''s schedule. Submit a change request to change the date or time'
      using errcode = 'check_violation';
  end if;

  select * into venue_row from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.expire_stale_venue_holds(p_venue_id);

  if event_row.expected_attendance is not null
    and venue_row.capacity < event_row.expected_attendance then
    raise exception 'This venue''s capacity (%) is below the event''s expected attendance (%)',
      venue_row.capacity, event_row.expected_attendance
      using errcode = 'check_violation';
  end if;

  -- A required facility the venue lacks makes it unsuitable, the same rule
  -- the venue search and suggestions use (case-insensitive name match). The
  -- brief names this alongside capacity as the case where a venue should not
  -- normally be treated as suitable.
  select string_agg(erf.facility_name, ', ' order by erf.facility_name)
  into v_missing
  from public.event_required_facilities erf
  where erf.event_id = original.event_id
    and not exists (
      select 1 from public.venue_facilities vf
      where vf.venue_id = p_venue_id
        and lower(vf.facility_name) = lower(erf.facility_name)
    );
  if v_missing is not null then
    raise exception 'This venue is missing required facilities: %', v_missing
      using errcode = 'check_violation';
  end if;

  -- Layout and accessibility are guidance, not blocks (they are search
  -- filters, and the Safety Officer reviews them later). A mismatch is
  -- recorded on the request so Venue Staff see it when they decide.
  select * into v_req from public.event_venue_requirements r where r.event_id = original.event_id;
  if found then
    if nullif(trim(coalesce(v_req.layout_notes, '')), '') is not null
      and not exists (
        select 1 from public.venue_layouts vl
        where vl.venue_id = p_venue_id
          and vl.layout_name::text ilike '%' || v_req.layout_notes || '%'
      ) then
      v_advisory := v_advisory || 'Layout: the event asked for "' || trim(v_req.layout_notes)
        || '" but this venue lists no matching layout. ';
    end if;
    if nullif(trim(coalesce(v_req.accessibility_notes, '')), '') is not null
      and not (coalesce(venue_row.accessibility_notes, '') ilike '%' || v_req.accessibility_notes || '%') then
      v_advisory := v_advisory || 'Accessibility: the event asked for "' || trim(v_req.accessibility_notes)
        || '" but this venue''s notes do not mention it. ';
    end if;
  end if;

  v_availability := public.check_venue_booking_availability(p_venue_id, original.event_id);
  if not (v_availability ->> 'available')::boolean then
    raise exception '%', (v_availability ->> 'reason')
      using errcode = 'check_violation';
  end if;

  insert into public.venue_bookings (
    event_id, venue_id, requested_by, starts_at, ends_at, replaces_booking_id, is_main_venue,
    advisory_notes
  )
  values (
    original.event_id, p_venue_id, actor_id, original.starts_at, original.ends_at,
    original.id, original.is_main_venue, nullif(trim(v_advisory), '')
  )
  returning id into new_booking_id;

  select name into original_venue_name from public.venues where id = original.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    original.event_id,
    new_booking_id,
    'venue_request'::public.notification_type,
    'New replacement venue booking request',
    'A replacement venue booking request for "' || event_row.title || '" at ' || venue_row.name
      || ' (replacing its disrupted booking at ' || original_venue_name
      || ') is awaiting your review.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return new_booking_id;
end;
$$;

revoke all on function public.request_replacement_venue(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_replacement_venue(uuid, uuid, uuid) to authenticated, service_role;
