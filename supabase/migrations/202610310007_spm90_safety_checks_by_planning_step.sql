-- SPM-90: the safety plan splits across the Planning steps.
--
-- The coordinator now works through the safety plan where it belongs:
--   * on the Venue step, three checks, each ticked when done with optional
--     details: emergency access, known restrictions, crowd movement
--     (events.*_checked, with the existing *_notes / crowd_movement_plan
--     columns as the details);
--   * on the Equipment step, equipment placement as open text.
-- event_readiness requires the three ticks (details optional) and, when the
-- event has equipment, the placement text. set_event_safety_plan (one save
-- for all four, 202610310006) is replaced by one function per step.
-- Details already recorded count as checked.

alter table public.events
  add column emergency_access_checked boolean not null default false,
  add column restrictions_checked boolean not null default false,
  add column crowd_movement_checked boolean not null default false;

update public.events
set emergency_access_checked = emergency_access_notes is not null,
    restrictions_checked = restrictions_notes is not null,
    crowd_movement_checked = crowd_movement_plan is not null
where emergency_access_notes is not null
   or restrictions_notes is not null
   or crowd_movement_plan is not null;

drop function public.set_event_safety_plan(uuid, text, text, text, text);

-- The Venue step's three checks.
create function public.set_event_venue_safety_checks(
  p_event_id uuid,
  p_emergency_access_checked boolean,
  p_emergency_access text,
  p_restrictions_checked boolean,
  p_restrictions text,
  p_crowd_movement_checked boolean,
  p_crowd_movement_plan text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_emergency text := nullif(btrim(coalesce(p_emergency_access, '')), '');
  v_restrictions text := nullif(btrim(coalesce(p_restrictions, '')), '');
  v_crowd text := nullif(btrim(coalesce(p_crowd_movement_plan, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Only the event''s assigned coordinator can update its safety checks' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the event''s assigned coordinator can update its safety checks' using errcode = '42501';
  end if;

  if v_event.status <> 'planning' then
    raise exception 'Safety checks can only be changed while the event is in Planning' using errcode = '23514';
  end if;

  if char_length(v_emergency) > 2000 then
    raise exception 'Emergency access must contain at most 2,000 characters' using errcode = '23514';
  end if;
  if char_length(v_restrictions) > 2000 then
    raise exception 'Known restrictions must contain at most 2,000 characters' using errcode = '23514';
  end if;
  if char_length(v_crowd) > 2000 then
    raise exception 'Crowd movement plan must contain at most 2,000 characters' using errcode = '23514';
  end if;

  update public.events
  set emergency_access_checked = coalesce(p_emergency_access_checked, false),
      emergency_access_notes = v_emergency,
      restrictions_checked = coalesce(p_restrictions_checked, false),
      restrictions_notes = v_restrictions,
      crowd_movement_checked = coalesce(p_crowd_movement_checked, false),
      crowd_movement_plan = v_crowd
  where id = p_event_id;
end;
$$;

revoke all on function public.set_event_venue_safety_checks(uuid, boolean, text, boolean, text, boolean, text) from public, anon;
grant execute on function public.set_event_venue_safety_checks(uuid, boolean, text, boolean, text, boolean, text) to authenticated;

-- The Equipment step's placement.
create function public.set_event_equipment_placement(p_event_id uuid, p_equipment_placement text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_placement text := nullif(btrim(coalesce(p_equipment_placement, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Only the event''s assigned coordinator can update its safety checks' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the event''s assigned coordinator can update its safety checks' using errcode = '42501';
  end if;

  if v_event.status <> 'planning' then
    raise exception 'Safety checks can only be changed while the event is in Planning' using errcode = '23514';
  end if;

  if char_length(v_placement) > 2000 then
    raise exception 'Equipment placement must contain at most 2,000 characters' using errcode = '23514';
  end if;

  update public.events set equipment_placement_notes = v_placement where id = p_event_id;
end;
$$;

revoke all on function public.set_event_equipment_placement(uuid, text) from public, anon;
grant execute on function public.set_event_equipment_placement(uuid, text) to authenticated;

-- Review details (last 202610310006): also whether each venue check was
-- ticked. Otherwise unchanged.
create or replace function public.safety_check_review_details(
  p_event_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_requirements public.event_venue_requirements;
  v_venues jsonb;
  v_equipment jsonb;
begin
  if not public.can_view_event(p_event_id, coalesce(p_actor_id, auth.uid())) then
    raise exception 'Event not found or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_event from public.events where id = p_event_id;
  select * into v_requirements from public.event_venue_requirements where event_id = p_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bookingId', vb.id,
      'venueName', v.name,
      'location', v.location,
      'label', vb.label,
      'isMainVenue', vb.is_main_venue,
      'capacity', v.capacity,
      'headcount', coalesce(vb.expected_headcount, v_event.expected_attendance),
      'underCapacity',
        coalesce(vb.expected_headcount, v_event.expected_attendance) is not null
        and coalesce(vb.expected_headcount, v_event.expected_attendance) > v.capacity,
      'layouts', (
        select coalesce(jsonb_agg(l.layout_name order by l.layout_name), '[]'::jsonb)
        from public.venue_layouts l where l.venue_id = v.id
      ),
      'requestedLayoutNotes', vb.layout_notes,
      'requestedAccessibilityNotes', vb.accessibility_notes,
      'venueAccessibilityNotes', v.accessibility_notes,
      'venueDescription', v.description
    )
    order by vb.is_main_venue desc, vb.requested_at
  ), '[]'::jsonb)
  into v_venues
  from public.venue_bookings vb
  join public.venues v on v.id = vb.venue_id
  where vb.event_id = p_event_id
    and vb.status in ('pending', 'approved', 'on_hold');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'requirementId', r.id,
      'equipmentName', r.equipment_name,
      'quantity', r.quantity,
      'notes', r.notes
    )
    order by r.equipment_name
  ), '[]'::jsonb)
  into v_equipment
  from public.event_equipment_requirements r
  where r.event_id = p_event_id;

  return jsonb_build_object(
    'expectedAttendance', v_event.expected_attendance,
    'accessibilityNeeds', v_requirements.accessibility_notes,
    'layoutPreference', v_requirements.layout_notes,
    'venues', v_venues,
    'equipment', v_equipment,
    'crowdMovementPlan', v_event.crowd_movement_plan,
    'equipmentPlacement', v_event.equipment_placement_notes,
    'emergencyAccess', v_event.emergency_access_notes,
    'restrictions', v_event.restrictions_notes,
    'emergencyAccessChecked', v_event.emergency_access_checked,
    'restrictionsChecked', v_event.restrictions_checked,
    'crowdMovementChecked', v_event.crowd_movement_checked
  );
end;
$$;

revoke all on function public.safety_check_review_details(uuid, uuid) from public, anon;
grant execute on function public.safety_check_review_details(uuid, uuid) to authenticated, service_role;



-- Readiness (last 202610310006): the three venue checks must be ticked;
-- details are optional. Equipment placement is unchanged. Otherwise unchanged.
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

  -- AC01/AC02/AC03 (SPM-28, 202610260001): a requirement's status is the
  -- latest hand-set arrangement update when one exists (a staff override
  -- always wins). Otherwise it is auto-derived from what has actually
  -- happened to it — its reservation, or whether one could be made right
  -- now — mirroring automaticEquipmentArrangementStatus exactly.
  for r in
    select req.id, req.equipment_name, req.quantity, req.needs_review, req.needs_review_reason,
      (req.requested_at is not null) as requested,
      (select u.status from public.equipment_arrangement_updates u
        where u.requirement_id = req.id order by u.id desc limit 1) as manual_status,
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

    if r.manual_status is not null then
      v_arrangement_status := r.manual_status;
    elsif r.has_reservation then
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
      'message', 'Check the venue''s emergency access (Venue step, Safety checks).'
    );
  end if;
  if not v_event.restrictions_checked then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'restrictions_not_checked',
      'message', 'Check the venue''s known restrictions (Venue step, Safety checks).'
    );
  end if;
  if not v_event.crowd_movement_checked then
    v_safety_plan_ready := false;
    v_outstanding := v_outstanding || jsonb_build_object(
      'code', 'crowd_movement_not_checked',
      'message', 'Plan the crowd movement (Venue step, Safety checks).'
    );
  end if;
  if v_requirement_count > 0
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
