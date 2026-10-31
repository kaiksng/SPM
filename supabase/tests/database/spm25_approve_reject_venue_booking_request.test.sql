begin;

-- SPM-25 "Approve or Reject a Venue Booking Request".
-- decide_venue_booking_request.test.sql already covers this thoroughly:
-- the role check, the reason requirement, a successful approval (status,
-- decider, timestamp, the coordinator's approval notification), a
-- successful rejection (status, the reason recorded), the already-decided
-- guard, and that rejection releases the venue/period for a fresh request.
-- Two things are only ever asserted on the *approve* path, never on
-- *reject*: that decided_by/decided_at are recorded (only decision_notes
-- was checked for a rejection), and the coordinator's own notification
-- (only the approval notification was ever checked). This file covers
-- exactly those two gaps.

select plan(3);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '25000000-0000-0000-0000-000000000001',
    'spm25-organiser@example.test',
    '{"full_name":"SPM25 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '25000000-0000-0000-0000-000000000002',
    'spm25-lead@example.test',
    '{"full_name":"SPM25 Lead","role":"event_coordinator_lead"}'::jsonb
  ),
  (
    '25000000-0000-0000-0000-000000000003',
    'spm25-coordinator@example.test',
    '{"full_name":"SPM25 Coordinator","role":"event_coordinator"}'::jsonb
  ),
  (
    '25000000-0000-0000-0000-000000000004',
    'spm25-venue-staff@example.test',
    '{"full_name":"SPM25 Venue Staff","role":"venue_staff"}'::jsonb
  );

reset role;
insert into public.venues (name, location, capacity, operating_hours)
values (
  'SPM25 Test Venue', 'Building 25', 100,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm25_ids (label text primary key, id uuid);
insert into spm25_ids select 'venue-1', id from public.venues where name = 'SPM25 Test Venue';

insert into spm25_ids
select 'event-a', public.save_event_draft(
  '{
    "title":"[SPM25] Event A",
    "purpose":"Rejection-path coverage",
    "description":"A booking that gets rejected.",
    "expectedAttendance":"30",
    "startsAt":"2099-07-01T10:00:00+08:00",
    "endsAt":"2099-07-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm25_ids where label = 'event-a'));

select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm25_ids where label = 'event-a'), '25000000-0000-0000-0000-000000000003'::uuid, null);

select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select public.decide_event_request((select id from spm25_ids where label = 'event-a'), 'approved'::public.event_decision_type, 'Looks good.');
insert into spm25_ids
select 'booking-1', public.submit_venue_booking_request(
  (select id from spm25_ids where label = 'event-a'),
  (select id from spm25_ids where label = 'venue-1')
);

-- Venue Staff rejects the Pending request with a reason.
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select public.decide_venue_booking_request((select id from spm25_ids where label = 'booking-1'), 'rejected'::public.venue_booking_decision_type, 'Venue is unavailable that day.');

-- AC03: the deciding Venue Staff member and the decision timestamp are
-- recorded on a rejection too, not just an approval.
select is(
  (select row(decided_by, decided_at is not null) from public.venue_bookings
    where id = (select id from spm25_ids where label = 'booking-1')),
  row('25000000-0000-0000-0000-000000000004'::uuid, true),
  'AC03: the deciding Venue Staff member and the decision timestamp are recorded on a rejection'
);

-- AC04: the requesting coordinator is notified on a rejection too, not
-- just an approval. Checked as superuser: notifications has no SELECT
-- policy letting Venue Staff read the coordinator's own notifications.
reset role;
select is(
  (select count(*)::integer from public.notifications
    where recipient_id = '25000000-0000-0000-0000-000000000003'::uuid
      and event_id = (select id from spm25_ids where label = 'event-a')
      and type = 'venue_decision'::public.notification_type
      and title = 'Venue booking rejected'),
  1,
  'AC04: the coordinator is notified of the rejection'
);
select is(
  (select message from public.notifications
    where recipient_id = '25000000-0000-0000-0000-000000000003'::uuid
      and event_id = (select id from spm25_ids where label = 'event-a')
      and type = 'venue_decision'::public.notification_type
      and title = 'Venue booking rejected'),
  'The venue booking request at SPM25 Test Venue for "[SPM25] Event A" was rejected.',
  'AC04: the rejection notification names the event and venue (the reason is kept on the booking, not in the message)'
);

select * from finish();
rollback;
