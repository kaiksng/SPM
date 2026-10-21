begin;

select plan(24);

-- SPM-38: Submit an Event Change Request
-- (202610200013_submit_event_change_request.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('fc000000-0000-0000-0000-000000000001', 'chg-organiser@example.test', '{"full_name":"CHG Organiser","role":"event_organiser"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000002', 'chg-other-organiser@example.test', '{"full_name":"CHG Other Organiser","role":"event_organiser"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000003', 'chg-coordinator@example.test', '{"full_name":"CHG Coordinator","role":"event_coordinator"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000004', 'chg-other-coordinator@example.test', '{"full_name":"CHG Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000005', 'chg-lead-a@example.test', '{"full_name":"CHG Lead A","role":"event_coordinator_lead"}'::jsonb),
  ('fc000000-0000-0000-0000-000000000006', 'chg-lead-b@example.test', '{"full_name":"CHG Lead B","role":"event_coordinator_lead"}'::jsonb);

insert into public.venues (id, name, location, capacity) values
  ('fc000000-0000-0000-0000-000000000010', 'CHG Hall', 'Block 1', 200);

-- E1: Planning, assigned.  E2: Requested, unassigned.  E3: Draft (out of scope).
-- E4: Confirmed, assigned.  E5: Pending Safety Check, assigned.
-- E6: Planning, assigned (reserved for the withdrawal flow, kept separate from E1/E4).
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('fc000000-0000-0000-0000-0000000000e1', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Planning Event', 'planning', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e2', 'fc000000-0000-0000-0000-000000000001', null, 'CHG Unassigned Requested Event', 'requested', '2099-11-02T10:00:00+08:00', '2099-11-02T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e3', 'fc000000-0000-0000-0000-000000000001', null, 'CHG Draft Event', 'draft', '2099-11-03T10:00:00+08:00', '2099-11-03T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Confirmed Event', 'confirmed', '2099-11-04T10:00:00+08:00', '2099-11-04T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Pending Safety Check Event', 'pending_safety_check', '2099-11-05T10:00:00+08:00', '2099-11-05T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Withdrawal Event', 'planning', '2099-11-06T10:00:00+08:00', '2099-11-06T12:00:00+08:00');

create temporary table chg_result (label text primary key, body jsonb);
grant all on chg_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC01: a Planning event can be submitted.
select lives_ok(
  $$insert into chg_result select 'e1', public.submit_event_change_request(
    'fc000000-0000-0000-0000-0000000000e1', '{"startsAt":"later"}'::jsonb, 'Speaker rescheduled')$$,
  'AC01: a change request can be submitted for a Planning event'
);
select is((select body ->> 'status' from chg_result where label = 'e1'), 'pending', 'the new request is recorded as Pending Review');

-- AC03: a reason is required.
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e1', '{"startsAt":"later"}'::jsonb, '   ')$$,
  '23514', 'Explain the reason for this change request',
  'AC03: an empty reason is rejected'
);

-- AC03: the requested change itself is required.
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e1', '{}'::jsonb, 'A reason')$$,
  '23514', 'Describe the change you are requesting',
  'AC03: an empty requested-changes payload is rejected'
);

-- Only the event's organiser may submit.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e1', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  '42501', 'Only the event organiser can submit a change request',
  'a different organiser cannot submit a change request for this event'
);

select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC01: Draft is out of scope.
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e3', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  '23514', 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event',
  'AC01: a Draft event cannot receive a change request'
);

-- AC01: Confirmed and Pending Safety Check are both in scope.
select lives_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e4', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  'AC01: a change request can be submitted for a Confirmed event'
);
select lives_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e5', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  'AC01: a change request can be submitted for a Pending Safety Check event'
);

