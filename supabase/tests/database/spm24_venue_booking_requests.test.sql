begin;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f0000000-0000-0000-0000-000000000001',
    'spm24-organiser@example.test',
    '{"full_name":"SPM24 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'spm24-coordinator-a@example.test',
    '{"full_name":"SPM24 Coordinator A","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm24_event_ids (label text primary key, id uuid);

-- Event A: taken all the way to Planning — the happy-path event this file's
-- venue booking requests are submitted against.
select lives_ok(
  $$insert into spm24_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[SPM24] Event A",
        "purpose":"Venue booking test event.",
        "description":"A test event for SPM-24 venue booking requests.",
        "expectedAttendance":"20",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event A as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from spm24_event_ids where label = 'event-a')),
  'Event A can be submitted'
);

-- Event B: a second event, kept at Requested — used to prove AC06's
-- "Planning event" requirement and, once approved, to prove AC03's
-- venue-side conflict against Event A's own booking.
select lives_ok(
  $$insert into spm24_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[SPM24] Event B",
        "purpose":"Second venue booking test event.",
        "description":"A test event for SPM-24 venue booking requests.",
        "expectedAttendance":"15",
        "startsAt":"2099-04-02T10:00:00+08:00",
        "endsAt":"2099-04-02T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event B as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from spm24_event_ids where label = 'event-b')),
  'Event B can be submitted'
);

-- Both events land on the same, only coordinator — deterministic assignment.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from spm24_event_ids where label = 'event-a')
  ),
  'Event A is approved into Planning'
);

create temporary table spm24_venue_ids (label text primary key, id uuid);
insert into spm24_venue_ids
  select 'room-a', id from public.venues where name = 'Conference Room A';
insert into spm24_venue_ids
  select 'auditorium', id from public.venues where name = 'Main Auditorium';

-- AC02: mandatory information missing.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, null, '2099-04-06T10:00:00+08:00'::timestamptz, '2099-04-06T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-a')
  ),
  '23514',
  'Select a venue before submitting',
  'AC02: a request with no venue is blocked'
);
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, null, null)$$,
    (select id from spm24_event_ids where label = 'event-a'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '23514',
  'Enter the requested period before submitting',
  'AC02: a request with no period is blocked'
);

-- AC06: only a Planning event can have a venue booking request submitted —
-- Event B is still Requested.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-06T10:00:00+08:00'::timestamptz, '2099-04-06T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-b'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '23514',
  'Only a Planning event can have a venue booking request submitted',
  'AC06: a request against a non-Planning event is blocked'
);

-- Permission: a coordinator not assigned to Event A cannot submit for it.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  'f0000000-0000-0000-0000-000000000003',
  'spm24-coordinator-b@example.test',
  '{"full_name":"SPM24 Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-06T10:00:00+08:00'::timestamptz, '2099-04-06T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-a'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '42501',
  'Only the assigned coordinator can submit a venue booking request for this event',
  'permission: an unassigned coordinator cannot submit for Event A'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- AC07: outside the venue's operating days. Conference Room A operates
-- Monday-Friday; 2099-04-11 is a Saturday.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-11T10:00:00+08:00'::timestamptz, '2099-04-11T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-a'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '23514',
  'The requested period falls outside the venue''s operating days',
  'AC07: a Saturday request against a Monday-Friday venue is blocked'
);

-- AC07: outside the venue's operating hours. Conference Room A closes at
-- 18:00; this request runs 19:00-20:00.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-06T19:00:00+08:00'::timestamptz, '2099-04-06T20:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-a'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '23514',
  'The requested period falls outside the venue''s operating hours',
  'AC07: a request after closing time is blocked'
);

-- AC01: the happy path.
create temporary table spm24_booking_ids (label text primary key, id uuid);
select lives_ok(
  $$insert into spm24_booking_ids
    select 'booking-1', public.submit_venue_booking_request(
      (select id from spm24_event_ids where label = 'event-a'),
      (select id from spm24_venue_ids where label = 'room-a'),
      '2099-04-06T10:00:00+08:00'::timestamptz,
      '2099-04-06T12:00:00+08:00'::timestamptz
    )$$,
  'AC01: a complete, available request succeeds'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from spm24_booking_ids where label = 'booking-1')),
  'pending',
  'AC01: the new request''s status is Pending'
);

-- AC04: Event A already has an active (Pending) booking — a second request
-- for the same event, even against a different venue, is rejected.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-07T10:00:00+08:00'::timestamptz, '2099-04-07T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-a'),
    (select id from spm24_venue_ids where label = 'auditorium')
  ),
  '23514',
  'This event already has an active venue booking request',
  'AC04: a second active request for the same event is rejected'
);

-- AC03: Room A already has an overlapping Pending booking (booking-1, same
-- day 10:00-12:00) — a request for Event B (once it reaches Planning) hits
-- the venue-side conflict, not the event-side one.
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from spm24_event_ids where label = 'event-b')
  ),
  'Event B is approved into Planning'
);
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-06T11:00:00+08:00'::timestamptz, '2099-04-06T13:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-b'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  '23514',
  'This venue already has a Pending or Confirmed booking for part of the requested period',
  'AC03: an overlapping request against an already-Pending venue period is rejected'
);

-- AC03: a venue block. Set directly (no UI/RPC exists yet to create one —
-- by design, see the migration).
reset role;
insert into public.venue_blocks (venue_id, starts_at, ends_at, reason)
values (
  (select id from spm24_venue_ids where label = 'auditorium'),
  '2099-04-20T00:00:00+08:00',
  '2099-04-21T00:00:00+08:00',
  'Maintenance'
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-20T10:00:00+08:00'::timestamptz, '2099-04-20T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-b'),
    (select id from spm24_venue_ids where label = 'auditorium')
  ),
  '23514',
  'This venue is blocked for part of the requested period',
  'AC03: a request overlapping a venue block is rejected'
);

-- AC05: withdraw the Pending booking from Event A.
select lives_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid)$$, (select id from spm24_booking_ids where label = 'booking-1')),
  'AC05: the assigned coordinator can withdraw their own Pending request'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from spm24_booking_ids where label = 'booking-1')),
  'withdrawn',
  'AC05: the withdrawn request''s status is Withdrawn'
);

-- AC05: withdrawing again (no longer Pending) is refused.
select throws_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid)$$, (select id from spm24_booking_ids where label = 'booking-1')),
  '23514',
  'Only a Pending venue booking request can be withdrawn',
  'AC05: a non-Pending request cannot be withdrawn again'
);

-- AC05 downstream: the period is released back to Available — Event B can
-- now book Room A for the exact period booking-1 held.
select lives_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid, '2099-04-06T10:00:00+08:00'::timestamptz, '2099-04-06T12:00:00+08:00'::timestamptz)$$,
    (select id from spm24_event_ids where label = 'event-b'),
    (select id from spm24_venue_ids where label = 'room-a')
  ),
  'AC05: after withdrawal, the same venue period is Available again'
);

select * from finish();
rollback;
