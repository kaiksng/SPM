-- Cancel an Event (Event Coordinator).
--
-- "As an Event Coordinator, I want to cancel an event that can no longer
-- proceed, so that all commitments and affected users are handled
-- consistently."
--
-- AC1 Only the assigned coordinator can cancel; an unassigned event or
--     another coordinator's event is denied.
-- AC2 Cancellable from Requested, Planning, Pending Safety Check, Confirmed
--     only — event_status_transition_allowed (202610100002) already
--     restricts 'cancelled' to exactly this set, this is defense in depth.
-- AC3 A reason is required.
-- AC4 The status becomes Cancelled; actor, reason and time are recorded in
--     event_status_history (reason/changed_by columns have existed since
--     202609060001, unused until now).
-- AC5/AC6 All of the event's venue bookings and active tentative holds
--     ('pending'/'approved'/'on_hold') are released in one place (this is
--     the only path that releases every booking at once — SPM-85's
--     withdraw_venue_booking_request still only releases one and doesn't
--     cover 'on_hold'). Equipment reservations are released automatically
--     by the events_release_equipment_reservations trigger (202610150002);
--     this function backfills its released_by, which is null when called
--     via the backend's service role.
-- AC7 Notifications (type 'cancellation', added unused in 202609220001) go
--     to the organiser, the assigned coordinator, every registered
--     attendee, venue_staff (if a booking was released), technical_support_
--     staff (if a reservation was released), and safety_officer (broadcast,
--     same as submit_event_for_safety_check, only if the event was Pending
--     Safety Check).
-- AC8 New venue/equipment/hold actions are already blocked once Cancelled
--     by each of those functions' own status gates; the one gap is
--     event_registrations' insert policy, closed below.
-- AC9 Nothing is deleted; existing can_view_event-scoped history stays
--     visible.

create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason text,
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
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_booking public.venue_bookings;
  v_released_booking boolean := false;
  v_released_reservation boolean := false;
begin
  if auth.uid() is not null then
    if p_actor_id is not null and p_actor_id <> auth.uid() then
      raise exception 'You cannot cancel an event on behalf of another user'
        using errcode = 'insufficient_privilege';
    end if;
    actor_id := auth.uid();
  else
    actor_id := p_actor_id;
  end if;

  if actor_id is null then
    raise exception 'You must sign in to cancel an event'
      using errcode = 'insufficient_privilege';
  end if;

  select * into event_row from public.events where id = p_event_id for update;

  if not found then
    raise exception 'Event not found'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC1.
  if event_row.assigned_coordinator_id is distinct from actor_id then
    raise exception 'Only the assigned coordinator can cancel this event'
      using errcode = 'insufficient_privilege';
  end if;

  -- AC2.
  if event_row.status not in ('requested', 'planning', 'pending_safety_check', 'confirmed') then
    raise exception 'An event with status % cannot be cancelled', event_row.status
      using errcode = 'check_violation';
  end if;

  -- AC3.
  if v_reason is null then
    raise exception 'Give a reason for cancelling this event'
      using errcode = 'check_violation';
  end if;

  -- AC4. Fires enforce_event_status_transition and record_event_status_change
  -- (history row) and events_release_equipment_reservations (equipment
  -- auto-release) as side effects.
  update public.events set status = 'cancelled' where id = p_event_id;

  update public.event_status_history
  set changed_by = actor_id, reason = v_reason
  where event_id = p_event_id
    and to_status = 'cancelled'
    and changed_at = now()
    and changed_by is null;

  -- AC5: equipment release attribution. events_release_equipment_reservations
  -- already set status/released_at; auth.uid() is null here (service role),
  -- so stamp the actor it couldn't.
  if exists (
    select 1 from public.equipment_reservations
    where event_id = p_event_id and status = 'cancelled' and released_at = now()
  ) then
    v_released_reservation := true;

    update public.equipment_reservations
    set released_by = actor_id
    where event_id = p_event_id and status = 'cancelled' and released_at = now() and released_by is null;

    update public.equipment_reservation_events ev
    set actor = actor_id
    from public.equipment_reservations r
    where ev.reservation_id = r.id
      and r.event_id = p_event_id
      and ev.action = 'released'
      and ev.actor is null
      and ev.occurred_at = now();
  end if;

  -- AC5/AC6: release every active venue booking/hold in one place.
  for v_booking in
    select * from public.venue_bookings
    where event_id = p_event_id and status in ('pending', 'approved', 'on_hold')
    for update
  loop
    v_released_booking := true;

    update public.venue_bookings
    set status = 'cancelled',
        cancellation_reason = v_reason,
        cancelled_by = actor_id,
        cancelled_at = now()
    where id = v_booking.id;

    update public.venue_booking_disruptions
    set cleared_at = now(), cleared_by = actor_id
    where booking_id = v_booking.id and cleared_at is null;

    -- A hold's "confirm before it expires" reminders no longer apply.
    delete from public.notifications
    where booking_id = v_booking.id and scheduled_for > now();
  end loop;

  -- AC7.
  insert into public.notifications (recipient_id, event_id, type, title, message)
  values
    (event_row.organiser_id, p_event_id, 'cancellation'::public.notification_type,
     'Event cancelled',
     'The event "' || event_row.title || '" was cancelled: ' || v_reason),
    (actor_id, p_event_id, 'cancellation'::public.notification_type,
     'Event cancelled',
     'You cancelled the event "' || event_row.title || '": ' || v_reason);

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    r.attendee_id,
    p_event_id,
    'cancellation'::public.notification_type,
    'Event cancelled',
    'The event "' || event_row.title || '" you registered for was cancelled: ' || v_reason
  from public.event_registrations r
  where r.event_id = p_event_id and r.status = 'registered';

  if v_released_booking then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled and its venue booking(s) released: ' || v_reason
    from public.profiles p
    where p.role = 'venue_staff'::public.user_role;
  end if;

  if v_released_reservation then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled and its equipment reservation(s) released: ' || v_reason
    from public.profiles p
    where p.role = 'technical_support_staff'::public.user_role;
  end if;

  if event_row.status = 'pending_safety_check' then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled before its safety check was completed: ' || v_reason
    from public.profiles p
    where p.role = 'safety_officer'::public.user_role;
  end if;

  return jsonb_build_object('eventId', p_event_id, 'status', 'cancelled', 'cancelledAt', now());
end;
$$;

revoke all on function public.cancel_event(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_event(uuid, text, uuid) to authenticated, service_role;

-- AC8: close the one gap not already covered by other functions' own status
-- gates (venue booking submission/replacement, equipment reservation) —
-- registering for a cancelled event was never blocked.
drop policy "attendees register themselves" on public.event_registrations;

create policy "attendees register themselves" on public.event_registrations
for insert to authenticated
with check (
  attendee_id = auth.uid()
  and public.current_user_role() = 'attendee'
  and public.can_view_event(event_id)
  and (select e.status from public.events e where e.id = event_id) <> 'cancelled'
);
