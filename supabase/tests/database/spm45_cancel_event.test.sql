begin;

select plan(26);

-- SPM-45: Cancel an Event (202610200001_cancel_event.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('ce000000-0000-0000-0000-000000000001', 'spm45-organiser@example.test', '{"full_name":"SPM45 Organiser","role":"event_organiser"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000002', 'spm45-coordinator@example.test', '{"full_name":"SPM45 Coordinator","role":"event_coordinator"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000003', 'spm45-other-coordinator@example.test', '{"full_name":"SPM45 Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000004', 'spm45-venue-staff@example.test', '{"full_name":"SPM45 Venue Staff","role":"venue_staff"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000005', 'spm45-tech-staff@example.test', '{"full_name":"SPM45 Tech Staff","role":"technical_support_staff"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000006', 'spm45-safety-officer@example.test', '{"full_name":"SPM45 Safety Officer","role":"safety_officer"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000007', 'spm45-attendee@example.test', '{"full_name":"SPM45 Attendee","role":"attendee"}'::jsonb),
  ('ce000000-0000-0000-0000-000000000008', 'spm45-other-attendee@example.test', '{"full_name":"SPM45 Other Attendee","role":"attendee"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('ce000000-0000-0000-0000-000000000010', 'SPM45 Hall', 'Block 9', 200);

insert into public.equipment_items (id, name, category, code, total_quantity) values
  ('ce000000-0000-0000-0000-000000000011', 'SPM45 Projector', 'AV', 'spm45-projector', 5);

-- Fixture events, one per scenario, inserted directly at their target status
-- (same shortcut submit_event_for_safety_check.test.sql uses) rather than
-- walking every RPC to get there.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values
  -- e1: happy path, Requested, with a venue booking, hold, equipment
  -- reservation and a registered attendee to release/notify.
  ('ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event One', 'requested', '2099-06-01T10:00:00+08:00', '2099-06-01T12:00:00+08:00', true),
  -- e2: Planning, cancelled by another coordinator (denied) then by no one assigned (denied).
  ('ce000000-0000-0000-0000-0000000000e2', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Two', 'planning', '2099-06-02T10:00:00+08:00', '2099-06-02T12:00:00+08:00', true),
  -- e3: Pending Safety Check — the Safety Officer must also be notified.
  ('ce000000-0000-0000-0000-0000000000e3', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Three', 'pending_safety_check', '2099-06-03T10:00:00+08:00', '2099-06-03T12:00:00+08:00', true),
  -- e4: Confirmed — reachable per AC2.
  ('ce000000-0000-0000-0000-0000000000e4', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Four', 'confirmed', '2099-06-04T10:00:00+08:00', '2099-06-04T12:00:00+08:00', true),
  -- e5/e6/e7: terminal statuses, cannot be cancelled.
  ('ce000000-0000-0000-0000-0000000000e5', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Five', 'completed', '2099-06-05T10:00:00+08:00', '2099-06-05T12:00:00+08:00', true),
  ('ce000000-0000-0000-0000-0000000000e6', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Six', 'rejected', '2099-06-06T10:00:00+08:00', '2099-06-06T12:00:00+08:00', true),
  ('ce000000-0000-0000-0000-0000000000e7', 'ce000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'SPM45 Event Seven', 'cancelled', '2099-06-07T10:00:00+08:00', '2099-06-07T12:00:00+08:00', true),
  -- e8: unassigned (no coordinator) — denied.
  ('ce000000-0000-0000-0000-0000000000e8', 'ce000000-0000-0000-0000-000000000001', null, 'SPM45 Event Eight', 'requested', '2099-06-08T10:00:00+08:00', '2099-06-08T12:00:00+08:00', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values
  ('ce000000-0000-0000-0000-0000000000b1', 'ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000010', 'ce000000-0000-0000-0000-000000000002', '2099-06-01T10:00:00+08:00', '2099-06-01T12:00:00+08:00', 'approved', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue, expires_at, held_by)
values
  ('ce000000-0000-0000-0000-0000000000b2', 'ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000010', 'ce000000-0000-0000-0000-000000000002', '2099-06-01T14:00:00+08:00', '2099-06-01T16:00:00+08:00', 'on_hold', false, now() + interval '1 day', 'ce000000-0000-0000-0000-000000000004');

-- A not-yet-due "hold expiring soon" reminder tied to the hold — cancelling
-- the event should clear it (it no longer applies).
insert into public.notifications (recipient_id, event_id, booking_id, type, title, message, scheduled_for)
values (
  'ce000000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000b2',
  'venue_hold_expiring_soon'::public.notification_type, 'Hold expiring soon', 'Reminder', now() + interval '12 hours'
);

insert into public.equipment_reservations (id, event_id, equipment_item_id, quantity, starts_at, ends_at, status, requested_by, requested_at, decided_by, decided_at)
values
  ('ce000000-0000-0000-0000-0000000000r1', 'ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000011', 2, '2099-06-01T10:00:00+08:00', '2099-06-01T12:00:00+08:00', 'approved', 'ce000000-0000-0000-0000-000000000005', now(), 'ce000000-0000-0000-0000-000000000005', now());

insert into public.event_registrations (event_id, attendee_id, status)
values ('ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000007', 'registered');

create temporary table spm45_result (label text primary key, body jsonb);
grant all on spm45_result to authenticated;

set local role authenticated;

-- AC1: an unassigned coordinator (not this event's) cannot cancel it.
select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.cancel_event('ce000000-0000-0000-0000-0000000000e2', 'Not my event')$$,
  '42501', 'Only the assigned coordinator can cancel this event',
  'AC1: another coordinator cannot cancel this event'
);

-- AC1: a coordinator cannot cancel an unassigned event.
select throws_ok(
  $$select public.cancel_event('ce000000-0000-0000-0000-0000000000e8', 'Not assigned')$$,
  '42501', 'Only the assigned coordinator can cancel this event',
  'AC1: an unassigned event cannot be cancelled'
);

select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- AC3: a reason is required.
select throws_ok(
  $$select public.cancel_event('ce000000-0000-0000-0000-0000000000e2', '   ')$$,
  '23514', 'Give a reason for cancelling this event',
  'AC3: a blank reason is rejected'
);

-- AC2: terminal statuses cannot be cancelled.
select throws_ok(
  format($$select public.cancel_event(%L::uuid, 'Too late')$$, 'ce000000-0000-0000-0000-0000000000e5'),
  '23514', null, 'AC2: a Completed event cannot be cancelled'
);
select throws_ok(
  format($$select public.cancel_event(%L::uuid, 'Too late')$$, 'ce000000-0000-0000-0000-0000000000e6'),
  '23514', null, 'AC2: a Rejected event cannot be cancelled'
);
select throws_ok(
  format($$select public.cancel_event(%L::uuid, 'Too late')$$, 'ce000000-0000-0000-0000-0000000000e7'),
  '23514', null, 'AC2: an already-Cancelled event cannot be cancelled again'
);

-- AC4/AC5/AC6/AC7: the happy path, event e1, releasing its venue booking,
-- tentative hold and equipment reservation and notifying everyone.
select lives_ok(
  $$insert into spm45_result select 'e1', public.cancel_event('ce000000-0000-0000-0000-0000000000e1', 'The sponsor withdrew funding.')$$,
  'AC1/AC2/AC3: the assigned coordinator can cancel a Requested event with a reason'
);
select is((select body ->> 'status' from spm45_result where label = 'e1'), 'cancelled', 'the function reports the new status');

reset role;

select is(
  (select status::text from public.events where id = 'ce000000-0000-0000-0000-0000000000e1'),
  'cancelled',
  'AC4: the event status is Cancelled'
);
select is(
  (select row(changed_by, reason) from public.event_status_history where event_id = 'ce000000-0000-0000-0000-0000000000e1' and to_status = 'cancelled'),
  row('ce000000-0000-0000-0000-000000000002'::uuid, 'The sponsor withdrew funding.'),
  'AC4: the history row records the actor and reason'
);

-- AC5/AC6: both the approved booking and the tentative hold are released.
select is(
  (select count(*)::int from public.venue_bookings
   where event_id = 'ce000000-0000-0000-0000-0000000000e1' and status = 'cancelled'
     and cancelled_by = 'ce000000-0000-0000-0000-000000000002' and cancellation_reason = 'The sponsor withdrew funding.'
     and cancelled_at is not null),
  2,
  'AC5/AC6: both the approved booking and the on_hold booking are released with actor/reason/time'
);
select is(
  (select count(*)::int from public.notifications where booking_id = 'ce000000-0000-0000-0000-0000000000b2' and scheduled_for > now()),
  0,
  'the hold''s not-yet-due reminder is cleared'
);

-- AC5: the equipment reservation is released (by the equipment-release
-- trigger) with the actor backfilled, not left null.
select is(
  (select row(status::text, released_by) from public.equipment_reservations where id = 'ce000000-0000-0000-0000-0000000000r1'),
  row('cancelled'::text, 'ce000000-0000-0000-0000-000000000002'::uuid),
  'AC5: the equipment reservation is released and attributed to the actor'
);
select is(
  (select count(*)::int from public.equipment_reservation_events where reservation_id = 'ce000000-0000-0000-0000-0000000000r1' and action = 'released' and actor = 'ce000000-0000-0000-0000-000000000002'),
  1,
  'AC5: the release is logged in equipment history with the actor'
);

-- AC7: notifications fan out to everyone with a stake, all type 'cancellation'.
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000001' and type = 'cancellation'),
  1, 'AC7: the organiser is notified'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000002' and type = 'cancellation'),
  1, 'AC7: the assigned coordinator is notified'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000007' and type = 'cancellation'),
  1, 'AC7: the registered attendee is notified'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000004' and type = 'cancellation'),
  1, 'AC7: Venue Staff are notified because a booking was released'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000005' and type = 'cancellation'),
  1, 'AC7: Technical Support Staff are notified because a reservation was released'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e1' and recipient_id = 'ce000000-0000-0000-0000-000000000006' and type = 'cancellation'),
  0, 'AC7: the Safety Officer is not notified for an event that was never Pending Safety Check'
);

-- AC8: registering for the now-cancelled event is blocked. (can_view_event
-- never grants the attendee role visibility either, a pre-existing gap out
-- of this story's scope — either clause alone already denies this insert.)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.event_registrations (event_id, attendee_id) values ('ce000000-0000-0000-0000-0000000000e1', 'ce000000-0000-0000-0000-000000000008')$$,
  '42501', null,
  'AC8: a new registration on a Cancelled event is blocked'
);

-- AC7: cancelling a Pending Safety Check event also notifies the Safety Officer.
select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.cancel_event('ce000000-0000-0000-0000-0000000000e3', 'Safety arrangements fell through')$$,
  'the assigned coordinator can cancel a Pending Safety Check event'
);
reset role;
select is(
  (select count(*)::int from public.notifications where event_id = 'ce000000-0000-0000-0000-0000000000e3' and recipient_id = 'ce000000-0000-0000-0000-000000000006' and type = 'cancellation'),
  1, 'AC7: the Safety Officer is notified when cancelled from Pending Safety Check'
);

-- AC2: a Confirmed event can also be cancelled.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.cancel_event('ce000000-0000-0000-0000-0000000000e4', 'The venue flooded')$$,
  'AC2: the assigned coordinator can cancel a Confirmed event'
);
reset role;
select is(
  (select status::text from public.events where id = 'ce000000-0000-0000-0000-0000000000e4'),
  'cancelled', 'AC2: the Confirmed event is now Cancelled'
);

-- AC9: nothing is deleted — the organiser can still see the cancelled
-- event's history (can_view_event-scoped select policy, unchanged).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.event_status_history where event_id = 'ce000000-0000-0000-0000-0000000000e1'),
  2,
  'AC9: the organiser can still see the event''s full status history after cancellation'
);
reset role;

select * from finish();
rollback;
