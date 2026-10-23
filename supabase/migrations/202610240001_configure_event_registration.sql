-- Configure Event Registration.
--
-- The request form (PB-02/PB-03) only asks whether registration is
-- required; this is where the organiser sets the actual rules, once the
-- event reaches Planning.
--
--   AC02 the organiser can turn registration on or off and set its rules
--        while their own event is in Planning — including a Confirmed
--        event sent back to Planning.
--   AC03 when on, all five settings are required: opening time, closing
--        time, a positive whole-number capacity, waiting list yes/no and
--        withdrawal yes/no.
--   AC04 the opening time must be earlier than the closing time.
--   AC05 an invalid setting saves nothing; turning registration off needs
--        no other settings (and clears them).
--   AC06 only registration changes here — every other field stays under the
--        existing Planning lock (202609150008), which this doesn't touch.
--   AC07 from Pending Safety Check onward nothing can change; an event that
--        requires registration can't be submitted for the safety check
--        until its settings are complete and within the main venue's
--        capacity (event_readiness below, which
--        submit_event_for_safety_check already re-checks).
--   AC08 once the main venue booking is Approved, capacity can't exceed
--        that venue's capacity. A smaller venue approved afterwards isn't
--        blocked or auto-corrected — event_readiness reports it, and the
--        organiser's settings panel flags it.

-- 1. AC03: the fifth setting. The other four already exist (initial schema).
alter table public.event_registration_requirements
  add column withdrawal_permitted boolean not null default false;

