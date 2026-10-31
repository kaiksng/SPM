-- Equipment unavailability (SPM-30) and hand-set arrangement statuses
-- (SPM-28) are removed: they were beyond what the project needs.
--
-- What stays: a reservation still takes its units out of what every
-- overlapping event can reserve (SPM-31/SPM-32), and retired units still
-- don't count as stock.
--
-- 1. Availability no longer subtracts unavailability records.
--    equipment_commitment_peaks and check_event_equipment_availability are
--    recreated without their unavailable figure (last 202610061002 and
--    202610300007; otherwise unchanged).
-- 2. The unavailability functions and tables are dropped, with their rows.
-- 3. update_equipment_arrangement is dropped, so nobody can set an
--    arrangement status or note by hand (SPM-28 AC06). The status always
--    follows the reservation (AC02). equipment_arrangement_updates stays as
--    its history (AC03): reserving, changing, releasing and re-checking
--    still record an entry (202610290003), as does a change to a requested
--    item (202610290002).
-- 4. event_readiness (last 202610310008) works out each requirement's status
--    from its reservation only, ignoring any status set by hand earlier.
--    Otherwise unchanged.

-- 1. Availability -------------------------------------------------------------

drop function public.check_event_equipment_availability(uuid[]);
drop function public.equipment_commitment_peaks(uuid, timestamptz, timestamptz, uuid);

-- The single place availability is calculated, shared by the SPM-31 check,
-- reserving and event_readiness: the busiest moment of the period's
-- approved reservations. With reservations the only commitment, peak_all
-- and peak_reserved are the same; both are kept so their callers
-- (lock_requirement_for_reservation, event_readiness, the check) are
-- unchanged.
create function public.equipment_commitment_peaks(
  p_item_id uuid,
  p_from timestamptz,
  p_until timestamptz,
  p_exclude_requirement_id uuid default null
)
returns table (peak_all integer, peak_reserved integer)
language sql stable security definer set search_path = ''
as $$
  with commitments as (
    select er.quantity as qty, er.starts_at as starts, er.ends_at as ends
    from public.equipment_reservations er
    where er.equipment_item_id = p_item_id
      and er.status = 'approved'
      -- A requirement's own reservation is not competition for itself.
      and er.requirement_id is distinct from p_exclude_requirement_id
  ),
  points as (
    select p_from as point
    union
    select c.starts from commitments c where c.starts > p_from and c.starts < p_until
  ),
  loads as (
    select coalesce(sum(c.qty), 0) as reserved_qty
    from points p
    left join commitments c on c.starts <= p.point and c.ends > p.point
    group by p.point
  )
  select
    coalesce(max(reserved_qty), 0)::integer,
    coalesce(max(reserved_qty), 0)::integer
  from loads;
$$;

