begin;

-- Week 7 change #5 supersedes PB-04: submission no longer auto-assigns a
-- coordinator (see pb03_submit_event_request.test.sql for that assertion).
-- This file now covers the Event Coordinator Lead assigning and
-- reassigning a coordinator via reassign_event_coordinator.

select plan(11);

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
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    'pb04-lead@example.test',
    '{"full_name":"PB04 Lead","role":"event_coordinator_lead"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb04_event_ids (label text primary key, id uuid);

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
  'the event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-1')),
  null::uuid,
  'the submitted event starts unassigned, waiting in the Lead''s queue'
);

-- Only the Lead may assign; not the organiser, not a plain coordinator.
select throws_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40000000-0000-0000-0000-000000000002'::uuid, '')$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  '42501',
  'Only the Event Coordinator Lead can assign or reassign an event',
  'an organiser cannot assign a coordinator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

-- The Lead's first assignment needs no reason — there is no predecessor to
-- justify taking the event from.
select lives_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40000000-0000-0000-0000-000000000002'::uuid, '')$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  'the Lead can assign a coordinator with no reason given'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-1')),
  '40000000-0000-0000-0000-000000000002'::uuid,
  'the event is now assigned to coordinator A'
);

-- Reassigning away from someone does require a reason.
select throws_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40000000-0000-0000-0000-000000000003'::uuid, '')$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  '23514',
  'Explain why this event is being reassigned',
  'reassigning an already-assigned event requires a reason'
);
select lives_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40000000-0000-0000-0000-000000000003'::uuid, 'Coordinator A is on leave')$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  'the Lead can reassign to a different coordinator with a reason'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb04_event_ids where label = 'event-1')),
  '40000000-0000-0000-0000-000000000003'::uuid,
  'the event is now assigned to coordinator B'
);

-- Notifications are only visible to their own recipient (RLS), so briefly
-- switch to coordinator B to check it.
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '40000000-0000-0000-0000-000000000003'
      and event_id = (select id from pb04_event_ids where label = 'event-1')
      and type = 'assignment'
  ),
  1,
  'the newly assigned coordinator receives one assignment notification'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

-- An event can only be assigned to an Event Coordinator, not any other role.
select throws_ok(
  format(
    $$select public.reassign_event_coordinator(%L::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'Testing an invalid target')$$,
    (select id from pb04_event_ids where label = 'event-1')
  ),
  '23514',
  'An event can only be assigned to an Event Coordinator',
  'an event cannot be assigned to a non-coordinator'
);

select * from finish();
rollback;
