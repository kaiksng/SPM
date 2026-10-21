-- SPM-46 AC01/AC02: an event can be marked Completed only once it has
-- actually finished — its scheduled end time plus its venue's turnaround
-- time. An event with several venue bookings finishes when the last of them
-- has been turned around, using the same effective window venue
-- availability uses (venue_effective_window, 202610100003). A venue with no
-- turnaround time adds nothing, and an event with no Approved booking falls
-- back to its own end time.
--
-- Security invoker on purpose: under RLS a caller only gets an answer for
-- an event (and bookings) they can already see. complete_event, a security
-- definer function, calls it as the owner.
create or replace function public.event_completion_available_at(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    e.ends_at,
    (
      select max(upper(public.venue_effective_window(vb.venue_id, vb.starts_at, vb.ends_at)))
      from public.venue_bookings vb
      where vb.event_id = e.id and vb.status = 'approved'
    )
  )
  from public.events e
  where e.id = p_event_id;
$$;

revoke all on function public.event_completion_available_at(uuid) from public, anon;
grant execute on function public.event_completion_available_at(uuid) to authenticated, service_role;

-- Based on 202609250001 (the latest complete_event); only the two checks
-- after the status check are new.
create or replace function public.complete_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  event_row public.events;
  v_available_at timestamptz;
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

  if event_row.assigned_coordinator_id is distinct from auth.uid() then
    raise exception 'Only the assigned coordinator can mark this event completed'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'confirmed' then
    raise exception 'Only a Confirmed event can be marked completed'
      using errcode = 'check_violation';
  end if;

  -- AC02: not before the event's end time plus venue turnaround. The
  -- message names the earliest time, in Singapore time like every other
  -- event time in the app.
  v_available_at := public.event_completion_available_at(p_event_id);

  if v_available_at is null then
    raise exception 'Set this event''s schedule before marking it completed'
      using errcode = 'check_violation';
  end if;

  if now() < v_available_at then
    raise exception 'This event can be marked completed from %',
      to_char(v_available_at at time zone 'Asia/Singapore', 'FMDD Mon YYYY, FMHH12:MI am')
      using errcode = 'check_violation';
  end if;

  -- A hold's expiry is always before its booking starts (place_venue_booking_hold),
  -- so by now any hold on this event has lapsed; expire it rather than
  -- leave it On Hold on a Completed event, where the arrangement lock
  -- (202610210002) would stop the venue's own hold sweep from expiring it.
  -- A request still Pending (e.g. a replacement venue) must be resolved by
  -- Venue Staff first.
  perform public.expire_stale_event_hold(p_event_id);

  if exists (
    select 1 from public.venue_bookings
    where event_id = p_event_id and status in ('pending', 'on_hold')
  ) then
    raise exception 'Resolve this event''s open venue booking requests before marking it completed'
      using errcode = 'check_violation';
  end if;

  update public.events set status = 'completed' where id = p_event_id;

  return jsonb_build_object('eventId', p_event_id, 'status', 'completed', 'completedAt', now());
end;
$$;
