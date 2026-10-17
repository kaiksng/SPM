begin;
select plan(69);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f8500000-0000-0000-0000-000000000001', 'spm85-staff@example.test', '{"full_name":"SPM85 Staff","role":"venue_staff"}'::jsonb),
  ('f8500000-0000-0000-0000-000000000002', 'spm85-coord-a@example.test', '{"full_name":"SPM85 Coordinator A","role":"event_coordinator"}'::jsonb),
  ('f8500000-0000-0000-0000-000000000003', 'spm85-coord-b@example.test', '{"full_name":"SPM85 Coordinator B","role":"event_coordinator"}'::jsonb),
  ('f8500000-0000-0000-0000-000000000004', 'spm85-org@example.test', '{"full_name":"SPM85 Organiser","role":"event_organiser"}'::jsonb);

-- Hall, Room1 and Room2 share a location; Far is somewhere else; Tiny is too small.
insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f8500000-0000-0000-0000-000000000010', 'SPM85 Hall', 'Convention 85', 300, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8500000-0000-0000-0000-000000000011', 'SPM85 Room 1', 'Convention 85', 60, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8500000-0000-0000-0000-000000000012', 'SPM85 Room 2', 'convention 85 ', 60, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8500000-0000-0000-0000-000000000013', 'SPM85 Far', 'Elsewhere 85', 60, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8500000-0000-0000-0000-000000000014', 'SPM85 Tiny', 'Convention 85', 10, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8500000-0000-0000-0000-000000000015', 'SPM85 Buffered', 'Convention 85', 60, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 30);

-- Tuesday 6 Apr 2099 (SGT): the conference runs 09:00-17:00 for 300 people.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000004', 'f8500000-0000-0000-0000-000000000002', 'SPM85 Conference', 300, 'planning', '2099-04-06T09:00:00+08:00', '2099-04-06T17:00:00+08:00');
insert into public.event_venue_requirements (event_id, layout_notes, accessibility_notes) values
  ('f8500000-0000-0000-0000-0000000000e1', 'Theatre', 'Wheelchair access');
insert into public.event_required_facilities (event_id, facility_name) values
  ('f8500000-0000-0000-0000-0000000000e1', 'Projector');

create temporary table spm85_ids (label text primary key, id uuid);
grant all on spm85_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- The first booking is the main venue and starts from the event's own details.
select lives_ok($$insert into spm85_ids select 'main', public.submit_venue_booking_request(
  'f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000010')$$,
  'AC01: the first venue booking is requested for the event');
reset role;
select is((select label || '|' || expected_headcount || '|' || is_main_venue || '|' || status
  from public.venue_bookings where id = (select id from spm85_ids where label = 'main')),
  'Main Programme|300|true|pending', 'AC07: the first booking is the main venue, labelled and sized from the event');
select is((select starts_at::text || ' ' || ends_at::text from public.venue_bookings where id = (select id from spm85_ids where label = 'main')),
  '2099-04-06 01:00:00+00 2099-04-06 09:00:00+00', 'AC03: the first booking covers the event''s period');
select is((select layout_notes || '|' || accessibility_notes || '|' || required_facilities::text
  from public.venue_bookings where id = (select id from spm85_ids where label = 'main')),
  'Theatre|Wheelchair access|{Projector}', 'AC02: the first booking copies the event''s layout, accessibility and facilities');

-- AC01: additional venues, only by the assigned coordinator.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000011',
  null, 'Breakout 1', '2099-04-06T10:00:00+08:00', '2099-04-06T11:30:00+08:00', 40)$$,
  '42501', 'Only the assigned coordinator can submit a venue booking request for this event',
  'AC01: another coordinator cannot add a venue to the event');

select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into spm85_ids select 'b1', public.submit_venue_booking_request(
  'f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000011',
  null, 'Breakout 1', '2099-04-06T10:00:00+08:00', '2099-04-06T11:30:00+08:00', 40, 'Classroom', null, array['Whiteboard'])$$,
  'AC01: an additional venue is requested while the event already has a Pending booking');
reset role;
select is((select label || '|' || expected_headcount || '|' || is_main_venue || '|' || layout_notes || '|' || required_facilities::text
  from public.venue_bookings where id = (select id from spm85_ids where label = 'b1')),
  'Breakout 1|40|false|Classroom|{Whiteboard}', 'AC02/AC07: the additional booking keeps its own label, headcount and needs, and is not main');
