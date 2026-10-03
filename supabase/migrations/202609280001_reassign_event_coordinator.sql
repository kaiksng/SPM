-- Reassign an Event Coordinator.
--
-- Supersedes PB-04 AC05 ("Reassignment is outside Release 1 scope") and the
-- immutability decision recorded in ADR 0003. The driver is the Week 4 core
-- requirement "Coordinator Assignment", which states that events "may
-- subsequently be reassigned when staff responsibilities or availability
-- change" — a Release 1 requirement PB-04 left uncovered. See ADR 0004.
--
-- AC01 Any Event Coordinator may reassign any non-terminal event to another
--      Event Coordinator, giving a reason.
-- AC02 Every assignment — the automatic one at submission and every
--      reassignment after it — is recorded with who, when, and (for a
--      reassignment) why.
-- AC03 An event still has exactly one accountable coordinator at all times;
--      direct writes to events.assigned_coordinator_id remain impossible.
-- AC04 The outgoing and incoming coordinators are both notified.
-- AC05 The reason is visible to Event Coordinators only. The organiser sees
--      that the change happened, when, and who made it — reasons routinely
--      disclose staff absence and are not the organiser's business.

-- 1. The audit trail. ------------------------------------------------------

create table public.event_coordinator_assignments (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  -- Null on the automatic assignment made at submission: there is no
  -- predecessor, and no human actor, so both columns stay null and mark the
  -- row as the start of the chain rather than a reassignment.
  previous_coordinator_id uuid references public.profiles (id),
  new_coordinator_id uuid not null references public.profiles (id),
  changed_by uuid references public.profiles (id),
  reason text,
  changed_at timestamptz not null default now(),
  -- AC02: a reassignment must justify itself; the initial assignment has
  -- nothing to justify.
  constraint event_coordinator_assignments_reason_required check (
    previous_coordinator_id is null
    or char_length(trim(coalesce(reason, ''))) > 0
  ),
  constraint event_coordinator_assignments_reason_length check (
    reason is null or char_length(reason) <= 500
  ),
  constraint event_coordinator_assignments_distinct check (
    previous_coordinator_id is distinct from new_coordinator_id
  )
);

-- Mirrors event_field_changes_event_idx: history is always read per event,
-- oldest first.
create index event_coordinator_assignments_event_idx
  on public.event_coordinator_assignments (event_id, changed_at asc);

alter table public.event_coordinator_assignments enable row level security;

-- No policy of any kind. Reads go through list_event_coordinator_history
-- (which masks the reason per AC05) and writes go through the two SECURITY
-- DEFINER functions below — the same shape as event_status_history, which
-- record_event_status_change writes despite the table having no write policy.
-- RLS with no policy denies everything to `authenticated`, which is exactly
-- what we want: the function is the only read path, so the reason column can
-- never leak past the masking.

-- 2. Backfill, so history is complete rather than starting today. ----------

insert into public.event_coordinator_assignments (event_id, new_coordinator_id, changed_at)
select e.id, e.assigned_coordinator_id, coalesce(e.submitted_at, e.created_at)
from public.events e
where e.assigned_coordinator_id is not null;

-- 3. Let the reassignment RPC through the immutability trigger. ------------

-- PB-04's trigger blocked every change to assigned_coordinator_id. It still
-- does, with one gate: a transaction-local GUC that only
-- reassign_event_coordinator sets. Keeping the trigger (rather than dropping
-- it) preserves the property ADR 0003 actually cared about — that the column
-- cannot be changed by a stray UPDATE somewhere in the application — while
-- allowing the one audited, authorised path.
--
-- A client cannot set this GUC: PostgREST only sets request.* GUCs from the
-- JWT, and nothing exposes set_config as an RPC. Independently of that, the
-- "coordinators manage assigned events" policy already makes a direct
-- reassignment impossible for `authenticated` — its USING requires the OLD
-- row's coordinator to be the caller and its WITH CHECK requires the NEW
-- row's to be as well, so the only change RLS permits is a no-op. The trigger
-- is the backstop for anything reaching the table outside that policy.
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

-- 4. Record the automatic assignment too. ----------------------------------

