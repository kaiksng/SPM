-- Reserve equipment for an event (Technical Support Staff).
--
-- "As a Technical Support Staff member, I want to reserve available equipment
-- for an event, so that it is not simultaneously committed elsewhere."
--
-- AC1 Given sufficient equipment is available for the required period, when
--     staff reserve it, then the event, equipment type, quantity, period,
--     staff member and timestamp are recorded and visible in the event's
--     arrangements.
-- AC2 Given the requested quantity exceeds availability, when reservation is
--     attempted, then it is rejected and the available quantity is shown.
-- AC3 Given a reservation succeeds, when another overlapping availability
--     check occurs, then the reserved quantity is no longer counted as
--     available (an approved reservation is a commitment to SPM-31).
-- AC4 Given an event's date, time or equipment requirement changes through
--     an approved change request, when the arrangements are reviewed, then
--     the reservation is marked for re-checking rather than silently left.
--     No change-request approval flow exists yet (event_change_requests is
--     unused), so this flags on the change itself — any actual change to the
--     event's schedule or to the reserved requirement, by whatever path —
--     which also covers that flow once it is built.
-- AC5 Given a reservation is released or changed, when the update succeeds,
--     then the quantity returns to the pool where applicable and the action
--     is recorded.
--
-- A reservation belongs to one event equipment requirement and covers that
-- requirement's period. Existing reservation policies (including the
-- coordinator insert policy from 202610050005) are left as they are; these
-- functions are the staff path and check availability under a lock.

-- ---------------------------------------------------------------------------
-- Reservation columns and history.
-- ---------------------------------------------------------------------------
alter table public.equipment_reservations
  add column requirement_id uuid references public.event_equipment_requirements (id) on delete set null,
  add column needs_recheck boolean not null default false,
  add column recheck_reason text,
  add column released_at timestamptz,
  add column released_by uuid references public.profiles (id);

-- One live reservation per requirement; changing it edits that row.
create unique index equipment_reservations_one_active_per_requirement
  on public.equipment_reservations (requirement_id)
  where status = 'approved' and requirement_id is not null;

create table public.equipment_reservation_events (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.equipment_reservations (id) on delete cascade,
  action text not null check (action in ('reserved', 'changed', 'rechecked', 'released', 'flagged_for_recheck')),
  details jsonb,
  actor uuid references public.profiles (id),
  occurred_at timestamptz not null default now()
);

create index equipment_reservation_events_reservation_idx
  on public.equipment_reservation_events (reservation_id, occurred_at);

alter table public.equipment_reservation_events enable row level security;

-- Visible to whoever can see the reservation itself.
create policy "reservation history visible with the reservation"
on public.equipment_reservation_events
for select to authenticated
using (
  exists (
    select 1 from public.equipment_reservations r
    where r.id = equipment_reservation_events.reservation_id
      and (
        public.can_view_event(r.event_id)
        or public.current_user_role() = 'technical_support_staff'::public.user_role
      )
  )
);

-- ---------------------------------------------------------------------------
-- Commitment peaks — the single place availability is calculated, shared by
-- the SPM-31 check and the reserve/change functions.
-- ---------------------------------------------------------------------------
create or replace function public.equipment_commitment_peaks(
  p_item_id uuid,
  p_from timestamptz,
  p_until timestamptz,
  p_exclude_requirement_id uuid default null
)
returns table (peak_all integer, peak_reserved integer, peak_unavailable integer)
language sql stable security definer set search_path = ''
as $$
  with commitments as (
    select 'reserved'::text as kind, er.quantity as qty, er.starts_at as starts, er.ends_at as ends
    from public.equipment_reservations er
    where er.equipment_item_id = p_item_id
      and er.status = 'approved'
      -- A requirement's own reservation is not competition for itself.
      and er.requirement_id is distinct from p_exclude_requirement_id
    union all
    select
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
    where u.equipment_item_id = p_item_id and u.removed_at is null
  ),
  points as (
    select p_from as point
    union
    select c.starts from commitments c where c.starts > p_from and c.starts < p_until
  ),
  loads as (
    select
      coalesce(sum(c.qty), 0) as all_qty,
      coalesce(sum(c.qty) filter (where c.kind = 'reserved'), 0) as reserved_qty,
      coalesce(sum(c.qty) filter (where c.kind = 'unavailable'), 0) as unavailable_qty
    from points p
    left join commitments c on c.starts <= p.point and c.ends > p.point
    group by p.point
  )
  select
    coalesce(max(all_qty), 0)::integer,
    coalesce(max(reserved_qty), 0)::integer,
    coalesce(max(unavailable_qty), 0)::integer
  from loads;