select is((select count(*)::int from public.venue_bookings where event_id = 'f8500000-0000-0000-0000-0000000000e1' and status = 'pending'), 2,
  'AC01: the event now has two active bookings');
select is((select count(*)::int from public.venue_bookings where event_id = 'f8500000-0000-0000-0000-0000000000e1' and is_main_venue and status = 'pending'), 1,
  'AC07: exactly one active booking is the main venue');
select is((select advisory_notes from public.venue_bookings where id = (select id from spm85_ids where label = 'b1')), null,
  'AC09: a breakout room at the main venue''s location carries no location note');
select is((select count(*)::int from public.notifications where booking_id = (select id from spm85_ids where label = 'b1')
  and recipient_id = 'f8500000-0000-0000-0000-000000000001' and message like '%(Breakout 1)%'), 1, 'AC01: Venue Staff are notified of the additional booking, naming its label');

-- AC02: what an additional booking must state.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, '  ', '2099-04-06T13:00:00+08:00', '2099-04-06T14:00:00+08:00', 30)$$,
  '23514', 'Give this booking a label, for example Breakout 1', 'AC02: an additional booking needs a label');
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, 'Breakout 2', null, null, 30)$$,
  '23514', 'Enter the period this booking needs', 'AC02: an additional booking needs its own period');
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, 'Breakout 2', '2099-04-06T13:00:00+08:00', '2099-04-06T14:00:00+08:00')$$,
  '23514', 'Enter how many people this venue must hold', 'AC02: an additional booking needs its own headcount');

-- AC03: the period stays inside the event.
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, 'Breakout 2', '2099-04-06T08:00:00+08:00', '2099-04-06T10:00:00+08:00', 30)$$,
  '23514', 'This booking''s period must fall within the event''s start and end time', 'AC03: a period starting before the event is refused');
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, 'Breakout 2', '2099-04-06T16:00:00+08:00', '2099-04-06T18:00:00+08:00', 30)$$,
  '23514', 'This booking''s period must fall within the event''s start and end time', 'AC03: a period ending after the event is refused');
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000012',
  null, 'Breakout 2', '2099-04-06T14:00:00+08:00', '2099-04-06T13:00:00+08:00', 30)$$,
  '23514', 'The end must be after the start', 'AC03: an end before the start is refused');

-- AC04: suitability is against this booking's own headcount.
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000014',
  null, 'Breakout 2', '2099-04-06T13:00:00+08:00', '2099-04-06T14:00:00+08:00', 30)$$,
  '23514', 'This venue''s capacity (10) is below this booking''s expected headcount (30)',
  'AC04: a room smaller than the booking''s headcount is refused');
select lives_ok($$insert into spm85_ids select 'small', public.submit_venue_booking_request(
  'f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000014',
  null, 'Tiny Meeting', '2099-04-06T13:00:00+08:00', '2099-04-06T14:00:00+08:00', 8)$$,
  'AC04: the same small room is fine for a booking of 8, even though the event has 300 attendees');

-- AC06: the same venue twice only for periods that do not overlap.
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000011',
  null, 'Breakout 2', '2099-04-06T11:00:00+08:00', '2099-04-06T12:00:00+08:00', 40)$$,
  '23514', 'This event already has an active booking or hold for this venue during an overlapping period',
  'AC06: the same venue with an overlapping period on the same event is refused');
select lives_ok($$insert into spm85_ids select 'b2', public.submit_venue_booking_request(
  'f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000011',
  null, 'Breakout 2', '2099-04-06T13:00:00+08:00', '2099-04-06T14:30:00+08:00', 40)$$,
  'AC06: the same venue with a non-overlapping period is allowed');
select throws_ok($$select public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000010',
  null, 'Hall again', '2099-04-06T09:00:00+08:00', '2099-04-06T10:00:00+08:00', 100)$$,
  '23514', 'This event already has an active booking or hold for this venue during an overlapping period',
  'AC06: the main venue cannot be booked again over its own period');

