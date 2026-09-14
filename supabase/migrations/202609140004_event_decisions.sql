-- Approve/Reject an Event Request.
--
-- Extends "Request and Resolve Event Clarification" so the coordinator has a
-- durable way forward from an answered clarification: request another round,
-- approve, or reject — rather than a dead-end "resolve" click that settles
-- nothing. AC05/AC06 of that story are what this enforces: a decision is
-- blocked while a clarification is genuinely open (unanswered), and acting on
-- an answered one (deciding, or asking again) is itself how it gets closed.

-- A genuinely open (unanswered) clarification still blocks everything else —
-- opening a second round, or deciding. An answered one no longer blocks a new
-- round: asking again implicitly supersedes it, since the coordinator has
-- read the response and is moving forward rather than waiting.
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
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'A clarification is already open for this event'
      using errcode = 'check_violation';
  end if;

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
$$;

-- AC05/AC06. The only decision RPC — event_decisions has never had a write
-- path until now (the table and its notification type have existed since the
-- initial schema, unused). Mirrors submit_event_request/assign_event_coordinator's
-- shape: security definer (a notifications insert needs it, same reasoning as
-- docs/architecture/adr/0003-submission-through-backend.md), resolves the
-- actor from auth.uid() or a trusted p_actor_id from the backend route.
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
  rationale_value text := trim(coalesce(p_rationale, ''));
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

  if char_length(rationale_value) = 0 then
    raise exception 'Explain the reason for this decision'
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

  -- AC05: a genuinely open (unanswered) clarification still blocks a
  -- decision. This mirrors enforce_event_status_transition's own guard
  -- (202609140003), which fires as defense-in-depth on the status update
  -- below regardless of this check.
  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'This event has an unresolved clarification and cannot be approved or rejected until it is closed'
      using errcode = 'check_violation';
  end if;

  -- AC06: deciding on an answered clarification is itself how the
  -- coordinator closes it — reading the response is what the decision acts on.
  update public.clarifications
  set status = 'resolved', resolved_at = now(), resolved_by = actor_id
  where event_id = p_event_id and status = 'answered';

  insert into public.event_decisions (event_id, decided_by, decision, rationale)
  values (p_event_id, actor_id, p_decision, rationale_value);

  update public.events
  set status = (p_decision::text)::public.event_status
  where id = p_event_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'decision'::public.notification_type,
    case p_decision when 'approved' then 'Event approved' else 'Event rejected' end,
    'Your event "' || event_row.title || '" was ' || p_decision::text || '. ' || rationale_value
  );

  return jsonb_build_object('eventId', p_event_id, 'status', p_decision::text, 'decidedAt', now());
end;
$$;

revoke all on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) from public;
revoke all on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) from anon;
grant execute on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) to authenticated;
grant execute on function public.decide_event_request(uuid, public.event_decision_type, text, uuid) to service_role;

-- Same hardening as 202609140003 applied to clarifications: this policy
-- predates a real business rule (any coordinator, not just the assigned
-- one). Drop it and add nothing back — decide_event_request is the only
-- write path now. The existing select policy is untouched.
drop policy if exists "coordinators record decisions" on public.event_decisions;
