-- Approve or Reject an Event Request.
--
-- AC01 An event can only be approved if it is Requested, has sufficient
--      information, and has no unresolved clarification.
-- AC02 Approving an event changes its status to Planning (not "approved" —
--      see 202609150001).
-- AC03 Rejecting requires a rejection reason before the decision can be
--      submitted.
-- AC04 Rejecting changes status to Rejected.
-- AC05 Every decision records the deciding coordinator, the outcome, and the
--      timestamp; rejections additionally record the reason.
-- AC06 The organiser is notified automatically on either outcome.
-- AC07 Once Rejected, venue and equipment planning actions are blocked.

-- AC02. "Requested" now moves to "Planning", not "approved" — the 'approved'
-- arm is left in place rather than removed (same policy 202609130002 used
-- for 'submitted'/'under_review': retiring a already-reachable arm belongs to
-- whichever future story actually removes it, not this one).
create or replace function public.event_status_transition_allowed(
  from_status public.event_status,
  to_status public.event_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case from_status
    when 'draft' then to_status in ('requested', 'submitted', 'cancelled')
    when 'requested' then to_status in ('clarification_requested', 'under_review', 'planning', 'rejected', 'cancelled')
    when 'submitted' then to_status in ('clarification_requested', 'under_review', 'cancelled')
    when 'clarification_requested' then to_status in ('requested', 'submitted', 'cancelled')
    when 'under_review' then to_status in ('clarification_requested', 'approved', 'planning', 'rejected', 'cancelled')
    when 'planning' then to_status in ('confirmed', 'cancelled')
    when 'approved' then to_status in ('confirmed', 'cancelled')
    when 'rejected' then false
    when 'confirmed' then to_status = 'cancelled'
    when 'cancelled' then false
  end;
$$;

-- AC01/AC05's clarification guard now watches for 'planning' instead of
-- 'approved' — the hardcoded list here is independent of
-- event_status_transition_allowed and easy to miss when a status is renamed.
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

  if new.status in ('planning', 'rejected')
    and old.status is distinct from new.status
    and public.event_has_unresolved_clarification(new.id)
  then
    raise exception 'This event has an unresolved clarification and cannot be approved or rejected until it is closed'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- A coordinator's event in Planning is still their active responsibility —
-- least-loaded assignment needs to keep counting it, or load balancing
-- silently degrades the moment any event leaves Requested.
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
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'planning')
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

-- AC03/AC05. A rejection must carry a reason; an approval need not. The
-- original column required a non-blank rationale unconditionally — relax it
-- to a cross-column rule instead of a blanket NOT NULL.
alter table public.event_decisions alter column rationale drop not null;
alter table public.event_decisions drop constraint if exists event_decisions_rationale_check;
alter table public.event_decisions
  add constraint event_decisions_rationale_required_for_rejection
  check (decision <> 'rejected' or char_length(trim(rationale)) > 0);

-- AC07. Nothing in this codebase performs venue or equipment planning for a
-- specific event yet (apps/frontend's Venues/Equipment pages are unbuilt
-- placeholders — see docs/architecture/README.md's "arrangements" slice).
-- There is nothing concrete to block today, so this is the same
-- forward-compatible primitive 202609140003 used for event_has_unresolved_
-- clarification: whichever story builds venue/equipment planning calls this
-- rather than re-deriving the rule.
create or replace function public.event_planning_allowed(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select status not in ('rejected', 'cancelled')
  from public.events
  where id = p_event_id;
$$;

revoke all on function public.event_planning_allowed(uuid) from public;
grant execute on function public.event_planning_allowed(uuid) to authenticated;
grant execute on function public.event_planning_allowed(uuid) to service_role;

create or replace function public.decide_event_request(
  p_event_id uuid,
  p_decision public.event_decision_type,
  p_rationale text,
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

  if event_row.assigned_coordinator_id is distinct from actor_id
    and actor_role <> 'administrator'::public.user_role
  then
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
$$;

revoke all on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) from public;
revoke all on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) from anon;
grant execute on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) to authenticated;
grant execute on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) to service_role;
