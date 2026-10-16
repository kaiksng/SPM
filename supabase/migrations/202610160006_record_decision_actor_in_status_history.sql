-- SPM-12 AC03: every status change records who made it.
--
-- record_event_status_change logs changed_by = auth.uid(). The app sends
-- approvals and rejections through the backend, which calls
-- decide_event_request with the service role and passes the coordinator as
-- p_actor_id — so auth.uid() was null and every approval/rejection was
-- logged with no actor. submit_event_request already fills changed_by in
-- after its own update; decide_event_request now does the same. Its
-- definition is otherwise identical to the current one — diff the block
-- after "update public.events" when reviewing.
--
-- Past decisions are filled in from event_decisions, which has always
-- recorded the deciding coordinator: the decision row and its status change
-- were written in the same transaction, so their timestamps are equal. Only
-- rows whose actor is blank are touched.

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

update public.event_status_history h
set changed_by = d.decided_by
from public.event_decisions d
where h.event_id = d.event_id
  and h.changed_by is null
  and h.from_status = 'requested'
  and h.changed_at = d.decided_at
  and (
    (d.decision = 'approved' and h.to_status in ('planning', 'approved'))
    or (d.decision = 'rejected' and h.to_status = 'rejected')
  );
