-- PB-03 AC07: "Given a Requested event has not been approved, when its organiser
-- edits permitted information, then the changes, actor, and time are recorded
-- for review."
--
-- PB-02's save_event_draft is re-created here with exactly two changes, because
-- PostgreSQL replaces a function body wholesale rather than patching it:
--   1. The status gate widens from 'draft' to ('draft', 'requested') so an
--      organiser can still correct a submitted request before approval.
--      submitted_at and submitted_by are deliberately left untouched by an edit,
--      so the original submission time survives. events.updated_at is maintained
--      by the existing events_set_updated_at trigger, which is what records the
--      time of the edit. PB-07 owns the field-level previous/new value history.
--   2. requirements_acknowledged is persisted from the draft payload (AC02).
--
-- Everything else is PB-02's logic unchanged — diff against
-- 202609120001_pb02_event_drafts.sql when reviewing.

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
      nullif(trim(draft ->> 'purpose'), ''),
      nullif(trim(draft ->> 'description'), ''),
      nullif(trim(draft ->> 'eventType'), ''),
      attendance_text::integer,
      starts_at_value,
      ends_at_value,
      acknowledged_value,
      'draft'
    );
  else
    update public.events
    set
      title = title_value,
      purpose = nullif(trim(draft ->> 'purpose'), ''),
      description = nullif(trim(draft ->> 'description'), ''),
      event_type = nullif(trim(draft ->> 'eventType'), ''),
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
