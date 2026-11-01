begin;
select plan(61);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f8200000-0000-0000-0000-000000000001', 'spm82-staff@example.test', '{"full_name":"SPM82 Staff","role":"venue_staff"}'::jsonb),
  ('f8200000-0000-0000-0000-000000000002', 'spm82-coord-a@example.test', '{"full_name":"SPM82 Coordinator A","role":"event_coordinator"}'::jsonb),
  ('f8200000-0000-0000-0000-000000000003', 'spm82-coord-b@example.test', '{"full_name":"SPM82 Coordinator B","role":"event_coordinator"}'::jsonb),
  ('f8200000-0000-0000-0000-000000000004', 'spm82-org@example.test', '{"full_name":"SPM82 Organiser","role":"event_organiser"}'::jsonb);

-- Hall: the venue that gets blocked (30 min setup, 45 min turnaround).
-- Alt/Alt2: free replacements. Small: too small. Busy: occupied by another event.
insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('f8200000-0000-0000-0000-000000000010', 'SPM82 Hall', 'Block 82', 100, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 45),
  ('f8200000-0000-0000-0000-000000000011', 'SPM82 Alt', 'Block 82', 100, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8200000-0000-0000-0000-000000000012', 'SPM82 Small', 'Block 82', 10, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8200000-0000-0000-0000-000000000013', 'SPM82 Busy', 'Block 82', 100, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0),
  ('f8200000-0000-0000-0000-000000000014', 'SPM82 Alt2', 'Block 82', 100, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

-- Tuesday 6 Apr 2099 (SGT). The Hall is blocked 12:00-14:00 below.
--   E1 10:00-12:00 Career Fair   (Hall, Approved)   - disrupted via its turnaround
--   E4 12:30-13:00 Workshop      (Hall, Approved)   - disrupted; used for the "block removed" case
--   E5 17:00-18:00 Evening Talk  (Hall, Approved)   - not disrupted
--   E2 10:00-12:00 Busy Event    (Busy, Approved)   - makes Busy unavailable to E1
--   E3 10:00-11:00 Freed Slot    (no booking)       - proves the Hall's slot is released
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at) values
  ('f8200000-0000-0000-0000-0000000000e1', 'f8200000-0000-0000-0000-000000000004', 'f8200000-0000-0000-0000-000000000002', 'SPM82 Career Fair', 50, 'planning', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00'),
  ('f8200000-0000-0000-0000-0000000000e2', 'f8200000-0000-0000-0000-000000000004', 'f8200000-0000-0000-0000-000000000003', 'SPM82 Busy Event', 20, 'planning', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00'),
  ('f8200000-0000-0000-0000-0000000000e3', 'f8200000-0000-0000-0000-000000000004', 'f8200000-0000-0000-0000-000000000003', 'SPM82 Freed Slot', 20, 'planning', '2099-04-06T10:00:00+08:00', '2099-04-06T11:00:00+08:00'),
  ('f8200000-0000-0000-0000-0000000000e4', 'f8200000-0000-0000-0000-000000000004', 'f8200000-0000-0000-0000-000000000002', 'SPM82 Workshop', 20, 'planning', '2099-04-06T12:30:00+08:00', '2099-04-06T13:00:00+08:00'),
  ('f8200000-0000-0000-0000-0000000000e5', 'f8200000-0000-0000-0000-000000000004', 'f8200000-0000-0000-0000-000000000002', 'SPM82 Evening Talk', 20, 'planning', '2099-04-06T17:00:00+08:00', '2099-04-06T18:00:00+08:00');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status) values
  ('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-0000000000e1', 'f8200000-0000-0000-0000-000000000010', 'f8200000-0000-0000-0000-000000000002', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 'approved'),
  ('f8200000-0000-0000-0000-0000000000b2', 'f8200000-0000-0000-0000-0000000000e2', 'f8200000-0000-0000-0000-000000000013', 'f8200000-0000-0000-0000-000000000003', '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 'approved'),
  ('f8200000-0000-0000-0000-0000000000b4', 'f8200000-0000-0000-0000-0000000000e4', 'f8200000-0000-0000-0000-000000000010', 'f8200000-0000-0000-0000-000000000002', '2099-04-06T12:30:00+08:00', '2099-04-06T13:00:00+08:00', 'approved'),
  ('f8200000-0000-0000-0000-0000000000b5', 'f8200000-0000-0000-0000-0000000000e5', 'f8200000-0000-0000-0000-000000000010', 'f8200000-0000-0000-0000-000000000002', '2099-04-06T17:00:00+08:00', '2099-04-06T18:00:00+08:00', 'approved');

-- SPM-85: a booking carries its own headcount; these bookings are for the whole event.
update public.venue_bookings vb set expected_headcount = e.expected_attendance
from public.events e where e.id = vb.event_id and vb.id::text like 'f8200000-%';

create temporary table spm82_ids (label text primary key, id uuid);
grant all on spm82_ids to authenticated;

-- Venue Staff block the Hall; this is what disrupts E1 and E4 (SPM-83).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into spm82_ids select 'block', (public.create_venue_block(
  'f8200000-0000-0000-0000-000000000010', 'Air-conditioning repair', '2099-04-06T12:00:00+08:00', '2099-04-06T14:00:00+08:00', 'maintenance') ->> 'blockId')::uuid$$,
  'setup: Venue Staff block the Hall, disrupting E1 and E4');

-- ----------------------------------------------------------- who may request
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  '42501', 'Only the assigned coordinator can request a replacement venue for this event',
  'AC03: a coordinator who is not assigned to the event cannot request a replacement');
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  '42501', 'Only the assigned coordinator can request a replacement venue for this event',
  'AC03: an organiser cannot request a replacement');
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  '42501', 'Only the assigned coordinator can request a replacement venue for this event',
  'AC03: Venue Staff cannot request a replacement');

