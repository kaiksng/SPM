-- SPM: the assigned coordinator submits a Ready event for the Operational
-- Safety Check (AC05, AC06).
--
-- Mirrors submit_event_request/set_main_venue_booking's actor-resolution and
-- locking style. Re-checks readiness itself via event_readiness rather than
-- trusting the caller's last read, so a race between viewing the checklist
-- and clicking Submit can't submit an event that stopped being Ready.
create or replace function public.submit_event_for_safety_check(
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
  event_row public.events;
  v_readiness jsonb;
  v_round integer;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit this event for the safety check on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit for the safety check'
      using errcode = 'insufficient_privilege';
  end if;

  -- The row lock makes a concurrent double submission safe: the second
  -- transaction waits, then finds the status is no longer 'planning'.
  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can submit this event for the safety check'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning' then
    raise exception 'Only a Planning event can be submitted for the safety check'
      using errcode = 'check_violation';
  end if;

  v_readiness := public.event_readiness(p_event_id);

  -- AC05: blocked with the outstanding items listed when not Ready.
  if not (v_readiness ->> 'ready')::boolean then
    raise exception 'This event is not ready for the safety check'
      using errcode = 'check_violation', detail = (v_readiness -> 'outstandingItems')::text;
  end if;

  select coalesce(max(round), 0) + 1 into v_round
  from public.event_safety_check_submissions
  where event_id = p_event_id;

  insert into public.event_safety_check_submissions (
    event_id, coordinator_id, round, venues_snapshot, period_snapshot,
    attendance_snapshot, equipment_snapshot
  ) values (
    p_event_id,
    actor_id,
    v_round,
    coalesce(v_readiness -> 'venues', '[]'::jsonb),
    jsonb_build_object('startsAt', event_row.starts_at, 'endsAt', event_row.ends_at),
    event_row.expected_attendance,
    coalesce(v_readiness -> 'equipment', '[]'::jsonb)
  );

  -- AC05. The status change fires enforce_event_status_transition and
  -- record_event_status_change, so the transition is validated and
  -- historised without this function writing to event_status_history itself.
  update public.events
  set status = 'pending_safety_check'
  where id = p_event_id;

  -- record_event_status_change stamps changed_by from auth.uid(), which is
  -- null when the backend calls this as the service role (same backfill as
  -- submit_event_request).
  update public.event_status_history
  set changed_by = actor_id
  where event_id = p_event_id
    and to_status = 'pending_safety_check'
    and changed_by is null;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    p.id,
    p_event_id,
    'safety_check_requested'::public.notification_type,
    'Safety check requested',
    '"' || event_row.title || '" is ready for the Operational Safety Check (round ' || v_round || ').'
  from public.profiles p
  where p.role = 'safety_officer'::public.user_role;

  return jsonb_build_object('eventId', p_event_id, 'status', 'pending_safety_check', 'round', v_round);
end;
$$;

revoke all on function public.submit_event_for_safety_check(uuid, uuid) from public, anon;
grant execute on function public.submit_event_for_safety_check(uuid, uuid) to authenticated, service_role;
