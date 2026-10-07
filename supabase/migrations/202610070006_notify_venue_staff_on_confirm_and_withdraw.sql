-- confirm_venue_booking_hold: notify every venue-staff profile (one
-- undifferentiated pool — no per-venue staff assignment exists anywhere in
-- this schema, same reasoning as submit_venue_booking_request's
-- notification) that a hold they placed is now back in Pending, awaiting
-- their decision.
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
  venue_row public.venues;
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

  select * into event_row from public.events where id = booking_row.event_id;
  select * into venue_row from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    booking_row.event_id,
    p_booking_id,
    'venue_hold_confirmed'::public.notification_type,
    'Venue hold confirmed',
    'The hold on ' || venue_row.name || ' for "' || event_row.title
      || '" has been confirmed and is awaiting your decision.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return jsonb_build_object('bookingId', p_booking_id, 'status', 'pending');
end;
$$;

revoke all on function public.confirm_venue_booking_hold(uuid, uuid) from public, anon;
grant execute on function public.confirm_venue_booking_hold(uuid, uuid) to authenticated, service_role;

-- withdraw_venue_booking_request: same notification treatment, plus the
-- same p_actor_id fallback idiom decide/submit/place/confirm all use —
-- inserting into notifications means this can no longer rely on auth.uid()
-- alone, since it now has to be callable from the backend's service-role
-- client (no INSERT policy on notifications for regular users). Adding a
-- parameter changes the function's identity, so the old one-argument
-- version is dropped explicitly first (CREATE OR REPLACE on a different
-- signature would create a second, separate overload rather than replacing
-- it — same reasoning as 202610060010's submit_venue_booking_request change).
drop function if exists public.withdraw_venue_booking_request(uuid);

create or replace function public.withdraw_venue_booking_request(
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
  venue_row public.venues;
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

  select * into booking_row from public.venue_bookings where id = p_booking_id;

  if not found then
    raise exception 'Venue booking request not found'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.requested_by is distinct from actor_id then
    raise exception 'Only the coordinator who submitted this request can withdraw it'
      using errcode = 'insufficient_privilege';
  end if;

  if booking_row.status <> 'pending' then
    raise exception 'Only a Pending venue booking request can be withdrawn'
      using errcode = 'check_violation';
  end if;

  update public.venue_bookings
  set status = 'cancelled'
  where id = p_booking_id;

  select * into event_row from public.events where id = booking_row.event_id;
  select * into venue_row from public.venues where id = booking_row.venue_id;

  insert into public.notifications (recipient_id, event_id, booking_id, type, title, message)
  select
    p.id,
    booking_row.event_id,
    p_booking_id,
    'venue_request_withdrawn'::public.notification_type,
    'Venue booking request withdrawn',
    'The request for ' || venue_row.name || ' for "' || event_row.title
      || '" was withdrawn by the coordinator.'
  from public.profiles p
  where p.role = 'venue_staff'::public.user_role;

  return p_booking_id;
end;
$$;

revoke all on function public.withdraw_venue_booking_request(uuid, uuid) from public, anon;
grant execute on function public.withdraw_venue_booking_request(uuid, uuid) to authenticated, service_role;
