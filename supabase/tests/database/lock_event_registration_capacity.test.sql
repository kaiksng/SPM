begin;

select plan(10);

-- Registration capacity lock (202610270001). Two transactions taking the last place
-- at the same moment can't be simulated in one pgTAP session, so this checks that
-- each function takes the per-event lock and still behaves as before.

-- The lock: each function locks the event's registration settings row.
select ok(
  (select prosrc from pg_proc where oid = 'public.register_for_event(uuid, uuid)'::regprocedure)
    ~* 'from public\.event_registration_requirements\s+where event_id = p_event_id\s+for update',
  'register_for_event locks the event''s registration settings row'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.join_event_waitlist(uuid, uuid)'::regprocedure)
    ~* 'from public\.event_registration_requirements\s+where event_id = p_event_id\s+for update',
  'join_event_waitlist locks the event''s registration settings row'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.withdraw_registration(uuid, uuid)'::regprocedure)
    ~* 'perform 1\s+from public\.event_registration_requirements\s+where event_id = p_event_id\s+for update',
  'withdraw_registration takes the same lock before changing registrations'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c8000000-0000-0000-0000-000000000001', 'rl-organiser@example.test', '{"full_name":"RL Organiser","role":"event_organiser"}'::jsonb),
  ('c8000000-0000-0000-0000-000000000002', 'rl-attendee-1@example.test', '{"full_name":"RL Attendee One","role":"attendee"}'::jsonb),
  ('c8000000-0000-0000-0000-000000000003', 'rl-attendee-2@example.test', '{"full_name":"RL Attendee Two","role":"attendee"}'::jsonb),
  ('c8000000-0000-0000-0000-000000000004', 'rl-attendee-3@example.test', '{"full_name":"RL Attendee Three","role":"attendee"}'::jsonb),
  ('c8000000-0000-0000-0000-000000000005', 'rl-coordinator@example.test', '{"full_name":"RL Coordinator","role":"event_coordinator"}'::jsonb);

-- Confirmed, 2 places, waiting list and withdrawal allowed, registration open.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance, requirements_acknowledged) values
  ('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000005', 'RL Event', 'confirmed', '2099-12-05T10:00:00+08:00', '2099-12-05T12:00:00+08:00', 2, true);
insert into public.event_registration_requirements (event_id, registration_required, attendee_capacity, waitlist_enabled, withdrawal_permitted) values
  ('c8000000-0000-0000-0000-0000000000e1', true, 2, true, true);

-- Behaviour is unchanged: two places fill, the third attendee is refused, then waits.
select is(
  (public.register_for_event('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000002')).status,
  'registered', 'first attendee registers'
);
select is(
  (public.register_for_event('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000003')).status,
  'registered', 'second attendee takes the last place'
);
select throws_ok(
  $$select public.register_for_event('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000004')$$,
  '23514', 'This event has reached capacity',
  'a third attendee is refused once the event is full'
);
select is(
  (public.join_event_waitlist('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000004')).status,
  'waitlisted', 'the third attendee can join the waiting list'
);

-- Withdrawal frees a place and promotes the first waiting attendee, still within capacity.
select lives_ok(
  $$select public.withdraw_registration('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-000000000002')$$,
  'a registered attendee can withdraw'
);
select is(
  (select status from public.event_registrations
   where event_id = 'c8000000-0000-0000-0000-0000000000e1' and attendee_id = 'c8000000-0000-0000-0000-000000000004'),
  'registered', 'the first waiting attendee is promoted'
);
select is(
  (select count(*)::int from public.event_registrations
   where event_id = 'c8000000-0000-0000-0000-0000000000e1' and status = 'registered'),
  2, 'the event stays at capacity, not over it'
);

select * from finish();
rollback;
