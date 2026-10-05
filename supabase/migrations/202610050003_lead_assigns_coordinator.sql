-- Event Coordinator Lead assigns/reassigns coordinators (Week 7 customer
-- change #5, continued from 202610050001/202610050002 which only added the
-- role and view access).
--
-- Supersedes PB-04: a newly submitted event no longer gets an Event
-- Coordinator automatically. It enters the Lead's "unassigned" queue
-- (status 'requested', assigned_coordinator_id null) and stays there until
-- the Lead assigns one. The same action, now explicitly targeted and
-- Lead-only, also covers reassigning an already-assigned event.
--
-- This repurposes `reassign_event_coordinator` (added by
-- 202609280001_reassign_event_coordinator.sql), which was written but never
-- wired up to the frontend or covered by a pgTAP test — grep confirms no
-- caller anywhere in apps/. It already has the right shape (explicit target
-- coordinator, SECURITY DEFINER, granted to `authenticated`, logs to
-- event_coordinator_assignments) so it's adapted rather than replaced by a
-- new function: actor must now be the Lead, and a reason is only required
-- when there's a previous coordinator to justify taking the event from
-- (matching event_coordinator_assignments_reason_required, which already
-- encoded this distinction). The coordinator's own self-service hand-off
-- (`auto_reassign_event_coordinator`, live in the app today) is untouched.

-- 1. A Draft or a freshly Requested event may have no coordinator yet; any
-- later status still requires one.
alter table public.events
  drop constraint events_assignment_after_submission;

alter table public.events
  add constraint events_assignment_after_submission
  check (status in ('draft', 'requested') or assigned_coordinator_id is not null)
  not valid;

alter table public.events
  validate constraint events_assignment_after_submission;

-- 2. Submission no longer assigns a coordinator. Identical to
-- 202609140001's version minus the `perform assign_event_coordinator(...)`
-- call — diff against that migration when reviewing.
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

  if registration_row.event_id is not null
    and registration_row.registration_required
    and registration_row.attendee_capacity is null
  then
    issues := issues || jsonb_build_object(
      'field', 'registration.capacity',
      'message', 'Enter a registration capacity when registration is required');
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

-- 3. The old automatic, least-loaded assignment has no caller left.
drop function if exists public.assign_event_coordinator(uuid);

-- 4. Assign (from unassigned) or reassign (from one coordinator to another),
-- Lead-only. Identical in shape to 202609280001's version; the diff is the
-- actor-role check, the reason only being required when there's a previous
-- coordinator to justify taking the event from, and guarding the "you're no
-- longer assigned" notification for when there was no previous coordinator.
create or replace function public.reassign_event_coordinator(
  p_event_id uuid,
  p_new_coordinator_id uuid,
  p_reason text,
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
  target_role public.user_role;
  event_row public.events;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot assign an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to assign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'event_coordinator_lead'::public.user_role then
    raise exception 'Only the Event Coordinator Lead can assign or reassign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into target_role from public.profiles where id = p_new_coordinator_id;

  if target_role is null then
    raise exception 'That user does not exist'
      using errcode = 'check_violation';
  end if;

  if target_role is distinct from 'event_coordinator'::public.user_role then
    raise exception 'An event can only be assigned to an Event Coordinator'
      using errcode = 'check_violation';
  end if;

  if char_length(clean_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'check_violation';
  end if;

  if event_row.status in ('draft', 'rejected', 'cancelled', 'completed') then
    raise exception 'An event with status % cannot be assigned', event_row.status
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id = p_new_coordinator_id then
    raise exception 'That coordinator is already assigned to this event'
      using errcode = 'check_violation';
  end if;

  -- event_coordinator_assignments_reason_required: a reassignment away from
  -- someone must be justified; the first assignment of a previously
  -- unassigned event has nothing to justify.
  if event_row.assigned_coordinator_id is not null and clean_reason = '' then
    raise exception 'Explain why this event is being reassigned'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.coordinator_reassignment', 'on', true);

  update public.events
  set assigned_coordinator_id = p_new_coordinator_id
  where id = p_event_id;

  perform set_config('app.coordinator_reassignment', 'off', true);

  insert into public.event_coordinator_assignments (
    event_id, previous_coordinator_id, new_coordinator_id, changed_by, reason
  )
  values (
    p_event_id,
    event_row.assigned_coordinator_id,
    p_new_coordinator_id,
    actor_id,
    nullif(clean_reason, '')
  );

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    p_new_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    case when event_row.assigned_coordinator_id is null
      then 'New event request assigned to you'
      else 'An event has been assigned to you' end,
    case when event_row.assigned_coordinator_id is null
      then 'Event "' || event_row.title || '" has been assigned to you for review.'
      else 'Event "' || event_row.title || '" has been reassigned to you.' end
  );

  if event_row.assigned_coordinator_id is not null then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.assigned_coordinator_id,
      p_event_id,
      'assignment'::public.notification_type,
      'An event has been reassigned',
      'Event "' || event_row.title || '" is no longer assigned to you.'
    );
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'previousCoordinatorId', event_row.assigned_coordinator_id,
    'newCoordinatorId', p_new_coordinator_id
  );
end;
$$;

-- 5. The Lead's "assign to" dropdown needs every Event Coordinator, not only
-- ones already tied to an event (202610050002's policy only covers that
-- narrower case, for resolving names on the events list).
create policy "event coordinator lead views coordinator roster" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'event_coordinator_lead'::public.user_role
  and role = 'event_coordinator'::public.user_role
);
