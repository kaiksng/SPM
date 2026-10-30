-- The coordinator chooses which of the event's equipment to request, rather
-- than sending every unrequested item at once (202610300007).
--
-- request_event_equipment gains p_requirement_ids: the items to send. Items
-- already requested are left as they are; an empty choice is refused, and so
-- is an item that is not part of the event. Omitting the list still sends
-- every unrequested item. Otherwise unchanged.

drop function public.request_event_equipment(uuid);

create function public.request_event_equipment(
  p_event_id uuid,
  p_requirement_ids uuid[] default null
)
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
  end if;

  perform set_config('app.requesting_equipment', 'on', true);

  update public.event_equipment_requirements
  set requested_at = now(), requested_by = auth.uid()
  where event_id = p_event_id
    and requested_at is null
    and (p_requirement_ids is null or id = any (p_requirement_ids));

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

revoke all on function public.request_event_equipment(uuid, uuid[]) from public, anon;
grant execute on function public.request_event_equipment(uuid, uuid[]) to authenticated;
