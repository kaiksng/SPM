begin;

select plan(45);

-- SPM-39: Review and implement an event change request
-- (202610230001_spm39_change_request_implemented.sql,
--  202610230005_spm39_apply_event_change_request.sql).

insert into auth.users (id, email, raw_user_meta_data) values
  ('39000000-0000-0000-0000-000000000001', 'spm39-organiser@example.test', '{"full_name":"SPM39 Organiser","role":"event_organiser"}'::jsonb),
  ('39000000-0000-0000-0000-000000000002', 'spm39-coordinator@example.test', '{"full_name":"SPM39 Coordinator","role":"event_coordinator"}'::jsonb),
  ('39000000-0000-0000-0000-000000000003', 'spm39-other-coordinator@example.test', '{"full_name":"SPM39 Other Coordinator","role":"event_coordinator"}'::jsonb),
  ('39000000-0000-0000-0000-000000000004', 'spm39-lead@example.test', '{"full_name":"SPM39 Lead","role":"event_coordinator_lead"}'::jsonb),
  ('39000000-0000-0000-0000-000000000005', 'spm39-venue-staff@example.test', '{"full_name":"SPM39 Venue Staff","role":"venue_staff"}'::jsonb),
  ('39000000-0000-0000-0000-000000000006', 'spm39-tech@example.test', '{"full_name":"SPM39 Tech","role":"technical_support_staff"}'::jsonb),
  ('39000000-0000-0000-0000-000000000007', 'spm39-safety@example.test', '{"full_name":"SPM39 Safety","role":"safety_officer"}'::jsonb),
  ('39000000-0000-0000-0000-000000000008', 'spm39-other-organiser@example.test', '{"full_name":"SPM39 Other Organiser","role":"event_organiser"}'::jsonb);

-- 30 minutes of setup and turnaround, so the effective-window clash below
-- only exists because of them (AC08).
insert into public.venues (id, name, location, area_tags, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes) values
  ('39000000-0000-0000-0000-000000000010', 'SPM39 Hall', 'Block 39', array['Central Area'], 200,
   '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb, 30, 30);

insert into public.equipment_items (id, name, category, code, total_quantity)
values ('39000000-0000-0000-0000-0000000000a1', 'SPM39 Projector', 'Visual', 'spm39-projector', 5);

-- e1: Planning, time change.  ex: another event at the same venue.
-- e3: Confirmed, registration-only change.  e4: Confirmed, attendance change.
-- e5: Pending Safety Check, equipment change.  e6: Requested, unassigned.
-- e7: Planning, registration-only change.
insert into public.events (id, organiser_id, assigned_coordinator_id, title, status, starts_at, ends_at, expected_attendance) values
  ('39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000002', 'SPM39 Planning Event', 'planning', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 50),
  ('39000000-0000-0000-0000-0000000000ee', '39000000-0000-0000-0000-000000000008', '39000000-0000-0000-0000-000000000003', 'SPM39 Neighbour Event', 'planning', '2099-12-01T16:15:00+08:00', '2099-12-01T17:00:00+08:00', 20),
  ('39000000-0000-0000-0000-0000000000e3', '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000002', 'SPM39 Registration Event', 'confirmed', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 50),
  ('39000000-0000-0000-0000-0000000000e4', '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000002', 'SPM39 Attendance Event', 'confirmed', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 50),
  ('39000000-0000-0000-0000-0000000000e5', '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000002', 'SPM39 Equipment Event', 'pending_safety_check', '2099-12-05T10:00:00+08:00', '2099-12-05T12:00:00+08:00', 50),
  ('39000000-0000-0000-0000-0000000000e6', '39000000-0000-0000-0000-000000000001', null, 'SPM39 Unassigned Event', 'requested', '2099-12-06T10:00:00+08:00', '2099-12-06T12:00:00+08:00', 50),
  ('39000000-0000-0000-0000-0000000000e7', '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000002', 'SPM39 Planning Registration Event', 'planning', '2099-12-07T10:00:00+08:00', '2099-12-07T12:00:00+08:00', 50);

insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status, is_main_venue) values
  ('39000000-0000-0000-0000-0000000000b1', '39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000002', '2099-12-01T10:00:00+08:00', '2099-12-01T12:00:00+08:00', 'approved', true),
  ('39000000-0000-0000-0000-0000000000bb', '39000000-0000-0000-0000-0000000000ee', '39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000003', '2099-12-01T16:15:00+08:00', '2099-12-01T17:00:00+08:00', 'approved', true),
  ('39000000-0000-0000-0000-0000000000b3', '39000000-0000-0000-0000-0000000000e3', '39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000002', '2099-12-03T10:00:00+08:00', '2099-12-03T12:00:00+08:00', 'approved', true),
  ('39000000-0000-0000-0000-0000000000b4', '39000000-0000-0000-0000-0000000000e4', '39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000002', '2099-12-04T10:00:00+08:00', '2099-12-04T12:00:00+08:00', 'approved', true),
  ('39000000-0000-0000-0000-0000000000b7', '39000000-0000-0000-0000-0000000000e7', '39000000-0000-0000-0000-000000000010', '39000000-0000-0000-0000-000000000002', '2099-12-07T10:00:00+08:00', '2099-12-07T12:00:00+08:00', 'approved', true);

