-- Equipment units and catalogue management (Technical Support Staff).
--
-- 1. Every physical unit is tracked: an item type has a short code ("mic")
--    and numbered units ("mic-1" ... "mic-100"). An item's total_quantity is
--    now the number of its in-service (not retired) units, kept in sync by
--    trigger, so every existing reader of total_quantity keeps working.
-- 2. Every catalogue item starts with 100 units.
-- 3. Technical Support Staff add items, edit name/category/code, add units,
--    retire/restore units, and retire/restore items. A retired item is no
--    longer offered for new equipment requirements; existing ones keep it.
-- 4. An SPM-30 unavailability record may name the exact units that are out
--    (equipment_unavailability_units). Recording only a quantity still works.

-- ---------------------------------------------------------------------------
-- Catalogue items: code + retirement.
-- ---------------------------------------------------------------------------
alter table public.equipment_items
  add column code text,
  add column retired_at timestamptz,
  add column retired_by uuid references public.profiles (id);

update public.equipment_items i
set code = v.code
from (
  values
    ('Wireless microphone', 'mic'),
    ('Wired microphone', 'wired-mic'),
    ('PA speaker', 'spk'),
    ('Audio mixer', 'mixer'),
    ('Projector', 'proj'),
    ('Projection screen', 'screen'),
    ('TV / display monitor', 'tv'),
    ('Laptop', 'laptop'),
    ('Presentation clicker', 'clicker'),
    ('Stage light', 'light'),
    ('HDMI cable', 'hdmi'),
    ('Extension cord', 'ext')
) as v (name, code)
where lower(i.name) = lower(v.name);

-- Any other item (added by staff since the catalogue was seeded) gets a
-- code derived from its name, made unique with a numeric suffix if needed.
with derived as (
  select
    id,
    coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'item') as base
  from public.equipment_items
  where code is null
),
numbered as (
  select
    d.id,
    d.base,
    row_number() over (partition by d.base order by d.id) as n
  from derived d
)
update public.equipment_items i
set code = case
  when n = 1 and not exists (select 1 from public.equipment_items e where e.code = numbered.base)
    then numbered.base
  else numbered.base || '-' || n
end
from numbered
where i.id = numbered.id;

alter table public.equipment_items
  alter column code set not null,
  add constraint equipment_items_code_format
    check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(code) <= 20),
  add constraint equipment_items_name_length
    check (char_length(trim(name)) between 1 and 120),
  add constraint equipment_items_category_length
    check (category is null or char_length(trim(category)) between 1 and 60);

