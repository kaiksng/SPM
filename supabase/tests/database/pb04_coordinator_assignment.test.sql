begin;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'pb04-owner@example.test',
    '{"full_name":"PB04 Owner","role":"event_organiser"}'::jsonb
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'pb04-coordinator-a@example.test',
    '{"full_name":"PB04 Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'pb04-coordinator-b@example.test',
    '{"full_name":"PB04 Coordinator B","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb04_event_ids (label text primary key, id uuid);

-- Two coordinators start with equal load: the lower id wins the tie-break.
select lives_ok(
  $$insert into pb04_event_ids
    select 'event-1', public.save_event_draft(
      '{
        "title":"[PB04 Test] Event One",
        "purpose":"Welcome new students",
        "description":"A briefing for the incoming cohort.",
        "expectedAttendance":"120",
        "startsAt":"2099-01-01T10:00:00+08:00",
        "endsAt":"2099-01-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Seminar Room","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb04_event_ids where label = 'event-1')),
  'the first event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-1')),
  '40000000-0000-0000-0000-000000000002'::uuid,
  'the first event is assigned to the lower-id coordinator on a tie'
);
-- Notifications are only visible to their own recipient (RLS), so briefly
-- switch to the assigned coordinator to check it, then back to the organiser.
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '40000000-0000-0000-0000-000000000002'
      and event_id = (select id from pb04_event_ids where label = 'event-1')
      and type = 'assignment'
  ),
  1,
  'the assigned coordinator receives one assignment notification'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- Coordinator A now has one active event; coordinator B is least loaded next.
select lives_ok(
  $$insert into pb04_event_ids
    select 'event-2', public.save_event_draft(
      '{
        "title":"[PB04 Test] Event Two",
        "purpose":"Welcome new students",
        "description":"A briefing for the incoming cohort.",
        "expectedAttendance":"80",
        "startsAt":"2099-02-01T10:00:00+08:00",
        "endsAt":"2099-02-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Seminar Room","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a second complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb04_event_ids where label = 'event-2')),
  'the second event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-2')),
  '40000000-0000-0000-0000-000000000003'::uuid,
  'the second event is assigned to the now-least-loaded coordinator'
);

-- AC05/AC03: the assignment cannot be changed, even by the assigned coordinator.
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$update public.events set assigned_coordinator_id = '40000000-0000-0000-0000-000000000003'::uuid where id = %L::uuid$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  '42501',
  'An event''s assigned coordinator cannot be changed',
  'the assigned coordinator cannot reassign the event to someone else'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-1')),
  '40000000-0000-0000-0000-000000000002'::uuid,
  'the failed reassignment attempt left the original assignment unchanged'
);

-- assign_event_coordinator is an internal step of submission, not a public
-- RPC: it's revoked from authenticated (202609180001), so Postgres itself
-- rejects a direct call before the function body ever runs.
select throws_ok(
  $$select public.assign_event_coordinator((select id from pb04_event_ids where label = 'event-1'))$$,
  '42501',
  'permission denied for function assign_event_coordinator',
  'an authenticated user cannot call assign_event_coordinator directly'
);

-- AC01: when no coordinator is available, submission fails and the event is
-- left exactly as it was — never partially transitioned.
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pb04_event_ids
    select 'event-3', public.save_event_draft(
      '{
        "title":"[PB04 Test] Event Three",
        "purpose":"Welcome new students",
        "description":"A briefing for the incoming cohort.",
        "expectedAttendance":"60",
        "startsAt":"2099-03-01T10:00:00+08:00",
        "endsAt":"2099-03-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Seminar Room","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a third complete draft'
);

reset role;
update public.profiles set role = 'attendee' where role = 'event_coordinator';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb04_event_ids where label = 'event-3')),
  '23514',
  'No Event Coordinator is available to take this request',
  'submission fails when no coordinator is available'
);
select is(
  (select status::text from public.events where id = (select id from pb04_event_ids where label = 'event-3')),
  'draft',
  'a failed assignment leaves the event as a Draft, not partially Requested'
);

select * from finish();
rollback;
