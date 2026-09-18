begin;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'clarify-organiser@example.test',
    '{"full_name":"Clarify Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'clarify-coordinator-a@example.test',
    '{"full_name":"Clarify Coordinator A","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb05_event_ids (id uuid);
create temporary table pb05_clarification_ids (label text primary key, id uuid);

-- A complete request, submitted while only one coordinator exists, so
-- assignment is deterministic without depending on PB-04's tie-break rule.
select lives_ok(
  $$insert into pb05_event_ids
    select public.save_event_draft(
      '{
        "title":"[Clarification Test] Event",
        "purpose":"Original purpose",
        "description":"A test event needing clarification.",
        "expectedAttendance":"50",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb
    )$$,
  'the organiser can save a complete draft'
);
select lives_ok(
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb05_event_ids)),
  'the event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb05_event_ids)),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'the only coordinator is assigned'
);

-- A second coordinator, added after assignment, is never accountable for
-- this event and so is not "authorised" for it (AC08).
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  '50000000-0000-0000-0000-000000000003',
  'clarify-coordinator-b@example.test',
  '{"full_name":"Clarify Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format($$select public.request_event_clarification(%L::uuid, 'Why is this needed?', array[]::text[])$$, (select id from pb05_event_ids)),
  '42501',
  'Only the assigned coordinator can request clarification for this event',
  'AC08: a coordinator not assigned to the event cannot request clarification'
);

-- AC01/AC08: the assigned coordinator opens round 1, permitting only purpose.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$insert into pb05_clarification_ids
      select 'round-1', (public.request_event_clarification(
        %L::uuid,
        'What is the exact budget breakdown?',
        array['purpose']::text[]
      ) ->> 'id')::uuid$$,
    (select id from pb05_event_ids)
  ),
  'AC01: the assigned coordinator can request clarification'
);
select is(
  (select status::text from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  'open',
  'the new clarification starts open'
);
select is(
  (select requested_by from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'AC01: the requesting coordinator is recorded'
);
select is(
  (select permitted_fields from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  array['purpose'],
  'the permitted fields are recorded'
);
-- Notifications are only visible to their own recipient (RLS), so briefly
-- switch to the organiser to check it, then back to the assigned coordinator.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '50000000-0000-0000-0000-000000000001'
      and event_id = (select id from pb05_event_ids)
      and type = 'clarification'
  ),
  1,
  'AC04-adjacent: the organiser is notified of the request'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- Only one clarification may be open per event at a time.
select throws_ok(
  format($$select public.request_event_clarification(%L::uuid, 'A second question', array[]::text[])$$, (select id from pb05_event_ids)),
  '23514',
  'A clarification is already open for this event',
  'a second clarification cannot be opened while one is unresolved'
);

-- AC03: the organiser cannot change a field outside round 1's permitted set.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Clarification Test] Event (edited)",
        "purpose":"Original purpose",
        "description":"A test event needing clarification.",
        "expectedAttendance":"50",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb05_event_ids)
  ),
  '23514',
  'Event name is locked while a clarification is open',
  'AC03: a field outside the permitted set cannot be changed'
);

-- AC03: the permitted field can still be changed.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"[Clarification Test] Event",
        "purpose":"Updated purpose with the budget breakdown",
        "description":"A test event needing clarification.",
        "expectedAttendance":"50",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Main Hall","facilities":[]},
        "equipment":[],
        "registration":{"required":false,"waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb05_event_ids)
  ),
  'AC03: a permitted field can be changed while clarification is open'
);
select is(
  (select purpose from public.events where id = (select id from pb05_event_ids)),
  'Updated purpose with the budget breakdown',
  'the permitted change was applied'
);

-- Only the organiser may respond.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'This is my answer')$$,
    (select id from pb05_clarification_ids where label = 'round-1')
  ),
  '42501',
  'Only the event organiser can respond to this clarification',
  'a coordinator cannot respond on the organiser''s behalf'
);

