begin;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f2000000-0000-0000-0000-000000000001',
    'cvba-organiser@example.test',
    '{"full_name":"CVBA Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'f2000000-0000-0000-0000-000000000002',
    'cvba-coordinator@example.test',
    '{"full_name":"CVBA Coordinator","role":"event_coordinator"}'::jsonb
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
  '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- Room A: the AC1/AC2/AC3/AC7 worked example — 30 min setup, 45 min
-- turnaround, open all day every day (so operating hours never interferes
-- with these cases).
create temporary table cvba_venue_ids (label text primary key, id uuid);

reset role;
insert into public.venues (name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
select 'CVBA Room A', 'Building 9', 50,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"00:00","closesAt":"23:59"}]'::jsonb,
  30, 45
where not exists (select 1 from public.venues where name = 'CVBA Room A');

-- Room B: the AC6 case — operating hours exactly match an event's own time
-- (10:00-12:00), with a 30-min setup, so only the effective window (which
-- starts before opening) falls outside hours.
insert into public.venues (name, location, capacity, operating_hours, setup_time_minutes, turnaround_time_minutes)
select 'CVBA Room B', 'Building 9', 50,
  '[{"days":["mon","tue","wed","thu","fri","sat","sun"],"opensAt":"10:00","closesAt":"12:00"}]'::jsonb,
  30, 0
where not exists (select 1 from public.venues where name = 'CVBA Room B');

insert into cvba_venue_ids
  select 'room-a', id from public.venues where name = 'CVBA Room A'
  union all
  select 'room-b', id from public.venues where name = 'CVBA Room B';

set local role authenticated;

create temporary table cvba_event_ids (label text primary key, id uuid);

-- Event A: Monday 6 Apr 2099, 10:00-12:00 SGT — Room A's booking.
select lives_ok(
  $$insert into cvba_event_ids
    select 'event-a', public.save_event_draft(
      '{
        "title":"[CVBA] Event A",
        "purpose":"check_venue_booking_availability test.",
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
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-a')),
  'Event A can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-a')),
  'the Lead assigns the next available coordinator'
);

-- Event B: same Monday, 12:30-14:00 — AC2's second request.
select lives_ok(
  $$insert into cvba_event_ids
    select 'event-b', public.save_event_draft(
      '{
        "title":"[CVBA] Event B",
        "purpose":"Second test event.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-06T12:30:00+08:00",
        "endsAt":"2099-04-06T14:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event B as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-b')),
  'Event B can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-b')),
  'the Lead assigns the next available coordinator'
);

-- Event C: Monday, 13:15-14:00 — AC3's exact-touch case: with Room A's 30-min
-- setup its effective window starts at 12:45, exactly when Event A's ends.
select lives_ok(
  $$insert into cvba_event_ids
    select 'event-c', public.save_event_draft(
      '{
        "title":"[CVBA] Event C",
        "purpose":"Third test event.",
        "description":"A test event.",
        "expectedAttendance":"10",
        "startsAt":"2099-04-06T13:15:00+08:00",
        "endsAt":"2099-04-06T14:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save Event C as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-c')),
  'Event C can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-c')),
  'the Lead assigns the next available coordinator'
);

-- Event D: Monday, 10:00-12:00 — Room B's AC6 case (fits the event's own
-- time exactly, but not once the 30-min setup is applied).
select lives_ok(
  $$insert into cvba_event_ids
    select 'event-d', public.save_event_draft(
      '{
        "title":"[CVBA] Event D",
        "purpose":"Fourth test event.",
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
  'the organiser can save Event D as a draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-d')),
  'Event D can be submitted'
);
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from cvba_event_ids where label = 'event-d')),
  'the Lead assigns the next available coordinator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks good.')$$,
    (select id from cvba_event_ids where label = 'event-a')
  ),
  'Event A is approved into Planning'
);

-- AC1 + the real occupied-window effect: Event A's booking is submitted,
-- occupying 09:30-12:45 (10:00-12:00 with 30 min setup, 45 min turnaround).
create temporary table cvba_booking_ids (label text primary key, id uuid);
select lives_ok(
  $$insert into cvba_booking_ids
    select 'booking-a', public.submit_venue_booking_request(
      (select id from cvba_event_ids where label = 'event-a'),
      (select id from cvba_venue_ids where label = 'room-a')
    )$$,
  'AC1: Event A''s booking can be submitted, occupying its effective window'
);

-- AC2: Event B's own effective window (12:00-14:45, given 30 min setup /
-- 45 min turnaround) overlaps booking-a's effective window (09:30-12:45),
-- so it must be refused.
select is(
  (
    select (public.check_venue_booking_availability(
      (select id from cvba_venue_ids where label = 'room-a'),
      (select id from cvba_event_ids where label = 'event-b')
    ) ->> 'available')::boolean
  ),
  false,
  'AC2: Event B''s effective window conflicts with Event A''s'
);

-- AC7: the reason states the specific blocking effective window.
select matches(
  (
    select public.check_venue_booking_availability(
      (select id from cvba_venue_ids where label = 'room-a'),
      (select id from cvba_event_ids where label = 'event-b')
    ) ->> 'reason'
  ),
  '9:30 AM.*12:45 PM',
  'AC7: the reason states the blocking effective window (9:30 AM .. 12:45 PM)'
);

-- AC3/AC7 (touching windows): Event C's effective window starts exactly at
-- 12:45, where Event A's effective window ends — not a conflict.
select is(
  (
    select (public.check_venue_booking_availability(
      (select id from cvba_venue_ids where label = 'room-a'),
      (select id from cvba_event_ids where label = 'event-c')
    ) ->> 'available')::boolean
  ),
  true,
  'AC3: an effective window starting exactly at 12:45 does not conflict'
);

-- AC6: Event D's own time (10:00-12:00) exactly fits Room B's operating
-- hours, but its effective window (09:30-12:00, with Room B's 30-min
-- setup) starts before Room B opens — refused on operating-hours grounds,
-- not an overlap (no other booking exists at Room B).
select is(
  (
    select (public.check_venue_booking_availability(
      (select id from cvba_venue_ids where label = 'room-b'),
      (select id from cvba_event_ids where label = 'event-d')
    ) ->> 'available')::boolean
  ),
  false,
  'AC6: the whole effective window, not just the event''s own time, must fit operating hours'
);

select * from finish();
rollback;
