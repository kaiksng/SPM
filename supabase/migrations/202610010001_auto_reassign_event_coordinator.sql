-- Auto-reassign an event to the least-loaded Event Coordinator.
--
-- NOTE: a separate, already-deployed feature (`feature/coordinator-reassignment`,
-- commit e491e2c) independently added coordinator reassignment to the shared
-- database under the name `public.reassign_event_coordinator` (any
-- coordinator may act, the caller picks the target explicitly, logged to a
-- dedicated `event_coordinator_assignments` table). That branch isn't merged
-- into main yet. This migration adds a second, distinctly-named function
-- alongside it — `auto_reassign_event_coordinator` — rather than replacing
-- or altering that one, so neither this migration nor that branch conflicts
-- with the other. Only the currently assigned coordinator may call this one,
-- and the new coordinator is chosen automatically by the same least-loaded
-- rule as initial assignment, logged to the generic `audit_logs` table.

-- The trigger below is reproduced byte-for-byte from what
-- feature/coordinator-reassignment already applied to the shared database
-- (confirmed via `supabase db query --linked` against pg_proc). Against that
-- database this is a pure no-op (identical CREATE OR REPLACE). It's included
-- here so that main's own migration history is self-contained: a fresh
-- `supabase db reset` from main's migrations alone must also produce a
-- trigger that the GUC-based gate below can actually open, or this
-- migration's function would be unable to ever update assigned_coordinator_id.
create or replace function public.prevent_coordinator_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.assigned_coordinator_id is not null
    and new.assigned_coordinator_id is distinct from old.assigned_coordinator_id
    and coalesce(current_setting('app.coordinator_reassignment', true), '') <> 'on'
  then
    raise exception 'An event''s assigned coordinator cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Hands an event off from the currently assigned coordinator to another one,
-- chosen by the same least-loaded rule as assign_event_coordinator. Only the
-- coordinator currently assigned to the event may trigger this (self-service
-- handoff) — there is no "unavailable" status on profiles and no bulk/
-- automatic reassignment.
--
-- Eligibility (which events can be reassigned) is deliberately broader than
-- the load-counting set below (which coordinators count as "busy" for
-- selection purposes): an event can be handed off any time it is not yet
-- assigned a coordinator (draft) or already finished (rejected, cancelled,
-- completed) — including 'planning' and 'confirmed', which predate PB-04's
-- original status list and were never added to it. This is an intentional
-- difference, not an oversight.
create or replace function public.auto_reassign_event_coordinator(
  p_event_id uuid,
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
  event_row public.events;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
  new_coordinator_id uuid;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot reassign an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to reassign an event'
      using errcode = 'insufficient_privilege';
  end if;

  if reason_value is null then
    raise exception 'Explain why this event needs to be reassigned'
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
    raise exception 'Only the assigned coordinator can reassign this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status in ('draft', 'rejected', 'cancelled', 'completed') then
    raise exception 'This event cannot be reassigned in its current status'
      using errcode = 'check_violation';
  end if;

  -- Same least-loaded selection as assign_event_coordinator, excluding the
  -- outgoing coordinator so they can never be reselected.
  select p.id into new_coordinator_id
  from public.profiles p
  where p.role = 'event_coordinator'::public.user_role
    and p.id <> event_row.assigned_coordinator_id
  order by (
    select count(*)
    from public.events e
    where e.assigned_coordinator_id = p.id
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'approved')
  ) asc, p.id asc
  limit 1
  for update of p skip locked;

  if new_coordinator_id is null then
    raise exception 'No other Event Coordinator is available to take this event'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.coordinator_reassignment', 'on', true);

  update public.events
  set assigned_coordinator_id = new_coordinator_id
  where id = p_event_id;

  perform set_config('app.coordinator_reassignment', 'off', true);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    actor_id,
    'event_coordinator_reassigned',
    'event',
    p_event_id,
    jsonb_build_object(
      'previousCoordinatorId', event_row.assigned_coordinator_id,
      'newCoordinatorId', new_coordinator_id,
      'reason', reason_value
    )
  );

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    new_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    'Event reassigned to you',
    'Event "' || e.title || '" has been reassigned to you.'
  from public.events e
  where e.id = p_event_id;

  return jsonb_build_object(
    'eventId', p_event_id,
    'previousCoordinatorId', event_row.assigned_coordinator_id,
    'newCoordinatorId', new_coordinator_id,
    'reassignedAt', now()
  );
end;
$$;

revoke all on function public.auto_reassign_event_coordinator(uuid, text, uuid) from public;
revoke all on function public.auto_reassign_event_coordinator(uuid, text, uuid) from anon;
revoke all on function public.auto_reassign_event_coordinator(uuid, text, uuid) from authenticated;
grant execute on function public.auto_reassign_event_coordinator(uuid, text, uuid) to service_role;