insert into public.event_equipment_requirements (id, event_id, equipment_item_id, equipment_name, quantity, required_from, required_until) values
  ('39000000-0000-0000-0000-0000000000c1', '39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-0000000000a1', 'x', 1, '2099-12-01T09:00:00+08:00', '2099-12-01T13:00:00+08:00'),
  ('39000000-0000-0000-0000-0000000000c2', '39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-0000000000a1', 'x', 1, '2099-12-01T09:00:00+08:00', '2099-12-01T13:00:00+08:00'),
  ('39000000-0000-0000-0000-0000000000c4', '39000000-0000-0000-0000-0000000000e4', '39000000-0000-0000-0000-0000000000a1', 'x', 1, '2099-12-04T09:00:00+08:00', '2099-12-04T13:00:00+08:00'),
  ('39000000-0000-0000-0000-0000000000c5', '39000000-0000-0000-0000-0000000000e5', '39000000-0000-0000-0000-0000000000a1', 'x', 1, '2099-12-05T09:00:00+08:00', '2099-12-05T13:00:00+08:00'),
  ('39000000-0000-0000-0000-0000000000c6', '39000000-0000-0000-0000-0000000000e5', '39000000-0000-0000-0000-0000000000a1', 'x', 1, '2099-12-05T09:00:00+08:00', '2099-12-05T13:00:00+08:00');

insert into public.equipment_reservations (id, event_id, equipment_item_id, quantity, requested_by, starts_at, ends_at, status, requirement_id) values
  ('39000000-0000-0000-0000-0000000000d1', '39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-0000000000a1', 1, '39000000-0000-0000-0000-000000000006', '2099-12-01T09:00:00+08:00', '2099-12-01T13:00:00+08:00', 'approved', '39000000-0000-0000-0000-0000000000c1');

insert into public.event_change_requests (id, event_id, requested_by, requested_changes, reason, status) values
  ('39000000-0000-0000-0000-0000000000f1', '39000000-0000-0000-0000-0000000000e1', '39000000-0000-0000-0000-000000000001', '{"description":"Move to the afternoon"}', 'Speaker moved', 'pending'),
  ('39000000-0000-0000-0000-0000000000f3', '39000000-0000-0000-0000-0000000000e3', '39000000-0000-0000-0000-000000000001', '{"description":"Open registration"}', 'More interest', 'approved'),
  ('39000000-0000-0000-0000-0000000000f4', '39000000-0000-0000-0000-0000000000e4', '39000000-0000-0000-0000-000000000001', '{"description":"80 people"}', 'More interest', 'approved'),
  ('39000000-0000-0000-0000-0000000000f5', '39000000-0000-0000-0000-0000000000e5', '39000000-0000-0000-0000-000000000001', '{"description":"Two projectors"}', 'Second screen', 'approved'),
  ('39000000-0000-0000-0000-0000000000f6', '39000000-0000-0000-0000-0000000000e6', '39000000-0000-0000-0000-000000000001', '{"description":"Change the title"}', 'Rebrand', 'pending'),
  ('39000000-0000-0000-0000-0000000000f7', '39000000-0000-0000-0000-0000000000e7', '39000000-0000-0000-0000-000000000001', '{"description":"Open registration"}', 'More interest', 'approved');

