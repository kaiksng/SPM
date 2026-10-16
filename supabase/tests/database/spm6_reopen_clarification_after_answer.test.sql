begin;

-- SPM-6 "A coordinator can explicitly close/resolve a clarification
-- request, after which approval or rejection becomes available again."
-- event_clarifications.test.sql covers requesting, responding, explicitly
-- resolving, and reopening a new round *after* an explicit resolve.
-- event_decisions.test.sql *also* already proves the core regression
-- 202609180003_reopen_clarification_after_answer.sql fixes -- "a new round
-- can be opened while the previous one is only answered" and "opening the
-- new round implicitly resolved the answered one" -- as an incidental part
-- of its own SPM-7 fixture setup. So that mechanism is already covered;
-- this file only adds what neither of those asserts: *who* the auto-resolve
-- is attributed to, and that the new round is a genuinely distinct, freshly
-- open row rather than a reuse of the old one.

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '86000000-0000-0000-0000-000000000001',
    'spm6-organiser@example.test',
    '{"full_name":"SPM6 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '86000000-0000-0000-0000-000000000002',
    'spm6-lead@example.test',
    '{"full_name":"SPM6 Lead","role":"event_coordinator_lead"}'::jsonb
  ),
  (
    '86000000-0000-0000-0000-000000000003',
    'spm6-coordinator@example.test',
    '{"full_name":"SPM6 Coordinator","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm6_ids (label text primary key, id uuid);

insert into spm6_ids
select 'event-a', public.save_event_draft(
  '{
    "title":"[SPM6] Event A",
    "purpose":"Original purpose",
    "description":"Reopen-after-answer coverage.",
    "expectedAttendance":"40",
    "startsAt":"2099-05-01T10:00:00+08:00",
    "endsAt":"2099-05-01T12:00:00+08:00",
    "venue":{"preferredLocation":"Main Hall","facilities":[]},
    "equipment":[],
    "registration":{"required":false,"waitlistEnabled":false},
    "requirementsAcknowledged":true
  }'::jsonb
);
select public.submit_event_request((select id from spm6_ids where label = 'event-a'));

select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select public.reassign_event_coordinator((select id from spm6_ids where label = 'event-a'), '86000000-0000-0000-0000-000000000003'::uuid, null);

-- Round 1: the coordinator asks, the organiser answers -- status moves to
-- 'answered', but nobody has explicitly resolved it yet.
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
insert into spm6_ids
select 'clarification-1', (public.request_event_clarification(
  (select id from spm6_ids where label = 'event-a'),
  'What is the exact budget breakdown?',
  array['purpose']::text[]
) ->> 'id')::uuid;

select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select public.respond_event_clarification((select id from spm6_ids where label = 'clarification-1'), 'The budget breakdown is attached.');
select is(
  (select status::text from public.clarifications where id = (select id from spm6_ids where label = 'clarification-1')),
  'answered',
  'setup: round 1 is answered but not yet explicitly resolved'
);

-- The coordinator asks a second round WITHOUT resolving round 1 first
-- (setup only -- that this succeeds and auto-resolves round 1 is already
-- proven by event_decisions.test.sql).
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
insert into spm6_ids
select 'clarification-2', (public.request_event_clarification(
  (select id from spm6_ids where label = 'event-a'),
  'One more thing -- can you confirm the headcount?',
  array['expectedAttendance']::text[]
) ->> 'id')::uuid;

-- Who the auto-resolve is attributed to is the genuinely new assertion.
select is(
  (select resolved_by from public.clarifications where id = (select id from spm6_ids where label = 'clarification-1')),
  '86000000-0000-0000-0000-000000000003'::uuid,
  'SPM-6: the auto-resolve is attributed to the coordinator who asked again'
);

-- Round 2 is a genuinely new, open round -- not a reuse of round 1's row.
select isnt(
  (select id from spm6_ids where label = 'clarification-2'),
  (select id from spm6_ids where label = 'clarification-1'),
  'SPM-6: the new round is a distinct clarification row'
);
select is(
  (select status::text from public.clarifications where id = (select id from spm6_ids where label = 'clarification-2')),
  'open',
  'SPM-6: the new round starts open'
);

select * from finish();
rollback;
