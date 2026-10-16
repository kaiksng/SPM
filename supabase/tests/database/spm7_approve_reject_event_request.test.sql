begin;

-- SPM-7 "Approve or Reject an Event Request"
-- (supabase/migrations/202609150002_approve_reject_event_request.sql's own
-- header lists AC01-AC07). event_decisions.test.sql already covers the
-- approval path thoroughly (Planning transition, completeness check,
-- clarification blocking, decider/rationale recorded, organiser notified,
-- re-decision guard) but never exercises a *successful* rejection -- its
-- only two "rejected" cases are a blank-reason block and rejecting an
-- event that's no longer Requested. That leaves AC04 (status -> Rejected),
-- half of AC05 (the reason is recorded on a rejection), half of AC06 (the
-- organiser is notified on rejection), and all of AC07 (venue/equipment
-- planning actions blocked once Rejected) completely untested. This file
-- covers exactly those.

select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '87000000-0000-0000-0000-000000000001',
    'spm7-organiser@example.test',
    '{"full_name":"SPM7 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '87000000-0000-0000-0000-000000000002',
    'spm7-lead@example.test',
    '{"full_name":"SPM7 Lead","role":"event_coordinator_lead"}'::jsonb
  ),
  (
    '87000000-0000-0000-0000-000000000003',
    'spm7-coordinator@example.test',
    '{"full_name":"SPM7 Coordinator","role":"event_coordinator"}'::jsonb
  );

reset role;
insert into public.venues (name, location, capacity, operating_hours)
values (
  'SPM7 Test Venue', 'Building 87', 100,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"87000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm7_ids (label text primary key, id uuid);
insert into spm7_ids select 'venue-1', id from public.venues where name = 'SPM7 Test Venue';

insert into spm7_ids
select 'event-a', public.save_event_draft(
  '{
    "title":"[SPM7] Event A",
    "purpose":"Rejection-path coverage",
    "description":"A complete request that gets rejected anyway.",
    "expectedAttendance":"40",
    "startsAt":"2099-06-01T10:00:00+08:00",
    "endsAt":"2099-06-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm7_ids where label = 'event-a'));

select set_config(
  'request.jwt.claims',
  '{"sub":"87000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm7_ids where label = 'event-a'), '87000000-0000-0000-0000-000000000003'::uuid, null);

-- AC03/AC04: a rejection with a valid reason succeeds and moves the event
-- to Rejected.
select set_config(
  'request.jwt.claims',
  '{"sub":"87000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'rejected'::public.event_decision_type, 'The venue is already double-booked.')$$,
    (select id from spm7_ids where label = 'event-a')
  ),
  'AC03/AC04: a rejection with a valid reason succeeds'
);
select is(
  (select status::text from public.events where id = (select id from spm7_ids where label = 'event-a')),
  'rejected',
  'AC04: the event moves to Rejected'
);

-- AC05: the decision records the deciding coordinator, the outcome, and
-- the reason.
select is(
  (select row(decided_by, decision::text, rationale) from public.event_decisions
    where event_id = (select id from spm7_ids where label = 'event-a')),
  row('87000000-0000-0000-0000-000000000003'::uuid, 'rejected'::text, 'The venue is already double-booked.'::text),
  'AC05: the coordinator, outcome, and reason are all recorded for the rejection'
);

-- AC06: the organiser is notified of the rejection, with the reason
-- included. Checked as superuser: notifications has no SELECT policy
-- letting the coordinator read the organiser's own notifications.
reset role;
select is(
  (select row(title, message) from public.notifications
    where recipient_id = '87000000-0000-0000-0000-000000000001'::uuid
      and event_id = (select id from spm7_ids where label = 'event-a')
      and type = 'decision'::public.notification_type),
  row('Event rejected'::text, 'Your event "[SPM7] Event A" was rejected. The venue is already double-booked.'::text),
  'AC06: the organiser is notified of the rejection, including the reason'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"87000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

-- AC07: once Rejected, venue and equipment planning actions are blocked --
-- both already gate on status = 'planning', which a Rejected event can
-- never reach.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from spm7_ids where label = 'event-a'),
    (select id from spm7_ids where label = 'venue-1')
  ),
  '23514',
  'Only a Planning event can have a venue booking request submitted',
  'AC07: a venue booking cannot be submitted for a Rejected event'
);
select throws_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, '{"equipment":[]}'::jsonb)$$,
    (select id from spm7_ids where label = 'event-a')
  ),
  '23514',
  'Only a Planning event can be updated this way',
  'AC07: equipment/planning updates cannot be made on a Rejected event'
);

select * from finish();
rollback;