-- The full form payload for e1 after the change: afternoon slot, everything else as before.
create temporary table spm39_payload (label text primary key, body jsonb);
grant all on spm39_payload to authenticated;
insert into spm39_payload values
  ('e1', '{
    "title":"SPM39 Planning Event","startsAt":"2099-12-01T14:00:00+08:00","endsAt":"2099-12-01T16:00:00+08:00",
    "expectedAttendance":"50",
    "equipment":[
      {"id":"39000000-0000-0000-0000-0000000000c1","equipmentItemId":"39000000-0000-0000-0000-0000000000a1","quantity":"1","requiredFrom":"2099-12-01T09:00:00+08:00","requiredUntil":"2099-12-01T13:00:00+08:00"},
      {"id":"39000000-0000-0000-0000-0000000000c2","equipmentItemId":"39000000-0000-0000-0000-0000000000a1","quantity":"1","requiredFrom":"2099-12-01T09:00:00+08:00","requiredUntil":"2099-12-01T13:00:00+08:00"}
    ]}'),
  ('e3', '{
    "title":"SPM39 Registration Event","startsAt":"2099-12-03T10:00:00+08:00","endsAt":"2099-12-03T12:00:00+08:00",
    "expectedAttendance":"50","equipment":[],
    "registration":{"required":true,"opensAt":"2099-11-01T10:00:00+08:00","closesAt":"2099-12-02T10:00:00+08:00","capacity":"50"}}'),
  ('e3-no-registration', '{
    "title":"SPM39 Registration Event (renamed)","startsAt":"2099-12-03T10:00:00+08:00","endsAt":"2099-12-03T12:00:00+08:00",
    "expectedAttendance":"50","equipment":[]}'),
  ('e7', '{
    "title":"SPM39 Planning Registration Event","startsAt":"2099-12-07T10:00:00+08:00","endsAt":"2099-12-07T12:00:00+08:00",
    "expectedAttendance":"50","equipment":[],
    "registration":{"required":true,"opensAt":"2099-11-01T10:00:00+08:00","closesAt":"2099-12-06T10:00:00+08:00","capacity":"50"}}'),
  ('e4', '{
    "title":"SPM39 Attendance Event","startsAt":"2099-12-04T10:00:00+08:00","endsAt":"2099-12-04T12:00:00+08:00",
    "expectedAttendance":"80",
    "equipment":[
      {"id":"39000000-0000-0000-0000-0000000000c4","equipmentItemId":"39000000-0000-0000-0000-0000000000a1","quantity":"1","requiredFrom":"2099-12-04T09:00:00+08:00","requiredUntil":"2099-12-04T13:00:00+08:00"}
    ]}'),
  ('e5', '{
    "title":"SPM39 Equipment Event","startsAt":"2099-12-05T10:00:00+08:00","endsAt":"2099-12-05T12:00:00+08:00",
    "expectedAttendance":"50",
    "equipment":[
      {"id":"39000000-0000-0000-0000-0000000000c5","equipmentItemId":"39000000-0000-0000-0000-0000000000a1","quantity":"2","requiredFrom":"2099-12-05T09:00:00+08:00","requiredUntil":"2099-12-05T13:00:00+08:00"},
      {"id":"39000000-0000-0000-0000-0000000000c6","equipmentItemId":"39000000-0000-0000-0000-0000000000a1","quantity":"1","requiredFrom":"2099-12-05T09:00:00+08:00","requiredUntil":"2099-12-05T13:00:00+08:00"}
    ]}'),
  ('e6', '{"title":"SPM39 Renamed Event","startsAt":"2099-12-06T10:00:00+08:00","endsAt":"2099-12-06T12:00:00+08:00","expectedAttendance":"50","equipment":[]}');