$$;

revoke all on function public.equipment_commitment_peaks(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SPM-31 check, recreated to use the shared peaks and to return each
-- requirement's reservation. Its own reservation is excluded from its
-- availability so a reserved item does not report itself as a shortage.
-- ---------------------------------------------------------------------------
drop function public.check_event_equipment_availability(uuid[]);

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
  order by r.event_id, r.required_from nulls last, r.equipment_name;
end;
$$;

revoke all on function public.check_event_equipment_availability(uuid[]) from public, anon;
grant execute on function public.check_event_equipment_availability(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Reserve, change/re-check, release.
-- ---------------------------------------------------------------------------
create or replace function public.reservation_snapshot(p_reservation public.equipment_reservations)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'quantity', p_reservation.quantity,
    'startsAt', to_char(p_reservation.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt', to_char(p_reservation.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

revoke all on function public.reservation_snapshot(public.equipment_reservations) from public, anon, authenticated;

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
  if v_event_status not in ('requested', 'planning', 'confirmed') then
    raise exception 'Equipment can only be reserved for a Requested, Planning or Confirmed event'
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

create or replace function public.reserve_equipment(p_requirement_id uuid, p_quantity integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_lock record;
  v_reservation public.equipment_reservations;
begin
  select * into v_lock from public.lock_requirement_for_reservation(p_requirement_id);

  if exists (
    select 1 from public.equipment_reservations
    where requirement_id = p_requirement_id and status = 'approved'
  ) then
    raise exception 'This equipment is already reserved — change the reservation instead'
      using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be a positive whole number' using errcode = '23514';
  end if;
  if p_quantity > (v_lock.requirement).quantity then
    raise exception 'Cannot reserve more than the % requested', (v_lock.requirement).quantity
      using errcode = '23514';
  end if;
  -- AC2: reject, stating what is available.
  if p_quantity > v_lock.available then
    raise exception 'Only % available for this period', v_lock.available using errcode = '23514';
  end if;

  insert into public.equipment_reservations (
    event_id, equipment_item_id, requirement_id, quantity, starts_at, ends_at,
    status, requested_by, requested_at, decided_by, decided_at
  )
  values (
    (v_lock.requirement).event_id, (v_lock.requirement).equipment_item_id, p_requirement_id, p_quantity,
    (v_lock.requirement).required_from, (v_lock.requirement).required_until,
    'approved', auth.uid(), now(), auth.uid(), now()
  )
  returning * into v_reservation;

  insert into public.equipment_reservation_events (reservation_id, action, details, actor)
  values (v_reservation.id, 'reserved', public.reservation_snapshot(v_reservation), auth.uid());

  return v_reservation.id;
end;
$$;

-- Changes the quantity and re-aligns the period with the requirement's
-- current one. Used both to change a reservation and to re-check a flagged
-- one (same quantity), which clears the flag once it fits again.
create or replace function public.change_equipment_reservation(p_reservation_id uuid, p_quantity integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.equipment_reservations;
  v_updated public.equipment_reservations;
  v_lock record;
  v_was_flagged boolean;
begin
  select * into v_reservation from public.equipment_reservations where id = p_reservation_id for update;
  if not found or v_reservation.status <> 'approved' then
    raise exception 'This reservation is no longer active' using errcode = '23514';
  end if;
  if v_reservation.requirement_id is null then
    raise exception 'The equipment request was removed — release this reservation instead'
      using errcode = '23514';
  end if;

  select * into v_lock from public.lock_requirement_for_reservation(v_reservation.requirement_id);

  if (v_lock.requirement).equipment_item_id is distinct from v_reservation.equipment_item_id then
    raise exception 'The requested equipment changed — release this reservation and reserve again'
      using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be a positive whole number' using errcode = '23514';
  end if;
  if p_quantity > (v_lock.requirement).quantity then
    raise exception 'Cannot reserve more than the % requested', (v_lock.requirement).quantity
      using errcode = '23514';
  end if;
  if p_quantity > v_lock.available then
    raise exception 'Only % available for this period', v_lock.available using errcode = '23514';
  end if;

  v_was_flagged := v_reservation.needs_recheck;

  update public.equipment_reservations
  set
    quantity = p_quantity,
    starts_at = (v_lock.requirement).required_from,
    ends_at = (v_lock.requirement).required_until,
    needs_recheck = false,
    recheck_reason = null
  where id = p_reservation_id
  returning * into v_updated;

  insert into public.equipment_reservation_events (reservation_id, action, details, actor)
  values (
    p_reservation_id,
    case
      when v_was_flagged and public.reservation_snapshot(v_reservation) = public.reservation_snapshot(v_updated)
        then 'rechecked'
      else 'changed'
    end,
    jsonb_build_object(
      'previous', public.reservation_snapshot(v_reservation),
      'new', public.reservation_snapshot(v_updated)
    ),
    auth.uid()
  );

  return p_reservation_id;
end;
$$;

create or replace function public.release_equipment_reservation(p_reservation_id uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_reservation public.equipment_reservations;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can release a reservation' using errcode = '42501';
  end if;

  select * into v_reservation from public.equipment_reservations where id = p_reservation_id for update;
  if not found or v_reservation.status <> 'approved' then
    raise exception 'This reservation is no longer active' using errcode = '23514';
  end if;

  -- 'cancelled' is not a commitment, so the units return to the pool (AC5).
  update public.equipment_reservations
  set status = 'cancelled', released_at = now(), released_by = auth.uid(), needs_recheck = false
  where id = p_reservation_id;

  insert into public.equipment_reservation_events (reservation_id, action, details, actor)
  values (
    p_reservation_id,
    'released',
    public.reservation_snapshot(v_reservation)
      || jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')),
    auth.uid()
  );

  return p_reservation_id;
end;
$$;

revoke all on function public.reserve_equipment(uuid, integer) from public, anon;
revoke all on function public.change_equipment_reservation(uuid, integer) from public, anon;
revoke all on function public.release_equipment_reservation(uuid, text) from public, anon;
grant execute on function public.reserve_equipment(uuid, integer) to authenticated;
grant execute on function public.change_equipment_reservation(uuid, integer) to authenticated;
grant execute on function public.release_equipment_reservation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AC4: flag live reservations when what they were based on changes.
-- ---------------------------------------------------------------------------
create or replace function public.flag_equipment_reservations(p_reservation_ids uuid[], p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.equipment_reservations
  set needs_recheck = true, recheck_reason = p_reason
  where id = any (p_reservation_ids) and status = 'approved';

  insert into public.equipment_reservation_events (reservation_id, action, details, actor)
  select r.id, 'flagged_for_recheck', jsonb_build_object('reason', p_reason), auth.uid()
  from public.equipment_reservations r
  where r.id = any (p_reservation_ids) and r.status = 'approved';
end;
$$;

revoke all on function public.flag_equipment_reservations(uuid[], text) from public, anon, authenticated;

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
  else
    return new;
  end if;

  perform public.flag_equipment_reservations(v_ids, v_reason);
  return coalesce(new, old);
end;
$$;

-- BEFORE DELETE: the reservation's requirement_id is still set at this point
-- (the foreign key nulls it afterwards).
create trigger event_equipment_requirements_flag_reservations_on_delete
before delete on public.event_equipment_requirements
for each row execute function public.flag_reservations_on_requirement_change();

create trigger event_equipment_requirements_flag_reservations_on_update
after update of equipment_item_id, quantity, required_from, required_until on public.event_equipment_requirements
for each row execute function public.flag_reservations_on_requirement_change();

create or replace function public.flag_reservations_on_schedule_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;

  select array_agg(id) into v_ids
  from public.equipment_reservations
  where event_id = new.id and status = 'approved';

  if v_ids is not null then
    perform public.flag_equipment_reservations(v_ids, 'The event date or time changed');
  end if;
  return new;
end;
$$;

create trigger events_flag_equipment_reservations
after update of starts_at, ends_at on public.events
for each row execute function public.flag_reservations_on_schedule_change();
