-- The coordinator can request an item again after Technical Support Staff
-- flag it as an Issue (e.g. "faulty").
--
-- Until now request_event_equipment (last 202610300008) sent only items not
-- yet requested, so an item staff had flagged could not be sent back to
-- them. Now a chosen item that is already requested is sent again when its
-- current arrangement is Issue, or its reservation is flagged for re-check:
--   * its arrangement is reset to Not started with the note "Requested again
--     by the coordinator", so it is back on the staff to-do list (earlier
--     entries stay in the history, SPM-28 AC03);
--   * its requested time and requester are updated;
--   * Technical Support Staff are notified along with any new items.
-- A chosen item that is requested and not flagged is left as it is.
-- Otherwise unchanged.

create or replace function public.request_event_equipment(
  p_event_id uuid,
  p_requirement_ids uuid[] default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.events;
  v_again_ids uuid[];
  v_new integer;
  v_again integer;
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

  if p_requirement_ids is not null then
    if cardinality(p_requirement_ids) = 0 then
      raise exception 'Choose the equipment to request' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(p_requirement_ids) chosen (id)
      where not exists (
        select 1 from public.event_equipment_requirements r
        where r.id = chosen.id and r.event_id = p_event_id
      )
    ) then
      raise exception 'Some of the chosen equipment is no longer part of this event' using errcode = '23514';
    end if;

    -- Chosen, already requested, and flagged by staff or for re-check.
    select coalesce(array_agg(r.id), array[]::uuid[]) into v_again_ids
    from public.event_equipment_requirements r
    where r.event_id = p_event_id
      and r.id = any (p_requirement_ids)
      and r.requested_at is not null
      and (
        (select u.status from public.equipment_arrangement_updates u
          where u.requirement_id = r.id order by u.id desc limit 1) = 'issue'
        or exists (
          select 1 from public.equipment_reservations res
          where res.requirement_id = r.id and res.status = 'approved' and res.needs_recheck
        )
      );
  else
    v_again_ids := array[]::uuid[];
  end if;

  perform set_config('app.requesting_equipment', 'on', true);

  update public.event_equipment_requirements
  set requested_at = now(), requested_by = auth.uid()
  where event_id = p_event_id
    and requested_at is null
    and (p_requirement_ids is null or id = any (p_requirement_ids));

  get diagnostics v_new = row_count;

  update public.event_equipment_requirements
  set requested_at = now(), requested_by = auth.uid()
  where id = any (v_again_ids);

  get diagnostics v_again = row_count;

  perform set_config('app.requesting_equipment', 'off', true);

  insert into public.equipment_arrangement_updates (requirement_id, event_id, status, note, updated_by)
  select id, p_event_id, 'not_started', 'Requested again by the coordinator', auth.uid()
  from unnest(v_again_ids) as again (id);

  v_count := v_new + v_again;

  if v_count > 0 then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      v_event.id,
      'equipment_requested'::public.notification_type,
      'Equipment requested',
      '"' || v_event.title || '" requested ' || v_count
        || case when v_count = 1 then ' equipment item' else ' equipment items' end
        || case when v_again > 0 then ' (' || v_again || ' again after an issue)' else '' end
        || '. Check and arrange them.'
    from public.profiles p
    where p.role = 'technical_support_staff'::public.user_role;
  end if;

  return v_count;
end;
$$;

revoke all on function public.request_event_equipment(uuid, uuid[]) from public, anon;
grant execute on function public.request_event_equipment(uuid, uuid[]) to authenticated;
