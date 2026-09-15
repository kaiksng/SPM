-- Lock overview, schedule, and registration fields once an event reaches
-- Planning — for both the organiser and the coordinator.
--
-- The organiser side needs nothing new: save_event_draft already refuses any
-- write once an event leaves draft/requested, so a Planning event is already
-- fully closed to the organiser (see 202609150007's header for the audit of
-- exactly which policies already covered this).
--
-- The coordinator side does need a change: update_event_as_coordinator
-- (202609150006) currently lets the coordinator edit every field. This
-- narrows it — title, purpose, description, event type, expected
-- attendance, start/end time, and every registration field become locked
-- once the event is Planning; only venue requirements and equipment stay
-- editable by the coordinator at that stage. Mirrors the same
-- compare-against-what-is-stored lock pattern save_event_draft already uses
-- for a clarification's permitted_fields (202609140003) — a resubmitted,
-- unchanged locked field is fine; an actual change to one is rejected.
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
$$;

revoke all on function public.update_event_as_coordinator(uuid, jsonb) from public;
revoke all on function public.update_event_as_coordinator(uuid, jsonb) from anon;
grant execute on function public.update_event_as_coordinator(uuid, jsonb) to authenticated;
grant execute on function public.update_event_as_coordinator(uuid, jsonb) to service_role;
