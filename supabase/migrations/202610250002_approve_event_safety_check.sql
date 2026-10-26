-- Adds the third outcome, Approve, to decide_event_safety_check — removes
-- the hard refusal 202610200006 put in place while Approve was a
-- not-yet-built story. event_safety_check_decision_type already had
-- 'approved' as a value and pending_safety_check -> confirmed was already
-- an allowed transition (both added in anticipation of this), so this is
-- additive to the function body only; nothing else needs a migration.
--
-- Approve differs from the other two outcomes in three ways: nothing is
-- flagged (no venue booking or equipment requirement changes), the event
-- goes to Confirmed instead of back to Planning (the first place anything
-- in this codebase writes that status), and the reason is optional, not
-- mandatory — there is nothing to justify when everything checks out.
--
-- Fixes a latent bug along the way: the coordinator notification's title
-- `case` had no 'approved' arm and would have silently fallen through to
-- the "Safety check: rejected" copy once this outcome became reachable.
--
-- Also extends AC7's notification rule: the organiser is now notified on
-- Approve as well as Reject (not on Request Changes) — "your event is
-- Confirmed" is the most important update they get in this whole flow,
-- same weight as being told it was rejected.
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
  v_flagged_booking_ids uuid[] := '{}'::uuid[];
  v_flagged_requirement_ids uuid[] := '{}'::uuid[];
  v_new_status public.event_status := case
    when p_decision = 'approved'::public.event_safety_check_decision_type then 'confirmed'::public.event_status
    else 'planning'::public.event_status
  end;
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

  -- Reason is mandatory for Request Changes/Reject, optional for Approve.
  if p_decision <> 'approved'::public.event_safety_check_decision_type and reason_value is null then
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
  elsif p_decision = 'rejected'::public.event_safety_check_decision_type then
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
  -- 'approved': nothing is flagged — v_flagged_*_ids stay at their '{}' default.

  insert into public.event_safety_check_decisions (
    event_id, submission_id, decided_by, outcome, reason,
    flagged_booking_ids, flagged_requirement_ids
  ) values (
    p_event_id, submission_id, actor_id, p_decision, reason_value,
    v_flagged_booking_ids, v_flagged_requirement_ids
  );

  -- Request Changes/Reject return the event to Planning; Approve sends it
  -- to Confirmed — the only two non-terminal-or-cancelled targets from
  -- pending_safety_check.
  update public.events set status = v_new_status where id = p_event_id;

  update public.event_status_history
  set changed_by = actor_id, reason = reason_value
  where event_id = p_event_id
    and to_status = v_new_status
    and changed_by is null;

  -- AC7: the coordinator is always notified.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.assigned_coordinator_id,
    p_event_id,
    'safety_check_decision'::public.notification_type,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type then 'Safety check: changes requested'
      when 'approved'::public.event_safety_check_decision_type then 'Safety check: approved'
      else 'Safety check: rejected'
    end,
    case p_decision
      when 'changes_requested'::public.event_safety_check_decision_type
        then 'The Safety Officer requested changes to "' || event_row.title || '"''s safety arrangement: ' || reason_value
      when 'approved'::public.event_safety_check_decision_type
        then 'The Safety Officer approved "' || event_row.title || '"''s safety arrangement. It is now Confirmed.'
          || case when reason_value is not null then ' ' || reason_value else '' end
      else 'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement: ' || reason_value
    end
  );

  -- AC7, extended: the organiser is notified on Reject and now Approve too
  -- (not on Request Changes) — their event's outcome, not just something
  -- for the coordinator to act on.
  if p_decision in ('rejected'::public.event_safety_check_decision_type, 'approved'::public.event_safety_check_decision_type) then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.organiser_id,
      p_event_id,
      'safety_check_decision'::public.notification_type,
      case p_decision
        when 'approved'::public.event_safety_check_decision_type then 'Safety check: approved'
        else 'Safety check: rejected'
      end,
      case p_decision
        when 'approved'::public.event_safety_check_decision_type
          then 'Your event "' || event_row.title || '" passed its safety check and is now Confirmed.'
            || case when reason_value is not null then ' ' || reason_value else '' end
        else 'The Safety Officer rejected "' || event_row.title || '"''s safety arrangement: ' || reason_value
      end
    );
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'status', v_new_status,
    'outcome', p_decision,
    'flaggedBookingCount', coalesce(array_length(v_flagged_booking_ids, 1), 0),
    'flaggedRequirementCount', coalesce(array_length(v_flagged_requirement_ids, 1), 0)
  );
end;
$$;
