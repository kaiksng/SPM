-- Update Event Information During Planning.
--
-- "As an Event Coordinator, I want to update event information during
-- planning, so that changes are captured accurately and all teams stay
-- aligned on the latest requirements."
--
-- AC01 A field update on a Planning event records the previous value, new
--      value, actor, and timestamp.
-- AC02 Multiple fields changed in one save are logged as separate audit
--      entries.
-- AC03 A save with no actual changes creates no audit log entry.
--
-- All three ACs are already satisfied by PB-07's existing triggers
-- (202609150003_pb07_event_field_history.sql) — record_event_field_change,
-- record_event_venue_change and record_event_registration_change already
-- log one row per changed scalar column, compare with `is distinct from` (so
-- an unchanged resubmit logs nothing), and stamp changed_by from auth.uid().
-- Those triggers do not care who performed the UPDATE; they only needed a
-- write path for a coordinator to actually reach them, which is the only
-- thing this migration adds.
--
-- Scope note: facilities and equipment go through the same delete-then-
-- reinsert approach save_event_draft already uses, for the same reason
-- PB-07 excludes them from field-level audit (202609150003) — there is no
-- stable per-item identity to diff against, so logging every insert/delete
-- here would just be churn on every save, not history.
create or replace function public.update_event_as_coordinator(
  p_event_id uuid,
  updates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  event_row public.events;
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
  item jsonb;
  equipment_name_value text;
  equipment_quantity_text text;
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

  if event_row.assigned_coordinator_id is distinct from auth.uid()
    and actor_role <> 'administrator'::public.user_role
  then
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

  -- AC01/AC02/AC03: a plain column-list UPDATE fires
  -- events_record_field_changes regardless of who ran it, logging one row
  -- per column that actually changed and nothing when every value matches
  -- what is already stored.
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

  delete from public.event_equipment_requirements where event_id = p_event_id;

  if coalesce(jsonb_typeof(updates -> 'equipment'), 'null') not in ('array', 'null') then
    raise exception 'Equipment requirements must be a list'
      using errcode = 'check_violation';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(updates -> 'equipment', '[]'::jsonb))
  loop
    equipment_name_value := trim(coalesce(item ->> 'equipmentName', ''));
    equipment_quantity_text := nullif(trim(item ->> 'quantity'), '');

    if equipment_name_value = '' then
      raise exception 'Equipment name is required for each equipment item'
        using errcode = 'check_violation';
    end if;

    if equipment_quantity_text is null or equipment_quantity_text !~ '^[1-9][0-9]*$' then
      raise exception 'Equipment quantity must be a positive whole number'
        using errcode = 'check_violation';
    end if;

    insert into public.event_equipment_requirements (
      event_id,
      equipment_name,
      quantity,
      notes
    )
    values (
      p_event_id,
      equipment_name_value,
      equipment_quantity_text::integer,
      nullif(trim(item ->> 'notes'), '')
    );
  end loop;

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
$$;

revoke all on function public.update_event_as_coordinator(uuid, jsonb) from public;
revoke all on function public.update_event_as_coordinator(uuid, jsonb) from anon;
grant execute on function public.update_event_as_coordinator(uuid, jsonb) to authenticated;
grant execute on function public.update_event_as_coordinator(uuid, jsonb) to service_role;
