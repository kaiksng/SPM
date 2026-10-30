-- SPM-3: the Jira acceptance criteria for submitting an event request list
-- only name, expected attendance, start/end time, and at least one venue
-- requirement as mandatory — Purpose and Description are never named as
-- required. submit_event_request (most recently redefined in
-- 202610300004_registration_capacity_set_in_planning.sql) nonetheless
-- blocked submission on a blank purpose/description, contradicting the AC
-- (caught by UAT case SPM-3-TC-016). This migration is otherwise identical
-- to that version — only the purpose/description issue checks are removed.
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
