begin;

-- SPM-84 "Reassign an Event Coordinator". pb04_coordinator_assignment.test.sql
-- already covers reassign_event_coordinator's lead-only authorization, the
-- reason requirement, the event_coordinator role constraint, the basic
-- reassignment happening, and the new coordinator's notification. This file
-- covers what that one doesn't: assignment history/ended_at, viewing the
-- full history, the previous-coordinator and organiser notifications,
-- refusing reassignment to the current coordinator, the status block, and
-- the "immediately denied for the old coordinator / immediately allowed for
-- the new one" guarantee across a coordinator's other management actions
-- (AC4/AC7/AC8), plus open items staying attached and unchanged (AC5).
--
-- Four separate events, because the event statuses each open-item type
-- needs are mutually exclusive on a single event: a clarification can only
-- be open while Requested, deciding the event request is blocked while a
-- clarification is open, and a venue booking can only be submitted once
-- Planning.
--   Event A: reassigned while Requested, no open items -- history,
--            notifications, same-coordinator refusal, decide_event_request
--            scoping, and a change request (no status restriction) for its
--            own AC5/handoff coverage.
--   Event B: reassigned while Requested, with an open clarification.
--   Event C: rejected, then a reassignment attempt is refused (AC8).
--   Event D: reassigned while Planning, with a pending venue booking.

select plan(22);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '84000000-0000-0000-0000-000000000001',
    'spm84-organiser@example.test',
    '{"full_name":"SPM84 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    'spm84-lead@example.test',
    '{"full_name":"SPM84 Lead","role":"event_coordinator_lead"}'::jsonb
  ),
  (
    '84000000-0000-0000-0000-000000000003',
    'spm84-coordinator-a@example.test',
    '{"full_name":"SPM84 Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  (
    '84000000-0000-0000-0000-000000000004',
    'spm84-coordinator-b@example.test',
    '{"full_name":"SPM84 Coordinator B","role":"event_coordinator"}'::jsonb
  );

