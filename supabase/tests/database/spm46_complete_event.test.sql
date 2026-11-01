begin;

select plan(43);

-- SPM-46: Complete an Event (202610210001-202610210003).
--
-- Completion depends on the real clock (the event must have finished), so
-- every fixture time is relative to now(), which is fixed for the whole
-- transaction.

insert into auth.users (id, email, raw_user_meta_data) values
  ('c4600000-0000-0000-0000-000000000001', 'spm46-organiser@example.test', '{"full_name":"SPM46 Organiser","role":"event_organiser"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000002', 'spm46-coordinator@example.test', '{"full_name":"SPM46 Coordinator","role":"event_coordinator"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000003', 'spm46-other-coordinator@example.test', '{"full_name":"SPM46 Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000004', 'spm46-lead@example.test', '{"full_name":"SPM46 Lead","role":"event_coordinator_lead"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000005', 'spm46-venue-staff@example.test', '{"full_name":"SPM46 Venue Staff","role":"venue_staff"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000006', 'spm46-tech-staff@example.test', '{"full_name":"SPM46 Tech Staff","role":"technical_support_staff"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000007', 'spm46-attendee@example.test', '{"full_name":"SPM46 Attendee","role":"attendee"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000008', 'spm46-safety-officer@example.test', '{"full_name":"SPM46 Safety Officer","role":"safety_officer"}'::jsonb),
  ('c4600000-0000-0000-0000-000000000009', 'spm46-new-attendee@example.test', '{"full_name":"SPM46 New Attendee","role":"attendee"}'::jsonb);

-- The Hall has a 60-minute turnaround; the Room has none.
insert into public.venues (id, name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('c4600000-0000-0000-0000-000000000010', 'SPM46 Hall', 'Block 46', 200, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 60),
  ('c4600000-0000-0000-0000-000000000011', 'SPM46 Room', 'Block 46', 50, '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 0, 0);

insert into public.equipment_items (id, name, category, code, total_quantity) values
  ('c4600000-0000-0000-0000-000000000012', 'SPM46 Projector', 'AV', 'spm46-projector', 5);

-- Every event is Confirmed (inserted at that status, the same shortcut
-- submit_event_for_safety_check.test.sql uses):
--   eA ended 30 minutes ago, but its Hall booking still needs 60 minutes of turnaround;
--   eB is over, with a Hall booking and a later Room booking, equipment and an attendee;
--   eC is over but still has a Pending venue request;
--   eD is over and has a hold that lapsed before the event started.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, expected_attendance, status, starts_at, ends_at, requirements_acknowledged) values
  ('c4600000-0000-0000-0000-0000000000a1', 'c4600000-0000-0000-0000-000000000001', 'c4600000-0000-0000-0000-000000000002', 'SPM46 Not Yet Turned Around', 100, 'confirmed', now() - interval '2 hours', now() - interval '30 minutes', true),
  ('c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000001', 'c4600000-0000-0000-0000-000000000002', 'SPM46 Finished', 100, 'confirmed', now() - interval '5 hours', now() - interval '90 minutes', true),
  ('c4600000-0000-0000-0000-0000000000c1', 'c4600000-0000-0000-0000-000000000001', 'c4600000-0000-0000-0000-000000000002', 'SPM46 Open Request', 100, 'confirmed', now() - interval '12 hours', now() - interval '11 hours', true),
  ('c4600000-0000-0000-0000-0000000000d1', 'c4600000-0000-0000-0000-000000000001', 'c4600000-0000-0000-0000-000000000002', 'SPM46 Lapsed Hold', 100, 'confirmed', now() - interval '20 hours', now() - interval '19 hours', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, expected_headcount) values
  ('c4600000-0000-0000-0000-00000000a001', 'c4600000-0000-0000-0000-0000000000a1', 'c4600000-0000-0000-0000-000000000010', 'c4600000-0000-0000-0000-000000000002', now() - interval '2 hours', now() - interval '30 minutes', 'approved', true, null),
  ('c4600000-0000-0000-0000-00000000b001', 'c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000010', 'c4600000-0000-0000-0000-000000000002', now() - interval '5 hours', now() - interval '3 hours', 'approved', true, null),
  ('c4600000-0000-0000-0000-00000000b002', 'c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000011', 'c4600000-0000-0000-0000-000000000002', now() - interval '4 hours', now() - interval '90 minutes', 'approved', false, 40),
  ('c4600000-0000-0000-0000-00000000c001', 'c4600000-0000-0000-0000-0000000000c1', 'c4600000-0000-0000-0000-000000000011', 'c4600000-0000-0000-0000-000000000002', now() - interval '12 hours', now() - interval '11 hours', 'approved', true, null),
  ('c4600000-0000-0000-0000-00000000c002', 'c4600000-0000-0000-0000-0000000000c1', 'c4600000-0000-0000-0000-000000000010', 'c4600000-0000-0000-0000-000000000002', now() - interval '12 hours', now() - interval '11 hours', 'pending', false, null),
  ('c4600000-0000-0000-0000-00000000d001', 'c4600000-0000-0000-0000-0000000000d1', 'c4600000-0000-0000-0000-000000000011', 'c4600000-0000-0000-0000-000000000002', now() - interval '20 hours', now() - interval '19 hours', 'approved', true, null);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, expires_at, held_by) values
  ('c4600000-0000-0000-0000-00000000d002', 'c4600000-0000-0000-0000-0000000000d1', 'c4600000-0000-0000-0000-000000000010', 'c4600000-0000-0000-0000-000000000002', now() - interval '20 hours', now() - interval '19 hours', 'on_hold', false, now() - interval '21 hours', 'c4600000-0000-0000-0000-000000000005');

