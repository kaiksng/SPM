begin;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd0000000-0000-0000-0000-000000000001',
    'spm09-organiser@example.test',
    '{"full_name":"SPM09 Organiser","role":"event_organiser"}'::jsonb
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'spm09-coordinator-a@example.test',
    '{"full_name":"SPM09 Coordinator A","role":"event_coordinator"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table spm09_event_ids (id uuid);

-- A single coordinator exists at submission, so assignment is deterministic.
select lives_ok(
  $$insert into spm09_event_ids
    select public.save_event_draft(
      '{
        "title":"[SPM09 Test] Event",
        "purpose":"Original purpose",
        "description":"A test event for SPM-09 history access.",
        "expectedAttendance":"40",
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
  format($$select public.submit_event_request(%L::uuid)$$, (select id from spm09_event_ids)),
  'the event can be submitted'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from spm09_event_ids)),
  'd0000000-0000-0000-0000-000000000002'::uuid,
  'the only coordinator is assigned'
);

-- AC02/AC03: the assigned coordinator sees the lifecycle history.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select ok(
  (
    select count(*)::integer from public.event_status_history
    where event_id = (select id from spm09_event_ids)
  ) > 0,
  'the assigned coordinator sees the event''s lifecycle history'
);

-- AC02: a coordinator who is never assigned to this event (event_status_history's
-- own policy, narrowed by 202609190001) sees none of its lifecycle history —
-- RLS filters the rows silently, the same way event_field_changes already
-- does for an unassigned coordinator (pb07_event_field_history.test.sql).
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  'd0000000-0000-0000-0000-000000000003',
  'spm09-coordinator-b@example.test',
  '{"full_name":"SPM09 Coordinator B","role":"event_coordinator"}'::jsonb
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer from public.event_status_history
    where event_id = (select id from spm09_event_ids)
  ),
  0,
  'AC02: a coordinator not assigned to the event sees no lifecycle history'
);

-- The organiser is unaffected by this narrowing.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select ok(
  (
    select count(*)::integer from public.event_status_history
    where event_id = (select id from spm09_event_ids)
  ) > 0,
  'the organiser still sees the event''s lifecycle history'
);

select * from finish();
rollback;
