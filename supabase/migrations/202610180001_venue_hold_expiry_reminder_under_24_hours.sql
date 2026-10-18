-- Venue hold AC05: "when less than 24 hours remain before expiry, the
-- coordinator receives a 'Venue hold expires soon' notification."
--
-- 202610070002 skipped the reminder when a hold was placed with under 24
-- hours left, so the most urgent holds got no warning. Now such a hold gets
-- the reminder straight away (scheduled_for null), and a longer hold keeps
-- getting it 24 hours before expiry. Either way the message names the actual
-- deadline instead of "in 24 hours", which was wrong for a shorter hold.
-- Identical to 202610070002's version apart from the reminder block.
create or replace function public.place_venue_booking_hold(
  p_booking_id uuid,
  p_expires_at timestamptz,
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
  booking_row public.venue_bookings;
  event_row public.events;
  venue_row public.venues;
  reminder_at timestamptz;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot place a hold on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to place a hold'
      using errcode = 'insufficient_privilege';
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  if actor_role is distinct from 'venue_staff'::public.user_role then
    raise exception 'Only Venue Staff can place a hold'
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

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be put on hold'
      using errcode = 'check_violation';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Enter an expiry date and time in the future'
      using errcode = 'check_violation';
  end if;

  if p_expires_at >= booking_row.starts_at then
    raise exception 'The expiry must be before the requested period starts'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'on_hold',
      expires_at = p_expires_at,
      held_by = actor_id
  where id = p_booking_id;

  select * into event_row from public.events where id = booking_row.event_id;
  select * into venue_row from public.venues where id = booking_row.venue_id;

  -- Immediate: tells the coordinator their request is on hold right now.
  insert into public.notifications
    (recipient_id, event_id, booking_id, type, title, message)
  values (
    booking_row.requested_by,
    booking_row.event_id,
    p_booking_id,
    'venue_hold_placed'::public.notification_type,
    'Venue request on hold',
    'Your venue booking request for ' || venue_row.name || ' ("' || event_row.title
      || '") has been put on hold. Confirm it before the hold expires to keep your place in the queue.'
  );

  insert into public.notifications
    (recipient_id, event_id, booking_id, type, title, message, scheduled_for)
  values (
    booking_row.requested_by,
    booking_row.event_id,
    p_booking_id,
    'venue_hold_expired'::public.notification_type,
    'Venue hold has expired',
    'Your tentative hold on ' || venue_row.name || ' for "' || event_row.title
      || '" has expired. Submit a new venue booking request to try again.',
    p_expires_at
  );

  -- 24 hours before expiry, or straight away (null) when less than 24 hours
  -- are already left. confirm_venue_booking_hold deletes it while it is
  -- still scheduled; one already delivered stays as history.
  reminder_at := p_expires_at - interval '24 hours';
  insert into public.notifications
    (recipient_id, event_id, booking_id, type, title, message, scheduled_for)
  values (
    booking_row.requested_by,
    booking_row.event_id,
    p_booking_id,
    'venue_hold_expiring_soon'::public.notification_type,
    'Venue hold expires soon',
    'Your tentative hold on ' || venue_row.name || ' for "' || event_row.title
      || '" expires at '
      || to_char(p_expires_at at time zone 'Asia/Singapore', 'FMHH12:MI AM "on" DD Mon')
      || '. Confirm it to keep your place in the queue.',
    case when reminder_at > now() then reminder_at end
  );

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'status', 'on_hold',
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.place_venue_booking_hold(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.place_venue_booking_hold(uuid, timestamptz, uuid) to authenticated, service_role;
