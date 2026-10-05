-- SPM-30: Record equipment as unavailable for a period.
--
-- "As a Technical Support Staff member, I want to record equipment as
-- unavailable for a period, so that unavailable equipment is excluded from
-- event planning."
--
-- AC01 Technical Support Staff record equipment type, positive whole-number
--      quantity, unavailable start and end time, and reason.
-- AC02 The end time must be later than the start time.
-- AC03 Overlapping unavailability records and reservations are visible
--      before saving (the page reads both tables directly; see
--      apps/frontend/src/features/equipment).
-- AC04 Active unavailable quantities reduce the quantity shown by SPM-31.
--      An active record is one that is not removed, counted over
--      [starts_at, coalesce(ended_at, ends_at)).
-- AC05 Technical Support Staff can end a record early (the equipment came
--      back) or remove it (it should never have counted).
-- AC06 Current and past records keep the actor, reason and time — nothing
--      is deleted or edited in place; ending and removing are recorded as
--      who/when on the same row.
--
-- Mirrors SPM-19's venue blocks (202609270004): writes only through
-- security definer functions, history retained.

create table public.equipment_unavailability (
  id uuid primary key default gen_random_uuid(),
  equipment_item_id uuid not null references public.equipment_items (id),
  quantity integer not null check (quantity > 0),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  -- Set when the equipment returns to service before ends_at.
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  constraint equipment_unavailability_period_order check (ends_at > starts_at),
  constraint equipment_unavailability_ended_within_period check (
    ended_at is null or (ended_at > starts_at and ended_at < ends_at)
  )
);

create index equipment_unavailability_active_period_idx
  on public.equipment_unavailability using gist
  (equipment_item_id, tstzrange(starts_at, coalesce(ended_at, ends_at)))
  where removed_at is null;

alter table public.equipment_unavailability enable row level security;

-- Read-only for Technical Support Staff; every write goes through the
-- functions below.
create policy "technical support staff view equipment unavailability"
on public.equipment_unavailability
for select to authenticated
using (public.current_user_role() = 'technical_support_staff'::public.user_role);

-- AC06: the history names who recorded, ended or removed each record.
-- Technical Support Staff cannot otherwise read each other's profiles.
create policy "technical support staff view profiles tied to equipment unavailability"
on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'technical_support_staff'::public.user_role
  and exists (
    select 1 from public.equipment_unavailability u
    where u.recorded_by = profiles.id
      or u.ended_by = profiles.id
      or u.removed_by = profiles.id
  )
);

create function public.record_equipment_unavailability(
  p_equipment_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can record equipment as unavailable'
      using errcode = '42501';
  end if;
  if p_equipment_item_id is null
    or not exists (select 1 from public.equipment_items where id = p_equipment_item_id)
  then
    raise exception 'Choose equipment from the catalogue' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be a positive whole number' using errcode = '23514';
  end if;
  if v_reason = '' then
    raise exception 'Enter a reason' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reason must contain at most 500 characters' using errcode = '23514';
  end if;
  if p_starts_at is null then
    raise exception 'Enter a start time' using errcode = '23514';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '23514';
  end if;

  insert into public.equipment_unavailability (
    equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by
  )
  values (p_equipment_item_id, p_quantity, v_reason, p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- AC05: the equipment is back in service now, before the recorded end.
create function public.end_equipment_unavailability(p_unavailability_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_record public.equipment_unavailability;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can end an unavailability record'
      using errcode = '42501';
  end if;

  select * into v_record from public.equipment_unavailability
  where id = p_unavailability_id for update;

  if not found then
    raise exception 'Unavailability record not found' using errcode = '23514';
  end if;
  if v_record.removed_at is not null then
    raise exception 'This record has been removed' using errcode = '23514';
  end if;
  if v_record.ended_at is not null or v_record.ends_at <= now() then
    raise exception 'This record has already ended' using errcode = '23514';
  end if;
  if v_record.starts_at > now() then
    raise exception 'This record has not started yet — remove it instead' using errcode = '23514';
  end if;

  update public.equipment_unavailability
  set ended_at = now(), ended_by = auth.uid()
  where id = p_unavailability_id;

  return p_unavailability_id;
end;
$$;

-- AC05: the record should not count at all (recorded in error, or the
-- planned outage was called off). Kept for history (AC06).
create function public.remove_equipment_unavailability(p_unavailability_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_record public.equipment_unavailability;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can remove an unavailability record'
      using errcode = '42501';
  end if;

  select * into v_record from public.equipment_unavailability
  where id = p_unavailability_id for update;

  if not found then
    raise exception 'Unavailability record not found' using errcode = '23514';
  end if;
  if v_record.removed_at is not null then
    raise exception 'This record has already been removed' using errcode = '23514';
  end if;
  if coalesce(v_record.ended_at, v_record.ends_at) <= now() then
    raise exception 'Past records cannot be removed' using errcode = '23514';
  end if;

  update public.equipment_unavailability
  set removed_at = now(), removed_by = auth.uid()
  where id = p_unavailability_id;

  return p_unavailability_id;
end;
$$;

revoke all on function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.end_equipment_unavailability(uuid) from public, anon;
revoke all on function public.remove_equipment_unavailability(uuid) from public, anon;
grant execute on function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.end_equipment_unavailability(uuid) to authenticated;
grant execute on function public.remove_equipment_unavailability(uuid) to authenticated;
