begin;

select plan(16);

-- safety_check_review_details (202610280001): the facts a Safety Officer
-- reviews. Same access rule as event_readiness: a Safety Officer can read
-- an event only while it is Pending Safety Check.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fe300000-0000-0000-0000-000000000001', 'scrd-organiser@example.test', '{"full_name":"SCRD Organiser","role":"event_organiser"}'::jsonb),
  ('fe300000-0000-0000-0000-000000000002', 'scrd-coordinator@example.test', '{"full_name":"SCRD Coordinator","role":"event_coordinator"}'::jsonb),
  ('fe300000-0000-0000-0000-000000000003', 'scrd-safety@example.test', '{"full_name":"SCRD Safety","role":"safety_officer"}'::jsonb),
  ('fe300000-0000-0000-0000-000000000004', 'scrd-other-organiser@example.test', '{"full_name":"SCRD Other","role":"event_organiser"}'::jsonb);

insert into public.venues (id, name, location, capacity, description, accessibility_notes) values
  ('fe300000-0000-0000-0000-000000000010', 'SCRD Hall', 'Block 3', 100, 'Two fire exits at the rear.', 'Step-free entrance');
insert into public.venue_layouts (venue_id, layout_name) values
  ('fe300000-0000-0000-0000-000000000010', 'Theatre');