-- AC05 (GWT): an assigned coordinator is notified. (Querying notifications
-- as the submitting organiser would see nothing — "users read their
-- notifications" RLS is recipient_id = auth.uid() — so check as superuser.)
reset role;
select is(
  (select count(*)::int from public.notifications
   where event_id = 'fc000000-0000-0000-0000-0000000000e1'
     and recipient_id = 'fc000000-0000-0000-0000-000000000003'
     and type = 'event_change'),
  1,
  'AC05: the assigned coordinator is notified when the request is submitted'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- AC08: a second request while one is already pending is blocked.
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e1', '{"endsAt":"later"}'::jsonb, 'Another reason')$$,
  '23514', 'This event already has a change request pending review',
  'a second pending request for the same event is blocked'
);

-- AC06 (GWT): an unassigned Requested event notifies every Lead instead.
select lives_ok(
  $$insert into chg_result select 'e2', public.submit_event_change_request(
    'fc000000-0000-0000-0000-0000000000e2', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  'AC06: a change request can be submitted for an unassigned Requested event'
);
reset role;
select is(
  (select count(*)::int from public.notifications
   where event_id = 'fc000000-0000-0000-0000-0000000000e2'
     and type = 'event_change'
     and recipient_id in ('fc000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000006')),
  2,
  'AC06: every Coordinator Lead is notified when the event has no assigned coordinator'
);
set local role authenticated;

-- Decisions: only the assigned coordinator may decide an assigned event's request.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e1'), 'approved')$$,
  '42501', 'Only the assigned coordinator can decide this change request',
  'a coordinator not assigned to the event cannot decide its change request'
);

-- Rejection requires a reason.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e1'), 'rejected', '   ')$$,
  '23514', 'Explain the reason for rejecting this change request',
  'a rejection without a reason is rejected'
);

select lives_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e1'), 'approved')$$,
  'the assigned coordinator can approve the request'
);
select is(
  (select status from public.event_change_requests where id = (select (body ->> 'id')::uuid from chg_result where label = 'e1')),
  'approved',
  'the request is recorded as approved'
);
reset role;
select is(
  (select count(*)::int from public.notifications
   where event_id = 'fc000000-0000-0000-0000-0000000000e1'
     and recipient_id = 'fc000000-0000-0000-0000-000000000001'
     and type = 'event_change'),
  1,
  'the organiser is notified of the decision'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

-- A decided request cannot be decided again.
select throws_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e1'), 'approved')$$,
  '23514', 'Only a change request Pending Review can be decided',
  'a decided request cannot be decided again'
);

-- Lead fallback: an ordinary coordinator cannot decide an unassigned event's request.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e2'), 'approved')$$,
  '42501', 'Only the Coordinator Lead can decide this change request while the event has no assigned coordinator',
  'a non-Lead coordinator cannot decide an unassigned event''s change request'
);

select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok(
  $$select public.decide_event_change_request(
    (select (body ->> 'id')::uuid from chg_result where label = 'e2'), 'rejected', 'Not needed yet')$$,
  'AC06: a Coordinator Lead can decide the request while the event has no assigned coordinator'
);

-- Withdrawal.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into chg_result select 'e6', public.submit_event_change_request(
    'fc000000-0000-0000-0000-0000000000e6', '{"description":"updated"}'::jsonb, 'A reason')$$,
  'a fresh request can be submitted for later withdrawal'
);

select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.withdraw_event_change_request((select (body ->> 'id')::uuid from chg_result where label = 'e6'))$$,
  '42501', 'Only the organiser who submitted this request can withdraw it',
  'AC08: a different organiser cannot withdraw this request'
);

select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.withdraw_event_change_request((select (body ->> 'id')::uuid from chg_result where label = 'e6'))$$,
  'AC08: the organiser can withdraw their own Pending Review request'
);
select is(
  (select status from public.event_change_requests where id = (select (body ->> 'id')::uuid from chg_result where label = 'e6')),
  'withdrawn',
  'the withdrawn request is recorded as withdrawn'
);

select * from finish();
rollback;
