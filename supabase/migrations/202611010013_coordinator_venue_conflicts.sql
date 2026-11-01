-- Coordinators can see what is wrong with a conflicted venue booking.
--
-- A conflict was recorded by Venue Staff's re-check, but the coordinator saw
-- only "Needs Review" with no reason, and "Mark resolved" could not clear it.
--
-- 1. event_readiness: of two overlapping bookings, only the later-requested
--    one (is_responsible) needs review; the one booked first stays and no
--    longer blocks its event. A booking that overlaps a venue block always
--    does. needsReviewReason now explains a conflict or disruption, and
--    canMarkResolved says whether "Mark resolved" applies (a change-request
--    or safety-check flag); a conflict clears through the re-check instead.
-- 2. event_venue_conflicts: the open conflicts on an event's bookings, with
--    the other booking's event and times or the block's reason and times,
--    for the coordinator's Venue step. Security definer because the other
--    booking belongs to another event the coordinator cannot read; limited
--    to the people who can read the conflicts themselves (202611010005).

create or replace function public.event_readiness(p_event_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- scheduling conflict it must move for is Needs Review (of two
  -- overlapping bookings the one booked first stays, 202611010013). Only an Approved, unflagged,
  -- undisrupted, unconflicted booking is Complete. Rejected, cancelled and
  -- expired bookings are not "active" and are left out of the checklist
  -- entirely (AC03 explicitly allows a cancelled non-main booking; an
  -- expired or missing main venue fails readiness via "no main venue"
  -- below, not by appearing here).
  for b in
    select vb.id, vb.is_main_venue, vb.status, vb.needs_review, vb.needs_review_reason,
      coalesce(v.name, 'Unknown venue') as venue_name,
      (
        select 'The venue is unavailable: "' || coalesce(vu.reason, 'Reason not recorded')
          || '". Choose a replacement venue on the Venue step.'
        from public.venue_booking_disruptions d
        join public.venue_unavailability vu on vu.id = d.block_id
        where d.booking_id = vb.id and d.cleared_at is null
        order by d.flagged_at
        limit 1
      ) as disruption_reason,
      -- Only the side that must move: the later-requested booking of two
      -- that overlap, or a booking that overlaps a venue block.
      (
        select case when c.conflicting_booking_id is not null
          then 'Clashes with "' || coalesce(oe.title, 'another event')
            || '", which was booked first, once the venue''s setup and turnaround time is applied. '
            || 'Move or cancel this booking on the Venue step.'
          else 'Overlaps the venue block "' || coalesce(vu.reason, 'Reason not recorded')
            || '" once the venue''s setup and turnaround time is applied. '
            || 'Move or cancel this booking on the Venue step.'
        end
        from public.venue_booking_conflicts c
        left join public.venue_bookings ob on ob.id = c.conflicting_booking_id
        left join public.events oe on oe.id = ob.event_id
        left join public.venue_unavailability vu on vu.id = c.conflicting_block_id
        where c.booking_id = vb.id and c.resolved_at is null and c.is_responsible
        order by c.flagged_at
        limit 1
      ) as conflict_reason
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
    elsif b.needs_review or b.disruption_reason is not null or b.conflict_reason is not null then
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
      'needsReviewReason', case when v_item_status = 'needs_review'
        then coalesce(case when b.needs_review then b.needs_review_reason end, b.conflict_reason, b.disruption_reason)
        else null end,
      -- Only a change-request or safety-check flag can be marked resolved;
      -- a conflict or disruption clears once the booking itself is fixed.
      'canMarkResolved', b.status = 'approved' and b.needs_review
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
$function$;


create or replace function public.event_venue_conflicts(p_event_id uuid)
returns table (
  booking_id uuid,
  must_move boolean,
  conflicting_event_title text,
  conflicting_starts_at timestamptz,
  conflicting_ends_at timestamptz,
  block_reason text,
  block_starts_at timestamptz,
  block_ends_at timestamptz,
  flagged_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.booking_id, c.is_responsible, oe.title, ob.starts_at, ob.ends_at,
    vu.reason, vu.starts_at, vu.ends_at, c.flagged_at
  from public.venue_booking_conflicts c
  join public.venue_bookings vb on vb.id = c.booking_id
  join public.events e on e.id = vb.event_id
  left join public.venue_bookings ob on ob.id = c.conflicting_booking_id
  left join public.events oe on oe.id = ob.event_id
  left join public.venue_unavailability vu on vu.id = c.conflicting_block_id
  where vb.event_id = p_event_id
    and c.resolved_at is null
    and (
      e.assigned_coordinator_id = auth.uid()
      or public.current_user_role() in ('event_coordinator_lead'::public.user_role, 'venue_staff'::public.user_role)
    )
  order by c.flagged_at;
$$;

revoke all on function public.event_venue_conflicts(uuid) from public, anon;
grant execute on function public.event_venue_conflicts(uuid) to authenticated, service_role;