-- 2. The approved main venue's capacity, or null when there isn't one (or
--    the venue has no recorded capacity). Shared by the RPC and readiness so
--    they never disagree about which venue caps registration.
create function public.event_main_venue_capacity(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select v.capacity
  from public.venue_bookings vb
  join public.venues v on v.id = vb.venue_id
  where vb.event_id = p_event_id
    and vb.is_main_venue
    and vb.status = 'approved'
  order by vb.requested_at desc
  limit 1;
$$;

revoke all on function public.event_main_venue_capacity(uuid) from public, anon;
grant execute on function public.event_main_venue_capacity(uuid) to authenticated, service_role;

-- 3. configure_event_registration — the organiser's only way to change
--    registration once the event has left the request stages. No
--    notifications are sent, so the browser calls it directly (same as
--    resolve_arrangement_flag).
create function public.configure_event_registration(
  p_event_id uuid,
  p_settings jsonb
)
returns public.event_registration_requirements
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  required_value boolean := coalesce((p_settings ->> 'required')::boolean, false);
  capacity_text text := nullif(trim(p_settings ->> 'capacity'), '');
  opens_value timestamptz := nullif(p_settings ->> 'opensAt', '')::timestamptz;
  closes_value timestamptz := nullif(p_settings ->> 'closesAt', '')::timestamptz;
  waitlist_value boolean := (p_settings ->> 'waitlistEnabled')::boolean;
  withdrawal_value boolean := (p_settings ->> 'withdrawalPermitted')::boolean;
  venue_capacity integer;
  result public.event_registration_requirements;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to configure registration'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.organiser_id is distinct from auth.uid() then
    raise exception 'Only the event''s organiser can configure its registration'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC02/AC07: Planning only. Before Planning the request form owns the
  -- "required" choice; from Pending Safety Check onward it is locked.
  if event_row.status <> 'planning'::public.event_status then
    raise exception 'Registration settings can only be changed while the event is in Planning'
      using errcode = 'check_violation';
  end if;

  if required_value then
    -- AC03
    if opens_value is null then
      raise exception 'Enter the registration opening time'
        using errcode = 'check_violation';
    end if;
    if closes_value is null then
      raise exception 'Enter the registration closing time'
        using errcode = 'check_violation';
    end if;
    if capacity_text is null or capacity_text !~ '^[1-9][0-9]*$' then
      raise exception 'Registration capacity must be a positive whole number'
        using errcode = 'check_violation';
    end if;
    if waitlist_value is null then
      raise exception 'Choose whether the waiting list is enabled'
        using errcode = 'check_violation';
    end if;
    if withdrawal_value is null then
      raise exception 'Choose whether attendees may withdraw'
        using errcode = 'check_violation';
    end if;

    -- AC04
    if closes_value <= opens_value then
      raise exception 'Registration closing time must be after its opening time'
        using errcode = 'check_violation';
    end if;

    -- AC08
    venue_capacity := public.event_main_venue_capacity(p_event_id);
    if venue_capacity is not null and capacity_text::integer > venue_capacity then
      raise exception 'Registration capacity cannot exceed the main venue''s capacity of %', venue_capacity
        using errcode = 'check_violation';
    end if;
  end if;

  -- AC05: turning registration off clears the rules rather than leaving
  -- stale ones behind.
  insert into public.event_registration_requirements (
    event_id, registration_required, registration_opens_at, registration_closes_at,
    attendee_capacity, waitlist_enabled, withdrawal_permitted
  )
  values (
    p_event_id,
    required_value,
    case when required_value then opens_value end,
    case when required_value then closes_value end,
    case when required_value then capacity_text::integer end,
    required_value and waitlist_value,
    required_value and withdrawal_value
  )
  on conflict (event_id) do update
  set
    registration_required = excluded.registration_required,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    attendee_capacity = excluded.attendee_capacity,
    waitlist_enabled = excluded.waitlist_enabled,
    withdrawal_permitted = excluded.withdrawal_permitted
  returning * into result;

  return result;
end;
$$;

revoke all on function public.configure_event_registration(uuid, jsonb) from public, anon;
grant execute on function public.configure_event_registration(uuid, jsonb) to authenticated;


-- 4. AC07/AC08: event_readiness (based on 202610200012, the latest
--    definition) also requires the registration settings to be complete and
--    within the main venue's capacity. Venue and equipment logic unchanged.
create or replace function public.event_readiness(p_event_id uuid, p_actor_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_venues jsonb := '[]'::jsonb;
  v_equipment jsonb := '[]'::jsonb;
  v_outstanding jsonb := '[]'::jsonb;
  v_venue_status text;
  v_equipment_status text;
  v_ready boolean;
  b record;
  r record;
  v_main_count integer := 0;
  v_main_complete boolean := true;
  v_any_venue_needs_review boolean := false;
  v_any_venue_pending boolean := false;
  v_requirement_count integer := 0;
  v_any_equipment_issue boolean := false;
  v_all_reserved boolean := true;
  v_item_status text;
  v_registration public.event_registration_requirements;
  v_venue_capacity integer;
  v_registration_ready boolean := true;
begin
  if not public.can_view_event(p_event_id, coalesce(p_actor_id, auth.uid())) then
    raise exception 'Event not found or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_event from public.events where id = p_event_id;

  -- AC02/AC03/AC07: a Pending request is Pending. An active (tentative)
  -- hold is Needs Review (AC02 names it explicitly), never Complete. An
  -- Approved booking that is flagged, disrupted, or has an active
  -- scheduling conflict is Needs Review. Only an Approved, unflagged,
  -- undisrupted, unconflicted booking is Complete. Rejected, cancelled and
  -- expired bookings are not "active" and are left out of the checklist
  -- entirely (AC03 explicitly allows a cancelled non-main booking; an
  -- expired or missing main venue fails readiness via "no main venue"
  -- below, not by appearing here).
  for b in
    select vb.id, vb.is_main_venue, vb.status, vb.needs_review, vb.needs_review_reason,
      coalesce(v.name, 'Unknown venue') as venue_name,
      exists (
        select 1 from public.venue_booking_disruptions d
        where d.booking_id = vb.id and d.cleared_at is null
      ) as disrupted,
      exists (
        select 1 from public.venue_booking_conflicts c
        where c.booking_id = vb.id and c.resolved_at is null
      ) as has_conflict
    from public.venue_bookings vb
    left join public.venues v on v.id = vb.venue_id
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved', 'on_hold')
    order by vb.is_main_venue desc, vb.requested_at
  loop
    if b.status = 'on_hold' then
      v_item_status := 'needs_review';
    elsif b.status <> 'approved' then
      v_item_status := 'pending';
    elsif b.needs_review or b.disrupted or b.has_conflict then
      v_item_status := 'needs_review';
    else
      v_item_status := 'complete';
    end if;

    if b.is_main_venue then
      v_main_count := v_main_count + 1;
      if v_item_status <> 'complete' then
        v_main_complete := false;
      end if;
    end if;
    if v_item_status = 'needs_review' then v_any_venue_needs_review := true; end if;
    if v_item_status = 'pending' then v_any_venue_pending := true; end if;

    v_venues := v_venues || jsonb_build_object(
      'bookingId', b.id,
      'venueName', b.venue_name,
      'isMainVenue', b.is_main_venue,
      'status', v_item_status,
      'needsReviewReason', case when v_item_status = 'needs_review' then b.needs_review_reason else null end
    );

    if v_item_status <> 'complete' then
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', case when b.is_main_venue then 'main_venue_not_ready' else 'venue_booking_not_ready' end,
        'message', case when b.is_main_venue
          then 'The main venue booking (' || b.venue_name || ') must be Approved and unflagged.'
          else 'The venue booking at ' || b.venue_name || ' must be Approved and unflagged, or cancelled.'
        end
      );
    end if;
  end loop;

  if v_main_count = 0 then
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'no_main_venue',
      'message', 'Choose a main venue booking before submitting.'
    );
  end if;

  if v_any_venue_needs_review then
    v_venue_status := 'needs_review';
  elsif v_main_count = 0 or not v_main_complete or v_any_venue_pending then
    v_venue_status := 'pending';
  else
    v_venue_status := 'complete';
  end if;

  -- AC01/AC03: a requirement's status is its latest hand-set arrangement
  -- update (Not started with no update at all). "Reserved" is checked
  -- directly against equipment_reservations: a hand-set Arranged status does
  -- not by itself guarantee a reservation exists.
  for r in
    select req.id, req.equipment_name, req.quantity, req.needs_review, req.needs_review_reason,
      coalesce(
        (select u.status from public.equipment_arrangement_updates u
          where u.requirement_id = req.id order by u.id desc limit 1),
        'not_started'
      ) as arrangement_status,
      exists (
        select 1 from public.equipment_reservations res
        where res.requirement_id = req.id and res.status = 'approved' and res.quantity >= req.quantity
      ) as reserved_in_full
    from public.event_equipment_requirements req
    where req.event_id = p_event_id
    order by req.equipment_name
  loop
    v_requirement_count := v_requirement_count + 1;

    if r.arrangement_status = 'issue' or r.needs_review then
      v_item_status := 'needs_review';
      v_any_equipment_issue := true;
    elsif r.arrangement_status = 'arranged' then
      v_item_status := 'complete';
    else
      v_item_status := 'pending';
    end if;

    if not r.reserved_in_full then
      v_all_reserved := false;
    end if;

    v_equipment := v_equipment || jsonb_build_object(
      'requirementId', r.id,
      'equipmentName', r.equipment_name,
      'quantity', r.quantity,
      'status', v_item_status,
      'needsReviewReason', case
        when v_item_status <> 'needs_review' then null
        when r.needs_review then r.needs_review_reason
        else r.equipment_name || ' is flagged Issue and needs review.'
      end
    );

    if r.arrangement_status = 'issue' then
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_needs_review',
        'message', r.equipment_name || ' is flagged Issue and needs review.'
      );
    elsif r.needs_review then
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_needs_review',
        'message', coalesce(r.needs_review_reason, r.equipment_name || ' needs review.')
      );
    elsif not r.reserved_in_full then
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_not_reserved',
        'message', r.equipment_name || ' is not yet fully reserved.'
      );
    end if;
  end loop;

  if v_requirement_count = 0 then
    -- By the time an event reaches Planning, submit_event_request has
    -- already required requirements_acknowledged, so this is always true in
    -- practice; kept as a defensive fallback rather than assumed.
    if v_event.requirements_acknowledged then
      v_equipment_status := 'not_required';
    else
      v_equipment_status := 'pending';
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_not_acknowledged',
        'message', 'Confirm that no equipment is required, or add the event''s equipment requirements.'
      );
    end if;
  elsif v_any_equipment_issue then
    v_equipment_status := 'needs_review';
  elsif v_all_reserved then
    v_equipment_status := 'complete';
  else
    v_equipment_status := 'pending';
  end if;

  -- Configure Event Registration AC07/AC08: registration the event requires
  -- must be fully set up, and within the approved main venue's capacity,
  -- before the safety check. The organiser fixes these, not the coordinator.
  select * into v_registration
  from public.event_registration_requirements
  where event_id = p_event_id;

  if v_registration.registration_required then
    if v_registration.registration_opens_at is null
      or v_registration.registration_closes_at is null
      or v_registration.attendee_capacity is null
    then
      v_registration_ready := false;
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'registration_incomplete',
        'message', 'The organiser must complete the registration settings (opening time, closing time and capacity).'
      );
    else
      v_venue_capacity := public.event_main_venue_capacity(p_event_id);
      if v_venue_capacity is not null and v_registration.attendee_capacity > v_venue_capacity then
        v_registration_ready := false;
        v_outstanding := v_outstanding || jsonb_build_object(
          'code', 'registration_over_capacity',
          'message', 'Registration capacity (' || v_registration.attendee_capacity
            || ') is more than the main venue''s capacity (' || v_venue_capacity
            || '). The organiser must lower it.'
        );
      end if;
    end if;
  end if;

  v_ready := v_venue_status = 'complete'
    and v_equipment_status in ('complete', 'not_required')
    and v_registration_ready;

  if v_ready then
    v_outstanding := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'ready', v_ready,
    'venues', v_venues,
    'venueArrangementStatus', v_venue_status,
    'equipment', v_equipment,
    'equipmentArrangementStatus', v_equipment_status,
    'outstandingItems', v_outstanding
  );
end;
$$;

revoke all on function public.event_readiness(uuid, uuid) from public, anon;
grant execute on function public.event_readiness(uuid, uuid) to authenticated, service_role;