-- ------------------------------------------------------- what is refused
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b5', 'f8200000-0000-0000-0000-000000000011')$$,
  '23514', 'This venue booking is not disrupted, so it does not need a replacement',
  'AC03: a booking that is not disrupted cannot be replaced');
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000010')$$,
  '23514', 'Choose a different venue from the one that is unavailable',
  'AC02: the disrupted venue cannot be its own replacement');
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000012')$$,
  '23514', null, 'AC04: a venue below the expected attendance is refused (suitability)');
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000013')$$,
  '23514', null, 'AC04: a venue occupied by another event in that period is refused (availability)');
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', null)$$,
  '23514', 'Select a venue before submitting', 'AC04: a venue is required');

-- ------------------------------------------------ requesting a replacement
select lives_ok($$insert into spm82_ids select 'r1', public.request_replacement_venue(
  'f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  'AC04: the assigned coordinator requests a replacement at a suitable, available venue');

reset role;
select is((select status::text || '/' || replaces_booking_id::text || '/' || is_main_venue::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r1')),
  'pending/f8200000-0000-0000-0000-0000000000b1/true',
  'AC04: the replacement is a new Pending booking linked to the original, keeping its main-venue flag');
select is((select (starts_at = '2099-04-06T10:00:00+08:00' and ends_at = '2099-04-06T12:00:00+08:00' and requested_by = 'f8200000-0000-0000-0000-000000000002')
  from public.venue_bookings where id = (select id from spm82_ids where label = 'r1')),
  true, 'AC04: the replacement keeps the original booking''s period');
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b1'), 'approved',
  'AC05: the original booking is untouched until the replacement is approved');
select is((select count(*)::int from public.venue_booking_disruptions where booking_id = 'f8200000-0000-0000-0000-0000000000b1' and cleared_at is null), 1,
  'AC05: the original stays disrupted, with its reason, until the replacement is approved');
select is((select status::text from public.events where id = 'f8200000-0000-0000-0000-0000000000e1'), 'planning',
  'the request does not edit the event');
select ok((select message like '%SPM82 Career Fair%' and message like '%SPM82 Alt%' and message like '%replacing its disrupted booking at SPM82 Hall%'
  from public.notifications where recipient_id = 'f8200000-0000-0000-0000-000000000001' and type = 'venue_request'
    and event_id = 'f8200000-0000-0000-0000-0000000000e1'),
  'Venue Staff are notified and can see it is a replacement for the Hall booking');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000014')$$,
  '23514', 'This venue booking already has a pending replacement request',
  'AC03: only one pending replacement per disrupted booking');
select throws_ok($$select public.submit_venue_booking_request('f8200000-0000-0000-0000-0000000000e1', 'f8200000-0000-0000-0000-000000000014')$$,
  '23514', 'Give this booking a label, for example Breakout 1',
  'a further venue request while the event has an active booking is an additional booking and needs its own details');

-- ----------------------------------------------------------- withdrawing
select lives_ok(format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Changed our mind')$$, (select id from spm82_ids where label = 'r1')),
  'AC08: the coordinator withdraws the pending replacement');
reset role;
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r1')), 'cancelled',
  'AC08: the withdrawn replacement is cancelled');