-- E1: 80 expected, fits the 100-seat venue. E2: 150 expected, exceeds it
-- (headcount falls back to the event's attendance). E3 stays in Planning.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged)
values
  ('fe300000-0000-0000-0000-0000000000e1', 'fe300000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000002', 'SCRD Event 1', 'planning', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', 80, true),
  ('fe300000-0000-0000-0000-0000000000e2', 'fe300000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000002', 'SCRD Event 2', 'planning', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', 150, true),
  ('fe300000-0000-0000-0000-0000000000e3', 'fe300000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000002', 'SCRD Event 3', 'planning', '2099-12-12T10:00:00+08:00', '2099-12-12T12:00:00+08:00', 80, true);

insert into public.event_venue_requirements (event_id, accessibility_notes)
values ('fe300000-0000-0000-0000-0000000000e1', 'Two wheelchair spaces');

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values
  ('fe300000-0000-0000-0000-0000000000b1', 'fe300000-0000-0000-0000-0000000000e1', 'fe300000-0000-0000-0000-000000000010', 'fe300000-0000-0000-0000-000000000002', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', 'approved', true),
  ('fe300000-0000-0000-0000-0000000000b2', 'fe300000-0000-0000-0000-0000000000e2', 'fe300000-0000-0000-0000-000000000010', 'fe300000-0000-0000-0000-000000000002', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', 'approved', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe300000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.submit_event_for_safety_check('fe300000-0000-0000-0000-0000000000e1');
select public.submit_event_for_safety_check('fe300000-0000-0000-0000-0000000000e2');

-- An unreserved equipment requirement would block submission, so it is
-- added after the events are Pending Safety Check.
reset role;
insert into public.equipment_items (id, name, category, code, total_quantity)
values ('fe300000-0000-0000-0000-000000000020', 'SCRD Projector', 'AV', 'scrd-projector', 5);
insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, notes, required_from, required_until)
values ('fe300000-0000-0000-0000-0000000000e1', 'fe300000-0000-0000-0000-000000000020', 'SCRD Projector', 2, 'Rear of hall', '2099-12-10T09:00:00+08:00', '2099-12-10T12:00:00+08:00');
set local role authenticated;

create temporary table scrd_result (label text primary key, body jsonb);
grant all on scrd_result to authenticated;

-- AC02: a Safety Officer reads the review facts of a Pending Safety Check event.
select set_config('request.jwt.claims', '{"sub":"fe300000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into scrd_result select 'e1', public.safety_check_review_details('fe300000-0000-0000-0000-0000000000e1');
insert into scrd_result select 'e2', public.safety_check_review_details('fe300000-0000-0000-0000-0000000000e2');

select is((select body ->> 'expectedAttendance' from scrd_result where label = 'e1'), '80', 'AC02: expected attendance is returned');
select is((select body ->> 'accessibilityNeeds' from scrd_result where label = 'e1'), 'Two wheelchair spaces', 'AC02: accessibility needs are returned');
select is(
  (select body -> 'venues' -> 0 ->> 'venueName' from scrd_result where label = 'e1'),
  'SCRD Hall', 'AC02: the booked venue is returned'
);
select is((select (body -> 'venues' -> 0 ->> 'capacity')::int from scrd_result where label = 'e1'), 100, 'AC02: the venue capacity is returned');
select is((select body -> 'venues' -> 0 -> 'layouts' ->> 0 from scrd_result where label = 'e1'), 'Theatre', 'AC02: the venue layout is returned');
select is((select body -> 'venues' -> 0 ->> 'venueDescription' from scrd_result where label = 'e1'), 'Two fire exits at the rear.', 'AC02: the venue description is returned');
select is((select body -> 'equipment' -> 0 ->> 'notes' from scrd_result where label = 'e1'), 'Rear of hall', 'AC02: equipment and its notes are returned');

-- AC03: a venue smaller than the expected attendance is flagged.
select is((select (body -> 'venues' -> 0 ->> 'underCapacity')::boolean from scrd_result where label = 'e1'), false, 'AC03: 80 in a 100-seat venue is not flagged');
select is((select (body -> 'venues' -> 0 ->> 'underCapacity')::boolean from scrd_result where label = 'e2'), true, 'AC03: 150 in a 100-seat venue is flagged');

-- Access: not before the event is Pending Safety Check, and not for outsiders.
select throws_ok(
  $$select public.safety_check_review_details('fe300000-0000-0000-0000-0000000000e3'::uuid)$$,
  '42501', 'Event not found or you do not have access to it',
  'a Safety Officer cannot read an event that is not Pending Safety Check'
);
select set_config('request.jwt.claims', '{"sub":"fe300000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.safety_check_review_details('fe300000-0000-0000-0000-0000000000e1'::uuid)$$,
  '42501', 'Event not found or you do not have access to it',
  'an unrelated organiser cannot read the review details'
);

-- AC03: event information is read-only for a Safety Officer — RLS gives the
-- role no update policy, so every write matches zero rows.
select set_config('request.jwt.claims', '{"sub":"fe300000-0000-0000-0000-000000000003","role":"authenticated"}', true);
with changed as (
  update public.events set title = 'Tampered' where id = 'fe300000-0000-0000-0000-0000000000e1' returning 1
) select is((select count(*)::int from changed), 0, 'AC03: a Safety Officer cannot edit the event');
with changed as (
  update public.venue_bookings set label = 'Tampered' where id = 'fe300000-0000-0000-0000-0000000000b1' returning 1
) select is((select count(*)::int from changed), 0, 'AC03: a Safety Officer cannot edit a venue booking');
with changed as (
  update public.event_equipment_requirements set quantity = 99 where event_id = 'fe300000-0000-0000-0000-0000000000e1' returning 1
) select is((select count(*)::int from changed), 0, 'AC03: a Safety Officer cannot edit equipment requirements');

-- AC04: approving records the reviewer and the time and confirms the event.
select public.decide_event_safety_check('fe300000-0000-0000-0000-0000000000e1'::uuid, 'approved'::public.event_safety_check_decision_type, 'All clear');
reset role;
select is(
  (select decided_by from public.event_safety_check_decisions where event_id = 'fe300000-0000-0000-0000-0000000000e1'),
  'fe300000-0000-0000-0000-000000000003'::uuid,
  'AC04: the approval records the Safety Officer as reviewer'
);
select ok(
  (select decided_at is not null and reason = 'All clear' from public.event_safety_check_decisions where event_id = 'fe300000-0000-0000-0000-0000000000e1'),
  'AC04: the approval records the time and the note'
);

select * from finish();
rollback;
