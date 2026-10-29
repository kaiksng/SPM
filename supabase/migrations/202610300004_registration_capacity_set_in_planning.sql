-- SPM-40 / SPM-07: registration capacity is set only once the event is in
-- Planning.
--
-- The request form (PB-02/PB-03) only asks whether registration is required;
-- configure_event_registration (202610240001) is where the organiser sets the
-- opening time, closing time and capacity, and event_readiness blocks the
-- safety check until they are set (SPM-40 AC07). submit_event_request and
-- decide_event_request still refused an event that required registration but
-- had no capacity, which the form hid by quietly copying expected attendance
-- into capacity. Both functions are otherwise identical to their current
-- versions (202610050003 and 202610160006) — only the registration.capacity
-- issue is removed from each. Existing rows are left as they are.

-- 1. Submitting no longer requires a registration capacity.
create or replace function public.submit_event_request(
  p_event_id uuid,
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
  venue_row public.event_venue_requirements;
  registration_row public.event_registration_requirements;
  issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit an event request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit an event request'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'event_organiser'::public.user_role then
    raise exception 'Only Event Organisers can submit event requests'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
    and organiser_id = actor_id
    and status = 'draft'
  for update;

  if not found then
    raise exception 'Event request not found or cannot be submitted'
      using errcode = 'insufficient_privilege';
  end if;

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
      'message', 'Describe the purpose of the event before submitting');
  end if;

  if coalesce(trim(event_row.description), '') = '' then
    issues := issues || jsonb_build_object(
      'field', 'description',
      'message', 'Describe the event before submitting');
  end if;

  if event_row.starts_at is null then
    issues := issues || jsonb_build_object(
      'field', 'startsAt',
      'message', 'Enter the proposed start date and time');
  elsif event_row.starts_at <= now() then
    issues := issues || jsonb_build_object(
      'field', 'startsAt',
      'message', 'The proposed start date and time must be in the future');
  end if;

  if event_row.ends_at is null then
    issues := issues || jsonb_build_object(
      'field', 'endsAt',
      'message', 'Enter the proposed end date and time');
  elsif event_row.starts_at is not null and event_row.ends_at <= event_row.starts_at then
    issues := issues || jsonb_build_object(
      'field', 'endsAt',
      'message', 'End time must be after the start time');
  end if;

  if event_row.expected_attendance is null then
    issues := issues || jsonb_build_object(
      'field', 'expectedAttendance',
      'message', 'Enter the expected attendance');
  elsif event_row.expected_attendance <= 0 then
    issues := issues || jsonb_build_object(
      'field', 'expectedAttendance',
      'message', 'Expected attendance must be a positive whole number');
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
      'message', 'Record at least one venue requirement, or state that none is required');
  end if;


  if not event_row.requirements_acknowledged then
    issues := issues || jsonb_build_object(
      'field', 'requirementsAcknowledged',
      'message', 'Confirm that each optional requirement is provided or not required');
  end if;

  if jsonb_array_length(issues) > 0 then
    raise exception 'This event request is not ready to submit'
      using errcode = 'check_violation', detail = issues::text;
  end if;

  -- The event now sits in the Lead's unassigned queue until
  -- reassign_event_coordinator is called to give it a coordinator.
  update public.events
  set status = 'requested',
      submitted_at = now(),
      submitted_by = actor_id
  where id = p_event_id;

  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = 'requested'
    and changed_by is null;

  select * into event_row from public.events where id = p_event_id;

  return jsonb_build_object(
    'eventId', event_row.id,
    'status', event_row.status,
    'submittedAt', event_row.submitted_at,
    'assignedCoordinatorId', event_row.assigned_coordinator_id
  );
end;
$$;

-- 2. Approving no longer requires a registration capacity.
CREATE OR REPLACE FUNCTION public.decide_event_request(p_event_id uuid, p_decision event_decision_type, p_rationale text, p_actor_id uuid DEFAULT NULL::uuid)
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

  -- The status history trigger records auth.uid(), which is null when the
  -- backend calls this with the service role (every decision made in the
  -- app). Record the deciding coordinator instead, the same way
  -- submit_event_request does (SPM-12 AC03).
  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = new_status
    and changed_at = now()
    and changed_by is null;

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
