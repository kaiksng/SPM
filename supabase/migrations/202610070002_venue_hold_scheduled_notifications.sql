-- Three notifications for the tentative-hold flow: an immediate "placed"
-- notice, plus two scheduled reminders (24-hours-before and at-expiry),
-- each sent once only. There is no cron anywhere in this codebase (see
-- 202610060004's design note), so neither scheduled notification can be
-- *inserted* at the moment it becomes relevant. Instead all three rows are
-- inserted immediately when the hold is placed; the two reminders each
-- carry a `scheduled_for` timestamp in the future — the same "compute
-- truth at read time" approach expire_stale_venue_holds/find_matching_
-- venues already use for hold status, just applied to notification
-- visibility instead. The frontend's notification queries filter out any
-- row whose scheduled_for hasn't arrived yet; every existing notification
-- type (including the immediate "placed" one) is unaffected (scheduled_for
-- is null for all of them, meaning "visible immediately").
alter table public.notifications
  add column if not exists scheduled_for timestamptz,
  add column if not exists booking_id uuid references public.venue_bookings (id) on delete cascade;

comment on column public.notifications.scheduled_for is
  'Null = visible immediately (every pre-existing notification type). Set = invisible to the recipient until now() reaches this time.';
comment on column public.notifications.booking_id is
  'Which venue_bookings row this notification is about, where that''s ambiguous from event_id alone (an event can have several booking attempts over time). Used only to target cleanup, not to compute visibility.';

-- place_venue_booking_hold: insert all three notification rows up front.
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

  -- Skipped if the hold was placed with under 24 hours left: AC says only
  -- the at-expiry notification fires in that case.
  reminder_at := p_expires_at - interval '24 hours';
  if reminder_at > now() then
    insert into public.notifications
      (recipient_id, event_id, booking_id, type, title, message, scheduled_for)
    values (
      booking_row.requested_by,
      booking_row.event_id,
      p_booking_id,
      'venue_hold_expiring_soon'::public.notification_type,
      'Venue hold expires soon',
      'Your tentative hold on ' || venue_row.name || ' for "' || event_row.title
        || '" expires in 24 hours. Confirm it to keep your place in the queue.',
      reminder_at
    );
  end if;

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'status', 'on_hold',
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.place_venue_booking_hold(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.place_venue_booking_hold(uuid, timestamptz, uuid) to authenticated, service_role;

-- confirm_venue_booking_hold: drop whichever reminder(s) haven't fired yet.
-- decide_venue_booking_request/withdraw_venue_booking_request both require
-- status = 'pending' already, so this is the only path that can take a
-- booking out of 'on_hold' before its own expiry — no other function needs
-- the same cleanup. The immediate "placed" notification (scheduled_for is
-- null) is never matched by scheduled_for > now(), so it's untouched —
-- it's already-delivered history, same as a reminder the coordinator saw
-- before confirming.
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

  delete from public.notifications
  where booking_id = p_booking_id and scheduled_for > now();

  return jsonb_build_object('bookingId', p_booking_id, 'status', 'pending');
end;
$$;

revoke all on function public.confirm_venue_booking_hold(uuid, uuid) from public, anon;
grant execute on function public.confirm_venue_booking_hold(uuid, uuid) to authenticated, service_role;
