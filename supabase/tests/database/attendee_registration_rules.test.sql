begin;

select plan(11);

-- SPM-41 (register for a Confirmed event) and SPM-42 (waiting list): the rules
-- not already covered by configure_event_registration, event_waitlist and
-- lock_event_registration_capacity — no duplicate registration, no waiting
-- list once registration has closed, and the queue moving up one place.
-- Waiting-list position is the 1-based order by registered_at, as
-- getWaitlistPosition computes it on the frontend.

insert into auth.users (id, email, raw_user_meta_data) values
  ('c9000000-0000-0000-0000-000000000001', 'ar-organiser@example.test', '{"full_name":"AR Organiser","role":"event_organiser"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000002', 'ar-attendee-1@example.test', '{"full_name":"AR Attendee One","role":"attendee"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000003', 'ar-attendee-2@example.test', '{"full_name":"AR Attendee Two","role":"attendee"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000004', 'ar-attendee-3@example.test', '{"full_name":"AR Attendee Three","role":"attendee"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000005', 'ar-attendee-4@example.test', '{"full_name":"AR Attendee Four","role":"attendee"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000006', 'ar-coordinator@example.test', '{"full_name":"AR Coordinator","role":"event_coordinator"}'::jsonb);

-- eO: open, 5 places. eC: full, waiting list on, registration closed.
-- eF: full (capacity 1), waiting list on, withdrawal permitted, open.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c9000000-0000-0000-0000-0000000000e1', 'c9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000006', 'AR Open Event', 'confirmed', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 5, true),
  ('c9000000-0000-0000-0000-0000000000e2', 'c9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000006', 'AR Closed Event', 'confirmed', '2099-12-02T10:00:00+08:00', '2099-12-02T12:00:00+08:00', 1, true),
  ('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000006', 'AR Full Event', 'confirmed', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 1, true);

insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity, registration_opens_at, registration_closes_at, waitlist_enabled, withdrawal_permitted) values
  ('c9000000-0000-0000-0000-0000000000e1', true, 5, now() - interval '1 day', now() + interval '30 days', true, true),
  ('c9000000-0000-0000-0000-0000000000e2', true, 1, now() - interval '30 days', now() - interval '1 day', true, true),
  ('c9000000-0000-0000-0000-0000000000e3', true, 1, now() - interval '1 day', now() + interval '30 days', true, true);

-- SPM-41 AC05: registering again creates no duplicate and leaves the count unchanged.
select is(
  (public.register_for_event('c9000000-0000-0000-0000-0000000000e1', 'c9000000-0000-0000-0000-000000000002')).status,
  'registered',
  'SPM-41 AC05: the attendee registers once'
);
select throws_ok(
  $$select public.register_for_event('c9000000-0000-0000-0000-0000000000e1', 'c9000000-0000-0000-0000-000000000002')$$,
  '23505', 'You are already registered for this event',
  'SPM-41 AC05: registering again is refused'
);
select is(
  (select count(*)::int from public.event_registrations
   where event_id = 'c9000000-0000-0000-0000-0000000000e1' and attendee_id = 'c9000000-0000-0000-0000-000000000002'),
  1,
  'SPM-41 AC05: no duplicate registration row is created'
);
select is(
  (select count(*)::int from public.event_registrations
   where event_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'registered'),
  1,
  'SPM-41 AC05: the registered count is unchanged'
);

-- SPM-42 AC01: a full event with its waiting list on still offers no waiting list once registration has closed.
insert into public.event_registrations (event_id, attendee_id, status) values
  ('c9000000-0000-0000-0000-0000000000e2', 'c9000000-0000-0000-0000-000000000002', 'registered');
select throws_ok(
  $$select public.join_event_waitlist('c9000000-0000-0000-0000-0000000000e2', 'c9000000-0000-0000-0000-000000000003')$$,
  '23514', 'Registration is closed',
  'SPM-42 AC01: joining the waiting list is refused once registration has closed'
);
select is(
  (select count(*)::int from public.event_registrations where event_id = 'c9000000-0000-0000-0000-0000000000e2'),
  1,
  'SPM-42 AC01: no waiting-list row is created after registration closes'
);

-- eF: attendee-1 holds the only place; attendees 2, 3 and 4 wait in that order.
insert into public.event_registrations (event_id, attendee_id, status, registered_at) values
  ('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000002', 'registered', now() - interval '4 hours'),
  ('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000003', 'waitlisted', now() - interval '3 hours'),
  ('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000004', 'waitlisted', now() - interval '2 hours'),
  ('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000005', 'waitlisted', now() - interval '1 hour');

-- SPM-42 AC04: when a Registered attendee withdraws, the first waiting attendee is
-- registered automatically and everyone still waiting moves up one place.
select lives_ok(
  $$select public.withdraw_registration('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000002')$$,
  'SPM-42 AC04: a Registered attendee withdraws from the full event'
);
select is(
  (select status from public.event_registrations
   where event_id = 'c9000000-0000-0000-0000-0000000000e3' and attendee_id = 'c9000000-0000-0000-0000-000000000003'),
  'registered',
  'SPM-42 AC04: the first waiting attendee is registered automatically'
);
select results_eq(
  $$select attendee_id, row_number() over (order by registered_at)::int
    from public.event_registrations
    where event_id = 'c9000000-0000-0000-0000-0000000000e3' and status = 'waitlisted'
    order by registered_at$$,
  $$values ('c9000000-0000-0000-0000-000000000004'::uuid, 1), ('c9000000-0000-0000-0000-000000000005'::uuid, 2)$$,
  'SPM-42 AC04: everyone still waiting moves up one place (positions 2 and 3 become 1 and 2)'
);

-- SPM-42 AC05: when a waiting attendee leaves, they're removed and everyone behind them moves up one place.
select lives_ok(
  $$select public.leave_event_waitlist('c9000000-0000-0000-0000-0000000000e3', 'c9000000-0000-0000-0000-000000000004')$$,
  'SPM-42 AC05: the attendee in position 1 leaves the waiting list'
);
select results_eq(
  $$select attendee_id, row_number() over (order by registered_at)::int
    from public.event_registrations
    where event_id = 'c9000000-0000-0000-0000-0000000000e3' and status = 'waitlisted'
    order by registered_at$$,
  $$values ('c9000000-0000-0000-0000-000000000005'::uuid, 1)$$,
  'SPM-42 AC05: the leaver is removed and the attendee behind moves up to position 1'
);

select * from finish();
rollback;
