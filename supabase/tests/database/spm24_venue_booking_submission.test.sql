begin;

select plan(23);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f1000000-0000-0000-0000-000000000001',
    'spm24b-organiser@example.test',
    '{"full_name":"SPM24b Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'spm24b-coordinator-a@example.test',
    '{"full_name":"SPM24b Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  -- Two venue-staff profiles, so the notification fan-out below can assert
  -- "every venue-staff profile" actually means more than one.
  (
    'f1000000-0000-0000-0000-000000000004',
    'spm24b-venue-staff-a@example.test',
    '{"full_name":"SPM24b Venue Staff A","role":"venue_staff"}'::jsonb
  ),
  (
    'f1000000-0000-0000-0000-000000000005',
    'spm24b-venue-staff-b@example.test',
    '{"full_name":"SPM24b Venue Staff B","role":"venue_staff"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- Two venues, seeded directly (no UI creates one for this test) — Room A
-- open Monday-Friday 08:00-18:00, Room B open every day 00:00-23:59 so it
-- never fails the operating-hours check regardless of the event's schedule.
-- The temp table is created under the `authenticated` role (already set
-- above) so it stays reachable after later role switches; `reset role`
-- (postgres, superuser) can always read/write it regardless.
create temporary table sb_venue_ids (label text primary key, id uuid);

reset role;
insert into public.venues (name, location, capacity, operating_hours)
select 'Room A Test Venue', 'Building 1', 40,
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}]'::jsonb
where not exists (select 1 from public.venues where name = 'Room A Test Venue');

insert into public.venues (name, location, capacity, operating_hours)
select 'Room B Test Venue', 'Building 2', 40,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
where not exists (select 1 from public.venues where name = 'Room B Test Venue');

insert into sb_venue_ids
  select 'room-a', id from public.venues where name = 'Room A Test Venue'
  union all
  select 'room-b', id from public.venues where name = 'Room B Test Venue';

set local role authenticated;

create temporary table sb_event_ids (label text primary key, id uuid);

-- Event A: Monday 6 Apr 2099, 10:00-12:00 SGT — inside Room A's hours.
select lives_ok(
  $$insert into sb_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[SPM24b] Event A",
        "purpose":"Venue booking submission test.",
        "description":"A test event.",
        "expectedAttendance":"20",
        "startsAt":"2099-04-06T10:00:00+08:00",
        "endsAt":"2099-04-06T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event A as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from sb_event_ids where label = 'event-a')),
  'Event A can be submitted'
);

-- Event B: Saturday 11 Apr 2099 — outside Room A's Monday-Friday days.
select lives_ok(
  $$insert into sb_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[SPM24b] Event B",
        "purpose":"Second test event.",
        "description":"A test event.",
        "expectedAttendance":"15",
        "startsAt":"2099-04-11T10:00:00+08:00",
        "endsAt":"2099-04-11T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event B as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from sb_event_ids where label = 'event-b')),
  'Event B can be submitted'
);

-- Event C: same Monday 6 Apr 2099, 10:00-12:00 slot as Event A — used for
-- AC03's venue-side conflict cases (an event with no active booking of its
-- own, so those checks are reached rather than AC04's event-side one).
select lives_ok(
  $$insert into sb_event_ids
    select 'event-c', public.save_event_draft(
      '{
        "title":"[SPM24b] Event C",
        "purpose":"Third test event.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-06T10:00:00+08:00",
        "endsAt":"2099-04-06T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event C as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from sb_event_ids where label = 'event-c')),
  'Event C can be submitted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from sb_event_ids where label = 'event-a')
  ),
  'Event A is approved into Planning'
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from sb_event_ids where label = 'event-b')
  ),
  'Event B is approved into Planning'
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from sb_event_ids where label = 'event-c')
  ),
  'Event C is approved into Planning'
);

