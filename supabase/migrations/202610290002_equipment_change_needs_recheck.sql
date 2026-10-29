-- A change to an equipment request goes back to Technical Support Staff to
-- verify again.
--
-- Until now a change to the item, quantity or period flagged the request's
-- reservation for re-check (flag_reservations_on_requirement_change,
-- 202610061002), but an arrangement status staff had set by hand (e.g.
-- Arranged) still showed, and a change to the technical requirements alone
-- flagged nothing.
--
-- Now, when the item, quantity, period or technical requirements of a request
-- change, and staff had already worked on it (an arrangement update or an
-- approved reservation exists):
--   * its arrangement status is reset to Issue with a note saying why, so it
--     shows on the staff worklist until they set it again;
--   * its reservation is flagged for re-check, technical requirements included.
-- Nothing is cancelled or released. The reset is written by this trigger, not
-- by the coordinator: update_equipment_arrangement stays Technical Support
-- Staff only (SPM-28 AC06).

create or replace function public.flag_reservations_on_requirement_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_reason text;
begin
  select array_agg(id) into v_ids
  from public.equipment_reservations
  where requirement_id = old.id and status = 'approved';

  if v_ids is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_reason := 'The equipment request was removed';
  elsif new.equipment_item_id is distinct from old.equipment_item_id then
    v_reason := 'The requested equipment changed';
  elsif new.quantity is distinct from old.quantity then
    v_reason := format('The requested quantity changed from %s to %s', old.quantity, new.quantity);
  elsif new.required_from is distinct from old.required_from or new.required_until is distinct from old.required_until then
    v_reason := 'The required period changed';
  elsif new.notes is distinct from old.notes then
    v_reason := 'The technical requirements changed';
  else
    return new;
  end if;

  perform public.flag_equipment_reservations(v_ids, v_reason);
  return coalesce(new, old);
end;
$$;

-- The update trigger only fired for the item, quantity and period columns;
-- it now fires for the technical requirements too.
drop trigger event_equipment_requirements_flag_reservations_on_update on public.event_equipment_requirements;
create trigger event_equipment_requirements_flag_reservations_on_update
after update of equipment_item_id, quantity, required_from, required_until, notes on public.event_equipment_requirements
for each row execute function public.flag_reservations_on_requirement_change();

create or replace function public.reset_arrangement_on_requirement_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.equipment_item_id is not distinct from old.equipment_item_id
    and new.quantity is not distinct from old.quantity
    and new.required_from is not distinct from old.required_from
    and new.required_until is not distinct from old.required_until
    and new.notes is not distinct from old.notes
  then
    return new;
  end if;

  -- Nothing to verify again if staff had not started on it.
  if not exists (select 1 from public.equipment_arrangement_updates where requirement_id = new.id)
    and not exists (
      select 1 from public.equipment_reservations
      where requirement_id = new.id and status = 'approved'
    )
  then
    return new;
  end if;

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  values (new.id, new.event_id, 'issue', 'The coordinator changed this request. Re-check it.', auth.uid());

  return new;
end;
$$;

revoke all on function public.reset_arrangement_on_requirement_change() from public, anon, authenticated;

create trigger event_equipment_requirements_reset_arrangement_on_update
after update on public.event_equipment_requirements
for each row execute function public.reset_arrangement_on_requirement_change();