insert into public.equipment_reservations (id, event_id, equipment_item_id, quantity, starts_at, ends_at, status, requested_by, requested_at, decided_by, decided_at) values
  ('c4600000-0000-0000-0000-00000000be01', 'c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000012', 2, now() - interval '5 hours', now() - interval '3 hours', 'approved', 'c4600000-0000-0000-0000-000000000006', now() - interval '2 days', 'c4600000-0000-0000-0000-000000000006', now() - interval '2 days');

insert into public.event_registrations (event_id, attendee_id, status) values
  ('c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000007', 'registered');

-- AC01/AC02: the earliest completion time is the latest booking's end (no
-- later than the event's end) plus its venue's turnaround.
select is(
  public.event_completion_available_at('c4600000-0000-0000-0000-0000000000a1'),
  now() + interval '30 minutes',
  'AC02: the end time plus the Hall''s 60-minute turnaround is 30 minutes from now'
);
select is(
  public.event_completion_available_at('c4600000-0000-0000-0000-0000000000b1'),
  now() - interval '90 minutes',
  'AC01: with several venues, the last one turned around decides (the Room, no turnaround, ends after the Hall''s turnaround)'
);

-- A booking left at an old date after the event's time changed (SPM-39
-- AC11) counts only up to the event's end, not to the old date.
update public.venue_bookings
set starts_at = now() + interval '50 days', ends_at = now() + interval '50 days 3 hours'
where id = 'c4600000-0000-0000-0000-00000000a001';
select is(
  public.event_completion_available_at('c4600000-0000-0000-0000-0000000000a1'),
  now() + interval '30 minutes',
  'AC01: a booking still at an old, later date does not delay completion past the event''s end plus turnaround'
);
update public.venue_bookings
set starts_at = now() - interval '2 hours', ends_at = now() - interval '30 minutes'
where id = 'c4600000-0000-0000-0000-00000000a001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- AC02: not before the turnaround is over; the message names the earliest time.
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000a1')$$,
  '23514',
  'This event can be marked completed from '
    || to_char((now() + interval '30 minutes') at time zone 'Asia/Singapore', 'FMDD Mon YYYY, FMHH12:MI am'),
  'AC02: the event cannot be completed before its end time plus turnaround'
);
select is(
  (select status::text from public.events where id = 'c4600000-0000-0000-0000-0000000000a1'),
  'confirmed',
  'AC02: the status stays Confirmed'
);

-- AC03: only the assigned coordinator.
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000b1')$$,
  '42501', 'Only the assigned coordinator can mark this event completed',
  'AC03: another coordinator cannot complete the event'
);
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000b1')$$,
  '42501', 'Only the assigned coordinator can mark this event completed',
  'AC03: the Event Coordinator Lead cannot complete the event'
);
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000b1')$$,
  '42501', 'Only the assigned coordinator can mark this event completed',
  'AC03: the organiser cannot complete the event'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- A Pending venue request must be resolved first.
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000c1')$$,
  '23514', 'Resolve this event''s open venue booking requests before marking it completed',
  'an event with a Pending venue request cannot be completed'
);

