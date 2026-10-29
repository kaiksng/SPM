-- When Technical Support Staff reserve, change, re-check or release an
-- event's equipment, that action also records the item's arrangement status
-- (SPM-28), so the status follows the reservation instead of a label set by
-- hand earlier going stale:
--   reserved in full           -> Arranged
--   reserved in part           -> In progress
--   released                   -> Not started (back on the to-do list)
-- Each is an ordinary arrangement update: it shows in the item's history with
-- who did it and when (AC03), and staff can still set any status by hand
-- afterwards (AC04/AC05) — until their next reservation action.
--
-- Only Technical Support Staff's own actions are recorded: a reservation
-- flagged by a coordinator's change is handled by 202610290002, and releases
-- the system makes when an event ends are not arrangement work. Nothing is
-- recorded while the event is not in Planning or Confirmed (Pending Safety
-- Check freezes arrangements; ended events are locked).

create or replace function public.record_arrangement_after_reservation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_status public.event_status;
  v_requested integer;
  v_status text;
  v_note text;
begin
  if public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
    or new.requirement_id is null
  then
    return new;
  end if;

  select status into v_event_status from public.events where id = new.event_id;
  if v_event_status is null or v_event_status not in ('planning', 'confirmed') then
    return new;
  end if;

  select quantity into v_requested from public.event_equipment_requirements where id = new.requirement_id;
  if v_requested is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'cancelled' then
    v_status := 'not_started';
    v_note := 'Reservation released';
  elsif new.status = 'approved' and (
    tg_op = 'INSERT'
    or new.quantity is distinct from old.quantity
    or (old.needs_recheck and not new.needs_recheck)
  ) then
    v_status := case when new.quantity >= v_requested then 'arranged' else 'in_progress' end;
    v_note := case
      when tg_op = 'UPDATE' and old.needs_recheck and new.quantity = old.quantity
        then format('Re-checked: %s of %s reserved', new.quantity, v_requested)
      else format('Reserved %s of %s', new.quantity, v_requested)
    end;
  else
    return new;
  end if;

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  values (new.requirement_id, new.event_id, v_status, v_note, auth.uid());

  return new;
end;
$$;

revoke all on function public.record_arrangement_after_reservation() from public, anon, authenticated;

create trigger equipment_reservations_record_arrangement
after insert or update on public.equipment_reservations
for each row execute function public.record_arrangement_after_reservation();
