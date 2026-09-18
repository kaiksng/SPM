-- request_event_clarification's "one open clarification at a time" guard
-- (202609150004) also blocked opening a new round while the previous one was
-- merely 'answered' — the organiser had replied, but nothing had explicitly
-- resolved it yet, since only decide_event_request or
-- resolve_event_clarification transition a round to 'resolved'. That leaves
-- the coordinator stuck: unable to ask a follow-up question until they first
-- make a separate call just to close the round the organiser already
-- answered. Opening a new round is itself how the coordinator signals the
-- previous answer was read and acted on, so it now implicitly resolves an
-- 'answered' round the same way deciding an event already did (see
-- decide_event_request, 202609150002) — only 'open' (unanswered) blocks a
-- new request.
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

  if exists (
    select 1 from public.clarifications
    where event_id = p_event_id and status = 'open'
  ) then
    raise exception 'A clarification is already open for this event'
      using errcode = 'check_violation';
  end if;

  -- Opening a new round is how the coordinator acts on an answered one —
  -- implicitly resolve it rather than requiring a separate resolve call.
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