select is((select count(*)::int from public.venue_booking_disruptions where booking_id = 'f8200000-0000-0000-0000-0000000000b1' and cleared_at is null), 1,
  'AC08: the original remains disrupted after a withdrawal');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into spm82_ids select 'r2', public.request_replacement_venue(
  'f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  'AC08: the coordinator can request another replacement after withdrawing');

-- ------------------------------------------------------------- rejecting
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'rejected'::public.venue_booking_decision_type, 'Reserved for an exam')$$,
  (select id from spm82_ids where label = 'r2')), 'Venue Staff reject the replacement with a reason');
reset role;
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r2')), 'rejected',
  'AC07: the replacement is rejected');
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b1'), 'approved',
  'AC07: the original booking is unchanged by a rejection');
select is((select count(*)::int from public.venue_booking_disruptions where booking_id = 'f8200000-0000-0000-0000-0000000000b1' and cleared_at is null), 1,
  'AC07: the original remains Disrupted after a rejection');
select ok((select message not like '%Reserved for an exam%' and message like '%still disrupted%' and message like '%request another venue%'
  from public.notifications where type = 'venue_decision' and event_id = 'f8200000-0000-0000-0000-0000000000e1'
    and title = 'Replacement venue rejected'),
  'AC06: the coordinator is told the original is still disrupted and that they may try again (the reason stays on the booking)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into spm82_ids select 'r3', public.request_replacement_venue(
  'f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000011')$$,
  'AC07: the coordinator tries again after a rejection');

-- ------------------------------------------------------------ approving
-- The event was Confirmed by the time the replacement is approved.
reset role;
update public.events set status = 'pending_safety_check' where id = 'f8200000-0000-0000-0000-0000000000e1';
update public.events set status = 'confirmed' where id = 'f8200000-0000-0000-0000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type)$$, (select id from spm82_ids where label = 'r3')),
  '42501', 'Only Venue Staff can decide a venue booking request', 'a coordinator cannot approve a replacement');

-- A Confirmed event with a disrupted booking can search for a replacement venue.
select lives_ok($$select * from public.search_available_venues('f8200000-0000-0000-0000-0000000000e1'::uuid,
  '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 20)$$,
  'AC04: the assigned coordinator of a Confirmed event with a disrupted booking can search venues');
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select * from public.search_available_venues('f8200000-0000-0000-0000-0000000000e1'::uuid,
  '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 20)$$,
  '42501', 'Planning event not found or not assigned to you',
  'AC04: another coordinator still cannot search for this Confirmed event');
reset role;
update public.events set status = 'pending_safety_check' where id = 'f8200000-0000-0000-0000-0000000000e5';
update public.events set status = 'confirmed' where id = 'f8200000-0000-0000-0000-0000000000e5';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select * from public.search_available_venues('f8200000-0000-0000-0000-0000000000e5'::uuid,
  '2099-04-06T17:00:00+08:00', '2099-04-06T18:00:00+08:00', 20)$$,
  '42501', 'Planning event not found or not assigned to you',
  'AC04: a Confirmed event with no disrupted booking still cannot search venues');

