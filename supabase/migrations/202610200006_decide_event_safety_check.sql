-- AC1/AC4: Request Changes or Reject, reason mandatory either way, event
-- returns to Planning either way (never cancelled, never any other
-- terminal state — 'planning' is the only non-confirmed/cancelled target
-- from pending_safety_check).
-- AC2: Request Changes flags only the given venue bookings/equipment
-- requirements, validated to belong to this event.
-- AC3: Reject flags every active venue booking and every equipment
-- requirement of the event, regardless of what (if anything) was passed in.
-- AC6: records outcome/reason/reviewer/time in event_safety_check_decisions,
-- tied to the round being decided, plus backfills the generic
-- event_status_history row the status-change trigger already inserted
-- (reason was dead/unused everywhere until now; changed_by needs
-- backfilling because the trigger's auth.uid() is null when called under
-- the service role, the same fixup every other decision RPC in this
-- codebase repeats for its own transition).
-- AC7: the assigned coordinator is always notified; the organiser is
-- notified only on Reject.
--
-- 'approved' is accepted by the decision_type but explicitly refused here —
-- Approve is a separate, not-yet-built story; this function only ever
-- writes 'changes_requested'/'rejected'.
create or replace function public.decide_event_safety_check(
  p_event_id uuid,
  p_decision public.event_safety_check_decision_type,
  p_reason text,
  p_flagged_booking_ids uuid[] default '{}'::uuid[],
  p_flagged_requirement_ids uuid[] default '{}'::uuid[],
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
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  submission_id bigint;
  v_flagged_booking_ids uuid[];
  v_flagged_requirement_ids uuid[];
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide this event''s safety check on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide this event''s safety check'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;
  if actor_role is distinct from 'safety_officer'::public.user_role then
    raise exception 'Only a Safety Officer can decide an event''s safety check'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'approved'::public.event_safety_check_decision_type then
    raise exception 'Approving a safety check is not supported yet'
      using errcode = 'check_violation';
  end if;

  if reason_value is null then
    raise exception 'Explain the reason for this decision'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'pending_safety_check' then
    raise exception 'Only an event Pending Safety Check can be decided'
      using errcode = 'check_violation';
  end if;

  select id into submission_id
  from public.event_safety_check_submissions
  where event_id = p_event_id
  order by round desc
  limit 1;

  if submission_id is null then
    raise exception 'No safety check submission was found for this event'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'changes_requested'::public.event_safety_check_decision_type then
    if exists (
      select 1 from unnest(coalesce(p_flagged_booking_ids, '{}'::uuid[])) as flagged_id
      where not exists (
        select 1 from public.venue_bookings vb where vb.id = flagged_id and vb.event_id = p_event_id
      )
    ) then
      raise exception 'One or more selected venue bookings do not belong to this event'
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1 from unnest(coalesce(p_flagged_requirement_ids, '{}'::uuid[])) as flagged_id
      where not exists (
        select 1 from public.event_equipment_requirements r where r.id = flagged_id and r.event_id = p_event_id
      )
    ) then
      raise exception 'One or more selected equipment arrangements do not belong to this event'
        using errcode = 'check_violation';
    end if;

    if coalesce(array_length(p_flagged_booking_ids, 1), 0) = 0
      and coalesce(array_length(p_flagged_requirement_ids, 1), 0) = 0
    then
      raise exception 'Select at least one venue booking or equipment arrangement to flag'
        using errcode = 'check_violation';
    end if;

    v_flagged_booking_ids := coalesce(p_flagged_booking_ids, '{}'::uuid[]);
    v_flagged_requirement_ids := coalesce(p_flagged_requirement_ids, '{}'::uuid[]);

    update public.venue_bookings
    set needs_review = true, needs_review_reason = reason_value
    where id = any(v_flagged_booking_ids);

    update public.event_equipment_requirements
    set needs_review = true, needs_review_reason = reason_value
    where id = any(v_flagged_requirement_ids);
  else
    -- 'rejected': every active venue booking and every equipment
    -- requirement of the event is flagged, regardless of what (if
    -- anything) was passed in — AC3.
    select coalesce(array_agg(vb.id), '{}'::uuid[]) into v_flagged_booking_ids
    from public.venue_bookings vb
    where vb.event_id = p_event_id and vb.status in ('pending', 'approved', 'on_hold');

    select coalesce(array_agg(r.id), '{}'::uuid[]) into v_flagged_requirement_ids
    from public.event_equipment_requirements r
    where r.event_id = p_event_id;

    update public.venue_bookings
    set needs_review = true, needs_review_reason = reason_value
    where event_id = p_event_id and status in ('pending', 'approved', 'on_hold');

    update public.event_equipment_requirements
    set needs_review = true, needs_review_reason = reason_value
    where event_id = p_event_id;
  end if;

  insert into public.event_safety_check_decisions (
    event_id, submission_id, decided_by, outcome, reason,
    flagged_booking_ids, flagged_requirement_ids
  ) values (
    p_event_id, submission_id, actor_id, p_decision, reason_value,
    v_flagged_booking_ids, v_flagged_requirement_ids
  );

  -- AC4: both outcomes return the event to Planning — never Cancelled,
  -- never any other terminal state.
  update public.events set status = 'planning' where id = p_event_id;

  update public.event_status_history
  set changed_by = actor_id, reason = reason_value
  where event_id = p_event_id
    and to_status = 'planning'
    and changed_by is null;

  -- AC7: the coordinator is always notified.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.assigned_coordinator_id,
    p_event_id,
    'safety_check_decision'::public.notification_type,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type then 'Safety check: changes requested'
      else 'Safety check: rejected'
    end,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type
        then 'The Safety Officer requested changes to "' || event_row.title || '"''s safety arrangement: ' || reason_value
      else 'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement: ' || reason_value
    end
  );

  -- AC7: the organiser is notified only on Reject.
  if p_decision = 'rejected'::public.event_safety_check_decision_type then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.organiser_id,
      p_event_id,
      'safety_check_decision'::public.notification_type,
      'Safety check: rejected',
      'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement: ' || reason_value
    );
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'status', 'planning',
    'outcome', p_decision,
    'flaggedBookingCount', coalesce(array_length(v_flagged_booking_ids, 1), 0),
    'flaggedRequirementCount', coalesce(array_length(v_flagged_requirement_ids, 1), 0)
  );
end;
$$;

revoke all on function public.decide_event_safety_check(uuid, public.event_safety_check_decision_type, text, uuid[], uuid[], uuid) from public, anon;
grant execute on function public.decide_event_safety_check(uuid, public.event_safety_check_decision_type, text, uuid[], uuid[], uuid) to authenticated, service_role;
