-- PB-04 Automatically Assign an Event Coordinator.
--
-- AC01 Every successfully submitted event is automatically assigned to
--      exactly one Event Coordinator.
-- AC02 The assigned coordinator is visible to the organiser and internal
--      coordinators (already true: "events visible to participants" and
--      can_view_event() let any coordinator see any event, and the
--      assigned_coordinator_id column is already selectable).
-- AC03 A second coordinator cannot simultaneously become the accountable
--      owner.
-- AC04 The assigned coordinator receives a notification.
-- AC05 Reassignment is outside Release 1 scope.

-- AC05, made real rather than merely omitted from the UI: once set, the
-- assignment cannot change. This is also the strongest guarantee for AC03 —
-- even a bug elsewhere that tried to reassign would be stopped here.
create or replace function public.prevent_coordinator_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.assigned_coordinator_id is not null
    and new.assigned_coordinator_id is distinct from old.assigned_coordinator_id
  then
    raise exception 'An event''s assigned coordinator cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger events_prevent_coordinator_reassignment
before update of assigned_coordinator_id on public.events
for each row execute function public.prevent_coordinator_reassignment();

-- AC01/AC03 as a constraint, not just application code: an event cannot be
-- past Draft without an accountable coordinator, and (with the trigger above)
-- it can never end up with a different one later. NOT VALID + VALIDATE keeps
-- this migration from failing if any pre-existing row would violate it.
alter table public.events
  add constraint events_assignment_after_submission
  check (status = 'draft' or assigned_coordinator_id is not null)
  not valid;

alter table public.events
  validate constraint events_assignment_after_submission;

-- AC01, AC04. Least-loaded selection: the coordinator with the fewest
-- currently active events. The count is a correlated subquery in ORDER BY
-- rather than a GROUP BY, because PostgreSQL does not allow FOR UPDATE
-- together with aggregation. `for update skip locked` is what makes this
-- safe under concurrent submissions — two transactions racing this query
-- cannot both land on the same least-loaded coordinator: whichever commits
-- first has already changed that coordinator's count for the next query, and
-- the row lock means a concurrent reader skips it entirely rather than
-- blocking and re-reading a stale count.
create or replace function public.assign_event_coordinator(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_id uuid;
begin
  select p.id into coordinator_id
  from public.profiles p
  where p.role = 'event_coordinator'::public.user_role
  order by (
    select count(*)
    from public.events e
    where e.assigned_coordinator_id = p.id
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'approved')
  ) asc, p.id asc
  limit 1
  for update of p skip locked;

  if coordinator_id is null then
    raise exception 'No Event Coordinator is available to take this request'
      using errcode = 'check_violation';
  end if;

  update public.events
  set assigned_coordinator_id = coordinator_id
  where id = p_event_id
    and assigned_coordinator_id is null;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    'New event request assigned to you',
    'Event "' || e.title || '" has been assigned to you for review.'
  from public.events e
  where e.id = p_event_id;

  return coordinator_id;
end;
$$;

revoke all on function public.assign_event_coordinator(uuid) from public;
revoke all on function public.assign_event_coordinator(uuid) from anon;
grant execute on function public.assign_event_coordinator(uuid) to service_role;

-- Call the assignment from inside submission, in the same transaction as the
-- status change, so PB-04 AC01 ("every successfully submitted event") holds
-- even under a crash between the two steps. Only the status-change and
-- history-actor-fix lines differ from 202609130002; the completeness checks
-- are unchanged — diff against that migration when reviewing.
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

  -- PB-04 AC01: assignment happens before the status leaves Draft, and in the
  -- same transaction as the status change, so a submission can never be left
  -- without a coordinator. The order matters: events_assignment_after_submission
  -- (a CHECK constraint, always validated at the end of each statement, never
  -- deferrable) requires assigned_coordinator_id to be set as soon as status
  -- is anything but 'draft' — assigning first means that is already true by
  -- the time the status update below runs.
  perform public.assign_event_coordinator(p_event_id);

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
