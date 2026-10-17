begin;

select plan(32);

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

-- 202610050003: submitting no longer assigns a coordinator; the Event
-- Coordinator Lead does. This helper has the Lead assign the coordinator the
-- old automatic assignment would have picked (least active requests, then
-- lowest id), so the checks below keep their original meaning.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'eeeeeeee-0000-0000-0000-0000000000ad',
  'pgtap-lead@example.test',
  '{"full_name":"pgTAP Lead","role":"event_coordinator_lead"}'::jsonb
);

create function pg_temp.lead_assigns_coordinator(p_event_id uuid)
returns uuid
language plpgsql
security definer
as $helper$
declare
  saved_claims text := current_setting('request.jwt.claims', true);
  coordinator_id uuid;
begin
  select p.id into coordinator_id
  from public.profiles p
  where p.role = 'event_coordinator'::public.user_role
  order by (
    select count(*) from public.events e
    where e.assigned_coordinator_id = p.id
      and e.status in ('requested', 'submitted', 'clarification_requested', 'under_review', 'approved')
  ) asc, p.id asc
  limit 1;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"eeeeeeee-0000-0000-0000-0000000000ad","role":"authenticated"}',
    true
  );
  perform public.reassign_event_coordinator(p_event_id, coordinator_id, '');
  perform set_config('request.jwt.claims', saved_claims, true);
  return coordinator_id;
end;
$helper$;


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
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from sb_event_ids where label = 'event-a')),
  'the Lead assigns the next available coordinator'
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
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from sb_event_ids where label = 'event-b')),
  'the Lead assigns the next available coordinator'
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
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from sb_event_ids where label = 'event-c')),
  'the Lead assigns the next available coordinator'
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

-- SPM-24 AC05: a request must name the venue.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, null)$$,
    (select id from sb_event_ids where label = 'event-a')
  ),
  '23514',
  'Select a venue before submitting',
  'SPM-24 AC05: a request with no venue selected is blocked'
);

-- SPM-24 AC06: Event B falls on a Saturday, outside Room A's Monday-Friday hours.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-b'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This booking''s period, including setup and turnaround time, falls outside the venue''s operating days or hours.',
  'SPM-24 AC06: a Saturday event against a Monday-Friday venue is blocked'
);

-- SPM-24 AC01: the happy path.
create temporary table sb_booking_ids (label text primary key, id uuid);
select lives_ok(
  $$insert into sb_booking_ids
    select 'booking-1', public.submit_venue_booking_request(
      (select id from sb_event_ids where label = 'event-a'),
      (select id from sb_venue_ids where label = 'room-a')
    )$$,
  'SPM-24 AC01: a complete, available request succeeds'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from sb_booking_ids where label = 'booking-1')),
  'pending',
  'SPM-24 AC01: the new request''s status is Pending'
);

-- SPM-24 AC05: the request refers to the event and venue, and its period is
-- the event's own schedule (attendance and venue requirements are read from
-- the event).
select is(
  (
    select row(event_id, venue_id, starts_at, ends_at)
    from public.venue_bookings
    where id = (select id from sb_booking_ids where label = 'booking-1')
  ),
  (
    select row(e.id, (select id from sb_venue_ids where label = 'room-a'), e.starts_at, e.ends_at)
    from public.events e
    where e.id = (select id from sb_event_ids where label = 'event-a')
  ),
  'SPM-24 AC05: the request references the event, the venue and the event''s exact period'
);

-- Every venue-staff profile is notified of the new request, not just one.
-- Read as the superuser: RLS shows each user only their own notifications,
-- so the coordinator could never see venue staff's.
reset role;
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
set local role authenticated;

-- SPM-24 AC02: Room A already has an overlapping Pending booking (booking-1, same
-- Monday 10:00-12:00 slot) — Event C has no active booking of its own, so
-- this reaches the venue-side conflict check, not the one-request-per-event one.
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-c'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This venue is already occupied from 10:00 AM on 06 Apr to 12:00 PM on 06 Apr (including setup and turnaround), which overlaps your requested period.',
  'SPM-24 AC02: an overlapping request against an already-Pending venue period is rejected'
);

