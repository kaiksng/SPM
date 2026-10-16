-- withdraw_venue_booking_request regressed back to checking who originally
-- submitted the request (venue_bookings.requested_by). 202610050005 had
-- already fixed this once, checking the event's *current*
-- assigned_coordinator_id instead, so a reassignment immediately hands off
-- responsibility for a pending request — but 202610070006 dropped that
-- 1-argument function and recreated a 2-argument version (for p_actor_id +
-- the venue-staff notification) using the original requested_by check,
-- undoing the fix. SPM-84 AC8 ("pending booking requests become the new
-- coordinator's responsibility") requires the assignment-based check, so
-- this restores it on top of 202610070006's current shape.
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

  if not exists (
    select 1 from public.events e
    where e.id = booking_row.event_id and e.assigned_coordinator_id = actor_id
  ) then
    raise exception 'Only the event''s assigned coordinator can withdraw this request'
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