-- Meanwhile Venue Staff block the replacement venue for that period.
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into spm82_ids select 'altblock', (public.create_venue_block(
  'f8200000-0000-0000-0000-000000000011', 'Floor repair', '2099-04-06T10:00:00+08:00', '2099-04-06T11:00:00+08:00', 'maintenance') ->> 'blockId')::uuid$$,
  'setup: the replacement venue is blocked while the replacement is pending');
select throws_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type)$$, (select id from spm82_ids where label = 'r3')),
  '23514', null, 'AC05: approval is refused when the replacement venue is no longer available');
reset role;
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r3')), 'pending',
  'the replacement stays Pending after a refused approval');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.remove_venue_block(%L::uuid)$$, (select id from spm82_ids where label = 'altblock')),
  'setup: the replacement venue is released again');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type)$$, (select id from spm82_ids where label = 'r3')),
  'AC05: Venue Staff approve the replacement');

reset role;
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r3')), 'approved',
  'AC05: the replacement is Approved');
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b1'), 'cancelled',
  'AC05: the original is cancelled automatically');
select is((select replaces_booking_id::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r3')),
  'f8200000-0000-0000-0000-0000000000b1', 'AC05/AC09: the cancelled original stays linked to its replacement');
select is((select count(*)::int from public.venue_booking_disruptions where booking_id = 'f8200000-0000-0000-0000-0000000000b1' and cleared_at is null), 0,
  'AC05: the original''s disruption is resolved');
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b4'), 'approved',
  'AC05: the event''s other bookings and other disruptions are untouched');
select is((select (public.check_venue_booking_availability('f8200000-0000-0000-0000-000000000010', 'f8200000-0000-0000-0000-0000000000e3') ->> 'available')::boolean),
  true, 'AC05: the cancelled booking''s slot at the Hall is released');
select ok((select message like 'The replacement venue booking at % for "%" has been approved.%' and message like '%SPM82 Hall%cancelled%'
  from public.notifications where type = 'venue_decision' and event_id = 'f8200000-0000-0000-0000-0000000000e1'
    and title = 'Replacement venue approved'),
  'the coordinator is notified of the approval, naming the venue and event');

-- ------------------------------------------------- Confirmed -> Planning
select is((select status::text from public.events where id = 'f8200000-0000-0000-0000-0000000000e1'), 'planning',
  'AC06: approving the replacement returns a Confirmed event to Planning');
select is((select count(*)::int from public.event_status_history where event_id = 'f8200000-0000-0000-0000-0000000000e1'
  and from_status = 'confirmed' and to_status = 'planning'), 1,
  'AC06: the return to Planning is recorded in the event''s status history');
select is((select count(*)::int from public.notifications where type = 'status_change' and title = 'Event returned to Planning'
  and event_id = 'f8200000-0000-0000-0000-0000000000e1'), 1,
  'AC06: the coordinator is told the event returned to Planning');

-- ------------------------------------ cancelled original cannot be replaced
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b1', 'f8200000-0000-0000-0000-000000000014')$$,
  '23514', 'Only an active venue booking can be replaced', 'a cancelled booking cannot be replaced again');

-- ------------------------------------------ suitability: facilities, layout, accessibility
-- The Workshop (E4) needs a Projector, a Theatre layout and wheelchair access.
-- Alt has no Projector; Alt2 has one (stored in lower case, to prove the match
-- ignores case) but lists no layout and mentions no accessibility.
reset role;
insert into public.event_required_facilities (event_id, facility_name) values
  ('f8200000-0000-0000-0000-0000000000e4', 'Projector');
