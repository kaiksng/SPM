begin;

select plan(15);

-- Event waitlist (202610240002): join / leave / promote-on-withdraw.

insert into auth.users (id, email, raw_user_meta_data) values
  ('c7000000-0000-0000-0000-000000000001', 'ew-organiser@example.test', '{"full_name":"EW Organiser","role":"event_organiser"}'::jsonb),
  ('c7000000-0000-0000-0000-000000000002', 'ew-attendee-1@example.test', '{"full_name":"EW Attendee One","role":"attendee"}'::jsonb),
  ('c7000000-0000-0000-0000-000000000003', 'ew-attendee-2@example.test', '{"full_name":"EW Attendee Two","role":"attendee"}'::jsonb),
  ('c7000000-0000-0000-0000-000000000004', 'ew-attendee-3@example.test', '{"full_name":"EW Attendee Three","role":"attendee"}'::jsonb),
  ('c7000000-0000-0000-0000-000000000005', 'ew-coordinator@example.test', '{"full_name":"EW Coordinator","role":"event_coordinator"}'::jsonb);

-- eW: confirmed, capacity 1, waitlist enabled, withdrawal permitted.
-- eN: confirmed, capacity 5 (not full), waitlist enabled — for the "not full yet" check.
-- eD: confirmed, capacity 1, waitlist disabled — for the "no waiting list" check.
-- eX: confirmed, capacity 1, waitlist enabled, withdrawal NOT permitted.
-- events_assignment_after_submission requires a coordinator past 'requested'.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000005', 'EW Full Event', 'confirmed', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 1, true),
  ('c7000000-0000-0000-0000-0000000000e2', 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000005', 'EW Not Full Event', 'confirmed', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 5, true),
  ('c7000000-0000-0000-0000-0000000000e3', 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000005', 'EW No Waitlist Event', 'confirmed', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 1, true),
  ('c7000000-0000-0000-0000-0000000000e4', 'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000005', 'EW No Withdrawal Event', 'confirmed', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 1, true);

insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity, waitlist_enabled, withdrawal_permitted) values
  ('c7000000-0000-0000-0000-0000000000e1', true, 1, true, true),
  ('c7000000-0000-0000-0000-0000000000e2', true, 5, true, true),
  ('c7000000-0000-0000-0000-0000000000e3', true, 1, false, true),
  ('c7000000-0000-0000-0000-0000000000e4', true, 1, true, false);

-- attendee-1 holds the only spot on eW.
insert into public.event_registrations (event_id, attendee_id, status) values
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002', 'registered'),
  ('c7000000-0000-0000-0000-0000000000e3', 'c7000000-0000-0000-0000-000000000002', 'registered'),
  ('c7000000-0000-0000-0000-0000000000e4', 'c7000000-0000-0000-0000-000000000002', 'registered');

-- Cannot join a waitlist that isn't enabled.
select throws_ok(
  $$select public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e3', 'c7000000-0000-0000-0000-000000000003')$$,
  '23514', 'This event does not have a waiting list',
  'join_event_waitlist refuses an event with no waiting list'
);

-- Cannot join while capacity remains.
select throws_ok(
  $$select public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e2', 'c7000000-0000-0000-0000-000000000003')$$,
  '23514', 'This event has not reached capacity',
  'join_event_waitlist refuses an event that is not yet full'
);

-- attendee-2 joins the waiting list for the full event.
select is(
  (public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000003')).status,
  'waitlisted',
  'join_event_waitlist records the attendee as waitlisted'
);

-- Already-registered or already-waitlisted attendees cannot join again.
select throws_ok(
  $$select public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002')$$,
  '23505', 'You are already registered for this event',
  'join_event_waitlist refuses an attendee who already holds a registered row'
);
select throws_ok(
  $$select public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000003')$$,
  '23505', 'You are already registered for this event',
  'join_event_waitlist refuses an attendee who is already waitlisted'
);

-- attendee-3 also joins — now behind attendee-2 in FCFS order.
select is(
  (public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000004')).status,
  'waitlisted',
  'a second attendee can also join the waiting list'
);

-- Leaving while waitlisted deletes the row, freeing the slot to rejoin later.
select lives_ok(
  $$select public.leave_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000003')$$,
  'leave_event_waitlist succeeds for a waitlisted attendee'
);
select is(
  (select count(*) from public.event_registrations
    where event_id = 'c7000000-0000-0000-0000-0000000000e1' and attendee_id = 'c7000000-0000-0000-0000-000000000003'),
  0::bigint,
  'leaving the waiting list deletes the row entirely'
);
select lives_ok(
  $$select public.join_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000003')$$,
  'an attendee who left can rejoin the waiting list'
);

-- Cannot leave a waiting list you're not on, or when not currently waitlisted.
select throws_ok(
  $$select public.leave_event_waitlist('c7000000-0000-0000-0000-0000000000e2', 'c7000000-0000-0000-0000-000000000003')$$,
  'P0002', 'You are not on the waiting list for this event',
  'leave_event_waitlist refuses an attendee with no row at all'
);
select throws_ok(
  $$select public.leave_event_waitlist('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002')$$,
  '23514', 'You are not currently on the waiting list for this event',
  'leave_event_waitlist refuses an attendee whose row is registered, not waitlisted'
);

-- Withdrawal isn't permitted on eX.
select throws_ok(
  $$select public.withdraw_registration('c7000000-0000-0000-0000-0000000000e4', 'c7000000-0000-0000-0000-000000000002')$$,
  '23514', 'Withdrawal is not permitted for this event',
  'withdraw_registration refuses an event where withdrawal is not permitted'
);

-- attendee-1 withdraws from the full event: promotes attendee-4 (earliest
-- remaining waitlisted row — attendee-3 left and rejoined later) straight
-- to 'registered', no invite/accept step.
select lives_ok(
  $$select public.withdraw_registration('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002')$$,
  'withdraw_registration succeeds for a registered attendee'
);
select results_eq(
  $$select attendee_id, status from public.event_registrations
    where event_id = 'c7000000-0000-0000-0000-0000000000e1' and status = 'registered'$$,
  $$values ('c7000000-0000-0000-0000-000000000004'::uuid, 'registered')$$,
  'the longest-waiting attendee is promoted straight to registered, auto-registered with no invite step'
);

-- A withdrawn (no longer registered) row cannot be withdrawn again.
select throws_ok(
  $$select public.withdraw_registration('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-000000000002')$$,
  '23514', 'Only a confirmed registration can be withdrawn',
  'withdraw_registration refuses an attendee whose row is already withdrawn'
);

select * from finish();
rollback;
