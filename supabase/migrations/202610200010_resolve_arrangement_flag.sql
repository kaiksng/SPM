-- Nothing in this codebase ever cleared a needs_review flag: the
-- pre-existing venue capacity-flag feature (202609220010 onward) only ever
-- sets venue_bookings.needs_review = true, and submit_event_for_safety_check
-- never resets it either. That already made a capacity-flagged booking
-- permanently block readiness; the new equipment needs_review column
-- (202610200001) and decide_event_safety_check (202610200006) inherited the
-- same gap, except this is the first flow that actually puts an event in a
-- state where resubmission is expected — so it's the first time it bites.
--
-- The assigned coordinator can self-attest a flagged venue booking or
-- equipment requirement is fixed, same trust level as every other
-- coordinator-entered record in this app (e.g. requirements_acknowledged).
-- No "proof" is required or available regardless of which cause flagged the
-- item (venue capacity reduction or a safety check decision) — event_readiness
-- already treats both causes identically, so resolving does too.
create function public.resolve_arrangement_flag(
  p_event_id uuid,
  p_booking_id uuid default null,
  p_requirement_id uuid default null,
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
      raise exception 'You cannot resolve a flag on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to resolve this flag'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'insufficient_privilege';
  end if;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can resolve this flag'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning'::public.event_status then
    raise exception 'A flag can only be resolved while the event is in Planning'
      using errcode = 'check_violation';
  end if;

  if (p_booking_id is null) = (p_requirement_id is null) then
    raise exception 'Resolve exactly one venue booking or equipment requirement at a time'
      using errcode = 'check_violation';
  end if;

  if p_booking_id is not null then
    update public.venue_bookings
    set needs_review = false, needs_review_reason = null
    where id = p_booking_id and event_id = p_event_id and needs_review = true;

    if not found then
      raise exception 'This venue booking is not flagged for this event'
        using errcode = 'check_violation';
    end if;
  else
    update public.event_equipment_requirements
    set needs_review = false, needs_review_reason = null
    where id = p_requirement_id and event_id = p_event_id and needs_review = true;

    if not found then
      raise exception 'This equipment requirement is not flagged for this event'
        using errcode = 'check_violation';
    end if;
  end if;

  return jsonb_build_object('eventId', p_event_id, 'resolved', true);
end;
$$;

revoke all on function public.resolve_arrangement_flag(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.resolve_arrangement_flag(uuid, uuid, uuid, uuid) to authenticated, service_role;
