-- Record Equipment Requirements for an Event.
--
-- "As an Event Coordinator, I want to record the equipment required for an
-- event I am assigned to, so that Technical Support Staff can assess and
-- arrange the required resources."
--
-- AC01 A requirement records the event, equipment item, quantity, required
--      period (start and end) and any technical requirements.
-- AC02 The equipment item comes from the catalogue (equipment_items, grouped
--      by category) — free text is no longer accepted from either role.
-- AC03 Item, quantity, period start and period end are mandatory whenever an
--      item is added; technical requirements are optional. A draft still
--      needs only its event name.
-- AC04 Quantity is a positive whole number.
-- AC05 The period ends after it starts. It covers setup through cleanup, so
--      it is deliberately NOT bounded by the event's own start/end.
-- AC06 Missing or invalid information saves nothing.
-- AC07 Every add/change/remove is logged with actor and timestamp; earlier
--      entries are kept.
-- AC08 That history is visible only to the assigned coordinator and to
--      Technical Support Staff.
-- AC09 Only Technical Support Staff maintain the catalogue (already true of
--      equipment_items' RLS since 202609220005 — unchanged here).
-- AC10 The same catalogue item may appear more than once on an event.
-- AC13 A legacy free-text entry can be kept as it is or replaced with a
--      catalogue item; it can no longer be edited as free text.
--
-- This reverses PB-07's scope exclusion for equipment. That exclusion
-- existed because save_event_draft / update_event_as_coordinator deleted and
-- re-inserted every equipment row on every save, so a trigger would log
-- "removed X / added X" churn. Both now go through
-- save_event_equipment_requirements, which keeps each row's id stable
-- (update in place, delete only what was actually removed), so a plain row
-- trigger records genuine history regardless of which write path — RPC or
-- the organiser's direct RLS access — reached the table.

-- ---------------------------------------------------------------------------
-- Catalogue starter content. total_quantity is 0 until Technical Support
-- Staff supply real stock figures; stock is not checked by this story.
-- ---------------------------------------------------------------------------
insert into public.equipment_items (name, category, total_quantity)
select v.name, v.category, 0
from (
  values
    ('Wireless microphone', 'Audio'),
    ('Wired microphone', 'Audio'),
    ('PA speaker', 'Audio'),
    ('Audio mixer', 'Audio'),
    ('Projector', 'Visual'),
    ('Projection screen', 'Visual'),
    ('TV / display monitor', 'Visual'),
    ('Laptop', 'Computing'),
    ('Presentation clicker', 'Computing'),
    ('Stage light', 'Lighting'),
    ('HDMI cable', 'Connectivity'),
    ('Extension cord', 'Connectivity')
) as v (name, category)
where not exists (
  select 1 from public.equipment_items i where lower(i.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- Requirement columns. Existing rows stay as legacy entries: no catalogue
-- item and no period. Any row with a catalogue item must carry a period.
-- ---------------------------------------------------------------------------
alter table public.event_equipment_requirements
  add column equipment_item_id uuid references public.equipment_items (id),
  add column required_from timestamptz,
  add column required_until timestamptz;

alter table public.event_equipment_requirements
  add constraint event_equipment_requirements_catalogue_or_legacy check (
    (equipment_item_id is null and required_from is null and required_until is null)
    or (equipment_item_id is not null and required_from is not null and required_until is not null)
  ),
  add constraint event_equipment_requirements_period_order check (required_until > required_from);

-- not valid: enforced for every new write, without failing on any older
-- free-text note that may predate the form's 1,000-character cap.
alter table public.event_equipment_requirements
  add constraint event_equipment_requirements_notes_length check (char_length(notes) <= 1000) not valid;

create index event_equipment_requirements_item_idx
  on public.event_equipment_requirements (equipment_item_id);

-- Applies to every write path, including the organiser's direct RLS access,
-- not just the two RPCs: a new row must come from the catalogue, a legacy
-- row may only stay exactly as it is (or become a catalogue row), and
-- equipment_name always mirrors the chosen catalogue item so every existing
-- reader of that column keeps working.
create or replace function public.guard_event_equipment_requirement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  catalogue_name text;
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

  select name into catalogue_name
  from public.equipment_items
  where id = new.equipment_item_id;

  if catalogue_name is null then
    raise exception 'Choose equipment from the catalogue for each equipment item'
      using errcode = 'check_violation';
  end if;

  new.equipment_name := catalogue_name;
  return new;
end;
$$;

create trigger event_equipment_requirements_guard
before insert or update on public.event_equipment_requirements
for each row execute function public.guard_event_equipment_requirement();

-- ---------------------------------------------------------------------------
-- History (AC07/AC08).
-- ---------------------------------------------------------------------------
create table public.event_equipment_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  -- No foreign key: a "removed" entry outlives the row it describes.
  requirement_id uuid not null,
  change_type text not null check (change_type in ('added', 'changed', 'removed')),
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index event_equipment_changes_event_idx
  on public.event_equipment_changes (event_id, changed_at asc);

alter table public.event_equipment_changes enable row level security;

-- No write policy: only the security definer trigger below inserts, the same
-- way event_field_changes is written.
create policy "assigned coordinator and technical support view equipment history"
on public.event_equipment_changes
for select to authenticated using (
  public.current_user_role() = 'technical_support_staff'::public.user_role
  or exists (
    select 1 from public.events e
    where e.id = event_equipment_changes.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
);

-- The history panel names who made each change. Coordinators can already
-- read every profile; Technical Support Staff can read only the profiles of
-- people who appear in equipment history — the same narrow shape as
-- "venue staff view profiles tied to venue bookings" (202609270003).
create policy "technical support staff view profiles tied to equipment changes"
on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'technical_support_staff'::public.user_role
  and exists (
    select 1 from public.event_equipment_changes c
    where c.changed_by = profiles.id
  )
);

-- One requirement as it reads in history. Timestamps use the same UTC
-- format event_field_changes uses; category is captured at the time of the
-- change so a later catalogue edit does not rewrite the past.
create or replace function public.event_equipment_snapshot(
  requirement public.event_equipment_requirements
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'equipmentItemId', requirement.equipment_item_id,
    'equipmentName', requirement.equipment_name,
    'category', (
      select i.category from public.equipment_items i
      where i.id = requirement.equipment_item_id
    ),
    'quantity', requirement.quantity,
    'requiredFrom', to_char(requirement.required_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'requiredUntil', to_char(requirement.required_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'technicalRequirements', requirement.notes
  );
$$;

-- Internal to the trigger below (which runs as the owner). Not callable
-- directly, so PostgREST does not expose it as a computed column either.
revoke all on function public.event_equipment_snapshot(public.event_equipment_requirements) from public;
revoke all on function public.event_equipment_snapshot(public.event_equipment_requirements) from anon;
revoke all on function public.event_equipment_snapshot(public.event_equipment_requirements) from authenticated;

create or replace function public.record_event_equipment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_snapshot jsonb;
  new_snapshot jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.event_equipment_changes (event_id, requirement_id, change_type, new_value, changed_by)
    values (new.event_id, new.id, 'added', public.event_equipment_snapshot(new), auth.uid());
    return new;
  end if;

  if tg_op = 'UPDATE' then
    previous_snapshot := public.event_equipment_snapshot(old);
    new_snapshot := public.event_equipment_snapshot(new);

    if new_snapshot is distinct from previous_snapshot then
      insert into public.event_equipment_changes (
        event_id, requirement_id, change_type, previous_value, new_value, changed_by
      )
      values (new.event_id, new.id, 'changed', previous_snapshot, new_snapshot, auth.uid());
    end if;

    return new;
  end if;

  -- A discarded draft cascades its requirements away along with the event
  -- itself, and that event's history goes with it — there is nothing left to
  -- record the removal against.
  if exists (select 1 from public.events where id = old.event_id) then
    insert into public.event_equipment_changes (event_id, requirement_id, change_type, previous_value, changed_by)
    values (old.event_id, old.id, 'removed', public.event_equipment_snapshot(old), auth.uid());
  end if;

  return old;
end;
$$;

create trigger event_equipment_requirements_record_changes
after insert or update or delete on public.event_equipment_requirements
for each row execute function public.record_event_equipment_change();

-- ---------------------------------------------------------------------------
-- The one place equipment is validated and written. Security invoker: called
-- from save_event_draft (invoker) it runs under the organiser's RLS, and from
-- update_event_as_coordinator (definer) it runs with that function's
-- privileges after its own assigned-coordinator / Planning checks. It grants
-- nothing beyond what the caller could already do to the table directly.
--
-- Payload: [{ id?, equipmentItemId?, quantity, requiredFrom, requiredUntil,
-- notes? }]. An item with an id updates that row in place; an item without
-- one is added; any existing row whose id is not sent is removed. An item
-- with an id and no equipmentItemId keeps that legacy free-text row as it is.
--
-- Returns how many rows were actually added, changed or removed, so
-- save_event_draft can tell whether a locked equipment section was touched.
-- ---------------------------------------------------------------------------
create or replace function public.save_event_equipment_requirements(
  p_event_id uuid,
  p_equipment jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_number integer := 0;
  requirement_id uuid;
  catalogue_item_id uuid;
  quantity_text text;
  required_from_value timestamptz;
  required_until_value timestamptz;
  notes_value text;
  existing public.event_equipment_requirements;
  kept_ids uuid[] := array[]::uuid[];
  change_count integer := 0;
  removed_count integer;
begin
  if coalesce(jsonb_typeof(p_equipment), 'null') not in ('array', 'null') then
    raise exception 'Equipment requirements must be a list'
      using errcode = 'check_violation';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb))
  loop
    item_number := item_number + 1;
    requirement_id := nullif(trim(item ->> 'id'), '')::uuid;
    catalogue_item_id := nullif(trim(item ->> 'equipmentItemId'), '')::uuid;
    existing := null;

    if requirement_id is not null then
      if requirement_id = any (kept_ids) then
        raise exception 'Equipment item % appears more than once', item_number
          using errcode = 'check_violation';
      end if;

      select * into existing
      from public.event_equipment_requirements
      where id = requirement_id and event_id = p_event_id;

      if not found then
        raise exception 'Equipment item % is no longer part of this event', item_number
          using errcode = 'check_violation';
      end if;

      kept_ids := kept_ids || requirement_id;
    end if;

    if catalogue_item_id is null then
      -- AC13: a legacy free-text entry may be kept exactly as it is.
      if existing.id is not null and existing.equipment_item_id is null then
        continue;
      end if;

      raise exception 'Choose equipment from the catalogue for equipment item %', item_number
        using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.equipment_items where id = catalogue_item_id) then
      raise exception 'Equipment item % is not in the equipment catalogue', item_number
        using errcode = 'check_violation';
    end if;

    quantity_text := nullif(trim(item ->> 'quantity'), '');

    if quantity_text is null or quantity_text !~ '^[1-9][0-9]*$' then
      raise exception 'Equipment quantity must be a positive whole number'
        using errcode = 'check_violation';
    end if;

    required_from_value := nullif(trim(item ->> 'requiredFrom'), '')::timestamptz;
    required_until_value := nullif(trim(item ->> 'requiredUntil'), '')::timestamptz;

    if required_from_value is null or required_until_value is null then
      raise exception 'Enter when equipment item % is required from and until', item_number
        using errcode = 'check_violation';
    end if;

    if required_until_value <= required_from_value then
      raise exception 'Equipment item % must be required until a time after it is required from', item_number
        using errcode = 'check_violation';
    end if;

    notes_value := nullif(trim(item ->> 'notes'), '');

    if char_length(notes_value) > 1000 then
      raise exception 'Technical requirements must contain at most 1,000 characters'
        using errcode = 'check_violation';
    end if;

    if existing.id is null then
      insert into public.event_equipment_requirements (
        event_id,
        equipment_item_id,
        equipment_name,
        quantity,
        required_from,
        required_until,
        notes
      )
      values (
        p_event_id,
        catalogue_item_id,
        -- Overwritten from the catalogue by the guard trigger; the column
        -- is not null, so something has to be supplied.
        'catalogue item',
        quantity_text::integer,
        required_from_value,
        required_until_value,
        notes_value
      )
      returning id into requirement_id;

      kept_ids := kept_ids || requirement_id;
      change_count := change_count + 1;
    elsif existing.equipment_item_id is distinct from catalogue_item_id
      or existing.quantity is distinct from quantity_text::integer
      or existing.required_from is distinct from required_from_value
      or existing.required_until is distinct from required_until_value
      or existing.notes is distinct from notes_value
    then
      update public.event_equipment_requirements
      set
        equipment_item_id = catalogue_item_id,
        quantity = quantity_text::integer,
        required_from = required_from_value,
        required_until = required_until_value,
        notes = notes_value
      where id = existing.id;

      change_count := change_count + 1;
    end if;
  end loop;

  delete from public.event_equipment_requirements
  where event_id = p_event_id
    and id <> all (kept_ids);

  get diagnostics removed_count = row_count;

  return change_count + removed_count;
end;
$$;

revoke all on function public.save_event_equipment_requirements(uuid, jsonb) from public;
revoke all on function public.save_event_equipment_requirements(uuid, jsonb) from anon;
grant execute on function public.save_event_equipment_requirements(uuid, jsonb) to authenticated;
grant execute on function public.save_event_equipment_requirements(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- save_event_draft, recreated in full from
-- 202609150004_clarification_requirement_buckets.sql. Only two things
-- change — diff against that file when reviewing:
--   1. equipment is written through save_event_equipment_requirements
--      instead of delete-then-reinsert;
--   2. the clarification lock for equipment no longer compares free-text
--      lists up front: it uses the helper's change count instead, so the
--      check stays correct for catalogue items, periods and kept legacy rows.
-- ---------------------------------------------------------------------------
create or replace function public.save_event_draft(
  draft jsonb,
  target_event_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_event_id uuid;
  title_value text := trim(coalesce(draft ->> 'title', ''));
  purpose_value text := nullif(trim(draft ->> 'purpose'), '');
  description_value text := nullif(trim(draft ->> 'description'), '');
  event_type_value text := nullif(trim(draft ->> 'eventType'), '');
  attendance_text text := nullif(trim(draft ->> 'expectedAttendance'), '');
  minimum_capacity_text text := nullif(trim(draft #>> '{venue,minimumCapacity}'), '');
  registration_capacity_text text := nullif(trim(draft #>> '{registration,capacity}'), '');
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  registration_opens_value timestamptz;
  registration_closes_value timestamptz;
  acknowledged_value boolean := coalesce((draft ->> 'requirementsAcknowledged')::boolean, false);
  affected_rows integer;
  active_permitted_fields text[];
  locked_field_labels jsonb := '{
    "title": "Event name",
    "purpose": "Purpose",
    "description": "Description",
    "eventType": "Event type",
    "expectedAttendance": "Expected attendance",
    "startsAt": "Start time",
    "endsAt": "End time",
    "venue": "Venue requirements",
    "equipment": "Equipment and technical needs",
    "registration": "Registration needs"
  }'::jsonb;
  current_event public.events;
  current_venue public.event_venue_requirements;
  current_registration public.event_registration_requirements;
  new_facilities text[];
  current_facilities text[];
  venue_changed boolean;
  equipment_locked boolean := false;
  equipment_change_count integer;
  registration_changed boolean;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'event_organiser'::public.user_role
  then
    raise exception 'Only Event Organisers can save event drafts'
      using errcode = 'insufficient_privilege';
  end if;

  if char_length(title_value) < 3 or char_length(title_value) > 160 then
    raise exception 'Event name must contain between 3 and 160 characters'
      using errcode = 'check_violation';
  end if;

  if attendance_text is not null and attendance_text !~ '^[1-9][0-9]*$' then
    raise exception 'Expected attendance must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if minimum_capacity_text is not null and minimum_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Minimum capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if registration_capacity_text is not null and registration_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Registration capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  starts_at_value := nullif(draft ->> 'startsAt', '')::timestamptz;
  ends_at_value := nullif(draft ->> 'endsAt', '')::timestamptz;
  registration_opens_value := nullif(draft #>> '{registration,opensAt}', '')::timestamptz;
  registration_closes_value := nullif(draft #>> '{registration,closesAt}', '')::timestamptz;

  if starts_at_value is not null and ends_at_value is not null and ends_at_value <= starts_at_value then
    raise exception 'End time must be after the start time'
      using errcode = 'check_violation';
  end if;

  if registration_opens_value is not null
    and registration_closes_value is not null
    and registration_closes_value <= registration_opens_value
  then
    raise exception 'Registration closing time must be after its opening time'
      using errcode = 'check_violation';
  end if;

  if target_event_id is null then
    saved_event_id := gen_random_uuid();

    insert into public.events (
      id,
      organiser_id,
      title,
      purpose,
      description,
      event_type,
      expected_attendance,
      starts_at,
      ends_at,
      requirements_acknowledged,
      status
    )
    values (
      saved_event_id,
      auth.uid(),
      title_value,
      purpose_value,
      description_value,
      event_type_value,
      attendance_text::integer,
      starts_at_value,
      ends_at_value,
      acknowledged_value,
      'draft'
    );
  else
    -- AC03. While a clarification is open or answered, only its permitted
    -- buckets may change. Comparisons are against what is actually stored
    -- today, not against the previous request payload, so an organiser who
    -- resubmits a bucket unchanged never trips this check.
    select c.permitted_fields into active_permitted_fields
    from public.clarifications c
    where c.event_id = target_event_id and c.status in ('open', 'answered')
    order by c.requested_at desc
    limit 1;

    if found then
      select * into current_event from public.events where id = target_event_id;
      select * into current_venue from public.event_venue_requirements where event_id = target_event_id;
      select * into current_registration from public.event_registration_requirements where event_id = target_event_id;

      if 'title' <> all (active_permitted_fields) and title_value is distinct from current_event.title then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'title'
          using errcode = 'check_violation';
      end if;

      if 'purpose' <> all (active_permitted_fields) and purpose_value is distinct from current_event.purpose then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'purpose'
          using errcode = 'check_violation';
      end if;

      if 'description' <> all (active_permitted_fields) and description_value is distinct from current_event.description then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'description'
          using errcode = 'check_violation';
      end if;

      if 'eventType' <> all (active_permitted_fields) and event_type_value is distinct from current_event.event_type then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'eventType'
          using errcode = 'check_violation';
      end if;

      if 'expectedAttendance' <> all (active_permitted_fields)
        and attendance_text::integer is distinct from current_event.expected_attendance
      then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'expectedAttendance'
          using errcode = 'check_violation';
      end if;

      if 'startsAt' <> all (active_permitted_fields) and starts_at_value is distinct from current_event.starts_at then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'startsAt'
          using errcode = 'check_violation';
      end if;

      if 'endsAt' <> all (active_permitted_fields) and ends_at_value is distinct from current_event.ends_at then
        raise exception '% is locked while a clarification is open', locked_field_labels ->> 'endsAt'
          using errcode = 'check_violation';
      end if;

      -- Venue, equipment and registration are now three independent locks.
      -- The legacy combined 'requirements' key (rounds requested before this
      -- split) still unlocks all three, so an in-flight round keeps working
      -- exactly as it did.
      if 'venue' <> all (active_permitted_fields) and 'requirements' <> all (active_permitted_fields) then
        new_facilities := (
          select coalesce(array_agg(trim(value) order by trim(value)), array[]::text[])
          from jsonb_array_elements_text(coalesce(draft #> '{venue,facilities}', '[]'::jsonb)) as t(value)
          where trim(value) <> ''
        );
        current_facilities := (
          select coalesce(array_agg(facility_name order by facility_name), array[]::text[])
          from public.event_required_facilities
          where event_id = target_event_id
        );

        venue_changed :=
          nullif(trim(draft #>> '{venue,preferredLocation}'), '') is distinct from current_venue.preferred_location
          or minimum_capacity_text::integer is distinct from current_venue.minimum_capacity
          or nullif(trim(draft #>> '{venue,accessibilityNotes}'), '') is distinct from current_venue.accessibility_notes
          or nullif(trim(draft #>> '{venue,layoutNotes}'), '') is distinct from current_venue.layout_notes
          or new_facilities is distinct from current_facilities;

        if venue_changed then
          raise exception '% is locked while a clarification is open', locked_field_labels ->> 'venue'
            using errcode = 'check_violation';
        end if;
      end if;

      -- Enforced after the write below, from the helper's change count: a
      -- locked equipment section resubmitted unchanged writes nothing.
      equipment_locked :=
        'equipment' <> all (active_permitted_fields) and 'requirements' <> all (active_permitted_fields);

      if 'registration' <> all (active_permitted_fields) and 'requirements' <> all (active_permitted_fields) then
        registration_changed :=
          coalesce((draft #>> '{registration,required}')::boolean, false) is distinct from coalesce(current_registration.registration_required, false)
          or registration_opens_value is distinct from current_registration.registration_opens_at
          or registration_closes_value is distinct from current_registration.registration_closes_at
          or registration_capacity_text::integer is distinct from current_registration.attendee_capacity
          or coalesce((draft #>> '{registration,waitlistEnabled}')::boolean, false) is distinct from coalesce(current_registration.waitlist_enabled, false);

        if registration_changed then
          raise exception '% is locked while a clarification is open', locked_field_labels ->> 'registration'
            using errcode = 'check_violation';
        end if;
      end if;
    end if;

    update public.events
    set
      title = title_value,
      purpose = purpose_value,
      description = description_value,
      event_type = event_type_value,
      expected_attendance = attendance_text::integer,
      starts_at = starts_at_value,
      ends_at = ends_at_value,
      requirements_acknowledged = acknowledged_value
    where id = target_event_id
      and organiser_id = auth.uid()
      and status in ('draft', 'requested')
    ;

    get diagnostics affected_rows = row_count;

    if affected_rows = 0 then
      raise exception 'Draft not found or cannot be edited'
        using errcode = 'insufficient_privilege';
    end if;

    saved_event_id := target_event_id;
  end if;

  insert into public.event_venue_requirements (
    event_id,
    preferred_location,
    minimum_capacity,
    accessibility_notes,
    layout_notes
  )
  values (
    saved_event_id,
    nullif(trim(draft #>> '{venue,preferredLocation}'), ''),
    minimum_capacity_text::integer,
    nullif(trim(draft #>> '{venue,accessibilityNotes}'), ''),
    nullif(trim(draft #>> '{venue,layoutNotes}'), '')
  )
  on conflict (event_id) do update
  set
    preferred_location = excluded.preferred_location,
    minimum_capacity = excluded.minimum_capacity,
    accessibility_notes = excluded.accessibility_notes,
    layout_notes = excluded.layout_notes;

  delete from public.event_required_facilities where event_id = saved_event_id;

  if coalesce(jsonb_typeof(draft #> '{venue,facilities}'), 'null') not in ('array', 'null') then
    raise exception 'Facilities must be a list'
      using errcode = 'check_violation';
  end if;

  insert into public.event_required_facilities (event_id, facility_name)
  select saved_event_id, trim(value)
  from jsonb_array_elements_text(coalesce(draft #> '{venue,facilities}', '[]'::jsonb))
  where trim(value) <> '';

  equipment_change_count := public.save_event_equipment_requirements(saved_event_id, draft -> 'equipment');

  -- Raising here rolls back the equipment write above (and its history).
  if equipment_locked and equipment_change_count > 0 then
    raise exception '% is locked while a clarification is open', locked_field_labels ->> 'equipment'
      using errcode = 'check_violation';
  end if;

  insert into public.event_registration_requirements (
    event_id,
    registration_required,
    registration_opens_at,
    registration_closes_at,
    attendee_capacity,
    waitlist_enabled
  )
  values (
    saved_event_id,
    coalesce((draft #>> '{registration,required}')::boolean, false),
    registration_opens_value,
    registration_closes_value,
    registration_capacity_text::integer,
    coalesce((draft #>> '{registration,waitlistEnabled}')::boolean, false)
  )
  on conflict (event_id) do update
  set
    registration_required = excluded.registration_required,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    attendee_capacity = excluded.attendee_capacity,
    waitlist_enabled = excluded.waitlist_enabled;

  return saved_event_id;
end;
$$;

revoke all on function public.save_event_draft(jsonb, uuid) from public;
revoke all on function public.save_event_draft(jsonb, uuid) from anon;
grant execute on function public.save_event_draft(jsonb, uuid) to authenticated;
grant execute on function public.save_event_draft(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- update_event_as_coordinator, recreated in full from
-- 202609250001_remove_administrator_role.sql. Only the equipment write
-- changes (now save_event_equipment_requirements) — diff against that file
-- when reviewing. Its assigned-coordinator and Planning checks still run
-- first, which is what AC11/AC12 rely on.
-- ---------------------------------------------------------------------------
create or replace function public.update_event_as_coordinator(p_event_id uuid, updates jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role public.user_role;
  event_row public.events;
  current_registration public.event_registration_requirements;
  title_value text := trim(coalesce(updates ->> 'title', ''));
  purpose_value text := nullif(trim(updates ->> 'purpose'), '');
  description_value text := nullif(trim(updates ->> 'description'), '');
  event_type_value text := nullif(trim(updates ->> 'eventType'), '');
  attendance_text text := nullif(trim(updates ->> 'expectedAttendance'), '');
  minimum_capacity_text text := nullif(trim(updates #>> '{venue,minimumCapacity}'), '');
  registration_capacity_text text := nullif(trim(updates #>> '{registration,capacity}'), '');
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  registration_opens_value timestamptz;
  registration_closes_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to update this event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the assigned coordinator can update this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can be updated this way'
      using errcode = 'check_violation';
  end if;

  if char_length(title_value) < 3 or char_length(title_value) > 160 then
    raise exception 'Event name must contain between 3 and 160 characters'
      using errcode = 'check_violation';
  end if;

  if attendance_text is not null and attendance_text !~ '^[1-9][0-9]*$' then
    raise exception 'Expected attendance must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if minimum_capacity_text is not null and minimum_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Minimum capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if registration_capacity_text is not null and registration_capacity_text !~ '^[1-9][0-9]*$' then
    raise exception 'Registration capacity must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  starts_at_value := nullif(updates ->> 'startsAt', '')::timestamptz;
  ends_at_value := nullif(updates ->> 'endsAt', '')::timestamptz;
  registration_opens_value := nullif(updates #>> '{registration,opensAt}', '')::timestamptz;
  registration_closes_value := nullif(updates #>> '{registration,closesAt}', '')::timestamptz;

  if starts_at_value is not null and ends_at_value is not null and ends_at_value <= starts_at_value then
    raise exception 'End time must be after the start time'
      using errcode = 'check_violation';
  end if;

  if registration_opens_value is not null
    and registration_closes_value is not null
    and registration_closes_value <= registration_opens_value
  then
    raise exception 'Registration closing time must be after its opening time'
      using errcode = 'check_violation';
  end if;

  -- Overview + schedule: locked once Planning. Compared against event_row,
  -- already loaded above for the authorisation check.
  if title_value is distinct from event_row.title then
    raise exception 'Event name is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if purpose_value is distinct from event_row.purpose then
    raise exception 'Purpose is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if description_value is distinct from event_row.description then
    raise exception 'Description is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if event_type_value is distinct from event_row.event_type then
    raise exception 'Event category is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if attendance_text::integer is distinct from event_row.expected_attendance then
    raise exception 'Expected attendance is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if starts_at_value is distinct from event_row.starts_at then
    raise exception 'Start time is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  if ends_at_value is distinct from event_row.ends_at then
    raise exception 'End time is locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  -- Registration: locked once Planning, as a whole section.
  select * into current_registration
  from public.event_registration_requirements
  where event_id = p_event_id;

  if (
    coalesce((updates #>> '{registration,required}')::boolean, false)
      is distinct from coalesce(current_registration.registration_required, false)
    or registration_opens_value is distinct from current_registration.registration_opens_at
    or registration_closes_value is distinct from current_registration.registration_closes_at
    or registration_capacity_text::integer is distinct from current_registration.attendee_capacity
    or coalesce((updates #>> '{registration,waitlistEnabled}')::boolean, false)
      is distinct from coalesce(current_registration.waitlist_enabled, false)
  ) then
    raise exception 'Registration details are locked once the event reaches Planning'
      using errcode = 'check_violation';
  end if;

  -- Every write below now either rewrites an unchanged (already validated
  -- above) locked field, or a genuinely editable one (venue, facilities,
  -- equipment) — PB-07's triggers log only the latter kind of change, same
  -- as before this migration.
  update public.events
  set
    title = title_value,
    purpose = purpose_value,
    description = description_value,
    event_type = event_type_value,
    expected_attendance = attendance_text::integer,
    starts_at = starts_at_value,
    ends_at = ends_at_value
  where id = p_event_id;

  insert into public.event_venue_requirements (
    event_id,
    preferred_location,
    minimum_capacity,
    accessibility_notes,
    layout_notes
  )
  values (
    p_event_id,
    nullif(trim(updates #>> '{venue,preferredLocation}'), ''),
    minimum_capacity_text::integer,
    nullif(trim(updates #>> '{venue,accessibilityNotes}'), ''),
    nullif(trim(updates #>> '{venue,layoutNotes}'), '')
  )
  on conflict (event_id) do update
  set
    preferred_location = excluded.preferred_location,
    minimum_capacity = excluded.minimum_capacity,
    accessibility_notes = excluded.accessibility_notes,
    layout_notes = excluded.layout_notes;

  delete from public.event_required_facilities where event_id = p_event_id;

  if coalesce(jsonb_typeof(updates #> '{venue,facilities}'), 'null') not in ('array', 'null') then
    raise exception 'Facilities must be a list'
      using errcode = 'check_violation';
  end if;

  insert into public.event_required_facilities (event_id, facility_name)
  select p_event_id, trim(value)
  from jsonb_array_elements_text(coalesce(updates #> '{venue,facilities}', '[]'::jsonb))
  where trim(value) <> '';

  perform public.save_event_equipment_requirements(p_event_id, updates -> 'equipment');

  -- Written back unchanged (already validated above), same as
  -- events.title/purpose/etc. — kept as an upsert rather than skipped
  -- entirely so a first-ever registration row (event_id not yet present)
  -- still gets created if somehow missing.
  insert into public.event_registration_requirements (
    event_id,
    registration_required,
    registration_opens_at,
    registration_closes_at,
    attendee_capacity,
    waitlist_enabled
  )
  values (
    p_event_id,
    coalesce((updates #>> '{registration,required}')::boolean, false),
    registration_opens_value,
    registration_closes_value,
    registration_capacity_text::integer,
    coalesce((updates #>> '{registration,waitlistEnabled}')::boolean, false)
  )
  on conflict (event_id) do update
  set
    registration_required = excluded.registration_required,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    attendee_capacity = excluded.attendee_capacity,
    waitlist_enabled = excluded.waitlist_enabled;

  return p_event_id;
end;
$function$;
