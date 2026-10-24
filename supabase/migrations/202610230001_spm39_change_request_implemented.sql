-- SPM-39: Review and implement an event change request.
--
-- An approved request is now applied as its own step
-- (apply_event_change_request, 202610230005), after which it is Implemented
-- and cannot be applied again (AC07). implemented_by/implemented_at record
-- who applied it and when, alongside SPM-38's reviewed_by/reviewed_at for
-- the decision itself.
alter table public.event_change_requests
  add column implemented_by uuid references public.profiles (id),
  add column implemented_at timestamptz;

alter table public.event_change_requests
  drop constraint event_change_requests_status_check;
alter table public.event_change_requests
  add constraint event_change_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'implemented'));

-- AC05: implementation notes are required on approval. Otherwise identical
-- to SPM-38's decide_event_change_request (202610200013), including its
-- authority rule: the assigned coordinator, or a Coordinator Lead while the
-- event has no assigned coordinator. The new check runs after the
-- authority and status checks so an unauthorised caller still gets 42501.
create or replace function public.decide_event_change_request(
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
    raise exception 'Only the Coordinator Lead can decide this change request while the event has no assigned coordinator'
      using errcode = 'insufficient_privilege';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only a change request Pending Review can be decided'
      using errcode = 'check_violation';
  end if;

  if p_decision = 'approved' and notes_value is null then
    raise exception 'Add implementation notes before approving this change request'
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