-- AC09: a breakout room away from the main venue is flagged for Venue Staff, not blocked.
select lives_ok($$insert into spm85_ids select 'far', public.submit_venue_booking_request(
  'f8500000-0000-0000-0000-0000000000e1', 'f8500000-0000-0000-0000-000000000013',
  null, 'Breakout Far', '2099-04-06T15:00:00+08:00', '2099-04-06T16:00:00+08:00', 20)$$,
  'a booking at a different location from the main venue is still accepted');
reset role;
select ok((select advisory_notes like 'Location:%Elsewhere 85%Convention 85%' from public.venue_bookings where id = (select id from spm85_ids where label = 'far')),
  'AC09: Venue Staff see a note when an additional booking is at a different location from the main venue');
select is((select advisory_notes from public.venue_bookings where id = (select id from spm85_ids where label = 'b2')), null,
  'AC09: the same location, ignoring case and spacing, carries no note');

-- AC09: each request is decided on its own.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved')$$, (select id from spm85_ids where label = 'b1')),
  'AC09: Venue Staff approve one booking');
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'rejected', 'Room is reserved')$$, (select id from spm85_ids where label = 'far')),
  'AC09: Venue Staff reject another booking');
reset role;
select is((select string_agg(label || ':' || status, ', ' order by label) from public.venue_bookings
  where event_id = 'f8500000-0000-0000-0000-0000000000e1'),
  'Breakout 1:approved, Breakout 2:pending, Breakout Far:rejected, Main Programme:pending, Tiny Meeting:pending',
  'AC09: approving or rejecting one booking leaves the others as they were');

-- A block on one room disrupts only the booking it overlaps (SPM-83), and its
-- replacement is chosen against that booking's own needs (SPM-82).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_venue_block('f8500000-0000-0000-0000-000000000011', 'Projector repair',
  '2099-04-06T10:30:00+08:00', '2099-04-06T11:00:00+08:00', 'maintenance')$$,
  'Venue Staff block Room 1 during Breakout 1');
reset role;
select is((select string_agg(vb.label, ', ' order by vb.label) from public.venue_booking_disruptions d
  join public.venue_bookings vb on vb.id = d.booking_id
  where vb.event_id = 'f8500000-0000-0000-0000-0000000000e1' and d.cleared_at is null),
  'Breakout 1', 'AC09: only the booking the block overlaps is flagged; the main venue and the other breakout are untouched');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.request_replacement_venue(%L::uuid, 'f8500000-0000-0000-0000-000000000012')$$, (select id from spm85_ids where label = 'b1')),
  '23514', 'This venue is missing required facilities: Whiteboard',
  'the replacement is checked against the booking''s own required facilities, not the event''s');
reset role;
insert into public.venue_facilities (venue_id, facility_name) values ('f8500000-0000-0000-0000-000000000012', 'whiteboard');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$insert into spm85_ids select 'b1r', public.request_replacement_venue(%L::uuid, 'f8500000-0000-0000-0000-000000000012')$$, (select id from spm85_ids where label = 'b1')),
  'the replacement is requested once the room has the booking''s facility');
reset role;
select is((select label || '|' || expected_headcount || '|' || starts_at::text || '|' || is_main_venue
  from public.venue_bookings where id = (select id from spm85_ids where label = 'b1r')),
  'Breakout 1|40|2099-04-06 02:00:00+00|false', 'the replacement keeps the booking''s label, headcount, period and non-main flag');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved')$$, (select id from spm85_ids where label = 'b1r')),
  'Venue Staff approve the replacement');
reset role;
select is((select string_agg(label || ':' || status, ', ' order by label, status) from public.venue_bookings
  where event_id = 'f8500000-0000-0000-0000-0000000000e1' and status <> 'rejected'),
  'Breakout 1:approved, Breakout 1:cancelled, Breakout 2:pending, Main Programme:pending, Tiny Meeting:pending',
  'approving the replacement cancels only the booking it replaces');

-- A capacity change is measured against each booking's own headcount, not the
-- event's 300 attendees.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.update_venue('f8500000-0000-0000-0000-000000000011', '{"name":"SPM85 Room 1","location":"Convention 85","area_tags":["Central Area"],"capacity":45,"operating_hours":[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}],"facilities":[],"layouts":["Theatre"]}'::jsonb)$$,
  'Venue Staff reduce Room 1 to 45 seats');
