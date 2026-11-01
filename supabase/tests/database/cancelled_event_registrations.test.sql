begin;
select plan(9);

-- Cancelling an event moves its Registered and waiting-list registrations to
-- Event cancelled and tells both (202611010007_cancelled_event_registrations.sql).
insert into auth.users (id, email, raw_user_meta_data) values
  ('f9400000-0000-0000-0000-000000000001', 'reg-cancel-org@example.test', '{"full_name":"Cancel Organiser","role":"event_organiser"}'::jsonb),
  ('f9400000-0000-0000-0000-000000000002', 'reg-cancel-coord@example.test', '{"full_name":"Cancel Coordinator","role":"event_coordinator"}'::jsonb),
  ('f9400000-0000-0000-0000-000000000003', 'reg-cancel-registered@example.test', '{"full_name":"Registered Attendee","role":"attendee"}'::jsonb),
  ('f9400000-0000-0000-0000-000000000004', 'reg-cancel-waiting@example.test', '{"full_name":"Waiting Attendee","role":"attendee"}'::jsonb),
  ('f9400000-0000-0000-0000-000000000005', 'reg-cancel-withdrawn@example.test', '{"full_name":"Withdrawn Attendee","role":"attendee"}'::jsonb);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at) values
  ('f9400000-0000-0000-0000-0000000000e1', 'f9400000-0000-0000-0000-000000000001', 'f9400000-0000-0000-0000-000000000002',
   'Cancelled Roundtable', 'confirmed', '2099-10-01T10:00:00+08:00', '2099-10-01T12:00:00+08:00');

insert into public.event_registrations (event_id, attendee_id, status) values
  ('f9400000-0000-0000-0000-0000000000e1', 'f9400000-0000-0000-0000-000000000003', 'registered'),
  ('f9400000-0000-0000-0000-0000000000e1', 'f9400000-0000-0000-0000-000000000004', 'waitlisted'),
  ('f9400000-0000-0000-0000-0000000000e1', 'f9400000-0000-0000-0000-000000000005', 'withdrawn');

create function pg_temp.registration(p_attendee uuid) returns text language sql as $$
  select status || '/' || coalesce(status_before_cancellation, '-') from public.event_registrations
  where event_id = 'f9400000-0000-0000-0000-0000000000e1' and attendee_id = p_attendee
$$;
create function pg_temp.cancellation_message(p_attendee uuid) returns text language sql as $$
  select message from public.notifications
  where event_id = 'f9400000-0000-0000-0000-0000000000e1' and recipient_id = p_attendee and type = 'cancellation'
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9400000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.cancel_event('f9400000-0000-0000-0000-0000000000e1', 'Venue closed');
reset role;

select is(pg_temp.registration('f9400000-0000-0000-0000-000000000003'), 'event_cancelled/registered',
  'a Registered attendee''s registration becomes Event cancelled, recording they were registered');
select is(pg_temp.registration('f9400000-0000-0000-0000-000000000004'), 'event_cancelled/waitlisted',
  'a waiting-list registration becomes Event cancelled, recording they were waiting');
select is(pg_temp.registration('f9400000-0000-0000-0000-000000000005'), 'withdrawn/-',
  'an attendee who had already withdrawn stays Withdrawn');

select is(pg_temp.cancellation_message('f9400000-0000-0000-0000-000000000003'),
  'The event "Cancelled Roundtable" you registered for was cancelled.',
  'the registered attendee is notified');
select is(pg_temp.cancellation_message('f9400000-0000-0000-0000-000000000004'),
  'The event "Cancelled Roundtable" you were on the waiting list for was cancelled.',
  'the waiting-list attendee is notified too');
select is(pg_temp.cancellation_message('f9400000-0000-0000-0000-000000000005'), null,
  'the attendee who had withdrawn is not notified');

-- The attendee can still find the event and their registration in My Registrations.
-- (202611010012: attendees read events through attendee_visible_events, not the events table.)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9400000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select r.status || ':' || e.status from public.event_registrations r join public.attendee_visible_events() e on e.id = r.event_id
   where r.attendee_id = 'f9400000-0000-0000-0000-000000000003'),
  'event_cancelled:cancelled',
  'the attendee still sees their registration and the cancelled event'
);
reset role;

select is(
  (select count(*)::int from public.event_registrations
   where event_id = 'f9400000-0000-0000-0000-0000000000e1' and status in ('registered', 'waitlisted')),
  0,
  'nobody holds a place or a waiting-list position on the cancelled event'
);

select throws_ok(
  $$insert into public.event_registrations (event_id, attendee_id, status)
    values ('f9400000-0000-0000-0000-0000000000e1', 'f9400000-0000-0000-0000-000000000001', 'event_cancelled')$$,
  '23514', null,
  'an Event cancelled registration must record what it was before'
);

select * from finish();
rollback;
