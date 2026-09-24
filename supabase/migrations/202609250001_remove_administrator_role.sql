-- Remove the `administrator` role entirely.
--
-- The project has no administrator user: nothing ever assigned the role, and
-- no requirement calls for one. This migration takes it out of the schema and
-- out of every check that special-cased it, so the assigned coordinator /
-- venue staff / technical support staff / organiser rules are the only rules.
--
-- Postgres cannot drop a single value from an enum, so `public.user_role` is
-- rebuilt without it. Everything that references the type — the profiles
-- column, `current_user_role()`, and every RLS policy that calls it — has to
-- be dropped first and recreated, hence the length of this file. Policy and
-- function bodies below are otherwise identical to their latest definitions;
-- the only change is that the administrator branch is gone.
--
-- Behaviour changes to be aware of:
--   * "administrators read audit logs" is dropped with no replacement.
--     audit_logs keeps RLS enabled and now has no policy, so it is readable
--     only through the service role.
--   * create_venue / update_venue / decide_event_request / complete_event /
--     update_event_as_coordinator / clarification functions no longer accept
--     an administrator as an override.

do $$
begin
  if exists (select 1 from public.profiles where role = 'administrator') then
    raise exception 'Cannot remove the administrator role: profiles with that role still exist. Reassign them first.';
  end if;
end;
$$;

-- 1. Drop everything that depends on the type. ------------------------------

DROP POLICY "administrators read audit logs" ON public.audit_logs;
DROP POLICY "equipment items managed by technical support staff" ON public.equipment_items;
DROP POLICY "coordinators request equipment reservations" ON public.equipment_reservations;
DROP POLICY "equipment reservations visible to participants" ON public.equipment_reservations;
DROP POLICY "technical support staff decide equipment reservations" ON public.equipment_reservations;
DROP POLICY "assigned coordinators review change requests" ON public.event_change_requests;
DROP POLICY "organisers submit change requests" ON public.event_change_requests;
DROP POLICY "assigned coordinator views field change history" ON public.event_field_changes;
DROP POLICY "attendees register themselves" ON public.event_registrations;
DROP POLICY "history visible to organiser and assigned coordinator" ON public.event_status_history;
DROP POLICY "coordinators manage assigned events" ON public.events;
DROP POLICY "organisers create their events" ON public.events;
DROP POLICY "organisers delete their drafts" ON public.events;
DROP POLICY "organisers view their assigned coordinator" ON public.profiles;
DROP POLICY "profiles readable by owner and staff" ON public.profiles;
DROP POLICY "coordinators request venue bookings" ON public.venue_bookings;
DROP POLICY "venue bookings visible to participants" ON public.venue_bookings;
DROP POLICY "venue staff decide venue bookings" ON public.venue_bookings;
DROP POLICY "venue facilities managed by venue staff" ON public.venue_facilities;
DROP POLICY "venue layouts managed by venue staff" ON public.venue_layouts;
DROP POLICY "venue unavailability managed by venue staff" ON public.venue_unavailability;
DROP POLICY "venues managed by venue staff" ON public.venues;

drop function public.current_user_role();

-- 2. Rebuild the enum without 'administrator'. ------------------------------

alter type public.user_role rename to user_role_old;

create type public.user_role as enum (
  'event_organiser',
  'event_coordinator',
  'venue_staff',
  'technical_support_staff',
  'attendee'
);

alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.user_role using role::text::public.user_role;
alter table public.profiles alter column role set default 'attendee';

drop type public.user_role_old;

-- 3. Recreate current_user_role(). -----------------------------------------

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to anon, authenticated, service_role;

-- 4. Functions that special-cased administrator. ---------------------------

create or replace function public.can_view_event(target_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and (
        e.organiser_id = auth.uid()
        or e.assigned_coordinator_id = auth.uid()
        or public.current_user_role() in (
          'event_coordinator'::public.user_role,
          'venue_staff'::public.user_role,
          'technical_support_staff'::public.user_role
        )
      )
  );
$function$;