-- SPM-24 AC02: an operational block on Room B, set directly (no UI/RPC creates one
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
  'This venue is unavailable for part of this booking''s period, including setup and turnaround time.',
  'SPM-24 AC02: a request overlapping a venue block is rejected'
);
select is(
  (select count(*)::integer from public.venue_bookings where event_id = (select id from sb_event_ids where label = 'event-c')),
  0,
  'SPM-24 AC02: a refused request creates no booking at all'
);

-- SPM-85: Event A already has an active (Pending) booking, so a second request
-- is an additional venue and must say what it is for (label, period, headcount).
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-a'),
    (select id from sb_venue_ids where label = 'room-b')
  ),
  '23514',
  'Give this booking a label, for example Breakout 1',
  'SPM-85: a second request for the same event is an additional booking and needs its own details'
);

-- SPM-24 AC03: withdraw the Pending booking from Event A.
select lives_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'No longer needed')$$, (select id from sb_booking_ids where label = 'booking-1')),
  'SPM-24 AC03: the requesting coordinator can withdraw their own Pending request'
);
select is(
  (select status::text from public.venue_bookings where id = (select id from sb_booking_ids where label = 'booking-1')),
  'cancelled',
  'SPM-24 AC03: the withdrawn request''s status is Cancelled'
);

-- SPM-24 AC03: the period is released — another event can now have the slot
-- Event A gave up (an event's own booking never blocks itself, so only a
-- different event shows this).
select is(
  (
    select (public.check_venue_booking_availability(
      (select id from sb_venue_ids where label = 'room-a'),
      (select id from sb_event_ids where label = 'event-c')
    ) ->> 'available')::boolean
  ),
  true,
  'SPM-24 AC03: after withdrawal the period is Available to another event'
);

-- SPM-24 AC03: withdrawing again (no longer Pending) is refused.
select throws_ok(
  format($$select public.withdraw_venue_booking_request(%L::uuid, null, 'Again')$$, (select id from sb_booking_ids where label = 'booking-1')),
  '23514',
  'Only a Pending or Approved venue booking can be withdrawn or cancelled',
  'SPM-24 AC03: a released request cannot be withdrawn again'
);

-- SPM-24 AC03 downstream: the event-level restriction is released — Event A can
-- now submit a fresh request.
select lives_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-a'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  'SPM-24 AC03: after withdrawal, Event A can submit a new venue booking request'
);

-- SPM-24 AC02: an On Hold or Approved booking blocks the period as much as a
-- Pending one. Event A's new request is moved on directly (Venue Staff's own
-- hold and decision paths have their own tests).
reset role;
update public.venue_bookings
set status = 'on_hold', expires_at = now() + interval '2 days'
where event_id = (select id from sb_event_ids where label = 'event-a') and status = 'pending';
set local role authenticated;
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-c'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This venue is already occupied from 10:00 AM on 06 Apr to 12:00 PM on 06 Apr (including setup and turnaround), which overlaps your requested period.',
  'SPM-24 AC02: an On Hold booking blocks an overlapping request'
);
reset role;
update public.venue_bookings
set status = 'approved', expires_at = null
where event_id = (select id from sb_event_ids where label = 'event-a') and status = 'on_hold';
set local role authenticated;
select throws_ok(
  format(
    $$select public.submit_venue_booking_request(%L::uuid, %L::uuid)$$,
    (select id from sb_event_ids where label = 'event-c'),
    (select id from sb_venue_ids where label = 'room-a')
  ),
  '23514',
  'This venue is already occupied from 10:00 AM on 06 Apr to 12:00 PM on 06 Apr (including setup and turnaround), which overlaps your requested period.',
  'SPM-24 AC02: an Approved booking blocks an overlapping request'
);
select is(
  (select count(*)::integer from public.venue_bookings where event_id = (select id from sb_event_ids where label = 'event-c')),
  0,
  'SPM-24 AC02: the refused requests created no booking'
);

select * from finish();
rollback;
