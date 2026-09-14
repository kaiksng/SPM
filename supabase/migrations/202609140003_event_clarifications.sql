-- Request and Resolve Event Clarification.
--
-- AC01 A clarification request captures the required information, the
--      requesting coordinator, and the request timestamp.
-- AC02 While a clarification request is open, the event's review state shows
--      Awaiting Organiser, and its lifecycle status remains Requested.
-- AC03 The organiser can respond to, or update, only the fields designated as
--      permitted; other fields remain locked while clarification is open.
-- AC04 Submitting a response records the response content, timestamp, and
--      actor, and triggers a notification to the requesting coordinator.
-- AC05 Approval or rejection of the event is disabled while any clarification
--      request is unresolved.
-- AC06 A coordinator can explicitly close/resolve a clarification request,
--      after which approval or rejection becomes available again.
-- AC07 All clarification rounds (requests, responses, actors, timestamps) are
--      viewable in sequence in the event's history.
-- AC08 Only an authorised coordinator can initiate a clarification request.
--
-- AC02 is why this migration never touches events.status: the initial schema
-- anticipated clarification as a status value ('clarification_requested'),
-- but nothing has ever transitioned an event into it, and this story's own
-- acceptance criteria requires status to stay 'requested' throughout. Review
-- state is computed from this table's rows instead of stored on the event.

alter table public.clarifications
  add column permitted_fields text[] not null default '{}',
  add column responded_by uuid references public.profiles (id),
  add column resolved_by uuid references public.profiles (id),
  add constraint clarifications_permitted_fields_known check (
    permitted_fields <@ array[
      'title', 'purpose', 'description', 'eventType',
      'expectedAttendance', 'startsAt', 'endsAt', 'requirements'
    ]::text[]
  );

create index clarifications_event_status_idx on public.clarifications (event_id, status);

-- AC05, enforced ahead of the not-yet-built approve/reject feature (the next
-- vertical slice per docs/architecture/README.md) the same way PB-04 made its
-- own guarantees real: a trigger, not an omitted button. Whatever RPC later
-- flips status to approved/rejected inherits this guard automatically.
create or replace function public.event_has_unresolved_clarification(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status in ('open', 'answered')
  );
$$;

revoke all on function public.event_has_unresolved_clarification(uuid) from public;
grant execute on function public.event_has_unresolved_clarification(uuid) to authenticated;
grant execute on function public.event_has_unresolved_clarification(uuid) to service_role;

create or replace function public.enforce_event_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and not public.event_status_transition_allowed(old.status, new.status)
  then
    raise exception 'Invalid event status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status in ('approved', 'rejected')
    and old.status is distinct from new.status
    and public.event_has_unresolved_clarification(new.id)
  then
    raise exception 'This event has an unresolved clarification and cannot be approved or rejected until it is closed'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- AC08. can_view_event() deliberately lets any Event Coordinator see any