create or replace function public.request_event_clarification(p_event_id uuid, p_question text, p_permitted_fields text[] DEFAULT '{}'::text[], p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if actor_role <> 'event_coordinator'::public.user_role then
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

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can request clarification for this event'
      using errcode = 'insufficient_privilege';
  end if;

  -- Only a genuinely open (unanswered) round still blocks a new one.
  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'A clarification is already open for this event'
      using errcode = 'check_violation';
  end if;

  -- Asking again is itself how an answered-but-unclosed round gets closed —
  -- same reasoning as decide_event_request's own auto-resolve.
  update public.clarifications
  set status = 'resolved', resolved_at = now(), resolved_by = actor_id
  where event_id = p_event_id and status = 'answered';

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
$function$;

create or replace function public.resolve_event_clarification(p_clarification_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if event_row.assigned_coordinator_id is distinct from actor_id then
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
$function$;

create or replace function public.decide_event_request(p_event_id uuid, p_decision public.event_decision_type, p_rationale text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  event_row public.events;
  venue_row public.event_venue_requirements;
  registration_row public.event_registration_requirements;
  rationale_value text := nullif(trim(coalesce(p_rationale, '')), '');
  new_status public.event_status;
  issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide an event request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide an event request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  -- AC03: only rejection requires a reason.
  if p_decision = 'rejected' and rationale_value is null then
    raise exception 'Explain the reason for rejecting this event'
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

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can decide this event request'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'requested' then
    raise exception 'Only a Requested event can be approved or rejected'
      using errcode = 'check_violation';
  end if;

  -- AC01: a genuinely open (unanswered) clarification blocks any decision.
  -- This mirrors enforce_event_status_transition's own guard, which fires as
  -- defense-in-depth on the status update below regardless of this check.
  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'This event has an unresolved clarification and cannot be approved or rejected until it is closed'
      using errcode = 'check_violation';
  end if;

  -- AC01: approval additionally requires the event to still be complete —
  -- a permitted clarification edit can leave a required field blank since
  -- save_event_draft only locks which buckets change, not that they stay
  -- non-empty. Mirrors submit_event_request's own checks; rejection has no
  -- such requirement; an incomplete request is itself a valid reason to
  -- reject.
  if p_decision = 'approved' then
    select * into venue_row
    from public.event_venue_requirements
    where event_id = p_event_id;

    select * into registration_row
    from public.event_registration_requirements
    where event_id = p_event_id;

    if char_length(trim(coalesce(event_row.title, ''))) < 3
      or char_length(trim(coalesce(event_row.title, ''))) > 160
    then
      issues := issues || jsonb_build_object(
        'field', 'title',
        'message', 'Event name must contain between 3 and 160 characters');
    end if;

    if coalesce(trim(event_row.purpose), '') = '' then
      issues := issues || jsonb_build_object(
        'field', 'purpose',
        'message', 'Describe the purpose of the event before approving');
    end if;

    if coalesce(trim(event_row.description), '') = '' then
      issues := issues || jsonb_build_object(
        'field', 'description',
        'message', 'Describe the event before approving');
    end if;

    if event_row.starts_at is null then
      issues := issues || jsonb_build_object(
        'field', 'startsAt',
        'message', 'The proposed start date and time is missing');
    end if;

    if event_row.ends_at is null then
      issues := issues || jsonb_build_object(
        'field', 'endsAt',
        'message', 'The proposed end date and time is missing');
    elsif event_row.starts_at is not null and event_row.ends_at <= event_row.starts_at then
      issues := issues || jsonb_build_object(
        'field', 'endsAt',
        'message', 'End time must be after the start time');
    end if;

    if event_row.expected_attendance is null or event_row.expected_attendance <= 0 then
      issues := issues || jsonb_build_object(
        'field', 'expectedAttendance',
        'message', 'Expected attendance is missing or invalid');
    end if;

    if venue_row.event_id is null
      or (
        coalesce(trim(venue_row.preferred_location), '') = ''
        and venue_row.minimum_capacity is null
        and coalesce(trim(venue_row.accessibility_notes), '') = ''
        and coalesce(trim(venue_row.layout_notes), '') = ''
      )
    then
      issues := issues || jsonb_build_object(
        'field', 'venue.preferredLocation',
        'message', 'No venue requirement is recorded');
    end if;

    if registration_row.event_id is not null
      and registration_row.registration_required
      and registration_row.attendee_capacity is null
    then
      issues := issues || jsonb_build_object(
        'field', 'registration.capacity',
        'message', 'Registration is required but has no capacity');
    end if;

    if jsonb_array_length(issues) > 0 then
      raise exception 'This event does not have enough information to approve'
        using errcode = 'check_violation', detail = issues::text;
    end if;
  end if;

  -- AC06: deciding on an answered clarification is itself how the
  -- coordinator closes it — reading the response is what the decision acts on.
  update public.clarifications
  set status = 'resolved', resolved_at = now(), resolved_by = actor_id
  where event_id = p_event_id and status = 'answered';

  insert into public.event_decisions (event_id, decided_by, decision, rationale)
  values (p_event_id, actor_id, p_decision, rationale_value);

  -- AC02/AC04: the decision (event_decisions.decision) records the outcome
  -- as approved/rejected; the resulting lifecycle status is Planning/Rejected.
  new_status := case p_decision when 'approved' then 'planning' else 'rejected' end;

  update public.events
  set status = new_status
  where id = p_event_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'decision'::public.notification_type,
    case p_decision when 'approved' then 'Event approved' else 'Event rejected' end,
    case p_decision
      when 'approved' then 'Your event "' || event_row.title || '" was approved and has moved to planning.'
      else 'Your event "' || event_row.title || '" was rejected. ' || coalesce(rationale_value, '')
    end
  );

  return jsonb_build_object('eventId', p_event_id, 'status', new_status::text, 'decidedAt', now());
end;
$function$;

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
$function$;

create or replace function public.complete_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role public.user_role;
  event_row public.events;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to complete this event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the assigned coordinator can mark this event completed'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'confirmed' then
    raise exception 'Only a Confirmed event can be marked completed'
      using errcode = 'check_violation';
  end if;

  update public.events set status = 'completed' where id = p_event_id;

  return jsonb_build_object('eventId', p_event_id, 'status', 'completed', 'completedAt', now());
end;
$function$;

create or replace function public.create_venue(p_venue jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
  v_layouts text[];
  venue_row public.venues;
  issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot create a venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to create a venue'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role <> 'venue_staff' then
    raise exception 'Only Venue Staff can create venues'
      using errcode = 'insufficient_privilege';
  end if;

  begin
    v_capacity := (p_venue ->> 'capacity')::integer;
  exception when others then
    v_capacity := null;
  end;

  select array_agg(distinct trim(facility))
  into v_facilities
  from jsonb_array_elements_text(coalesce(p_venue -> 'facilities', '[]'::jsonb)) as facility
  where trim(facility) <> '';

  select array_agg(distinct trim(layout))
  into v_layouts
  from jsonb_array_elements_text(coalesce(p_venue -> 'layouts', '[]'::jsonb)) as layout
  where trim(layout) <> '';

  -- AC03. Every failure is collected before any is reported, matching
  -- submit_event_request's shape so the frontend can highlight every
  -- affected field at once with the same FieldErrors map.
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    issues := issues || jsonb_build_object(
      'field', 'name',
      'message', 'Venue name must contain between 2 and 160 characters');
  end if;

  if v_location is null then
    issues := issues || jsonb_build_object(
      'field', 'location',
      'message', 'Enter the venue location');
  end if;

  if v_capacity is null or v_capacity <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'capacity',
      'message', 'Enter capacity as a positive whole number');
  end if;

  v_operating_hours_error := public.validate_operating_hours(v_operating_hours);
  if v_operating_hours_error is not null then
    issues := issues || jsonb_build_object(
      'field', 'operatingHours',
      'message', v_operating_hours_error);
  end if;

  if v_facilities is null or array_length(v_facilities, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'facilities',
      'message', 'Add at least one facility');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) <> 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
  elsif v_layouts[1] not in (
    'Theatre', 'Classroom', 'Boardroom', 'Banquet',
    'Open Floor', 'Auditorium', 'Exhibition'
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select a layout from the standard list only');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    insert into public.venues (
      name, location, capacity, operating_hours, description,
      accessibility_notes, updated_by
    )
    values (
      v_name, v_location, v_capacity, v_operating_hours, v_description,
      v_accessibility_notes, actor_id
    )
    returning * into venue_row;
  exception when unique_violation then
    raise exception 'A venue named "%" already exists', v_name
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists.'
        )::text;
  end;

  insert into public.venue_facilities (venue_id, facility_name)
  select venue_row.id, facility
  from unnest(v_facilities) as facility;

  insert into public.venue_layouts (venue_id, layout_name)
  select venue_row.id, layout::public.room_layout
  from unnest(v_layouts) as layout;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at
  );
