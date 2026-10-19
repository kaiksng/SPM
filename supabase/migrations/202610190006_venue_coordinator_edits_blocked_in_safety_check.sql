-- SPM: while an event is Pending Safety Check, the coordinator cannot
-- change its venue arrangements either (AC06). submit_venue_booking_request,
-- request_replacement_venue and set_main_venue_booking already require
-- status = 'planning' and are unaffected. withdraw_venue_booking_request and
-- confirm_venue_booking_hold had no event-status gate at all; both get one
-- here.
create or replace function public.withdraw_venue_booking_request(
  p_booking_id uuid,
  p_actor_id uuid default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  booking_row public.venue_bookings;
  event_row public.events;
  venue_row public.venues;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_was_approved boolean;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot withdraw a venue booking request on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to withdraw a venue booking request'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row from public.venue_bookings where id = p_booking_id for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = booking_row.event_id;

  -- The event's current coordinator (not whoever submitted the request), so a
  -- reassignment hands pending bookings over (SPM-84 AC8, 202610160005).
  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the event''s assigned coordinator can withdraw this request'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status = 'pending_safety_check' then
    raise exception 'Venue bookings cannot be changed while the event is Pending Safety Check'
      using errcode = 'check_violation';
  end if;

  if booking_row.status not in ('pending', 'approved') then
    raise exception 'Only a Pending or Approved venue booking can be withdrawn or cancelled'
      using errcode = 'check_violation';
  end if;

  if v_reason is null then
    raise exception 'Give a reason for withdrawing or cancelling this venue booking'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.venue_bookings r
    where r.replaces_booking_id = booking_row.id
      and r.status in ('pending', 'approved', 'on_hold')
  ) then
    raise exception 'This booking has a pending replacement. Withdraw the replacement first'
      using errcode = 'check_violation';
  end if;

  v_was_approved := booking_row.status = 'approved';

  update public.venue_bookings
  set status = 'cancelled',
      cancellation_reason = v_reason,
      cancelled_by = actor_id,
      cancelled_at = now()
  where id = p_booking_id;

  -- A released booking no longer needs a replacement.
  update public.venue_booking_disruptions
  set cleared_at = now(), cleared_by = actor_id
  where booking_id = p_booking_id and cleared_at is null;

  select * into venue_row from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    booking_row.event_id,
    p_booking_id,
    'venue_request_withdrawn'::public.notification_type,
    case when v_was_approved then 'Venue booking cancelled' else 'Venue booking request withdrawn' end,
    case when v_was_approved
      then 'The confirmed booking "' || booking_row.label || '" at ' || venue_row.name
        || ' for "' || event_row.title || '" was cancelled by the coordinator: ' || v_reason
      else 'The request "' || booking_row.label || '" for ' || venue_row.name
        || ' for "' || event_row.title || '" was withdrawn by the coordinator: ' || v_reason
    end
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return p_booking_id;
end;
$$;

revoke all on function public.withdraw_venue_booking_request(uuid, uuid, text) from public, anon;
grant execute on function public.withdraw_venue_booking_request(uuid, uuid, text) to authenticated, service_role;

-- The requesting coordinator confirms an On Hold request before its
-- deadline. A hold is itself a venue arrangement, so this is blocked too
-- while Pending Safety Check (belt-and-braces: in practice an active hold
-- already keeps the event from being Ready, so this path should not be
-- reached, but the AC is unconditional).
create or replace function public.confirm_venue_booking_hold(
  p_booking_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  booking_row public.venue_bookings;
  event_row public.events;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot confirm a hold on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to confirm a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row
  from public.venue_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.requested_by is distinct from actor_id then
    raise exception 'Only the coordinator who submitted this request can confirm its hold'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = booking_row.event_id;

  if event_row.status = 'pending_safety_check' then
    raise exception 'Venue bookings cannot be changed while the event is Pending Safety Check'
      using errcode = 'check_violation';
  end if;

  if booking_row.status <> 'on_hold' then
    raise exception 'Only a request On Hold can be confirmed'
      using errcode = 'check_violation';
  end if;

  if booking_row.expires_at <= now() then
    update public.venue_bookings set status = 'expired' where id = p_booking_id;
    raise exception 'This hold has expired. Submit a new venue booking request.'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'pending'
  where id = p_booking_id;

  return jsonb_build_object('bookingId', p_booking_id, 'status', 'pending');
end;
$$;

revoke all on function public.confirm_venue_booking_hold(uuid, uuid) from public, anon;
grant execute on function public.confirm_venue_booking_hold(uuid, uuid) to authenticated, service_role;
