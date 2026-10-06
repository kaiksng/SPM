-- SPM-31: Check equipment availability for an event's date and time.
--
-- "As a Technical Support Staff member, I want to check equipment
-- availability for an event's date and time, so that I can determine whether
-- the requested quantity can be provided."
--
-- Scenario: given the required suitable quantity is unavailable, when the
-- check is completed, then the shortage is shown before reservation is
-- attempted.
--
-- AC01 Availability is calculated for each requested equipment type,
--      required characteristics, quantity, and period. (One result per
--      event_equipment_requirements row, over its required_from/until
--      window. Required characteristics are free text — returned so staff
--      can judge suitability; they are not matched.)
-- AC02 Confirmed (approved) overlapping reservations reduce the available
--      quantity.
-- AC03 Quantities recorded as unavailable under SPM-30 for an overlapping
--      period are not counted as freely available (this is also SPM-30 AC04).
-- AC04 The result is Available, Partially Available or Unavailable, with the
--      available quantity.
-- AC05 Unknown equipment types (legacy free-text rows with no catalogue item)
--      are identified, never treated as available.
--
-- Commitments are counted at their busiest moment within the window, not
-- summed across it: two 2-unit outages on different days of a 3-day window
-- leave (total - 2) available, not (total - 4).

create function public.check_event_equipment_availability(p_event_ids uuid[])
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
  status text
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
  with commitments as (
    select
      er.equipment_item_id as item_id,
      'reserved'::text as kind,
      er.quantity as qty,
      er.starts_at as starts,
      er.ends_at as ends
    from public.equipment_reservations er
    where er.status = 'approved'
    union all
    -- SPM-30: active records only, over their effective period. A record
    -- naming units counts only units still in service — a retired unit has
    -- already left total_units, so counting it again would double it.
    select
      u.equipment_item_id,
      'unavailable',
      case
        when exists (select 1 from public.equipment_unavailability_units uu where uu.unavailability_id = u.id)
          then (
            select count(*)::integer
            from public.equipment_unavailability_units uu
            join public.equipment_units eu on eu.id = uu.unit_id
            where uu.unavailability_id = u.id and eu.retired_at is null
          )
        else u.quantity
      end,
      u.starts_at,
      coalesce(u.ended_at, u.ends_at)
    from public.equipment_unavailability u
    where u.removed_at is null
  ),
  requirements as (
    select
      r.id,
      r.event_id,
      r.equipment_item_id,
      r.equipment_name,
      r.quantity,
      r.required_from,
      r.required_until,
      r.notes,
      i.code,
      i.retired_at,
      coalesce(i.total_quantity, 0) as total
    from public.event_equipment_requirements r
    left join public.equipment_items i on i.id = r.equipment_item_id
    where r.event_id = any (p_event_ids)
  ),
  loads as (
    -- The load changes only when a commitment starts, so checking the window
    -- start plus every commitment start inside it finds the busiest moment.
    select
      req.id,
      coalesce(max(point_load.all_qty), 0)::integer as peak_all,
      coalesce(max(point_load.reserved_qty), 0)::integer as peak_reserved,
      coalesce(max(point_load.unavailable_qty), 0)::integer as peak_unavailable
    from requirements req
    left join lateral (
      select req.required_from as point
      union
      select c.starts
      from commitments c
      where c.item_id = req.equipment_item_id
        and c.starts > req.required_from
        and c.starts < req.required_until
    ) points on req.equipment_item_id is not null
    left join lateral (
      select
        coalesce(sum(c.qty), 0) as all_qty,
        coalesce(sum(c.qty) filter (where c.kind = 'reserved'), 0) as reserved_qty,
        coalesce(sum(c.qty) filter (where c.kind = 'unavailable'), 0) as unavailable_qty
      from commitments c
      where c.item_id = req.equipment_item_id
        and c.starts <= points.point
        and c.ends > points.point
    ) point_load on points.point is not null
    group by req.id
  )
  select
    req.id,
    req.event_id,
    req.equipment_item_id,
    req.equipment_name,
    req.code,
    req.retired_at is not null,
    req.quantity,
    req.required_from,
    req.required_until,
    req.notes,
    req.total,
    l.peak_reserved,
    l.peak_unavailable,
    greatest(req.total - l.peak_all, 0),
    case
      when req.equipment_item_id is null or req.required_from is null then 'unknown'
      when greatest(req.total - l.peak_all, 0) >= req.quantity then 'available'
      when greatest(req.total - l.peak_all, 0) > 0 then 'partially_available'
      else 'unavailable'
    end
  from requirements req
  join loads l on l.id = req.id
  order by req.event_id, req.required_from nulls last, req.equipment_name;
end;
$$;

revoke all on function public.check_event_equipment_availability(uuid[]) from public, anon;
grant execute on function public.check_event_equipment_availability(uuid[]) to authenticated;