end;
$function$;

create or replace function public.update_venue(p_venue_id uuid, p_venue jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;
  actor_role public.user_role;
  v_name text := nullif(trim(coalesce(p_venue ->> 'name', '')), '');
  v_location text := nullif(trim(coalesce(p_venue ->> 'location', '')), '');
  v_capacity integer;
  v_operating_hours jsonb := coalesce(p_venue -> 'operating_hours', '[]'::jsonb);
  v_operating_hours_error text;
  v_description text := nullif(trim(coalesce(p_venue ->> 'description', '')), '');
  v_accessibility_notes text := nullif(trim(coalesce(p_venue ->> 'accessibility_notes', '')), '');
  v_facilities text[];
  v_layouts text[];
  old_venue public.venues;
  venue_row public.venues;
  issues jsonb := '[]'::jsonb;
  booking record;
  flagged_count integer := 0;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot update a venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to update a venue'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role <> 'venue_staff' then
    raise exception 'Only Venue Staff can update venues'
      using errcode = 'insufficient_privilege';
  end if;

  -- Row lock: a concurrent capacity edit on the same venue is serialised, so
  -- the "did capacity decrease" comparison below always reads a consistent
  -- old_venue.capacity.
  select * into old_venue
  from public.venues
  where id = p_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'insufficient_privilege';
  end if;

  begin
    v_capacity := (p_venue ->> 'capacity')::integer;
  exception when others then
    v_capacity := null;
  end;

  select array_agg(distinct trim(facility))
  into v_facilities
  from jsonb_array_elements_text(coalesce(p_venue -> 'facilities', '[]'::jsonb)) as facility
  where trim(facility) <> '';

  select array_agg(distinct trim(layout))
  into v_layouts
  from jsonb_array_elements_text(coalesce(p_venue -> 'layouts', '[]'::jsonb)) as layout
  where trim(layout) <> '';

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    issues := issues || jsonb_build_object(
      'field', 'name',
      'message', 'Venue name must contain between 2 and 160 characters');
  end if;

  if v_location is null then
    issues := issues || jsonb_build_object(
      'field', 'location',
      'message', 'Enter the venue location');
  end if;

  if v_capacity is null or v_capacity <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'capacity',
      'message', 'Enter capacity as a positive whole number');
  end if;

  v_operating_hours_error := public.validate_operating_hours(v_operating_hours);
  if v_operating_hours_error is not null then
    issues := issues || jsonb_build_object(
      'field', 'operatingHours',
      'message', v_operating_hours_error);
  end if;

  if v_facilities is null or array_length(v_facilities, 1) is null then
    issues := issues || jsonb_build_object(
      'field', 'facilities',
      'message', 'Add at least one facility');
  end if;

  if v_layouts is null or array_length(v_layouts, 1) <> 1 then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select the venue''s supported room layout');
  elsif v_layouts[1] not in (
    'Theatre', 'Classroom', 'Boardroom', 'Banquet',
    'Open Floor', 'Auditorium', 'Exhibition'
  ) then
    issues := issues || jsonb_build_object(
      'field', 'layouts',
      'message', 'Select a layout from the standard list only');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This venue is not ready to save'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  begin
    update public.venues
    set name = v_name,
        location = v_location,
        capacity = v_capacity,
        operating_hours = v_operating_hours,
        description = v_description,
        accessibility_notes = v_accessibility_notes,
        updated_by = actor_id
    where id = p_venue_id
    returning * into venue_row;
  exception when unique_violation then
    raise exception 'A venue named "%" already exists', v_name
      using errcode = 'unique_violation',
        detail = jsonb_build_object(
          'field', 'name',
          'message', 'A venue named "' || v_name || '" already exists.'
        )::text;
  end;

  -- AC04: facilities are catalogue metadata, not booking history — replacing
  -- them here never touches venue_bookings. Layouts are the same kind of
  -- metadata.
  delete from public.venue_facilities where venue_id = p_venue_id;
  insert into public.venue_facilities (venue_id, facility_name)
  select p_venue_id, facility
  from unnest(v_facilities) as facility;

  delete from public.venue_layouts where venue_id = p_venue_id;
  insert into public.venue_layouts (venue_id, layout_name)
  select p_venue_id, layout::public.room_layout
  from unnest(v_layouts) as layout;

  -- AC06/AC07: a capacity decrease can leave an already-decided or still
  -- pending booking over-capacity. rejected/cancelled bookings never count.
  if old_venue.capacity is not null and v_capacity < old_venue.capacity then
    for booking in
      select vb.id, vb.event_id, e.title, e.expected_attendance, e.assigned_coordinator_id
      from public.venue_bookings vb
      join public.events e on e.id = vb.event_id
      where vb.venue_id = p_venue_id
        and vb.status in ('approved', 'pending')
        and e.expected_attendance is not null
        and e.expected_attendance > v_capacity
    loop
      update public.venue_bookings
      set needs_review = true,
          needs_review_reason =
            'Venue capacity reduced to ' || v_capacity ||
            ', below this booking''s expected attendance of ' ||
            booking.expected_attendance || '.'
      where id = booking.id;

      flagged_count := flagged_count + 1;

      if booking.assigned_coordinator_id is not null then
        insert into public.notifications (recipient_id, event_id, type, title, message)
        values (
          booking.assigned_coordinator_id,
          booking.event_id,
          'venue_capacity_review'::public.notification_type,
          'Venue capacity change needs review',
          'The venue for "' || booking.title || '" reduced its capacity to ' ||
            v_capacity || ', below the expected attendance of ' ||
            booking.expected_attendance || '. This booking now needs review.'
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'venueId', venue_row.id,
    'name', venue_row.name,
    'capacity', venue_row.capacity,
    'updatedAt', venue_row.updated_at,
    'flaggedBookingsCount', flagged_count
  );
