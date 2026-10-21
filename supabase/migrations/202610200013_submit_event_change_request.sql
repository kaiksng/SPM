-- SPM-38: Submit an Event Change Request.
--
-- event_change_requests (202609220007) has existed since the clarification
-- story's era but was never wired up: no RPC, and its own RLS update policy
-- only lets the assigned coordinator decide — which cannot author a decision
-- on an unassigned Requested event, since assigned_coordinator_id can be
-- null there (events_assignment_after_submission, 202610160001). This fills
-- in the write path end to end: submit, decide, withdraw.
--
-- reason is split out as its own column (AC03 asks for a description of the
-- change AND a reason as two distinct things); requested_changes keeps
-- describing the change itself, same as before.
alter table public.event_change_requests
  add column reason text,
  add column withdrawn_at timestamptz;

update public.event_change_requests set reason = '' where reason is null;

alter table public.event_change_requests
  alter column reason set not null;

alter table public.event_change_requests
  drop constraint event_change_requests_status_check;
alter table public.event_change_requests
  add constraint event_change_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

-- The RPCs below become the sole write path (mirrors 202609140003's switch
-- for clarifications): notifications need the service role to insert, and
-- authorization — including the Lead fallback for an unassigned event — is
-- richer than RLS can express. Read access (the existing select policy)
-- already covers the organiser, the assigned coordinator, and any Lead via
-- can_view_event.
drop policy "organisers submit change requests" on public.event_change_requests;
drop policy "assigned coordinators review change requests" on public.event_change_requests;

create function public.submit_event_change_request(
  p_event_id uuid,
  p_requested_changes jsonb,
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
  new_request_id uuid;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot submit a change request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to submit a change request'
      using errcode = 'insufficient_privilege';
  end if;

  if reason_value is null then
    raise exception 'Explain the reason for this change request'
      using errcode = 'check_violation';
  end if;

  if p_requested_changes is null or p_requested_changes = '{}'::jsonb then
    raise exception 'Describe the change you are requesting'
      using errcode = 'check_violation';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.organiser_id <> actor_id then
    raise exception 'Only the event organiser can submit a change request'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status not in ('requested', 'planning', 'confirmed', 'pending_safety_check') then
    raise exception 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event'
      using errcode = 'check_violation';
  end if;

  -- AC04/AC08: one open request at a time — a second submission while one is
  -- already Pending Review would make "the" outcome ambiguous and complicate
  -- withdrawal.
  if exists (
    select 1 from public.event_change_requests
    where event_id = p_event_id and status = 'pending'
  ) then
    raise exception 'This event already has a change request pending review'
      using errcode = 'check_violation';
  end if;

  insert into public.event_change_requests (event_id, requested_by, requested_changes, reason)
  values (p_event_id, actor_id, p_requested_changes, reason_value)
  returning id into new_request_id;

  if event_row.assigned_coordinator_id is not null then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      event_row.assigned_coordinator_id,
      p_event_id,
      'event_change'::public.notification_type,
      'Change request submitted',
      'A change request was submitted for "' || event_row.title || '" and needs your review.'
    );
  else
    -- Only a Requested event can reach here unassigned: the status check
    -- above already excludes draft, and every other allowed status requires
    -- an assigned coordinator (events_assignment_after_submission).
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'event_change'::public.notification_type,
      'Change request submitted',
      'A change request was submitted for the unassigned event "' || event_row.title
        || '" and needs a coordinator''s review.'
    from public.profiles p
    where p.role = 'event_coordinator_lead'::public.user_role;
  end if;

  return jsonb_build_object('id', new_request_id, 'status', 'pending');
end;
$$;

revoke all on function public.submit_event_change_request(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.submit_event_change_request(uuid, jsonb, text, uuid) to authenticated, service_role;

create function public.decide_event_change_request(
  p_change_request_id uuid,
  p_decision public.event_decision_type,
  p_review_notes text default null,
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
  request_row public.event_change_requests;
  event_row public.events;
  notes_value text := nullif(trim(coalesce(p_review_notes, '')), '');
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot decide a change request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to decide a change request'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'rejected' and notes_value is null then
    raise exception 'Explain the reason for rejecting this change request'
      using errcode = 'check_violation';
  end if;

  select * into request_row from public.event_change_requests where id = p_change_request_id for update;

  if not found then
    raise exception 'Change request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = request_row.event_id;
  select role into actor_role from public.profiles where id = actor_id;

  if event_row.assigned_coordinator_id is not null then
    if event_row.assigned_coordinator_id <> actor_id then
      raise exception 'Only the assigned coordinator can decide this change request'
        using errcode = 'insufficient_privilege';
    end if;
  elsif actor_role is distinct from 'event_coordinator_lead'::public.user_role then
    -- Mirrors submit_event_change_request's own unassigned-event branch:
    -- only a Requested event can be unassigned, and only a Lead may stand in
    -- while it is.
    raise exception 'Only the Coordinator Lead can decide this change request while the event has no assigned coordinator'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only a change request Pending Review can be decided'
      using errcode = 'check_violation';
  end if;

  update public.event_change_requests
  set status = p_decision::text,
      reviewed_by = actor_id,
      review_notes = notes_value,
      reviewed_at = now()
  where id = p_change_request_id;

  insert into public.notifications (recipient_id, event_id, type, title, message)
  values (
    request_row.requested_by,
    request_row.event_id,
    'event_change'::public.notification_type,
    case when p_decision = 'approved' then 'Change request approved' else 'Change request rejected' end,
    case when p_decision = 'approved'
      then 'Your change request for "' || event_row.title || '" was approved.'
      else 'Your change request for "' || event_row.title || '" was rejected: ' || notes_value
    end
  );

  return jsonb_build_object('id', p_change_request_id, 'status', p_decision::text);
end;
$$;

revoke all on function public.decide_event_change_request(uuid, public.event_decision_type, text, uuid) from public, anon;
grant execute on function public.decide_event_change_request(uuid, public.event_decision_type, text, uuid) to authenticated, service_role;

-- AC08: the organiser may withdraw before a decision is made.
create function public.withdraw_event_change_request(
  p_change_request_id uuid,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  request_row public.event_change_requests;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot withdraw a change request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to withdraw a change request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into request_row from public.event_change_requests where id = p_change_request_id for update;

  if not found then
    raise exception 'Change request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.requested_by <> actor_id then
    raise exception 'Only the organiser who submitted this request can withdraw it'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only a change request Pending Review can be withdrawn'
      using errcode = 'check_violation';
  end if;

  update public.event_change_requests
  set status = 'withdrawn', withdrawn_at = now()
  where id = p_change_request_id;

  return p_change_request_id;
end;
$$;

revoke all on function public.withdraw_event_change_request(uuid, uuid) from public, anon;
grant execute on function public.withdraw_event_change_request(uuid, uuid) to authenticated, service_role;
