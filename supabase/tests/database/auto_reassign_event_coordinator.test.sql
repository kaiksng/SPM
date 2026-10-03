begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'pbreassign-owner@example.test',
    '{"full_name":"PB Reassign Owner","role":"event_organiser"}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'pbreassign-coordinator-a@example.test',
    '{"full_name":"PB Reassign Coordinator A","role":"event_coordinator"}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'pbreassign-coordinator-b@example.test',
    '{"full_name":"PB Reassign Coordinator B","role":"event_coordinator"}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    'pbreassign-coordinator-c@example.test',
    '{"full_name":"PB Reassign Coordinator C","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pbreassign_event_ids (label text primary key, id uuid);

-- Three events, submitted in order, so A, B, C each end up with one active
-- event (A:event-1, B:event-2, C:event-3), via the existing least-loaded
-- initial-assignment rule.
select lives_ok(
  $$insert into pbreassign_event_ids
    select 'event-1', public.save_event_draft(
      '{
        "title":"[PB Reassign Test] Event One",
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
  'the organiser can save the first complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pbreassign_event_ids where label = 'event-1')),
  'the first event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-1')),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'the first event is assigned to coordinator A on a tie'
);

select lives_ok(
  $$insert into pbreassign_event_ids
    select 'event-2', public.save_event_draft(
      '{
        "title":"[PB Reassign Test] Event Two",
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
  'the organiser can save the second complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pbreassign_event_ids where label = 'event-2')),
  'the second event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-2')),
  '50000000-0000-0000-0000-000000000003'::uuid,
  'the second event is assigned to coordinator B, the now-least-loaded'
);

select lives_ok(
  $$insert into pbreassign_event_ids
    select 'event-3', public.save_event_draft(
      '{
        "title":"[PB Reassign Test] Event Three",
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
  'the organiser can save the third complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pbreassign_event_ids where label = 'event-3')),
  'the third event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-3')),
  '50000000-0000-0000-0000-000000000004'::uuid,
  'the third event is assigned to coordinator C, the now-least-loaded'
);

-- Only the currently assigned coordinator (A, on event-1) may reassign it.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, 'Not my event')$$,
    (select id from pbreassign_event_ids where label = 'event-1')
  ),
  '42501',
  'Only the assigned coordinator can reassign this event',
  'a different coordinator cannot reassign an event they are not assigned to'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-1')),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'the failed reassignment attempt by another coordinator left the assignment unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, 'I am the organiser')$$,
    (select id from pbreassign_event_ids where label = 'event-1')
  ),
  '42501',
  'Only the assigned coordinator can reassign this event',
  'the organiser cannot reassign an event'
);

-- Only coordinator A (assigned to event-1) can reassign it, and must give a reason.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, '')$$,
    (select id from pbreassign_event_ids where label = 'event-1')
  ),
  '23514',
  'Explain why this event needs to be reassigned',
  'reassignment requires a non-blank reason'
);

-- Happy path: A hands event-1 off. Candidates are B (event-2) and C
-- (event-3), tied at one active event each, so the lower id (B) wins — and A
-- itself, even though excluded from the pool, must never be reselected.
select lives_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, 'Going on leave')$$,
    (select id from pbreassign_event_ids where label = 'event-1')
  ),
  'the assigned coordinator can reassign their event with a reason'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-1')),
  '50000000-0000-0000-0000-000000000003'::uuid,
  'the event is reassigned to coordinator B, the least-loaded of the others'
);
select isnt(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-1')),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'the outgoing coordinator A is never reselected'
);

-- audit_logs has RLS enabled with no policies at all, so only a role that
-- bypasses RLS (the table owner, i.e. outside "authenticated") can read it.
reset role;
select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_type = 'event'
      and entity_id = (select id from pbreassign_event_ids where label = 'event-1')
      and action = 'event_coordinator_reassigned'
      and actor_id = '50000000-0000-0000-0000-000000000002'
      and details->>'previousCoordinatorId' = '50000000-0000-0000-0000-000000000002'
      and details->>'newCoordinatorId' = '50000000-0000-0000-0000-000000000003'
      and details->>'reason' = 'Going on leave'
  ),
  1,
  'an audit log row records the reassignment with previous/new coordinator and reason'
);
set local role authenticated;

-- list_auto_event_coordinator_reassignments is the only read path for the
-- audit trail (audit_logs itself has no SELECT policy); visible to anyone
-- who can view the event, including the organiser.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer
    from public.list_auto_event_coordinator_reassignments(
      (select id from pbreassign_event_ids where label = 'event-1')
    )
  ),
  1,
  'the organiser can read the reassignment history for their event'
);
select is(
  (
    select reason
    from public.list_auto_event_coordinator_reassignments(
      (select id from pbreassign_event_ids where label = 'event-1')
    )
  ),
  'Going on leave',
  'the reassignment history includes the reason'
);
select is(
  (
    select new_coordinator_name
    from public.list_auto_event_coordinator_reassignments(
      (select id from pbreassign_event_ids where label = 'event-1')
    )
  ),
  'PB Reassign Coordinator B',
  'the reassignment history includes the new coordinator''s name'
);

-- Notifications are only visible to their own recipient (RLS).
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '50000000-0000-0000-0000-000000000003'
      and event_id = (select id from pbreassign_event_ids where label = 'event-1')
      and type = 'assignment'
  ),
  1,
  'the new coordinator receives an assignment notification'
);

-- The trigger still blocks any direct, uncontrolled change.
select throws_ok(
  format(
    $$update public.events set assigned_coordinator_id = '50000000-0000-0000-0000-000000000004'::uuid where id = %L::uuid$$,
    (select id from pbreassign_event_ids where label = 'event-1')
  ),
  '42501',
  'An event''s assigned coordinator cannot be changed',
  'a direct update of assigned_coordinator_id is still blocked outside the RPC'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-1')),
  '50000000-0000-0000-0000-000000000003'::uuid,
  'the failed direct update left the assignment unchanged'
);

-- A terminal-status event cannot be reassigned.
reset role;
update public.events set status = 'cancelled' where id = (select id from pbreassign_event_ids where label = 'event-3');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, 'Trying anyway')$$,
    (select id from pbreassign_event_ids where label = 'event-3')
  ),
  '23514',
  'This event cannot be reassigned in its current status',
  'a cancelled event cannot be reassigned'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-3')),
  '50000000-0000-0000-0000-000000000004'::uuid,
  'the cancelled event''s assignment is left unchanged'
);

-- When no other coordinator is available, reassignment fails and the event
-- is left exactly as it was.
reset role;
update public.profiles
set role = 'attendee'
where id in ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.auto_reassign_event_coordinator(%L::uuid, 'Nobody else is left')$$,
    (select id from pbreassign_event_ids where label = 'event-2')
  ),
  '23514',
  'No other Event Coordinator is available to take this event',
  'reassignment fails when no other coordinator is available'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pbreassign_event_ids where label = 'event-2')),
  '50000000-0000-0000-0000-000000000003'::uuid,
  'a failed reassignment for lack of coordinators leaves the event unchanged'
);

select * from finish();
rollback;
