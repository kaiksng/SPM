-- Restore the organiser registration notifications on the hosted project.
--
-- 202610280002_notify_organiser_registration_action.sql is recorded as
-- applied on the hosted project, but its two functions and three triggers
-- are missing there: they were removed outside the migrations (an
-- uncommitted "remote_schema" entry, 20261030091922, recorded the hosted
-- schema without them). A comparison of the hosted and local public schemas
-- found no other difference.
--
-- This re-creates them exactly as 202610280002 defines them. Functions are
-- create-or-replace and each trigger is dropped if present first, so on a
-- database that still has them (every local one) nothing changes.

-- 1. Entering Planning with required registration not set up.
create or replace function public.notify_organiser_registration_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.event_registration_requirements;
begin
  select * into v_registration
  from public.event_registration_requirements
  where event_id = new.id;

  -- Same "incomplete" rule as event_readiness's registration_incomplete.
  if v_registration.registration_required
    and (
      v_registration.registration_opens_at is null
      or v_registration.registration_closes_at is null
      or v_registration.attendee_capacity is null
    )
  then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      new.organiser_id,
      new.id,
      'registration_update'::public.notification_type,
      'Set up registration',
      'Set up registration for "' || new.title || '": add the opening time, closing time and '
        || 'capacity so the event can proceed to the safety check.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists events_notify_organiser_registration_setup on public.events;
create trigger events_notify_organiser_registration_setup
after update of status on public.events
for each row
when (new.status = 'planning' and old.status is distinct from 'planning')
execute function public.notify_organiser_registration_setup();

-- 2. A main venue approved with less capacity than registration allows.
create or replace function public.notify_organiser_registration_over_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_registration public.event_registration_requirements;
  v_venue_capacity integer;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.status is distinct from 'planning' then
    return new;
  end if;

  select * into v_registration
  from public.event_registration_requirements
  where event_id = new.event_id;

  select capacity into v_venue_capacity from public.venues where id = new.venue_id;

  -- Same rule as event_readiness's registration_over_capacity.
  if v_registration.registration_required
    and v_registration.attendee_capacity is not null
    and v_venue_capacity is not null
    and v_registration.attendee_capacity > v_venue_capacity
  then
    insert into public.notifications (recipient_id, event_id, type, title, message)
    values (
      v_event.organiser_id,
      v_event.id,
      'registration_update'::public.notification_type,
      'Registration capacity too high',
      'Registration capacity for "' || v_event.title || '" (' || v_registration.attendee_capacity
        || ') is more than the approved venue''s capacity (' || v_venue_capacity
        || '). Lower it so the event can proceed to the safety check.'
    );
  end if;

  return new;
end;
$$;

-- Fires when a booking becomes an approved main venue: approved while main,
-- or designated main while approved (202610170005). Updates only on the
-- change itself (OLD isn't available to an INSERT trigger's WHEN, hence two
-- triggers), so re-saving an already-approved main booking sends nothing.
drop trigger if exists venue_bookings_notify_organiser_registration_over_capacity_inse on public.venue_bookings;
create trigger venue_bookings_notify_organiser_registration_over_capacity_insert
after insert on public.venue_bookings
for each row
when (new.status = 'approved' and new.is_main_venue)
execute function public.notify_organiser_registration_over_capacity();

drop trigger if exists venue_bookings_notify_organiser_registration_over_capacity_upda on public.venue_bookings;
create trigger venue_bookings_notify_organiser_registration_over_capacity_update
after update of status, is_main_venue on public.venue_bookings
for each row
when (
  new.status = 'approved' and new.is_main_venue
  and (old.status is distinct from 'approved' or not old.is_main_venue)
)
execute function public.notify_organiser_registration_over_capacity();
