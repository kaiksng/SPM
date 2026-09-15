-- Split the single "requirements" clarification bucket into three:
-- "venue", "equipment", "registration".
--
-- The combined bucket bundled three unrelated sections behind one checkbox:
-- a coordinator who only needed the organiser to fix the registration answer
-- had no way to grant that without also unlocking venue and equipment
-- editing. This narrows the grant to exactly what the coordinator actually
-- asks about, matching "I should only be able to edit what is mandated by
-- the event coordinator."
--
-- Backward compatible on purpose: existing clarification rows already store
-- `permitted_fields = ['requirements']` (the CHECK constraint keeps
-- accepting it, and both functions below still treat it as unlocking all
-- three sections) — old open/answered rounds keep working exactly as they
-- did. Only new clarification requests lose the ability to create a
-- "requirements" row; request_event_clarification's own allow-list now
-- offers only the three granular keys.

alter table public.clarifications drop constraint if exists clarifications_permitted_fields_known;
alter table public.clarifications add constraint clarifications_permitted_fields_known check (
  permitted_fields <@ array[
    'title', 'purpose', 'description', 'eventType',
    'expectedAttendance', 'startsAt', 'endsAt',
    'venue', 'equipment', 'registration',
    'requirements'
  ]::text[]
);

create or replace function public.request_event_clarification(
  p_event_id uuid,
  p_question text,
  p_permitted_fields text[] default '{}',
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.user_role;
  event_row public.events;
  question_value text := trim(coalesce(p_question, ''));
  permitted_fields_value text[] := coalesce(p_permitted_fields, '{}');
  new_id uuid;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot request clarification on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to request clarification'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role not in ('event_coordinator'::public.user_role, 'administrator'::public.user_role) then
    raise exception 'Only Event Coordinators can request clarification'
      using errcode = 'insufficient_privilege';
  end if;

  if char_length(question_value) = 0 then
    raise exception 'Describe what information is needed'
      using errcode = 'check_violation';
  end if;

  if char_length(question_value) > 2000 then
    raise exception 'Limit the clarification question to 2000 characters'
      using errcode = 'check_violation';
  end if;

  -- 'requirements' is deliberately absent here: new requests must name one of
  -- the three granular buckets. It stays valid on the table's own CHECK
  -- constraint purely so already-stored rows are never invalidated.
  if not (permitted_fields_value <@ array[
    'title', 'purpose', 'description', 'eventType',
    'expectedAttendance', 'startsAt', 'endsAt',
    'venue', 'equipment', 'registration'
  ]::text[]) then
    raise exception 'One or more permitted fields are not recognised'
      using errcode = 'check_violation';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'requested' then
    raise exception 'Clarification can only be requested while the event is Requested'
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id
    and actor_role <> 'administrator'::public.user_role
  then
    raise exception 'Only the assigned coordinator can request clarification for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status in ('open', 'answered')
  ) then
    raise exception 'A clarification is already open for this event'
      using errcode = 'check_violation';
  end if;

  insert into public.clarifications (event_id, requested_by, question, permitted_fields, status, requested_at)
  values (p_event_id, actor_id, question_value, permitted_fields_value, 'open', now())
  returning id into new_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'clarification'::public.notification_type,
    'Clarification requested',
    'Your coordinator needs more information on "' || event_row.title || '": ' || question_value
  );

  return jsonb_build_object('id', new_id, 'requestedAt', now());
end;
$$;

revoke all on function public.request_event_clarification(uuid, text, text[], uuid) from public;
revoke all on function public.request_event_clarification(uuid, text, text[], uuid) from anon;
grant execute on function public.request_event_clarification(uuid, text, text[], uuid) to authenticated;
grant execute on function public.request_event_clarification(uuid, text, text[], uuid) to service_role;

-- save_event_draft is recreated in full again (Postgres replaces a function
-- body wholesale). Only the AC03 lock-check section changes: one
-- "requirements_changed" check becomes three independent ones (venue,
-- equipment, registration), each unlocked by its own granular key or by the
-- legacy combined "requirements" key. Everything else is unchanged from
-- 202609140003_event_clarifications.sql — diff against that file when
-- reviewing.
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
  item jsonb;
  equipment_name_value text;
  equipment_quantity_text text;
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
  new_equipment jsonb;
  current_equipment jsonb;
  venue_changed boolean;
  equipment_changed boolean;
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

      if 'equipment' <> all (active_permitted_fields) and 'requirements' <> all (active_permitted_fields) then
        new_equipment := (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'equipmentName', trim(coalesce(elem ->> 'equipmentName', '')),
              'quantity', nullif(trim(elem ->> 'quantity'), ''),
              'notes', nullif(trim(elem ->> 'notes'), '')
            )
            order by trim(coalesce(elem ->> 'equipmentName', '')), nullif(trim(elem ->> 'quantity'), '')
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(draft -> 'equipment', '[]'::jsonb)) as elem
        );
        current_equipment := (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'equipmentName', equipment_name,
              'quantity', quantity::text,
              'notes', notes
            )
            order by equipment_name, quantity::text
          ), '[]'::jsonb)
          from public.event_equipment_requirements
          where event_id = target_event_id
        );

        equipment_changed := new_equipment is distinct from current_equipment;

        if equipment_changed then
          raise exception '% is locked while a clarification is open', locked_field_labels ->> 'equipment'
            using errcode = 'check_violation';
        end if;
      end if;

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

  delete from public.event_equipment_requirements where event_id = saved_event_id;

  if coalesce(jsonb_typeof(draft -> 'equipment'), 'null') not in ('array', 'null') then
    raise exception 'Equipment requirements must be a list'
      using errcode = 'check_violation';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(draft -> 'equipment', '[]'::jsonb))
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
      saved_event_id,
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
