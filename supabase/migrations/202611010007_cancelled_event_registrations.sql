-- A cancelled event takes its attendees' registrations with it.
--
-- Until now cancel_event notified Registered attendees but left their
-- registrations as Registered (and waiting-list attendees were neither
-- changed nor told), so a cancelled event still showed "Registered" with a
-- Withdraw button in My Registrations.
--
-- * A new registration status, event_cancelled: the attendee was Registered
--   or on the waiting list when the event was cancelled. It is kept apart
--   from Withdrawn, which stays the attendee's own choice (SPM-43/44), and
--   status_before_cancellation records which of the two it was (SPM-45:
--   registrations remain available for audit).
-- * cancel_event (last 202611010002) moves Registered and waiting-list
--   registrations to event_cancelled and notifies both. Otherwise unchanged.
-- * Registrations on events that were already Cancelled are moved the same
--   way, without new notifications: those attendees were already told.
--
-- Places and waiting-list positions count only Registered and waiting-list
-- rows, so event_cancelled rows drop out of them without further changes.

alter table public.event_registrations
  drop constraint event_registrations_status_check,
  add constraint event_registrations_status_check
    check (status in ('registered', 'waitlisted', 'withdrawn', 'event_cancelled')),
  add column status_before_cancellation text
    check (status_before_cancellation in ('registered', 'waitlisted')),
  add constraint event_registrations_cancellation_status_recorded
    check ((status = 'event_cancelled') = (status_before_cancellation is not null));

comment on column public.event_registrations.status_before_cancellation is
  'For an event_cancelled registration: whether the attendee was registered or waitlisted when the event was cancelled.';

update public.event_registrations r
set status_before_cancellation = r.status,
    status = 'event_cancelled'
from public.events e
where e.id = r.event_id
  and e.status = 'cancelled'
  and r.status in ('registered', 'waitlisted');

CREATE OR REPLACE FUNCTION public.cancel_event(p_event_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  set changed_by = coalesce(changed_by, actor_id), reason = v_reason
  where event_id = p_event_id
    and to_status = 'cancelled'
    and changed_at = now()
    and reason is null;

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
     'The event "' || event_row.title || '" was cancelled.'),
    (actor_id, p_event_id, 'cancellation'::public.notification_type,
     'Event cancelled',
     'You cancelled the event "' || event_row.title || '".');

  -- Registered and waiting-list attendees no longer have a place: their
  -- registrations become Event cancelled, keeping what they were for the
  -- record (SPM-45: registrations stay available for audit). Withdrawn ones
  -- were the attendee's own choice and are left as they are.
  update public.event_registrations
  set status_before_cancellation = status,
      status = 'event_cancelled'
  where event_id = p_event_id and status in ('registered', 'waitlisted');

  insert into public.notifications (recipient_id, event_id, type, title, message)
  select
    r.attendee_id,
    p_event_id,
    'cancellation'::public.notification_type,
    'Event cancelled',
    case r.status_before_cancellation
      when 'waitlisted' then 'The event "' || event_row.title || '" you were on the waiting list for was cancelled.'
      else 'The event "' || event_row.title || '" you registered for was cancelled.'
    end
  from public.event_registrations r
  where r.event_id = p_event_id and r.status = 'event_cancelled';

  if v_released_booking then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    select
      p.id,
      p_event_id,
      'cancellation'::public.notification_type,
      'Event cancelled',
      'The event "' || event_row.title || '" was cancelled and its venue booking(s) released.'
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
      'The event "' || event_row.title || '" was cancelled and its equipment reservation(s) released.'
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
      'The event "' || event_row.title || '" was cancelled before its safety check was completed.'
    from public.profiles p
    where p.role = 'safety_officer'::public.user_role;
  end if;

  return jsonb_build_object('eventId', p_event_id, 'status', 'cancelled', 'cancelledAt', now());
end;
$function$;