-- One venue, open every day, so operating hours never block the scenario.
reset role;
insert into public.venues (name, location, capacity, operating_hours)
values (
  'SPM84 Test Venue', 'Building 84', 100,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm84_ids (label text primary key, id uuid);
insert into spm84_ids select 'venue-1', id from public.venues where name = 'SPM84 Test Venue';

insert into spm84_ids
select 'event-a', public.save_event_draft(
  '{
    "title":"[SPM84] Event A",
    "purpose":"Reassignment coverage",
    "description":"Reassigned while Requested, no open items.",
    "expectedAttendance":"50",
    "startsAt":"2099-02-01T10:00:00+08:00",
    "endsAt":"2099-02-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Seminar Room","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm84_ids where label = 'event-a'));

insert into spm84_ids
select 'event-b', public.save_event_draft(
  '{
    "title":"[SPM84] Event B",
    "purpose":"Open clarification coverage",
    "description":"Reassigned while Requested, with an open clarification.",
    "expectedAttendance":"50",
    "startsAt":"2099-02-02T10:00:00+08:00",
    "endsAt":"2099-02-02T12:00:00+08:00",
    "venue":{"preferredLocation":"Seminar Room","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm84_ids where label = 'event-b'));

insert into spm84_ids
select 'event-c', public.save_event_draft(
  '{
    "title":"[SPM84] Event C",
    "purpose":"Status block coverage",
    "description":"Rejected before a reassignment attempt.",
    "expectedAttendance":"10",
    "startsAt":"2099-02-03T10:00:00+08:00",
    "endsAt":"2099-02-03T12:00:00+08:00",
    "venue":{"preferredLocation":"Seminar Room","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm84_ids where label = 'event-c'));

insert into spm84_ids
select 'event-d', public.save_event_draft(
  '{
    "title":"[SPM84] Event D",
    "purpose":"Pending venue booking coverage",
    "description":"Reassigned while Planning, with a pending venue booking.",
    "expectedAttendance":"80",
    "startsAt":"2099-02-04T10:00:00+08:00",
    "endsAt":"2099-02-04T12:00:00+08:00",
    "venue":{"preferredLocation":"Seminar Room","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm84_ids where label = 'event-d'));

-- Lead assigns all four events to Coordinator A first (setup, not asserted
-- here -- pb04 already covers first assignment).
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-a'), '84000000-0000-0000-0000-000000000003'::uuid, null);
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-b'), '84000000-0000-0000-0000-000000000003'::uuid, null);
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-c'), '84000000-0000-0000-0000-000000000003'::uuid, null);
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-d'), '84000000-0000-0000-0000-000000000003'::uuid, null);

-- Coordinator A: rejects Event C, opens a clarification on Event B, and
-- approves + books a venue on Event D.
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select public.decide_event_request((select id from spm84_ids where label = 'event-c'), 'rejected'::public.event_decision_type, 'Not viable.');

insert into spm84_ids
select 'clarification-1', (public.request_event_clarification(
  (select id from spm84_ids where label = 'event-b'),
  'What catering does this event need?'
) ->> 'id')::uuid;

select public.decide_event_request((select id from spm84_ids where label = 'event-d'), 'approved'::public.event_decision_type, 'Looks good.');
insert into spm84_ids
select 'booking-1', public.submit_venue_booking_request(
  (select id from spm84_ids where label = 'event-d'),
  (select id from spm84_ids where label = 'venue-1')
);

-- Organiser opens a pending change request on Event A (fixture only, via
-- submit_event_change_request -- 202610200013_submit_event_change_request.sql).
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
insert into spm84_ids
select 'change-request-1', (public.submit_event_change_request(
  (select id from spm84_ids where label = 'event-a'),
  '{"expectedAttendance":"60"}'::jsonb,
  'Attendance has grown since submission.'
) ->> 'id')::uuid;

-- The Lead reassigns Events A, B, and D from Coordinator A to Coordinator
-- B, with a reason (setup for the assertions below; pb04 already covers
-- that a reassignment with a reason succeeds).
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-a'), '84000000-0000-0000-0000-000000000004'::uuid, 'Handing off to Coordinator B.');
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-b'), '84000000-0000-0000-0000-000000000004'::uuid, 'Handing off to Coordinator B.');
select public.reassign_event_coordinator((select id from spm84_ids where label = 'event-d'), '84000000-0000-0000-0000-000000000004'::uuid, 'Handing off to Coordinator B.');

-- AC3: the previous assignment interval is closed, the new one is open.
-- event_coordinator_assignments has RLS enabled with no SELECT policy at
-- all -- list_event_coordinator_history is the only sanctioned read path,
-- so these all go through it rather than querying the table directly.
select is(
  (select ended_at is not null from public.list_event_coordinator_history((select id from spm84_ids where label = 'event-a'))
    where new_coordinator_id = '84000000-0000-0000-0000-000000000003'::uuid),
  true,
  'AC3: Coordinator A''s assignment interval on Event A is closed (ended_at recorded)'
);
select is(
  (select ended_at from public.list_event_coordinator_history((select id from spm84_ids where label = 'event-a'))
    where new_coordinator_id = '84000000-0000-0000-0000-000000000004'::uuid),
  null::timestamptz,
  'AC3: Coordinator B''s new assignment interval on Event A is still open'
);
select is(
  (select changed_by_id from public.list_event_coordinator_history((select id from spm84_ids where label = 'event-a'))
    where new_coordinator_id = '84000000-0000-0000-0000-000000000004'::uuid),
  '84000000-0000-0000-0000-000000000002'::uuid,
  'AC3: the reassignment is recorded as the Lead''s own action'
);

-- AC3: full history is viewable, with both hops resolved to names.
select is(
  (select count(*)::integer from public.list_event_coordinator_history((select id from spm84_ids where label = 'event-a'))),
  2,
  'AC3: Event A''s full coordinator history has both the first assignment and the reassignment'
);
select is(
  (select new_coordinator_name from public.list_event_coordinator_history((select id from spm84_ids where label = 'event-a'))
    where new_coordinator_id = '84000000-0000-0000-0000-000000000004'::uuid),
  'SPM84 Coordinator B',
  'AC3: the history''s reassignment entry resolves the new coordinator''s name'
);

-- AC6: all three parties are notified, not just the new coordinator (pb04
-- already covers the new coordinator's notification on first assignment).
-- Checked as superuser: notifications has no SELECT policy letting the
-- Lead read another user's own notifications, and that's not what's under
-- test here -- just that the rows exist.
reset role;
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '84000000-0000-0000-0000-000000000003'::uuid
      and event_id = (select id from spm84_ids where label = 'event-a')
      and title = 'An event has been reassigned'),
  1,
  'AC6: the previous coordinator is notified the event is no longer theirs'
);
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '84000000-0000-0000-0000-000000000004'::uuid
      and event_id = (select id from spm84_ids where label = 'event-a')
      and title = 'An event has been assigned to you'),
  1,
  'AC6: the new coordinator is notified the event is now theirs'
);
-- reassign_event_coordinator sends this organiser notification
-- unconditionally on every call, including the first assignment -- Event A
-- went through both (first assign, then reassign), so two is correct here,
-- not one.
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '84000000-0000-0000-0000-000000000001'::uuid
      and event_id = (select id from spm84_ids where label = 'event-a')
      and title = 'Your event has a new coordinator'),
  2,
  'AC6: the organiser is notified on both the first assignment and the reassignment'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- AC2: reassigning to the coordinator already assigned is refused.
select throws_ok(
  format($$select public.reassign_event_coordinator(%L::uuid, '84000000-0000-0000-0000-000000000004'::uuid, 'anything')$$, (select id from spm84_ids where label = 'event-a')),
  '23514',
  'That coordinator is already assigned to this event',
  'AC2: reassigning to the current coordinator is refused'
);

-- AC8: reassignment is not allowed once an event is Rejected.
select throws_ok(
  format($$select public.reassign_event_coordinator(%L::uuid, '84000000-0000-0000-0000-000000000004'::uuid, null)$$, (select id from spm84_ids where label = 'event-c')),
  '23514',
  'An event with status rejected cannot be assigned',
  'AC8: a Rejected event cannot be reassigned'
);

-- AC4/AC7: immediately after reassignment, the old coordinator is denied
-- deciding Event A's request; the new coordinator is allowed.
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$, (select id from spm84_ids where label = 'event-a')),
  '42501',
  'Only the assigned coordinator can decide this event request',
  'AC4/AC7: the previous coordinator can no longer decide Event A'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$, (select id from spm84_ids where label = 'event-a')),
  'AC4/AC7: the new coordinator can decide Event A immediately'
);

-- AC5: Event B's open clarification and Event D's pending venue booking are
-- unchanged by their reassignments. (Event A's change request is checked
-- below, right before its own handoff assertions.)
select is(
  (select status from public.clarifications where id = (select id from spm84_ids where label = 'clarification-1')),
  'open',
  'AC5: the open clarification on Event B is unchanged by the reassignment'
);
select is(
  (select status from public.venue_bookings where id = (select id from spm84_ids where label = 'booking-1')),
  'pending',
  'AC5: the pending venue booking on Event D is unchanged by the reassignment'
);

-- AC4/AC7/AC8: the previous coordinator is denied on Event B's clarification
-- and Event D's venue booking; the new coordinator can act on both (open
-- items become theirs).
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.resolve_event_clarification(%L::uuid)$$, (select id from spm84_ids where label = 'clarification-1')),
  '42501',
  'Only the assigned coordinator can resolve this clarification',
  'AC4/AC7: the previous coordinator can no longer resolve Event B''s clarification'
);
select throws_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid)$$, (select id from spm84_ids where label = 'booking-1')),
  '42501',
  'Only the event''s assigned coordinator can withdraw this request',
  'AC4/AC7: the previous coordinator can no longer withdraw Event D''s venue booking'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.resolve_event_clarification(%L::uuid)$$, (select id from spm84_ids where label = 'clarification-1')),
  'AC4/AC7/AC8: the new coordinator can resolve Event B''s clarification -- it is now their responsibility'
);
select lives_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'No longer needed')$$, (select id from spm84_ids where label = 'booking-1')),
  'AC4/AC7/AC8: the new coordinator can withdraw Event D''s venue booking -- it is now their responsibility'
);

-- AC5/AC4/AC7/AC8: Event A's pending change request is unchanged by the
-- reassignment; the old coordinator's decision on it is silently denied by
-- RLS, and the new coordinator's decision succeeds -- it is now theirs.
select is(
  (select status from public.event_change_requests where id = (select id from spm84_ids where label = 'change-request-1')),
  'pending',
  'AC5: the pending change request on Event A is unchanged by the reassignment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.decide_event_change_request(%L::uuid, 'approved'::public.event_decision_type)$$, (select id from spm84_ids where label = 'change-request-1')),
  '42501',
  'Only the assigned coordinator can decide this change request',
  'AC4/AC7: the previous coordinator can no longer decide Event A''s change request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select lives_ok(
  format($$select public.decide_event_change_request(%L::uuid, 'approved'::public.event_decision_type)$$, (select id from spm84_ids where label = 'change-request-1')),
  'AC4/AC7/AC8: the new coordinator can decide Event A''s change request -- it is now their responsibility'
);
select is(
  (select status from public.event_change_requests where id = (select id from spm84_ids where label = 'change-request-1')),
  'approved',
  'AC4/AC7/AC8: the new coordinator''s change-request decision succeeds'
);

select * from finish();
rollback;
