begin;

select plan(10);

-- 202610280001: the organiser is notified when registration needs their action.

insert into auth.users (id, email, raw_user_meta_data) values
  ('c6000000-0000-0000-0000-000000000001', 'nra-organiser@example.test', '{"full_name":"NRA Organiser","role":"event_organiser"}'::jsonb),
  ('c6000000-0000-0000-0000-000000000002', 'nra-coordinator@example.test', '{"full_name":"NRA Coordinator","role":"event_coordinator"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('c6000000-0000-0000-0000-000000000010', 'NRA Small Room', 'Block 6', 50),
  ('c6000000-0000-0000-0000-000000000011', 'NRA Big Hall', 'Block 6', 500),
  ('c6000000-0000-0000-0000-000000000012', 'NRA Side Room', 'Block 6', 20);

-- Requested events, about to be approved into Planning:
--   e1 registration required, not set up    e2 required and complete
--   e3 registration not required
-- Planning events, for venue approvals (registration capacity 80):
--   p1 main venue approved too small        p2 main venue big enough
--   p3 too-small venue approved, not main
--   p4 too-small main booking inserted already approved, then re-saved
-- r1 Requested event with a too-small main venue approved (not in Planning).
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c6000000-0000-0000-0000-0000000000e1', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Unset Event', 'requested', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000e2', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Complete Event', 'requested', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000e3', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA No Registration Event', 'requested', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000f1', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Too Small Event', 'planning', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000f2', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Big Enough Event', 'planning', '2099-12-05T10:00:00+08:00', '2099-12-05T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000f3', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Not Main Event', 'planning', '2099-12-06T10:00:00+08:00', '2099-12-06T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000f4', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Resaved Event', 'planning', '2099-12-07T10:00:00+08:00', '2099-12-07T12:00:00+08:00', 80, true),
  ('c6000000-0000-0000-0000-0000000000d1', 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'NRA Requested Venue Event', 'requested', '2099-12-08T10:00:00+08:00', '2099-12-08T12:00:00+08:00', 80, true);

insert into public.event_registration_requirements (event_id, registration_required, registration_opens_at, registration_closes_at, attendee_capacity) values
  ('c6000000-0000-0000-0000-0000000000e1', true, null, null, 80),
  ('c6000000-0000-0000-0000-0000000000e2', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80),
  ('c6000000-0000-0000-0000-0000000000e3', false, null, null, null),
  ('c6000000-0000-0000-0000-0000000000f1', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80),
  ('c6000000-0000-0000-0000-0000000000f2', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80),
  ('c6000000-0000-0000-0000-0000000000f3', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80),
  ('c6000000-0000-0000-0000-0000000000f4', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80),
  ('c6000000-0000-0000-0000-0000000000d1', true, '2099-11-01T09:00:00+08:00', '2099-11-30T18:00:00+08:00', 80);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue) values
  ('c6000000-0000-0000-0000-0000000000b1', 'c6000000-0000-0000-0000-0000000000f1', 'c6000000-0000-0000-0000-000000000010', 'c6000000-0000-0000-0000-000000000002', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 'pending', true),
  ('c6000000-0000-0000-0000-0000000000b2', 'c6000000-0000-0000-0000-0000000000f2', 'c6000000-0000-0000-0000-000000000011', 'c6000000-0000-0000-0000-000000000002', '2099-12-05T10:00:00+08:00', '2099-12-05T12:00:00+08:00', 'pending', true),
  ('c6000000-0000-0000-0000-0000000000b3', 'c6000000-0000-0000-0000-0000000000f3', 'c6000000-0000-0000-0000-000000000012', 'c6000000-0000-0000-0000-000000000002', '2099-12-06T10:00:00+08:00', '2099-12-06T12:00:00+08:00', 'pending', false),
  ('c6000000-0000-0000-0000-0000000000b4', 'c6000000-0000-0000-0000-0000000000f4', 'c6000000-0000-0000-0000-000000000010', 'c6000000-0000-0000-0000-000000000002', '2099-12-07T10:00:00+08:00', '2099-12-07T12:00:00+08:00', 'approved', true),
  ('c6000000-0000-0000-0000-0000000000b5', 'c6000000-0000-0000-0000-0000000000d1', 'c6000000-0000-0000-0000-000000000010', 'c6000000-0000-0000-0000-000000000002', '2099-12-08T10:00:00+08:00', '2099-12-08T12:00:00+08:00', 'pending', true);

-- 1. Entering Planning.
update public.events set status = 'planning'
where id in (
  'c6000000-0000-0000-0000-0000000000e1',
  'c6000000-0000-0000-0000-0000000000e2',
  'c6000000-0000-0000-0000-0000000000e3'
);

select results_eq(
  $$select recipient_id, type::text, title from public.notifications
    where event_id = 'c6000000-0000-0000-0000-0000000000e1'$$,
  $$values ('c6000000-0000-0000-0000-000000000001'::uuid, 'registration_update', 'Set up registration')$$,
  'entering Planning with required registration not set up notifies the organiser'
);
select ok(
  (select message from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000e1')
    like '%"NRA Unset Event"%opening time, closing time and capacity%',
  'the set-up message names the event and the missing settings'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000e2'),
  0,
  'entering Planning with registration already complete sends nothing'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000e3'),
  0,
  'entering Planning without required registration sends nothing'
);

-- An update that leaves the event in Planning doesn't notify again.
update public.events set title = 'NRA Unset Event Renamed'
where id = 'c6000000-0000-0000-0000-0000000000e1';
update public.events set status = 'planning'
where id = 'c6000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000e1'),
  1,
  'staying in Planning does not repeat the set-up notification'
);

-- 2. Main venue approved.
update public.venue_bookings set status = 'approved'
where id in (
  'c6000000-0000-0000-0000-0000000000b1',
  'c6000000-0000-0000-0000-0000000000b2',
  'c6000000-0000-0000-0000-0000000000b3',
  'c6000000-0000-0000-0000-0000000000b5'
);
update public.venue_bookings set status = 'approved'
where id = 'c6000000-0000-0000-0000-0000000000b4';

select results_eq(
  $$select recipient_id, type::text, title, message from public.notifications
    where event_id = 'c6000000-0000-0000-0000-0000000000f1'$$,
  $$values (
    'c6000000-0000-0000-0000-000000000001'::uuid,
    'registration_update',
    'Registration capacity too high',
    'Registration capacity for "NRA Too Small Event" (80) is more than the approved venue''s capacity (50). Lower it so the event can proceed to the safety check.'
  )$$,
  'approving a main venue smaller than registration capacity notifies the organiser'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000f2'),
  0,
  'approving a main venue big enough for registration sends nothing'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000f3'),
  0,
  'approving a venue that is not the main venue sends nothing'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000f4'),
  1,
  'a too-small main booking inserted as approved notifies once; re-saving it sends nothing more'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'c6000000-0000-0000-0000-0000000000d1'),
  0,
  'a venue approved for an event not in Planning sends nothing'
);

select * from finish();
rollback;
