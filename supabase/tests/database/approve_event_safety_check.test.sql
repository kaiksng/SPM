begin;

select plan(18);

-- decide_event_safety_check (202610250001/202610250002): the Approve
-- outcome, plus a regression pass on changes_requested/rejected now that
-- the if/elsif/else was restructured to add a third branch.

insert into auth.users (id, email, raw_user_meta_data) values
  ('fd200000-0000-0000-0000-000000000001', 'aesc-organiser@example.test', '{"full_name":"AESC Organiser","role":"event_organiser"}'::jsonb),
  ('fd200000-0000-0000-0000-000000000002', 'aesc-coordinator@example.test', '{"full_name":"AESC Coordinator","role":"event_coordinator"}'::jsonb),
  ('fd200000-0000-0000-0000-000000000003', 'aesc-safety@example.test', '{"full_name":"AESC Safety","role":"safety_officer"}'::jsonb),
  ('fd200000-0000-0000-0000-000000000004', 'aesc-other-coordinator@example.test', '{"full_name":"AESC Other Coordinator","role":"event_coordinator"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fd200000-0000-0000-0000-000000000010', 'AESC Hall', 'Block 3', 100);

-- E1: approved with no reason. E2: approved with a reason. E3: rejected
-- (regression). E4: changes_requested (regression). E5: wrong status.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, requirements_acknowledged)
values
  ('fd200000-0000-0000-0000-0000000000e1', 'fd200000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', 'AESC Event 1', 'planning', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', true),
  ('fd200000-0000-0000-0000-0000000000e2', 'fd200000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', 'AESC Event 2', 'planning', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', true),
  ('fd200000-0000-0000-0000-0000000000e3', 'fd200000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', 'AESC Event 3', 'planning', '2099-12-12T10:00:00+08:00', '2099-12-12T12:00:00+08:00', true),
  ('fd200000-0000-0000-0000-0000000000e4', 'fd200000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', 'AESC Event 4', 'planning', '2099-12-13T10:00:00+08:00', '2099-12-13T12:00:00+08:00', true),
  ('fd200000-0000-0000-0000-0000000000e5', 'fd200000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000002', 'AESC Event 5', 'planning', '2099-12-14T10:00:00+08:00', '2099-12-14T12:00:00+08:00', true);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue)
values
  ('fd200000-0000-0000-0000-0000000000b1', 'fd200000-0000-0000-0000-0000000000e1', 'fd200000-0000-0000-0000-000000000010', 'fd200000-0000-0000-0000-000000000002', '2099-12-10T10:00:00+08:00', '2099-12-10T12:00:00+08:00', 'approved', true),
  ('fd200000-0000-0000-0000-0000000000b2', 'fd200000-0000-0000-0000-0000000000e2', 'fd200000-0000-0000-0000-000000000010', 'fd200000-0000-0000-0000-000000000002', '2099-12-11T10:00:00+08:00', '2099-12-11T12:00:00+08:00', 'approved', true),
  ('fd200000-0000-0000-0000-0000000000b3', 'fd200000-0000-0000-0000-0000000000e3', 'fd200000-0000-0000-0000-000000000010', 'fd200000-0000-0000-0000-000000000002', '2099-12-12T10:00:00+08:00', '2099-12-12T12:00:00+08:00', 'approved', true),
  ('fd200000-0000-0000-0000-0000000000b4', 'fd200000-0000-0000-0000-0000000000e4', 'fd200000-0000-0000-0000-000000000010', 'fd200000-0000-0000-0000-000000000002', '2099-12-13T10:00:00+08:00', '2099-12-13T12:00:00+08:00', 'approved', true);

set local role authenticated;

-- Submit every event for its safety check first (as the coordinator).
select set_config('request.jwt.claims', '{"sub":"fd200000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.submit_event_for_safety_check('fd200000-0000-0000-0000-0000000000e1');
select public.submit_event_for_safety_check('fd200000-0000-0000-0000-0000000000e2');
select public.submit_event_for_safety_check('fd200000-0000-0000-0000-0000000000e3');
select public.submit_event_for_safety_check('fd200000-0000-0000-0000-0000000000e4');
-- E5 is never submitted — stays Planning, the "wrong status" case.

create temporary table aesc_result (label text primary key, body jsonb);
grant all on aesc_result to authenticated;

-- AC: only a Safety Officer can decide.
select set_config('request.jwt.claims', '{"sub":"fd200000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e1'::uuid, 'approved'::public.event_safety_check_decision_type, null)$$,
  '42501', 'Only a Safety Officer can decide an event''s safety check',
  'a coordinator cannot approve a safety check'
);

select set_config('request.jwt.claims', '{"sub":"fd200000-0000-0000-0000-000000000003","role":"authenticated"}', true);

-- Only a Pending Safety Check event can be decided.
select throws_ok(
  $$select public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e5'::uuid, 'approved'::public.event_safety_check_decision_type, null)$$,
  '23514', 'Only an event Pending Safety Check can be decided',
  'an event still in Planning cannot be approved'
);

-- Approve with no reason at all: lives, event is Confirmed.
select lives_ok(
  $$insert into aesc_result select 'e1', public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e1'::uuid, 'approved'::public.event_safety_check_decision_type, null)$$,
  'Approve with no reason succeeds — reason is optional'
);
select is((select body ->> 'status' from aesc_result where label = 'e1'), 'confirmed', 'the function reports the new Confirmed status');
select is((select body ->> 'outcome' from aesc_result where label = 'e1'), 'approved', 'the function reports the approved outcome');
select is((select (body ->> 'flaggedBookingCount')::int from aesc_result where label = 'e1'), 0, 'nothing is flagged on Approve');

-- A Safety Officer's RLS access to an event is scoped to while it's Pending
-- Safety Check; now Confirmed, these checks read back as the table owner,
-- same as every other pgTAP file's post-RPC verification.
reset role;
select is((select status::text from public.events where id = 'fd200000-0000-0000-0000-0000000000e1'), 'confirmed', 'AC: the event becomes Confirmed');
select is(
  (select needs_review from public.venue_bookings where id = 'fd200000-0000-0000-0000-0000000000b1'),
  false,
  'the venue booking is not flagged by an Approve decision'
);
select is(
  (select row(outcome, reason) from public.event_safety_check_decisions where event_id = 'fd200000-0000-0000-0000-0000000000e1'),
  row('approved'::public.event_safety_check_decision_type, null::text),
  'the decision is recorded with a null reason'
);
select is(
  (select changed_by from public.event_status_history where event_id = 'fd200000-0000-0000-0000-0000000000e1' and to_status = 'confirmed'),
  'fd200000-0000-0000-0000-000000000003',
  'the status-history row for the Confirmed transition records the reviewer'
);

-- Notifications: both the coordinator and the organiser, with Approve's
-- own copy — not the "rejected" fallback the old `case` would have shown.
select is(
  (select count(*)::int from public.notifications
    where event_id = 'fd200000-0000-0000-0000-0000000000e1'
      and type = 'safety_check_decision' and title = 'Safety check: approved'),
  2,
  'both the coordinator and organiser get the approved-specific title, not a fallback'
);
select is(
  (select recipient_id from public.notifications
    where event_id = 'fd200000-0000-0000-0000-0000000000e1' and recipient_id = 'fd200000-0000-0000-0000-000000000001'),
  'fd200000-0000-0000-0000-000000000001',
  'the organiser is notified on Approve'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fd200000-0000-0000-0000-000000000003","role":"authenticated"}', true);

-- Approve with a reason: it is kept, not discarded for being optional.
select lives_ok(
  $$insert into aesc_result select 'e2', public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e2'::uuid, 'approved'::public.event_safety_check_decision_type, '  Looks great.  ')$$,
  'Approve with a reason also succeeds'
);
select is(
  (select reason from public.event_safety_check_decisions where event_id = 'fd200000-0000-0000-0000-0000000000e2'),
  'Looks great.',
  'a given reason is trimmed and kept, not discarded for being optional'
);

-- Regression: Reject still requires a reason and still flags everything.
select throws_ok(
  $$select public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e3'::uuid, 'rejected'::public.event_safety_check_decision_type, null)$$,
  '23514', 'Explain the reason for this decision',
  'Reject still requires a reason after the if/elsif/else restructure'
);
select lives_ok(
  $$select public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e3'::uuid, 'rejected'::public.event_safety_check_decision_type, 'Not safe.')$$,
  'Reject with a reason still works'
);

reset role;
select is(
  (select status::text from public.events where id = 'fd200000-0000-0000-0000-0000000000e3'),
  'planning',
  'Reject still returns the event to Planning, not Confirmed'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fd200000-0000-0000-0000-000000000003","role":"authenticated"}', true);

-- Regression: Request Changes still requires at least one flagged item.
select throws_ok(
  $$select public.decide_event_safety_check('fd200000-0000-0000-0000-0000000000e4'::uuid, 'changes_requested'::public.event_safety_check_decision_type, 'Reposition it.')$$,
  '23514', 'Select at least one venue booking or equipment arrangement to flag',
  'Request Changes still requires at least one flagged item'
);

select * from finish();
rollback;
