-- SPM: while an event is Pending Safety Check, the coordinator's technical
-- arrangements are frozen for the review (AC06). update_equipment_arrangement
-- (202610150001) explicitly allowed edits during Pending Safety Check before
-- that AC existed; this drops it from the allowed-status list so nobody —
-- not even Technical Support Staff — can change an arrangement mid-review. A
-- disruption or rejection during review returns the event to Planning first
-- (already handled elsewhere), which reopens this path.
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
  if v_event_status not in ('requested', 'planning', 'confirmed') then
    raise exception 'Arrangements can only be updated for a Requested, Planning or Confirmed event'
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
