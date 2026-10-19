-- Fix: submitting for the Operational Safety Check always failed with
-- "Event not found or you do not have access to it", regardless of whether
-- the event was actually ready.
--
-- submit_event_for_safety_check (202610190004) resolves the real actor via
-- its own p_actor_id parameter — needed because apps/backend calls it
-- through the service-role client (so it can notify every safety-officer
-- profile, which has no insert policy for regular users), a session with
-- no JWT, so auth.uid() is null there. It then re-checked readiness via
-- public.event_readiness(p_event_id), which gates itself with
-- can_view_event(p_event_id) — reading auth.uid() directly rather than the
-- actor already resolved by the caller. With auth.uid() null, that check
-- always failed, so every backend-originated submission raised this
-- exception no matter how ready the event was.
--
-- Gives can_view_event an additive actor-aware overload (the existing
-- single-argument version is untouched — every RLS policy and other
-- function keeps calling that one unchanged) and event_readiness an
-- optional actor parameter, same pattern cancel_event_request already uses,
-- then has submit_event_for_safety_check pass its resolved actor through.

create or replace function public.can_view_event(target_event_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = p_actor_id
        or e.assigned_coordinator_id = p_actor_id
        or exists (
          select 1 from public.profiles p
          where p.id = p_actor_id
            and p.role in (
              'event_coordinator'::public.user_role,
              'venue_staff'::public.user_role,
              'technical_support_staff'::public.user_role,
              'event_coordinator_lead'::public.user_role
            )
        )
      )
  );
$function$;

revoke all on function public.can_view_event(uuid, uuid) from public, anon;
grant execute on function public.can_view_event(uuid, uuid) to authenticated, service_role;

-- No other object depends on the old single-argument event_readiness(uuid)
-- besides submit_event_for_safety_check, updated below in this same
-- migration to call the new form — safe to drop and recreate.
drop function if exists public.event_readiness(uuid);

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

revoke all on function public.event_readiness(uuid, uuid) from public, anon;
grant execute on function public.event_readiness(uuid, uuid) to authenticated, service_role;

-- Pass the already-resolved actor through to event_readiness instead of
-- relying on its old auth.uid()-only check — the actual fix.
create or replace function public.submit_event_for_safety_check(
  p_event_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  event_row public.events;
  v_readiness jsonb;
  v_round integer;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit this event for the safety check on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit for the safety check'
      using errcode = 'insufficient_privilege';
  end if;

  -- The row lock makes a concurrent double submission safe: the second
  -- transaction waits, then finds the status is no longer 'planning'.
  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can submit this event for the safety check'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can be submitted for the safety check'
      using errcode = 'check_violation';
  end if;

  v_readiness := public.event_readiness(p_event_id, actor_id);

  -- AC05: blocked with the outstanding items listed when not Ready.
  if not (v_readiness ->> 'ready')::boolean then
    raise exception 'This event is not ready for the safety check'
      using errcode = 'check_violation', detail = (v_readiness -> 'outstandingItems')::text;
  end if;

  select coalesce(max(round), 0) + 1 into v_round
  from public.event_safety_check_submissions
  where event_id = p_event_id;

  insert into public.event_safety_check_submissions (
    event_id, coordinator_id, round, venues_snapshot, period_snapshot,
    attendance_snapshot, equipment_snapshot
  ) values (
    p_event_id,
    actor_id,
    v_round,
    coalesce(v_readiness -> 'venues', '[]'::jsonb),
    jsonb_build_object('startsAt', event_row.starts_at, 'endsAt', event_row.ends_at),
    event_row.expected_attendance,
    coalesce(v_readiness -> 'equipment', '[]'::jsonb)
  );

  -- AC05. The status change fires enforce_event_status_transition and
  -- record_event_status_change, so the transition is validated and
  -- historised without this function writing to event_status_history itself.
  update public.events
  set status = 'pending_safety_check'
  where id = p_event_id;

  -- record_event_status_change stamps changed_by from auth.uid(), which is
  -- null when the backend calls this as the service role (same backfill as
  -- submit_event_request).
  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = 'pending_safety_check'
    and changed_by is null;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    p.id,
    p_event_id,
    'safety_check_requested'::public.notification_type,
    'Safety check requested',
    '"' || event_row.title || '" is ready for the Operational Safety Check (round ' || v_round || ').'
  from public.profiles p
  where p.role = 'safety_officer'::public.user_role;

  return jsonb_build_object('eventId', p_event_id, 'status', 'pending_safety_check', 'round', v_round);
end;
$$;

revoke all on function public.submit_event_for_safety_check(uuid, uuid) from public, anon;
grant execute on function public.submit_event_for_safety_check(uuid, uuid) to authenticated, service_role;
