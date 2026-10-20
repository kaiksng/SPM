-- Fix: AC02 names "any active hold" and a "Conflict - Needs Review" booking
-- as both counting as Needs Review, but event_readiness (202610190001)
-- labelled an active tentative hold as Pending, and never looked at
-- venue_booking_conflicts (202610090004) at all, so a booking with an
-- active scheduling conflict never surfaced as Needs Review in the Safety
-- Check readiness view.
--
-- AC02 (revised): an active (tentative) hold is Needs Review, not Pending.
-- An Approved booking with an active, unresolved venue_booking_conflicts
-- row is also Needs Review, same as a flagged or disrupted booking.
--
-- Based on 202610200009 (which added the quantity/needsReviewReason fields
-- and the Safety-Officer-flagged-equipment check), not 202610200007 — only
-- the venue loop's hold/conflict handling changes here.
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

revoke all on function public.event_readiness(uuid, uuid) from public, anon;
grant execute on function public.event_readiness(uuid, uuid) to authenticated, service_role;
