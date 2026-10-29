-- An equipment item can only be Arranged when its stock is actually held:
-- its full requested quantity reserved, with no re-check outstanding.
-- Otherwise "Arranged" says the event has equipment nobody has set aside,
-- and the same units could be booked for another event.
--
-- update_equipment_arrangement (last 202610290001) now refuses Arranged for
-- a catalogue item that is not reserved in full. Equipment outside the
-- catalogue cannot be reserved at all, so it can still be marked Arranged by
-- hand. Every other status, and the rest of the function, is unchanged.
--
-- Items already marked Arranged by hand without their stock held are set
-- back — to In progress if part is reserved, else Not started — so they show
-- up as work still to do. Earlier entries stay in the history (SPM-28 AC03).

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

-- Set back items already marked Arranged with their stock not held.
insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
select
  r.id,
  r.event_id,
  case when held.quantity is not null then 'in_progress' else 'not_started' end,
  'Set back: Arranged needs the full quantity reserved',
  null
from public.event_equipment_requirements r
join public.events e on e.id = r.event_id
left join lateral (
  select quantity from public.equipment_reservations
  where requirement_id = r.id and status = 'approved'
  order by quantity desc limit 1
) held on true
where r.equipment_item_id is not null
  and e.status in ('planning', 'confirmed')
  and (
    select u.status from public.equipment_arrangement_updates u
    where u.requirement_id = r.id order by u.id desc limit 1
  ) = 'arranged'
  and not exists (
    select 1 from public.equipment_reservations res
    where res.requirement_id = r.id and res.status = 'approved'
      and not res.needs_recheck and res.quantity >= r.quantity
  );
