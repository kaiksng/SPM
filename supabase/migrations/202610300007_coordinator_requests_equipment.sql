-- The coordinator requests an event's equipment from Technical Support Staff.
--
-- Until now every equipment requirement on a Planning event appeared on the
-- Technical Support Staff Equipment page straight away, including the
-- organiser's list before the coordinator had checked it. Venues already
-- work the other way: the coordinator sends a booking request when ready.
--
-- Now:
--   * A requirement starts unrequested. The organiser's list and anything
--     the coordinator adds stay with the coordinator, who can still change
--     them freely.
--   * request_event_equipment (assigned coordinator, Planning only) sends
--     every unrequested requirement of the event at once and notifies
--     Technical Support Staff (equipment_requested, 202610300006).
--   * Technical Support Staff see, check, reserve and arrange only requested
--     requirements: check_event_equipment_availability lists only those, and
--     lock_requirement_for_reservation (reserve / change) and
--     update_equipment_arrangement refuse the rest.
--   * event_readiness lists an unrequested requirement as outstanding, so the
--     event cannot go to the safety check with equipment nobody was asked for.
--   * A requirement an approved change request adds to a Confirmed or
--     Pending Safety Check event counts as requested at once: applying the
--     change was the coordinator's decision, and apply_event_change_request
--     already notifies Technical Support Staff about it (SPM-39 AC02).
--   * A change to a requirement already requested still goes back to
--     Technical Support Staff to re-check (202610290002); it stays requested.
--
-- Requirements on events already in Planning, Pending Safety Check or
-- Confirmed are marked requested, so work Technical Support Staff have
-- started stays on their page.

alter table public.event_equipment_requirements
  add column requested_at timestamptz,
  add column requested_by uuid references public.profiles (id);

comment on column public.event_equipment_requirements.requested_at is
  'When the coordinator sent this requirement to Technical Support Staff; null while it is still with the coordinator.';

-- Before the guard trigger below exists, so the backfill is not reverted.
update public.event_equipment_requirements r
set requested_at = now()
from public.events e
where e.id = r.event_id
  and e.status in ('planning', 'pending_safety_check', 'confirmed');

-- requested_at and requested_by are set only by request_event_equipment.
-- Organisers write this table directly under RLS, and the coordinator's and
-- change request's saves go through save_event_equipment_requirements, so
-- the columns are guarded here rather than in each write path.
create or replace function public.guard_equipment_request_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('app.requesting_equipment', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.events
      where id = new.event_id and status in ('confirmed', 'pending_safety_check')
    ) then
      new.requested_at := now();
      new.requested_by := auth.uid();
    else
      new.requested_at := null;
      new.requested_by := null;
    end if;
  else
    new.requested_at := old.requested_at;
    new.requested_by := old.requested_by;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_equipment_request_fields() from public, anon, authenticated;

create trigger event_equipment_requirements_guard_request_fields
before insert or update on public.event_equipment_requirements
for each row execute function public.guard_equipment_request_fields();