-- Permission: a coordinator not assigned to Event A cannot submit for it.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  'f1000000-0000-0000-0000-000000000003',
  'spm24b-coordinator-b@example.test',
  '{"full_name":"SPM24b Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-a'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '42501',
  'Only the assigned coordinator can submit a venue booking request for this event',
  'permission: an unassigned coordinator cannot submit for Event A'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- AC02: missing mandatory information (no venue selected).
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, null)$$,
    (select id from sb_event_ids where label = 'event-a')
  ),
  '23514',
  'Select a venue before submitting',
  'AC02: a request with no venue selected is blocked'
);

-- AC07: Event B falls on a Saturday, outside Room A's Monday-Friday hours.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-b'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This event''s schedule falls outside the venue''s operating days or hours',
  'AC07: a Saturday event against a Monday-Friday venue is blocked'
);

-- AC01: the happy path.
create temporary table sb_booking_ids (label text primary key, id uuid);
select lives_ok(
  $$insert into sb_booking_ids
    select 'booking-1', public.submit_venue_booking_request(
      (select id from sb_event_ids where label = 'event-a'),
      (select id from sb_venue_ids where label = 'room-a')
    )$$,
  'AC01: a complete, available request succeeds'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from sb_booking_ids where label = 'booking-1')),
  'pending',
  'AC01: the new request''s status is Pending'
);

-- Every venue-staff profile is notified of the new request, not just one.
select is(
  (
    select count(*)::int
    from public.notifications n
    join public.profiles p on p.id = n.recipient_id
    where p.role = 'venue_staff'::public.user_role
      and n.type = 'venue_request'::public.notification_type
      and n.event_id = (select id from sb_event_ids where label = 'event-a')
  ),
  2,
  'submitting a request notifies both seeded venue-staff profiles'
);
select ok(
  exists(
    select 1 from public.notifications
    where recipient_id = 'f1000000-0000-0000-0000-000000000004'::uuid
      and type = 'venue_request'::public.notification_type
      and message like '%Room A Test Venue%'
  ),
  'the notification names the requested venue'
);

-- AC03: Room A already has an overlapping Pending booking (booking-1, same
-- Monday 10:00-12:00 slot) — Event C has no active booking of its own, so
-- this reaches the venue-side conflict check rather than AC04's.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-c'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This venue already has a Pending or Approved booking for part of this event''s schedule',
  'AC03: an overlapping request against an already-Pending venue period is rejected'
);

-- AC03: an operational block on Room B, set directly (no UI/RPC creates one
-- for this test — venue staff manage blocks through their own, unrelated
-- write path).
reset role;
insert into public.venue_unavailability (venue_id, starts_at, ends_at, reason)
values (
  (select id from sb_venue_ids where label = 'room-b'),
  '2099-04-06T00:00:00+08:00',
  '2099-04-07T00:00:00+08:00',
  'Maintenance'
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-c'),
    (select id from sb_venue_ids where label = 'room-b')
  ),
  '23514',
  'This venue is unavailable for part of this event''s schedule',
  'AC03: a request overlapping a venue block is rejected'
);

-- AC04: Event A already has an active (Pending) booking — a second request
-- for the same event, even against a different venue, is rejected.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-a'),
    (select id from sb_venue_ids where label = 'room-b')
  ),
  '23514',
  'This event already has an active venue booking request',
  'AC04: a second active request for the same event is rejected'
);

-- AC05: withdraw the Pending booking from Event A.
select lives_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid)$$, (select id from sb_booking_ids where label = 'booking-1')),
  'AC05: the requesting coordinator can withdraw their own Pending request'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from sb_booking_ids where label = 'booking-1')),
  'cancelled',
  'AC05: the withdrawn request''s status is Cancelled'
);

-- AC05: withdrawing again (no longer Pending) is refused.
select throws_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid)$$, (select id from sb_booking_ids where label = 'booking-1')),
  '23514',
  'Only a Pending venue booking request can be withdrawn',
  'AC05: a non-Pending request cannot be withdrawn again'
);

-- AC05 downstream: the event-level restriction is released — Event A can
-- now submit a fresh request.
select lives_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-a'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  'AC05: after withdrawal, Event A can submit a new venue booking request'
);

select * from finish();
rollback;
