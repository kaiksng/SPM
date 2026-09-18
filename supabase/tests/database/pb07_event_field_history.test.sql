begin;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '60000000-0000-0000-0000-000000000001',
    'history-organiser@example.test',
    '{"full_name":"History Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'history-coordinator-a@example.test',
    '{"full_name":"History Coordinator A","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table pb07_event_ids (id uuid);

-- A complete request, submitted while only one coordinator exists, so
-- assignment is deterministic without depending on PB-04's tie-break rule.
select lives_ok(
  $$insert into pb07_event_ids
    select public.save_event_draft(
      '{
        "title":"Original Title",
        "purpose":"Original purpose",
        "description":"A test event for change history.",
        "expectedAttendance":"80",
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
  format($$select public.submit_event_request(%L::uuid)$$, (select id from pb07_event_ids)),
  'the event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from pb07_event_ids)),
  '60000000-0000-0000-0000-000000000002'::uuid,
  'the only coordinator is assigned'
);

-- A second coordinator, added after assignment, is never accountable for
-- this event and so is not "authorised" for it (mirrors AC08 in
-- event_clarifications.test.sql).
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  '60000000-0000-0000-0000-000000000003',
  'history-coordinator-b@example.test',
  '{"full_name":"History Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;

-- AC02: the organiser edits several fields across events, venue and
-- registration in one save — this should log one row per changed field,
-- attributed to the organiser, in the order save_event_draft touches them.
select lives_ok(
  format(
    $$select public.save_event_draft(
      '{
        "title":"Updated Title",
        "purpose":"Original purpose",
        "description":"A test event for change history.",
        "expectedAttendance":"120",
        "startsAt":"2099-04-01T10:00:00+08:00",
        "endsAt":"2099-04-01T12:00:00+08:00",
        "venue":{"preferredLocation":"Auditorium","facilities":[]},
        "equipment":[],
        "registration":{"required":true,"capacity":"100","waitlistEnabled":false},
        "requirementsAcknowledged":true
      }'::jsonb,
      %L::uuid
    )$$,
    (select id from pb07_event_ids)
  ),
  'the organiser can edit permitted fields while Requested'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- AC01/AC02: the assigned coordinator sees every logged change, in sequence.
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pb07_event_ids)
  ),
  5,
  'AC02: one row is logged per changed field (title, attendance, venue, registration required and capacity)'
);
select results_eq(
  format(
    $$select field_name from public.event_field_changes
      where event_id = %L::uuid order by changed_at asc, id asc$$,
    (select id from pb07_event_ids)
  ),
  array[
    'title', 'expectedAttendance', 'venue.preferredLocation',
    'registration.required', 'registration.capacity'
  ],
  'AC02: changes are reported in the order they were made'
);
select is(
  (
    select row(previous_value, new_value, changed_by)
    from public.event_field_changes
    where event_id = (select id from pb07_event_ids) and field_name = 'title'
  ),
  row('Original Title'::text, 'Updated Title'::text, '60000000-0000-0000-0000-000000000001'::uuid),
  'AC02: the title change records its previous value, new value, and actor'
);
select is(
  (
    select row(previous_value, new_value)
    from public.event_field_changes
    where event_id = (select id from pb07_event_ids) and field_name = 'registration.required'
  ),
  row('false'::text, 'true'::text),
  'a boolean field change is recorded as text'
);

-- AC01: still visible once the event reaches Planning.
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from pb07_event_ids)
  ),
  'the assigned coordinator can approve the now-complete request'
);
select is(
  (select status::text from public.events where id = (select id from pb07_event_ids)),
  'planning',
  'the event has moved to Planning'
);
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pb07_event_ids)
  ),
  5,
  'AC01: the change history remains visible once the event is Planning'
);

-- AC03/AC04: an unassigned coordinator is not "authorised" for this event —
-- RLS filters the rows rather than raising, same as event_status_history.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pb07_event_ids)
  ),
  0,
  'AC03/AC04: a coordinator not assigned to the event sees no change history'
);

-- 202609150005: the organiser can now read their own event's change history
-- too (added so ClarificationPanel can name the exact field(s) they edited
-- on both sides of a clarification round) — narrower than "authorised
-- coordinator" in that it is scoped to their own event specifically, not any
-- event they merely have organiser-role visibility into.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select ok(
  public.can_view_event((select id from pb07_event_ids)),
  'sanity check: the organiser can still view the event itself'
);
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pb07_event_ids)
  ),
  5,
  '202609150005: the organiser can view the change history for their own event'
);

-- 202609150005 is scoped to the event's own organiser, not organisers in
-- general — a different organiser with no relationship to this event sees
-- nothing.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  '60000000-0000-0000-0000-000000000004',
  'history-other-organiser@example.test',
  '{"full_name":"Other Organiser","role":"event_organiser"}'::jsonb
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.event_field_changes
    where event_id = (select id from pb07_event_ids)
  ),
  0,
  '202609150005: an unrelated organiser still sees no change history'
);

select * from finish();
rollback;
