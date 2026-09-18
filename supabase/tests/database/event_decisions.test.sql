begin;

select plan(32);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '60000000-0000-0000-0000-000000000001',
    'decide-organiser@example.test',
    '{"full_name":"Decide Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'decide-coordinator-a@example.test',
    '{"full_name":"Decide Coordinator A","role":"event_coordinator"}'::jsonb
  );

-- Switches request.jwt.claims to whichever coordinator assign_event_coordinator
-- actually picked for a given event, so later tests don't have to hand-track
-- least-loaded tie-breaks across an increasingly long scenario.
create or replace function pg_temp.act_as_assigned_coordinator(p_label text)
returns void
language plpgsql
as $$
declare
  target_coordinator uuid;
begin
  select assigned_coordinator_id into target_coordinator
  from public.events
  where id = (select id from pb06_event_ids where label = p_label);

  perform set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', target_coordinator),
    true
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb06_event_ids (label text primary key, id uuid);
create temporary table pb06_clarification_ids (label text primary key, id uuid);

select lives_ok(
  $$insert into pb06_event_ids
    select 'event-1', public.save_event_draft(
      '{
        "title":"[Decision Test] Event",
        "purpose":"Original purpose",
        "description":"A test event for decisions.",
        "expectedAttendance":"50",
        "startsAt":"2099-05-01T10:00:00+08:00",
        "endsAt":"2099-05-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb06_event_ids where label = 'event-1')),
  'the event can be submitted'
);

-- A second coordinator, never assigned to event-1 (it existed alone at
-- event-1's submission, so assignment was deterministic).
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  '60000000-0000-0000-0000-000000000003',
  'decide-coordinator-b@example.test',
  '{"full_name":"Decide Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;

-- Only the assigned coordinator may decide.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks fine.')$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  '42501',
  'Only the assigned coordinator can decide this event request',
  'a coordinator not assigned to the event cannot decide it'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- AC03: only rejection requires a reason.
select throws_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'rejected'::public.event_decision_type, '   ')$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  '23514',
  'Explain the reason for rejecting this event',
  'rejecting requires a non-blank rationale'
);

-- AC01: the assigned coordinator opens a clarification.
select lives_ok(
  format(
    $$insert into pb06_clarification_ids
      select 'round-1', (public.request_event_clarification(
        %L::uuid,
        'Can you confirm the headcount?',
        array['expectedAttendance']::text[]
      ) ->> 'id')::uuid$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  'the assigned coordinator can request clarification'
);

-- AC01: a decision is blocked while the clarification is open (unanswered).
select throws_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks fine.')$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  '23514',
  'This event has an unresolved clarification and cannot be approved or rejected until it is closed',
  'a decision is blocked while a clarification is open'
);

-- The organiser responds.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'Confirmed at 50 attendees.')$$,
    (select id from pb06_clarification_ids where label = 'round-1')
  ),
  'the organiser can respond'
);

-- AC02/AC06: approval succeeds once the clarification is answered, and moves
-- the event to Planning (not "approved").
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Confirmed and ready to proceed.')$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  'a decision succeeds once the clarification is answered'
);
select is(
  (select status::text from public.events where id = (select id from pb06_event_ids where label = 'event-1')),
  'planning',
  'AC02: approval moves the event to Planning'
);
select is(
  (select status::text from public.clarifications where id = (select id from pb06_clarification_ids where label = 'round-1')),
  'resolved',
  'deciding implicitly resolves the answered clarification'
);
select is(
  (select decided_by from public.event_decisions where event_id = (select id from pb06_event_ids where label = 'event-1')),
  '60000000-0000-0000-0000-000000000002'::uuid,
  'AC05: the deciding coordinator is recorded'
);
select is(
  (select rationale from public.event_decisions where event_id = (select id from pb06_event_ids where label = 'event-1')),
  'Confirmed and ready to proceed.',
  'AC05: the rationale is recorded'
);
-- Notifications are only visible to their own recipient (RLS), so briefly
-- switch to the organiser to check it, then back to the deciding coordinator.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '60000000-0000-0000-0000-000000000001'
      and event_id = (select id from pb06_event_ids where label = 'event-1')
      and type = 'decision'
  ),
  1,
  'AC06: the organiser is notified of the decision'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- A decided event cannot be decided again.
select throws_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'rejected'::public.event_decision_type, 'Changed my mind.')$$,
    (select id from pb06_event_ids where label = 'event-1')
  ),
  '23514',
  'Only a Requested event can be approved or rejected',
  'an already-decided event cannot be decided again'
);