-- Identical to 202609140001 except for the history insert: without it the
-- history would begin at the first reassignment, and the organiser would see
-- a coordinator appear from nowhere. Diff against that migration when
-- reviewing.
create or replace function public.assign_event_coordinator(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_id uuid;
begin
  select p.id into coordinator_id
  from public.profiles p
  where p.role = 'event_coordinator'::public.user_role
  order by (
    select count(*)
    from public.events e
    where e.assigned_coordinator_id = p.id
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'approved')
  ) asc, p.id asc
  limit 1
  for update of p skip locked;

  if coordinator_id is null then
    raise exception 'No Event Coordinator is available to take this request'
      using errcode = 'check_violation';
  end if;

  update public.events
  set assigned_coordinator_id = coordinator_id
  where id = p_event_id
    and assigned_coordinator_id is null;

  -- Guarded by FOUND, because the UPDATE above is conditional: on an event
  -- that somehow already had a coordinator it changes nothing, and recording
  -- an assignment that did not happen would put a false row at the head of
  -- the history chain. (The notification below is left unguarded exactly as
  -- 202609140001 wrote it — narrowing that is not this migration's business.)
  if found then
    insert into public.event_coordinator_assignments (event_id, new_coordinator_id)
    values (p_event_id, coordinator_id);
  end if;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    'New event request assigned to you',
    'Event "' || e.title || '" has been assigned to you for review.'
  from public.events e
  where e.id = p_event_id;

  return coordinator_id;
end;
$$;

revoke all on function public.assign_event_coordinator(uuid) from public;
revoke all on function public.assign_event_coordinator(uuid) from anon;
revoke all on function public.assign_event_coordinator(uuid) from authenticated;
grant execute on function public.assign_event_coordinator(uuid) to service_role;

-- 5. The reassignment itself. ----------------------------------------------

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
  -- Same actor-resolution shape as submit_event_request and
  -- decide_event_request: auth.uid() wins when the call arrives with a JWT,
  -- and p_actor_id is only trusted when there is none (the service-role path
  -- the backend route uses).
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

  select role into actor_role from public.profiles where id = actor_id;

  -- AC01: any Event Coordinator, not only the assigned one. The requirement's
  -- own scenario is a coordinator who has become unavailable and therefore
  -- cannot hand their own events over.
  if actor_role is distinct from 'event_coordinator'::public.user_role then
    raise exception 'Only Event Coordinators can reassign an event'
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

  if clean_reason = '' then
    raise exception 'Explain why this event is being reassigned'
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

  -- A draft has no coordinator yet (events_assignment_after_submission), and
  -- the three terminal states have no further coordination to do.
  if event_row.status in ('draft', 'rejected', 'cancelled', 'completed') then
    raise exception 'An event with status % cannot be reassigned', event_row.status
      using errcode = 'check_violation';
  end if;

  if event_row.assigned_coordinator_id = p_new_coordinator_id then
    raise exception 'That coordinator is already assigned to this event'
      using errcode = 'check_violation';
  end if;

  -- AC03: the window in which the column is writable is this statement, in
  -- this transaction, and nothing else.
  perform set_config('app.coordinator_reassignment', 'on', true);

  update public.events
  set assigned_coordinator_id = p_new_coordinator_id
  where id = p_event_id;

  perform set_config('app.coordinator_reassignment', 'off', true);

  insert into public.event_coordinator_assignments (
    event_id, previous_coordinator_id, new_coordinator_id, changed_by, reason
  )
  values (
    p_event_id, event_row.assigned_coordinator_id, p_new_coordinator_id, actor_id, clean_reason
  );

  -- AC04. The outgoing coordinator is told they no longer own it; without
  -- this they would simply find it gone from their list.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    p_new_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    'An event has been assigned to you',
    'Event "' || event_row.title || '" has been reassigned to you.'
  ),
  (
    event_row.assigned_coordinator_id,
    p_event_id,
    'assignment'::public.notification_type,
    'An event has been reassigned',
    'Event "' || event_row.title || '" is no longer assigned to you.'
  );

  return jsonb_build_object(
    'eventId', p_event_id,
    'previousCoordinatorId', event_row.assigned_coordinator_id,
    'newCoordinatorId', p_new_coordinator_id
  );
end;
$$;

-- Granted to `authenticated` as well as `service_role`, matching
-- decide_event_request rather than assign_event_coordinator. The distinction
-- the codebase draws is between a function that is an internal step of
-- another operation (assign_event_coordinator — service_role only, since
-- calling it directly would skip submit_event_request's checks) and one that
-- is a coordinator's own deliberate action, fully self-authorising, which
-- this is: every rule above is re-checked here regardless of caller, so a
-- direct call can do nothing the backend route could not.
--
-- `anon` is revoked explicitly: revoking from `public` alone would not remove
-- the role-specific grant Supabase adds by default — the exact hole
-- 202609180001 had to close for assign_event_coordinator.
revoke all on function public.reassign_event_coordinator(uuid, uuid, text, uuid) from public;
revoke all on function public.reassign_event_coordinator(uuid, uuid, text, uuid) from anon;
grant execute on function public.reassign_event_coordinator(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.reassign_event_coordinator(uuid, uuid, text, uuid) to service_role;

-- 6. Reading the history, with AC05's masking. -----------------------------

-- A function rather than a view because the reason is masked per-role, and
-- because the three profile names have to be joined for a reader who cannot
-- necessarily select those profiles themselves (an organiser can only read
-- their *currently* assigned coordinator's profile, not a previous one's).
-- SECURITY DEFINER means RLS is bypassed, so the visibility check is explicit
-- and is the first thing the function does.
create or replace function public.list_event_coordinator_history(p_event_id uuid)
returns table (
  id bigint,
  previous_coordinator_id uuid,
  previous_coordinator_name text,
  new_coordinator_id uuid,
  new_coordinator_name text,
  changed_by_id uuid,
  changed_by_name text,
  reason text,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
-- The directive above leads the body deliberately: every RETURNS TABLE column
-- name is also a column of event_coordinator_assignments, so each is at once
-- an output variable and a real column. Every reference below is
-- table-qualified, which already resolves it; this makes the resolution
-- explicit rather than relying on that discipline surviving the next edit.
-- Renaming the output columns instead is not an option — PostgREST uses them
-- as the JSON keys the frontend reads.
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
    -- AC05.
    case
      when public.current_user_role() = 'event_coordinator'::public.user_role then a.reason
      else null
    end,
    a.changed_at
  from public.event_coordinator_assignments a
  left join public.profiles prev on prev.id = a.previous_coordinator_id
  left join public.profiles next_c on next_c.id = a.new_coordinator_id
  left join public.profiles actor on actor.id = a.changed_by
  where a.event_id = p_event_id
  order by a.changed_at asc, a.id asc;
end;
$$;

revoke all on function public.list_event_coordinator_history(uuid) from public;
revoke all on function public.list_event_coordinator_history(uuid) from anon;
grant execute on function public.list_event_coordinator_history(uuid) to authenticated;
grant execute on function public.list_event_coordinator_history(uuid) to service_role;