end;
$function$;

-- 5. Recreate the policies, minus the administrator branch. ---------------

-- "administrators read audit logs" is intentionally not recreated.

create policy "equipment items managed by technical support staff"
on public.equipment_items
for all to authenticated
using (public.current_user_role() = 'technical_support_staff'::public.user_role)
with check (public.current_user_role() = 'technical_support_staff'::public.user_role);

create policy "coordinators request equipment reservations"
on public.equipment_reservations
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() = 'event_coordinator'::public.user_role
  and public.can_view_event(event_id)
);

create policy "equipment reservations visible to participants"
on public.equipment_reservations
for select to authenticated
using (
  public.can_view_event(event_id)
  or public.current_user_role() = 'technical_support_staff'::public.user_role
);

create policy "technical support staff decide equipment reservations"
on public.equipment_reservations
for update to authenticated
using (public.current_user_role() = 'technical_support_staff'::public.user_role)
with check (public.current_user_role() = 'technical_support_staff'::public.user_role);

create policy "assigned coordinators review change requests"
on public.event_change_requests
for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_change_requests.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = event_change_requests.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
);

create policy "organisers submit change requests"
on public.event_change_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() = 'event_organiser'::public.user_role
  and exists (
    select 1 from public.events e
    where e.id = event_change_requests.event_id
      and e.organiser_id = auth.uid()
  )
);

