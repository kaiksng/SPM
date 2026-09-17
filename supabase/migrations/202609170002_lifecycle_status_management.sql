-- "As an authorised user, I want to see an event's current lifecycle
-- status, so that I understand its progress and available next actions."
--
-- AC01 Supports Draft, Requested, Planning, Confirmed, Completed, and
--      Rejected statuses.
-- AC02 The current status is visible to authorised users.
-- AC03 Every successful status change records the previous status, new
--      status, actor or system action, and timestamp.
-- Scenario: an invalid status transition is rejected and the current status
--           remains unchanged.
--
-- Almost everything AC02/AC03 and the scenario ask for already exists, since
-- the very first migration (202609060001): event_status_history,
-- record_event_status_change (fires on every status UPDATE, any caller),
-- and enforce_event_status_transition (rejects an invalid transition before
-- it touches the row, via event_status_transition_allowed). Those needed no
-- change. What was missing:
--   1. "Completed" didn't exist (202609170001 adds it).
--   2. Nothing ever transitions confirmed -> completed — complete_event
--      below is that write path, the same shape as decide_event_request/
--      update_event_as_coordinator (assigned coordinator or admin only).
--   3. "submitted" and "under_review" were still listed as reachable
--      targets despite nothing ever producing them — flagged as this
--      story's job to retire, back when PB-03 and "Approve or Reject an
--      Event Request" first noticed it (see packages/shared's
--      event-status.ts history). Retiring them here is what actually makes
--      AC01's six-status list an accurate description of what's reachable,
--      not just a list nothing contradicts.
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
    when 'draft' then to_status in ('requested', 'cancelled')
    when 'requested' then to_status in ('clarification_requested', 'planning', 'rejected', 'cancelled')
    when 'submitted' then false
    when 'clarification_requested' then to_status in ('requested', 'cancelled')
    when 'under_review' then false
    when 'planning' then to_status in ('confirmed', 'cancelled')
    when 'approved' then to_status in ('confirmed', 'cancelled')
    when 'rejected' then false
    when 'confirmed' then to_status in ('completed', 'cancelled')
    when 'completed' then false
    when 'cancelled' then false
  end;
$$;

-- AC01/AC02/AC03. Deliberately narrow, the same shape as
-- update_event_as_coordinator: only the assigned coordinator (or an
-- administrator) may mark an event completed, and only from Confirmed.
-- events_record_status_change (existing, unchanged) logs the transition;
-- events_enforce_status_transition (existing, unchanged) is defense in
-- depth against this same rule.
create or replace function public.complete_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  event_row public.events;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to complete this event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = auth.uid();

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from auth.uid()
    and actor_role <> 'administrator'::public.user_role
  then
    raise exception 'Only the assigned coordinator can mark this event completed'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'confirmed' then
    raise exception 'Only a Confirmed event can be marked completed'
      using errcode = 'check_violation';
  end if;

  update public.events set status = 'completed' where id = p_event_id;

  return jsonb_build_object('eventId', p_event_id, 'status', 'completed', 'completedAt', now());
end;
$$;

revoke all on function public.complete_event(uuid) from public;
revoke all on function public.complete_event(uuid) from anon;
grant execute on function public.complete_event(uuid) to authenticated;
grant execute on function public.complete_event(uuid) to service_role;
