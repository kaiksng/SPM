-- Cancel an Event Request (Organiser).
--
-- As an Event Organiser, I want to delete/cancel my own event request before
-- the Event Coordinator approves or rejects it, so I can withdraw a request I
-- no longer need.
--
-- AC01 Only the organiser who submitted the event may cancel it.
-- AC02 Only a Requested event (i.e. one still awaiting the coordinator's
--      decision) can be cancelled this way — once it has moved to Planning
--      or Rejected, this action is no longer available. (Draft events already
--      have their own delete path — the "organisers delete their drafts" RLS
--      policy, 202609120001 — and are out of scope here.)
-- AC03 An event with an unresolved (open or answered, not yet resolved)
--      clarification cannot be cancelled until that clarification is closed.
-- AC04 Cancelling sets the event's status to Cancelled rather than deleting
--      the row — event_status_transition_allowed already permits
--      requested -> cancelled, and this preserves the audit trail
--      (event_status_history, any notifications already sent to the
--      assigned coordinator) the same way withdraw_venue_booking_request
--      preserves a venue booking's history instead of deleting it.
create or replace function public.cancel_event_request(
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
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot cancel an event request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to cancel an event request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC01.
  if event_row.organiser_id is distinct from actor_id then
    raise exception 'Only the organiser who submitted this event can cancel it'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC02.
  if event_row.status <> 'requested' then
    raise exception 'Only a Requested event can be cancelled before it is decided'
      using errcode = 'check_violation';
  end if;

  -- AC03. Same check decide_event_request applies before a coordinator's own
  -- decision — an open question shouldn't be sidestepped by cancelling out
  -- from under it either.
  if public.event_has_unresolved_clarification(p_event_id) then
    raise exception 'This event has an unresolved clarification and cannot be cancelled until it is closed'
      using errcode = 'check_violation';
  end if;

  -- AC04.
  update public.events
  set status = 'cancelled'
  where id = p_event_id;

  return jsonb_build_object('eventId', p_event_id, 'status', 'cancelled', 'cancelledAt', now());
end;
$$;

revoke all on function public.cancel_event_request(uuid, uuid) from public;
revoke all on function public.cancel_event_request(uuid, uuid) from anon;
grant execute on function public.cancel_event_request(uuid, uuid) to authenticated;
grant execute on function public.cancel_event_request(uuid, uuid) to service_role;