create policy "assigned coordinator views field change history"
on public.event_field_changes
for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_field_changes.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
);

create policy "attendees register themselves"
on public.event_registrations
for insert to authenticated
with check (
  attendee_id = auth.uid()
  and public.current_user_role() = 'attendee'::public.user_role
  and public.can_view_event(event_id)
);

create policy "history visible to organiser and assigned coordinator"
on public.event_status_history
for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_status_history.event_id
      and (e.organiser_id = auth.uid() or e.assigned_coordinator_id = auth.uid())
  )
);

create policy "coordinators manage assigned events"
on public.events
for update to authenticated
using (
  assigned_coordinator_id = auth.uid()
  and status <> all (array[
    'confirmed'::public.event_status,
    'rejected'::public.event_status,
    'cancelled'::public.event_status,
    'completed'::public.event_status
  ])
)
with check (assigned_coordinator_id = auth.uid());

create policy "organisers create their events"
on public.events
for insert to authenticated
with check (
  organiser_id = auth.uid()
  and public.current_user_role() = 'event_organiser'::public.user_role
);

create policy "organisers delete their drafts"
on public.events
for delete to authenticated
using (
  organiser_id = auth.uid()
  and status = 'draft'::public.event_status
  and public.current_user_role() = 'event_organiser'::public.user_role
);

create policy "organisers view their assigned coordinator"
on public.profiles
for select to authenticated
using (
  role = 'event_coordinator'::public.user_role
  and exists (
    select 1 from public.events e
    where e.assigned_coordinator_id = profiles.id
      and e.organiser_id = auth.uid()
  )
);

create policy "profiles readable by owner and staff"
on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'event_coordinator'::public.user_role
);

create policy "coordinators request venue bookings"
on public.venue_bookings
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.current_user_role() = 'event_coordinator'::public.user_role
  and public.can_view_event(event_id)
);

create policy "venue bookings visible to participants"
on public.venue_bookings
for select to authenticated
using (
  public.can_view_event(event_id)
  or public.current_user_role() = 'venue_staff'::public.user_role
);

create policy "venue staff decide venue bookings"
on public.venue_bookings
for update to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role)
with check (public.current_user_role() = 'venue_staff'::public.user_role);

create policy "venue facilities managed by venue staff"
on public.venue_facilities
for all to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role)
with check (public.current_user_role() = 'venue_staff'::public.user_role);

create policy "venue layouts managed by venue staff"
on public.venue_layouts
for all to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role)
with check (public.current_user_role() = 'venue_staff'::public.user_role);

create policy "venue unavailability managed by venue staff"
on public.venue_unavailability
for all to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role)
with check (public.current_user_role() = 'venue_staff'::public.user_role);

create policy "venues managed by venue staff"
on public.venues
for all to authenticated
using (public.current_user_role() = 'venue_staff'::public.user_role)
with check (public.current_user_role() = 'venue_staff'::public.user_role);