-- event-3: AC03 — approval itself does not require a rationale.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pb06_event_ids
    select 'event-3', public.save_event_draft(
      '{
        "title":"[Decision Test] Event Three",
        "purpose":"Original purpose",
        "description":"A third test event.",
        "expectedAttendance":"30",
        "startsAt":"2099-07-01T10:00:00+08:00",
        "endsAt":"2099-07-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a third complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb06_event_ids where label = 'event-3')),
  'the third event can be submitted'
);
select pg_temp.act_as_assigned_coordinator('event-3');
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, '')$$,
    (select id from pb06_event_ids where label = 'event-3')
  ),
  'AC03: approval succeeds with a blank rationale'
);
select is(
  (select status::text from public.events where id = (select id from pb06_event_ids where label = 'event-3')),
  'planning',
  'the third event moves to Planning without a rationale'
);
select is(
  (select rationale from public.event_decisions where event_id = (select id from pb06_event_ids where label = 'event-3')),
  null::text,
  'AC05: no rationale is recorded for an approval that supplied none'
);

-- event-4: AC01 — approval also requires the event to still be complete.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pb06_event_ids
    select 'event-4', public.save_event_draft(
      '{
        "title":"[Decision Test] Event Four",
        "purpose":"Original purpose",
        "description":"A fourth test event.",
        "expectedAttendance":"40",
        "startsAt":"2099-08-01T10:00:00+08:00",
        "endsAt":"2099-08-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a fourth complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb06_event_ids where label = 'event-4')),
  'the fourth event can be submitted'
);
-- No clarification involved: the organiser can freely edit a Requested event
-- (PB-03 AC07) and here blanks out purpose, leaving the event incomplete.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Decision Test] Event Four",
        "purpose":"",
        "description":"A fourth test event.",
        "expectedAttendance":"40",
        "startsAt":"2099-08-01T10:00:00+08:00",
        "endsAt":"2099-08-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb06_event_ids where label = 'event-4')
  ),
  'the organiser can blank out purpose on a Requested event'
);
select pg_temp.act_as_assigned_coordinator('event-4');
select throws_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, '')$$,
    (select id from pb06_event_ids where label = 'event-4')
  ),
  '23514',
  'This event does not have enough information to approve',
  'AC01: approval is blocked when the event is no longer complete'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Decision Test] Event Four",
        "purpose":"Restored purpose",
        "description":"A fourth test event.",
        "expectedAttendance":"40",
        "startsAt":"2099-08-01T10:00:00+08:00",
        "endsAt":"2099-08-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb06_event_ids where label = 'event-4')
  ),
  'the organiser restores the missing purpose'
);
select pg_temp.act_as_assigned_coordinator('event-4');
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, '')$$,
    (select id from pb06_event_ids where label = 'event-4')
  ),
  'approval succeeds once the event is complete again'
);
select is(
  (select status::text from public.events where id = (select id from pb06_event_ids where label = 'event-4')),
  'planning',
  'the fourth event moves to Planning'
);

-- event-2: opening a new clarification round while the previous one is only
-- answered (not yet resolved) auto-resolves the old one. Uses the dynamic
-- coordinator lookup since, by this point in the scenario, load balancing no
-- longer deterministically picks coordinator A.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into pb06_event_ids
    select 'event-2', public.save_event_draft(
      '{
        "title":"[Decision Test] Event Two",
        "purpose":"Original purpose",
        "description":"A second test event.",
        "expectedAttendance":"20",
        "startsAt":"2099-06-01T10:00:00+08:00",
        "endsAt":"2099-06-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a second complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb06_event_ids where label = 'event-2')),
  'the second event can be submitted'
);

select pg_temp.act_as_assigned_coordinator('event-2');
select lives_ok(
  format(
    $$insert into pb06_clarification_ids
      select 'round-2', (public.request_event_clarification(
        %L::uuid, 'First question', array[]::text[]
      ) ->> 'id')::uuid$$,
    (select id from pb06_event_ids where label = 'event-2')
  ),
  'a first round can be opened on the second event'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'First answer.')$$,
    (select id from pb06_clarification_ids where label = 'round-2')
  ),
  'the organiser answers the first round'
);
select pg_temp.act_as_assigned_coordinator('event-2');
select lives_ok(
  format(
    $$insert into pb06_clarification_ids
      select 'round-3', (public.request_event_clarification(
        %L::uuid, 'Second question', array[]::text[]
      ) ->> 'id')::uuid$$,
    (select id from pb06_event_ids where label = 'event-2')
  ),
  'a new round can be opened while the previous one is only answered'
);
select is(
  (select status::text from public.clarifications where id = (select id from pb06_clarification_ids where label = 'round-2')),
  'resolved',
  'opening the new round implicitly resolved the answered one'
);

select * from finish();
rollback;
