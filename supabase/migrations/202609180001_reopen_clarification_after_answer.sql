-- Fixes a regression: 202609140004 (Approve/Reject an Event Request) changed
-- request_event_clarification so a new round could be opened over an
-- *answered*-but-not-yet-closed one (auto-resolving it — "asking again
-- implicitly supersedes it"), matching decide_event_request's own rule that
-- only a genuinely open (unanswered) round blocks further action. But
-- 202609150004 (the venue/equipment/registration bucket split) recreated
-- this function from the pre-202609140004 body to make its own change,
-- silently dropping that fix: the exists-check went back to blocking on
-- 'open' OR 'answered', and the accompanying auto-resolve of an answered row
-- was lost entirely.
--
-- Restores the 202609140004 behaviour on top of 202609150004's bucket keys:
-- only a genuinely open (unanswered) round blocks a new request; an answered
-- one is auto-resolved by the new request, the same way decide_event_request
-- already auto-resolves it when the coordinator decides instead of asking
-- again.

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
$$;

revoke all on function public.request_event_clarification(uuid, text, text[], uuid) from public;
revoke all on function public.request_event_clarification(uuid, text, text[], uuid) from anon;
grant execute on function public.request_event_clarification(uuid, text, text[], uuid) to authenticated;
grant execute on function public.request_event_clarification(uuid, text, text[], uuid) to service_role;