-- Sends every unrequested requirement of the event to Technical Support
-- Staff. Returns how many were sent; 0 (and no notification) when there was
-- nothing left to send, so a repeated click does nothing.
create or replace function public.request_event_equipment(p_event_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Only the event''s assigned coordinator can request its equipment' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the event''s assigned coordinator can request its equipment' using errcode = '42501';
  end if;

  if v_event.status <> 'planning' then
    raise exception 'Equipment can only be requested while the event is in Planning' using errcode = '23514';
  end if;

  perform set_config('app.requesting_equipment', 'on', true);

  update public.event_equipment_requirements
  set requested_at = now(), requested_by = auth.uid()
  where event_id = p_event_id and requested_at is null;

  get diagnostics v_count = row_count;

  perform set_config('app.requesting_equipment', 'off', true);

  if v_count > 0 then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      v_event.id,
      'equipment_requested'::public.notification_type,
      'Equipment requested',
      '"' || v_event.title || '" requested ' || v_count
        || case when v_count = 1 then ' equipment item' else ' equipment items' end
        || '. Check and arrange them.'
    from public.profiles p
    where p.role = 'technical_support_staff'::public.user_role;
  end if;

  return v_count;
end;
$$;

revoke all on function public.request_event_equipment(uuid) from public, anon;
grant execute on function public.request_event_equipment(uuid) to authenticated;

-- SPM-31 check (last 202610061002): only requested requirements. Otherwise
-- unchanged.
create or replace function public.check_event_equipment_availability(p_event_ids uuid[])
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
  unavailable_quantity integer,
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
    coalesce(p.peak_unavailable, 0),
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

-- Reserve / change (last 202610290001): refuses an unrequested requirement.
-- Otherwise unchanged.
create or replace function public.lock_requirement_for_reservation(
  p_requirement_id uuid,
  out requirement public.event_equipment_requirements,
  out available integer
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_status public.event_status;
  v_total integer;
  v_retired timestamptz;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can reserve equipment' using errcode = '42501';
  end if;

  select * into requirement from public.event_equipment_requirements where id = p_requirement_id;
  if not found then
    raise exception 'This equipment request no longer exists' using errcode = '23514';
  end if;
  if requirement.requested_at is null then
    raise exception 'The coordinator has not requested this equipment yet' using errcode = '23514';
  end if;
  if requirement.equipment_item_id is null or requirement.required_from is null then
    raise exception 'This equipment is not in the catalogue, so it cannot be reserved' using errcode = '23514';
  end if;

  select status into v_event_status from public.events where id = requirement.event_id;
  if v_event_status not in ('planning', 'confirmed') then
    raise exception 'Equipment can only be reserved for a Planning or Confirmed event'
      using errcode = '23514';
  end if;

  -- Serialises reservations of one item, so two staff cannot both take the
  -- last units (AC3).
  select total_quantity, retired_at into v_total, v_retired
  from public.equipment_items where id = requirement.equipment_item_id for update;
  if v_retired is not null then
    raise exception 'This equipment has been retired and cannot be reserved' using errcode = '23514';
  end if;

  select greatest(v_total - p.peak_all, 0) into available
  from public.equipment_commitment_peaks(
    requirement.equipment_item_id, requirement.required_from, requirement.required_until, requirement.id
  ) p;
end;
$$;

revoke all on function public.lock_requirement_for_reservation(uuid) from public, anon, authenticated;

-- SPM-28 (last 202610290004): refuses an unrequested requirement. Otherwise
-- unchanged.
create or replace function public.update_equipment_arrangement(
  p_requirement_id uuid,
  p_status text,
  p_note text default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_requirement public.event_equipment_requirements;
  v_event_status public.event_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_current_status text := 'not_started';
  v_current_note text;
  v_id bigint;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can update equipment arrangements' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('not_started', 'in_progress', 'arranged', 'issue') then
    raise exception 'Choose an arrangement status' using errcode = '23514';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Note must contain at most 1000 characters' using errcode = '23514';
  end if;

  -- Locked so two staff saving at once are compared against each other's
  -- result rather than the same stale one.
  select * into v_requirement
  from public.event_equipment_requirements where id = p_requirement_id for update;
  if not found then
    raise exception 'This equipment request no longer exists' using errcode = '23514';
  end if;
  if v_requirement.requested_at is null then
    raise exception 'The coordinator has not requested this equipment yet' using errcode = '23514';
  end if;

  select status into v_event_status from public.events where id = v_requirement.event_id;
  if v_event_status not in ('planning', 'confirmed') then
    raise exception 'Arrangements can only be updated for a Planning or Confirmed event'
      using errcode = '23514';
  end if;

  select status, note into v_current_status, v_current_note
  from public.equipment_arrangement_updates
  where requirement_id = p_requirement_id
  order by id desc
  limit 1;

  if coalesce(v_current_status, 'not_started') = p_status and v_current_note is not distinct from v_note then
    return null;
  end if;

  if p_status = 'arranged'
    and v_requirement.equipment_item_id is not null
    and not exists (
      select 1 from public.equipment_reservations
      where requirement_id = p_requirement_id
        and status = 'approved'
        and not needs_recheck
        and quantity >= v_requirement.quantity
    )
  then
    raise exception 'Reserve the full quantity before marking this equipment Arranged'
      using errcode = '23514';
  end if;

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  values (p_requirement_id, v_requirement.event_id, p_status, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.update_equipment_arrangement(uuid, text, text) from public, anon;
grant execute on function public.update_equipment_arrangement(uuid, text, text) to authenticated;

-- Readiness (last 202610260002): a requirement not yet requested is Pending
-- and outstanding ("not requested"), ahead of any arrangement status.
-- Everything else is unchanged.
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
