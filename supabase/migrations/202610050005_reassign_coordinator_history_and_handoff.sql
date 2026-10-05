-- Reassign an Event Coordinator (full story), building on
-- 202610050003_lead_assigns_coordinator.sql, which already covers:
--   * Lead-only, explicit target coordinator, optional/required reason
--   * refusing reassignment to the current coordinator
--   * blocking draft/rejected/cancelled/completed events
--   * the assigned-coordinator check already being dynamic (re-read from
--     events.assigned_coordinator_id on every call) in every coordinator
--     action this project has an RPC for: request_event_clarification,
--     resolve_event_clarification, decide_event_request,
--     update_event_as_coordinator, complete_event, and the
--     "assigned coordinators review change requests" RLS policy — so a
--     reassignment already takes effect immediately for all of those with
--     no further change needed.
--
-- This migration adds what was still missing:
--   1. event_coordinator_assignments.ended_at — the previous interval is
--      closed, not just superseded, so "full assignment history" has a
--      real start/end per coordinator rather than only change points.
--   2. The organiser notification alongside the two coordinator ones.
--   3. Two write paths that checked a *stored* coordinator reference
--      instead of the event's *current* assigned coordinator, so a
--      reassignment did not actually hand them off: withdrawing a venue
--      booking request (checked venue_bookings.requested_by, the
--      coordinator who happened to submit it) and requesting an equipment
--      reservation (checked only the caller's role, not which event they're
--      assigned to — any Event Coordinator could request equipment for any
--      event). Both now check events.assigned_coordinator_id, matching
--      submit_venue_booking_request's existing pattern.
--
-- Out of scope, flagged rather than silently skipped: this story also names
-- "safety submission" and a coordinator-initiated "cancel" among the
-- actions that must be assignment-scoped. Neither exists in the app yet —
-- there is no Safety Officer workflow (a separate, not-yet-built story) and
-- the only cancel RPC today is the organiser's own cancel_event_request.
-- There is nothing to scope until those are built.

alter table public.event_coordinator_assignments
  add column ended_at timestamptz;

create or replace function public.reassign_event_coordinator(
  p_event_id uuid,
  p_new_coordinator_id uuid,
  p_reason text,
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
  target_role public.user_role;
  event_row public.events;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot assign an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to assign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'event_coordinator_lead'::public.user_role then
    raise exception 'Only the Event Coordinator Lead can assign or reassign an event'
      using errcode = 'insufficient_privilege';
  end if;

  select role into target_role from public.profiles where id = p_new_coordinator_id;

  if target_role is null then
    raise exception 'That user does not exist'
      using errcode = 'check_violation';
  end if;

  if target_role is distinct from 'event_coordinator'::public.user_role then
    raise exception 'An event can only be assigned to an Event Coordinator'
      using errcode = 'check_violation';
  end if;

  if char_length(clean_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'check_violation';
  end if;

  if event_row.status in ('draft', 'rejected', 'cancelled', 'completed') then
    raise exception 'An event with status % cannot be assigned', event_row.status
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id = p_new_coordinator_id then
    raise exception 'That coordinator is already assigned to this event'
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id is not null and clean_reason = '' then
    raise exception 'Explain why this event is being reassigned'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.coordinator_reassignment', 'on', true);

  update public.events
  set assigned_coordinator_id = p_new_coordinator_id
  where id = p_event_id;

  perform set_config('app.coordinator_reassignment', 'off', true);

  -- Close the interval the previous coordinator held (a no-op when there
  -- wasn't one — the first assignment has nothing open to close).
  update public.event_coordinator_assignments
  set ended_at = now()
  where event_id = p_event_id and ended_at is null;

  insert into public.event_coordinator_assignments (
    event_id, previous_coordinator_id, new_coordinator_id, changed_by, reason
  )
  values (
    p_event_id,
    event_row.assigned_coordinator_id,
    p_new_coordinator_id,
    actor_id,
    nullif(clean_reason, '')
  );

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    p_new_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    case when event_row.assigned_coordinator_id is null
      then 'New event request assigned to you'
      else 'An event has been assigned to you' end,
    case when event_row.assigned_coordinator_id is null
      then 'Event "' || event_row.title || '" has been assigned to you for review.'
      else 'Event "' || event_row.title || '" has been reassigned to you.' end
  );

  if event_row.assigned_coordinator_id is not null then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.assigned_coordinator_id,
      p_event_id,
      'assignment'::public.notification_type,
      'An event has been reassigned',
      'Event "' || event_row.title || '" is no longer assigned to you.'
    );
  end if;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    event_row.organiser_id,
    p_event_id,
    'assignment'::public.notification_type,
    'Your event has a new coordinator',
    'Event "' || event_row.title || '" is now coordinated by a different Event Coordinator.'
  );

  return jsonb_build_object(
    'eventId', p_event_id,
    'previousCoordinatorId', event_row.assigned_coordinator_id,
    'newCoordinatorId', p_new_coordinator_id
  );
