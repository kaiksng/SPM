begin;

select plan(16);

-- Submitting an event for the Operational Safety Check
-- (202610190004_submit_event_for_safety_check.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('fd000000-0000-0000-0000-000000000001', 'sub-organiser@example.test', '{"full_name":"SUB Organiser","role":"event_organiser"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000002', 'sub-coordinator@example.test', '{"full_name":"SUB Coordinator","role":"event_coordinator"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000003', 'sub-other-coordinator@example.test', '{"full_name":"SUB Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000004', 'sub-safety-a@example.test', '{"full_name":"SUB Safety A","role":"safety_officer"}'::jsonb),
  ('fd000000-0000-0000-0000-000000000005', 'sub-safety-b@example.test', '{"full_name":"SUB Safety B","role":"safety_officer"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fd000000-0000-0000-0000-000000000010', 'SUB Hall', 'Block 1', 200);

-- E1: Ready (approved unflagged main venue, no equipment, acknowledged).
-- E2: Not ready (main venue still Pending).
-- E3: Draft — wrong status entirely.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values
  ('fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002', 'SUB Ready Event', 'planning', '2099-10-01T10:00:00+08:00', '2099-10-01T12:00:00+08:00', true),
  ('fd000000-0000-0000-0000-0000000000e2', 'fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002', 'SUB Not Ready Event', 'planning', '2099-10-02T10:00:00+08:00', '2099-10-02T12:00:00+08:00', true),
  ('fd000000-0000-0000-0000-0000000000e3', 'fd000000-0000-0000-0000-000000000001', null, 'SUB Draft Event', 'draft', '2099-10-03T10:00:00+08:00', '2099-10-03T12:00:00+08:00', false);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values
  ('fd000000-0000-0000-0000-0000000000b1', 'fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-000000000010', 'fd000000-0000-0000-0000-000000000002', '2099-10-01T10:00:00+08:00', '2099-10-01T12:00:00+08:00', 'approved', true),
  ('fd000000-0000-0000-0000-0000000000b2', 'fd000000-0000-0000-0000-0000000000e2', 'fd000000-0000-0000-0000-000000000010', 'fd000000-0000-0000-0000-000000000002', '2099-10-02T10:00:00+08:00', '2099-10-02T12:00:00+08:00', 'pending', true);

create temporary table sub_result (label text primary key, body jsonb);
grant all on sub_result to authenticated;

set local role authenticated;

-- AC05: only the assigned coordinator can submit.
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Only the assigned coordinator can submit this event for the safety check',
  'a coordinator not assigned to the event cannot submit it'
);

select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e1')$$,
  '42501', 'Only the assigned coordinator can submit this event for the safety check',
  'the organiser cannot submit the event either'
);

select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- Event e3 is both Draft and has no assigned coordinator. The function
-- checks assignment before status, so this actually fails on "not the
-- assigned coordinator", not the status check.
select throws_ok(
  $$select public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e3')$$,
  '42501', 'Only the assigned coordinator can submit this event for the safety check',
  'a Draft event with no assigned coordinator fails the coordinator check first'
);

-- AC05: blocked with outstanding items listed when not Ready.
select throws_ok(
  $$select public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e2')$$,
  '23514', 'This event is not ready for the safety check',
  'submission is blocked when the event is not Ready'
);
select is(
  (select status::text from public.events where id = 'fd000000-0000-0000-0000-0000000000e2'),
  'planning',
  'a blocked submission does not change the event status'
);

-- AC05/AC06: a Ready event can be submitted.
select lives_ok(
  $$insert into sub_result select 'first', public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e1')$$,
  'a Ready event is submitted successfully'
);
select is((select body ->> 'status' from sub_result where label = 'first'), 'pending_safety_check', 'the function reports the new status');
select is((select (body ->> 'round')::int from sub_result where label = 'first'), 1, 'the first submission is round 1');

reset role;
select is((select status::text from public.events where id = 'fd000000-0000-0000-0000-0000000000e1'), 'pending_safety_check', 'AC05: the event becomes Pending Safety Check');
select is(
  (select row(coordinator_id, round, attendance_snapshot) from public.event_safety_check_submissions where event_id = 'fd000000-0000-0000-0000-0000000000e1'),
  row('fd000000-0000-0000-0000-000000000002'::uuid, 1, null::int),
  'AC06: the submission records the coordinator and round'
);
select is(
  (select count(*)::int from public.notifications where event_id = 'fd000000-0000-0000-0000-0000000000e1' and type = 'safety_check_requested'),
  2,
  'AC05: every Safety Officer is notified'
);
select is(
  (select changed_by from public.event_status_history where event_id = 'fd000000-0000-0000-0000-0000000000e1' and to_status = 'pending_safety_check'),
  'fd000000-0000-0000-0000-000000000002',
  'the status-history row records who submitted it'
);

-- AC06: a resubmission (after a return to Planning) starts a new round.
update public.events set status = 'planning' where id = 'fd000000-0000-0000-0000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fd000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into sub_result select 'second', public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e1')$$,
  'the event can be resubmitted after returning to Planning'
);
select is((select (body ->> 'round')::int from sub_result where label = 'second'), 2, 'AC06: the resubmission starts a new round');
select is(
  (select count(*)::int from public.event_safety_check_submissions where event_id = 'fd000000-0000-0000-0000-0000000000e1'),
  2,
  'both submissions are kept'
);

-- The real submission path: apps/backend's service-role client calls this
-- RPC with no JWT (auth.uid() is null there) and the already-authenticated
-- coordinator's id as p_actor_id. This used to always fail because the
-- nested event_readiness -> can_view_event check only ever looked at
-- auth.uid(), never the resolved actor (202610190008).
reset role;
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values ('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002', 'SUB Backend Ready Event', 'planning', '2099-10-04T10:00:00+08:00', '2099-10-04T12:00:00+08:00', true);
insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values ('fd000000-0000-0000-0000-0000000000b4', 'fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-000000000010', 'fd000000-0000-0000-0000-000000000002', '2099-10-04T10:00:00+08:00', '2099-10-04T12:00:00+08:00', 'approved', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.submit_event_for_safety_check('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-000000000002')$$,
  'the backend (service role, no JWT) can submit a Ready event on behalf of the resolved coordinator'
);

select * from finish();
rollback;
