begin;
select plan(9);

-- Clearer notifications (202611010002_clearer_notifications.sql): reasons are
-- left out, a reassignment names the new coordinator, venue decisions go to
-- the event's current coordinator and name the event and venue, and a venue
-- conflict is also sent to the events' coordinators.
insert into auth.users (id, email, raw_user_meta_data) values
  ('f9200000-0000-0000-0000-000000000001', 'note-lead@example.test', '{"full_name":"Note Lead","role":"event_coordinator_lead"}'::jsonb),
  ('f9200000-0000-0000-0000-000000000002', 'note-old@example.test', '{"full_name":"Old Coordinator","role":"event_coordinator"}'::jsonb),
  ('f9200000-0000-0000-0000-000000000003', 'note-new@example.test', '{"full_name":"New Coordinator","role":"event_coordinator"}'::jsonb),
  ('f9200000-0000-0000-0000-000000000004', 'note-org@example.test', '{"full_name":"Note Organiser","role":"event_organiser"}'::jsonb),
  ('f9200000-0000-0000-0000-000000000005', 'note-staff@example.test', '{"full_name":"Note Staff","role":"venue_staff"}'::jsonb);

insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f9200000-0000-0000-0000-000000000010', 'Note Hall', 'Block 92', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f9200000-0000-0000-0000-0000000000e1', 'f9200000-0000-0000-0000-000000000004', 'f9200000-0000-0000-0000-000000000002',
   'Note Morning', 50, 'planning', '2099-08-01T10:00:00+08:00', '2099-08-01T12:00:00+08:00'),
  ('f9200000-0000-0000-0000-0000000000e2', 'f9200000-0000-0000-0000-000000000004', 'f9200000-0000-0000-0000-000000000002',
   'Note Afternoon', 50, 'planning', '2099-08-01T12:00:00+08:00', '2099-08-01T14:00:00+08:00'),
  ('f9200000-0000-0000-0000-0000000000e3', 'f9200000-0000-0000-0000-000000000004', 'f9200000-0000-0000-0000-000000000002',
   'Note Cancelled', 50, 'planning', '2099-08-02T10:00:00+08:00', '2099-08-02T12:00:00+08:00');

-- Back to back: no overlap until the hall gets setup time.
insert into public.venue_bookings (id, event_id, venue_id, requested_by, requested_at, starts_at, ends_at, status) values
  ('f9200000-0000-0000-0000-0000000000b1', 'f9200000-0000-0000-0000-0000000000e1', 'f9200000-0000-0000-0000-000000000010',
   'f9200000-0000-0000-0000-000000000002', '2099-07-01T09:00:00+08:00', '2099-08-01T10:00:00+08:00', '2099-08-01T12:00:00+08:00', 'pending'),
  ('f9200000-0000-0000-0000-0000000000b2', 'f9200000-0000-0000-0000-0000000000e2', 'f9200000-0000-0000-0000-000000000010',
   'f9200000-0000-0000-0000-000000000002', '2099-07-02T09:00:00+08:00', '2099-08-01T12:00:00+08:00', '2099-08-01T14:00:00+08:00', 'approved');

set local role authenticated;

-- Reassignment: the organiser and the previous coordinator are told who took over.
select set_config('request.jwt.claims', '{"sub":"f9200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.reassign_event_coordinator('f9200000-0000-0000-0000-0000000000e1', 'f9200000-0000-0000-0000-000000000003', 'Workload');
reset role;
select is(
  (select message from public.notifications
   where recipient_id = 'f9200000-0000-0000-0000-000000000004' and title = 'Your event has a new coordinator'),
  'Event "Note Morning" is now coordinated by New Coordinator.',
  'the organiser is told who the new coordinator is'
);
select is(
  (select message from public.notifications
   where recipient_id = 'f9200000-0000-0000-0000-000000000002' and title = 'An event has been reassigned'),
  'Event "Note Morning" is no longer assigned to you. It is now coordinated by New Coordinator.',
  'the previous coordinator is told who took over'
);

-- A venue decision goes to the event's current coordinator and names the event and venue.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9200000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select public.decide_venue_booking_request('f9200000-0000-0000-0000-0000000000b1', 'approved');
reset role;
select is(
  (select recipient_id from public.notifications where type = 'venue_decision' and event_id = 'f9200000-0000-0000-0000-0000000000e1'),
  'f9200000-0000-0000-0000-000000000003'::uuid,
  'the decision goes to the event''s current coordinator, not who made the request'
);
select is(
  (select message from public.notifications where type = 'venue_decision' and event_id = 'f9200000-0000-0000-0000-0000000000e1'),
  'The venue booking request at Note Hall for "Note Morning" has been approved. It is now a confirmed booking for this period.',
  'the decision names the venue and the event'
);

-- A conflict is also sent to each affected event's coordinator.
update public.venues set setup_time_minutes = 30 where id = 'f9200000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9200000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select public.recheck_venue_conflicts('f9200000-0000-0000-0000-000000000010');
reset role;
select is(
  (select message from public.notifications
   where type = 'venue_conflict_flagged' and recipient_id = 'f9200000-0000-0000-0000-000000000003'),
  'The venue booking for "Note Morning" at Note Hall now overlaps the booking for "Note Afternoon" once setup/turnaround time is applied. One of the bookings needs to move.',
  'the first event''s coordinator is told about the conflict'
);
select is(
  (select count(*)::int from public.notifications
   where type = 'venue_conflict_flagged' and recipient_id = 'f9200000-0000-0000-0000-000000000002'
     and event_id = 'f9200000-0000-0000-0000-0000000000e2'),
  1,
  'the other event''s coordinator is told too'
);

-- Once the overlap is gone, the coordinators are told it's cleared, and every
-- cleared notification is tied to an event.
update public.venues set setup_time_minutes = 0 where id = 'f9200000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9200000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select public.recheck_venue_conflicts('f9200000-0000-0000-0000-000000000010');
reset role;
select is(
  (select message from public.notifications
   where type = 'venue_conflict_resolved' and recipient_id = 'f9200000-0000-0000-0000-000000000003'),
  'The venue booking for "Note Morning" at Note Hall no longer overlaps the booking for "Note Afternoon". No change is needed.',
  'the coordinator is told the conflict is cleared'
);
select is(
  (select count(*)::int from public.notifications where type = 'venue_conflict_resolved' and event_id is null),
  0,
  'no cleared notification is missing its event'
);

-- A cancellation no longer adds the reason to the message.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.cancel_event('f9200000-0000-0000-0000-0000000000e3', 'R');
reset role;
select is(
  (select message from public.notifications
   where type = 'cancellation' and event_id = 'f9200000-0000-0000-0000-0000000000e3'
     and recipient_id = 'f9200000-0000-0000-0000-000000000004'),
  'The event "Note Cancelled" was cancelled.',
  'the cancellation message has no reason tacked on'
);

select * from finish();
rollback;