insert into public.event_venue_requirements (event_id, layout_notes, accessibility_notes) values
  ('f8200000-0000-0000-0000-0000000000e4', 'Theatre', 'Wheelchair access');
insert into public.venue_facilities (venue_id, facility_name) values
  ('f8200000-0000-0000-0000-000000000014', 'projector');
update public.venue_bookings
set required_facilities = array['Projector'], layout_notes = 'Theatre', accessibility_notes = 'Wheelchair access'
where id = 'f8200000-0000-0000-0000-0000000000b4';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok($$select public.request_replacement_venue('f8200000-0000-0000-0000-0000000000b4', 'f8200000-0000-0000-0000-000000000011')$$,
  '23514', 'This venue is missing required facilities: Projector',
  'AC04: a venue missing a required facility is refused, and the facility is named');

-- ------------------------- block removed while a replacement is pending
select lives_ok($$insert into spm82_ids select 'r4', public.request_replacement_venue(
  'f8200000-0000-0000-0000-0000000000b4', 'f8200000-0000-0000-0000-000000000014')$$,
  'a replacement can be requested for the second disrupted booking (required facility matched ignoring case)');
reset role;
select ok((select advisory_notes like '%Layout: the booking asked for "Theatre"%' and advisory_notes like '%Accessibility: the booking asked for "Wheelchair access"%'
  from public.venue_bookings where id = (select id from spm82_ids where label = 'r4')),
  'AC04: layout and accessibility mismatches do not refuse the request but are recorded for Venue Staff');
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r4')), 'pending',
  'AC04: a layout or accessibility mismatch still leaves the request Pending');
select is((select advisory_notes from public.venue_bookings where id = (select id from spm82_ids where label = 'r3')), null,
  'a replacement with no unmet layout or accessibility requirement carries no advisory note');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.remove_venue_block(%L::uuid)$$, (select id from spm82_ids where label = 'block')),
  'Venue Staff remove the block while that replacement is pending');
reset role;
select is((select status::text from public.venue_bookings where id = (select id from spm82_ids where label = 'r4')), 'pending',
  'the pending replacement is kept when the original stops being disrupted');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format($$select public.decide_venue_booking_request(%L::uuid, 'approved'::public.venue_booking_decision_type)$$, (select id from spm82_ids where label = 'r4')),
  'Venue Staff can still approve it');
reset role;
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b4'), 'cancelled',
  'approving it still cancels the original booking');

-- ------------------------- an ordinary approval is unchanged (SPM-25 regression)
-- decide_venue_booking_request was rewritten for replacements; an ordinary
-- booking (no link) must still be approved as before, with the original wording.
insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status) values
  ('f8200000-0000-0000-0000-0000000000b8', 'f8200000-0000-0000-0000-0000000000e3', 'f8200000-0000-0000-0000-000000000014',
   'f8200000-0000-0000-0000-000000000003', '2099-04-06T10:00:00+08:00', '2099-04-06T11:00:00+08:00', 'pending');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.decide_venue_booking_request('f8200000-0000-0000-0000-0000000000b8', 'approved'::public.venue_booking_decision_type)$$,
  'an ordinary booking request is still approved by Venue Staff');
reset role;
select is((select status::text from public.venue_bookings where id = 'f8200000-0000-0000-0000-0000000000b8'), 'approved',
  'the ordinary booking becomes Approved');
select ok((select message like 'The venue booking request at % for "%" has been approved.%' and message not like '%replacement%'
  from public.notifications where type = 'venue_decision' and event_id = 'f8200000-0000-0000-0000-0000000000e3'),
  'an ordinary approval names the venue and event, and says nothing about a replacement');
select is((select count(*)::int from public.venue_bookings where status = 'cancelled' and event_id = 'f8200000-0000-0000-0000-0000000000e3'), 0,
  'approving an ordinary booking cancels nothing');

select * from finish();
rollback;