end;
$$;

-- list_event_coordinator_history now surfaces ended_at, so a viewer can see
-- each coordinator's actual tenure, not just the moments it changed. This
-- adds a column to its RETURNS TABLE, which CREATE OR REPLACE cannot do —
-- the function must be dropped first.
drop function if exists public.list_event_coordinator_history(uuid);

create function public.list_event_coordinator_history(p_event_id uuid)
returns table (
  id bigint,
  previous_coordinator_id uuid,
  previous_coordinator_name text,
  new_coordinator_id uuid,
  new_coordinator_name text,
  changed_by_id uuid,
  changed_by_name text,
  reason text,
  changed_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_view_event(p_event_id) then
    raise exception 'This event is unavailable or you do not have access to it'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    a.id,
    a.previous_coordinator_id,
    prev.full_name,
    a.new_coordinator_id,
    next_c.full_name,
    a.changed_by,
    actor.full_name,
    case
      when public.current_user_role() in (
        'event_coordinator'::public.user_role,
        'event_coordinator_lead'::public.user_role
      ) then a.reason
      else null
    end,
    a.changed_at,
    a.ended_at
  from public.event_coordinator_assignments a
  left join public.profiles prev on prev.id = a.previous_coordinator_id
  left join public.profiles next_c on next_c.id = a.new_coordinator_id
  left join public.profiles actor on actor.id = a.changed_by
  where a.event_id = p_event_id
  order by a.changed_at asc, a.id asc;
end;
$$;

-- DROP FUNCTION above dropped these grants along with the old signature;
-- restore them (unchanged from 202609280001's original grant).
revoke all on function public.list_event_coordinator_history(uuid) from public;
revoke all on function public.list_event_coordinator_history(uuid) from anon;
grant execute on function public.list_event_coordinator_history(uuid) to authenticated;
grant execute on function public.list_event_coordinator_history(uuid) to service_role;

-- A withdrawal must follow the event's *current* coordinator, the same way
-- submitting the request already does — not the coordinator who happened to
-- submit it, who may have since been reassigned away from the event.
create or replace function public.withdraw_venue_booking_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.venue_bookings;
begin
  if auth.uid() is null then
    raise exception 'You must sign in to withdraw a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row from public.venue_bookings where id = p_booking_id;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.events e
    where e.id = booking_row.event_id and e.assigned_coordinator_id = auth.uid()
  ) then
    raise exception 'Only the event''s assigned coordinator can withdraw this request'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be withdrawn'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'cancelled'
  where id = p_booking_id;

  return p_booking_id;
end;
$$;

-- Requesting equipment for an event is scoped to that event's own assigned
-- coordinator, the same way venue booking submission already is — not any
-- Event Coordinator who can merely view the event (can_view_event grants
-- that broadly, for awareness, to every coordinator).
drop policy "coordinators request equipment reservations" on public.equipment_reservations;

create policy "coordinators request equipment reservations"
on public.equipment_reservations
for insert to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.events e
    where e.id = equipment_reservations.event_id
      and e.assigned_coordinator_id = auth.uid()
  )
);