set local role authenticated;

-- AC04: a Lead cannot decide an assigned event's request.
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_event_change_request('39000000-0000-0000-0000-0000000000f1', 'approved', 'Fine')$$,
  '42501', 'Only the assigned coordinator can decide this change request',
  'AC04: a Coordinator Lead cannot decide a request on an assigned event'
);

-- AC07: only an Approved request can be applied.
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f1', (select body from spm39_payload where label = 'e1'))$$,
  '23514', 'Only an Approved change request can be applied',
  'AC07: a Pending Review request cannot be applied'
);

-- AC05: approval needs implementation notes.
select throws_ok(
  $$select public.decide_event_change_request('39000000-0000-0000-0000-0000000000f1', 'approved', '   ')$$,
  '23514', 'Add implementation notes before approving this change request',
  'AC05: an approval without implementation notes is refused'
);

select lives_ok(
  $$select public.decide_event_change_request('39000000-0000-0000-0000-0000000000f1', 'approved', 'Moving to the afternoon slot')$$,
  'AC05: the assigned coordinator approves with implementation notes'
);

reset role;
select results_eq(
  $$select status, reviewed_by, review_notes, reviewed_at is not null
    from public.event_change_requests where id = '39000000-0000-0000-0000-0000000000f1'$$,
  $$values ('approved'::text, '39000000-0000-0000-0000-000000000002'::uuid, 'Moving to the afternoon slot'::text, true)$$,
  'AC05: the decision, reviewer, time and notes are recorded'
);
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '39000000-0000-0000-0000-000000000001' and event_id = '39000000-0000-0000-0000-0000000000e1'
     and title = 'Change request approved'),
  1,
  'AC05: the organiser is notified of the approval'
);
set local role authenticated;

-- AC07: only the assigned coordinator applies.
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f1', (select body from spm39_payload where label = 'e1'))$$,
  '42501', 'Only the assigned coordinator can apply this change request',
  'AC07: a coordinator not assigned to the event cannot apply its change'
);

select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f1', (select body from spm39_payload where label = 'e1'))$$,
  'AC07: the assigned coordinator applies an approved change, even to a Planning-locked time'
);

reset role;
select results_eq(
  $$select status, implemented_by, implemented_at is not null
    from public.event_change_requests where id = '39000000-0000-0000-0000-0000000000f1'$$,
  $$values ('implemented'::text, '39000000-0000-0000-0000-000000000002'::uuid, true)$$,
  'AC07: the request becomes Implemented, with who applied it and when'
);
select is(
  (select starts_at from public.events where id = '39000000-0000-0000-0000-0000000000e1'),
  '2099-12-01T14:00:00+08:00'::timestamptz,
  'AC07: the new start time is saved'
);
select is(
  (select changed_by from public.event_field_changes
   where event_id = '39000000-0000-0000-0000-0000000000e1' and field_name = 'startsAt'),
  '39000000-0000-0000-0000-000000000002'::uuid,
  'AC07: the change history names the coordinator who applied it'
);