revoke all on function public.equipment_commitment_peaks(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- SPM-31 check (last 202610300007), without the unavailable quantity.
create function public.check_event_equipment_availability(p_event_ids uuid[])
returns table (
  requirement_id uuid,
  event_id uuid,
  equipment_item_id uuid,
  equipment_name text,
  item_code text,
  item_retired boolean,
  requested_quantity integer,
  required_from timestamptz,
  required_until timestamptz,
  technical_requirements text,
  total_units integer,
  reserved_quantity integer,
  available_quantity integer,
  status text,
  reservation_id uuid,
  reservation_quantity integer,
  reservation_needs_recheck boolean,
  reservation_recheck_reason text,
  reserved_by_name text,
  reserved_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can check equipment availability'
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.event_id,
    r.equipment_item_id,
    r.equipment_name,
    i.code,
    i.retired_at is not null,
    r.quantity,
    r.required_from,
    r.required_until,
    r.notes,
    coalesce(i.total_quantity, 0),
    coalesce(p.peak_reserved, 0),
    greatest(coalesce(i.total_quantity, 0) - coalesce(p.peak_all, 0), 0),
    case
      when r.equipment_item_id is null or r.required_from is null then 'unknown'
      when greatest(coalesce(i.total_quantity, 0) - coalesce(p.peak_all, 0), 0) >= r.quantity then 'available'
      when greatest(coalesce(i.total_quantity, 0) - coalesce(p.peak_all, 0), 0) > 0 then 'partially_available'
      else 'unavailable'
    end,
    res.id,
    res.quantity,
    coalesce(res.needs_recheck, false),
    res.recheck_reason,
    reserver.full_name,
    res.decided_at
  from public.event_equipment_requirements r
  left join public.equipment_items i on i.id = r.equipment_item_id
  left join lateral public.equipment_commitment_peaks(r.equipment_item_id, r.required_from, r.required_until, r.id) p
    on r.equipment_item_id is not null and r.required_from is not null
  left join public.equipment_reservations res
    on res.requirement_id = r.id and res.status = 'approved'
  left join public.profiles reserver on reserver.id = res.decided_by
  where r.event_id = any (p_event_ids)
    and r.requested_at is not null
  order by r.event_id, r.required_from nulls last, r.equipment_name;
end;
$$;

revoke all on function public.check_event_equipment_availability(uuid[]) from public, anon;
grant execute on function public.check_event_equipment_availability(uuid[]) to authenticated;

-- 2. Unavailability -----------------------------------------------------------

drop function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz, uuid[]);
drop function public.end_equipment_unavailability(uuid);
drop function public.remove_equipment_unavailability(uuid);

drop policy "technical support staff view profiles tied to equipment unavailability" on public.profiles;
drop table public.equipment_unavailability_units;
drop table public.equipment_unavailability;

-- 3. Hand-set arrangement statuses --------------------------------------------

drop function public.update_equipment_arrangement(uuid, text, text);

-- 4. Readiness ----------------------------------------------------------------

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
  v_arrangement_status text;
  v_registration public.event_registration_requirements;
  v_venue_capacity integer;
  v_registration_ready boolean := true;
  v_safety_plan_ready boolean := true;
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

  -- SPM-28 AC02: a requirement's status is always worked out from what has
  -- actually happened to it — its reservation, or whether one could be made
  -- right now — mirroring automaticEquipmentArrangementStatus exactly.
  for r in
    select req.id, req.equipment_name, req.quantity, req.needs_review, req.needs_review_reason,
      (req.requested_at is not null) as requested,
      res.quantity as reservation_quantity,
      coalesce(res.needs_recheck, false) as reservation_needs_recheck,
      (res.id is not null) as has_reservation,
      exists (
        select 1 from public.equipment_reservations res2
        where res2.requirement_id = req.id and res2.status = 'approved' and res2.quantity >= req.quantity
      ) as reserved_in_full,
      (
        req.equipment_item_id is not null
        and req.required_from is not null
        and i.retired_at is null
        and greatest(coalesce(i.total_quantity, 0) - coalesce(p.peak_all, 0), 0) >= req.quantity
        and v_event.status in ('requested', 'planning', 'confirmed')
      ) as can_reserve_now
    from public.event_equipment_requirements req
    left join public.equipment_items i on i.id = req.equipment_item_id
    left join public.equipment_reservations res
      on res.requirement_id = req.id and res.status = 'approved'
    left join lateral public.equipment_commitment_peaks(req.equipment_item_id, req.required_from, req.required_until, req.id) p
      on req.equipment_item_id is not null and req.required_from is not null
    where req.event_id = p_event_id
    order by req.equipment_name
  loop
    v_requirement_count := v_requirement_count + 1;

    -- Not yet sent to Technical Support Staff: nothing can have been
    -- arranged, and it is the coordinator's to send (202610300007).
    if not r.requested then
      v_all_reserved := false;
      v_equipment := v_equipment || jsonb_build_object(
        'requirementId', r.id,
        'equipmentName', r.equipment_name,
        'quantity', r.quantity,
        'status', 'pending',
        'needsReviewReason', null
      );
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_not_requested',
        'message', r.equipment_name || ' has not been requested from Technical Support Staff.'
      );
      continue;
    end if;

    if r.has_reservation then
      if r.reservation_needs_recheck then
        v_arrangement_status := 'issue';
      elsif r.reservation_quantity >= r.quantity then
        v_arrangement_status := 'arranged';
      else
        v_arrangement_status := 'in_progress';
      end if;
    elsif r.can_reserve_now then
      v_arrangement_status := 'not_started';
    else
      v_arrangement_status := 'issue';
    end if;

    if v_arrangement_status = 'issue' or r.needs_review then
      v_item_status := 'needs_review';
      v_any_equipment_issue := true;
    elsif v_arrangement_status = 'arranged' then
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

    if v_arrangement_status = 'issue' then
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

  -- SPM-90: the coordinator's safety plan. Equipment placement only matters
  -- when the event has equipment.
  if not v_event.emergency_access_checked then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'emergency_access_not_checked',
      'message', case when 'emergency_access' = any (v_event.safety_check_flags)
        then 'The Safety Officer asked for the emergency access to be revised (Venue step, Safety checks).'
        else 'Check the venue''s emergency access (Venue step, Safety checks).' end
    );
  end if;
  if not v_event.restrictions_checked then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'restrictions_not_checked',
      'message', case when 'restrictions' = any (v_event.safety_check_flags)
        then 'The Safety Officer asked for the known restrictions to be revised (Venue step, Safety checks).'
        else 'Check the venue''s known restrictions (Venue step, Safety checks).' end
    );
  end if;
  if not v_event.crowd_movement_checked then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'crowd_movement_not_checked',
      'message', case when 'crowd_movement' = any (v_event.safety_check_flags)
        then 'The Safety Officer asked for the crowd movement to be revised (Venue step, Safety checks).'
        else 'Plan the crowd movement (Venue step, Safety checks).' end
    );
  end if;
  if v_requirement_count > 0 and 'equipment_placement' = any (v_event.safety_check_flags) then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'equipment_placement_flagged',
      'message', 'The Safety Officer asked for the equipment placement to be revised (Equipment step, Safety check).'
    );
  elsif v_requirement_count > 0
    and nullif(btrim(coalesce(v_event.equipment_placement_notes, '')), '') is null
  then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'equipment_placement_missing',
      'message', 'Add where the equipment will be placed (Equipment step, Safety check).'
    );
  end if;

  v_ready := v_venue_status = 'complete'
    and v_equipment_status in ('complete', 'not_required')
    and v_registration_ready
    and v_safety_plan_ready;

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
