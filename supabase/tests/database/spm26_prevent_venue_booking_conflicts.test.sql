begin;

-- SPM-26 "Prevent Venue Booking Conflicts".
-- check_venue_booking_availability.test.sql (its own newer "effective
-- window" story) already proves the booking-vs-booking overlap, the exact
-- reason message, and the exact-touch boundary case (an effective window
-- starting exactly where another one ends is not a conflict). spm24_
-- venue_booking_submission.test.sql already proves a plain booking-vs-
-- block overlap is rejected, with the current message wording. Neither
-- ever exercises the boundary case for a booking against an operational
-- block specifically -- this file covers exactly that, mirroring the
-- booking-vs-booking boundary test's style.

select plan(2);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '26000000-0000-0000-0000-000000000001',
    'spm26-organiser@example.test',
    '{"full_name":"SPM26 Organiser","role":"event_organiser"}'::jsonb
  );

reset role;
insert into public.venues (name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
values (
  'SPM26 Test Venue', 'Building 26', 50,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb,
  15, 15
);

-- An active block from 14:00 to 16:00.
insert into public.venue_unavailability (venue_id, starts_at, ends_at, reason)
select id, '2099-08-01T14:00:00+08:00'::timestamptz, '2099-08-01T16:00:00+08:00'::timestamptz, 'Maintenance'
from public.venues where name = 'SPM26 Test Venue';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm26_ids (label text primary key, id uuid);
insert into spm26_ids select 'venue-1', id from public.venues where name = 'SPM26 Test Venue';

-- Event Touch: 13:00-13:45, with 15 min setup/turnaround its effective
-- window is 12:45-14:00 -- ending exactly when the block starts.
insert into spm26_ids
select 'event-touch', public.save_event_draft(
  '{
    "title":"[SPM26] Event Touch",
    "purpose":"Boundary coverage",
    "description":"Effective window ends exactly when the block starts.",
    "expectedAttendance":"10",
    "startsAt":"2099-08-01T13:00:00+08:00",
    "endsAt":"2099-08-01T13:45:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);

-- Event Overlap: 13:00-13:46 -- one minute later, so its effective window
-- (12:46-14:01) overlaps the block's first minute.
insert into spm26_ids
select 'event-overlap', public.save_event_draft(
  '{
    "title":"[SPM26] Event Overlap",
    "purpose":"Boundary coverage",
    "description":"Effective window overlaps the block by one minute.",
    "expectedAttendance":"10",
    "startsAt":"2099-08-01T13:00:00+08:00",
    "endsAt":"2099-08-01T13:46:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);

select is(
  (
    select (public.check_venue_booking_availability(
      (select id from spm26_ids where label = 'venue-1'),
      (select id from spm26_ids where label = 'event-touch')
    ) ->> 'available')::boolean
  ),
  true,
  'AC3: an effective window ending exactly when the block starts does not conflict'
);
select is(
  (
    select (public.check_venue_booking_availability(
      (select id from spm26_ids where label = 'venue-1'),
      (select id from spm26_ids where label = 'event-overlap')
    ) ->> 'available')::boolean
  ),
  false,
  'AC2: an effective window overlapping the block by even one minute is refused'
);

select * from finish();
rollback;