-- AC01/AC08: the booking is flagged, with the effective-window conflict named.
select ok(
  (select needs_review from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b1'),
  'AC01: a time change flags the venue booking Needs Review'
);
select matches(
  (select needs_review_reason from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b1'),
  '^Conflict – This venue is already occupied',
  'AC08: the new window clashes with the neighbouring booking once setup and turnaround are included'
);
select matches(
  (select needs_review_reason from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b1'),
  'no longer falls within the event''s new time',
  'AC08: the reason says the booking''s own period no longer covers the event'
);

-- AC11: nothing is silently replaced.
select results_eq(
  $$select status::text, starts_at, ends_at from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b1'$$,
  $$values ('approved'::text, '2099-12-01T10:00:00+08:00'::timestamptz, '2099-12-01T12:00:00+08:00'::timestamptz)$$,
  'AC11: the venue booking keeps its status and its own period'
);
select ok(
  not (select needs_review from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000bb'),
  'AC02: another event''s booking is not flagged'
);

select is(
  (select count(*)::int from public.event_equipment_requirements
   where event_id = '39000000-0000-0000-0000-0000000000e1' and needs_review),
  2,
  'AC01: a time change flags every equipment requirement'
);
select results_eq(
  $$select status::text, needs_recheck from public.equipment_reservations where id = '39000000-0000-0000-0000-0000000000d1'$$,
  $$values ('approved'::text, true)$$,
  'AC11: the equipment reservation stays approved and is only marked for recheck'
);

-- AC02: staff are notified.
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '39000000-0000-0000-0000-000000000005' and booking_id = '39000000-0000-0000-0000-0000000000b1'
     and type = 'venue_change_review'),
  1,
  'AC02: Venue Staff are notified about the flagged booking'
);
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '39000000-0000-0000-0000-000000000006' and event_id = '39000000-0000-0000-0000-0000000000e1'
     and type = 'equipment_change_review'),
  1,
  'AC02: Technical Support Staff are notified about the flagged equipment'
);
select is(
  (select status::text from public.events where id = '39000000-0000-0000-0000-0000000000e1'),
  'planning',
  'AC10: a Planning event stays Planning'
);

-- AC09: Needs Review blocks readiness.
set local role authenticated;
select results_eq(
  $$select (r ->> 'ready')::boolean, r ->> 'venueArrangementStatus', r ->> 'equipmentArrangementStatus'
    from (select public.event_readiness('39000000-0000-0000-0000-0000000000e1') as r) x$$,
  $$values (false, 'needs_review'::text, 'needs_review'::text)$$,
  'AC09: the event is not Ready to Confirm while arrangements are Needs Review'
);

select throws_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f1', (select body from spm39_payload where label = 'e1'))$$,
  '23514', 'Only an Approved change request can be applied',
  'AC07: an Implemented request cannot be applied again'
);

-- AC01 / SPM-40 AC07: registration settings can't be changed on a Confirmed
-- event, even through an approved change request (202610300005).
select throws_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f3', (select body from spm39_payload where label = 'e3'))$$,
  '23514', 'Registration settings can''t be changed once the event has been submitted for its safety check',
  'AC01: a registration change on a Confirmed event is refused'
);
reset role;
select results_eq(
  $$select e.status::text, r.status
    from public.events e join public.event_change_requests r on r.event_id = e.id
    where r.id = '39000000-0000-0000-0000-0000000000f3'$$,
  $$values ('confirmed'::text, 'approved'::text)$$,
  'AC01: the refused change leaves the event Confirmed and the request still Approved'
);
select is(
  (select count(*)::int from public.event_registration_requirements where event_id = '39000000-0000-0000-0000-0000000000e3'),
  0,
  'AC01: no registration settings are saved'
);

