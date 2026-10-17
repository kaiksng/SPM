-- SPM-85 slice 2.
--   * The event's assigned coordinator withdraws a Pending booking or cancels an
--     Approved one, and must give a reason. Only that booking is released; the event's other
--     bookings keep their states. Venue Staff are notified. A disruption on the
--     released booking is closed. A booking with an active replacement must
--     have the replacement withdrawn first.
--   * The coordinator chooses which active booking is the event's main venue.
alter table public.venue_bookings
  add column cancellation_reason text,
  add column cancelled_by uuid references public.profiles (id),
  add column cancelled_at timestamptz;

comment on column public.venue_bookings.cancellation_reason is
  'SPM-85: why the coordinator withdrew or cancelled this booking.';

drop function if exists public.withdraw_venue_booking_request(uuid, uuid);

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

  -- The event's current coordinator (not whoever submitted the request), so a
  -- reassignment hands pending bookings over (SPM-84 AC8, 202610160005).
  if not exists (
    select 1 from public.events e
    where e.id = booking_row.event_id and e.assigned_coordinator_id = actor_id
  ) then
    raise exception 'Only the event''s assigned coordinator can withdraw this request'
      using errcode = 'insufficient_privilege';
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

  select * into event_row from public.events where id = booking_row.event_id;
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

create or replace function public.set_main_venue_booking(
  p_booking_id uuid,
  p_actor_id uuid default null
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
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot change the main venue on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to change the main venue'
      using errcode = 'insufficient_privilege';
  end if;

  select * into booking_row from public.venue_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Venue booking not found'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = booking_row.event_id;

  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can change the main venue of this event'
      using errcode = 'insufficient_privilege';
  end if;

  if event_row.status <> 'planning' then
    raise exception 'The main venue can only be changed while the event is in Planning'
      using errcode = 'check_violation';
  end if;

  perform public.expire_stale_event_hold(booking_row.event_id);
  select * into booking_row from public.venue_bookings where id = p_booking_id;

  if booking_row.status not in ('pending', 'approved', 'on_hold')
    or booking_row.replaces_booking_id is not null then
    raise exception 'Only an active venue booking can be made the main venue'
      using errcode = 'check_violation';
  end if;

  if booking_row.is_main_venue then
    return p_booking_id;
  end if;

  update public.venue_bookings
  set is_main_venue = false
  where event_id = booking_row.event_id
    and replaces_booking_id is null
    and is_main_venue
    and status in ('pending', 'approved', 'on_hold');

  update public.venue_bookings
  set is_main_venue = true
  where id = p_booking_id;

  -- A replacement carries the flag of the booking it replaces.
  update public.venue_bookings r
  set is_main_venue = o.is_main_venue
  from public.venue_bookings o
  where r.replaces_booking_id = o.id
    and r.event_id = booking_row.event_id
    and r.is_main_venue is distinct from o.is_main_venue;

  return p_booking_id;
end;
$$;

revoke all on function public.set_main_venue_booking(uuid, uuid) from public, anon;
grant execute on function public.set_main_venue_booking(uuid, uuid) to authenticated, service_role;
