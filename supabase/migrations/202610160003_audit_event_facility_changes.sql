-- SPM-10 AC04: facility changes are audited like every other venue requirement.
--
-- event_field_changes already records each venue field through
-- record_event_venue_change, but required facilities live in their own table
-- and were never logged. Both save functions also rewrote that table on every
-- save (delete everything, re-insert the list), so a row trigger alone would
-- have logged a removal and an addition for every unchanged facility on every
-- save (breaking AC06).
--
-- This migration:
--   1. allows 'venue.facilities' in event_field_changes;
--   2. adds record_event_facility_change, one entry per facility added
--      (previous null) or removed (new null), with actor and time. An
--      event's first save is not logged (no other field logs on creation):
--      save_event_draft flags the event it is creating in the
--      transaction-local setting spm.creating_event_id for that one write;
--   3. makes save_event_draft and update_event_as_coordinator write only the
--      facilities that actually changed. Their definitions are otherwise
--      identical to 202610050004 / 202610160001's current versions — diff the
--      facility block when reviewing.

alter table public.event_field_changes
  drop constraint event_field_changes_field_name_check;
alter table public.event_field_changes
  add constraint event_field_changes_field_name_check
  check (field_name = any (array[
    'title', 'purpose', 'description', 'eventType', 'expectedAttendance',
    'startsAt', 'endsAt',
    'venue.preferredLocation', 'venue.minimumCapacity', 'venue.accessibilityNotes',
    'venue.layoutNotes', 'venue.facilities',
    'registration.required', 'registration.opensAt', 'registration.closesAt',
    'registration.capacity', 'registration.waitlistEnabled'
  ]));

create or replace function public.record_event_facility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid := coalesce(new.event_id, old.event_id);
begin
  -- The event itself is being deleted (a draft, cascading here): nothing to log.
  if not exists (select 1 from public.events where id = target_event_id) then
    return null;
  end if;

  -- An event's first save is not a change, the same as every other field:
  -- save_event_draft flags the event it is creating for that one write.
  if current_setting('spm.creating_event_id', true) = target_event_id::text then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (target_event_id, 'venue.facilities', null, new.facility_name, auth.uid());
  else
    insert into public.event_field_changes (event_id, field_name, previous_value, new_value, changed_by)
    values (target_event_id, 'venue.facilities', old.facility_name, null, auth.uid());
  end if;

  return null;
end;
$$;

create trigger event_required_facilities_record_changes
after insert or delete on public.event_required_facilities
for each row execute function public.record_event_facility_change();

CREATE OR REPLACE FUNCTION public.save_event_draft(draft jsonb, target_event_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  if target_event_id is null then
    perform set_config('spm.creating_event_id', saved_event_id::text, true);
  end if;

  if coalesce(jsonb_typeof(draft #> '{venue,facilities}'), 'null') not in ('array', 'null') then
    raise exception 'Facilities must be a list'
      using errcode = 'check_violation';
  end if;

  -- Only the facilities actually removed or added are written, so an
  -- unchanged save touches nothing and record_event_facility_change logs
  -- exactly what changed (202610160003).
  delete from public.event_required_facilities
  where event_id = saved_event_id
    and facility_name not in (
      select trim(value)
      from jsonb_array_elements_text(coalesce(draft #> '{venue,facilities}', '[]'::jsonb))
    );

  insert into public.event_required_facilities (event_id, facility_name)
  select distinct saved_event_id, trim(value)
  from jsonb_array_elements_text(coalesce(draft #> '{venue,facilities}', '[]'::jsonb))
  where trim(value) <> ''
  on conflict (event_id, facility_name) do nothing;

  perform set_config('spm.creating_event_id', '', true);

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
$function$;

CREATE OR REPLACE FUNCTION public.update_event_as_coordinator(p_event_id uuid, updates jsonb)
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

  if coalesce(jsonb_typeof(updates #> '{venue,facilities}'), 'null') not in ('array', 'null') then
    raise exception 'Facilities must be a list'
      using errcode = 'check_violation';
  end if;

  -- Only the facilities actually removed or added are written, so an
  -- unchanged save touches nothing and record_event_facility_change logs
  -- exactly what changed (202610160003).
  delete from public.event_required_facilities
  where event_id = p_event_id
    and facility_name not in (
      select trim(value)
      from jsonb_array_elements_text(coalesce(updates #> '{venue,facilities}', '[]'::jsonb))
    );

  insert into public.event_required_facilities (event_id, facility_name)
  select distinct p_event_id, trim(value)
  from jsonb_array_elements_text(coalesce(updates #> '{venue,facilities}', '[]'::jsonb))
  where trim(value) <> ''
  on conflict (event_id, facility_name) do nothing;

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