reset role;
select is((select count(*)::int from public.venue_bookings where venue_id = 'f8500000-0000-0000-0000-000000000011' and needs_review), 0,
  'a 40-person breakout booking is not flagged when the room still seats 45, although the event has 300 attendees');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.update_venue('f8500000-0000-0000-0000-000000000011', '{"name":"SPM85 Room 1","location":"Convention 85","area_tags":["Central Area"],"capacity":30,"operating_hours":[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}],"facilities":[],"layouts":["Theatre"]}'::jsonb)$$,
  'Venue Staff reduce Room 1 to 30 seats');
reset role;
select is((select count(*)::int from public.venue_bookings where venue_id = 'f8500000-0000-0000-0000-000000000011' and needs_review), 1,
  'the remaining 40-person booking is flagged once the room seats fewer than 40');

-- ---------------------------------------------------------------- slice 2
-- A fresh event so the earlier bookings do not interfere.
reset role;
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f8500000-0000-0000-0000-0000000000e2', 'f8500000-0000-0000-0000-000000000004', 'f8500000-0000-0000-0000-000000000002', 'SPM85 Summit', 100, 'planning', '2099-05-04T09:00:00+08:00', '2099-05-04T17:00:00+08:00'),
  ('f8500000-0000-0000-0000-0000000000e3', 'f8500000-0000-0000-0000-000000000004', 'f8500000-0000-0000-0000-000000000003', 'SPM85 Other Coordinator Event', 20, 'planning', '2099-05-05T09:00:00+08:00', '2099-05-05T10:00:00+08:00');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into spm85_ids select 's-main', public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e2', 'f8500000-0000-0000-0000-000000000010')$$,
  'slice 2: the summit books its main hall');
select lives_ok($$insert into spm85_ids select 's-a', public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e2', 'f8500000-0000-0000-0000-000000000011', null, 'Room A', '2099-05-04T10:00:00+08:00', '2099-05-04T11:00:00+08:00', 30)$$,
  'slice 2: and a first breakout room');
select lives_ok($$insert into spm85_ids select 's-b', public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e2', 'f8500000-0000-0000-0000-000000000012', null, 'Room B', '2099-05-04T10:00:00+08:00', '2099-05-04T11:00:00+08:00', 30)$$,
  'slice 2: and a second breakout room');

-- AC07: the coordinator can choose which booking is the main venue.
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(format($$select public.set_main_venue_booking(%L::uuid)$$, (select id from spm85_ids where label = 's-a')),
  '42501', 'Only the assigned coordinator can change the main venue of this event', 'AC07: another coordinator cannot change the main venue');
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$select public.set_main_venue_booking(%L::uuid)$$, (select id from spm85_ids where label = 's-a')),
  'AC07: the assigned coordinator makes Room A the main venue');
reset role;
select is((select string_agg(label, ', ' order by label) from public.venue_bookings where event_id = 'f8500000-0000-0000-0000-0000000000e2' and is_main_venue and status = 'pending'),
  'Room A', 'AC07: exactly one booking is now main, and it is Room A');
select is((select (select main_designated_at is not null from public.venue_bookings where id = (select id from spm85_ids where label = 's-a'))
  and (select main_designated_at is null from public.venue_bookings where id = (select id from spm85_ids where label = 's-main'))), true,
  'AC12: choosing Room A as main stamps it and clears the booking that stopped being main');

-- AC10: withdrawing and cancelling need a reason and release only that booking.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, '  ')$$, (select id from spm85_ids where label = 's-b')),
  '23514', 'Give a reason for withdrawing or cancelling this venue booking', 'AC10: a reason is required to withdraw');
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Not enough speakers')$$, (select id from spm85_ids where label = 's-b')),
  'AC10: a Pending booking is withdrawn with a reason');
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved')$$, (select id from spm85_ids where label = 's-main')),
  'AC10: Venue Staff approve the main hall');
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Mine now')$$, (select id from spm85_ids where label = 's-main')),
  '42501', 'Only the event''s assigned coordinator can withdraw this request', 'AC10: only the event''s assigned coordinator can cancel');
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Hall double-booked by the school')$$, (select id from spm85_ids where label = 's-main')),
  'AC10: an Approved booking is cancelled with a reason');
reset role;
select is((select string_agg(label || ':' || status, ', ' order by label) from public.venue_bookings where event_id = 'f8500000-0000-0000-0000-0000000000e2'),
  'Main Programme:cancelled, Room A:pending, Room B:cancelled', 'AC10: only the released bookings are cancelled; Room A keeps its state');
