begin;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f2000000-0000-0000-0000-000000000001',
    'fmv-organiser@example.test',
    '{"full_name":"FMV Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'f2000000-0000-0000-0000-000000000002',
    'fmv-coordinator@example.test',
    '{"full_name":"FMV Coordinator","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- Venue A: narrow hours, Monday-Friday 08:00-18:00 only — used to prove
-- operating-hours fit is still a hard exclusion from the list (unlike
-- availability_status's four booking/block-derived states, which only apply
-- to a venue that already clears every hard requirement, including hours).
-- Venue B: open every day, 00:00-23:59.
create temporary table fmv_venue_ids (label text primary key, id uuid);

reset role;
insert into public.venues (name, location, capacity, operating_hours)
select 'FMV Narrow-Hours Venue', 'Building 1', 40,
  '[{"days":["mon","tue","wed","thu","fri"],"opensAt":"08:00","closesAt":"18:00"}]'::jsonb
where not exists (select 1 from public.venues where name = 'FMV Narrow-Hours Venue');

insert into public.venues (name, location, capacity, operating_hours)
select 'FMV Wide-Hours Venue', 'Building 2', 40,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb
where not exists (select 1 from public.venues where name = 'FMV Wide-Hours Venue');

insert into fmv_venue_ids
  select 'narrow', id from public.venues where name = 'FMV Narrow-Hours Venue'
  union all
  select 'wide', id from public.venues where name = 'FMV Wide-Hours Venue';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table fmv_event_ids (label text primary key, id uuid);

-- Event A: a multi-day event, Monday 10pm to Wednesday 2am — outside the
-- narrow venue's hours on every day it touches, and touching no booking or
-- block on either venue.
select lives_ok(
  $$insert into fmv_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[FMV] Multi-day event",
        "purpose":"find_matching_venues availability-status test.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-06T22:00:00+08:00",
        "endsAt":"2099-04-08T02:00:00+08:00",
        "venue":{"preferredLocation":"Building","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save the multi-day event as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from fmv_event_ids where label = 'event-a')),
  'the multi-day event can be submitted'
);

-- Event B: a single-day slot, used for the 'pending'/'blocked' cases.
select lives_ok(
  $$insert into fmv_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[FMV] Pending/blocked test event",
        "purpose":"find_matching_venues availability-status test.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-13T10:00:00+08:00",
        "endsAt":"2099-04-13T12:00:00+08:00",
        "venue":{"preferredLocation":"Building","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save the pending/blocked test event as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from fmv_event_ids where label = 'event-b')),
  'the pending/blocked test event can be submitted'
);

-- Event C: a different single-day slot, used for the 'confirmed' case.
select lives_ok(
  $$insert into fmv_event_ids
    select 'event-c', public.save_event_draft(
      '{
        "title":"[FMV] Confirmed test event",
        "purpose":"find_matching_venues availability-status test.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-20T10:00:00+08:00",
        "endsAt":"2099-04-20T12:00:00+08:00",
        "venue":{"preferredLocation":"Building","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save the confirmed test event as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from fmv_event_ids where label = 'event-c')),
  'the confirmed test event can be submitted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from fmv_event_ids where label = 'event-a')
  ),
  'the multi-day event is approved into Planning'
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from fmv_event_ids where label = 'event-b')
  ),
  'the pending/blocked test event is approved into Planning'
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from fmv_event_ids where label = 'event-c')
  ),
  'the confirmed test event is approved into Planning'
);

-- Fixtures set directly (no UI/RPC creates these for this test, same as
-- spm24's own fixtures): a Pending booking on the narrow venue and a block on
-- the wide venue, both overlapping Event B; an Approved booking on the narrow
-- venue overlapping Event C.
reset role;
insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at, status)
values (
  (select id from fmv_event_ids where label = 'event-b'),
  (select id from fmv_venue_ids where label = 'narrow'),
  'f2000000-0000-0000-0000-000000000002',
  '2099-04-13T10:00:00+08:00',
  '2099-04-13T12:00:00+08:00',
  'pending'
);
insert into public.venue_unavailability (venue_id, starts_at, ends_at, reason)
values (
  (select id from fmv_venue_ids where label = 'wide'),
  '2099-04-13T00:00:00+08:00',
  '2099-04-14T00:00:00+08:00',
  'Maintenance'
);
insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at, status)
values (
  (select id from fmv_event_ids where label = 'event-c'),
  (select id from fmv_venue_ids where label = 'narrow'),
  'f2000000-0000-0000-0000-000000000002',
  '2099-04-20T10:00:00+08:00',
  '2099-04-20T12:00:00+08:00',
  'approved'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- Operating-hours fit is still a hard exclusion, not a tag: the narrow venue
-- (closed for part of Event A's window) is dropped from the list entirely.
select is(
  (
    select count(*)::int from public.find_matching_venues((select id from fmv_event_ids where label = 'event-a'))
    where id = (select id from fmv_venue_ids where label = 'narrow')
  ),
  0,
  'a venue closed for part of the event''s schedule is excluded, not tagged'
);
select is(
  (
    select availability_status from public.find_matching_venues((select id from fmv_event_ids where label = 'event-a'))
    where id = (select id from fmv_venue_ids where label = 'wide')
  ),
  'available',
  'a venue open for the whole event schedule reads available'
);

-- The narrow venue has a Pending booking overlapping Event B: 'pending'.
select is(
  (
    select availability_status from public.find_matching_venues((select id from fmv_event_ids where label = 'event-b'))
    where id = (select id from fmv_venue_ids where label = 'narrow')
  ),
  'pending',
  'a venue with an overlapping Pending booking reads pending'
);

-- The wide venue has a block overlapping Event B: 'blocked'.
select is(
  (
    select availability_status from public.find_matching_venues((select id from fmv_event_ids where label = 'event-b'))
    where id = (select id from fmv_venue_ids where label = 'wide')
  ),
  'blocked',
  'a venue with an overlapping block reads blocked'
);

-- The narrow venue has an Approved booking overlapping Event C: 'confirmed'.
select is(
  (
    select availability_status from public.find_matching_venues((select id from fmv_event_ids where label = 'event-c'))
    where id = (select id from fmv_venue_ids where label = 'narrow')
  ),
  'confirmed',
  'a venue with an overlapping Approved booking reads confirmed'
);

select * from finish();
rollback;