-- event (broad, for visibility); requesting clarification is narrower and
-- must be the coordinator actually accountable for this event.
--
-- AC01, AC04. Notifications have no insert policy for regular users (see
-- docs/architecture/adr/0003-submission-through-backend.md), so this and the
-- two functions below are security definer and are called through
-- apps/backend, exactly like submit_event_request/assign_event_coordinator.
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

  if not (permitted_fields_value <@ array[
    'title', 'purpose', 'description', 'eventType',
    'expectedAttendance', 'startsAt', 'endsAt', 'requirements'
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

-- AC04. Field edits are not passed through this function — they go through
-- save_event_draft's own lock check below, kept decoupled from the response
-- text the same way PB-03 keeps organiser edits decoupled from a field-level
-- diff log (explicitly deferred to PB-07; see 202609130003's header comment).
create or replace function public.respond_event_clarification(
  p_clarification_id uuid,
  p_response text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  response_value text := trim(coalesce(p_response, ''));
  clarification_row public.clarifications;
  event_row public.events;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot respond to a clarification on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to respond to a clarification'
      using errcode = 'insufficient_privilege';
  end if;

  if char_length(response_value) = 0 then
    raise exception 'Enter a response before submitting'
      using errcode = 'check_violation';
  end if;

  if char_length(response_value) > 5000 then
    raise exception 'Limit the response to 5000 characters'
      using errcode = 'check_violation';
  end if;

  select c.* into clarification_row
  from public.clarifications c
  where c.id = p_clarification_id
  for update;

  if not found then
    raise exception 'Clarification not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = clarification_row.event_id;

  if event_row.organiser_id is distinct from actor_id then
    raise exception 'Only the event organiser can respond to this clarification'
      using errcode = 'insufficient_privilege';
  end if;

  if clarification_row.status <> 'open' then
    raise exception 'This clarification is not awaiting a response'
      using errcode = 'check_violation';
  end if;

  update public.clarifications
  set response = response_value,
      responded_at = now(),
      responded_by = actor_id,
      status = 'answered'
  where id = p_clarification_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    clarification_row.requested_by,
    clarification_row.event_id,
    'clarification'::public.notification_type,
    'Clarification response received',
    'The organiser responded on "' || event_row.title || '": ' || response_value
  );

  return jsonb_build_object('id', p_clarification_id, 'respondedAt', now());
end;
$$;

revoke all on function public.respond_event_clarification(uuid, text, uuid) from public;
revoke all on function public.respond_event_clarification(uuid, text, uuid) from anon;
grant execute on function public.respond_event_clarification(uuid, text, uuid) to authenticated;
grant execute on function public.respond_event_clarification(uuid, text, uuid) to service_role;

-- AC06. The coordinator may close a clarification from either 'open' or
-- 'answered' — the scenario says "explicitly closes," not "closes only after
-- an answer," so a coordinator can decide the question is moot without
-- waiting.
create or replace function public.resolve_event_clarification(
  p_clarification_id uuid,
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
  clarification_row public.clarifications;
  event_row public.events;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot resolve a clarification on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to resolve a clarification'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  select c.* into clarification_row
  from public.clarifications c
  where c.id = p_clarification_id
  for update;

  if not found then
    raise exception 'Clarification not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = clarification_row.event_id;

  if event_row.assigned_coordinator_id is distinct from actor_id
    and actor_role <> 'administrator'::public.user_role
  then
    raise exception 'Only the assigned coordinator can resolve this clarification'
      using errcode = 'insufficient_privilege';
  end if;

  if clarification_row.status = 'resolved' then
    raise exception 'This clarification is already resolved'
      using errcode = 'check_violation';
  end if;

  update public.clarifications
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = actor_id
  where id = p_clarification_id;

  return jsonb_build_object('id', p_clarification_id, 'resolvedAt', now());
end;
$$;

revoke all on function public.resolve_event_clarification(uuid, uuid) from public;
revoke all on function public.resolve_event_clarification(uuid, uuid) from anon;
grant execute on function public.resolve_event_clarification(uuid, uuid) to authenticated;
grant execute on function public.resolve_event_clarification(uuid, uuid) to service_role;

-- The two RLS policies below predate real business rules (any coordinator
-- could insert, any participant could update any column). Drop them and add
-- nothing back: with no insert/update policy, direct table writes are denied
-- by default, so the three security definer functions above become the only
-- write path — the same "internal function is the sole gate" idiom PB-04
-- uses for assign_event_coordinator, just inverted (here the functions are
-- the public interface and get granted execute; the table itself is closed).
-- The existing select policy is untouched: it already covers AC07's history
-- view for the organiser, the assigned coordinator, and staff roles.
drop policy if exists "coordinators request clarifications" on public.clarifications;
drop policy if exists "event participants update clarifications" on public.clarifications;

-- AC03. save_event_draft is recreated in full (Postgres replaces a function
-- body wholesale), same as 202609130003 did for PB-03 AC07. Only the ELSE
-- (update) branch gains a lock check; the INSERT branch is untouched because
-- a brand-new draft can never have an existing clarification. Diff against
-- 202609130003_pb03_edit_requested_event.sql when reviewing everything else.
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
    "requirements": "Venue, equipment and registration requirements"
  }'::jsonb;
  current_event public.events;
  current_venue public.event_venue_requirements;
  current_registration public.event_registration_requirements;
  new_facilities text[];
  current_facilities text[];
  new_equipment jsonb;
  current_equipment jsonb;
  requirements_changed boolean;
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

      if 'requirements' <> all (active_permitted_fields) then
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

        requirements_changed :=
          nullif(trim(draft #>> '{venue,preferredLocation}'), '') is distinct from current_venue.preferred_location
          or minimum_capacity_text::integer is distinct from current_venue.minimum_capacity
          or nullif(trim(draft #>> '{venue,accessibilityNotes}'), '') is distinct from current_venue.accessibility_notes
          or nullif(trim(draft #>> '{venue,layoutNotes}'), '') is distinct from current_venue.layout_notes
          or new_facilities is distinct from current_facilities
          or new_equipment is distinct from current_equipment
          or coalesce((draft #>> '{registration,required}')::boolean, false) is distinct from coalesce(current_registration.registration_required, false)
          or registration_opens_value is distinct from current_registration.registration_opens_at
          or registration_closes_value is distinct from current_registration.registration_closes_at
          or registration_capacity_text::integer is distinct from current_registration.attendee_capacity
          or coalesce((draft #>> '{registration,waitlistEnabled}')::boolean, false) is distinct from coalesce(current_registration.waitlist_enabled, false);

        if requirements_changed then
          raise exception '% is locked while a clarification is open', locked_field_labels ->> 'requirements'
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