-- The same request without the registration change still applies, and the
-- event stays Confirmed (AC10: the title is not safety-relevant).
set local role authenticated;
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f3', (select body from spm39_payload where label = 'e3-no-registration'))$$,
  'AC07: a Confirmed event can still apply a change that leaves registration alone'
);
reset role;
select ok(
  (select status::text from public.events where id = '39000000-0000-0000-0000-0000000000e3') = 'confirmed'
    and not (select needs_review from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b3'),
  'AC10/AC01: the event stays Confirmed and no booking is flagged'
);

-- AC01: on a Planning event a registration-only change is saved and flags nothing.
set local role authenticated;
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f7', (select body from spm39_payload where label = 'e7'))$$,
  'AC01: a registration change can be applied to a Planning event'
);
reset role;
select ok(
  not (select needs_review from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b7'),
  'AC01: a registration change flags no venue booking'
);
select is(
  (select attendee_capacity from public.event_registration_requirements where event_id = '39000000-0000-0000-0000-0000000000e7'),
  50,
  'AC07: the registration change is saved'
);

-- AC10/AC01: attendance change on a Confirmed event.
set local role authenticated;
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f4', (select body from spm39_payload where label = 'e4'))$$,
  'an attendance change can be applied to a Confirmed event'
);
reset role;
select is(
  (select status::text from public.events where id = '39000000-0000-0000-0000-0000000000e4'),
  'planning',
  'AC10: an attendance change returns a Confirmed event to Planning'
);
select is(
  (select changed_by from public.event_status_history
   where event_id = '39000000-0000-0000-0000-0000000000e4' and to_status = 'planning'),
  '39000000-0000-0000-0000-000000000002'::uuid,
  'AC10: the return to Planning is recorded against the coordinator'
);
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '39000000-0000-0000-0000-000000000007' and event_id = '39000000-0000-0000-0000-0000000000e4'
     and type = 'safety_review_reset'),
  1,
  'AC02: Safety Officers are notified that a new safety review is needed'
);
select matches(
  (select needs_review_reason from public.venue_bookings where id = '39000000-0000-0000-0000-0000000000b4'),
  'expected attendance',
  'AC01: an attendance change flags the venue booking'
);
select ok(
  not (select needs_review from public.event_equipment_requirements where id = '39000000-0000-0000-0000-0000000000c4'),
  'AC01: an attendance change does not flag equipment'
);

-- AC10/AC01: equipment change on a Pending Safety Check event.
set local role authenticated;
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f5', (select body from spm39_payload where label = 'e5'))$$,
  'an equipment change can be applied to a Pending Safety Check event'
);
reset role;
select is(
  (select status::text from public.events where id = '39000000-0000-0000-0000-0000000000e5'),
  'planning',
  'AC10: an equipment change returns a Pending Safety Check event to Planning'
);
select results_eq(
  $$select id, needs_review from public.event_equipment_requirements
    where event_id = '39000000-0000-0000-0000-0000000000e5' order by id$$,
  $$values ('39000000-0000-0000-0000-0000000000c5'::uuid, true), ('39000000-0000-0000-0000-0000000000c6'::uuid, false)$$,
  'AC01: only the changed equipment requirement is flagged'
);

-- AC03: unassigned event — the Lead decides, cannot apply, and assignment hands it over.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$select public.decide_event_change_request('39000000-0000-0000-0000-0000000000f6', 'approved', 'Rename before planning')$$,
  'AC03: a Coordinator Lead approves a request on an unassigned event'
);
select throws_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f6', (select body from spm39_payload where label = 'e6'))$$,
  '42501', 'Only the assigned coordinator can apply this change request',
  'AC03: the Lead cannot apply the change'
);

reset role;
update public.events set assigned_coordinator_id = '39000000-0000-0000-0000-000000000002'
where id = '39000000-0000-0000-0000-0000000000e6';
select is(
  (select count(*)::int from public.notifications
   where recipient_id = '39000000-0000-0000-0000-000000000002' and event_id = '39000000-0000-0000-0000-0000000000e6'
     and title = 'Change request waiting for you'),
  1,
  'AC03: the newly assigned coordinator is told the approved request is waiting'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.apply_event_change_request('39000000-0000-0000-0000-0000000000f6', (select body from spm39_payload where label = 'e6'))$$,
  'AC03: once assigned, the coordinator applies the Lead-approved change'
);
reset role;
select is(
  (select title from public.events where id = '39000000-0000-0000-0000-0000000000e6'),
  'SPM39 Renamed Event',
  'AC07: the renamed title is saved'
);

select * from finish();
rollback;
