-- Tentative hold on a venue booking request.
--
-- Confirmed flow (discussed and agreed with the user, 2026-10-06):
--   1. Coordinator submits a venue booking request (existing, unchanged) ->
--      status 'pending'.
--   2. Venue Staff, instead of deciding right away, can put it On Hold with
--      an expiry: place_venue_booking_hold. The request still blocks the
--      slot while On Hold, same as Pending/Approved already do.
--   3. Before the expiry, the coordinator confirms: confirm_venue_booking_hold
--      flips it back to Pending, and Venue Staff decides normally
--      (decide_venue_booking_request, unchanged — it already requires
--      status = 'pending', so an On Hold row can't be approved/rejected
--      directly, by design).
--   4. If nobody confirms in time, the row should stop blocking the slot.
--      There is no cron anywhere in this codebase, and a gist exclusion
--      constraint can't reference now() (not immutable), so nothing can
--      make that happen on its own. Instead, every write path that needs an
--      accurate picture of a venue's occupancy calls
--      expire_stale_venue_holds(venue_id) first, which flips any of that
--      venue's own past-deadline On Hold rows to 'expired' before anything
--      else runs. Read-only paths (find_matching_venues, search_available_
--      venues — both STABLE, so they can't write) instead treat an On Hold
--      row as occupying only while expires_at > now(), the same
--      "compute live, don't store a derived status" approach
--      find_matching_venues's availability_status already uses.
--
-- Every place in this schema that already checks
-- status in ('pending', 'approved') to mean "this occupies the venue" needs
-- 'on_hold' added too — an active hold occupies the slot exactly like a
-- Pending or Approved booking does. That touches: the two exclusion
-- constraints, create_venue_block, submit_venue_booking_request,
-- search_available_venues, find_matching_venues, and update_venue's
-- capacity-reduction review flag. check_booking_against_blocks does NOT
-- need it: it only re-validates a row against blocks when venue_id/
-- starts_at/ends_at/status change to pending/approved, and placing a hold
-- never changes the period — confirming one back to 'pending' already
-- re-triggers that check as-is.

alter table public.venue_bookings
  add column expires_at timestamptz;

comment on column public.venue_bookings.expires_at is
  'Deadline for a request currently On Hold (status = on_hold). Null otherwise. Kept after the row leaves On Hold, as history.';

-- Both constraints are declarative WHERE-clause exclusions and can't be
-- altered in place; rebuilt with 'on_hold' added to the occupying statuses.
alter table public.venue_bookings
  drop constraint venue_bookings_no_overlap;

alter table public.venue_bookings
  add constraint venue_bookings_no_overlap
  exclude using gist (
    venue_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = any (array['pending', 'approved', 'on_hold']::public.request_status[]));

alter table public.venue_bookings
  drop constraint venue_bookings_one_active_per_event;

alter table public.venue_bookings
  add constraint venue_bookings_one_active_per_event
  exclude using gist (
    event_id with =
  ) where (status = any (array['pending', 'approved', 'on_hold']::public.request_status[]));

-- Called by every write path below before it checks occupancy for a venue,
-- so a stale On Hold row (past its own expiry, never confirmed) stops
-- blocking the slot the moment anyone next tries to act on that venue.
create or replace function public.expire_stale_venue_holds(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_bookings
  set status = 'expired'
  where venue_id = p_venue_id
    and status = 'on_hold'
    and expires_at <= now();
end;
$$;

revoke all on function public.expire_stale_venue_holds(uuid) from public, anon;
grant execute on function public.expire_stale_venue_holds(uuid) to authenticated, service_role;

-- Venue Staff puts a Pending request On Hold with a deadline.
create or replace function public.place_venue_booking_hold(
  p_booking_id uuid,
  p_expires_at timestamptz,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  booking_row public.venue_bookings;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot place a hold on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to place a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can place a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row
  from public.venue_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be put on hold'
      using errcode = 'check_violation';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Enter an expiry date and time in the future'
      using errcode = 'check_violation';
  end if;

  if p_expires_at >= booking_row.starts_at then
    raise exception 'The expiry must be before the requested period starts'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'on_hold',
      expires_at = p_expires_at
  where id = p_booking_id;

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'status', 'on_hold',
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.place_venue_booking_hold(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.place_venue_booking_hold(uuid, timestamptz, uuid) to authenticated, service_role;

-- The requesting coordinator confirms an On Hold request before its
-- deadline, returning it to Pending for Venue Staff to decide normally.
-- Confirming after the deadline has actually passed instead flips it to
-- Expired (the same thing expire_stale_venue_holds would have done on the
-- next write to this venue) and reports that, rather than silently
-- reviving a lapsed hold.
create or replace function public.confirm_venue_booking_hold(
  p_booking_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  booking_row public.venue_bookings;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot confirm a hold on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to confirm a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row
  from public.venue_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.requested_by is distinct from actor_id then
    raise exception 'Only the coordinator who submitted this request can confirm its hold'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'on_hold' then
    raise exception 'Only a request On Hold can be confirmed'
      using errcode = 'check_violation';
  end if;

  if booking_row.expires_at <= now() then
    update public.venue_bookings set status = 'expired' where id = p_booking_id;
    raise exception 'This hold has expired. Submit a new venue booking request.'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'pending'
  where id = p_booking_id;

  return jsonb_build_object('bookingId', p_booking_id, 'status', 'pending');
end;
$$;

revoke all on function public.confirm_venue_booking_hold(uuid, uuid) from public, anon;
grant execute on function public.confirm_venue_booking_hold(uuid, uuid) to authenticated, service_role;

-- create_venue_block: sweep this venue's stale holds first, then also treat
-- an active (unexpired) hold as occupying, same as Pending/Approved.
create or replace function public.create_venue_block(
  p_venue_id uuid, p_reason text, p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or public.current_user_role() <> 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can create blocks' using errcode = '42501';
  end if;
  if p_venue_id is null then
    raise exception 'Select a venue' using errcode = '23514';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Enter a reason' using errcode = '23514';
  end if;
  if p_starts_at is null then
    raise exception 'Enter a start time' using errcode = '23514';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '23514';
  end if;

  -- Booking writes take the same lock in check_booking_against_blocks.
  perform 1 from public.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Venue not found' using errcode = '23514';
  end if;

  perform public.expire_stale_venue_holds(p_venue_id);

  if exists (
    select 1 from public.venue_bookings b
    where b.venue_id = p_venue_id and b.status in ('pending', 'approved', 'on_hold')
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'This block overlaps a Pending or Confirmed booking'
      using errcode = '23514';
  end if;
  insert into public.venue_unavailability (venue_id, reason, starts_at, ends_at)
  values (p_venue_id, trim(p_reason), p_starts_at, p_ends_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- submit_venue_booking_request: sweep this venue's stale holds first, then
-- also treat an active hold as blocking the slot, same as Pending/Approved.
create or replace function public.submit_venue_booking_request(p_event_id uuid, p_venue_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  venue_row public.venues;
  new_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to submit a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the assigned coordinator can submit a venue booking request for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can have a venue booking request submitted'
      using errcode = 'check_violation';
  end if;

  if event_row.starts_at is null or event_row.ends_at is null then
    raise exception 'Set this event''s schedule before requesting a venue'
      using errcode = 'check_violation';
  end if;
  if p_venue_id is null then
    raise exception 'Select a venue before submitting'
      using errcode = 'check_violation';
  end if;

  select * into venue_row from public.venues where id = p_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.expire_stale_venue_holds(p_venue_id);

  if not public.venue_booking_fits_operating_hours(p_venue_id, event_row.starts_at, event_row.ends_at) then
    raise exception 'This event''s schedule falls outside the venue''s operating days or hours'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings vb
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This event already has an active venue booking request'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings vb
    where vb.venue_id = p_venue_id
      and vb.status in ('pending', 'approved', 'on_hold')
      and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(event_row.starts_at, event_row.ends_at)
  ) then
    raise exception 'This venue already has a Pending or Approved booking for part of this event''s schedule'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_unavailability vu
    where vu.venue_id = p_venue_id and vu.removed_at is null
      and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(event_row.starts_at, event_row.ends_at)
  ) then
    raise exception 'This venue is unavailable for part of this event''s schedule'
      using errcode = 'check_violation';
  end if;

  insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at)
  values (p_event_id, p_venue_id, auth.uid(), event_row.starts_at, event_row.ends_at)
  returning id into new_booking_id;

  return new_booking_id;
end;
$$;

-- search_available_venues (manual search): a venue is excluded while it has
-- a Pending/Approved booking, or an On Hold one that hasn't yet expired —
-- STABLE, so it can't sweep; computes the live effective state instead.
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
returns table(id uuid, name text, location text, capacity integer, operating_hours jsonb, description text, accessibility_notes text, updated_at timestamp with time zone, facilities text[], layouts text[])
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
      where vl.venue_id = v.id order by vl.layout_name::text)
  from public.venues v
  where v.capacity >= p_min_capacity
    and public.venue_booking_fits_operating_hours(v.id, p_starts_at, p_ends_at)
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
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1 from public.venue_unavailability u
      where u.venue_id = v.id and u.removed_at is null
        and tstzrange(u.starts_at, u.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by v.name;
end;
$$;

-- find_matching_venues: an 'on_hold' tag joins the existing
-- confirmed/pending/blocked ones, shown only while the hold hasn't expired
-- — STABLE, same live-compute reasoning as search_available_venues above.
create or replace function public.find_matching_venues(p_event_id uuid)
returns table(id uuid, name text, location text, capacity integer, operating_hours jsonb, description text, accessibility_notes text, updated_at timestamp with time zone, facilities text[], availability_status text)
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
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'confirmed'
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'pending'
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'pending'
      when exists (
        select 1
        from public.venue_bookings vb
        where vb.venue_id = v.id
          and vb.status = 'on_hold'
          and vb.expires_at > now()
          and tstzrange(vb.starts_at, vb.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'on_hold'
      when exists (
        select 1
        from public.venue_unavailability vu
        where vu.venue_id = v.id and vu.removed_at is null
          and tstzrange(vu.starts_at, vu.ends_at) && tstzrange(v_event.starts_at, v_event.ends_at)
      ) then 'blocked'
      else 'available'
    end as availability_status
  from public.venues v
  left join public.venue_facilities vf on vf.venue_id = v.id
  where
    (v.capacity >= greatest(coalesce(v_event.expected_attendance, 1), coalesce(v_req.minimum_capacity, 1)))

    and (
      v_event.starts_at is null or v_event.ends_at is null
      or public.venue_booking_fits_operating_hours(v.id, v_event.starts_at, v_event.ends_at)
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

-- update_venue: an On Hold booking is reviewed on a capacity reduction too,
-- same as Pending/Approved (it still represents a real reservation).
create or replace function public.update_venue(p_venue_id uuid, p_venue jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_id uuid;
  actor_role public.user_role;
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
  v_area_tags text[];
  v_layouts text[];
  old_venue public.venues;
  venue_row public.venues;
  issues jsonb := '[]'::jsonb;
  booking record;
  flagged_count integer := 0;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot update a venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to update a venue'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role <> 'venue_staff' then
    raise exception 'Only Venue Staff can update venues'
      using errcode = 'insufficient_privilege';
  end if;

  select * into old_venue
  from public.venues
  where id = p_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  begin
    v_capacity := (p_venue ->> 'capacity')::integer;
  exception when others then
    v_capacity := null;
  end;

  select array_agg(distinct trim(facility))
  into v_facilities
  from jsonb_array_elements_text(coalesce(p_venue -> 'facilities', '[]'::jsonb)) as facility
  where trim(facility) <> '';

  select array(select distinct trim(area)
    from jsonb_array_elements_text(coalesce(p_venue -> 'area_tags', '[]'::jsonb)) as area
    where trim(area) <> '') into v_area_tags;
  if not (p_venue ? 'area_tags') then
    v_area_tags := old_venue.area_tags;
  end if;

  select array_agg(distinct trim(layout))
  into v_layouts
  from jsonb_array_elements_text(coalesce(p_venue -> 'layouts', '[]'::jsonb)) as layout
  where trim(layout) <> '';

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    issues := issues || jsonb_build_object(
      'field', 'name',
      'message', 'Venue name must contain between 2 and 160 characters');
  end if;

  if v_location is null then
    issues := issues || jsonb_build_object(
      'field', 'location',
      'message', 'Enter the venue location');
  end if;

  if v_capacity is null or v_capacity <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'capacity',
      'message', 'Enter capacity as a positive whole number');
  end if;

  v_operating_hours_error := public.validate_operating_hours(v_operating_hours);
  if v_operating_hours_error is not null then
    issues := issues || jsonb_build_object(
      'field', 'operatingHours',
      'message', v_operating_hours_error);
  end if;

  if (p_venue ? 'area_tags' and cardinality(v_area_tags) = 0) or exists (
    select 1 from unnest(v_area_tags) as tag(name)
    where not exists (select 1 from public.venue_area_options option where option.name = tag.name)
  ) then
    issues := issues || jsonb_build_object(
      'field', 'areaTags',
      'message', 'Select at least one area from the standard list');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select at least one supported room layout');
  elsif exists (
    select 1 from unnest(v_layouts) as layout
    where char_length(layout) > 120
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Room layout names must contain at most 120 characters');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    update public.venues
    set name = v_name,
        location = v_location,
        area_tags = v_area_tags,
        capacity = v_capacity,
        operating_hours = v_operating_hours,
        description = v_description,
        accessibility_notes = v_accessibility_notes,
        updated_by = actor_id
    where id = p_venue_id
    returning * into venue_row;
  exception when unique_violation then
    raise exception 'A venue named "%" already exists at "%"', v_name, v_location
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists at "' || v_location || '".'
        )::text;
  end;

  delete from public.venue_facilities where venue_id = p_venue_id;
  insert into public.venue_facilities (venue_id, facility_name)
  select p_venue_id, facility
  from unnest(v_facilities) as facility;

  delete from public.venue_layouts where venue_id = p_venue_id;
  insert into public.venue_layouts (venue_id, layout_name)
  select p_venue_id, layout
  from unnest(v_layouts) as layout;

  if old_venue.capacity is not null and v_capacity < old_venue.capacity then
    for booking in
      select vb.id, vb.event_id, e.title, e.expected_attendance, e.assigned_coordinator_id
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id
        and vb.status in ('approved', 'pending', 'on_hold')
        and e.expected_attendance is not null
        and e.expected_attendance > v_capacity
    loop
      update public.venue_bookings
      set needs_review = true,
          needs_review_reason =
            'Venue capacity reduced to ' || v_capacity ||
            ', below this booking''s expected attendance of ' ||
            booking.expected_attendance || '.'
      where id = booking.id;

      flagged_count := flagged_count + 1;

      if booking.assigned_coordinator_id is not null then
        insert into public.notifications (recipient_id, event_id, type, title, message)
        values (
          booking.assigned_coordinator_id,
          booking.event_id,
          'venue_capacity_review'::public.notification_type,
          'Venue capacity change needs review',
          'The venue for "' || booking.title || '" reduced its capacity to ' ||
            v_capacity || ', below the expected attendance of ' ||
            booking.expected_attendance || '. This booking now needs review.'
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at,
    'flaggedBookingsCount', flagged_count
  );
end;
$$;