create unique index equipment_items_code_key on public.equipment_items (code);
create unique index equipment_items_name_key on public.equipment_items (lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Units.
-- ---------------------------------------------------------------------------
create table public.equipment_units (
  id uuid primary key default gen_random_uuid(),
  equipment_item_id uuid not null references public.equipment_items (id),
  unit_number integer not null check (unit_number > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  retired_at timestamptz,
  retired_by uuid references public.profiles (id),
  unique (equipment_item_id, unit_number)
);

alter table public.equipment_units enable row level security;

create policy "technical support staff view equipment units"
on public.equipment_units
for select to authenticated
using (public.current_user_role() = 'technical_support_staff'::public.user_role);

-- total_quantity = in-service units. Recomputed on every write to the item
-- (so it cannot be set by hand) and touched by every unit write.
create or replace function public.sync_equipment_item_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_quantity := (
    select count(*) from public.equipment_units u
    where u.equipment_item_id = new.id and u.retired_at is null
  );
  return new;
end;
$$;

create trigger equipment_items_sync_total
before insert or update on public.equipment_items
for each row execute function public.sync_equipment_item_total();

create or replace function public.touch_equipment_item_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.equipment_items
  set total_quantity = total_quantity
  where id = coalesce(new.equipment_item_id, old.equipment_item_id);
  return null;
end;
$$;

create trigger equipment_units_touch_total
after insert or update or delete on public.equipment_units
for each row execute function public.touch_equipment_item_total();

-- Every item starts with 100 units.
insert into public.equipment_units (equipment_item_id, unit_number)
select i.id, n
from public.equipment_items i
cross join generate_series(1, 100) as n
where not exists (select 1 from public.equipment_units u where u.equipment_item_id = i.id);

-- ---------------------------------------------------------------------------
-- Units named on an SPM-30 unavailability record.
-- ---------------------------------------------------------------------------
create table public.equipment_unavailability_units (
  unavailability_id uuid not null references public.equipment_unavailability (id),
  unit_id uuid not null references public.equipment_units (id),
  primary key (unavailability_id, unit_id)
);

alter table public.equipment_unavailability_units enable row level security;

create policy "technical support staff view unavailable units"
on public.equipment_unavailability_units
for select to authenticated
using (public.current_user_role() = 'technical_support_staff'::public.user_role);

-- Replaces the SPM-30 version (202610060001) with one that also accepts
-- specific units. With units, the quantity is the number of units named.
drop function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz);

create function public.record_equipment_unavailability(
  p_equipment_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_unit_ids uuid[] default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_units uuid[] := coalesce(p_unit_ids, array[]::uuid[]);
  v_quantity integer := p_quantity;
  v_busy text;
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

  if cardinality(v_units) > 0 then
    if cardinality(v_units) <> (select count(distinct u) from unnest(v_units) as u) then
      raise exception 'Each unit can be chosen only once' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(v_units) as chosen(unit_id)
      where not exists (
        select 1 from public.equipment_units eu
        where eu.id = chosen.unit_id
          and eu.equipment_item_id = p_equipment_item_id
          and eu.retired_at is null
      )
    ) then
      raise exception 'Choose in-service units of this equipment' using errcode = '23514';
    end if;
    v_quantity := cardinality(v_units);
  end if;

  if v_quantity is null or v_quantity < 1 then
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

  -- A unit cannot be out for two overlapping reasons at once.
  select string_agg(i.code || '-' || eu.unit_number, ', ' order by eu.unit_number) into v_busy
  from unnest(v_units) as chosen(unit_id)
  join public.equipment_units eu on eu.id = chosen.unit_id
  join public.equipment_items i on i.id = eu.equipment_item_id
  where exists (
    select 1
    from public.equipment_unavailability_units uu
    join public.equipment_unavailability u on u.id = uu.unavailability_id
    where uu.unit_id = chosen.unit_id
      and u.removed_at is null
      and tstzrange(u.starts_at, coalesce(u.ended_at, u.ends_at), '[)')
        && tstzrange(p_starts_at, p_ends_at, '[)')
  );
  if v_busy is not null then
    raise exception 'Already unavailable for part of this period: %', v_busy
      using errcode = '23514';
  end if;

  insert into public.equipment_unavailability (
    equipment_item_id, quantity, reason, starts_at, ends_at, recorded_by
  )
  values (p_equipment_item_id, v_quantity, v_reason, p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;

  insert into public.equipment_unavailability_units (unavailability_id, unit_id)
  select v_id, unnest(v_units);

  return v_id;
end;
$$;

revoke all on function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.record_equipment_unavailability(uuid, integer, text, timestamptz, timestamptz, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue management functions (Technical Support Staff only).
-- ---------------------------------------------------------------------------
create or replace function public.assert_technical_support_staff()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'technical_support_staff'::public.user_role
  then
    raise exception 'Only Technical Support Staff can manage equipment'
      using errcode = '42501';
  end if;
end;
$$;

-- Shared validation for create/update; returns the cleaned values.
create or replace function public.clean_equipment_item_fields(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_code text,
  out o_name text,
  out o_category text,
  out o_code text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  o_name := trim(coalesce(p_name, ''));
  o_category := nullif(trim(coalesce(p_category, '')), '');
  o_code := lower(trim(coalesce(p_code, '')));

  if o_name = '' then
    raise exception 'Enter a name' using errcode = '23514';
  end if;
  if char_length(o_name) > 120 then
    raise exception 'Name must contain at most 120 characters' using errcode = '23514';
  end if;
  if o_category is null then
    raise exception 'Enter a category' using errcode = '23514';
  end if;
  if char_length(o_category) > 60 then
    raise exception 'Category must contain at most 60 characters' using errcode = '23514';
  end if;
  if o_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(o_code) > 20 then
    raise exception 'Code must be 1-20 lowercase letters, numbers or single hyphens (e.g. mic)'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.equipment_items i
    where lower(trim(i.name)) = lower(o_name) and i.id is distinct from p_item_id
  ) then
    raise exception 'An item with this name already exists' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.equipment_items i
    where i.code = o_code and i.id is distinct from p_item_id
  ) then
    raise exception 'Another item already uses the code %', o_code using errcode = '23514';
  end if;
end;
$$;

create or replace function public.create_equipment_item(
  p_name text,
  p_category text,
  p_code text,
  p_units integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_fields record;
  v_id uuid;
begin
  perform public.assert_technical_support_staff();
  select * into v_fields from public.clean_equipment_item_fields(null, p_name, p_category, p_code);

  if p_units is null or p_units < 0 or p_units > 1000 then
    raise exception 'Enter between 0 and 1000 units' using errcode = '23514';
  end if;

  insert into public.equipment_items (name, category, code, total_quantity)
  values (v_fields.o_name, v_fields.o_category, v_fields.o_code, 0)
  returning id into v_id;

  insert into public.equipment_units (equipment_item_id, unit_number, created_by)
  select v_id, n, auth.uid() from generate_series(1, p_units) as n;

  return v_id;
end;
$$;

create or replace function public.update_equipment_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_code text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_fields record;
begin
  perform public.assert_technical_support_staff();
  if not exists (select 1 from public.equipment_items where id = p_item_id) then
    raise exception 'Equipment not found' using errcode = '23514';
  end if;
  select * into v_fields from public.clean_equipment_item_fields(p_item_id, p_name, p_category, p_code);

  update public.equipment_items
  set name = v_fields.o_name, category = v_fields.o_category, code = v_fields.o_code
  where id = p_item_id;

  -- Requirements store the item's name; keep them in step with a rename
  -- (the guard trigger copies it from the catalogue).
  update public.event_equipment_requirements
  set equipment_item_id = equipment_item_id
  where equipment_item_id = p_item_id
    and equipment_name is distinct from v_fields.o_name;

  return p_item_id;
end;
$$;

-- Adds units numbered after the highest existing one; returns the new
-- in-service total.
create or replace function public.add_equipment_units(p_item_id uuid, p_count integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_next integer;
begin
  perform public.assert_technical_support_staff();
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Enter between 1 and 1000 units' using errcode = '23514';
  end if;
  perform 1 from public.equipment_items where id = p_item_id for update;
  if not found then
    raise exception 'Equipment not found' using errcode = '23514';
  end if;

  select coalesce(max(unit_number), 0) + 1 into v_next
  from public.equipment_units where equipment_item_id = p_item_id;

  insert into public.equipment_units (equipment_item_id, unit_number, created_by)
  select p_item_id, n, auth.uid() from generate_series(v_next, v_next + p_count - 1) as n;

  return (select total_quantity from public.equipment_items where id = p_item_id);
end;
$$;

create or replace function public.set_equipment_unit_retired(p_unit_id uuid, p_retired boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_technical_support_staff();
  if not exists (select 1 from public.equipment_units where id = p_unit_id) then
    raise exception 'Unit not found' using errcode = '23514';
  end if;

  update public.equipment_units
  set
    retired_at = case when p_retired then coalesce(retired_at, now()) else null end,
    retired_by = case when p_retired then coalesce(retired_by, auth.uid()) else null end
  where id = p_unit_id;

  return p_unit_id;
end;
$$;

create or replace function public.set_equipment_item_retired(p_item_id uuid, p_retired boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_technical_support_staff();
  if not exists (select 1 from public.equipment_items where id = p_item_id) then
    raise exception 'Equipment not found' using errcode = '23514';
  end if;

  update public.equipment_items
  set
    retired_at = case when p_retired then coalesce(retired_at, now()) else null end,
    retired_by = case when p_retired then coalesce(retired_by, auth.uid()) else null end
  where id = p_item_id;

  return p_item_id;
end;
$$;

revoke all on function public.assert_technical_support_staff() from public, anon;
revoke all on function public.clean_equipment_item_fields(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_equipment_item(text, text, text, integer) from public, anon;
revoke all on function public.update_equipment_item(uuid, text, text, text) from public, anon;
revoke all on function public.add_equipment_units(uuid, integer) from public, anon;
revoke all on function public.set_equipment_unit_retired(uuid, boolean) from public, anon;
revoke all on function public.set_equipment_item_retired(uuid, boolean) from public, anon;
grant execute on function public.assert_technical_support_staff() to authenticated;
grant execute on function public.create_equipment_item(text, text, text, integer) to authenticated;
grant execute on function public.update_equipment_item(uuid, text, text, text) to authenticated;
grant execute on function public.add_equipment_units(uuid, integer) to authenticated;
grant execute on function public.set_equipment_unit_retired(uuid, boolean) to authenticated;
grant execute on function public.set_equipment_item_retired(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- A retired item cannot be newly chosen for an event's equipment.
-- Recreated in full from 202610050004; only the retirement check is new.
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_equipment_requirement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  catalogue_name text;
  catalogue_retired_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'An equipment requirement cannot be moved to another event'
      using errcode = 'check_violation';
  end if;

  if new.equipment_item_id is null then
    if tg_op = 'INSERT' then
      raise exception 'Choose equipment from the catalogue for each equipment item'
        using errcode = 'check_violation';
    end if;

    if old.equipment_item_id is not null
      or new.equipment_name is distinct from old.equipment_name
      or new.quantity is distinct from old.quantity
      or new.notes is distinct from old.notes
    then
      raise exception 'A previously saved equipment entry can only be kept or replaced with catalogue equipment'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  select name, retired_at into catalogue_name, catalogue_retired_at
  from public.equipment_items
  where id = new.equipment_item_id;

  if catalogue_name is null then
    raise exception 'Choose equipment from the catalogue for each equipment item'
      using errcode = 'check_violation';
  end if;

  -- Rows already using an item stay valid after it is retired; only a new
  -- choice of it is refused.
  if catalogue_retired_at is not null
    and (tg_op = 'INSERT' or new.equipment_item_id is distinct from old.equipment_item_id)
  then
    raise exception '% is no longer offered — choose other equipment', catalogue_name
      using errcode = 'check_violation';
  end if;

  new.equipment_name := catalogue_name;
  return new;
end;
$$;
