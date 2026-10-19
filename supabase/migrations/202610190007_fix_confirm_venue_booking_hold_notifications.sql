-- Fix: 202610190006's rewrite of confirm_venue_booking_hold was based on an
-- outdated copy of the function (202610060004) and silently dropped logic
-- added later by 202610070006 — cancelling the hold's still-scheduled expiry
-- reminder/notice, and notifying Venue Staff that the hold is confirmed and
-- awaiting their decision. 202610190006 itself cannot be edited (already
-- applied); this restores the missing behaviour on top of it.
--
-- Backfilled into version control: this version was already applied
-- directly to the hosted project without a committed migration file. Its
-- content here is copied verbatim from
-- supabase_migrations.schema_migrations so the repo matches what is
-- actually live.
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

  -- Any still-scheduled expiry reminder/notice for this hold no longer
  -- applies now that it is back to Pending (202610070006).
  delete from public.notifications
  where booking_id = p_booking_id and scheduled_for > now();

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
