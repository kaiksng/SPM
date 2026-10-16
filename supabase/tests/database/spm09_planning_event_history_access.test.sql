begin;

select plan(14);

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
select lives_ok(
  format($$select pg_temp.lead_assigns_coordinator(%L::uuid)$$, (select id from spm09_event_ids)),
  'the Lead assigns the next available coordinator'
);
select is(
  (select assigned_coordinator_id from public.events where id = (select id from spm09_event_ids)),
  'd0000000-0000-0000-0000-000000000002'::uuid,
  'the only coordinator is assigned'
);

-- Some history of every kind to read: approve into Planning, then change a
-- venue field and add equipment.
reset role;
insert into public.equipment_items (name, category, code, total_quantity)
values ('SPM09 Speaker', 'Audio', 'spm09-speaker', 2);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format(
    $$select public.decide_event_request(%L::uuid, 'approved'::public.event_decision_type, 'Looks ready.')$$,
    (select id from spm09_event_ids)
  ),
  'the assigned coordinator approves the event into Planning'
);
select lives_ok(
  format(
    $$select public.update_event_as_coordinator(%L::uuid, jsonb_set(%s::jsonb, '{equipment}', jsonb_build_array(jsonb_build_object(
      'id', null, 'equipmentItemId', (select id from public.equipment_items where code = 'spm09-speaker'),
      'quantity', '1', 'requiredFrom', '2099-04-01T10:00:00+08:00', 'requiredUntil', '2099-04-01T12:00:00+08:00', 'notes', null))))$$,
    (select id from spm09_event_ids),
    quote_literal('{"title":"[SPM09 Test] Event","purpose":"Original purpose","description":"A test event for SPM-09 history access.","expectedAttendance":"40","startsAt":"2099-04-01T10:00:00+08:00","endsAt":"2099-04-01T12:00:00+08:00","venue":{"preferredLocation":"Auditorium","facilities":[]},"equipment":[],"registration":{"required":false,"waitlistEnabled":false}}')
  ),
  'the coordinator changes the venue and adds equipment'
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
select is(
  (select count(*)::integer from public.event_field_changes where event_id = (select id from spm09_event_ids)),
  0,
  'SPM-09 AC02: a coordinator not assigned to the event sees no field changes'
);
select is(
  (select count(*)::integer from public.event_equipment_changes where event_id = (select id from spm09_event_ids)),
  0,
  'SPM-09 AC02: a coordinator not assigned to the event sees no equipment changes'
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

-- 202610160004: the Event Coordinator Lead sees every kind of history, for
-- any event, without being its coordinator.
select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-0000-0000-0000-0000000000ad","role":"authenticated"}',
  true
);
select ok(
  (select count(*)::integer from public.event_status_history where event_id = (select id from spm09_event_ids)) > 0,
  'the Lead sees the event''s lifecycle history'
);
select ok(
  (select count(*)::integer from public.event_field_changes where event_id = (select id from spm09_event_ids)) > 0,
  'the Lead sees the event''s field changes'
);
select ok(
  (select count(*)::integer from public.event_equipment_changes where event_id = (select id from spm09_event_ids)) > 0,
  'the Lead sees the event''s equipment changes'
);

select * from finish();
rollback;