select is((select cancellation_reason || '|' || (cancelled_by = 'f8500000-0000-0000-0000-000000000002')::text from public.venue_bookings where id = (select id from spm85_ids where label = 's-main')),
  'Hall double-booked by the school|true', 'AC10: the reason and who cancelled are recorded');
select is((select count(*)::int from public.notifications where booking_id = (select id from spm85_ids where label = 's-main')
  and recipient_id = 'f8500000-0000-0000-0000-000000000001' and title = 'Venue booking cancelled' and message like '%Hall double-booked by the school%'),
  1, 'AC10: Venue Staff are told a confirmed booking was cancelled, with the reason');
select is((select count(*)::int from public.notifications where booking_id = (select id from spm85_ids where label = 's-b')
  and recipient_id = 'f8500000-0000-0000-0000-000000000001' and title = 'Venue booking request withdrawn'),
  1, 'AC10: Venue Staff are told a request was withdrawn');

-- AC11: the cancelled main booking leaves the event without a main venue until one is chosen.
select is((select count(*)::int from public.venue_bookings where event_id = 'f8500000-0000-0000-0000-0000000000e2' and is_main_venue and status in ('pending', 'approved', 'on_hold')), 1,
  'AC11: Room A, the main venue chosen earlier, is still the one active main booking');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.set_main_venue_booking(%L::uuid)$$, (select id from spm85_ids where label = 's-main')),
  '23514', 'Only an active venue booking can be made the main venue', 'AC11: a cancelled booking cannot be made the main venue');
select throws_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Again')$$, (select id from spm85_ids where label = 's-main')),
  '23514', 'Only a Pending or Approved venue booking can be withdrawn or cancelled', 'AC10: a released booking cannot be cancelled again');
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Room A is not needed')$$, (select id from spm85_ids where label = 's-a')),
  'AC11: the coordinator also releases the main room');
select lives_ok($$insert into spm85_ids select 's-c', public.submit_venue_booking_request('f8500000-0000-0000-0000-0000000000e2', 'f8500000-0000-0000-0000-000000000010')$$,
  'a new first booking can then be made');
reset role;
select is((select is_main_venue from public.venue_bookings where id = (select id from spm85_ids where label = 's-c')), true,
  'AC07: with no active booking left, the next booking is the main venue again');

-- AC12: the history can say when a booking became the main venue.
select ok((select main_designated_at is not null from public.venue_bookings where id = (select id from spm85_ids where label = 's-c')),
  'AC12: the main booking records when it became main');
select is((select main_designated_at is null from public.venue_bookings where id = (select id from spm85_ids where label = 's-b')), true,
  'AC12: a booking that is not main records no main time');

-- A booking with an active replacement must have the replacement withdrawn first, and a disruption ends with the booking.
reset role;
insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f8500000-0000-0000-0000-000000000016', 'SPM85 Alt Hall', 'Convention 85', 200, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_venue_block('f8500000-0000-0000-0000-000000000010', 'Stage repair', '2099-05-04T12:00:00+08:00', '2099-05-04T13:00:00+08:00', 'maintenance')$$,
  'Venue Staff block the hall during the summit');
select set_config('request.jwt.claims', '{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$insert into spm85_ids select 's-r', public.request_replacement_venue(%L::uuid, 'f8500000-0000-0000-0000-000000000016')$$, (select id from spm85_ids where label = 's-c')),
  'the coordinator requests a replacement for the disrupted main hall');
select throws_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Cancel it all')$$, (select id from spm85_ids where label = 's-c')),
  '23514', 'This booking has a pending replacement. Withdraw the replacement first', 'a booking with a pending replacement cannot be cancelled until the replacement is withdrawn');
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Replacement not needed')$$, (select id from spm85_ids where label = 's-r')),
  'the replacement is withdrawn');
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Cancel the disrupted hall')$$, (select id from spm85_ids where label = 's-c')),
  'the disrupted booking is then cancelled');
reset role;
select is((select count(*)::int from public.venue_booking_disruptions where booking_id = (select id from spm85_ids where label = 's-c') and cleared_at is null), 0,
  'its disruption is closed, so it no longer asks for a replacement');

select * from finish();
rollback;
