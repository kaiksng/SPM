-- SPM: Event readiness for the Operational Safety Check.
--
-- "As an Event Coordinator, I want to see whether my event is ready and
-- submit it for the Operational Safety Check, so that ready events are
-- reviewed for safety before preparation."
--
-- AC01 Every venue booking and equipment requirement shows Complete, Pending,
--      Not Required, or Needs Review.
-- AC02 A Disrupted or Conflict - Needs Review booking, an active hold, and an
--      Issue equipment requirement all count as Needs Review.
-- AC03 Ready only when the main venue booking is Approved and unflagged,
--      every other venue booking is Approved and unflagged (or cancelled),
--      and all required equipment is reserved.
-- AC04 Readiness is derived from records, never a stored flag.
-- AC07 Tentative and expired holds never count as a completed arrangement.
--
-- One function, callable directly from the frontend via supabase.rpc under
-- RLS (read-only, gated by can_view_event, same shape as
-- check_venue_booking_availability), and reused unchanged as the gate inside
-- submit_event_for_safety_check.
create or replace function public.event_readiness(p_event_id uuid)
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
begin
  if not public.can_view_event(p_event_id) then
    raise exception 'Event not found or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_event from public.events where id = p_event_id;

  -- AC02/AC03/AC07: a hold (tentative) and a pending request are both
  -- Pending; an approved booking that is flagged or disrupted is Needs
  -- Review; only an approved, unflagged, undisrupted booking is Complete.
  -- Rejected, cancelled and expired bookings are not "active" and are left
  -- out of the checklist entirely (AC03 explicitly allows a cancelled
  -- non-main booking; an expired or missing main venue fails readiness via
  -- "no main venue" below, not by appearing here).
  for b in
    select vb.id, vb.is_main_venue, vb.status, vb.needs_review,
      coalesce(v.name, 'Unknown venue') as venue_name,
      exists (
        select 1 from public.venue_booking_disruptions d
        where d.booking_id = vb.id and d.cleared_at is null
      ) as disrupted
    from public.venue_bookings vb
    left join public.venues v on v.id = vb.venue_id
    where vb.event_id = p_event_id
      and vb.status in ('pending', 'approved', 'on_hold')
    order by vb.is_main_venue desc, vb.requested_at
  loop
    if b.status <> 'approved' then
      v_item_status := 'pending';
    elsif b.needs_review or b.disrupted then
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
      'status', v_item_status
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
    select req.id, req.equipment_name, req.quantity,
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

    if r.arrangement_status = 'issue' then
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
      'status', v_item_status
    );

    if r.arrangement_status = 'issue' then
      v_outstanding := v_outstanding || jsonb_build_object(
        'code', 'equipment_needs_review',
        'message', r.equipment_name || ' is flagged Issue and needs review.'
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

  v_ready := v_venue_status = 'complete' and v_equipment_status in ('complete', 'not_required');

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

revoke all on function public.event_readiness(uuid) from public, anon;
grant execute on function public.event_readiness(uuid) to authenticated, service_role;
