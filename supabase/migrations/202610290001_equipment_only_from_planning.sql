-- Technical Support Staff work on an event's equipment only once the event is
-- in Planning. Until then it is still a request the coordinator may reject,
-- so there is nothing to arrange or reserve yet.
--
-- update_equipment_arrangement (SPM-28, last 202610190005) and
-- lock_requirement_for_reservation (SPM-32's reserve_equipment and
-- change_equipment_reservation, 202610061002) allowed Requested events; both
-- now allow only Planning and Confirmed. Pending Safety Check stays frozen,
-- as before. Bodies are otherwise unchanged.
--
-- Arrangement updates and reservations already recorded on events that have
-- not reached Planning were made before this rule and are deleted (their
-- reservation history cascades). The reserved units return to the pool.

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

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  values (p_requirement_id, v_requirement.event_id, p_status, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.update_equipment_arrangement(uuid, text, text) from public, anon;
grant execute on function public.update_equipment_arrangement(uuid, text, text) to authenticated;

-- Validates and locks a requirement for reserving; returns how many of its
-- item are free over its period (excluding its own reservation).
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

-- Work recorded on events that have not reached Planning yet.
delete from public.equipment_arrangement_updates u
using public.events e
where e.id = u.event_id
  and e.status in ('draft', 'requested', 'clarification_requested');

delete from public.equipment_reservations r
using public.events e
where e.id = r.event_id
  and e.status in ('draft', 'requested', 'clarification_requested');
