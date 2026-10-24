begin;

select plan(34);

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
-- E7: Requested, assigned.  E8/E9/EA: Rejected, Cancelled, Completed (out of scope).
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at)
values
  ('fc000000-0000-0000-0000-0000000000e1', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Planning Event', 'planning', '2099-11-01T10:00:00+08:00', '2099-11-01T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e2', 'fc000000-0000-0000-0000-000000000001', null, 'CHG Unassigned Requested Event', 'requested', '2099-11-02T10:00:00+08:00', '2099-11-02T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e3', 'fc000000-0000-0000-0000-000000000001', null, 'CHG Draft Event', 'draft', '2099-11-03T10:00:00+08:00', '2099-11-03T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Confirmed Event', 'confirmed', '2099-11-04T10:00:00+08:00', '2099-11-04T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Pending Safety Check Event', 'pending_safety_check', '2099-11-05T10:00:00+08:00', '2099-11-05T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Withdrawal Event', 'planning', '2099-11-06T10:00:00+08:00', '2099-11-06T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e7', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Assigned Requested Event', 'requested', '2099-11-07T10:00:00+08:00', '2099-11-07T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e8', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Rejected Event', 'rejected', '2099-11-08T10:00:00+08:00', '2099-11-08T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000e9', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Cancelled Event', 'cancelled', '2099-11-09T10:00:00+08:00', '2099-11-09T12:00:00+08:00'),
  ('fc000000-0000-0000-0000-0000000000ea', 'fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'CHG Completed Event', 'completed', '2099-11-10T10:00:00+08:00', '2099-11-10T12:00:00+08:00');

-- AC04: the Confirmed event's agreed venue booking.
insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue) values
  ('fc000000-0000-0000-0000-0000000000b4', 'fc000000-0000-0000-0000-0000000000e4', 'fc000000-0000-0000-0000-000000000010', 'fc000000-0000-0000-0000-000000000003', '2099-11-04T10:00:00+08:00', '2099-11-04T12:00:00+08:00', 'approved', true);

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

-- AC01: Rejected, Cancelled and Completed are out of scope too.
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e8', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  '23514', 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event',
  'AC01: a Rejected event cannot receive a change request'
);
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e9', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  '23514', 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event',
  'AC01: a Cancelled event cannot receive a change request'
);
select throws_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000ea', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  '23514', 'A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event',
  'AC01: a Completed event cannot receive a change request'
);

-- AC01: Requested (assigned), Confirmed and Pending Safety Check are all in scope.
select lives_ok(
  $$select public.submit_event_change_request('fc000000-0000-0000-0000-0000000000e7', '{"startsAt":"later"}'::jsonb, 'A reason')$$,
  'AC01: a change request can be submitted for an assigned Requested event'
);
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
-- AC05: an assigned Requested event notifies its coordinator, not the Leads.
select is(
  (select count(*)::int from public.notifications
   where event_id = 'fc000000-0000-0000-0000-0000000000e7'
     and recipient_id = 'fc000000-0000-0000-0000-000000000003'
     and type = 'event_change'),
  1,
  'AC05: an assigned Requested event notifies its assigned coordinator'
);
select is(
  (select count(*)::int from public.notifications
   where event_id = 'fc000000-0000-0000-0000-0000000000e7'
     and type = 'event_change'
     and recipient_id in ('fc000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000006')),
  0,
  'AC05: the Coordinator Leads are not notified when a coordinator is assigned'
);

-- AC04: the agreed arrangements stay active while the request is Pending Review.
select results_eq(
  $$select e.status::text, e.starts_at, e.ends_at, vb.status::text
    from public.events e
    join public.venue_bookings vb on vb.event_id = e.id
    where e.id = 'fc000000-0000-0000-0000-0000000000e4'$$,
  $$values ('confirmed'::text, '2099-11-04T10:00:00+08:00'::timestamptz, '2099-11-04T12:00:00+08:00'::timestamptz, 'approved'::text)$$,
  'AC04: a pending request leaves the Confirmed event, its times and its venue booking unchanged'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Not an SPM-38 criterion: only one request may be pending at a time.
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

-- AC02: before the request is decided, the coordinator can still make
-- ordinary permitted edits directly (SPM-10). Every locked field matches E1.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_event_as_coordinator('fc000000-0000-0000-0000-0000000000e1', '{
    "title":"CHG Planning Event",
    "startsAt":"2099-11-01T10:00:00+08:00","endsAt":"2099-11-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Central Area","accessibilityNotes":"Ramp access","facilities":[]},
    "equipment":[]
  }'::jsonb)$$,
  'AC02: a pending change request does not block a direct SPM-10 edit'
);

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
    (select (body ->> 'id')::uuid from chg_result where label = 'e1'), 'approved', 'Moving the start time')$$,
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

-- AC07: the organiser can see the request's status and the outcome.
select set_config('request.jwt.claims', '{"sub":"fc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select status, review_notes from public.event_change_requests
    where id = (select (body ->> 'id')::uuid from chg_result where label = 'e1')$$,
  $$values ('approved'::text, 'Moving the start time'::text)$$,
  'AC07: the organiser sees the request''s status and outcome'
);

-- AC08: once decided, a request can no longer be withdrawn.
select throws_ok(
  $$select public.withdraw_event_change_request((select (body ->> 'id')::uuid from chg_result where label = 'e1'))$$,
  '23514', 'Only a change request Pending Review can be withdrawn',
  'AC08: a decided request cannot be withdrawn'
);
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