-- A lapsed hold is expired rather than blocking completion.
select lives_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000d1')$$,
  'an event whose only open request is a lapsed hold can be completed'
);
select is(
  (select status::text from public.venue_bookings where id = 'c4600000-0000-0000-0000-00000000d002'),
  'expired',
  'the lapsed hold is expired, not left On Hold on a Completed event'
);

-- AC01: the assigned coordinator completes a finished event; its equipment
-- reservation is released along the way (the one write the arrangement lock
-- lets through).
select lives_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000b1')$$,
  'AC01: the assigned coordinator completes a finished Confirmed event'
);

reset role;

select is(
  (select status::text from public.events where id = 'c4600000-0000-0000-0000-0000000000b1'),
  'completed',
  'AC01: the status becomes Completed'
);
select is(
  (select row(changed_by, changed_at is not null) from public.event_status_history
   where event_id = 'c4600000-0000-0000-0000-0000000000b1' and to_status = 'completed'),
  row('c4600000-0000-0000-0000-000000000002'::uuid, true),
  'AC01: the coordinator and time are recorded in the status history'
);
select is(
  (select row(r.status::text, ev.details ->> 'reason')
   from public.equipment_reservations r
   join public.equipment_reservation_events ev on ev.reservation_id = r.id
   where r.id = 'c4600000-0000-0000-0000-00000000be01' and ev.action = 'released'),
  row('cancelled'::text, 'The event was completed'::text),
  'AC06: the reservation is released, recording that the event was completed'
);

-- AC04: only a Confirmed event.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_event('c4600000-0000-0000-0000-0000000000b1')$$,
  '23514', 'Only a Confirmed event can be marked completed',
  'AC04: a Completed event cannot be completed again'
);

-- AC05: the organiser still sees the records.
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.venue_bookings where event_id = 'c4600000-0000-0000-0000-0000000000b1'),
  2, 'AC05: the organiser still sees both venue bookings'
);
select is(
  (select count(*)::int from public.equipment_reservations where event_id = 'c4600000-0000-0000-0000-0000000000b1'),
  1, 'AC05: the organiser still sees the equipment reservation'
);
select is(
  (select count(*)::int from public.event_registrations where event_id = 'c4600000-0000-0000-0000-0000000000b1'),
  1, 'AC05: the organiser still sees the registration'
);
select is(
  (select count(*)::int from public.event_status_history where event_id = 'c4600000-0000-0000-0000-0000000000b1'),
  2, 'AC05: the organiser still sees the full status history'
);

-- AC07: nothing about a Completed event's arrangements can change, whoever
-- tries and however. event_change_requests has no direct-insert policy
-- since 202610200013 (SPM-38) -- only submit_event_change_request writes to
-- it, and its own status check already excludes Completed, so this goes
-- through the RPC rather than a raw insert the table no longer allows at all.
select throws_ok(
  $$select public.submit_event_change_request(
    'c4600000-0000-0000-0000-0000000000b1', '{"title":"New"}'::jsonb, 'A reason')$$,
  '23514', 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event',
  'AC07: the organiser cannot submit a change request'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at, is_main_venue)
    values ('c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000011', 'c4600000-0000-0000-0000-000000000002',
            now() + interval '1 day', now() + interval '1 day 2 hours', false)$$,
  '23514', 'This event is completed and can no longer be changed',
  'AC07: the coordinator cannot add a venue booking directly'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$update public.venue_bookings set needs_review = true where id = 'c4600000-0000-0000-0000-00000000b001'$$,
  '23514', 'This event is completed and can no longer be changed',
  'AC07: Venue Staff cannot change a booking'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$update public.equipment_reservations set quantity = 1 where id = 'c4600000-0000-0000-0000-00000000be01'$$,
  '23514', 'This event is completed and can no longer be changed',
  'AC07: Technical Support Staff cannot change a reservation'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select throws_ok(
  $$update public.event_registrations set status = status where event_id = 'c4600000-0000-0000-0000-0000000000b1'$$,
  '23514', 'This event is completed and can no longer be changed',
  'AC07: the attendee cannot change their registration'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$select public.register_for_event('c4600000-0000-0000-0000-0000000000b1')$$,
  '23514', 'This event is not open for registration',
  'AC07: a new attendee cannot register'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.request_event_clarification('c4600000-0000-0000-0000-0000000000b1', 'Which room?')$$,
  '23514', 'Clarification can only be requested while the event is Requested',
  'AC07: the coordinator cannot request a clarification'
);
select throws_ok(
  $$select public.submit_event_for_safety_check('c4600000-0000-0000-0000-0000000000b1')$$,
  '23514', 'Only a Planning event can be submitted for the safety check',
  'AC07: the coordinator cannot submit the event for the safety check'
);
select throws_ok(
  $$select public.cancel_event('c4600000-0000-0000-0000-0000000000b1', 'No longer needed')$$,
  '23514', 'An event with status completed cannot be cancelled',
  'AC07: the coordinator cannot cancel the event'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_safety_check('c4600000-0000-0000-0000-0000000000b1', 'rejected', 'Unsafe crowd plan')$$,
  '23514', 'Only an event Pending Safety Check can be decided',
  'AC07: the Safety Officer cannot decide a safety check'
);