-- AC04: the organiser responds.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'The budget breakdown is attached to the description.')$$,
    (select id from pb05_clarification_ids where label = 'round-1')
  ),
  'AC04: the organiser can respond while the clarification is open'
);
select is(
  (select status::text from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  'answered',
  'AC04: the clarification moves to answered'
);
select is(
  (select responded_by from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  '50000000-0000-0000-0000-000000000001'::uuid,
  'AC04: the responding actor is recorded'
);
select isnt(
  (select responded_at from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  null,
  'AC04: the response timestamp is recorded'
);
-- Notifications are only visible to their own recipient (RLS), so briefly
-- switch to the coordinator to check it, then back to the organiser.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.notifications
    where recipient_id = '50000000-0000-0000-0000-000000000002'
      and event_id = (select id from pb05_event_ids)
      and type = 'clarification'
  ),
  1,
  'AC04: the requesting coordinator is notified of the response'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- A clarification that is no longer open cannot be answered again.
select throws_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'A second answer')$$,
    (select id from pb05_clarification_ids where label = 'round-1')
  ),
  '23514',
  'This clarification is not awaiting a response',
  'a clarification cannot be answered twice'
);

-- AC05: a decision is blocked while a clarification is unresolved (answered
-- counts as unresolved), even though the status transition itself is valid.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format($$update public.events set status = 'planning' where id = %L::uuid$$, (select id from pb05_event_ids)),
  '23514',
  'This event has an unresolved clarification and cannot be approved or rejected until it is closed',
  'AC05: approval is blocked while the clarification is unresolved'
);

-- Only the assigned coordinator may resolve.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.resolve_event_clarification(%L::uuid)$$,
    (select id from pb05_clarification_ids where label = 'round-1')
  ),
  '42501',
  'Only the assigned coordinator can resolve this clarification',
  'a coordinator not assigned to the event cannot resolve its clarification'
);

-- AC06: the assigned coordinator closes round 1.
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.resolve_event_clarification(%L::uuid)$$,
    (select id from pb05_clarification_ids where label = 'round-1')
  ),
  'AC06: the assigned coordinator can resolve the clarification'
);
select is(
  (select status::text from public.clarifications where id = (select id from pb05_clarification_ids where label = 'round-1')),
  'resolved',
  'AC06: the clarification is now resolved'
);

-- AC07: a second round is possible once the first is resolved, and both
-- rounds remain visible in sequence.
select lives_ok(
  format(
    $$insert into pb05_clarification_ids
      select 'round-2', (public.request_event_clarification(
        %L::uuid,
        'One more thing — can you confirm the headcount?',
        array['expectedAttendance']::text[]
      ) ->> 'id')::uuid$$,
    (select id from pb05_event_ids)
  ),
  'a new round can be opened once the previous one is resolved'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.respond_event_clarification(%L::uuid, 'Confirmed at 50 attendees.')$$,
    (select id from pb05_clarification_ids where label = 'round-2')
  ),
  'the organiser can respond to the second round'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.resolve_event_clarification(%L::uuid)$$,
    (select id from pb05_clarification_ids where label = 'round-2')
  ),
  'the coordinator can resolve the second round'
);
select is(
  (select count(*)::integer from public.clarifications where event_id = (select id from pb05_event_ids)),
  2,
  'AC07: both rounds are recorded against the event'
);
select is(
  (
    select array_agg(question order by requested_at)
    from public.clarifications
    where event_id = (select id from pb05_event_ids)
  ),
  array['What is the exact budget breakdown?', 'One more thing — can you confirm the headcount?'],
  'AC07: rounds are viewable in sequence by request time'
);

-- AC06: with every clarification resolved, a decision is no longer blocked.
select lives_ok(
  format($$update public.events set status = 'planning' where id = %L::uuid$$, (select id from pb05_event_ids)),
  'AC06: approval succeeds once every clarification is resolved'
);

select * from finish();
rollback;