select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.reassign_event_coordinator('c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000003', 'Workload')$$,
  '23514', 'An event with status completed cannot be assigned',
  'AC07: the Lead cannot reassign the coordinator'
);

reset role;
select throws_ok(
  $$insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
    values ('c4600000-0000-0000-0000-0000000000b1', 'c4600000-0000-0000-0000-000000000012', 'SPM46 Projector', 1, now(), now() + interval '1 hour')$$,
  '23514', 'This event is completed and can no longer be changed',
  'AC07: the lock applies to every writer, including security definer functions'
);
select is(
  (select row(count(*)::int, bool_or(needs_review)) from public.venue_bookings where event_id = 'c4600000-0000-0000-0000-0000000000b1'),
  row(2, false),
  'AC07: the bookings are unchanged'
);
select is(
  (select row(
     e.status::text,
     e.assigned_coordinator_id,
     (select count(*)::int from public.clarifications where event_id = e.id),
     (select count(*)::int from public.event_registrations where event_id = e.id))
   from public.events e where e.id = 'c4600000-0000-0000-0000-0000000000b1'),
  row('completed'::text, 'c4600000-0000-0000-0000-000000000002'::uuid, 0, 1),
  'AC07: still Completed, same coordinator, no clarification and no new registration'
);

-- Venue Staff's venue-wide checks skip Completed events instead of failing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_venue('c4600000-0000-0000-0000-000000000011', '{"name":"SPM46 Room","location":"Block 46","capacity":10,"operating_hours":[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}],"facilities":[],"layouts":["Theatre"]}'::jsonb)$$,
  'Venue Staff can reduce the Room''s capacity below a Completed event''s headcount'
);
reset role;
select is(
  (select needs_review from public.venue_bookings where id = 'c4600000-0000-0000-0000-00000000b002'),
  false,
  'the Completed event''s booking is not flagged for capacity'
);
select is(
  (select needs_review from public.venue_bookings where id = 'c4600000-0000-0000-0000-00000000c001'),
  true,
  'a booking for an event that is not Completed is still flagged'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_venue_block('c4600000-0000-0000-0000-000000000010', 'Maintenance', now() - interval '6 hours', now() - interval '1 hour')$$,
  'Venue Staff can record a block over a Completed event''s period'
);
reset role;
select is(
  (select count(*)::int from public.venue_booking_disruptions where booking_id = 'c4600000-0000-0000-0000-00000000b001'),
  0,
  'the Completed event''s booking is not marked disrupted'
);
select is(
  (select status::text from public.events where id = 'c4600000-0000-0000-0000-0000000000b1'),
  'completed',
  'the Completed event stays Completed'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4600000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok(
  $$select public.recheck_venue_conflicts('c4600000-0000-0000-0000-000000000010')$$,
  'Venue Staff can re-check the Hall''s conflicts'
);
reset role;
select is(
  (select count(*)::int from public.venue_booking_conflicts where booking_id = 'c4600000-0000-0000-0000-00000000b001'),
  0,
  'the Completed event''s booking is not flagged as conflicting with the block'
);
select is(
  (select count(*)::int from public.venue_booking_conflicts where booking_id = 'c4600000-0000-0000-0000-00000000a001'),
  1,
  'a booking for an event that is not Completed is still flagged'
);

select * from finish();
rollback;
